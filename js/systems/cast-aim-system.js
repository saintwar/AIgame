// ============================================================
// CastAimSystem — PHASE 21-1 v3.0 W1 D4
// ------------------------------------------------------------
// 阶段 2「抛竿落水」核心交互模块：
//   1) 蓄力期（state='aiming'）：
//        - 玩家按下空格瞬间锁定鼠标位置作为 landingPoint
//        - 渲染落点圈（双层环 + 中心十字 + 半透明填充）
//        - 渲染蓄力进度条（48×4 横条，颜色梯度 蓝→金→红）
//        - 落点圈半径按 §3.1 公式收缩：60 → 20 px（前快后慢 easeOutQuad）
//   2) 抛竿期（state='casting'）：
//        - 浮漂沿抛物线从 castFrom 飞向 landingPoint，0.5s 总时长
//        - 抛物线最高点在中点上方 30px：y(t) = lerp + 30 * sin(π*t)
//        - 完成后 isCastComplete()=true，由场景层调用 finishCast() 收尾
//        - 落水时机由场景层在抛物线完成瞬间触发 WaterSplashFX
//
// 设计原则（来自 Nina §5 「方案 B 并行新建」精神 + §9 实际代码适配）：
//   - 状态机 transition 字符串 / 状态名 全部沿用 v2.0（不动 fsm）
//   - 视觉层完全独立（旧 _renderAimBar / _renderCasting 直接不再调用）
//   - 蓄力机制改为按住时间累加（v2.0 是三角振荡，与 D4 §3.1 不兼容）
//   - 落点 = 鼠标位置（v2.0 三档固定 dist 砍掉）
//
// 单位约定：
//   - update(dt) 内部 dt 单位 **毫秒**（与 D1/D2 一致）
//   - 计时统一用 performance.now()（避免 dt 累加误差）
//
// 红线（来自 Nina §6）：
//   - 不实现落点偏移 ±15px 抖动（精准落点）
//   - 不实现过蓄力惩罚（≥1.5s 半径稳定 20px 不再变化）
//   - 8-bit 像素铁律：不写实/不Q萌/不 alpha 渐变填充/不描边圆角
//   - imageSmoothingEnabled = false 维持
//   - Playing 搏斗中不渲染（由场景层 _render 分支控制）
// ============================================================

// 蓄力时长锚点（ms）—— Nina §3.1
const CHARGE_FLAT_MS    = 300;    // 0~300ms 半径固定 60
const CHARGE_END_MS     = 1500;   // 300~1500ms 收缩到 20；≥1500 稳定 20
const RADIUS_MAX        = 60;     // 蓄力初始半径
const RADIUS_MIN        = 20;     // 蓄力极限半径

// 落点圈视觉 —— Nina §3.3
const LANDING_COLOR     = '#00E5FF';  // 青蓝
const LANDING_FILL_ALPHA = 0.15;
const LANDING_OUTER_ALPHA = 0.8;      // 外圈
const LANDING_INNER_ALPHA_BASE = 0.4; // 内圈基础（叠加呼吸）

// 蓄力进度条 —— Nina §3.2
const CHARGE_BAR_W = 48;
const CHARGE_BAR_H = 4;
const CHARGE_BAR_OFFSET_Y = 8;        // 阿明脚下偏上

// 抛物线 —— Nina §3.6
const CAST_DURATION_MS  = 500;
const CAST_ARC_PEAK_PX  = 30;         // 中点上方拱起像素

/**
 * easeOutQuad: t ∈ [0,1] → [0,1]，前快后慢
 */
function _easeOutQuad(t) {
  const inv = 1 - t;
  return 1 - inv * inv;
}

/**
 * 把 (clientX, clientY) 转 canvas 内坐标（修正 DPR/CSS 缩放）。
 * 与 D2 fish-group-hover-ui.js / click-to-move.js::screenToPixel 同套写法。
 */
function _eventToCanvas(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / Math.max(1, rect.width);
  const sy = canvas.height / Math.max(1, rect.height);
  return {
    x: (e.clientX - rect.left) * sx,
    y: (e.clientY - rect.top) * sy,
  };
}

