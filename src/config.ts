/**
 * config.ts —— 祈年殿比例总控
 * ------------------------------------------------------------------
 * 全场景单位：米。原点 (0,0,0) 位于广场地面，Y 轴向上。
 * 殿身（hallRoot）局部坐标的原点在"台基顶面"，即世界坐标 y = PLATFORM.topY。
 * 所有建筑构件都在这个局部坐标系里生成，便于爆炸动画以"层"为单位整体位移。
 *
 * 参考实物：祈年殿殿身直径约 24.2m，殿高约 38.2m，
 * 下有三层圆形汉白玉台基（祈谷坛），总高约 6m。
 */

/** 台基（三层汉白玉圆坛） */
export const PLATFORM = {
  /** 台基顶面世界高度 = 殿身局部坐标原点（hallRoot.position.y） */
  topY: 6.6,
  /**
   * 由上至下三层。topY 为"殿身局部坐标"下的该层顶面高度：
   * 顶层顶面即 ±0.000（= 世界 6.6m），往下依次为负值，最底层落在世界地面 0。
   */
  tiers: [
    { radius: 18.0, topY: 0.0, height: 2.0 },
    { radius: 21.2, topY: -2.0, height: 2.2 },
    { radius: 24.4, topY: -4.2, height: 2.4 },
  ],
  /** 每层侧壁收分（上小下大），营造石构台的稳定感 */
  batter: 0.35,
  /** 栏杆中心线相对该层边缘的内缩量 */
  railInset: 0.75,
  /** 望柱间距 */
  postSpacing: 2.35,
  /** 台阶（四个正方向各设一组） */
  stair: {
    /** 朝天方向：南(+Z)、北(-Z)、东(+X)、西(-X) */
    dirs: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
    /** 台阶总宽（含两侧垂带） */
    width: 11.0,
    /** 每层台阶的水平进深 */
    run: 5.2,
    /** 每层踏步数 */
    steps: 9,
    /** 中央御路宽度 */
    imperialWidth: 3.0,
  },
} as const;

/** 一重檐（一层屋顶 + 其下的墙体/额枋/斗拱）的规格 */
export interface EaveSpec {
  key: string;
  label: string;
  /** 该层墙体（门窗环）半径与上下沿（局部 y） */
  wallR: number;
  wallBottom: number;
  wallTop: number;
  /** 额枋（彩画大枋）中心半径、底高、高 */
  bandR: number;
  bandY: number;
  bandH: number;
  /** 平板枋 */
  flatR: number;
  flatY: number;
  flatH: number;
  /** 斗拱：起始高度、层高、内半径、外挑半径、每圈攒数 */
  dougongY: number;
  dougongH: number;
  dougongInR: number;
  dougongOutR: number;
  dougongCount: number;
  /** 檐口（瓦口）外缘半径与高度 */
  eaveR: number;
  eaveY: number;
  /** 屋面收束到的内缘半径与高度 */
  crownR: number;
  crownY: number;
  /** 屋面曲线幂次：>1 表示近檐口平缓、近脊部陡峭（中国式"反宇"曲面） */
  curve: number;
  /** 翼角起翘（檐口上翘）与出翘（檐口外挑） */
  lipUp: number;
  lipOut: number;
  /** 垂脊条数 */
  ridgeCount: number;
}

/**
 * 三重檐。数值自下而上手工调校，保证：
 *  1) 每层檐口都外挑出其下柱列 1.2~1.8m（出檐深远）；
 *  2) 上檐远小于下檐（收分），形成稳定的金字塔式剪影；
 *  3) 顶层为连续凹曲面攒尖顶，直通宝顶。
 */
