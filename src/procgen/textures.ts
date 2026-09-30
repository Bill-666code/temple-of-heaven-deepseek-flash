/**
 * textures.ts —— 全程序化贴图库
 * ------------------------------------------------------------------
 * 所有贴图均由 Canvas2D 在运行时绘制，零外部资源。
 * 关键表面（琉璃瓦、栏板浮雕、御路石雕）额外烘焙切线空间法线贴图，
 * 让程序化几何 + 贴图在光照下呈现真实的凹凸与釉面质感。
 */
import type { Texture } from 'three';
import { RepeatWrapping } from 'three';
import { COLORS } from '../config';
import { makeCanvas, fill, paintNoise, paintGrain, heightToNormal, toTexture, paintScroll, type Canvas2D } from './canvas';
import { makeRng } from './random';

/** 贴图绘制共用的确定性随机流（构建顺序固定 → 结果可复现） */
const rnd = makeRng(20240930);

export interface NormalTexSet {
  map: Texture;
  normalMap: Texture;
}

const cache = new Map<string, unknown>();
function memo<T>(key: string, build: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  const built = build();
  cache.set(key, built);
  return built;
}

/* ------------------------------------------------------------------ */
/* 1. 蓝琉璃筒瓦                                                        */
/* ------------------------------------------------------------------ */

/** 瓦面一垄的横截面着色：筒瓦居中以圆柱受光，两侧为板瓦沟槽 */
function paintBarrelColumn(
  c: Canvas2D,
  x0: number,
  w: number,
  mode: 'color' | 'height',
  seed: number,
): void {
  const ctx = c.ctx;
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  if (mode === 'height') {
    g.addColorStop(0.0, '#2a2a2a');
    g.addColorStop(0.16, '#3a3a3a');
    g.addColorStop(0.30, '#d8d8d8');
    g.addColorStop(0.44, '#ffffff');
    g.addColorStop(0.62, '#c8c8c8');
    g.addColorStop(0.82, '#6a6a6a');
    g.addColorStop(1.0, '#2a2a2a');
  } else {
    // 釉面高光偏冷，暗部压深，形成"琉璃"的通透感
    g.addColorStop(0.0, '#0c1938');
    g.addColorStop(0.14, '#15306f');
    g.addColorStop(0.28, '#4f83e0');
    g.addColorStop(0.40, '#2f5cc0');
    g.addColorStop(0.60, COLORS.roofTile);
    g.addColorStop(0.80, '#16337c');
    g.addColorStop(1.0, '#0c1938');
  }
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, w, c.h);

  if (mode === 'color') {
    // 釉色流淌不均（程序化斑块）
    paintNoise(
      {
        ...c,
        ctx,
      },
      {
        count: 26,
        minR: w * 0.25,
        maxR: w * 1.6,
        colors: ['rgba(120,170,255,0.5)', 'rgba(10,20,60,0.6)', 'rgba(80,130,220,0.4)'],
        alpha: 0.25,
        seed,
      },
    );
  }
}

export function roofTileTexture(): NormalTexSet {
  return memo('roofTile', () => {
    const W = 512;
    const H = 512;
    const cols = 8;
    const courses = 4;
    const cw = W / cols;
    const ch = H / courses;

    const color = makeCanvas(W, H);
    const height = makeCanvas(W, H);
    fill(color, COLORS.roofTileDeep);
    fill(height, '#2a2a2a');

    for (let i = 0; i < cols; i++) {
      paintBarrelColumn(color, i * cw, cw, 'color', 11 + i * 7);
      paintBarrelColumn(height, i * cw, cw, 'height', 11 + i * 7);
    }

    // 横向瓦垄（每垄压下一垄，形成阶梯阴影线）
    const cctx = color.ctx;
    const hctx = height.ctx;
    for (let j = 0; j <= courses; j++) {
      const y = j * ch;
      cctx.save();
      cctx.globalAlpha = 0.5;
      cctx.fillStyle = '#050b1e';
      cctx.fillRect(0, y - 3, W, 5);
      cctx.globalAlpha = 0.35;
      cctx.fillStyle = '#7ea8f0';
      cctx.fillRect(0, y + 2, W, 2);
      cctx.restore();

      hctx.fillStyle = '#101010';
      hctx.fillRect(0, y - 3, W, 6);
    }

    // 瓦当端头（每垄上方一道浅灰金边，模拟滴水线）
    cctx.globalAlpha = 0.18;
    cctx.fillStyle = '#ffe9a8';
    for (let i = 0; i < cols; i++) cctx.fillRect(i * cw + cw * 0.42, 0, cw * 0.16, H);
    cctx.globalAlpha = 1;

    paintGrain(color, 14, 99);

    const map = toTexture(color.canvas, { repeatX: 1, repeatY: 1, aniso: 16 });
    const normalMap = toTexture(heightToNormal(height.canvas, 2.6), { srgb: false, aniso: 8 });
    return { map, normalMap };
  });
}

