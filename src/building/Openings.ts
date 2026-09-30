/**
 * Openings.ts —— 隔扇门、槛窗与鼓身墙体
 * ------------------------------------------------------------------
 * · 下层 12 开间，每间 4 扇隔扇门（共 48 扇）用单个 InstancedMesh 渲染，
 *   贴图带 alpha 透空 → 格心镂空、投影也是花格影；
 * · 中、上两层鼓身：实心墙带 + 通圈槛窗（整圈圆柱 + 无缝格心贴图，1 个 draw call）
 *   + 上槛走马板。
 */
import {
  CylinderGeometry,
  Group,
  Matrix4,
  PlaneGeometry,
  type BufferGeometry,
} from 'three';
import { COLUMNS, EAVES, OPENING } from '../config';
import { makeInstanced, mergeAll, mesh, ringMatrix } from '../procgen/geometry';
import type { MaterialLibrary } from './Materials';

export interface OpeningParts {
  group: Group;
  /** 下层门窗（含墙带） */
  lower: Group;
  middle: Group;
  upper: Group;
}

/** 烘焙圆柱面 UV 重复次数 */
function bakeCylinderUv(geo: BufferGeometry, repeatU: number, repeatV = 1): void {
  const uv = geo.attributes.uv as import('three').BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeatU, uv.getY(i) * repeatV);
  uv.needsUpdate = true;
}

/** 环形墙带（开口圆柱） */
function band(radius: number, y0: number, y1: number): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, y1 - y0, 96, 1, true);
  g.translate(0, (y0 + y1) * 0.5, 0);
  return g;
}

export function buildOpenings(mats: MaterialLibrary): OpeningParts {
  const group = new Group();
  group.name = 'openings';

  /* ---------------- 下层：隔扇门 ---------------- */
  const lower = new Group();
  lower.name = 'openings-lower';
  const doorR = EAVES[0].wallR;
  const doorBottom = EAVES[0].wallBottom;
  const doorTop = OPENING.doorTop;
  const doorH = doorTop - doorBottom;

  // 开间弦长 → 每扇门宽度（留出柱径）
  const chord = 2 * doorR * Math.sin(Math.PI / OPENING.doorCount);
  const leafW = (chord - COLUMNS.inner.radius * 2.1) / 4;
  const leafGeo = new PlaneGeometry(leafW, doorH);
  const leafMatrices: Matrix4[] = [];
  for (let bay = 0; bay < OPENING.doorCount; bay++) {
    const a = (bay / OPENING.doorCount) * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const m = ringMatrix(a, doorR, doorBottom);
      m.multiply(new Matrix4().makeTranslation((i - 1.5) * leafW, doorH * 0.5, 0));
      leafMatrices.push(m);
    }
  }
  lower.add(makeInstanced(leafGeo, mats.lattice, leafMatrices, { name: 'door-leaves' }));

  // 地栿（门槛）与上槛走马板
  const sill = band(doorR, 0.1, doorBottom);
  const lintel = band(doorR, doorTop, EAVES[0].bandY);
  lower.add(mesh(mergeAll([sill, lintel]), mats.wall, 'door-frames'));
  group.add(lower);

  /* ---------------- 中层：鼓身 + 槛窗 ---------------- */
  const middle = new Group();
  middle.name = 'openings-middle';
  const mw = EAVES[1];
  const mWall = mergeAll([band(mw.wallR, mw.wallBottom, OPENING.windowBottom), band(mw.wallR, OPENING.windowTop, mw.wallTop)]);
  middle.add(mesh(mWall, mats.wall, 'middle-wall'));
  const mWin = band(mw.wallR, OPENING.windowBottom, OPENING.windowTop);
  bakeCylinderUv(mWin, Math.max(8, Math.round((Math.PI * 2 * mw.wallR) / 2.1)));
  middle.add(mesh(mWin, mats.latticeFill, 'middle-windows'));
  group.add(middle);

  /* ---------------- 上层：鼓身 + 小窗 ---------------- */
  const upper = new Group();
  upper.name = 'openings-upper';
  const uw = EAVES[2];
  const uWall = mergeAll([band(uw.wallR, uw.wallBottom, OPENING.upperWindowBottom), band(uw.wallR, OPENING.upperWindowTop, uw.wallTop)]);
  upper.add(mesh(uWall, mats.wall, 'upper-wall'));
  const uWin = band(uw.wallR, OPENING.upperWindowBottom, OPENING.upperWindowTop);
  bakeCylinderUv(uWin, Math.max(6, Math.round((Math.PI * 2 * uw.wallR) / 1.9)));
  upper.add(mesh(uWin, mats.latticeFill, 'upper-windows'));
  group.add(upper);

  return { group, lower, middle, upper };
}
