/**
 * Platform.ts —— 三层圆形汉白玉台基（祈谷坛）
 * ------------------------------------------------------------------
 * 每层包含：
 *   · 旋转体台身（含收分与枭混线脚，闭合旋转面，法线朝外）；
 *   · 望柱（InstancedMesh，柱头为程序化组合体）与栏板（InstancedMesh，
 *     颜色贴图 + 法线贴图呈现云纹减地浮雕）；
 *   · 踏跺（逐级叠涩踏步）+ 两侧垂带 + 中央御路石雕，四正方向各一组；
 *   · 栏杆在台阶位置自动留缺口，避免穿模。
 *
 * 角度约定：环向角 a 对应平面坐标 (cos a, sin a)，即 +X 为 0、+Z 为 π/2。
 */
import { BoxGeometry, CylinderGeometry, Group, Matrix4, SphereGeometry, Vector2, Vector3, type BufferGeometry } from 'three';
import { PLATFORM } from '../config';
import { boxAt, latheFrom, makeInstanced, mergeAll, mesh, ringMatrix, transformed, uvTransform } from '../procgen/geometry';

/** 台基石材：按构件尺寸缩放 UV，避免长条构件贴图被拉成条纹 */
function uvScaled(geo: BufferGeometry, su: number, sv: number): BufferGeometry {
  return uvTransform(geo, su, sv, 0, 0);
}
import type { MaterialLibrary } from './Materials';

export interface PlatformParts {
  group: Group;
  /** 每层一个 Group（供爆炸动画按层位移） */
  tiers: Group[];
}

/** 台阶方向的环向角：南(+Z)、东(+X)、北(-Z)、西(-X) */
export const STAIR_ANGLES = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];

/** 台阶缺口（弧度） */
function stairGaps(railR: number): { center: number; half: number }[] {
  const half = Math.atan2(PLATFORM.stair.width * 0.5 + 1.5, railR);
  return STAIR_ANGLES.map((d) => ({ center: d, half }));
}

function inGaps(angle: number, gaps: { center: number; half: number }[]): boolean {
  for (const g of gaps) {
    let d = angle - g.center;
    while (d <= -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    if (Math.abs(d) < g.half) return true;
  }
  return false;
}

/** 望柱：方柱身 + 束腰 + 八角柱头 + 宝珠 */
function buildPostGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  parts.push(boxAt(0.26, 0.72, 0.26, [0, 0.36, 0]));
  parts.push(boxAt(0.33, 0.07, 0.33, [0, 0.75, 0]));
  const head = new CylinderGeometry(0.135, 0.155, 0.2, 8);
  head.translate(0, 0.885, 0);
  parts.push(head);
  const bead = new SphereGeometry(0.105, 12, 8);
  bead.scale(1, 0.85, 1);
  bead.translate(0, 1.05, 0);
  parts.push(bead);
  return mergeAll(parts);
}

/** 台身剖面（逆时针 → 法线朝外）：外缘自下而上，再沿台面收至圆心 */
function tierProfile(radius: number, bottomY: number, topY: number): Vector2[] {
  const h = topY - bottomY;
  const rBottom = radius + PLATFORM.batter;
  return [
    new Vector2(rBottom, bottomY),
    new Vector2(rBottom, bottomY + h * 0.22),
    new Vector2(rBottom - PLATFORM.batter * 0.22, bottomY + h * 0.32),
    new Vector2(radius + 0.16, topY - h * 0.44),
    new Vector2(radius + 0.14, topY - 0.3),
    new Vector2(radius + 0.21, topY - 0.2),
    new Vector2(radius + 0.06, topY - 0.09),
    new Vector2(radius, topY),
    new Vector2(0, topY),
  ];
}

interface StairGeos {
  steps: BufferGeometry[];
  ramps: BufferGeometry[];
  posts: BufferGeometry[];
}