/** 垂脊／正脊用瓦：更深邃的蓝 + 金色压边 */
export function ridgeTileTexture(): Texture {
  return memo('ridge', () => {
    const c = makeCanvas(128, 256);
    fill(c, '#26499c');
    const ctx = c.ctx;
    // 脊筒
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#1b3576');
    g.addColorStop(0.35, '#4470cf');
    g.addColorStop(0.5, '#7ba3ee');
    g.addColorStop(0.68, '#3560bd');
    g.addColorStop(1, '#1b3576');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    // 金色压边
    ctx.fillStyle = 'rgba(216,164,55,0.85)';
    ctx.fillRect(0, 8, 10, 240);
    ctx.fillRect(118, 8, 10, 240);
    ctx.fillStyle = 'rgba(255,232,160,0.5)';
    ctx.fillRect(10, 8, 3, 240);
    ctx.fillRect(115, 8, 3, 240);
    paintGrain(c, 18, 5);
    return toTexture(c.canvas, { repeatX: 1, repeatY: 1, aniso: 8 });
  });
}

/* ------------------------------------------------------------------ */
/* 2. 汉白玉 / 石材                                                     */
/* ------------------------------------------------------------------ */

export function marbleTexture(): Texture {
  return memo('marble', () => {
    const c = makeCanvas(512, 512);
    fill(c, COLORS.marble);
    const ctx = c.ctx;
    // 大尺度色斑
    paintNoise(c, {
      count: 90,
      minR: 40,
      maxR: 160,
      colors: ['rgba(255,255,255,0.5)', 'rgba(196,190,178,0.45)', 'rgba(214,208,196,0.4)'],
      alpha: 0.35,
      seed: 3,
    });
    // 石纹（贝塞尔脉络）
    const veins = 26;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < veins; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      ctx.strokeStyle = `rgba(150,146,138,${0.12 + rnd() * 0.16})`;
      ctx.lineWidth = 0.8 + rnd() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let px = x;
      let py = y;
      for (let k = 0; k < 4; k++) {
        const nx = px + (rnd() - 0.4) * 120;
        const ny = py + (rnd() - 0.5) * 160;
        ctx.quadraticCurveTo(px + (rnd() - 0.5) * 60, py + (rnd() - 0.5) * 60, nx, ny);
        px = nx;
        py = ny;
      }
      ctx.stroke();
    }
    ctx.restore();
    paintGrain(c, 12, 21);
    return toTexture(c.canvas, { repeatX: 1, repeatY: 1, aniso: 16 });
  });
}

