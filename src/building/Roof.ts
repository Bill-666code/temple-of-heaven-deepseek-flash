/**
 * Roof.ts —— 三重檐蓝琉璃屋面
 * ------------------------------------------------------------------
 * 每一重檐由以下程序化构件组成（共同构成一个可整体位移的 Group）：
 *   1. 上表面旋转体：由"反宇"曲线剖面生成，UV 按真实瓦垄密度烘焙，
 *      再叠加与贴图垄距严格对齐的几何棱纹（筒瓦鼓起）；
 *   2. 下表面（椽望板）：沿法向内缩的旋转面，檐下可见；
 *   3. 檐口封边（瓦口）+ 瓦当（InstancedMesh，整圈数百枚）；
 *   4. 椽子（InstancedMesh）：沿屋面坡度斜置的方椽；
 *   5. 垂脊：沿剖面扫掠的管状脊，端头带脊兽套件（合并为单一几何体）。
 */
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Matrix4,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
} from 'three';
import { EAVES, TILE, type EaveSpec } from '../config';
import { addTileRipple, basisMatrix, latheFrom, makeInstanced, mergeAll, mesh, ringMatrix } from '../procgen/geometry';
import { buildRoofProfile, type RoofProfile } from '../procgen/profile';
import type { MaterialLibrary } from './Materials';

/** 一条瓦垄在贴图中的像素高度对应的实际瓦垄高度（米），用于计算 v 向重复 */
const COURSE_HEIGHT = 0.34;

export interface RoofParts {
  group: Group;
  spec: EaveSpec;
  profile: RoofProfile;
  /** 整圈瓦垄数 */
  columns: number;
}

/**
 * 计算屋面几何所需的参数：整圈瓦垄数（4 的整数倍以保证贴图无缝）、
 * 环形分段数（每垄 2 段：一脊一沟）。
 */
function roofMetrics(spec: EaveSpec): { columns: number; segments: number } {
  const circumference = Math.PI * 2 * spec.eaveR;
  let columns = Math.round(circumference / TILE.pitch);
  columns = Math.max(TILE.columnsPerTexture * 4, Math.round(columns / TILE.columnsPerTexture) * TILE.columnsPerTexture);
  return { columns, segments: columns * TILE.segPerPitch };
}

/** 烘焙 UV 重复次数：把"整圈垄数 / 贴图垄数"写进 uv，避免为每重檐克隆贴图 */
function bakeUv(geo: BufferGeometry, columns: number, arcLength: number): void {
  const uv = geo.attributes.uv as BufferAttribute;
  const repeatU = columns / TILE.columnsPerTexture;
  const repeatV = Math.max(1, Math.round(arcLength / (COURSE_HEIGHT * TILE.coursesPerTexture)));
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * repeatU, uv.getY(i) * repeatV);
  }
  uv.needsUpdate = true;
}

/** 在剖面上取某参数处的位置与（二维）法向 */
function pointNormal(profile: RoofProfile, t: number): { p: Vector2; n: Vector2 } {
  const s = profile.sample(t);
  const len = Math.hypot(s.dr, s.dy) || 1;
  return { p: new Vector2(s.r, s.y), n: new Vector2(s.dy / len, -s.dr / len) };
}

/** 垂脊：沿剖面扫掠的管 + 檐口端头的脊兽套件 */
function buildRidges(profile: RoofProfile, spec: EaveSpec): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const ridgeCount = spec.ridgeCount;
  // 垂脊与柱列对位（12 根柱 → 12 条脊）
  for (let r = 0; r < ridgeCount; r++) {
    const angle = (r / ridgeCount) * Math.PI * 2;
    const pts: Vector3[] = [];
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const t = Math.pow(i / steps, 1.25) * 0.94;
      const { p, n } = pointNormal(profile, t);
      const off = 0.12;
      const rr = p.x + n.x * off;
      const yy = p.y + n.y * off;
      pts.push(new Vector3(rr * Math.cos(angle), yy, rr * Math.sin(angle)));
    }
    const curve = new CatmullRomCurve3(pts);
    const tube = new TubeGeometry(curve, 26, 0.15, 6, false);
    parts.push(tube);

    // 檐口端头：脊兽垛（套兽）
    const tip = pts[0];
    const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const beast = new BoxGeometry(0.34, 0.34, 0.5);
    beast.translate(0, 0, 0.1);
    const m = basisMatrix(
      tip.clone().addScaledVector(dir, 0.16),
      new Vector3(-Math.sin(angle), 0, Math.cos(angle)),
      new Vector3(0, 1, 0),
      dir,
    );
    beast.applyMatrix4(m);
    parts.push(beast);
  }
  return mergeAll(parts);
}