/** 单组台阶（在 +Z 方向生成，随后按方向旋转） */
function buildStair(tierRadius: number, bottomY: number, topY: number): StairGeos {
  const steps: BufferGeometry[] = [];
  const ramps: BufferGeometry[] = [];
  const posts: BufferGeometry[] = [];

  const { width, run, steps: n, imperialWidth } = PLATFORM.stair;
  const rise = (topY - bottomY) / n;
  const stepDepth = run / n;
  const zFront = tierRadius + PLATFORM.batter + run;
  const zBack = tierRadius - 0.6;

  for (let k = 0; k < n; k++) {
    // 第 k 级踏步的前缘（越靠下越向外），踏步自前缘一直砌到台身内缘
    const z0 = zFront - (k + 1) * stepDepth;
    const depth = z0 - zBack;
    if (depth <= 0.05) continue;
    const y = bottomY + k * rise;
    steps.push(uvScaled(boxAt(width, rise + 0.015, depth, [0, y + rise * 0.5, (z0 + zBack) * 0.5]), 5, 1));
    // 踏步鼻线
    steps.push(uvScaled(boxAt(width + 0.07, rise * 0.3, 0.13, [0, y + rise * 0.86, z0 - 0.05]), 5, 1));
  }

  // 垂带（两侧斜板）与端头抱鼓石
  const slope = Math.atan2(topY - bottomY, run);
  const slabLen = Math.hypot(run, topY - bottomY);
  for (const sgn of [-1, 1]) {
    const cx = sgn * (width * 0.5 + 0.36);
    const cz = zFront - run * 0.5;
    const cy = (bottomY + topY) * 0.5 + 0.18;
    steps.push(uvScaled(boxAt(0.66, 0.42, slabLen + 0.6, [cx, cy, cz], [slope, 0, 0]), 1, 6));
    posts.push(transformed(buildPostGeometry(), [cx, bottomY + 0.02, zFront + 0.2], [0, 0, 0], [1.0, 0.85, 1.0]));
  }

  // 中央御路石
  const rampLen = Math.hypot(run, topY - bottomY) + 0.5;
  ramps.push(boxAt(imperialWidth, 0.22, rampLen, [0, (bottomY + topY) * 0.5 + 0.08, zFront - run * 0.5], [slope, 0, 0]));

  return { steps, ramps, posts };
}

export function buildPlatform(mats: MaterialLibrary): PlatformParts {
  const root = new Group();
  root.name = 'platform';
  const tiers: Group[] = [];

  PLATFORM.tiers.forEach((t, idx) => {
    const bottomY = t.topY - t.height;
    const g = new Group();
    g.name = `platform-tier-${idx}`;

    /* 1. 台身 ------------------------------------------------------- */
    const body = latheFrom(tierProfile(t.radius, bottomY, t.topY), 144);
    // 大理石贴图按真实周长/高度重复，避免环向拉成条纹
    const uv = body.attributes.uv as import('three').BufferAttribute;
    const repU = Math.max(6, Math.round((Math.PI * 2 * t.radius) / 3.2));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repU, uv.getY(i) * 4);
    uv.needsUpdate = true;
    g.add(mesh(body, mats.marble, `tier-${idx}-body`));

    /* 2. 栏杆 ------------------------------------------------------- */
    const railR = t.radius - PLATFORM.railInset;
    const gaps = stairGaps(railR);
    const count = Math.max(24, Math.round((Math.PI * 2 * railR) / PLATFORM.postSpacing));
    const spacing = (Math.PI * 2 * railR) / count;
    const postMats: Matrix4[] = [];
    const panelMats: Matrix4[] = [];
    const postGeo = buildPostGeometry();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      if (!inGaps(a, gaps)) postMats.push(ringMatrix(a, railR, t.topY));
      const am = a + Math.PI / count;
      if (!inGaps(am, gaps)) panelMats.push(ringMatrix(am, railR, t.topY, new Vector3(spacing - 0.34, 1, 1)));
    }
    g.add(makeInstanced(postGeo, mats.balustrade, postMats, { name: `tier-${idx}-posts` }));

    const panelGeo = new BoxGeometry(1.0, 0.6, 0.17);
    panelGeo.translate(0, 0.3, 0);
    g.add(makeInstanced(panelGeo, mats.balustrade, panelMats, { name: `tier-${idx}-panels` }));

    /* 3. 四组台阶 --------------------------------------------------- */
    const stepGeos: BufferGeometry[] = [];
    const rampGeos: BufferGeometry[] = [];
    const stairPosts: BufferGeometry[] = [];
    for (const ang of STAIR_ANGLES) {
      const s = buildStair(t.radius, bottomY, t.topY);
      // 台阶生成于 +Z 方向：旋转到环向角 ang
      const rot = new Matrix4().makeRotationY(Math.PI / 2 - ang);
      for (const geo of s.steps) stepGeos.push(geo.applyMatrix4(rot));
      for (const geo of s.ramps) rampGeos.push(geo.applyMatrix4(rot));
      for (const geo of s.posts) stairPosts.push(geo.applyMatrix4(rot));
    }
    if (stepGeos.length) g.add(mesh(mergeAll(stepGeos), mats.marble, `tier-${idx}-stairs`));
    if (rampGeos.length) g.add(mesh(mergeAll(rampGeos), mats.ramp, `tier-${idx}-ramps`));
    if (stairPosts.length) g.add(mesh(mergeAll(stairPosts), mats.balustrade, `tier-${idx}-stair-posts`));

    root.add(g);
    tiers.push(g);
  });

  return { group: root, tiers };
}
