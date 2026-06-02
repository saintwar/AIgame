// PHASE 21-1 D5「鱼咬钩反馈系统」· 总入口控制器
//
// 权威源：
//   - 实施指令：docs/PHASE-21-1-D5-impl-spec.md §4
//   - 决策签字：docs/PHASE-21-1-D5-decisions.md（A3 / B3+越档 / C 降级）
//
// 职责：
//   1. BiteLevelDispatcher.resolve(rarity) → 三档抖动级别（含越档扰动）
//   2. onBiteStart / onPerfectHit / onLateMiss / onLineUp / onLateZoneEnter 事件 API
//   3. update(dt) 推 zone 判定 + 计时；render(ctx) 画 4 个反馈层
//   4. getBobOffset() 给 _drawPixelBob 三处调用前用
//   5. applyCameraShake(ctx) 在 _render 顶层调用一次（heavy 触发瞬间镜头微震）

import { D5_COLORS, D5_FONT_STACK } from './d5-palette.js';
import { BiteShakeFrame } from './bite-shake-frame.js';
import { drawPerfectText } from './perfect-text-renderer.js';
import { drawMissText } from './miss-text-renderer.js';
import { drawCloverGlow } from './clover-glow-renderer.js';
import { emitHeavySplash } from './splash-particle-fx.js';
import { drawUnderwaterBob } from './underwater-bob-renderer.js';
import { D5Magnifier } from './magnifier-v2-renderer.js';
import AudioSystem from '../../audio-system.js';

// ────────────────────────────────────────────────────────────────────
// BiteLevelDispatcher
//   决策 B3：基于将给玩家的"这条鱼"的 rarity（1-5★）映射主档
//   越档扰动：每次主档出来后按 70/15-30 表扰动出最终档（防破解）
// ────────────────────────────────────────────────────────────────────

// 主映射（rarity → 主档）
function _mainTierByRarity(rarity) {
  if (rarity <= 2) return 'light';
  if (rarity === 3) return 'medium';
  return 'heavy'; // 4-5★
}

// 越档扰动表（决策书 §B-2）：[档位, 累计概率]
// light:  70% light / 25% medium / 5% heavy
// medium: 70% medium / 15% light / 15% heavy
// heavy:  70% heavy / 25% medium / 5% light
const _PERTURB = {
  light:  [['light', 0.70], ['medium', 0.95], ['heavy', 1.00]],
  medium: [['light', 0.15], ['medium', 0.85], ['heavy', 1.00]],
  heavy:  [['light', 0.05], ['medium', 0.30], ['heavy', 1.00]],
};

export const BiteLevelDispatcher = {
  /**
   * 解析最终档位
   * @param {number} rarity 这条鱼的 rarity（1-5★，缺省/非法 → 'light' 兜底）
   * @returns {'light'|'medium'|'heavy'}
   */
  resolve(rarity) {
    const main = _mainTierByRarity(Number.isFinite(rarity) ? rarity : 1);
    const table = _PERTURB[main] || _PERTURB.light;
    const r = Math.random();
    for (const [tier, cum] of table) {
      if (r <= cum) return tier;
    }
    return main;
  },
  // 暴露主映射给单元测试 / 日志查看
  _mainTierByRarity,
};

// ────────────────────────────────────────────────────────────────────
// D5BiteFeedback
// ────────────────────────────────────────────────────────────────────

export class D5BiteFeedback {
  /**
   * @param {object} scene FishingScene 反向引用
   *   读取：scene.ctx / scene.particles / scene.fsm / scene.bobX / scene.bobY
   *   不写场景任何字段（除 scene.d5 由场景自己挂）
   */
  constructor(scene) {
    this.scene = scene;
    // —— BiteWindow 期状态 —— //
    this.biteLevel = null;            // 'light' | 'medium' | 'heavy' | null
    this.biteWindowElapsed = 0;       // 秒
    // v2.1：zone 增加 'shake'（抖动期，提竿无效/早提）；其余 perfect/good/late 均在 sink 段
    this.biteZone = null;             // 'shake' | 'perfect' | 'good' | 'late' | null
    this._sinkStarted = false;        // 是否已进入 sink 阶段（边沿触发用）
    this._lastShakeTickIdx = -1;      // 上次触发抖动音的帧 idx，边沿触发用

    // —— 演出层（独立计时，跨状态续演） —— //
    // 注：放大镜（magnifierTint）已移除，由用户后续主导开发
    this.fx = {
      perfectText:   null,  // { tier, startMs, x, y }
      missText:      null,  // { startMs, x, y }
      cloverGlow:    null,  // { startMs, x, y }
      cameraShake:   null,  // { startMs, durMs }
      rippleBurst:   null,  // { startMs, x, y } 漏提加速涟漪（仅 500ms）
    };
    this._frameTime = 0; // 累计 ms（与 scene 的 dt 同步）

    // PHASE 21-1 D5 P0：放大镜 v2（落水进 Waiting+150ms 出现，提竿即焚）
    // 详见 docs/PHASE-21-1-D5-magnifier-impl-spec.md
    this.magnifier = new D5Magnifier(scene);
  }

