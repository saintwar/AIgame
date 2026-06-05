// PHASE 21-1 D5 P0「放大镜」v2 渲染器
//
// 权威源：docs/PHASE-21-1-D5-magnifier-impl-spec.md v1.0（老板拍板版）
//
// 职责：
//   - 落水进 Waiting + 150ms 淡入出现；提竿（离开 Waiting/BiteWindow）立即消失
//   - 圆形 180×180，4× 最近邻整数放大；中心锁定浮漂屏幕坐标（含 D5 抖动/沉水偏移）
//   - 位置：动态取反侧（浮漂在左半屏 → 镜放右，反之亦然）+ 边缘 clamp
//   - 内容：放大同一个浮漂（shake 镜内同步抖，sink 镜内画水下剪影）
//   - S2 微动：等待期镜内 ±1~2px 正弦微浮 + 每 4~8s 一圈涟漪
//   - S3 punch 不实施（咬钩反馈由 D5 主系统独占）
//
// 接入：
//   - 在 D5BiteFeedback 内持有实例；update(dt) 与 render(ctx) 由 D5 调度
//   - 离开 Waiting/BiteWindow 时自动不画；reset 时显式 hide() 兜底
//
// 红线（不可违反）：
//   - 不持有独立浮漂状态（数据源 = scene.bobX/bobY + d5.getBobOffset()）
//   - 不画鱼线 / 水波细节（180px 窗口防信息过载）
//   - Z-order 在浮漂/剪影/鱼线之上，但在 PERFECT/可惜文字之下（外层 D5 render 排序）
//   - 主画面浮漂逻辑零改动

import { drawUnderwaterBob } from './underwater-bob-renderer.js';

// ─────────────────────────────────────────────────────────────
// 常量（spec §10 可调参数表）
// ─────────────────────────────────────────────────────────────
const MAGNIFIER_DELAY = 150;   // ms，进 Waiting 到淡入出现的延迟
const MAGNIFIER_SIZE  = 200;   // px，圆形直径（v2.0.1 调整 180→200）
const MAGNIFIER_R     = 100;   // px，半径
const MAGNIFIER_ZOOM  = 4;     // × 放大倍率
const FADE_IN_MS      = 70;    // 50~80ms 淡入
const FADE_OUT_MS     = 180;   // 消失：往下滑出动画时长（v2.0.1，原 40ms 即焚改为下滑消失）

// 偏置：漂半宽 (~9) + 镜半径 (100) + 留白 (16) ≈ 125
const MAGNIFIER_OFFSET = 125;

// S2 等待期微浮：±1px，周期 2s（v2.0.1 幅度减半 2→1）
const IDLE_BOB_AMP_PX     = 1;
const IDLE_BOB_PERIOD_MS  = 2000;
// 镜内浮漂"上下浮动"视觉系数：所有 dy 偏移在镜内显示时乘这个（v2.0.1 = 0.5 减半）
const MAGNIFIER_DY_SCALE  = 0.5;
// v2.0.1 中鱼（咬钩瞬间）镜片自身抖动：随机偏移 ±BITE_SHAKE_AMP，持续 BITE_SHAKE_MS
const BITE_SHAKE_MS       = 240;
const BITE_SHAKE_AMP      = 4;
// S2 偶发涟漪：每 4~8s 一圈
const IDLE_RIPPLE_MIN_MS  = 4000;
const IDLE_RIPPLE_MAX_MS  = 8000;
const IDLE_RIPPLE_DUR_MS  = 900; // 单圈寿命

// 边框颜色（沿用 D5 色板风格）
//   2026-06-05：删除 HILIGHT_COLOR —— 弧形高光被误识为读条，已移除绘制
const FRAME_COLOR     = '#FFE4B5';  // 金边
const FRAME_DARK      = '#8B6914';  // 内描边
const VIGNETTE_COLOR  = 'rgba(0,0,0,0.35)';

