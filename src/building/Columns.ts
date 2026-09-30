/**
 * Columns.ts —— 三层柱网（檐柱 12 / 金柱 12 / 龙井柱 4）
 * ------------------------------------------------------------------
 * 柱身为带"收分 + 卷杀"的旋转体（上细下粗、中部微鼓），
 * 每层柱网一个 InstancedMesh，便于爆炸动画按柱网分层散开。
 */
import { CylinderGeometry, Group, Matrix4, Vector2, type BufferGeometry } from 'three';
import { COLUMNS } from '../config';
import { latheFrom, makeInstanced, mesh, ringMatrix } from '../procgen/geometry';
import type { MaterialLibrary } from './Materials';

export interface ColumnRing {
  name: string;
  mesh: import('three').InstancedMesh;
  ringR: number;
  count: number;
}

export interface ColumnParts {
  group: Group;
  rings: ColumnRing[];
}

/** 带卷杀的柱身 */
function columnGeometry(radius: number, height: number): BufferGeometry {
  const pts: Vector2[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const taper = 1 - 0.14 * Math.pow(t, 1.25);
    const barrel = 1 + 0.022 * Math.sin(Math.PI * Math.min(1, t * 1.05));
    pts.push(new Vector2(radius * taper * barrel, t * height));
  }
  return latheFrom(pts, 18);
}

export function buildColumns(mats: MaterialLibrary): ColumnParts {
  const group = new Group();
  group.name = 'columns';
  const rings: ColumnRing[] = [];

  const specs = [
    { key: 'eave', spec: COLUMNS.eave, label: '檐柱' },
    { key: 'inner', spec: COLUMNS.inner, label: '金柱' },
    { key: 'well', spec: COLUMNS.well, label: '龙井柱' },
  ] as const;

  for (const { key, spec } of specs) {
    const matrices: Matrix4[] = [];
    const baseMatrices: Matrix4[] = [];
    for (let i = 0; i < spec.count; i++) {
      const a = spec.phase + (i / spec.count) * Math.PI * 2;
      matrices.push(ringMatrix(a, spec.ringR, 0));
      baseMatrices.push(ringMatrix(a, spec.ringR, 0));
    }

    const geo = columnGeometry(spec.radius, spec.height);
    // 柱身贴图按柱高重复，避免竖向拉伸
    const uv = geo.attributes.uv as import('three').BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 2.4);
    uv.needsUpdate = true;

    const inst = makeInstanced(geo, mats.column, matrices, { name: `columns-${key}` });
    group.add(inst);

    // 柱础（覆盆）
    const baseGeo = new CylinderGeometry(spec.radius * 1.35, spec.radius * 1.7, 0.34, 14);
    baseGeo.translate(0, 0.17, 0);
    const baseInst = makeInstanced(baseGeo, mats.marble, baseMatrices, { name: `column-bases-${key}` });
    group.add(baseInst);

    rings.push({ name: key, mesh: inst, ringR: spec.ringR, count: spec.count });
  }

  // 室内金砖地面（透过格栅可见，增强纵深）
  const floorGeo = new CylinderGeometry(COLUMNS.inner.ringR - 0.35, COLUMNS.inner.ringR - 0.35, 0.16, 64);
  floorGeo.translate(0, 0.42, 0);
  const floor = mesh(floorGeo, mats.interiorFloor, 'interior-floor');
  floor.castShadow = false;
  group.add(floor);

  return { group, rings };
}
