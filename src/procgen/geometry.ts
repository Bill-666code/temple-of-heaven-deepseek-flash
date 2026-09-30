/**
 * geometry.ts —— 程序化几何工具
 * ------------------------------------------------------------------
 * · 剖面 → 旋转体（LatheGeometry）
 * · 屋面"瓦垄"棱纹：按 UV 相位沿径向起伏，与贴图垄距严格对齐
 * · 合并 / 实例化 / 环向排布等通用助手
 */
import {
  BoxGeometry,
  BufferGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector2,
  Vector3,
  LatheGeometry,
  Euler,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 由二维剖面 (r,y) 生成旋转面 */
export function latheFrom(profile: Vector2[], segments: number): BufferGeometry {
  const g = new LatheGeometry(profile, segments, 0, Math.PI * 2);
  g.computeVertexNormals();
  return g;
}

/**
 * 在旋转面上叠加"筒瓦"棱纹。
 * @param geometry 已生成的 LatheGeometry（必须带 uv）
 * @param columns  整圈瓦垄数（必须与贴图 repeat.x * 贴图垄数 一致）
 * @param amplitude 棱纹最大起伏（米）
 * @param fadeRefR 收分参考半径（檐口半径）；靠近顶部时棱纹自然收敛
 */
export function addTileRipple(geometry: BufferGeometry, columns: number, amplitude: number, fadeRefR: number): void {
  const pos = geometry.attributes.position as import('three').BufferAttribute;
  const uv = geometry.attributes.uv as import('three').BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    // 顶部收束处棱纹淡出，避免顶点处扭曲
    const t = Math.min(1, Math.max(0, (r / fadeRefR - 0.05) / 0.32));
    const fade = t * t * (3 - 2 * t);
    if (fade <= 0) continue;
    const u = uv.getX(i);
    // 波峰严格落在贴图每条瓦垄的中心
    const ridge = 0.5 - 0.5 * Math.cos(2 * Math.PI * u * columns);
    const dr = amplitude * ridge * fade;
    const k = (r + dr) / r;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/** 缩放/平移几何体的 uv（用于让合并后的各个小构件取到贴图不同区域） */
export function uvTransform(geo: BufferGeometry, su: number, sv: number, ou: number, ov: number): BufferGeometry {
  const uv = geo.attributes.uv as import('three').BufferAttribute | undefined;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  uv.needsUpdate = true;
  return geo;
}

/** 合并多个几何体（自动统一属性与索引形式，失败时返回第一个） */
export function mergeAll(geometries: BufferGeometry[]): BufferGeometry {
  const list = geometries.filter((g) => g.attributes.position);
  if (list.length === 1) return list[0];
  // 三类基础几何体索引形式不同（如 IcosahedronGeometry 无索引），需先统一
  const anyIndexed = list.some((g) => g.index);
  const allIndexed = list.every((g) => g.index);
  const prepared = anyIndexed && !allIndexed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;
  const merged = mergeGeometries(prepared, false);
  if (!merged) {
    console.warn('mergeGeometries 失败，退化为首个几何体');
    return list[0];
  }
  list.forEach((g) => g.dispose());
  return merged;
}

/** 便捷：几何体 + 变换矩阵 → 新几何体 */
export function transformed(
  geometry: BufferGeometry,
  position: Vector3 | [number, number, number],
  rotation: Euler | [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): BufferGeometry {
  const g = geometry.clone();
  const p = Array.isArray(position) ? new Vector3(...position) : position;
  const r = Array.isArray(rotation) ? new Euler(...rotation) : rotation;
  const m = new Matrix4().compose(p, new Quaternion().setFromEuler(r), new Vector3(...scale));
  g.applyMatrix4(m);
  return g;
}

/** 盒子便捷构造并变换 */
export function boxAt(
  w: number,
  h: number,
  d: number,
  position: Vector3 | [number, number, number],
  rotation: Euler | [number, number, number] = [0, 0, 0],
): BufferGeometry {
  return transformed(new BoxGeometry(w, h, d), position, rotation);
}

/** 由矩阵数组创建 InstancedMesh，并同步包围球（保证视锥剔除与阴影正确） */
export function makeInstanced(
  geometry: BufferGeometry,
  material: Material,
  matrices: Matrix4[],
  opts: { castShadow?: boolean; receiveShadow?: boolean; name?: string } = {},
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, matrices.length);
  for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? true;
  if (opts.name) mesh.name = opts.name;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * 环向实例矩阵：把实例放到环向角 angle 处，并让局部 +Z 指向圆外。
 * 环向角约定：位置 = (cos a, sin a) * radius。
 */
export function ringMatrix(angle: number, radius: number, y: number, scale?: Vector3): Matrix4 {
  const m = new Matrix4().makeRotationY(Math.PI / 2 - angle);
  m.setPosition(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  if (scale) m.scale(scale);
  return m;
}

/** 环向排布矩阵：绕 Y 轴均匀分布 count 个实例 */
export function ringMatrices(
  count: number,
  radius: number,
  y: number,
  phase = 0,
  extra?: (i: number, angle: number, m: Matrix4) => void,
): Matrix4[] {
  const out: Matrix4[] = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const m = ringMatrix(a, radius, y);
    extra?.(i, a, m);
    out.push(m);
  }
  return out;
}

/** 把对象放到环上某角度，并让其局部 +Z 指向圆外 */
export function placeOnRing(obj: Object3D, angle: number, radius: number, y: number, offset = 0): void {
  obj.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  obj.rotation.set(0, Math.PI / 2 - angle, 0);
  if (offset) obj.translateZ(offset);
}

/** 由位置 + 三轴构造矩阵（用于椽子等需要沿斜向摆放的构件） */
export function basisMatrix(pos: Vector3, xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): Matrix4 {
  return new Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(pos);
}

/** 简单网格对象工厂 */
export function mesh(geometry: BufferGeometry, material: Material, name?: string): Mesh {
  const m = new Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

/** 圆弧角度工具：把角度差归一化到 (-π, π] */
export function wrapAngle(a: number): number {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** 判断某角度是否落在若干"缺口"区间内（用于栏杆避让台阶） */
export function inAnyGap(angle: number, gaps: { center: number; half: number }[]): boolean {
  for (const g of gaps) {
    if (Math.abs(wrapAngle(angle - g.center)) < g.half) return true;
  }
  return false;
}
