/**
 * Renderer.ts —— 渲染管线
 * ------------------------------------------------------------------
 * WebGLRenderer(ACES Filmic 色调映射) →
 *   RenderPass → GTAOPass(环境光遮蔽，可选，半分辨率) → OutputPass(色调映射 + sRGB) → SMAAPass(抗锯齿)
 *
 * 另外做了两项针对性优化：
 *  · 阴影贴图默认按需刷新：只有爆炸动画进行中或首帧才重算 shadow map；
 *  · 计算 AO 的 G-Buffer 时临时隐藏天空球，避免天穹参与遮蔽计算。
 */
import { Camera, Object3D, Scene, Vector2, WebGLRenderer, ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export interface PipelineOptions {
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: Camera;
  /** 环境光遮蔽分辨率系数（0.5 = 半分辨率） */
  aoScale?: number;
  /** 参与 AO 时需要隐藏的对象（天空球） */
  excludeFromAO?: Object3D[];
}

export class RenderPipeline {
  readonly renderer: WebGLRenderer;
  readonly composer: EffectComposer;
  readonly gtao: GTAOPass;
  private readonly scene: Scene;
  private readonly exclude: Object3D[];
  private aoScale: number;
  private aoEnabled = true;
  private size = new Vector2(1, 1);
  private tmpSize = new Vector2();
  private shadowRequested = true;

  constructor(opts: PipelineOptions) {
    const { canvas, scene, camera } = opts;
    this.scene = scene;
    this.exclude = opts.excludeFromAO ?? [];
    this.aoScale = opts.aoScale ?? 0.6;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // 阴影按需刷新
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    // 多趟渲染共用一个统计周期：由 render() 手动重置
    this.renderer.info.autoReset = false;

    const size = this.renderer.getDrawingBufferSize(new Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.7;
    this.gtao.updateGtaoMaterial({
      radius: 1.25,
      distanceExponent: 1.4,
      thickness: 1.6,
      distanceFallOff: 1.0,
      scale: 1.0,
      samples: 16,
      screenSpaceRadius: false,
    });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
    this.patchGtaoExclusions();
    this.composer.addPass(this.gtao);

    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());

    this.setSize(window.innerWidth, window.innerHeight);
  }

  /** 指定不参与 AO 计算的对象（天空球等），可在环境构建完成后调用 */
  setAOExclusions(objects: Object3D[]): void {
    this.exclude.length = 0;
    this.exclude.push(...objects);
  }

  /** 让 AO 的 G-Buffer 渲染忽略天空球等对象 */
  private patchGtaoExclusions(): void {
    const original = this.gtao.render.bind(this.gtao);
    const exclude = this.exclude;
    const states = exclude.map((o) => o.visible);
    this.gtao.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
      exclude.forEach((o, i) => {
        states[i] = o.visible;
        o.visible = false;
      });
      original(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      exclude.forEach((o, i) => {
        o.visible = states[i];
      });
    };
  }

  setSize(width: number, height: number): void {
    this.size.set(width, height);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    const db = this.renderer.getDrawingBufferSize(this.tmpSize);
    this.gtao.setSize(Math.max(2, Math.floor(db.x * this.aoScale)), Math.max(2, Math.floor(db.y * this.aoScale)));
    this.requestShadowUpdate();
  }

  setAO(enabled: boolean): void {
    this.aoEnabled = enabled;
    this.gtao.enabled = enabled;
  }

  get isAOEnabled(): boolean {
    return this.aoEnabled;
  }

  setShadows(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
    this.scene.traverse((o) => {
      const m = o as unknown as { material?: { needsUpdate?: boolean } };
      if (m.material && typeof m.material.needsUpdate === 'boolean') m.material.needsUpdate = true;
    });
    if (enabled) this.requestShadowUpdate();
  }

  get isShadowsEnabled(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  requestShadowUpdate(): void {
    this.shadowRequested = true;
  }

  render(): void {
    this.renderer.info.reset();
    if (this.shadowRequested && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowRequested = false;
    }
    this.composer.render();
  }

  /** 渲染信息（HUD 统计） */
  get info() {
    return this.renderer.info;
  }
}