// 2026-06-05：放大镜下方"放弃"胶囊按钮
//   形态：胶囊（圆角矩形，宽约 96 高约 32）
//   位置：浮漂（= 放大镜中心）正下方，距镜底 GAP；越界时翻到镜身正上方
//   显示：放大镜可见时始终显示；任何状态都可点 → 触发 _resetToIdle
//   刺鱼按钮已移除（保留键盘空格 / 点鱼触发）—— 老板裁定避免误操作
const ABANDON_BTN_W      = 96;
const ABANDON_BTN_H      = 32;
const ABANDON_BTN_GAP    = 14;   // 胶囊与镜身间距
const ABANDON_BTN_BG     = '#E74C3C';
const ABANDON_BTN_BG_HOV = '#FF6B5C';
const ABANDON_BTN_DARK   = '#922B21';
const ABANDON_BTN_TEXT   = '#FFF4D6';
const ABANDON_BTN_FONT   = 16;

// ─────────────────────────────────────────────────────────────
// D5Magnifier
// ─────────────────────────────────────────────────────────────
export class D5Magnifier {
  /**
   * @param {object} scene FishingScene 反向引用
   *   读取：scene.fsm / scene.bobX / scene.bobY / scene.cw / scene.ch / scene.d5
   */
  constructor(scene) {
    this.scene = scene;
    this._waitingEnterMs = -1;     // 进 Waiting 那一刻（_frameTime），-1=不在 Waiting
    this._visibleSince  = -1;      // 完全淡入完成时间戳（用于淡出动画起点参考）
    this._hideAt        = -1;      // 主动 hide() 触发的淡出起点；-1=未触发
    this._wasInActiveState = false;// 上一帧是否在 Waiting/BiteWindow，用于边沿检测
    this._wasInBiteWindow  = false;// 上一帧是否在 BiteWindow（用于咬钩瞬间边沿）
    this._biteShakeUntil   = -1;   // 镜片自身抖动结束时间（咬钩瞬间触发）
    this._frameTime     = 0;       // 自创建累计 ms（与 D5 _frameTime 解耦，自行计时）

    // S2 涟漪调度
    this._nextRippleAt = -1;       // 下一圈涟漪触发时间（ms）
    this._activeRipple = null;     // { startMs }，仅 1 圈活跃

    // 2026-06-05："放弃"胶囊按钮状态
    this._lastRenderedCx = -9999;  // 上一帧镜中心 X
    this._lastRenderedCy = -9999;  // 上一帧镜中心 Y
    this._lastAlpha      = 0;      // 上一帧 alpha（hit-test 只在 alpha>=1 时有效）
    this._abandonBtnHovered = false;
    this._lastAbandonRect = null;  // 上一帧按钮 AABB（含越界保护后的实际位置）
  }

  /**
   * 2026-06-05：计算"放弃"胶囊 AABB
   *   默认位置：浮漂（镜身）正下方
   *   越界保护：
   *     - 下方放不下（cy + R + GAP + H > ch - 4）→ 翻到镜身正上方
   *     - 左右居中后超出画幅左/右边 → 水平 clamp 贴边
   */
  _computeAbandonRect(cx, cy) {
    const cw = this.scene.cw;
    const ch = this.scene.ch;
    const w = ABANDON_BTN_W;
    const h = ABANDON_BTN_H;
    const pad = 4;
    // 默认水平居中
    let x = Math.round(cx - w / 2);
    // 默认放在镜身下方
    let y = Math.round(cy + MAGNIFIER_R + ABANDON_BTN_GAP);
    // 下方越界 → 翻到镜身上方
    if (y + h > ch - pad) {
      y = Math.round(cy - MAGNIFIER_R - ABANDON_BTN_GAP - h);
    }
    // 水平 clamp（极端：浮漂贴左/右边时）
    if (x < pad) x = pad;
    if (x + w > cw - pad) x = cw - pad - w;
    return { x, y, w, h };
  }

  // 2026-06-05：暴露"放弃"按钮 AABB（任何状态可点）
  //   返回 null 表示不可点（淡入淡出期 alpha<0.95）
  getAbandonBtnRect() {
    if (this._lastAlpha < 0.95) return null;
    return this._lastAbandonRect;
  }
  // 兼容旧调用：fishing-scene 仍调 getRecallBtnRect / setRecallBtnHovered，全部转给 abandon
  getRecallBtnRect() { return this.getAbandonBtnRect(); }
  setAbandonBtnHovered(v) { this._abandonBtnHovered = !!v; }
  setRecallBtnHovered(v) { this._abandonBtnHovered = !!v; }

