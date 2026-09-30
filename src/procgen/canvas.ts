/**
 * canvas.ts —— 画布 / 噪声 / 法线烘焙工具
 * 所有贴图都在运行时用 Canvas2D 绘制，不加载任何外部图片资源。
 */
import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import { makeRng } from './random';

export interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

export function makeCanvas(w: number, h: number): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法获取 2D 绘图上下文');
  return { canvas, ctx, w, h };
}

/** 铺满纯色 */
export function fill(c: Canvas2D, color: string): void {
  c.ctx.fillStyle = color;
  c.ctx.fillRect(0, 0, c.w, c.h);
}

/**
 * 可平铺的 fbm 值噪声（用画布绘制柔和的随机斑点，再用自身平铺叠加）。
 * 用于石材纹理、草地、瓦面釉色不均等"有机"细节。
 */
export function paintNoise(
  c: Canvas2D,
  opts: { count: number; minR: number; maxR: number; colors: string[]; alpha: number; seed?: number; blend?: GlobalCompositeOperation },
): void {
  const { count, minR, maxR, colors, alpha, seed = 1, blend = 'source-over' } = opts;
  const rng = makeRng(seed);
  const ctx = c.ctx;
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const x = rng() * c.w;
    const y = rng() * c.h;
    const r = minR + (maxR - minR) * rng();
    const col = colors[Math.floor(rng() * colors.length) % colors.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // 为保持可平铺，四边越界处补画一次
    for (const [dx, dy] of [[0, 0], [-c.w, 0], [c.w, 0], [0, -c.h], [0, c.h]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 逐像素噪声（细颗粒），用 ImageData 操作 */
export function paintGrain(c: Canvas2D, amount: number, seed = 7, monochrome = true): void {
  const rng = makeRng(seed);
  const img = c.ctx.getImageData(0, 0, c.w, c.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (monochrome) {
      const n = (rng() - 0.5) * amount;
      d[i] = clamp255(d[i] + n);
      d[i + 1] = clamp255(d[i + 1] + n);
      d[i + 2] = clamp255(d[i + 2] + n);
    } else {
      d[i] = clamp255(d[i] + (rng() - 0.5) * amount);
      d[i + 1] = clamp255(d[i + 1] + (rng() - 0.5) * amount);
      d[i + 2] = clamp255(d[i + 2] + (rng() - 0.5) * amount);
    }
  }
  c.ctx.putImageData(img, 0, 0);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** 画布 → 贴图 */
export function toTexture(
  canvas: HTMLCanvasElement,
  opts: { repeatX?: number; repeatY?: number; srgb?: boolean; aniso?: number } = {},
): CanvasTexture {
  const { repeatX = 1, repeatY = 1, srgb = true, aniso = 8 } = opts;
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = aniso;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Sobel 高度→法线烘焙。
 * 把程序化绘制的灰度"高度图"转成切线空间法线贴图，
 * 让瓦垄、栏板浮雕、御路云龙在光照下产生真实的凹凸。
 */
export function heightToNormal(src: HTMLCanvasElement, strength = 2.0): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d');
  if (!sctx) throw new Error('高度图缺少 2D 上下文');
  const data = sctx.getImageData(0, 0, w, h).data;

  const out = makeCanvas(w, h);
  const img = out.ctx.createImageData(w, h);
  const o = img.data;

  const at = (x: number, y: number): number => {
    const xx = (x + w) % w;
    const yy = (y + h) % h;
    const i = (yy * w + xx) * 4;
    // 亮度即高度
    return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);
      // 归一化法线并编码到 0..255
      const nx = dx * strength;
      const ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      o[i] = clamp255(((nx / len) * 0.5 + 0.5) * 255);
      o[i + 1] = clamp255(((ny / len) * 0.5 + 0.5) * 255);
      o[i + 2] = clamp255(((nz / len) * 0.5 + 0.5) * 255);
      o[i + 3] = 255;
    }
  }
  out.ctx.putImageData(img, 0, 0);
  return out.canvas;
}

/** 由灰度高度图画一张灰阶贴图（供 roughnessMap / aoMap 使用） */
export function heightToGray(src: HTMLCanvasElement, gamma = 1, invert = false): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d');
  if (!sctx) throw new Error('高度图缺少 2D 上下文');
  const data = sctx.getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const img = out.ctx.createImageData(w, h);
  const o = img.data;
  for (let i = 0; i < data.length; i += 4) {
    let v = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    if (invert) v = 1 - v;
    v = Math.pow(v, gamma) * 255;
    o[i] = o[i + 1] = o[i + 2] = clamp255(v);
    o[i + 3] = 255;
  }
  out.ctx.putImageData(img, 0, 0);
  return out.canvas;
}

/** 画一条"龙纹/云纹"这类中式旋涡曲线（用于浮雕与彩画） */
export function paintScroll(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  turns: number,
  stroke: string,
  lineWidth: number,
  startAngle = 0,
): void {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = startAngle + t * turns * Math.PI * 2;
    const rr = r * (0.12 + 0.88 * t);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}