/** 栏板：外框 + 云纹浮雕（返回颜色 + 法线） */
export function balustradeTexture(): NormalTexSet {
  return memo('balustrade', () => {
    const W = 512;
    const H = 256;
    const c = makeCanvas(W, H);
    const hgt = makeCanvas(W, H);
    fill(c, COLORS.marble);
    fill(hgt, '#8a8a8a');

    paintNoise(c, {
      count: 40,
      minR: 20,
      maxR: 90,
      colors: ['rgba(255,255,255,0.6)', 'rgba(200,195,184,0.5)'],
      alpha: 0.3,
      seed: 17,
    });

    const ctx = c.ctx;
    const hctx = hgt.ctx;

    // 边框：外框凸起
    const frame = 26;
    for (const [x, y, w, h] of [
      [0, 0, W, frame],
      [0, H - frame, W, frame],
      [0, 0, frame, H],
      [W - frame, 0, frame, H],
    ]) {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#f4f1e8');
      g.addColorStop(0.5, '#dfd9cc');
      g.addColorStop(1, '#b9b2a4');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      hctx.fillStyle = '#ffffff';
      hctx.fillRect(x, y, w, h);
      // 内沿线（凹槽）
      ctx.strokeStyle = 'rgba(120,114,104,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      hctx.fillStyle = '#3a3a3a';
      hctx.fillRect(x + 1, y + 1, w - 2, 3);
      hctx.fillRect(x + 1, y + h - 4, w - 2, 3);
      hctx.fillRect(x + 1, y + 1, 3, h - 2);
      hctx.fillRect(x + w - 4, y + 1, 3, h - 2);
    }

    // 中央云纹（减地浮雕）：如意云头 + 卷云
    const cx = W / 2;
    const cy = H / 2;
    ctx.save();
    hctx.save();
    // 云头轮廓
    const lobes = 5;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = -Math.PI * 0.15 + (i / 120) * Math.PI * 1.3;
      const rr = 74 + Math.sin(a * lobes) * 16;
      const x = cx + Math.cos(a) * rr * 1.5;
      const y = cy + Math.sin(a) * rr * 0.72;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(150,144,132,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    hctx.strokeStyle = '#ffffff';
    hctx.lineWidth = 5;
    hctx.stroke();
    ctx.restore();
    hctx.restore();

    // 卷云旋涡
    for (let i = 0; i < 4; i++) {
      const sx = cx + (i < 2 ? -1 : 1) * (66 + (i % 2) * 26);
      const sy = cy + (i % 2 ? -1 : 1) * 24;
      paintScroll(ctx, sx, sy, 30, 1.35, 'rgba(146,140,128,0.85)', 3.4, i * 1.2);
      paintScroll(ctx, sx, sy, 30, 1.35, 'rgba(255,255,255,0.7)', 1.4, i * 1.2);
      paintScroll(hctx, sx, sy, 30, 1.35, '#ffffff', 4, i * 1.2);
    }

    paintGrain(c, 10, 33);

    return {
      map: toTexture(c.canvas, { aniso: 8 }),
      normalMap: toTexture(heightToNormal(hgt.canvas, 1.6), { srgb: false, aniso: 8 }),
    };
  });
}

/** 广场地面：方砖铺装 */
export function pavingTexture(): Texture {
  return memo('paving', () => {
    const c = makeCanvas(512, 512);
    fill(c, COLORS.paving);
    const ctx = c.ctx;
    const n = 4;
    const s = 512 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 0.84 + rnd() * 0.28;
        const r = Math.round(156 * v);
        const g = Math.round(154 * v);
        const b = Math.round(148 * v);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        ctx.strokeStyle = 'rgba(70,68,64,0.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(i * s + 2, j * s + 2, s - 4, s - 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(i * s + 4, j * s + 4, s - 8, s - 8);
      }
    }
    paintNoise(c, {
      count: 120,
      minR: 6,
      maxR: 40,
      colors: ['rgba(110,108,102,0.55)', 'rgba(198,196,190,0.55)', 'rgba(78,76,72,0.4)'],
      alpha: 0.42,
      seed: 8,
    });
    // 大尺度色差：避免大面积铺装在远处变成一片死灰
    paintNoise(c, {
      count: 26,
      minR: 70,
      maxR: 220,
      colors: ['rgba(150,148,142,0.5)', 'rgba(178,176,170,0.5)', 'rgba(120,118,114,0.45)'],
      alpha: 0.35,
      seed: 81,
    });
    paintGrain(c, 22, 44);
    return toTexture(c.canvas, { repeatX: 1, repeatY: 1, aniso: 16 });
  });
}