  /** 离开 Waiting/BiteWindow 时显式调用，立即开始淡出（reset 也调） */
  hide() {
    if (this._hideAt < 0 && this._waitingEnterMs >= 0) {
      this._hideAt = this._frameTime;
    }
    // 极端：还没触发出现就被 hide，直接归零
    this._waitingEnterMs = -1;
    this._visibleSince = -1;
    this._nextRippleAt = -1;
    this._activeRipple = null;
  }

  /** 由 D5BiteFeedback.update(dt) 串调 */
  update(dt) {
    this._frameTime += dt * 1000;
    const inActive = this._isInActiveState();

    // 边沿：非活跃 → Waiting/BiteWindow 入口 = 进 Waiting 时刻（记 150ms 计时起点）
    if (!this._wasInActiveState && inActive) {
      this._waitingEnterMs = this._frameTime;
      this._hideAt = -1;
      this._visibleSince = -1;
      // 首圈涟漪：进 Waiting 后 IDLE_RIPPLE_MIN_MS~MAX 后触发
      this._nextRippleAt = this._frameTime + IDLE_RIPPLE_MIN_MS +
        Math.random() * (IDLE_RIPPLE_MAX_MS - IDLE_RIPPLE_MIN_MS);
      this._activeRipple = null;
    }

    // 边沿：活跃 → 非活跃 = 离开 Waiting/BiteWindow 任意路径 → 自动 hide
    if (this._wasInActiveState && !inActive) {
      this.hide();
    }

    // 边沿：Waiting → BiteWindow（鱼咬钩瞬间）= 镜片自身抖动 BITE_SHAKE_MS
    const inBiteWindow = this.scene.fsm.is('BiteWindow');
    if (!this._wasInBiteWindow && inBiteWindow) {
      this._biteShakeUntil = this._frameTime + BITE_SHAKE_MS;
    }
    this._wasInBiteWindow = inBiteWindow;

    this._wasInActiveState = inActive;

    // S2 涟漪调度（只在 Waiting 期且未咬钩时触发，BiteWindow 期不再起新涟漪）
    if (inActive && this.scene.fsm.is('Waiting')) {
      if (this._activeRipple && this._frameTime - this._activeRipple.startMs > IDLE_RIPPLE_DUR_MS) {
        this._activeRipple = null;
      }
      if (!this._activeRipple && this._nextRippleAt > 0 && this._frameTime >= this._nextRippleAt) {
        this._activeRipple = { startMs: this._frameTime };
        this._nextRippleAt = this._frameTime + IDLE_RIPPLE_MIN_MS +
          Math.random() * (IDLE_RIPPLE_MAX_MS - IDLE_RIPPLE_MIN_MS);
      }
    }

    // 淡出彻底完成 → 复位状态
    if (this._hideAt >= 0 && this._frameTime - this._hideAt > FADE_OUT_MS) {
      this._hideAt = -1;
    }
  }

