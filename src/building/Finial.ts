/**
 * Finial.ts —— 鎏金宝顶
 * ------------------------------------------------------------------
 * 由控制点插值出的光滑旋转体：须弥座 → 束腰 → 大宝珠 → 细颈 → 小宝珠 → 火焰尖。
 * 材质为金属度 1.0 的鎏金铜，靠程序化天空生成的环境贴图产生真实金属反射。
 */
import { CatmullRomCurve3, Group, TorusGeometry, Vector2, Vector3 } from 'three';
import { FINIAL } from '../config';
import { latheFrom, mesh } from '../procgen/geometry';
import type { MaterialLibrary } from './Materials';

export function buildFinial(mats: MaterialLibrary): Group {
  const group = new Group();
  group.name = 'finial';

  const control: [number, number][] = [
    [0.95, 0.0],
    [1.16, 0.22],
    [1.02, 0.4],
    [0.8, 0.52],
    [1.0, 0.68],
    [0.55, 0.84],
    [0.45, 0.98],
    [0.72, 1.24],
    [1.06, 1.52],
    [1.1, 1.76],
    [0.86, 2.04],
    [0.52, 2.26],
    [0.58, 2.48],
    [0.64, 2.66],
    [0.4, 2.92],
    [0.24, 3.16],
    [0.12, 3.4],
    [0.0, FINIAL.height],
  ];

  const curve = new CatmullRomCurve3(control.map(([r, y]) => new Vector3(r, y, 0)), false, 'catmullrom', 0.35);
  const pts: Vector2[] = curve.getPoints(90).map((p) => new Vector2(Math.max(0, p.x), p.y));

  const body = mesh(latheFrom(pts, 48), mats.gold, 'finial-body');
  group.add(body);

  // 宝顶座上的鎏金箍环
  const ring = new TorusGeometry(0.94, 0.08, 8, 40);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.56, 0);
  group.add(mesh(ring, mats.goldDeep, 'finial-ring'));

  const ring2 = new TorusGeometry(0.7, 0.06, 8, 36);
  ring2.rotateX(Math.PI / 2);
  ring2.translate(0, 2.24, 0);
  group.add(mesh(ring2, mats.goldDeep, 'finial-ring-2'));

  return group;
}
