/**
 * random.ts —— 确定性伪随机
 * 全部程序化生成必须可复现：同一个种子 → 同一套纹理与绿化布局。
 */

/** mulberry32：小巧、快速、分布良好的 32 位 PRNG */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 便捷封装：区间随机 / 取整 / 符号 / 从数组取一项 */
export class Rng {
  private readonly next: () => number;
  constructor(seed = 20240930) {
    this.next = makeRng(seed);
  }
  float(): number {
    return this.next();
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  /** 近似高斯（三次均匀相加），用于自然的尺寸抖动 */
  gauss(mean = 0, dev = 1): number {
    const u = (this.next() + this.next() + this.next()) / 3;
    return mean + (u - 0.5) * 3.464 * dev;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.min(arr.length - 1, Math.floor(this.next() * arr.length))];
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}