  /** 由 D5BiteFeedback.render(ctx) 串调，应在 PERFECT/可惜字之前调用 */
  render(ctx) {
    const alpha = this._currentAlpha();
    if (alpha <= 0) return;

    // 镜中心 = 浮漂屏幕中心 + D5 抖动/沉水偏移 + D14 前戏 dx/dy（Waiting 期）
    const d5 = this.scene.d5;
    const d5Off = d5 && typeof d5.getBobOffset === 'function'
      ? d5.getBobOffset()
      : { dx: 0, dy: 0, hidden: false };
    // PHASE 21-1 D14 hotfix：Waiting 期叠加前戏 dx/dy（试探/偷吃浮漂晃动）
    //   合并到 off.dx/dy，让镜底 copy 中心点 + 镜内浮漂位置都跟着前戏晃动
    let preDx = 0, preDy = 0;
    if (this.scene.fsm.is('Waiting') &&
        this.scene.fishGroupSystem &&
        typeof this.scene.fishGroupSystem.getBobberPreBiteOffset === 'function') {
      const pre = this.scene.fishGroupSystem.getBobberPreBiteOffset();
      preDx = pre.dx; preDy = pre.dy;
    }
    const off = {
      dx: d5Off.dx + preDx,
      dy: d5Off.dy + preDy,
      hidden: d5Off.hidden,
    };
    const bobScreenX = this.scene.bobX + off.dx;
    const bobScreenY = this.scene.bobY + off.dy;

    // 反侧 + clamp 计算镜中心
    let { cx, cy } = this._computeMagnifierCenter(bobScreenX);

    // v2.0.1 消失：往正下方滑出（cy 在淡出期累加，缓出曲线，符合"被推下去"的物理感）
    //   alpha 由 _currentAlpha() 同步衰减；最终滑出 ~一个直径距离让镜体彻底离开视线
    if (this._hideAt >= 0) {
      const dt = this._frameTime - this._hideAt;
      const p = Math.min(1, dt / FADE_OUT_MS);
      const slideP = p * p; // easeInQuad
      cy += slideP * (MAGNIFIER_R * 2 + 24);
    }

    // v2.0.1 中鱼瞬间镜片自身抖动 —— 用户回滚（镜体本身保持稳定，镜内浮漂随 D5 dy 抖动已足够）
    // 抖动偏移改为只作用于"镜内浮漂"，不动镜框
    let biteShakeInnerDx = 0, biteShakeInnerDy = 0;
    if (this._frameTime < this._biteShakeUntil) {
      biteShakeInnerDx = Math.round(Math.random() * BITE_SHAKE_AMP * 2 - BITE_SHAKE_AMP);
      biteShakeInnerDy = Math.round(Math.random() * BITE_SHAKE_AMP * 2 - BITE_SHAKE_AMP);
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // ─── 1. 圆形裁切区，画放大内容 ───
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, MAGNIFIER_R, 0, Math.PI * 2);
    ctx.clip();

    // 1a. 镜底背景：v2.0.4 从场景的 _bgCacheCanvas（纯背景层，不含鱼影/鱼线/浮漂）
    //   1:1 copy 浮漂周围一块矩形作为底图 —— 真实水面色调和波纹
    this._drawMagnifierBg(ctx, cx, cy, bobScreenX, bobScreenY);

    // 1b. 放大浮漂（shake → 主浮漂 ×4 / sink → 水下剪影 ×4）
    //   叠加咬钩瞬间的镜内浮漂自抖（不抖镜框）
    this._drawZoomedBob(ctx, cx + biteShakeInnerDx, cy + biteShakeInnerDy, bobScreenX, bobScreenY, off);

    // 1c. S2 涟漪（仅 Waiting 期）
    if (this.scene.fsm.is('Waiting') && this._activeRipple) {
      this._drawIdleRipple(ctx, cx, cy);
    }

    ctx.restore(); // 解除圆形裁切

    // ─── 2. 镜片装饰（边框/高光/暗角） ───
    this._drawFrame(ctx, cx, cy);

    // ─── 3. "放弃"胶囊按钮（2026-06-05）───
    //   位置：浮漂正下方；下方越界则翻到上方；水平 clamp
    this._drawAbandonBtn(ctx, cx, cy);

    ctx.restore();

    // 记录给 fishing-scene click hit-test 用（含 hide 下滑位移）
    this._lastRenderedCx = cx;
    this._lastRenderedCy = cy;
    this._lastAlpha = alpha;
  }

  // ─────────────────────────────────────────────
  // 内部
  // ─────────────────────────────────────────────

  _isInActiveState() {
    const fsm = this.scene.fsm;
    return fsm.is('Waiting') || fsm.is('BiteWindow');
  }