/** 生成一重檐 */
export function buildRoof(spec: EaveSpec, mats: MaterialLibrary): RoofParts {
  const group = new Group();
  group.name = `roof-${spec.key}`;

  const profile = buildRoofProfile({
    eaveR: spec.eaveR,
    eaveY: spec.eaveY,
    crownR: spec.crownR,
    crownY: spec.crownY,
    curve: spec.curve,
    lipUp: spec.lipUp,
    lipOut: spec.lipOut,
    thickness: TILE.thickness,
    segments: 30,
  });
  const { columns, segments } = roofMetrics(spec);

  /* 1. 上表面 ------------------------------------------------------ */
  const outerGeo = latheFrom(profile.outer, segments);
  bakeUv(outerGeo, columns, profile.arcLength);
  addTileRipple(outerGeo, TILE.columnsPerTexture, TILE.ripple, spec.eaveR);
  const outer = mesh(outerGeo, mats.roofTile, `${spec.key}-tiles`);
  group.add(outer);

  /* 2. 下表面（椽望板，仅保留近檐口可见段） -------------------------- */
  const underPts: Vector2[] = [];
  for (let i = 0; i < profile.inner.length; i++) {
    const t = Math.pow(i / (profile.inner.length - 1), 1.35);
    if (t > 0.5) break;
    underPts.push(profile.inner[i].clone());
  }
  underPts.reverse();
  if (underPts.length > 1) {
    const underGeo = latheFrom(underPts, segments);
    // 下表面 UV：直接按弧长铺（木望板）
    const uv = underGeo.attributes.uv as BufferAttribute;
    const repU = Math.max(4, Math.round((Math.PI * 2 * spec.eaveR) / 3));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repU, uv.getY(i) * 3);
    uv.needsUpdate = true;
    group.add(mesh(underGeo, mats.roofUnder, `${spec.key}-soffit`));
  }

  /* 3. 檐口封边（瓦口） -------------------------------------------- */
  const fascia = new CylinderGeometry(spec.eaveR + spec.lipOut, spec.eaveR + spec.lipOut, TILE.thickness * 0.92, segments, 1, true);
  fascia.translate(0, spec.eaveY + spec.lipUp - TILE.thickness * 0.5, 0);
  const fasciaMesh = mesh(fascia, mats.ridge, `${spec.key}-fascia`);
  fasciaMesh.castShadow = true;
  group.add(fasciaMesh);

  /* 4. 瓦当（檐口筒瓦端头的圆盘）----------------------------------- */
  const discGeo = new CylinderGeometry(0.115, 0.105, 0.14, 8);
  discGeo.rotateX(Math.PI / 2);
  const discMatrices: Matrix4[] = [];
  const discR = spec.eaveR + spec.lipOut - 0.02;
  const discY = spec.eaveY + spec.lipUp - 0.06;
  for (let i = 0; i < columns; i++) {
    const a = ((i + 0.5) / columns) * Math.PI * 2;
    discMatrices.push(ringMatrix(a, discR, discY));
  }
  group.add(makeInstanced(discGeo, mats.ridge, discMatrices, { name: `${spec.key}-eave-tiles` }));

  /* 5. 椽子 -------------------------------------------------------- */
  const rafterCount = Math.max(48, Math.round((Math.PI * 2 * spec.eaveR) / 0.78));
  const rafterMatrices: Matrix4[] = [];
  const a0 = pointNormal(profile, 0.02);
  const a1 = pointNormal(profile, 0.34);
  for (let i = 0; i < rafterCount; i++) {
    const angle = (i / rafterCount) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const inset = TILE.thickness * 0.52;
    const p1 = new Vector3((a0.p.x + a0.n.x * inset) * cos, a0.p.y + a0.n.y * inset, (a0.p.x + a0.n.x * inset) * sin);
    const p2 = new Vector3((a1.p.x + a1.n.x * inset) * cos, a1.p.y + a1.n.y * inset, (a1.p.x + a1.n.x * inset) * sin);
    const xAxis = new Vector3(-sin, 0, cos);
    const dir = new Vector3().subVectors(p1, p2);
    const len = dir.length();
    dir.normalize();
    const yAxis = new Vector3().crossVectors(dir, xAxis).normalize();
    const m = basisMatrix(new Vector3().addVectors(p1, p2).multiplyScalar(0.5), xAxis, yAxis, dir);
    m.scale(new Vector3(1, 1, len));
    rafterMatrices.push(m);
  }
  const rafterGeo = new BoxGeometry(0.13, 0.15, 1);
  group.add(makeInstanced(rafterGeo, mats.rafter, rafterMatrices, { name: `${spec.key}-rafters` }));

  /* 6. 垂脊 -------------------------------------------------------- */
  const ridgeGeo = buildRidges(profile, spec);
  group.add(mesh(ridgeGeo, mats.ridge, `${spec.key}-ridges`));

  return { group, spec, profile, columns };
}

/** 一次性生成三重檐 */
export function buildAllRoofs(mats: MaterialLibrary): RoofParts[] {
  return EAVES.map((spec) => buildRoof(spec, mats));
}

/** 供外部（如屋顶内构）复用的剖面工具 */
export { pointNormal };
