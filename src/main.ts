/**
 * main.ts —— 启动流程
 * ------------------------------------------------------------------
 * 1. 场景 / 相机 / 渲染管线
 * 2. 程序化贴图与材质（Canvas2D 绘制 + 法线烘焙）
 * 3. 环境：天空、地面、绿化、光照、由天空烘焙的 IBL 环境贴图
 * 4. 建筑：台基 → 柱网 → 门窗墙体 → 斗拱额枋 → 三重檐 → 宝顶
 * 5. 交互：轨道控制 / 自动环绕 / 爆炸重组 / HUD
 *
 * 每一步之间让出一帧，使载入进度条得以绘制。
 */
import './styles.css';
import { Scene } from 'three';
import { ExplodeController } from './animation/ExplodeController';
import { buildHall } from './building/Hall';
import { MaterialLibrary } from './building/Materials';
import { CameraRig } from './core/CameraRig';
import { RenderPipeline } from './core/Renderer';
import { buildEnvironment, type Environment } from './core/SceneEnv';
import { Hud } from './ui/Hud';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function fail(message: string): void {
  const step = document.getElementById('loader-step');
  if (step) {
    step.textContent = message;
    step.style.color = '#ffb4a2';
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#scene canvas 缺失');

  const hud = new Hud({
    onToggleExplode: () => toggleExplode(),
    onToggleOrbit: () => toggleOrbit(),
    onToggleAO: () => toggleAO(),
    onToggleShadows: () => toggleShadows(),
    onResetView: () => resetView(),
  });

  hud.setProgress(0.06, '初始化 WebGL 上下文…');
  await nextFrame();

  const scene = new Scene();
  const rig = new CameraRig(canvas, window.innerWidth / Math.max(1, window.innerHeight));

  /* --- 1. 程序化材质 --- */
  hud.setProgress(0.15, '绘制程序化贴图（琉璃瓦 / 彩画 / 汉白玉 / 格心门窗）…');
  await nextFrame();
  const mats = new MaterialLibrary();

  /* --- 2. 渲染管线 --- */
  hud.setProgress(0.42, '构建渲染管线（GTAO 环境光遮蔽 / ACES 色调映射 / SMAA）…');
  await nextFrame();
  let pipeline: RenderPipeline;
  try {
    pipeline = new RenderPipeline({ canvas, scene, camera: rig.camera, aoScale: 0.6 });
  } catch (err) {
    fail('当前浏览器不支持 WebGL2，无法运行本场景');
    console.error(err);
    return;
  }

  /* --- 3. 环境 --- */
  hud.setProgress(0.55, '生成天空、广场、绿化与光照…');
  await nextFrame();
  let env: Environment;
  try {
    env = buildEnvironment(scene, mats, pipeline.renderer, rig.camera);
  } catch (err) {
    console.error(err);
    fail('环境贴图烘焙失败');
    return;
  }
  // AO 的 G-Buffer 不参与天空球
  pipeline.setAOExclusions([env.sky]);

  /* --- 4. 建筑 --- */
  hud.setProgress(0.72, '营建祈年殿：台基 → 柱网 → 门窗 → 斗拱 → 三重檐 → 宝顶…');
  await nextFrame();
  const hall = buildHall(mats);
  scene.add(hall.root);

  /* --- 5. 爆炸动画注册 --- */
  const explode = new ExplodeController({ duration: 1.7, stagger: 0.95 });
  for (const spec of hall.explode) explode.add(spec);

  hud.setProgress(0.95, '编译着色器并预热渲染…');
  await nextFrame();

  /* --- 交互 --- */
  let autoOrbit = false;

  function toggleExplode(): void {
    const opened = explode.toggle();
    hud.setExploded(opened);
    hud.notify(opened ? '爆炸视图：构件按层次散开' : '重组：回到精确原位');
  }

  function toggleOrbit(): void {
    autoOrbit = !autoOrbit;
    rig.setAutoRotate(autoOrbit);
    hud.setOrbit(autoOrbit);
    hud.notify(autoOrbit ? '自动环绕：开' : '自动环绕：关');
  }

  function toggleAO(): void {
    const on = !pipeline.isAOEnabled;
    pipeline.setAO(on);
    hud.setAO(on);
    hud.notify(on ? '环境光遮蔽：开' : '环境光遮蔽：关');
  }

  function toggleShadows(): void {
    const on = !pipeline.isShadowsEnabled;
    pipeline.setShadows(on);
    hud.setShadows(on);
    hud.notify(on ? '阴影：开' : '阴影：关');
  }

  function resetView(): void {
    rig.resetView();
    if (explode.isExploded) {
      explode.setExploded(false);
      hud.setExploded(false);
    }
    hud.notify('已复位视角与构件位置');
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        toggleExplode();
        break;
      case 'KeyO':
        toggleOrbit();
        break;
      case 'KeyA':
        toggleAO();
        break;
      case 'KeyS':
        toggleShadows();
        break;
      case 'KeyR':
        resetView();
        break;
      default:
        break;
    }
  });

  const onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    rig.resize(w, h);
    pipeline.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => window.setTimeout(onResize, 220));
  onResize();

  /* --- 主循环 --- */
  let last = performance.now();
  let elapsed = 0;
  let frames = 0;
  let fpsAccum = 0;
  let fps = 60;

  function frame(now: number): void {
    const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
    last = now;
    elapsed += dt;

    const moving = explode.update(dt);
    if (moving) pipeline.requestShadowUpdate();

    // 散开时整体拉远并抬高注视点，保证构件不出画
    rig.applyExplode(explode.amount);

    env.update(elapsed);
    rig.update(dt);
    pipeline.render();

    frames++;
    fpsAccum += dt;
    if (fpsAccum >= 0.5) {
      fps = frames / fpsAccum;
      frames = 0;
      fpsAccum = 0;
      const info = pipeline.info;
      hud.setStats(fps, info.render.calls, info.render.triangles);
    }

    requestAnimationFrame(frame);
  }

  // 调试钩子：便于自动化验证与二次开发（浏览器控制台可直接访问 __QND__）
  (window as unknown as Record<string, unknown>).__QND__ = { scene, rig, pipeline, explode, hall, env, mats };

  // 首帧前先渲染一次，避免着色器编译卡顿出现在动画里
  pipeline.requestShadowUpdate();
  pipeline.render();
  hud.setProgress(1, '就绪');
  hud.hideLoader();
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  fail(`初始化失败：${String(err)}`);
});