  /** 当前透明度（0=不画，1=完全显示） */
  _currentAlpha() {
    // 淡出中
    if (this._hideAt >= 0) {
      const dt = this._frameTime - this._hideAt;
      if (dt >= FADE_OUT_MS) return 0;
      return Math.max(0, 1 - dt / FADE_OUT_MS);
    }
    // 不在 Waiting/BiteWindow
    if (this._waitingEnterMs < 0) return 0;
    // 延迟期
    const sinceEnter = this._frameTime - this._waitingEnterMs;
    if (sinceEnter < MAGNIFIER_DELAY) return 0;
    // 淡入期
    const fadeT = sinceEnter - MAGNIFIER_DELAY;
    if (fadeT < FADE_IN_MS) return fadeT / FADE_IN_MS;
    // 完全显示
    if (this._visibleSince < 0) this._visibleSince = this._frameTime;
    return 1;
  }

  /** 反侧 + clamp 计算镜中心 */
  _computeMagnifierCenter(bobScreenX) {
    const cw = this.scene.cw;
    const ch = this.scene.ch;
    // 反侧：bob 在左半 → 镜放右；右半 → 镜放左
    const onLeftHalf = bobScreenX < cw * 0.5;
    let cx = onLeftHalf
      ? this.scene.bobX + MAGNIFIER_OFFSET
      : this.scene.bobX - MAGNIFIER_OFFSET;
    // 镜中心 y：与浮漂同高（让玩家眼神不用大跳）
    let cy = this.scene.bobY;
    // clamp：保证整个圆在画布内（留 4px 边距）
    const pad = 4;
    cx = Math.max(MAGNIFIER_R + pad, Math.min(cw - MAGNIFIER_R - pad, cx));
    cy = Math.max(MAGNIFIER_R + pad, Math.min(ch - MAGNIFIER_R - pad, cy));
    return { cx, cy };
  }

  /**
   * 镜底背景（v2.0.5）：从 scene._bgCacheCanvas 取浮漂周围一小块，4× 放大画到镜内
   *   - cache 仅包含纯背景层（水面/水下/远山/水草/岸边植被），无鱼影/鱼线/浮漂
   *   - 源区域 50×50（MAGNIFIER_SIZE / ZOOM），目标 200×200，与镜内浮漂同倍率
   *   - imageSmoothingEnabled=false → 最近邻整数放大，像素感与浮漂栅格一致
   *   - 兜底：cache 不可用（首帧/异常）→ 退化到色调渐变 + 波纹
   */
  _drawMagnifierBg(ctx, cx, cy, bobScreenX, bobScreenY) {
    const cache = this.scene && this.scene._bgCacheCanvas;
    if (cache) {
      // 源区域：以浮漂屏幕坐标为中心，截 (MAGNIFIER_SIZE / ZOOM) 见方一小块
      const sw = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;
      const sh = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;
      let sx = Math.round(bobScreenX - sw / 2);
      let sy = Math.round(bobScreenY - sh / 2);
      // clamp 到 canvas 内（防止 sx/sy 为负或越界，drawImage 越界部分会留空白）
      sx = Math.max(0, Math.min(cache.width - sw, sx));
      sy = Math.max(0, Math.min(cache.height - sh, sy));
      // 目标：镜中心 200×200（圆形 clip 限定可视范围）
      const dw = MAGNIFIER_SIZE, dh = MAGNIFIER_SIZE;
      const dx = Math.round(cx - dw / 2);
      const dy = Math.round(cy - dh / 2);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cache, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
      return;
    }
    // 兜底：cache 不可用时用色调渐变 + 波纹
    const grad = ctx.createLinearGradient(cx, cy - MAGNIFIER_R, cx, cy + MAGNIFIER_R);
    grad.addColorStop(0, '#7AC0CC');
    grad.addColorStop(0.5, '#4A95A8');
    grad.addColorStop(1, '#2F6F82');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - MAGNIFIER_R, cy - MAGNIFIER_R, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    const t = (this.scene && typeof this.scene.time === 'number') ? this.scene.time : (this._frameTime / 1000);
    for (let i = 0; i < 4; i++) {
      const yOff = -MAGNIFIER_R + 30 + i * 38;
      ctx.beginPath();
      for (let dx2 = -MAGNIFIER_R; dx2 <= MAGNIFIER_R; dx2 += 4) {
        const wave = Math.sin((dx2 + t * 25 + i * 23) / 22) * 2;
        const py = cy + yOff + wave;
        if (dx2 === -MAGNIFIER_R) ctx.moveTo(cx + dx2, py);
        else ctx.lineTo(cx + dx2, py);
      }
      ctx.stroke();
    }
  }