export class CastAimSystem {
  constructor() {
    this.canvas = null;
    this.ctx = null;

    // 鼠标坐标（canvas 坐标系）
    this.mouseX = -1;
    this.mouseY = -1;

    // 状态：'idle' | 'aiming' | 'casting'
    //   - 'idle'：场景层处于 Idle / 非抛竿状态，本系统不渲染
    //   - 'aiming'：场景层处于 Aiming（蓄力中）
    //   - 'casting'：场景层处于 Casting（抛物线飞行中）
    //   注意：与 v2.0 fsm 状态名一致但 *小写*，本系统仅作为视觉层附属
    this.state = 'idle';

    // 蓄力数据
    this.aimStartMs = 0;          // 进入 aiming 的时间戳
    this.lockedLandingPoint = null; // 蓄力开始瞬间锁定的落点 {x,y}

    // 抛物线数据
    this.castStartMs = 0;
    this.castFromPoint = null;    // 抛物线起点 {x,y}（阿明手柄末端）
    this.castToPoint = null;      // 抛物线终点（= 锁定的 landingPoint）

    // 水域 polygon（占位；§3.5 兜底用 waterY 分界线）
    this.waterY = 0;              // canvas y 大于此值视为水面

    // 监听器引用（dispose 时解绑）
    this._mouseMoveHandler = null;
    this._mouseLeaveHandler = null;
  }

  /**
   * 初始化。
   * @param {Object} opts
   * @param {HTMLCanvasElement} opts.canvas
   * @param {CanvasRenderingContext2D} opts.ctx
   * @param {number} [opts.waterY=400] 水面分界线（canvas y 大于此视为水面，§3.5 兜底）
   */
  init({ canvas, ctx, waterY = 400 }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.waterY = waterY;

    this._mouseMoveHandler = (e) => {
      if (!this.canvas) return;
      const p = _eventToCanvas(this.canvas, e);
      this.mouseX = p.x;
      this.mouseY = p.y;
    };
    this._mouseLeaveHandler = () => {
      this.mouseX = -1;
      this.mouseY = -1;
    };
    canvas.addEventListener('mousemove', this._mouseMoveHandler);
    canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
  }

  /**
   * 玩家按下空格瞬间调用 → 进入 aiming，锁定鼠标位置为 landingPoint。
   *   - 鼠标若在水域外，会吸附到水域边缘最近点（§3.5 兜底）
   *   - 鼠标尚未进入 canvas（mouseX<0）→ 用屏幕中下方默认点
   */
  beginAim() {
    const lp = this._snapToWater(this.mouseX, this.mouseY);
    this.state = 'aiming';
    this.aimStartMs = performance.now();
    this.lockedLandingPoint = lp;
  }

  /**
   * 玩家松开空格瞬间调用 → 进入 casting，返回最终落点。
   * @param {{x:number, y:number}} castFromPoint 抛物线起点（阿明手柄末端，由场景层提供）
   * @returns {{x:number, y:number}} 最终落点（= 蓄力锁定的 landingPoint）
   */
  confirmCast(castFromPoint) {
    const lp = this.lockedLandingPoint || this._snapToWater(this.mouseX, this.mouseY);
    this.state = 'casting';
    this.castStartMs = performance.now();
    this.castFromPoint = { x: castFromPoint.x, y: castFromPoint.y };
    this.castToPoint = { x: lp.x, y: lp.y };
    return { x: lp.x, y: lp.y };
  }

  /**
   * 取消蓄力（玩家按 Q/ESC 退出 Aiming）。
   */
  cancelAim() {
    this.state = 'idle';
    this.lockedLandingPoint = null;
  }

  /**
   * 抛物线飞行是否完成（场景层每帧检查，true 则触发水花并 transition Waiting 前置）。
   */
  isCastComplete() {
    if (this.state !== 'casting') return false;
    return (performance.now() - this.castStartMs) >= CAST_DURATION_MS;
  }

