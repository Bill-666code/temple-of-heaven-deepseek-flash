/**
 * profile.ts —— 中国式屋面曲线
 * ------------------------------------------------------------------
 * 祈年殿的屋面不是圆锥，而是"反宇"曲面：
 *   · 近脊部陡峭、近檐口平缓（曲线幂次 curve > 1 实现）；
 *   · 檐口末端微微上翘（起翘 lipUp）并向外甩出（出翘 lipOut），即"翼角翚飞"。
 * 本模块生成 (半径, 高度) 二维剖面，供 LatheGeometry 旋转成屋面，
 * 同时输出下表面（椽望板）剖面、弧长（用于贴图密度）与任意参数处的切/法向。
 */
import { Vector2 } from 'three';

export interface RoofProfile {
  /** 上表面剖面点（自檐口 → 脊顶） */
  outer: Vector2[];
  /** 下表面剖面点（沿法向内缩 thickness） */
  inner: Vector2[];
  /** 上表面弧长（米） */
  arcLength: number;
  /** 采样参数 t∈[0,1] 处的三维方向信息 */
  sample(t: number): { r: number; y: number; dr: number; dy: number };
}

export interface RoofProfileOptions {
  eaveR: number;
  eaveY: number;
  crownR: number;
  crownY: number;
  /** 曲线幂次：1 = 直线锥面；1.8~2.0 = 典型清式曲面 */
  curve: number;
  lipUp: number;
  lipOut: number;
  thickness: number;
  /** 采样点数 */
  segments?: number;
}

/** 翼角起翘的作用区间（占剖面参数的比例） */
const LIP_SPAN = 0.16;

export function buildRoofProfile(opts: RoofProfileOptions): RoofProfile {
  const { eaveR, eaveY, crownR, crownY, curve, lipUp, lipOut, thickness } = opts;
  const segments = opts.segments ?? 30;

  const sample = (tRaw: number) => {
    const t = Math.min(1, Math.max(0, tRaw));
    // 线性分布半径，幂次分布高度 → 近檐口平缓、近脊部陡峭
    let r = eaveR + (crownR - eaveR) * t;
    let y = eaveY + (crownY - eaveY) * Math.pow(t, curve);

    // 翼角：起翘 + 出翘，二次衰减保证与主曲面 C1 连续
    if (t < LIP_SPAN) {
      const k = 1 - t / LIP_SPAN;
      const w = k * k;
      y += lipUp * w;
      r += lipOut * w;
    }

    // 数值切线（用于法向）
    const h = 1e-3;
    const t2 = Math.min(1, t + h);
    const t1 = Math.max(0, t - h);
    const a = raw(t1);
    const b = raw(t2);
    const dr = (b.r - a.r) / (t2 - t1);
    const dy = (b.y - a.y) / (t2 - t1);
    return { r, y, dr, dy };
  };

  /** 不含切线的原始求值，避免递归 */
  const raw = (t: number) => {
    let r = eaveR + (crownR - eaveR) * t;
    let y = eaveY + (crownY - eaveY) * Math.pow(t, curve);
    if (t < LIP_SPAN) {
      const k = 1 - t / LIP_SPAN;
      const w = k * k;
      y += lipUp * w;
      r += lipOut * w;
    }
    return { r, y };
  };

  const outer: Vector2[] = [];
  const inner: Vector2[] = [];
  let arc = 0;

  // 参数分布：檐口附近加密（曲率大、细节多）
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const t = Math.pow(u, 1.35);
    const s = sample(t);
    const p = new Vector2(s.r, s.y);
    if (outer.length) arc += p.distanceTo(outer[outer.length - 1]);
    outer.push(p);

    // 法向：切线旋转 -90°（指向屋面外侧/上方），下表面沿法向收缩
    const len = Math.hypot(s.dr, s.dy) || 1;
    const nx = s.dy / len;
    const ny = -s.dr / len;
    inner.push(new Vector2(p.x - nx * thickness, p.y - ny * thickness));
  }

  return { outer, inner, arcLength: arc, sample };
}

/** 由剖面点构造一条 3D 曲线点集（用于垂脊、椽子定位） */
export function profileTo3D(
  pts: Vector2[],
  angle: number,
  radiusOffset = 0,
  yOffset = 0,
): { x: number; y: number; z: number }[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: (p.x + radiusOffset) * c, y: p.y + yOffset, z: (p.x + radiusOffset) * s }));
}