  /**
   * 放大浮漂：4× 最近邻整数放大
   *
   * shake 段：sink hidden=false → 调 _drawPixelBobZoomed 把主画面浮漂的像素栅格放大画
   * sink 段：sink hidden=true → 调 drawUnderwaterBob 同款但坐标/尺寸 ×4
   */
  _drawZoomedBob(ctx, cx, cy, bobScreenX, bobScreenY, d5Offset) {
    // S2 微浮：仅 Waiting 期（非 BiteWindow），让镜内浮漂随波微动
    let microBobDy = 0;
    if (this.scene.fsm.is('Waiting')) {
      microBobDy = IDLE_BOB_AMP_PX *
        Math.sin(2 * Math.PI * this._frameTime / IDLE_BOB_PERIOD_MS);
    }

    // 镜内浮漂 dy = (主画面 d5 偏移 + 等待期微浮) × ZOOM × DY_SCALE（v2.0.1 减半）
    //   主画面 dy 也参与让 shake 期镜内能看到抖动幅度差（spec §5 "看清三档抖动差"）
    //   DY_SCALE=0.5 让视觉幅度更柔和，避免镜内画面剧烈跳动
    // PHASE 21-1 D14 hotfix：dx 也要 ZOOM 放大，否则前戏（试探/偷吃 dx 晃动）镜内不可见
    const totalDx = d5Offset.dx * MAGNIFIER_ZOOM;
    const totalDy = (d5Offset.dy + microBobDy) * MAGNIFIER_ZOOM * MAGNIFIER_DY_SCALE;
    const zoomedBobX = cx + totalDx;
    const zoomedBobY = cy + totalDy;

    if (d5Offset.hidden) {
      // sink 段：水下剪影 ×ZOOM
      const sinkP = this.scene.d5 && typeof this.scene.d5.getSinkProgress === 'function'
        ? this.scene.d5.getSinkProgress()
        : 0;
      this._drawUnderwaterBobZoomed(ctx, zoomedBobX, zoomedBobY, sinkP);
    } else {
      // shake/idle 段：浮漂本体 ×ZOOM
      this._drawPixelBobZoomed(ctx, zoomedBobX, zoomedBobY);
    }
  }

  /**
   * 像素浮漂 ×ZOOM 重画（独立栅格，不调 scene._drawPixelBob 以免破坏其 ctx 状态）
   *
   * 像素表与 fishing-scene._drawPixelBob 同源（11×24 栅格，row 0-11 出水，row 12-23 入水）
   * 仅画 row 0-11（出水部分），简化复用
   */
  _drawPixelBobZoomed(ctx, cx, cy) {
    const s = MAGNIFIER_ZOOM * 2; // 原栅格 s=2，镜内 ×4 → 8 px/cell
    const W = 11, H = 12;         // 只画上半（出水）12 行
    const x0 = cx - (W / 2) * s;
    const y0 = cy - (H / 2) * s;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const OUT     = '#1A1A2E';
    const GLOW    = '#FFF8C8';
    const GLOW_HI = '#FFFFFF';
    const RED     = '#E63946';
    const RED_DK  = '#B11D2C';
    const YEL     = '#FFD43B';
    const YEL_DK  = '#D4A41A';
    const WHT     = '#FFF4D6';
    const WHT_DK  = '#C8B89A';

    const px = (col, row, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x0 + col * s, y0 + row * s, w * s, h * s);
    };

