// ============================================================
// WaterSplashFX — PHASE 21-1 v3.0 W1 D4
// ------------------------------------------------------------
// 浮漂触水反馈：水花 3 帧 + 涟漪 3 圈错峰扩散，总时长 1.2s。
//
// 主美规格（Nina §4）：
//   水花（Splash）：
//     - 7 颗 2×2 px 方块（中心 1 + 外围 6，奇数防对称）
//     - 颜色配比：3 颗 #FFFFFF + 3 颗 #C0E5F0 + 1 颗 #7FB8C8
//     - 3 帧每帧 0.10s，共 0.30s：
//         F1 (0.00~0.10s): y偏移 -4px,  散开 r=6  起溅
//         F2 (0.10~0.20s): y偏移 -10px, 散开 r=12 顶点
//         F3 (0.20~0.30s): y偏移 -2px,  收拢 r=8  落回；仅 #7FB8C8 那 1 颗保留
//     - 重力感：F3 砍掉上半部分点（angle ∈ [0, π] 即下半圈）
//
//   涟漪（Ripple）：
//     - 3 圈同心圆，1px stroke，禁止填充
//     - 半径 8 → 24 → 40 px（从内到外，三圈各自固定半径）
//     - 颜色统一 #C0E5F0
//     - 离散 alpha 三档：1.0 / 0.6 / 0.3（禁连续渐变）
//     - 错峰节奏（避免 3 圈同时叠在一起糊）：
//         t=0.00s 第1圈出现（r=8,  alpha=1.0），持续 0.4s 后消失
//         t=0.40s 第2圈出现（r=24, alpha=0.6），持续 0.4s 后消失
//         t=0.80s 第3圈出现（r=40, alpha=0.3），持续 0.4s 后消失
//         t=1.20s 全部结束 → 进入 v2.0 Waiting
//     - 像素吸附：半径 Math.round() 避免亚像素抖动
//     - 必须 ctx.stroke() + lineWidth=1，禁 ctx.arc()+fill()+渐变
//
// 红线（Nina §6）：
//   - 8-bit 像素铁律：不写实/不Q萌/不 alpha 渐变填充/不描边圆角
//   - 涟漪必须 stroke + 1px + 离散 alpha 三档
//   - 水花必须 2×2 离散方块，禁圆形粒子
//   - imageSmoothingEnabled = false 维持
//
// 使用方式：
//   const fx = new WaterSplashFX();
//   fx.init({ canvas, ctx });
//   fx.trigger(landingX, landingY);  // 抛物线终点触发
//   fx.update(dt);                    // 每帧更新（dt 单位毫秒）
//   fx.render();                      // 在场景渲染层调用
//   fx.isActive();                    // true=动画进行中，false=已结束
// ============================================================

// 总时长（ms）
const FX_DURATION_MS = 1200;

// 水花帧时长（ms）
const SPLASH_FRAME_MS = 100;

// 水花颜色配置（7 颗）
const SPLASH_COLORS = [
  '#FFFFFF', '#FFFFFF', '#FFFFFF',         // 3 颗白
  '#C0E5F0', '#C0E5F0', '#C0E5F0',         // 3 颗淡蓝白
  '#7FB8C8',                                // 1 颗暗蓝（F3 唯一保留）
];

// 7 颗粒子均匀分布角度（中心 1 + 外围 6 = 7 颗 → 1 颗在原点，6 颗均布于圆周）
//   index 0 视为中心，index 1~6 视为外围 60° 间隔
const SPLASH_PARTICLE_COUNT = 7;

// 水花 3 帧关键帧规格
const SPLASH_FRAMES = [
  { yOff: -4,  radius: 6,  filterSurvivor: false },  // F1
  { yOff: -10, radius: 12, filterSurvivor: false },  // F2 顶点
  { yOff: -2,  radius: 8,  filterSurvivor: true  },  // F3 仅暗色生还，下半圈
];

