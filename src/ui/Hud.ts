/**
 * Hud.ts —— 界面层
 * ------------------------------------------------------------------
 * · 左下：控制按钮（爆炸/重组、自动环绕、AO、阴影、复位视角）
 * · 左上：标题卡与结构说明
 * · 右上：实时统计（FPS / draw call / 三角面）
 * · 载入遮罩与进度条
 */
export interface HudCallbacks {
  onToggleExplode(): void;
  onToggleOrbit(): void;
  onToggleAO(): void;
  onToggleShadows(): void;
  onResetView(): void;
}

interface ButtonDef {
  id: string;
  label: string;
  hint: string;
  action: keyof HudCallbacks;
  active?: boolean;
}

const BUTTONS: ButtonDef[] = [
  { id: 'explode', label: '爆炸视图', hint: 'Space', action: 'onToggleExplode' },
  { id: 'orbit', label: '自动环绕', hint: 'O', action: 'onToggleOrbit', active: false },
  { id: 'ao', label: '环境光遮蔽', hint: 'A', action: 'onToggleAO', active: true },
  { id: 'shadow', label: '阴影', hint: 'S', action: 'onToggleShadows', active: true },
  { id: 'reset', label: '复位视角', hint: 'R', action: 'onResetView' },
];

export class Hud {
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly statsEl: HTMLElement;
  private readonly loader: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly stepLabel: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;

  constructor(cb: HudCallbacks) {
    const wrap = document.getElementById('controls');
    if (!wrap) throw new Error('#controls 缺失');
    for (const def of BUTTONS) {
      const btn = document.createElement('button');
      btn.className = 'ctl-btn';
      btn.dataset.active = def.active ? 'true' : 'false';
      btn.innerHTML = `<span class="ctl-label">${def.label}</span><span class="ctl-hint">${def.hint}</span>`;
      btn.addEventListener('click', () => cb[def.action]());
      wrap.appendChild(btn);
      this.buttons.set(def.id, btn);
    }

    this.statsEl = must('stats');
    this.loader = must('loader');
    this.bar = must('loader-bar');
    this.stepLabel = must('loader-step');
    this.toast = must('toast');
  }

  private set(id: string, active: boolean, label?: string): void {
    const btn = this.buttons.get(id);
    if (!btn) return;
    btn.dataset.active = active ? 'true' : 'false';
    if (label) {
      const el = btn.querySelector('.ctl-label');
      if (el) el.textContent = label;
    }
  }

  setExploded(v: boolean): void {
    this.set('explode', v, v ? '重组复位' : '爆炸视图');
  }

  setOrbit(v: boolean): void {
    this.set('orbit', v);
  }

  setAO(v: boolean): void {
    this.set('ao', v);
  }

  setShadows(v: boolean): void {
    this.set('shadow', v);
  }

  setStats(fps: number, calls: number, tris: number): void {
    this.statsEl.textContent = `${fps.toFixed(0)} FPS · ${calls} draw calls · ${(tris / 1000).toFixed(0)}k 三角面`;
  }

  setProgress(p: number, label: string): void {
    this.bar.style.width = `${Math.round(p * 100)}%`;
    this.stepLabel.textContent = label;
  }

  hideLoader(): void {
    this.loader.classList.add('done');
    window.setTimeout(() => this.loader.remove(), 700);
  }

  notify(msg: string): void {
    this.toast.textContent = msg;
    this.toast.dataset.show = 'true';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.dataset.show = 'false';
    }, 1800);
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 缺失`);
  return el;
}