    // ── 发光头 row 0-1 ──
    px(5, 0, 1, 1, GLOW_HI);
    px(4, 1, 3, 1, GLOW);
    // ── 红锥 row 2-5 ──
    px(3, 2, 1, 1, OUT); px(7, 2, 1, 1, OUT);
    px(4, 2, 1, 1, RED_DK); px(5, 2, 1, 1, RED); px(6, 2, 1, 1, RED_DK);
    px(2, 3, 1, 1, OUT); px(8, 3, 1, 1, OUT);
    px(3, 3, 1, 1, RED_DK); px(4, 3, 1, 1, RED); px(5, 3, 1, 1, RED); px(6, 3, 1, 1, RED); px(7, 3, 1, 1, RED_DK);
    px(1, 4, 1, 1, OUT); px(9, 4, 1, 1, OUT);
    px(2, 4, 1, 1, RED_DK); px(3, 4, 1, 1, RED); px(4, 4, 1, 1, RED); px(5, 4, 1, 1, RED); px(6, 4, 1, 1, RED); px(7, 4, 1, 1, RED); px(8, 4, 1, 1, RED_DK);
    px(1, 5, 1, 1, OUT); px(9, 5, 1, 1, OUT);
    px(2, 5, 1, 1, RED); px(3, 5, 6, 1, RED); px(8, 5, 1, 1, RED_DK);
    // ── 黑环 row 6 ──
    px(1, 6, 9, 1, OUT);
    // ── 黄环 row 7-8 ──
    px(0, 7, 1, 1, OUT); px(10, 7, 1, 1, OUT);
    px(1, 7, 1, 1, YEL_DK); px(2, 7, 7, 1, YEL); px(9, 7, 1, 1, YEL_DK);
    px(0, 8, 1, 1, OUT); px(10, 8, 1, 1, OUT);
    px(1, 8, 1, 1, YEL_DK); px(2, 8, 1, 1, YEL); px(3, 8, 5, 1, YEL); px(8, 8, 1, 1, YEL); px(9, 8, 1, 1, YEL_DK);
    // ── 黑环 row 9 ──
    px(0, 9, 11, 1, OUT);
    // ── 白身 row 10-11（接水线） ──
    px(1, 10, 1, 1, OUT); px(9, 10, 1, 1, OUT);
    px(2, 10, 1, 1, '#FFFFFF'); px(3, 10, 5, 1, WHT); px(8, 10, 1, 1, WHT_DK);
    px(1, 11, 1, 1, OUT); px(9, 11, 1, 1, OUT);
    px(2, 11, 1, 1, WHT); px(3, 11, 5, 1, WHT); px(8, 11, 1, 1, WHT_DK);

    // ── 脚下一小段水面线（spec §5：镜内画浮漂本体 + 脚下一小段水面线） ──
    const lineY = y0 + H * s + 4;
    ctx.fillStyle = 'rgba(192, 229, 240, 0.55)';
    ctx.fillRect(x0 - 8, lineY,     W * s + 16, 2);
    ctx.fillRect(x0 - 4, lineY + 4, W * s + 8,  1);