export const EAVES: EaveSpec[] = [
  {
    key: 'lower',
    label: '下檐',
    wallR: 9.7,
    wallBottom: 0.55,
    wallTop: 6.9,
    bandR: 12.12,
    bandY: 7.8,
    bandH: 0.75,
    flatR: 12.28,
    flatY: 8.55,
    flatH: 0.3,
    dougongY: 8.85,
    dougongH: 1.2,
    dougongInR: 12.28,
    dougongOutR: 13.35,
    dougongCount: 24,
    eaveR: 13.7,
    eaveY: 10.2,
    crownR: 9.35,
    crownY: 13.4,
    curve: 1.85,
    lipUp: 0.42,
    lipOut: 0.3,
    ridgeCount: 12,
  },
  {
    key: 'middle',
    label: '中檐',
    wallR: 9.6,
    wallBottom: 12.55,
    wallTop: 15.1,
    bandR: 10.05,
    bandY: 15.6,
    bandH: 0.7,
    flatR: 10.2,
    flatY: 16.3,
    flatH: 0.26,
    dougongY: 16.56,
    dougongH: 1.0,
    dougongInR: 10.2,
    dougongOutR: 11.0,
    dougongCount: 24,
    eaveR: 11.45,
    eaveY: 17.8,
    crownR: 8.05,
    crownY: 20.4,
    curve: 1.8,
    lipUp: 0.36,
    lipOut: 0.26,
    ridgeCount: 12,
  },
  {
    key: 'upper',
    label: '上檐',
    wallR: 8.3,
    wallBottom: 19.35,
    wallTop: 21.6,
    bandR: 8.42,
    bandY: 21.6,
    bandH: 0.62,
    flatR: 8.56,
    flatY: 22.22,
    flatH: 0.24,
    dougongY: 22.46,
    dougongH: 0.9,
    dougongInR: 8.56,
    dougongOutR: 9.25,
    dougongCount: 24,
    eaveR: 9.7,
    eaveY: 23.6,
    /** 攒尖顶点（宝顶座落处） */
    crownR: 0.95,
    crownY: 35.5,
    curve: 1.9,
    lipUp: 0.34,
    lipOut: 0.24,
    ridgeCount: 12,
  },
];

/** 柱列 */
export const COLUMNS = {
  /** 檐柱：12 根，承下檐 */
  eave: { count: 12, ringR: 12.0, height: 7.8, radius: 0.46, phase: 0 },
  /** 金柱：12 根，承中檐，同时是殿身墙体的柱列 */
  inner: { count: 12, ringR: 9.95, height: 15.6, radius: 0.51, phase: Math.PI / 12 },
  /** 龙井柱：4 根，承上檐与整个攒尖顶 */
  well: { count: 4, ringR: 4.9, height: 21.9, radius: 0.72, phase: Math.PI / 4 },
} as const;

/** 门窗（每开间一樘隔扇门 + 上层槛窗） */
export const OPENING = {
  /** 隔扇门：开间数 = 柱列间距 */
  doorCount: 12,
  doorTop: 6.9,
  /** 门上槛窗 */
  windowBottom: 13.75,
  windowTop: 15.05,
  windowCount: 12,
  /** 上檐短墙上的小窗 */
  upperWindowBottom: 20.6,
  upperWindowTop: 21.5,
  upperWindowCount: 12,
} as const;

/** 鎏金宝顶 */
export const FINIAL = {
  baseY: 35.5,
  /** 总高（至顶尖） */
  height: 3.7,
  /** 最大宝珠半径 */
  beadR: 1.12,
} as const;

/** 屋面瓦作 */
export const TILE = {
  /** 筒瓦一垄的水平宽度（同时决定贴图与几何棱纹的频率） */
  pitch: 0.46,
  /** 每垄几何分段（2 段 = 一脊一沟） */
  segPerPitch: 2,
  /** 一条瓦垄在贴图里占多少像素列（贴图内的垄数） */
  columnsPerTexture: 4,
  /** 每张贴图内的横向瓦垄（course）数 */
  coursesPerTexture: 4,
  /** 单条瓦垄的视觉高度（几何棱纹幅度） */
  ripple: 0.036,
  /** 屋面板厚（檐口可见的厚度） */
  thickness: 0.42,
} as const;

/** 场景环境 */
export const SCENE_ENV = {
  /** 太阳方位（午后偏西南，北京秋冬典型光照） */
  sunDirection: { x: 0.52, y: 0.72, z: 0.46 },
  /** 广场半径 */
  plazaRadius: 132,
  /** 地面（草地）尺寸 */
  groundSize: 1500,
  /** 树带半径区间 */
  treeBelt: { inner: 148, outer: 420 },
} as const;

export const COLORS = {
  /** 蓝琉璃瓦 */
  roofTile: '#1c3f96',
  roofTileDeep: '#12295f',
  /** 鎏金 */
  gold: '#d8a437',
  goldBright: '#f4d47c',
  /** 朱红柱、墙 */
  cinnabar: '#96301f',
  cinnabarDeep: '#6d2116',
  /** 彩画青绿 */
  caihuaBlue: '#1b3f8c',
  caihuaGreen: '#14624b',
  /** 汉白玉 */
  marble: '#e6e1d6',
  marbleDeep: '#c9c2b4',
  /** 地面石 */
  paving: '#9c9a95',
  grass: '#4f6b3a',
} as const;