  /**
   * 抛物线动画结束 / 水花触发后调用，回到 idle 等待下一次抛竿。
   */
  finishCast() {
    this.state = 'idle';
    this.castFromPoint = null;
    this.castToPoint = null;
    this.lockedLandingPoint = null;
  }

  /**
   * 取当前浮漂位置（抛物线插值；非 casting 状态返回锁定 landingPoint 或 null）。
   */
  getCurrentBobPos() {
    if (this.state === 'casting' && this.castFromPoint && this.castToPoint) {
      const elapsed = performance.now() - this.castStartMs;
      const t = Math.max(0, Math.min(1, elapsed / CAST_DURATION_MS));
      const x = this.castFromPoint.x + (this.castToPoint.x - this.castFromPoint.x) * t;
      const y0 = this.castFromPoint.y + (this.castToPoint.y - this.castFromPoint.y) * t;
      const y = y0 - CAST_ARC_PEAK_PX * Math.sin(Math.PI * t);
      return { x, y };
    }
    if (this.castToPoint) return { ...this.castToPoint };
    return null;
  }

  /**
   * 蓄力进度（0~1，对应落点圈半径收缩 0~100%；clamp 后含 0.3s 平台 + 1.5s 末段平台）。
   */
  getChargeProgress() {
    if (this.state !== 'aiming') return 0;
    const elapsed = performance.now() - this.aimStartMs;
    if (elapsed <= CHARGE_FLAT_MS) return 0;
    if (elapsed >= CHARGE_END_MS) return 1;
    return (elapsed - CHARGE_FLAT_MS) / (CHARGE_END_MS - CHARGE_FLAT_MS);
  }

  /**
   * 落点圈当前半径（按 §3.1 公式 60 - 40 * easeOutQuad）。
   */
  getLandingCircleRadius() {
    return RADIUS_MAX - (RADIUS_MAX - RADIUS_MIN) * _easeOutQuad(this.getChargeProgress());
  }

  /**
   * 蓄力进度条比例（0~1，含 0.3s 起跑 + 1.5s 终止；按 elapsed/CHARGE_END_MS 线性，
   * 让玩家在前期就能看到进度而不是等 0.3s 平台后才动）。
   */
  getChargeBarRatio() {
    if (this.state !== 'aiming') return 0;
    const elapsed = performance.now() - this.aimStartMs;
    return Math.max(0, Math.min(1, elapsed / CHARGE_END_MS));
  }

  // ────────────────────────────────────────────────────────────
  // 内部：水域吸附（§3.5 兜底版本——按 waterY 分界线判定）
  // ────────────────────────────────────────────────────────────
  _snapToWater(mx, my) {
    if (mx < 0 || my < 0 || !this.canvas) {
      // 没鼠标 → 用 canvas 中下默认（阿明站位前方水域）
      return { x: (this.canvas?.width || 1280) * 0.6, y: (this.canvas?.height || 720) * 0.6 };
    }
    let x = mx, y = my;
    // 水域 = y >= waterY 的下方区域；水平在 canvas 内即可
    if (y < this.waterY) y = this.waterY;
    if (x < 0) x = 0;
    if (this.canvas && x > this.canvas.width) x = this.canvas.width;
    if (this.canvas && y > this.canvas.height) y = this.canvas.height;
    return { x, y };
  }

  // ────────────────────────────────────────────────────────────
  // update 占位（视觉计时全用 performance.now()，update 主要驱动空闲检查）
  // 当前无内部计时累积，保留接口以便后续扩展（如 alpha 动画）
  // ────────────────────────────────────────────────────────────
  update(_dt) {
    // 当前所有计时基于 performance.now()，update 内无需累积；保留入参便于未来扩展
  }

  // ────────────────────────────────────────────────────────────
  // 渲染
  // ────────────────────────────────────────────────────────────
  render() {
    if (!this.ctx) return;
    if (this.state === 'aiming') {
      this._renderLandingCircle();
    } else if (this.state === 'casting') {
      this._renderCastingBob();
    }
  }