  // ─────────────────────────────────────────────
  // 事件 API（由 fishing-scene 状态机驱动）
  // ─────────────────────────────────────────────

  /**
   * 咬钩窗口开始
   * @param {'light'|'medium'|'heavy'} level
   * @param {object} [opts] { isLuckyBail }
   */
  onBiteStart(level, opts = {}) {
    this.biteLevel = level;
    this.biteWindowElapsed = 0;
    // v2.1：开始时进入 shake 段（提竿 = 早提）
    this.biteZone = 'shake';
    this._sinkStarted = false;
    this._lastShakeTickIdx = -1;

    if (level === 'heavy') {
      // heavy 档：抖动一开始就镜头微震（鱼狠咬）
      this.fx.cameraShake = { startMs: this._frameTime, durMs: 60 };
    }

    if (opts.isLuckyBail) {
      // 四叶草位置 ±2px 随机浮动（art-spec §6.2 末尾）
      const jitterX = Math.round(Math.random() * 4 - 2);
      const jitterY = Math.round(Math.random() * 4 - 2);
      this.fx.cloverGlow = {
        startMs: this._frameTime,
        x: this.scene.bobX + jitterX,
        y: this.scene.bobY - 14 + jitterY,
      };
    }
  }

  /** 进入 LATE 段（放大镜已移除，保留钩子供未来扩展） */
  onLateZoneEnter() {
    /* no-op：放大镜呼吸效果已移除 */
  }

  /** 进入 sink 段（鱼真正咬住开始沉浮漂）—— 由 _updateZone 边沿触发 */
  onSinkStart() {
    if (this._sinkStarted) return;
    this._sinkStarted = true;
    // 沉水瞬间：水花特效（全档触发，强化"鱼咬定"反馈）
    emitHeavySplash(this.scene.particles, this.scene.bobX, this.scene.bobY);
    // 沉水音：用本档 sink 段实际时长匹配音效长度
    const W = this._getWindowsCfg();
    const w = W && W[this.biteLevel];
    const sinkDur = w ? Math.max(0.4, w.total - w.shakeEnd) : 1.0;
    AudioSystem.playBobSink(sinkDur);
  }

  /** PERFECT 命中 */
  onPerfectHit(tier) {
    this.fx.perfectText = {
      tier,
      startMs: this._frameTime,
      x: this.scene.bobX,
      y: this.scene.bobY - 30,
    };
  }

  /** GOOD/LATE 成功提竿 */
  onLineUp() {
    /* no-op：放大镜呼吸效果已移除 */
  }

  /** 漏提（窗口超时） */
  onLateMiss() {
    this.fx.missText = {
      startMs: this._frameTime,
      x: this.scene.bobX,
      y: this.scene.bobY + 18,
    };
    // 加速版涟漪：500ms，扩散速度 ×1.5
    this.fx.rippleBurst = {
      startMs: this._frameTime,
      x: this.scene.bobX,
      y: this.scene.bobY,
    };
  }

  /** BiteWindow 退出（任何方式）清空抖动状态，演出层不动 */
  onBiteWindowExit() {
    this.biteLevel = null;
    this.biteWindowElapsed = 0;
    this.biteZone = null;
  }

  // ─────────────────────────────────────────────
  // 主循环
  // ─────────────────────────────────────────────

  /**
   * @param {number} dt 单位：秒（与 fishing-scene 一致）
   */
  update(dt) {
    this._frameTime += dt * 1000;
    if (this.scene.fsm.is('BiteWindow') && this.biteLevel) {
      this.biteWindowElapsed += dt;
      this._updateZone();
      this._updateShakeAudio();
    }
    this._reapExpired();
    // P0 放大镜：自驱动（边沿检测 Waiting/BiteWindow 进出，含 150ms 延迟出现 + 提竿即焚）
    if (this.magnifier) this.magnifier.update(dt);
  }

