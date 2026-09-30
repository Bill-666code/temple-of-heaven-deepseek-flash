/**
 * ExplodeController.ts —— 爆炸 / 重组动画
 * ------------------------------------------------------------------
 * 设计要点：
 *  · 三种位移模式，覆盖不同形态的构件：
 *      translate   —— 整体平移（屋面分层抬升、台基分层下沉）
 *      radialScale —— 环状体的半径扩张（墙体、额枋、槛窗等旋转体薄壳）
 *      instanced   —— 逐个实例沿自身"朝外"轴平移（柱列、斗拱、门窗、栏杆），
 *                     既不拉伸构件形状，又能让每个实例各走各的；
 *  · 错峰：每个构件有 order∈[0,1]，展开时自下而上依次启动，重组时自上而下回位；
 *  · 可打断：随时再次触发时以"当前值"为新起点重新起算，绝不瞬移；
 *  · 精确复位：位移值为 0 时直接写回基准位置/矩阵，保证与原位完全一致。
 */
import { InstancedMesh, Matrix4, Object3D, Vector3 } from 'three';

export type ExplodeMode = 'translate' | 'radialScale' | 'instanced';

export interface ExplodeSpec {
  object: Object3D;
  mode: ExplodeMode;
  /** translate 模式的位移方向（父级局部空间） */
  dir?: Vector3;
  /** translate: 米；instanced: 径向外移米数；radialScale: 半径增幅比例 */
  amount: number;
  /** 层次顺序 0→1（0 最先动） */
  order: number;
  /** 时长倍率 */
  durationScale?: number;
  label?: string;
}

interface Entry {
  spec: ExplodeSpec;
  basePos: Vector3;
  baseScale: Vector3;
  baseMatrices?: Matrix4[];
  inst?: InstancedMesh;
  spread: number[];
  value: number;
  from: number;
  to: number;
  t0: number;
  delay: number;
  dur: number;
  /** 需要在本帧强制刷新一次 */
  dirty: boolean;
}

export interface ExplodeOptions {
  /** 单个构件的基础时长（秒） */
  duration?: number;
  /** 错峰总跨度（秒） */
  stagger?: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class ExplodeController {
  private entries: Entry[] = [];
  private readonly duration: number;
  private readonly stagger: number;
  private time = 0;
  private target = 0;
  private settled = true;
  private tmp = new Matrix4();

  private static readonly UP = new Vector3(0, 1, 0);

  /** 0..1 的整体展开度（供相机推拉、HUD 显示） */
  amount = 0;

  constructor(opts: ExplodeOptions = {}) {
    this.duration = opts.duration ?? 1.7;
    this.stagger = opts.stagger ?? 0.95;
  }

  add(spec: ExplodeSpec): void {
    const entry: Entry = {
      spec,
      basePos: spec.object.position.clone(),
      baseScale: spec.object.scale.clone(),
      value: 0,
      from: 0,
      to: 0,
      t0: 0,
      delay: 0,
      dur: this.duration * (spec.durationScale ?? 1),
      dirty: true,
      spread: [],
    };
    if (spec.mode === 'instanced') {
      const inst = spec.object as InstancedMesh;
      const count = inst.count;
      entry.inst = inst;
      entry.baseMatrices = [];
      entry.spread = [];
      const m = new Matrix4();
      for (let i = 0; i < count; i++) {
        inst.getMatrixAt(i, m);
        entry.baseMatrices.push(m.clone());
        // 每个实例的位移量略有差异，形成自然的"错落感"
        entry.spread.push(0.78 + 0.44 * (0.5 + 0.5 * Math.sin(i * 2.399)));
      }
    }
    this.entries.push(entry);
  }

  get isExploded(): boolean {
    return this.target > 0.5;
  }

  get isSettled(): boolean {
    return this.settled;
  }

  /** 目标状态：true 展开 / false 复位 */
  setExploded(exploded: boolean): void {
    const to = exploded ? 1 : 0;
    if (to === this.target) return;
    this.target = to;
    this.settled = false;
    for (const e of this.entries) {
      // 以当前值为起点，避免打断时跳变
      e.from = e.value;
      e.to = to;
      e.t0 = this.time;
      e.delay = (exploded ? e.spec.order : 1 - e.spec.order) * this.stagger * (e.spec.durationScale ?? 1);
      e.dur = this.duration * (e.spec.durationScale ?? 1);
      e.dirty = true;
    }
  }

  toggle(): boolean {
    this.setExploded(!this.isExploded);
    return this.isExploded;
  }

  /** 立即复位（用于重建 / 重置视角） */
  reset(): void {
    this.target = 0;
    for (const e of this.entries) {
      e.value = 0;
      e.from = 0;
      e.to = 0;
      e.dirty = true;
      this.apply(e);
    }
    this.amount = 0;
    this.settled = true;
  }

  /**
   * 推进动画。
   * @returns 本帧是否有构件在移动（用于按需刷新阴影贴图）
   */
  update(dt: number): boolean {
    this.time += dt;
    let moving = false;
    let sum = 0;
    for (const e of this.entries) {
      const p = clamp01((this.time - e.t0 - e.delay) / e.dur);
      const next = e.from + (e.to - e.from) * easeInOutCubic(p);
      if (p < 1) moving = true;
      if (e.dirty || Math.abs(next - e.value) > 1e-7) {
        e.value = next;
        this.apply(e);
        e.dirty = false;
      }
      sum += e.value;
    }
    this.amount = this.entries.length ? sum / this.entries.length : 0;
    if (!moving && !this.settled) {
      // 全部到位：写回精确终值，保证"分毫不差"地复位
      for (const e of this.entries) {
        e.value = e.to;
        this.apply(e);
      }
      this.settled = true;
    }
    return moving;
  }

  private apply(e: Entry): void {
    const { spec } = e;
    if (spec.mode === 'translate') {
      const dir = spec.dir ?? ExplodeController.UP;
      spec.object.position.copy(e.basePos).addScaledVector(dir, spec.amount * e.value);
      return;
    }
    if (spec.mode === 'radialScale') {
      const k = 1 + spec.amount * e.value;
      spec.object.scale.set(e.baseScale.x * k, e.baseScale.y, e.baseScale.z * k);
      return;
    }
    // instanced：逐个实例沿自身 +Z（环向朝外）平移
    const inst = e.inst;
    const base = e.baseMatrices;
    if (!inst || !base) return;
    for (let i = 0; i < base.length; i++) {
      const d = spec.amount * e.value * e.spread[i];
      if (Math.abs(d) < 1e-5) {
        inst.setMatrixAt(i, base[i]);
      } else {
        this.tmp.makeTranslation(0, 0, d);
        this.tmp.premultiply(base[i]);
        inst.setMatrixAt(i, this.tmp);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  }

  /** 构件清单（HUD 展示用） */
  get labels(): { label: string; order: number }[] {
    return this.entries.map((e) => ({ label: e.spec.label ?? e.spec.object.name, order: e.spec.order }));
  }
}
