/**
 * Dougong.ts —— 额枋彩画、平板枋与斗拱
 * ------------------------------------------------------------------
 * 斗拱几何体按"出一跳、单昂、上承耍头"的清式做法参数化生成：
 *   坐斗 → 翘（沿径向出跳）→ 横拱 → 三才升 → 昂（斜杀）→ 横拱 → 耍头
 * 每层檐按其出挑尺寸生成一套几何体，再以 InstancedMesh 沿柱网均匀排布
 * （柱头科对齐柱位，平身科置于开间中央）。
 */
import { BoxGeometry, CylinderGeometry, Group, Matrix4, type BufferGeometry } from 'three';
import { COLUMNS, EAVES, type EaveSpec } from '../config';
import { boxAt, makeInstanced, mergeAll, mesh, ringMatrix, transformed, uvTransform } from '../procgen/geometry';
import type { MaterialLibrary } from './Materials';

export interface DougongParts {
  /** 每层檐一个 Group（额枋 + 平板枋 + 斗拱） */
  groups: Group[];
}

/**
 * 参数化斗拱：局部坐标 +Z 为出挑方向，y=0 为坐斗底面。
 * @param reach  自坐斗中心向外的出挑长度
 * @param height 总高
 * @param width  横拱的切向长度
 */
function bracketGeometry(reach: number, height: number, width: number): BufferGeometry {
  const s = height / 1.2;
  const parts: BufferGeometry[] = [];
  // 让每个小构件取到彩画贴图的不同区域，避免"千篇一律"的平色
  let uvSeed = 1;
  const tint = (g: BufferGeometry): BufferGeometry => {
    uvSeed = (uvSeed * 1103515245 + 12345) & 0x7fffffff;
    const a = (uvSeed % 97) / 97;
    const b = ((uvSeed >> 3) % 89) / 89;
    return uvTransform(g, 0.42, 0.4, a * 0.5, b * 0.5);
  };

  // 坐斗
  parts.push(tint(boxAt(width * 0.4, 0.3 * s, 0.44, [0, 0.15 * s, 0])));
  // 翘（第一跳，径向）
  parts.push(tint(boxAt(0.18, 0.22 * s, reach * 0.6, [0, 0.42 * s, reach * 0.28])));
  // 横拱（第一层）
  parts.push(tint(boxAt(width * 0.74, 0.2 * s, 0.2, [0, 0.64 * s, reach * 0.06])));
  // 三才升
  for (const sgn of [-1, 1]) {
    parts.push(tint(boxAt(0.19, 0.15 * s, 0.19, [sgn * width * 0.3, 0.79 * s, reach * 0.06])));
  }
  // 昂（斜杀向外下）
  parts.push(
    tint(transformed(new BoxGeometry(0.18, 0.17, reach * 0.8), [0, 0.6 * s, reach * 0.46], [-0.4, 0, 0])),
  );
  // 横拱（第二层，更长）
  parts.push(tint(boxAt(width, 0.18 * s, 0.18, [0, 0.95 * s, reach * 0.28])));
  for (const sgn of [-1, 1]) {
    parts.push(tint(boxAt(0.2, 0.15 * s, 0.2, [sgn * width * 0.43, 1.09 * s, reach * 0.28])));
  }
  // 耍头
  parts.push(tint(boxAt(0.18, 0.2 * s, reach * 0.92, [0, 1.13 * s, reach * 0.5])));

  return mergeAll(parts);
}

/** 环形彩画枋（额枋 / 平板枋） */
function paintedBand(radius: number, y0: number, y1: number, motifWidth: number): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, y1 - y0, 128, 1, true);
  g.translate(0, (y0 + y1) * 0.5, 0);
  const uv = g.attributes.uv as import('three').BufferAttribute;
  const rep = Math.max(4, Math.round((Math.PI * 2 * radius) / motifWidth));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i));
  uv.needsUpdate = true;
  return g;
}

export function buildDougong(mats: MaterialLibrary): DougongParts {
  const groups: Group[] = [];

  EAVES.forEach((spec: EaveSpec) => {
    const g = new Group();
    g.name = `dougong-${spec.key}`;

    // 额枋（大枋彩画）
    g.add(mesh(paintedBand(spec.bandR, spec.bandY, spec.bandY + spec.bandH, 2.8), mats.caihua, `${spec.key}-architrave`));
    // 平板枋（上承斗拱）
    const flat = paintedBand(spec.flatR, spec.flatY, spec.flatY + spec.flatH, 1.9);
    g.add(mesh(flat, mats.caihua, `${spec.key}-flat-beam`));

    // 斗拱
    const seatR = spec.dougongInR + 0.24;
    const reach = Math.max(0.4, spec.dougongOutR - seatR);
    const width = Math.min(1.5, (Math.PI * 2 * spec.dougongInR) / spec.dougongCount * 0.62);
    const bracket = bracketGeometry(reach, spec.dougongH, width);

    // 柱头科对齐柱位（金柱 12 根），其间的平身科均分
    const count = spec.dougongCount;
    const step = (Math.PI * 2) / count;
    const matrices: Matrix4[] = [];
    for (let i = 0; i < count; i++) {
      matrices.push(ringMatrix(COLUMNS.inner.phase + i * step, seatR, spec.dougongY));
    }
    g.add(makeInstanced(bracket, mats.dougong, matrices, { name: `${spec.key}-brackets` }));

    groups.push(g);
  });

  return { groups };
}