    ctx.restore();
  }

  /** 水下剪影 ×ZOOM 重画（半径放大，颜色不变） */
  _drawUnderwaterBobZoomed(ctx, cx, cy, sinkProgress) {
    const p = Math.max(0, Math.min(1, sinkProgress));
    const alpha = 0.55 - p * 0.40;
    const rx = (9 - p * 3) * MAGNIFIER_ZOOM;
    const ry = (14 - p * 6) * MAGNIFIER_ZOOM;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1A2A3A';
    ctx.beginPath();
    ctx.ellipse(Math.floor(cx), Math.floor(cy), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // 中心红头残色斑（×ZOOM 后位置/大小放大）
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = '#5A1F2A';
    const w = 4 * MAGNIFIER_ZOOM;
    const h = 3 * MAGNIFIER_ZOOM;
    ctx.fillRect(Math.floor(cx) - w / 2, Math.floor(cy) - Math.floor(ry * 0.4), w, h);
    ctx.restore();
  }

  /** S2 等待期涟漪：一圈淡蓝色椭圆向外扩散 */
  _drawIdleRipple(ctx, cx, cy) {
    const t = this._frameTime - this._activeRipple.startMs;
    if (t < 0 || t > IDLE_RIPPLE_DUR_MS) return;
    const p = t / IDLE_RIPPLE_DUR_MS; // 0→1
    const r = 12 + p * 40;
    const a = (1 - p) * 0.45;
    ctx.save();
    ctx.strokeStyle = `rgba(192, 229, 240, ${a})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // 椭圆（俯视压扁 0.45），中心稍下避免压浮漂
    ctx.ellipse(cx, cy + 24, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 圆形玻璃边框 + 弧形高光 + 暗角 */
  _drawFrame(ctx, cx, cy) {
    // 内暗角（先画在裁切外，无 clip）
    const vignette = ctx.createRadialGradient(cx, cy, MAGNIFIER_R * 0.7, cx, cy, MAGNIFIER_R);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, VIGNETTE_COLOR);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, MAGNIFIER_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = vignette;
    ctx.fillRect(cx - MAGNIFIER_R, cy - MAGNIFIER_R, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    ctx.restore();

    // 金边外圈
    ctx.strokeStyle = FRAME_DARK;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, MAGNIFIER_R - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = FRAME_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, MAGNIFIER_R - 2, 0, Math.PI * 2);
    ctx.stroke();

    // 2026-06-05：删除左上弧形高光 —— 玩家容易误解为"读条/进度条"
    //   原效果：左上 45°~135° 4px 圆头白色弧，模拟玻璃反光
    //   反馈：弧形+读条心智模型导致误判，去掉后镜片更纯粹
  }

  /**
   * 2026-06-05："放弃"胶囊按钮
   *   形态：圆角胶囊（红色底 + 米白文字 "放弃"）
   *   位置：浮漂正下方；下方越界翻到上方；左右 clamp 贴边
   *   alpha：跟随外层 ctx.globalAlpha（淡入淡出 + 下滑消失）
   *   点击 → fishing-scene 调 _resetToIdle（任何状态可点）
   */
  _drawAbandonBtn(ctx, cx, cy) {
    const rect = this._computeAbandonRect(cx, cy);
    this._lastAbandonRect = rect;
    const { x, y, w, h } = rect;
    const r = h / 2; // 胶囊圆角半径 = 半高

    // 圆角胶囊 path
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    // 1. 底色
    ctx.fillStyle = this._abandonBtnHovered ? ABANDON_BTN_BG_HOV : ABANDON_BTN_BG;
    ctx.fill();

    // 2. 描边（深红）
    ctx.lineWidth = 2;
    ctx.strokeStyle = ABANDON_BTN_DARK;
    ctx.stroke();

    // 3. 顶部内高光（按钮立体感）
    const grad = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x + r, y + 1);
    ctx.lineTo(x + w - r, y + 1);
    ctx.quadraticCurveTo(x + w - 1, y + 1, x + w - 1, y + r);
    ctx.lineTo(x + w - 1, y + h * 0.55);
    ctx.lineTo(x + 1, y + h * 0.55);
    ctx.lineTo(x + 1, y + r);
    ctx.quadraticCurveTo(x + 1, y + 1, x + r, y + 1);
    ctx.closePath();
    ctx.fill();

    // 4. hover 外发光
    if (this._abandonBtnHovered) {
      ctx.beginPath();
      ctx.moveTo(x + r, y - 2);
      ctx.lineTo(x + w - r, y - 2);
      ctx.quadraticCurveTo(x + w + 2, y - 2, x + w + 2, y + r);
      ctx.lineTo(x + w + 2, y + h - r);
      ctx.quadraticCurveTo(x + w + 2, y + h + 2, x + w - r, y + h + 2);
      ctx.lineTo(x + r, y + h + 2);
      ctx.quadraticCurveTo(x - 2, y + h + 2, x - 2, y + h - r);
      ctx.lineTo(x - 2, y + r);
      ctx.quadraticCurveTo(x - 2, y - 2, x + r, y - 2);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 5. 文字
    ctx.save();
    ctx.fillStyle = ABANDON_BTN_TEXT;
    ctx.font = `bold ${ABANDON_BTN_FONT}px "TencentSansW7","TencentSans","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetY = 1;
    ctx.fillText('放弃', x + w / 2, y + h / 2 + 1);
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    ctx.restore();

    // 复位
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