  /** shake 段：按 BiteShakeFrame 12fps 节奏，每帧 idx 推进时打一声 tick，dy 越大音量越大 */
  _updateShakeAudio() {
    if (this.biteZone !== 'shake') return;
    const frameIdx = Math.floor(this.biteWindowElapsed * 12);
    if (frameIdx === this._lastShakeTickIdx) return;
    this._lastShakeTickIdx = frameIdx;
    const f = BiteShakeFrame.sample(this.biteLevel, frameIdx);
    const dyAbs = Math.abs(f.dy);
    if (dyAbs <= 0) return; // dy=0 的"静默帧"不响（如帧 0/3 的 [0,0]）
    // dy 最大 12（heavy） → 强度 1.0；2~3（light） → 强度 ~0.3
    const intensity = Math.min(1, dyAbs / 12);
    AudioSystem.playBobShakeTick(this.biteLevel, intensity);
  }

  render(ctx) {
    // Z-order：浮漂下方涟漪/水花 → 浮漂本体（场景画或被 hidden 跳过） → 水下剪影 →
    //          四叶草 → 漏提加速涟漪 → 放大镜浮层 → PERFECT/可惜（最上层）

    // 0) 水下剪影（sink 段开始就画，dy>0 时浮漂中心落在水线下方）
    const sinkP = this.getSinkProgress();
    if (sinkP >= 0) {
      const off = this.getBobOffset();
      drawUnderwaterBob(ctx, this.scene.bobX + off.dx, this.scene.bobY + off.dy, sinkP);
    }

    // 1) 四叶草微光
    if (this.fx.cloverGlow) {
      drawCloverGlow(
        ctx,
        this.fx.cloverGlow.x,
        this.fx.cloverGlow.y,
        this._frameTime - this.fx.cloverGlow.startMs,
      );
    }

    // 2) 漏提加速涟漪（500ms，3 圈错峰扩散）
    if (this.fx.rippleBurst) {
      this._drawRippleBurst(ctx);
    }

    // 2.5) P0 放大镜浮层（在涟漪之上、文字之下）
    if (this.magnifier) this.magnifier.render(ctx);

    // 3) PERFECT 字
    if (this.fx.perfectText) {
      drawPerfectText(
        ctx,
        this.fx.perfectText.x,
        this.fx.perfectText.y,
        this.fx.perfectText.tier,
        this._frameTime - this.fx.perfectText.startMs,
      );
    }

    // 4) 「可惜……」字
    if (this.fx.missText) {
      drawMissText(
        ctx,
        this.fx.missText.x,
        this.fx.missText.y,
        this._frameTime - this.fx.missText.startMs,
      );
    }
  }

  // ─────────────────────────────────────────────
  // 浮漂偏移查询（_drawPixelBob 三处调用前用）
  // ─────────────────────────────────────────────

  /**
   * v2.1：返回 { dx, dy, hidden }
   *   - shake 段：抖动帧表（hidden=false）
   *   - sink 段：dy 渐增（最大约 26px 即潜入水下），过水线后 hidden=true 让外层跳过原浮漂
   */
  getBobOffset() {
    if (!this.biteLevel || !this.scene.fsm.is('BiteWindow')) {
      return { dx: 0, dy: 0, hidden: false };
    }
    const W = this._getWindowsCfg();
    const w = W && W[this.biteLevel];
    if (!w) return { dx: 0, dy: 0, hidden: false };

    const t = this.biteWindowElapsed;

    if (t < w.shakeEnd) {
      // shake：原抖动帧表
      const frameIdx = Math.floor(t * 12);
      const f = BiteShakeFrame.sample(this.biteLevel, frameIdx);
      return { dx: f.dx, dy: f.dy, hidden: false };
    }

    // sink：从 shakeEnd 到 total 线性沉到 SINK_MAX_DY，过 SINK_HIDE_DY 后剪影接管
    const sinkDuration = Math.max(0.01, w.total - w.shakeEnd);
    const p = Math.min(1, (t - w.shakeEnd) / sinkDuration); // 0→1
    const SINK_MAX_DY = 32;
    const SINK_HIDE_DY = 14; // 浮漂中心下沉 14px 即认为完全过水线
    const dy = Math.round(SINK_MAX_DY * p);
    return { dx: 0, dy, hidden: dy >= SINK_HIDE_DY };
  }

