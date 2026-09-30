/**
 * Materials.ts —— 共享材质库
 * ------------------------------------------------------------------
 * 全场景材质在启动时一次性创建并被所有构件复用（降低 draw call 与状态切换）。
 * 贴图全部来自 procgen/textures.ts 的运行时绘制结果。
 */
import { Color, DoubleSide, MeshStandardMaterial, Vector2, type Texture } from 'three';
import { COLORS } from '../config';
import {
  balustradeTexture,
  caihuaTexture,
  dougongTexture,
  columnTexture,
  doorLeafTexture,
  grassTexture,
  imperialRampTexture,
  interiorFloorTexture,
  latticeFillTexture,
  marbleTexture,
  pavingTexture,
  redWallTexture,
  ridgeTileTexture,
  roofTileTexture,
  woodBeamTexture,
} from '../procgen/textures';

export class MaterialLibrary {
  readonly roofTile: MeshStandardMaterial;
  readonly ridge: MeshStandardMaterial;
  readonly roofUnder: MeshStandardMaterial;
  readonly rafter: MeshStandardMaterial;
  readonly caihua: MeshStandardMaterial;
  readonly dougong: MeshStandardMaterial;
  readonly gold: MeshStandardMaterial;
  readonly goldDeep: MeshStandardMaterial;
  readonly column: MeshStandardMaterial;
  readonly wall: MeshStandardMaterial;
  readonly marble: MeshStandardMaterial;
  readonly balustrade: MeshStandardMaterial;
  readonly ramp: MeshStandardMaterial;
  readonly lattice: MeshStandardMaterial;
  readonly latticeFill: MeshStandardMaterial;
  readonly interiorFloor: MeshStandardMaterial;
  readonly paving: MeshStandardMaterial;
  readonly pavingPath: MeshStandardMaterial;
  readonly grass: MeshStandardMaterial;
  readonly trunk: MeshStandardMaterial;
  readonly foliage: MeshStandardMaterial;
  readonly foliageLight: MeshStandardMaterial;

  /** 供后处理/环境光照统一调参 */
  readonly all: MeshStandardMaterial[];