// 涟漪 3 圈规格（按错峰顺序）
const RIPPLE_CIRCLES = [
  { startMs: 0,    durationMs: 400, radius: 8,  alpha: 1.0 },
  { startMs: 400,  durationMs: 400, radius: 24, alpha: 0.6 },
  { startMs: 800,  durationMs: 400, radius: 40, alpha: 0.3 },
];

const RIPPLE_COLOR = '#C0E5F0';

export class WaterSplashFX {
  constructor() {
    this.canvas = null;
    this.ctx = null;

    this.active = false;
    this.x = 0;
    this.y = 0;
    this.startMs = 0;
  }

  init({ canvas, ctx }) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /**
   * 在 (x, y) 触发一次水花+涟漪动画。
   * 若已有动画进行中，会被新触发覆盖（适合「连续抛竿」场景）。
   */
  trigger(x, y) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.startMs = performance.now();
  }

  /**
   * 是否动画进行中（场景层据此决定何时 transition 到 Waiting）。
   */
  isActive() {
    if (!this.active) return false;
    if (performance.now() - this.startMs >= FX_DURATION_MS) {
      this.active = false;
      return false;
    }
    return true;
  }

  /**
   * 更新（dt 单位毫秒；当前所有计时基于 startMs，update 主要做超时检查）。
   */
  update(_dt) {
    // 计时基于 performance.now() 与 startMs 差值，无需 dt 累加
    if (this.active && performance.now() - this.startMs >= FX_DURATION_MS) {
      this.active = false;
    }
  }

  /**
   * 渲染（场景层在浮漂层之上调用，与 buildings 同层级 / UI 之下）。
   */
  render() {
    if (!this.active || !this.ctx) return;
    const elapsed = performance.now() - this.startMs;
    if (elapsed >= FX_DURATION_MS) {
      this.active = false;
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    this._renderSplash(elapsed);
    this._renderRipples(elapsed);

    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  // 水花 3 帧
  // ────────────────────────────────────────────────────────────
  _renderSplash(elapsed) {
    if (elapsed >= SPLASH_FRAME_MS * 3) return;  // 0.30s 后结束
    const frameIdx = Math.min(2, Math.floor(elapsed / SPLASH_FRAME_MS));
    const frame = SPLASH_FRAMES[frameIdx];
    const ctx = this.ctx;

    for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
      const color = SPLASH_COLORS[i];
      // F3 仅 #7FB8C8（index 6）那颗保留，其他 6 颗消失
      if (frame.filterSurvivor && color !== '#7FB8C8') continue;

      let px, py;
      if (i === 0) {
        // 中心粒子（仅 F1/F2 显示）
        if (frame.filterSurvivor) continue;
        px = this.x;
        py = this.y + frame.yOff;
      } else {
        // 外围 6 颗均布 60° 间隔（index 1~6 → angle 0/60/120/180/240/300）
        let angle = ((i - 1) * Math.PI * 2) / 6;
        // F3 重力感：仅画下半圈（angle ∈ [0, π]）
        if (frame.filterSurvivor && (angle < 0 || angle > Math.PI)) continue;
        px = this.x + Math.cos(angle) * frame.radius;
        py = this.y + frame.yOff + Math.sin(angle) * frame.radius;
      }

      // 像素吸附（取整避免亚像素）
      const fx = Math.round(px) - 1;
      const fy = Math.round(py) - 1;
      ctx.fillStyle = color;
      ctx.fillRect(fx, fy, 2, 2);
    }
  }

  // ────────────────────────────────────────────────────────────
  // 涟漪 3 圈错峰
  // ────────────────────────────────────────────────────────────
  _renderRipples(elapsed) {
    const ctx = this.ctx;
    const cx = Math.round(this.x);
    const cy = Math.round(this.y);

    for (const circle of RIPPLE_CIRCLES) {
      const t = elapsed - circle.startMs;
      if (t < 0 || t >= circle.durationMs) continue;
      ctx.globalAlpha = circle.alpha;
      ctx.strokeStyle = RIPPLE_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.round(circle.radius), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  /**
   * 清空状态（场景 destroy 时调用，配合释放引用）。
   */
  dispose() {
    this.active = false;
    this.canvas = null;
    this.ctx = null;
  }
}