  /** sink 阶段进度（0=刚开始沉，1=最深）；非 sink 阶段返回 -1 */
  getSinkProgress() {
    if (!this.biteLevel || !this.scene.fsm.is('BiteWindow')) return -1;
    const W = this._getWindowsCfg();
    const w = W && W[this.biteLevel];
    if (!w) return -1;
    const t = this.biteWindowElapsed;
    if (t < w.shakeEnd) return -1;
    const sinkDuration = Math.max(0.01, w.total - w.shakeEnd);
    return Math.min(1, (t - w.shakeEnd) / sinkDuration);
  }

  // ─────────────────────────────────────────────
  // 镜头微震（在 _render 顶层 ctx.save 后调用一次）
  // art-spec §3：每 10ms 在 [-2, +2] 随机 (Δx, Δy)，整数
  // ─────────────────────────────────────────────

  applyCameraShake(ctx) {
    if (!this.fx.cameraShake) return;
    const t = this._frameTime - this.fx.cameraShake.startMs;
    if (t > this.fx.cameraShake.durMs) {
      this.fx.cameraShake = null;
      return;
    }
    const dx = Math.round(Math.random() * 4 - 2);
    const dy = Math.round(Math.random() * 4 - 2);
    ctx.translate(dx, dy);
  }

  // ─────────────────────────────────────────────
  // 内部
  // ─────────────────────────────────────────────

  _updateZone() {
    // v2.1：两段判定 —— shake（早提）+ sink（perfect/good/late）
    const W = this._getWindowsCfg();
    if (!W || !W[this.biteLevel]) return;
    const w = W[this.biteLevel];
    const t = this.biteWindowElapsed;
    const prev = this.biteZone;

    if (t < w.shakeEnd) {
      this.biteZone = 'shake';
    } else if (t < w.perfect[1]) {
      this.biteZone = 'perfect';
    } else if (t < w.good[1]) {
      this.biteZone = 'good';
    } else {
      this.biteZone = 'late';
    }

    // 边沿：shake → 非 shake 即沉水开始
    if (prev === 'shake' && this.biteZone !== 'shake') this.onSinkStart();
    if (prev !== 'late' && this.biteZone === 'late') this.onLateZoneEnter();
  }

  // 由 fishing-scene 注入；缺失时给 v2.1.1 静态兜底（sink 段 ×2）
  _getWindowsCfg() {
    if (this.scene && this.scene._biteWindowCfg) return this.scene._biteWindowCfg;
    return {
      light:  { total: 1.900, shakeEnd: 0.500, perfect: [0.500, 1.300], good: [1.300, 1.700], late: [1.700, 1.900] },
      medium: { total: 1.600, shakeEnd: 0.400, perfect: [0.400, 1.000], good: [1.000, 1.400], late: [1.400, 1.600] },
      heavy:  { total: 1.300, shakeEnd: 0.300, perfect: [0.300, 0.800], good: [0.800, 1.100], late: [1.100, 1.300] },
    };
  }

  // 漏提加速涟漪：3 圈错峰，半径 14→46，500ms
  _drawRippleBurst(ctx) {
    const t = this._frameTime - this.fx.rippleBurst.startMs;
    if (t > 500) { this.fx.rippleBurst = null; return; }
    const { x, y } = this.fx.rippleBurst;
    const animPhase = t / 500; // 0→1
    ctx.save();
    for (let layer = 0; layer < 3; layer++) {
      const offset = Math.min(1, animPhase + layer / 3);
      const r = 14 + offset * 32;
      const a = (1 - offset) * 0.60;
      if (a <= 0) continue;
      ctx.strokeStyle = `rgba(192, 229, 240, ${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      // 椭圆涟漪（俯视压扁 0.45）—— 复用既有 _drawBobRipples 视觉规范
      ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _reapExpired() {
    // perfectText / missText / cloverGlow / rippleBurst 由各自 draw 函数 t > 总长时自然不画
    // 这里清状态字段以释放内存
    // PERFECT 字 totalMs 已 ×2 到 1200/1400/1600，阈值取最大 +100ms 兜底
    if (this.fx.perfectText && this._frameTime - this.fx.perfectText.startMs > 1700) {
      this.fx.perfectText = null;
    }
    if (this.fx.missText && this._frameTime - this.fx.missText.startMs > 800) {
      this.fx.missText = null;
    }
    if (this.fx.cloverGlow && this._frameTime - this.fx.cloverGlow.startMs > 500) {
      this.fx.cloverGlow = null;
    }
  }
}