  constructor() {
    const roof = roofTileTexture();
    const ridgeTex = ridgeTileTexture();
    const wood = woodBeamTexture();
    const caihua = caihuaTexture();
    const dougongTex = dougongTexture();
    const marble = marbleTexture();
    const balustrade = balustradeTexture();
    const ramp = imperialRampTexture();
    const doorTex = doorLeafTexture();
    const latticeFill = latticeFillTexture();
    const colTex = columnTexture();
    const wallTex = redWallTexture();
    const interior = interiorFloorTexture();
    const paving = pavingTexture();
    const grass = grassTexture();

    const set = (t: Texture, x = 1, y = 1) => {
      t.repeat.set(x, y);
      return t;
    };

    this.roofTile = new MeshStandardMaterial({
      map: roof.map,
      normalMap: roof.normalMap,
      normalScale: new Vector2(1.1, 1.1),
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0.05,
      envMapIntensity: 1.1,
      side: DoubleSide,
      name: 'roof-tile',
    });

    this.ridge = new MeshStandardMaterial({
      map: set(ridgeTex, 1, 3),
      roughness: 0.32,
      metalness: 0.1,
      envMapIntensity: 1.2,
      color: 0xffffff,
      name: 'ridge-tile',
    });

    this.roofUnder = new MeshStandardMaterial({
      map: set(wood, 6, 2),
      color: 0xecc9ab, // 檐下木构被天空漫射照亮，贴图本身偏暗，此处提亮

      roughness: 0.88,
      metalness: 0.0,
      side: DoubleSide,
      name: 'roof-under',
    });

    this.rafter = new MeshStandardMaterial({
      map: set(wood, 1, 1),
      color: 0xd0a98c,
      roughness: 0.82,
      metalness: 0.0,
      name: 'rafter',
    });

    this.caihua = new MeshStandardMaterial({
      map: caihua,
      roughness: 0.58,
      metalness: 0.1,
      envMapIntensity: 0.75,
      emissive: new Color('#0a1526'),
      emissiveIntensity: 0.5,
      name: 'caihua-beam',
    });

    this.dougong = new MeshStandardMaterial({
      map: dougongTex,
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.1,
      envMapIntensity: 0.85,
      // 檐下深处受天空漫射照射，补一点自发光避免"糊成黑块"
      emissive: new Color('#0d1a2e'),
      emissiveIntensity: 0.6,
      name: 'dougong',
    });

    this.gold = new MeshStandardMaterial({
      color: new Color(COLORS.gold),
      roughness: 0.24,
      metalness: 1.0,
      envMapIntensity: 1.9,
      name: 'gilded-bronze',
    });

    this.goldDeep = new MeshStandardMaterial({
      color: new Color('#a97a22'),
      roughness: 0.38,
      metalness: 0.95,
      envMapIntensity: 1.4,
      name: 'gilded-bronze-deep',
    });

    this.column = new MeshStandardMaterial({
      map: set(colTex, 2, 3),
      roughness: 0.52,
      metalness: 0.04,
      envMapIntensity: 0.55,
      name: 'cinnabar-column',
    });

    this.wall = new MeshStandardMaterial({
      map: set(wallTex, 4, 1),
      roughness: 0.78,
      metalness: 0.02,
      name: 'red-wall',
    });

    this.marble = new MeshStandardMaterial({
      map: set(marble, 1, 1),
      color: 0xd0cabd,
      roughness: 0.62,
      metalness: 0.0,
      envMapIntensity: 0.7,
      name: 'white-marble',
    });

    this.balustrade = new MeshStandardMaterial({
      map: balustrade.map,
      normalMap: balustrade.normalMap,
      roughness: 0.6,
      metalness: 0.0,
      envMapIntensity: 0.7,
      name: 'balustrade',
    });

    this.ramp = new MeshStandardMaterial({
      map: ramp.map,
      normalMap: ramp.normalMap,
      roughness: 0.55,
      metalness: 0.0,
      envMapIntensity: 0.75,
      name: 'imperial-ramp',
    });

    this.lattice = new MeshStandardMaterial({
      map: doorTex,
      alphaTest: 0.5,
      side: DoubleSide,
      roughness: 0.6,
      metalness: 0.06,
      envMapIntensity: 0.6,
      name: 'lattice-door',
    });

    this.latticeFill = new MeshStandardMaterial({
      map: latticeFill,
      alphaTest: 0.5,
      side: DoubleSide,
      roughness: 0.6,
      metalness: 0.06,
      envMapIntensity: 0.6,
      name: 'lattice-window',
    });

    this.interiorFloor = new MeshStandardMaterial({
      map: set(interior, 8, 8),
      roughness: 0.34,
      metalness: 0.12,
      envMapIntensity: 0.5,
      name: 'interior-floor',
    });

    this.paving = new MeshStandardMaterial({
      map: set(paving, 46, 46),
      roughness: 0.93,
      metalness: 0.0,
      envMapIntensity: 0.45,
      name: 'paving',
    });

    this.pavingPath = new MeshStandardMaterial({
      map: paving.clone(),
      color: 0xe4ded2,
      roughness: 0.9,
      metalness: 0.0,
      envMapIntensity: 0.45,
      name: 'paving-path',
    });
    this.pavingPath.map!.repeat.set(1, 1);
    this.pavingPath.map!.needsUpdate = true;

    this.grass = new MeshStandardMaterial({
      map: set(grass, 260, 260),
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.35,
      name: 'grass',
    });

    this.trunk = new MeshStandardMaterial({ color: 0x4b3826, roughness: 0.95, metalness: 0, name: 'trunk' });
    this.foliage = new MeshStandardMaterial({ color: 0x33502c, roughness: 0.92, metalness: 0, name: 'foliage' });
    this.foliageLight = new MeshStandardMaterial({ color: 0x4e6f36, roughness: 0.9, metalness: 0, name: 'foliage-light' });

    this.all = [
      this.roofTile,
      this.ridge,
      this.roofUnder,
      this.rafter,
      this.caihua,
      this.dougong,
      this.gold,
      this.goldDeep,
      this.column,
      this.wall,
      this.marble,
      this.balustrade,
      this.ramp,
      this.lattice,
      this.latticeFill,
      this.interiorFloor,
      this.paving,
      this.pavingPath,
      this.grass,
      this.trunk,
      this.foliage,
      this.foliageLight,
    ];
  }

  /** 释放 GPU 资源 */
  dispose(): void {
    for (const m of this.all) {
      m.map?.dispose();
      m.normalMap?.dispose();
      m.roughnessMap?.dispose();
      m.dispose();
    }
  }
}