  /**
   * 渲染蓄力进度条（独立调用入口；场景层在阿明角色脚下传入 charX/charY）。
   * @param {number} charX 阿明角色屏幕 x（charY 上方 8+barH 处画条）
   * @param {number} charY 阿明角色脚下屏幕 y
   */
  renderChargeBar(charX, charY) {
    if (this.state !== 'aiming' || !this.ctx) return;
    const ctx = this.ctx;
    const ratio = this.getChargeBarRatio();
    const x = Math.round(charX - CHARGE_BAR_W / 2);
    const y = Math.round(charY - CHARGE_BAR_OFFSET_Y - CHARGE_BAR_H);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 1px 白色描边
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, CHARGE_BAR_W + 1, CHARGE_BAR_H + 1);

    // 底色：黑色（让进度色更清晰）
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, CHARGE_BAR_W, CHARGE_BAR_H);

    // 进度色：分段切换 蓝/金/红
    let color = '#4FC3F7';
    if (ratio >= 0.66) color = '#FF5252';
    else if (ratio >= 0.33) color = '#FFD700';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.round(CHARGE_BAR_W * ratio), CHARGE_BAR_H);

    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  // 落点圈渲染（§3.3）
  // ────────────────────────────────────────────────────────────
  _renderLandingCircle() {
    const lp = this.lockedLandingPoint;
    if (!lp) return;
    const ctx = this.ctx;
    const r = this.getLandingCircleRadius();
    const cx = Math.round(lp.x);
    const cy = Math.round(lp.y);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 半透明圆形填充（alpha=0.15，§3.3 严禁渐变）
    ctx.globalAlpha = LANDING_FILL_ALPHA;
    ctx.fillStyle = LANDING_COLOR;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 外圈：2px 实线 stroke alpha=0.8
    ctx.globalAlpha = LANDING_OUTER_ALPHA;
    ctx.strokeStyle = LANDING_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 内圈：1px 半透明 alpha=0.4 + 呼吸闪烁（0.6s 周期）
    const breath = 0.5 + 0.5 * Math.sin(performance.now() / 600 * Math.PI);
    ctx.globalAlpha = LANDING_INNER_ALPHA_BASE * breath + 0.2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, r - 4), 0, Math.PI * 2);
    ctx.stroke();

    // 中心十字准星（4×4，横竖各 4px 短线）
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = LANDING_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy + 0.5);
    ctx.lineTo(cx + 2, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - 2);
    ctx.lineTo(cx + 0.5, cy + 2);
    ctx.stroke();

    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  // 抛物线浮漂渲染（§3.6） — 用 4×4 红白方块占位（与 v2.0 _drawPixelBob 风格一致）
  // ────────────────────────────────────────────────────────────
  _renderCastingBob() {
    const pos = this.getCurrentBobPos();
    if (!pos) return;
    const ctx = this.ctx;
    const px = Math.round(pos.x);
    const py = Math.round(pos.y);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 鱼线：从 castFromPoint 直线到当前位置（简化，不画弧）
    if (this.castFromPoint) {
      ctx.strokeStyle = 'rgba(120,120,120,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(this.castFromPoint.x), Math.round(this.castFromPoint.y));
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    // 浮漂：上半红下半白（4×4 像素方块拼）
    ctx.fillStyle = '#E53935';
    ctx.fillRect(px - 2, py - 4, 4, 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(px - 2, py, 4, 4);
    // 1px 黑色描边
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 2.5, py - 4.5, 5, 9);

    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  // 销毁：解绑监听器，置空引用
  // ────────────────────────────────────────────────────────────
  dispose() {
    if (this.canvas && this._mouseMoveHandler) {
      this.canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    }
    if (this.canvas && this._mouseLeaveHandler) {
      this.canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
    }
    this._mouseMoveHandler = null;
    this._mouseLeaveHandler = null;
    this.canvas = null;
    this.ctx = null;
    this.state = 'idle';
    this.lockedLandingPoint = null;
    this.castFromPoint = null;
    this.castToPoint = null;
  }
}