export function grassTexture(): Texture {
  return memo('grass', () => {
    const c = makeCanvas(256, 256);
    fill(c, COLORS.grass);
    const ctx = c.ctx;
    paintNoise(c, {
      count: 260,
      minR: 4,
      maxR: 26,
      colors: ['rgba(96,124,64,0.6)', 'rgba(52,74,38,0.6)', 'rgba(120,142,78,0.5)', 'rgba(76,96,52,0.5)'],
      alpha: 0.5,
      seed: 12,
    });
    // 细草丝
    ctx.save();
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      ctx.strokeStyle = `rgba(${60 + rnd() * 70},${90 + rnd() * 70},${40 + rnd() * 40},0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
      ctx.stroke();
    }
    ctx.restore();
    return toTexture(c.canvas, { aniso: 8 });
  });
}

/* ------------------------------------------------------------------ */
/* 3. 彩画（旋子彩画）                                                  */
/* ------------------------------------------------------------------ */

export function caihuaTexture(): Texture {
  return memo('caihua', () => {
    const W = 1024;
    const H = 256;
    const c = makeCanvas(W, H);
    const ctx = c.ctx;
    fill(c, COLORS.caihuaBlue);

    // 上下枋线：白 + 金
    const line = (y: number, w: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, y, W, w);
    };
    line(0, 10, '#f2ead2');
    line(10, 5, '#c9a13c');
    line(H - 14, 10, '#f2ead2');
    line(H - 19, 5, '#c9a13c');

    // 两段：青底 + 绿箍头（可无缝平铺）
    for (let seg = 0; seg < 2; seg++) {
      const x0 = seg * (W / 2);
      const segW = W / 2;
      // 藻头底色（青）
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#22509f');
      g.addColorStop(0.5, COLORS.caihuaBlue);
      g.addColorStop(1, '#153267');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, segW, H);

      // 箍头（绿）
      for (const hx of [x0, x0 + segW - 74]) {
        const gg = ctx.createLinearGradient(hx, 0, hx + 74, 0);
        gg.addColorStop(0, '#0e4a39');
        gg.addColorStop(0.5, COLORS.caihuaGreen);
        gg.addColorStop(1, '#0b3c2e');
        ctx.fillStyle = gg;
        ctx.fillRect(hx, 0, 74, H);
        ctx.fillStyle = 'rgba(226,192,110,0.9)';
        ctx.fillRect(hx + 6, 14, 3, H - 28);
        ctx.fillRect(hx + 66, 14, 3, H - 28);
      }

      // 旋花：同心金环 + 花瓣 + 旋子
      const cx = x0 + segW / 2;
      const cy = H / 2;
      const R = 62;
      ctx.save();
      ctx.lineWidth = 3;
      for (let ring = 0; ring < 3; ring++) {
        const rr = R - ring * 17;
        ctx.strokeStyle = ring % 2 === 0 ? 'rgba(232,199,116,0.95)' : 'rgba(240,238,226,0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 花瓣（16 瓣）
      for (let p = 0; p < 16; p++) {
        const a = (p / 16) * Math.PI * 2;
        const rr = R - 3;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        ctx.rotate(a);
        ctx.fillStyle = p % 2 ? 'rgba(226,192,110,0.95)' : 'rgba(240,238,226,0.9)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      paintScroll(ctx, cx, cy, 42, 1.6, 'rgba(232,199,116,0.95)', 3.4);
      paintScroll(ctx, cx, cy, 42, 1.6, 'rgba(255,255,255,0.5)', 1.4, Math.PI);
      ctx.restore();

      // 两侧退晕（青绿叠晕）
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i % 2 ? 'rgba(240,238,226,0.5)' : 'rgba(20,98,75,0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x0 + 84 + i * 9, 20);
        ctx.quadraticCurveTo(cx - 40, cy, x0 + 84 + i * 9, H - 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x0 + segW - 84 - i * 9, 20);
        ctx.quadraticCurveTo(cx + 40, cy, x0 + segW - 84 - i * 9, H - 20);
        ctx.stroke();
      }
      ctx.restore();
    }

    paintGrain(c, 10, 66);
    return toTexture(c.canvas, { aniso: 8 });
  });
}

/**
 * 斗拱专用彩画：青绿叠晕 + 金线 + 旋子。
 * 斗拱体量小、又处在檐下阴影中，因此配色比额枋彩画更亮，
 * 保证在小尺寸下仍能读出"青绿金"三色。
 */
export function dougongTexture(): Texture {
  return memo('dougongTex', () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const ctx = c.ctx;
    const cells = 4;
    const cs = S / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const blue = (i + j) % 2 === 0;
        const g = ctx.createLinearGradient(i * cs, j * cs, (i + 1) * cs, (j + 1) * cs);
        if (blue) {
          g.addColorStop(0, '#4f7fe0');
          g.addColorStop(0.55, '#2f5cc0');
          g.addColorStop(1, '#1e4292');
        } else {
          g.addColorStop(0, '#3fae86');
          g.addColorStop(0.55, '#248a67');
          g.addColorStop(1, '#14614a');
        }
        ctx.fillStyle = g;
        ctx.fillRect(i * cs, j * cs, cs, cs);
        // 金线分格
        ctx.strokeStyle = 'rgba(240,205,120,0.95)';
        ctx.lineWidth = 3;
        ctx.strokeRect(i * cs + 2, j * cs + 2, cs - 4, cs - 4);
        // 旋子
        const cx = i * cs + cs * 0.5;
        const cy = j * cs + cs * 0.5;
        paintScroll(ctx, cx, cy, cs * 0.3, 1.5, 'rgba(246,216,140,0.95)', 3, (i + j) * 0.7);
        ctx.fillStyle = 'rgba(255,244,210,0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    paintGrain(c, 8, 55);
    return toTexture(c.canvas, { aniso: 8 });
  });
}

/* ------------------------------------------------------------------ */
/* 4. 木作：朱红柱、椽望、墙体                                          */
/* ------------------------------------------------------------------ */

export function columnTexture(): Texture {
  return memo('column', () => {
    const c = makeCanvas(256, 512);
    fill(c, COLORS.cinnabar);
    const ctx = c.ctx;
    // 地仗层色差
    paintNoise(c, {
      count: 60,
      minR: 20,
      maxR: 80,
      colors: ['rgba(180,72,48,0.45)', 'rgba(96,26,16,0.5)', 'rgba(150,52,34,0.4)'],
      alpha: 0.35,
      seed: 4,
    });
    // 竖向木纹
    ctx.save();
    for (let i = 0; i < 120; i++) {
      const x = rnd() * 256;
      ctx.strokeStyle = `rgba(${60 + rnd() * 40},${18 + rnd() * 14},${12 + rnd() * 10},${0.15 + rnd() * 0.2})`;
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 8, 170, x + (rnd() - 0.5) * 8, 340, x, 512);
      ctx.stroke();
    }
    ctx.restore();
    paintGrain(c, 10, 77);
    return toTexture(c.canvas, { repeatX: 1, repeatY: 1, aniso: 8 });
  });
}

/** 椽望板 / 室内木构：深褐红 */
export function woodBeamTexture(): Texture {
  return memo('wood', () => {
    const c = makeCanvas(256, 256);
    fill(c, '#4a1c14');
    const ctx = c.ctx;
    paintNoise(c, {
      count: 40,
      minR: 10,
      maxR: 60,
      colors: ['rgba(110,50,32,0.5)', 'rgba(40,14,10,0.6)'],
      alpha: 0.4,
      seed: 15,
    });
    for (let i = 0; i < 90; i++) {
      const y = rnd() * 256;
      ctx.strokeStyle = `rgba(${30 + rnd() * 40},${12 + rnd() * 16},${8 + rnd() * 12},0.45)`;
      ctx.lineWidth = 0.6 + rnd() * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y + (rnd() - 0.5) * 10, 170, y + (rnd() - 0.5) * 10, 256, y);
      ctx.stroke();
    }
    paintGrain(c, 12, 88);
    return toTexture(c.canvas, { aniso: 8 });
  });
}

/** 朱红墙体（下碱 + 上身） */
export function redWallTexture(): Texture {
  return memo('wall', () => {
    const c = makeCanvas(512, 512);
    fill(c, COLORS.cinnabarDeep);
    const ctx = c.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#8d2c1c');
    g.addColorStop(0.72, '#7c2618');
    g.addColorStop(1, '#5d1c12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    paintNoise(c, {
      count: 70,
      minR: 18,
      maxR: 90,
      colors: ['rgba(160,64,42,0.4)', 'rgba(70,20,12,0.5)'],
      alpha: 0.3,
      seed: 19,
    });
    // 下碱石活（底部 12% 用青白石）
    ctx.fillStyle = '#8e8a80';
    ctx.fillRect(0, 512 * 0.9, 512, 512 * 0.1);
    ctx.fillStyle = 'rgba(40,38,34,0.6)';
    ctx.fillRect(0, 512 * 0.9, 512, 4);
    paintGrain(c, 12, 91);
    return toTexture(c.canvas, { aniso: 8 });
  });
}

/* ------------------------------------------------------------------ */
/* 5. 门窗格心（带 alpha 透空，供 alphaTest 使用）                       */
/* ------------------------------------------------------------------ */

/** 通用：在给定区域内画步步锦／菱花格心（透明底） */
function paintLattice(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cell: number,
  bar: number,
  light: string,
  dark: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // 横向棂条
  for (let yy = y; yy <= y + h; yy += cell) {
    ctx.fillStyle = dark;
    ctx.fillRect(x, yy, w, bar);
    ctx.fillStyle = light;
    ctx.fillRect(x, yy, w, bar * 0.45);
  }
  // 纵向棂条
  for (let xx = x; xx <= x + w; xx += cell) {
    ctx.fillStyle = dark;
    ctx.fillRect(xx, y, bar, h);
    ctx.fillStyle = light;
    ctx.fillRect(xx, y, bar * 0.4, h);
  }
  // 菱花：45° 斜棂
  ctx.strokeStyle = dark;
  ctx.lineWidth = bar * 0.85;
  const span = cell * 2;
  for (let d = -h; d < w + h; d += span) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + h, y + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
    ctx.stroke();
  }
  ctx.strokeStyle = light;
  ctx.lineWidth = bar * 0.35;
  for (let d = -h; d < w + h; d += span) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + h, y + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** 隔扇门一扇：上部格心透空、下部裙板实心 */
export function doorLeafTexture(): Texture {
  return memo('doorLeaf', () => {
    const W = 256;
    const H = 1024;
    const c = makeCanvas(W, H);
    const ctx = c.ctx;
    ctx.clearRect(0, 0, W, H);

    const frame = 16; // 边框宽度
    const wood = '#6f2417';
    const woodLight = '#a33c25';
    const gold = '#d8a437';

    // 边梃（外框）
    const drawFrame = (x: number, y: number, w: number, h: number) => {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, wood);
      g.addColorStop(0.35, woodLight);
      g.addColorStop(1, wood);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    };
    drawFrame(0, 0, W, frame);
    drawFrame(0, H - frame, W, frame);
    drawFrame(0, 0, frame, H);
    drawFrame(W - frame, 0, frame, H);
    // 抹头：格心与裙板之间（格心占上部约 2/3，裙板下部约 1/3）
    const bandY = Math.round(H * 0.66);
    drawFrame(0, bandY, W, frame);
    // 中槛（格心内再分一层横棂）
    drawFrame(0, Math.round(H * 0.06), W, frame * 0.7);

    // 格心（透空）
    paintLattice(ctx, frame, Math.round(H * 0.06) + frame * 0.7, W - frame * 2, bandY - Math.round(H * 0.06) - frame * 0.7, 40, 7, '#d9a45e', '#7a3a1e');

    // 裙板：实心，带金色回纹边框与云纹
    const py = bandY + frame;
    const ph = H - py - frame;
    const g2 = ctx.createLinearGradient(0, py, 0, py + ph);
    g2.addColorStop(0, '#8a2e1c');
    g2.addColorStop(0.5, '#7a2718');
    g2.addColorStop(1, '#5f1d12');
    ctx.fillStyle = g2;
    ctx.fillRect(frame, py, W - frame * 2, ph);

    ctx.strokeStyle = 'rgba(216,164,55,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(frame + 14, py + 14, W - frame * 2 - 28, ph - 28);
    ctx.strokeStyle = 'rgba(255,232,170,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(frame + 20, py + 20, W - frame * 2 - 40, ph - 40);

    // 云纹
    const ccx = W / 2;
    const ccy = py + ph / 2;
    paintScroll(ctx, ccx, ccy, 52, 1.5, 'rgba(216,164,55,0.75)', 4);
    paintScroll(ctx, ccx, ccy, 52, 1.5, 'rgba(255,238,190,0.45)', 1.6, Math.PI);
    ctx.save();
    ctx.strokeStyle = 'rgba(216,164,55,0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const sx = ccx + (i ? 46 : -46);
      ctx.beginPath();
      ctx.arc(sx, ccy, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 金色门钉/看叶点缀
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(W / 2, bandY + frame / 2, 7, 0, Math.PI * 2);
    ctx.fill();

    return toTexture(c.canvas, { repeatX: 1, repeatY: 1, aniso: 8 });
  });
}

/** 槛窗连续格心：无缝平铺、可整圈包裹（配合圆柱使用） */
export function latticeFillTexture(): Texture {
  return memo('latticeFill', () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const ctx = c.ctx;
    ctx.clearRect(0, 0, S, S);
    // 上下枋（实心）
    ctx.fillStyle = '#6f2417';
    ctx.fillRect(0, 0, S, 14);
    ctx.fillRect(0, S - 14, S, 14);
    ctx.fillStyle = 'rgba(216,164,55,0.75)';
    ctx.fillRect(0, 13, S, 2);
    ctx.fillRect(0, S - 16, S, 2);
    paintLattice(ctx, 0, 15, S, S - 30, 42, 7, '#caa06a', '#7a3a1e');
    return toTexture(c.canvas, { aniso: 8 });
  });
}

/* ------------------------------------------------------------------ */
/* 6. 御路石雕（云龙）                                                  */
/* ------------------------------------------------------------------ */

export function imperialRampTexture(): NormalTexSet {
  return memo('ramp', () => {
    const W = 256;
    const H = 512;
    const c = makeCanvas(W, H);
    const hgt = makeCanvas(W, H);
    fill(c, '#ded8cb');
    fill(hgt, '#909090');
    const ctx = c.ctx;
    const hctx = hgt.ctx;

    // 边框
    ctx.strokeStyle = 'rgba(120,114,104,0.7)';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    hctx.strokeStyle = '#ffffff';
    hctx.lineWidth = 8;
    hctx.strokeRect(12, 12, W - 24, H - 24);

    // 中央御路带
    ctx.save();
    hctx.save();
    for (let i = 0; i < 9; i++) {
      const y = 60 + i * 46;
      const cx = W / 2 + Math.sin(i * 1.7) * 22;
      // 云头
      ctx.beginPath();
      ctx.ellipse(cx, y, 62, 20, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(146,140,128,0.75)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      hctx.beginPath();
      hctx.ellipse(cx, y, 62, 20, 0, 0, Math.PI * 2);
      hctx.strokeStyle = '#ffffff';
      hctx.lineWidth = 5;
      hctx.stroke();
      // 卷云
      paintScroll(ctx, cx + 34, y + 4, 20, 1.3, 'rgba(146,140,128,0.8)', 3, i);
      paintScroll(hctx, cx + 34, y + 4, 20, 1.3, '#ffffff', 4, i);
      paintScroll(ctx, cx - 34, y - 4, 20, 1.3, 'rgba(146,140,128,0.8)', 3, -i);
      paintScroll(hctx, cx - 34, y - 4, 20, 1.3, '#ffffff', 4, -i);
    }
    ctx.restore();
    hctx.restore();
    paintGrain(c, 12, 101);

    return {
      map: toTexture(c.canvas, { aniso: 8 }),
      normalMap: toTexture(heightToNormal(hgt.canvas, 2.2), { srgb: false, aniso: 8 }),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 7. 室内金砖地面                                                      */
/* ------------------------------------------------------------------ */

export function interiorFloorTexture(): Texture {
  return memo('interior', () => {
    const c = makeCanvas(256, 256);
    fill(c, '#3b3a34');
    const ctx = c.ctx;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = i === j ? '#44433c' : '#3d3c36';
        ctx.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
      }
    }
    paintNoise(c, {
      count: 40,
      minR: 8,
      maxR: 40,
      colors: ['rgba(90,88,80,0.4)', 'rgba(30,30,26,0.5)'],
      alpha: 0.4,
      seed: 23,
    });
    paintGrain(c, 14, 111);
    const t = toTexture(c.canvas, { aniso: 8 });
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    return t;
  });
}

/** 供调试/统计：已生成的贴图数量 */
export function textureCount(): number {
  return cache.size;
}
