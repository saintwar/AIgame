// 钓鱼场景模块（720p HD）

import SceneManager from './scene-manager.js';
import questSystem from './quest-system.js';
import { QUESTS } from './data/quests.js';
import { rollFishWithRod, SHUISHE_FISH_POOL } from './data/fish-pool.js';
// PHASE 15：鱼行为状态机（none/surge/erratic/mythic）
import { FishBehavior } from './data/fish-behavior.js';
import { BAIT_EFFECTS, getBaitEffect } from './data/bait-effects.js';
import baitHUD from './ui/bait-hud.js';
import { drawFishingBg } from './render/fishing-bg.js';
import { drawFishingDownBg, preloadFishingDownBg } from './render/fishing-down-bg.js';
// PHASE 16-6 仗1：鱼篓双轨同步工具
import {
  checkFishStorageCapacity,
  addFishToStorage as addFishToStorageStack
} from './fish-storage.js';
// PHASE 21-1 v3.0 W1 D1：三鱼群数据结构 + 游动 AI（占位渲染）
import { FishGroupSystem } from './systems/fish-group-system.js';
// PHASE 21-1 v3.0 W1 D2：三鱼群鼠标 hover 检测 + 信息浮窗（密度图 / 体型暗示）
import { FishGroupHoverUI } from './systems/fish-group-hover-ui.js';
// PHASE 21-1 v3.0 W1 D4：抛竿落水阶段 — 蓄力 + 落点圈 + 抛物线 + 水花涟漪
import { CastAimSystem } from './systems/cast-aim-system.js';
import { WaterSplashFX } from './systems/water-splash-fx.js';
// PHASE 21-C：钓鱼场景阿明 sprite（替代 _renderCharacterBody 程序化几何）
import {
  preloadAmingFishSheet,
  isAmingFishSheetReady,
  drawAmingFishFrame,
  getAmingFishPoleTip,
} from './render/aming-fish-sprite.js';
// 2026-06-02：浮台 → 船图替换（_renderPlatform 优先用图，未就绪兜底原绘制）
import { preloadShipSprite, isShipSpriteReady, drawShipSprite, SHIP_SPRITE_SIZE } from './render/ship-sprite.js';
// PHASE 21-1 D5：鱼咬钩反馈系统（三档抖动 + PERFECT 字 + 放大镜染色 + 漏提演出 + 四叶草 + 猛档水花 + 镜头微震）
import { D5BiteFeedback, BiteLevelDispatcher } from './render/d5/d5-bite-feedback.js';
// PHASE 21-1 D14 hotfix-u（2026-06-04）：水下战斗鱼图替换（512×512 透明 PNG，未就绪 fallback 几何）
import { getFishSpriteBySpecies, isFishSpriteReady, preloadAllFishSprites } from './render/fish-sprite-loader.js';

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  aiming: { chargeCycle: 1.5, powerWeakMax: 33, powerMidMax: 66, powerStrongMax: 95, powerOverload: 96 },
  casting: { windUpDuration: 0.25, swingDuration: 0.35, releaseDuration: 0.20, idleAngle: -Math.PI / 4, windUpAngle: -Math.PI / 12, releaseAngle: -Math.PI * 0.42, arcHeightBase: 180, overshootAmount: 0.06 },
  waiting: { fishSpawnDelay: 2.0 }, // @deprecated D14：旧 fishShadow 派鱼延迟，D14 起改由 BobberApproachFSM 内部 randInt(1500,4000) 控制；保留字段防外部引用断裂
  // PHASE 21-1 D5：三档窗口（impl-spec §3.1）
  //   v2.1 重构：BiteWindow 分两段（shake 抖动 + sink 沉水），shake 段提竿 = bad/早提
  //     shakeEnd = shake 段结束秒；sinkEnd = sink 段（也是窗口）结束秒
  //     sink 段内部 perfect/good/late 区间均以"窗口起点 0"为时间轴
  //     total = sinkEnd（用于 timer）
  //   v2.1.1 (2026-06-02)：sink 段时长全部 ×2（shake 不变），给玩家更充裕的提竿反应时间
  biteWindow: {
    duration: 2.0,
    windows: {
      // light: 0.5s 抖动 + 1.4s 沉水（perfect 0.8s / good 0.4s / late 0.2s）
      light:  { total: 1.900, shakeEnd: 0.500, perfect: [0.500, 1.300], good: [1.300, 1.700], late: [1.700, 1.900] },
      // medium: 0.4s 抖动 + 1.2s 沉水（perfect 0.6s / good 0.4s / late 0.2s）
      medium: { total: 1.600, shakeEnd: 0.400, perfect: [0.400, 1.000], good: [1.000, 1.400], late: [1.400, 1.600] },
      // heavy: 0.3s 抖动 + 1.0s 沉水（perfect 0.5s / good 0.3s / late 0.2s，急但仍有反应空间）
      heavy:  { total: 1.300, shakeEnd: 0.300, perfect: [0.300, 0.800], good: [0.800, 1.100], late: [1.100, 1.300] },
    },
  },
  reeling: { qteCountByRarity: [3, 5, 7, 9, 11], tickDurationByRarity: [1.6, 1.4, 1.2, 1.0, 0.8], hpDamageByRarity: [35, 20, 15, 12, 10], tensionPenaltyByRarity: [15, 18, 20, 22, 25], tensionSuccessBonus: 10, tensionFailPenalty: 20, tensionTimeoutPenalty: 20 },
  playing: { maxTension: 100, tensionPerSecond: 20, tensionDecayPerSecond: 6, fishEscapeSpeed: 225, fishEscapeSpeedIncrease: 12, catchZoneX: 0.9, catchZoneY: 0.2, tensionLowThreshold: 40, tensionHighThreshold: 70, escapeBaseChanceAtZero: 0.08, escapeChanceAtHalf: 0.015, escapeChanceAtFull: 0.001, lowTensionPenaltyMultiplier: 3.0, highTensionBonusMultiplier: 0.3, escapeCheckInterval: 0.5, fishHPRecoverPerSecond: 8, fishHPMaxRecoverRatio: 1.0, /* hotfix-p：30%→100% 回血可满血 */
    // PHASE 13-4：空格控压维度（叠加在 QTE 系统上）
    //   按住空格 → tension 上升；松开 → tension 下降
    //   tension≤0 持续 slackFailGrace 秒 → slack 失败（鱼脱钩，与 ≥100 鱼线断对称）
    tensionRiseRate: 15,    // 按住空格每秒 +15（涨慢，0→100 约 6.7s）
    tensionFallRate: 40,    // 松开每秒 -40（掉快，100→0 约 2.5s）
    slackFailGrace: 0.5,    // tension≤0 缓冲秒数（避免松手瞬间触发）
    goldZoneMin: 30, goldZoneMax: 70, // tension 黄金区（拉力条上高亮提示）
    // PHASE 21-1 D7：biteLevel → 博弈初始张力"第一印象"（老板拍板 B，保留越档悬念）
    //   见 docs/PHASE-21-1-D7-impl-spec.md §3.2 红线：
    //   - 偏移幅度 ±8~10，heavy 不得逼近红区 85
    //   - 仅"起手张力"反差，真实难度仍由 behavior + HP 决定
    //   - 严禁"力度=难度"确定映射
    //   - null 兜底 60（异常路径/GM 跳转）
    biteInitialTension: { light: 52, medium: 60, heavy: 70 }
  },
  caught: { animationDuration: 2.0, slowmoThreshold: 4, slowmoScale: 0.3, particleCount: 18, legendaryGlowDuration: 0.5 },
  failed: { resetDuration: 1.5 },
  fish: { travelSpeed: 120, biteProbBase: 0.6 }, // @deprecated D14：travelSpeed/biteProbBase 旧 fishShadow 用，D14 起前戏层独立参数
};

const FAILED_MESSAGES = { overload: ['干! 用力过头炸线啦!', '拍谢，钓线炸掉了'], timeout: ['啊~ 跑了啦...', '呜呜不小心发呆了'], tension: ['这尾靠北大! 线撑不住~', '它太拼了啦'], escape: ['它挣脱了耶...', '差一点点啊!'], slack: ['鱼线松了！鱼跑了～', '哎呀！要保持张力啊！'], early: ['太早啦！等浮漂沉下去再提~', '咬都还没咬牢呢，急啥~'] };

// ════════════════════════════════════════════════════════
// PHASE 13-3c：拉力色板（鱼线 / 拉力条共享同一组 hex）
//   state = 'low' | 'mid' | 'high'，定义统一来自此处
//   阈值与 CONFIG.playing.tensionLowThreshold / tensionHighThreshold 联动
//   注意：现有"拉力条"语义为 high=绿（最佳拉力区间）/ low=红（鱼快跑），
//        因此鱼线颜色按"拉力条当前显示色"取，逻辑完全一致
// ════════════════════════════════════════════════════════
const TENSION_PALETTE = {
  low:  { main: '#E76F51', dark: '#C75543' }, // 红 - 拉力过低（鱼快跑）
  mid:  { main: '#F4C430', dark: '#E0AE20' }, // 黄 - 警戒区间
  high: { main: '#5DBB63', dark: '#4A9F50' }  // 绿 - 拉力高（最佳）
};

// PHASE 13-5：拉力视觉色板 —— 鱼线 + 拉力条共用唯一色源（正向语义定稿）
//   tension 的语义 = "鱼的反抗值 / 玩家压制度"：
//     拉力低 → 鱼快脱钩 → 红（危险）
//     拉力中 → 拉锯战 → 黄（警戒）
//     拉力高 → 玩家压制成功 → 绿（安全）
//     拉力 100 → 鱼线绷断（仍触发失败；条外侧叠加红色闪烁外框警告）
//   ⚠️ 玩法层 tension 完全不变（按对-10/按错+20/空格控压/≥100失败）
//   ⚠️ 任何拉力相关颜色绘制必须 *统一* 调用 getTensionColor(tension)（见下方）
//      darkColor 用于像素方格条偶数格暗纹（_drawPixelTensionBar 像素感）
const TENSION_COLOR_SCHEME = {
  safeColor:    '#5DBB63', safeDark:   '#4A9F50', // 绿（沿用现有绿，视觉无突变）
  warnColor:    '#F4C430', warnDark:   '#E0AE20', // 黄（沿用现有黄）
  dangerColor:  '#E76F51', dangerDark: '#C75543', // 红（沿用现有红）
  warnThreshold:   70, // tension > 70 → 绿
  dangerThreshold: 40  // tension ≤ 40 → 红
};

// PHASE 13-5：拉力条视觉规范定稿 —— 正向语义颜色映射（拉力条 + 鱼线唯一色源）
//   tension ≤ 40  → 红（危险，鱼快脱钩）
//   tension ≤ 70  → 黄（警戒，拉锯中）
//   tension > 70  → 绿（安全，玩家压制成功）
//   tension ≥ 100 → 鱼线绷断（颜色仍是绿，但已经触发失败判定；条外侧叠加红色闪烁外框作警告）
//   ⚠️ 任何拉力相关颜色绘制必须 *统一* 调用 getTensionColor(tension)
function getTensionColor(tension) {
  if (tension <= 40) return { main: TENSION_COLOR_SCHEME.dangerColor, dark: TENSION_COLOR_SCHEME.dangerDark }; // 红
  if (tension <= 70) return { main: TENSION_COLOR_SCHEME.warnColor,   dark: TENSION_COLOR_SCHEME.warnDark   }; // 黄
  return                    { main: TENSION_COLOR_SCHEME.safeColor,   dark: TENSION_COLOR_SCHEME.safeDark   }; // 绿
}

// ============================================================
// StateMachine
// ============================================================
class StateMachine {
  constructor() { this.state = 'Idle'; this.history = []; }
  transition(newState, reason) { this.history.push({ from: this.state, to: newState, reason, time: Date.now() }); this.state = newState; }
  is(state) { return this.state === state; }
}

// ============================================================
// AudioSystem（由 audio-system.js 提供）
// ============================================================
import AudioSystem from './audio-system.js';
// PHASE 21-1 D14 hotfix-n：删除 FISH_POOL.js 依赖，统一使用 SHUISHE_FISH_POOL（已在顶部 import）
//   color 字段已搬入 SHUISHE 池每条鱼，不再需要 legacy 映射
window._fishingAudioSystem = AudioSystem;

// ============================================================
// ParticleSystem
// ============================================================
class ParticleSystem {
  constructor() { this.particles = []; }
  emit(x, y, count, color, config = {}) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(angle) * (config.speed || 120), vy: Math.sin(angle) * (config.speed || 120) - (config.upward ? 150 : 0), life: 1, decay: config.decay || 0.03, size: config.size || 8, color, gravity: config.gravity !== undefined ? config.gravity : 300 });
    }
  }
  update(dt) { for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= p.decay; if (p.life <= 0) this.particles.splice(i, 1); } }
  draw(ctx) { this.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1; }
}

// ============================================================
// InputSystem
// ============================================================
class InputSystem {
  constructor() { this.keys = {}; this.keyPressed = {}; this._handlers = []; }
  setupListeners(onDown = null, onUp = null) {
    // 清理旧的监听器
    this.destroy();
    
    // 如果没有回调，不注册监听器
    if (!onDown && !onUp) return;
    
    const keydownHandler = (e) => {
      let k = e.key.toLowerCase();
      if (k === 'arrowup') k = 'up';
      else if (k === 'arrowdown') k = 'down';
      else if (k === 'arrowleft') k = 'left';
      else if (k === 'arrowright') k = 'right';
      else if (k === ' ') k = 'space';
      if (!this.keys[k]) this.keyPressed[k] = true;
      this.keys[k] = true;
      if (onDown) onDown(e);
    };
    const keyupHandler = (e) => {
      let k = e.key.toLowerCase();
      if (k === 'arrowup') k = 'up';
      else if (k === 'arrowdown') k = 'down';
      else if (k === 'arrowleft') k = 'left';
      else if (k === 'arrowright') k = 'right';
      else if (k === ' ') k = 'space';
      this.keys[k] = false;
      if (onUp) onUp(e);
    };
    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    this._handlers.push(keydownHandler, keyupHandler);
  }
  destroy() {
    this._handlers.forEach(h => {
      document.removeEventListener('keydown', h);
      document.removeEventListener('keyup', h);
    });
    this._handlers = [];
    // 保留 keys 状态，只清除 pressed 状态
    this.keyPressed = {};
  }
  isDown(key) { return !!this.keys[key.toLowerCase()]; }
  wasPressed(key) { const pressed = !!this.keyPressed[key.toLowerCase()]; this.keyPressed[key.toLowerCase()] = false; return pressed; }
  clearPressed() { this.keyPressed = {}; }
}

// ============================================================
// FishingScene - 主类
// ============================================================
class FishingScene {
  constructor() {
    this.canvas = null; this.ctx = null; this.cw = 1280; this.ch = 720; this.state = 'idle';
    this.questParams = null; this.rafId = null; this.paused = false; this.lastTime = 0; this.timeScale = 1; this.time = 0;
    this.money = 0; this.fishCount = 0; this.aimPower = 0; this.castProgress = 0; this.castFrom = { x: 0, y: 0 }; this.castTo = { x: 0, y: 0 };
    this.waitTimer = 0; this.currentFish = null; // PHASE 21-1 D14：fishShadow / fishShadowPos 字段已删除
    // PHASE 21-1 D5：本次咬钩窗口的档位 + 已用秒数（每帧累加）
    this.biteLevel = null; this.biteWindowElapsed = 0;
    this.biteWindowTimer = 0; this.qteIndex = 0; this.qteTotal = 0; this.qteDirection = ''; this.qteTimer = 0; this.qteMaxTime = 0;
    this.fishHP = 0; this.fishMaxHP = 0; this.tension = 0; this.qteResult = ''; this.qteResultColor = '#FFF';
    this.tensionChangeText = ''; this.tensionChangeTimer = 0; this.playingFishX = 0; this.playingFishY = 0; this.playingFishColor = '';
    this.fishYCenter = 0; this.fishYTime = 0; this.escapeSpeed = 0; this.escapeBurstTimer = 0; this.escapeCheckTimer = 0;
    this.lineStartX = 0; this.lineStartY = 0; this.caughtTimer = 0; this.failedTimer = 0; this.failedReason = '';
    this.caughtFish = null; this.caughtFishSize = 0; this.isNewFish = false; this.glowTimer = 0; this.warningShown = false; this.highTensionSound = false;
    this.characterX = 0; this.platformY = 0; this.characterY = 0; this.bobX = 0; this.bobY = 0;
    this.shakeCount = 0; this.failedMessageTimer = 0; this.failedMessageIndex = 0;
    this.fsm = new StateMachine(); this.particles = new ParticleSystem(); this.input = new InputSystem();
    // PHASE 21-1 D5：鱼咬钩反馈系统（决策 A3 / B3+越档 / C 降级）
    //   _biteWindowCfg：把 CONFIG.biteWindow.windows 注入 D5 用，避免 D5 反向引用 CONFIG 字符串
    this._biteWindowCfg = CONFIG.biteWindow.windows;
    this.d5 = new D5BiteFeedback(this);
    // 调试钩子：把场景实例挂到 window，并提供 window.__D5_TEST 一键测试各 fx
    //   用法（控制台）：__D5_TEST('heavyBite' | 'perfect' | 'miss' | 'late' | 'clover')
    if (typeof window !== 'undefined') {
      window.fishingScene = this;
      window.__D5_TEST = (mode = 'heavyBite') => {
        const d5 = this.d5; if (!d5) return console.warn('d5 未挂载');
        if (mode === 'heavyBite') d5.onBiteStart('heavy');
        else if (mode === 'perfect') d5.onPerfectHit('heavy');
        else if (mode === 'miss') d5.onLateMiss();
        else if (mode === 'late') d5.onLateZoneEnter();
        else if (mode === 'clover') d5.fx.cloverGlow = { startMs: d5._frameTime, x: this.bobX, y: this.bobY - 14 };
        else console.log('用法: __D5_TEST("heavyBite"|"perfect"|"miss"|"late"|"clover")');
      };
    }
    this.atlas = new Set(); this.newFishHintShown = false; this.showingFishInfo = false; this.taskComplete = false;
    this._aimingEHeld = false; this._aimingSpaceHeld = false;
    // 小鱼群
    this.smallFish = []; this._initSmallFish();

    // ── 日月潭环境动画数据 ──────────────────────────────
    this._envBirds = []; this._envLeaves = []; this._envClouds = [];
    this._initEnvBirds(); this._initEnvLeaves(); this._initEnvClouds();

    // 初始化全局音频系统
    AudioSystem.init();

    // PHASE 21-C：钓鱼场景阿明 sprite 预加载（懒加载 + 单次幂等）
    //   - sheet=amin-fish-back-6f.png（576×160 单行 6 帧）
    //   - 加载完成前 _renderCharacterBody 走原程序绘制兜底
    preloadAmingFishSheet();
    // 2026-06-02：浮台船图预加载（加载完成前 _renderPlatform 走原木板浮筒程序绘制兜底）
    preloadShipSprite();

    // PHASE 21-1：搏斗水下底图预加载（fishing-down-bg.jpg 1280×720）
    //   - 加载完成前 _renderPlaying Layer 0 走原程序化深水渐变兜底
    preloadFishingDownBg();

    // hotfix-u（2026-06-04）：10 张鱼图预加载（assets/fish/{id}.png）
    //   - 加载完成前 _renderFish 走原椭圆+三角几何兜底，不阻塞战斗
    preloadAllFishSprites();

    // ── 主角头顶名字标签配置 ──────────────────────────────
    this.playerNameConfig = {
      enabled: true,
      text: '阿明',
      fontSize: 14,
      color: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 3,
      offsetY: -115,
      shadowBlur: 6,
      shadowColor: 'rgba(0,0,0,0.8)',
    };
  }

  init(params) {
    this.questParams = params || { target: null, need: 0, progress: 0 };
    // 重置任务完成状态，避免前置任务的完成提示残留显示
    this.taskComplete = false;
    // hotfix-y（2026-06-04）：每次进入钓鱼场景强制重置到 Idle 站立态
    //   原 bug：fishingScene 是模块级单例，第二次进入复用了上次的 fsm 状态/输入标记，
    //   导致"回村按钮触发 Casting 后回村，下次进来还在 Aiming/Casting 蓄力"的死循环。
    //   修复：fsm 拨回 Idle + 清空所有鼠标/键盘按住标记 + 清放大镜/船图/竿动作残留
    if (this.fsm) this.fsm.state = 'Idle';
    this._aimingSpaceHeld = false;
    this._aimingMouseHeld = false;
    this._aimingMouseStartedFlag = false;
    this._playingMouseHeld = false;
    this._confirmClick = false;
    this.tension = 0;
    this.fishHP = 0;
    this.currentFish = null;
    this.caughtFish = null;
    this.showingFishInfo = false;
    this.escapeSpeed = 0;
    this.surgeWarnTimer = 0;
    this._fishExhaustedLatch = false;
    this._hookedFishRef = null;
    this._dmgProjectiles = [];
    this._combo = 0;
    this._comboText = null;
    if (this.castAimSystem && this.castAimSystem.cancelAim) this.castAimSystem.cancelAim();
    const container = document.getElementById('fishing-scene');
    container.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280; this.canvas.height = 720;
    this.canvas.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false; this.ctx.webkitImageSmoothingEnabled = false;
    // 2026-06-02 D5 放大镜真背景：背景层离屏 cache
    //   _renderBackground 后 copy 一份到此 canvas，放大镜从这里读"纯背景像素"
    //   不含鱼影/水草动效/鱼线/浮漂等任何角色层
    this._bgCacheCanvas = document.createElement('canvas');
    this._bgCacheCanvas.width = 1280; this._bgCacheCanvas.height = 720;
    this._bgCacheCtx = this._bgCacheCanvas.getContext('2d');
    this._bgCacheCtx.imageSmoothingEnabled = false;
    this.characterX = this.cw * 0.3; this.platformY = this.ch - 75; this.characterY = this.platformY - 42; this.bobX = this.characterX + 120; this.bobY = this.ch * 0.5 + 90;
    // 初始化输入系统（不监听事件，由 _bindEvents 统一处理）
    this.input.setupListeners(null, null);
    this._bindEvents();
    // 设置Canvas默认字体为腾讯体W7
    this.ctx.font = '16px "TencentSansW7", "PingFang SC", "Noto Sans SC", "Heiti SC", sans-serif';
    // PHASE 21-1 v3.0 W1 D1：FishGroupSystem 三鱼群刷新 + wander AI
    //   挂载点对齐 Nina 指令书 §4：init 末尾 → new + init({canvas, ctx})
    this.fishGroupSystem = new FishGroupSystem();
    this.fishGroupSystem.init({ canvas: this.canvas, ctx: this.ctx });
    // PHASE 21-1 D14：注入前戏 FSM 回调（真吃 / 黑漂 / 误提竿）
    this.fishGroupSystem.onBite       = () => this._startBite({ isLuckyBail: false });
    this.fishGroupSystem.onLucky      = () => this._startBite({ isLuckyBail: true });
    this.fishGroupSystem.onNibbleMiss = (kind) => {
      // kind: 'lite' | 'normal' | 'real'
      //   lite/normal: 空竿 + 降档（TD-D14-6 占位）
      //   real:        真吃晃动期早提 = 温柔早提（空竿，不降档）
      // TODO TD-D14-6：实现 BiteLevelDispatcher.nextLevelMod 降档机制
      console.log(`[D14] NibbleMiss kind=${kind} → 空竿`);
      this._showCodexToast && this._showCodexToast('🪝 空竿了…');
    };
    // PHASE 21-1 v3.0 W1 D2：FishGroupHoverUI 鼠标 hover 检测 + 信息浮窗
    //   依赖 fishGroupSystem 已 init（顺序不可调），canvas 监听器在 init 内绑定
    this.fishGroupHoverUI = new FishGroupHoverUI();
    this.fishGroupHoverUI.init({
      canvas: this.canvas,
      ctx: this.ctx,
      fishGroupSystem: this.fishGroupSystem,
    });
    // PHASE 21-1 v3.0 W1 D4：CastAimSystem 蓄力 + 落点圈 + 抛物线
    //   waterRect = 用户拍板红框范围（避开背景山水/UI 安全边界，仅水域内可钓）
    //   监听器在 init 内绑定，destroy 时解绑
    this.castAimSystem = new CastAimSystem();
    this.castAimSystem.init({
      canvas: this.canvas,
      ctx: this.ctx,
      waterY: this.ch * 0.45,        // 兜底（waterRect 缺失时使用）
      waterRect: { left: 0, top: 380, right: this.cw, bottom: 665 },
      debugDrawWaterRect: false,     // 调试可视化已关闭（验收通过）
    });
    // PHASE 21-1 v3.0 W1 D4：WaterSplashFX 浮漂触水水花 + 涟漪
    this.waterSplashFX = new WaterSplashFX();
    this.waterSplashFX.init({ canvas: this.canvas, ctx: this.ctx });
    // D4 内部 flag：抛物线已完成、当前等待涟漪结束（由 _updateCasting 管理）
    this._castingWaitingSplash = false;
    // 2026-06-02 D7：提竿后延迟进 Reeling 的 setTimeout 句柄（防重入用）
    this._pendingReelTimer = null;

    // PHASE 21-1 D4 扩展：鼠标左键长按蓄力 + 松开抛竿（与空格键并行）
    //   - mousedown(button=0) → _tryStartAimingByInput('mouse')
    //   - mouseup(button=0)   → 标记 _aimingMouseHeld=false，由 _updateAiming 检测释放
    //   - 监听器引用保存便于 destroy 解绑（避免重入残留）
    this._mouseDownAimHandler = (e) => {
      if (e.button !== 0) return;
      // 必须在 Idle 才允许鼠标启动蓄力（避免 Aiming/Casting 期间鼠标点击意外重入）
      if (!this.fsm.is('Idle')) return;
      // hotfix-y（2026-06-04）：回村按钮命中盒内的点击不能触发抛竿
      //   原 bug：mousedown 同帧既触发抛竿（_tryStartAimingByInput）又触发回村 click → 切场景后 Aiming 残留
      //   修复：mousedown 阶段提前判命中盒，直接 return，让 click 事件交给 _returnVillageClickHandler
      if (this._returnVillageBtnRect && this._isReturnVillageBtnVisible && this._isReturnVillageBtnVisible()) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * sx;
        const cy = (e.clientY - rect.top) * sy;
        const r = this._returnVillageBtnRect;
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
          return; // 在回村按钮内，不启动抛竿
        }
      }
      this._tryStartAimingByInput('mouse');
    };
    this._mouseUpAimHandler = (e) => {
      if (e.button !== 0) return;
      // 仅在确实是鼠标启动的蓄力期才响应（避免误清空格启动的 hold flag）
      if (!this.fsm.is('Aiming')) return;
      if (!this._aimingMouseStartedFlag) return;
      this._aimingMouseHeld = false;
    };
    this.canvas.addEventListener('mousedown', this._mouseDownAimHandler);
    this.canvas.addEventListener('mouseup', this._mouseUpAimHandler);

    // PHASE 21-1 hotfix（2026-06-01）：水下搏斗 Playing 阶段，鼠标左键也能"按住拉鱼"，与空格键完全等价。
    //   - 仅 Playing 状态下置位 _playingMouseHeld（避免与 Aiming 蓄力的鼠标流冲突）
    //   - mouseup / mouseleave / blur / 状态切走 都要清掉，防止"虚按"
    this._playingMouseHeld = false;
    this._playingMouseDownHandler = (e) => {
      if (e.button !== 0) return;
      if (!this.fsm.is('Playing')) return;
      this._playingMouseHeld = true;
    };
    this._playingMouseUpHandler = (e) => {
      if (e.button !== 0) return;
      this._playingMouseHeld = false;
    };
    this._playingMouseLeaveHandler = () => { this._playingMouseHeld = false; };
    this.canvas.addEventListener('mousedown', this._playingMouseDownHandler);
    // mouseup / mouseleave 需挂到 window，否则用户在 canvas 外松开会卡住"按住"状态
    window.addEventListener('mouseup', this._playingMouseUpHandler);
    this.canvas.addEventListener('mouseleave', this._playingMouseLeaveHandler);

    // PHASE 21-1 hotfix（2026-06-01b）：BiteWindow / Caught / Failed 三个"等待玩家点空格"状态，
    //   鼠标左键单击与空格键等价。
    //   - 仅在上述 3 个状态下，mousedown(button=0) 置 _confirmClick=true
    //   - 由各状态 update 逻辑里"消费"该 flag（消费后立刻清零）
    //   - 不与 Aiming(_mouseDownAimHandler) / Playing(_playingMouseDownHandler) 冲突
    //     原因：那两个 handler 内部各自有 fsm.is(...) 守卫，置位的是不同字段
    this._confirmClick = false;
    this._confirmMouseDownHandler = (e) => {
      if (e.button !== 0) return;
      const s = this.fsm.state;
      if (s === 'BiteWindow' || s === 'Caught' || s === 'Failed') {
        this._confirmClick = true;
      }
    };
    this.canvas.addEventListener('mousedown', this._confirmMouseDownHandler);

    // 2026-06-05：放大镜下方"放弃"胶囊按钮 click + hover
    //   位置：浮漂正下方（含越界保护）
    //   行为：任何状态点击 → _resetToIdle（回 Idle 重抛）
    //   AABB 由 D5Magnifier.getAbandonBtnRect 提供（兼容 getRecallBtnRect 别名）
    //   "刺鱼"按钮已移除（保留键盘空格 / 点鱼触发提竿，避免误操作）
    const toCanvasXYLocal = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };
    const _hitRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    this._magnifierPetalClickHandler = (e) => {
      if (e.button !== 0) return;
      const mag = this.d5 && this.d5.magnifier;
      if (!mag) return;
      const getRect = mag.getAbandonBtnRect || mag.getRecallBtnRect;
      if (typeof getRect !== 'function') return;
      const r = getRect.call(mag);
      if (!r) return;
      const { x, y } = toCanvasXYLocal(e);
      if (_hitRect(r, x, y)) {
        e.stopPropagation(); // 防止同帧触发 _confirmMouseDownHandler
        this._resetToIdle();
      }
    };
    this._magnifierPetalMoveHandler = (e) => {
      const mag = this.d5 && this.d5.magnifier;
      if (!mag) return;
      const getRect = mag.getAbandonBtnRect || mag.getRecallBtnRect;
      const setHover = mag.setAbandonBtnHovered || mag.setRecallBtnHovered;
      if (typeof getRect !== 'function') return;
      const r = getRect.call(mag);
      const { x, y } = toCanvasXYLocal(e);
      const inBtn = _hitRect(r, x, y);
      if (typeof setHover === 'function') setHover.call(mag, inBtn);
      if (this.canvas) this.canvas.style.cursor = inBtn ? 'pointer' : '';
    };
    // 用 capture 让本 handler 先于 _confirmMouseDownHandler 跑（避免顺序歧义）
    this.canvas.addEventListener('mousedown', this._magnifierPetalClickHandler, true);
    this.canvas.addEventListener('mousemove', this._magnifierPetalMoveHandler);
  }

  start() { this.paused = false; this.lastTime = performance.now();
    // 钓鱼场景 BGM：从程序化水声 ambient → 外部 mp3（music/effects.mp3）
    //   playBGM 内部会先 stopBGM（清掉村庄 BGM 实例），与 village→fishing 切场景天然契合
    AudioSystem.playBGM('music/effects.mp3');
    this._loop();
    // PHASE 16-6 仗4：挂载鱼饵切换 HUD
    baitHUD.mount((index) => this._switchBaitByIndex(index));
  }

  pause() { this.paused = true; if (this.rafId) cancelAnimationFrame(this.rafId); }

  resume() { if (!this.paused) return; this.paused = false; this.lastTime = performance.now(); this._loop(); }

  destroy() {
    this.pause();
    // HOTFIX：场景退出时清理音频（与 village-scene.destroy 对称）
    //   原本依赖"村庄 _init 再 playBGM('village_bgm.mp3')"自动覆盖 effects.mp3，
    //   但异常路径（reload / 切到非村庄场景）会导致 effects.mp3 残留循环。
    AudioSystem.stopAmbient();
    AudioSystem.stopBGM();
    // PHASE 16-6 仗4：卸载鱼饵 HUD
    baitHUD.unmount();
    // 清理 InputSystem 的键盘监听
    this.input.destroy && this.input.destroy();
    // 清理 FishingScene 自己的键盘监听
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      document.removeEventListener('keyup', this._keyUpHandler);
    }
    // PHASE 18 仗5 - 仗3：清理回村按钮 canvas 监听
    if (this.canvas && this._returnVillageClickHandler) {
      this.canvas.removeEventListener('click', this._returnVillageClickHandler);
      this.canvas.removeEventListener('mousemove', this._returnVillageMoveHandler);
      this._returnVillageClickHandler = null;
      this._returnVillageMoveHandler = null;
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    // PHASE 21-1 v3.0 W1 D1：dispose 三鱼群系统（清空 fishes 数组，置空引用）
    if (this.fishGroupSystem) {
      this.fishGroupSystem.dispose();
      this.fishGroupSystem = null;
    }
    // PHASE 21-1 v3.0 W1 D2：dispose hover UI（解绑 canvas mousemove/leave 监听器）
    //   注意顺序：必须先于 canvas 被置 null，否则 dispose 内部 removeEventListener 失败
    if (this.fishGroupHoverUI) {
      this.fishGroupHoverUI.dispose();
      this.fishGroupHoverUI = null;
    }
    // PHASE 21-1 v3.0 W1 D4：dispose CastAimSystem（解绑 mousemove/leave）+ WaterSplashFX
    if (this.castAimSystem) {
      this.castAimSystem.dispose();
      this.castAimSystem = null;
    }
    if (this.waterSplashFX) {
      this.waterSplashFX.dispose();
      this.waterSplashFX = null;
    }
    // PHASE 21-1 D4 扩展：解绑 canvas mousedown/mouseup 蓄力监听器
    if (this.canvas && this._mouseDownAimHandler) {
      this.canvas.removeEventListener('mousedown', this._mouseDownAimHandler);
    }
    if (this.canvas && this._mouseUpAimHandler) {
      this.canvas.removeEventListener('mouseup', this._mouseUpAimHandler);
    }
    this._mouseDownAimHandler = null;
    this._mouseUpAimHandler = null;
    // PHASE 21-1 hotfix：解绑 Playing 阶段鼠标拉鱼监听
    if (this.canvas && this._playingMouseDownHandler) {
      this.canvas.removeEventListener('mousedown', this._playingMouseDownHandler);
    }
    if (this._playingMouseUpHandler) {
      window.removeEventListener('mouseup', this._playingMouseUpHandler);
    }
    if (this.canvas && this._playingMouseLeaveHandler) {
      this.canvas.removeEventListener('mouseleave', this._playingMouseLeaveHandler);
    }
    this._playingMouseDownHandler = null;
    this._playingMouseUpHandler = null;
    this._playingMouseLeaveHandler = null;
    this._playingMouseHeld = false;
    // PHASE 21-1 hotfix（2026-06-01b）：解绑 BiteWindow/Caught/Failed 单击确认监听
    if (this.canvas && this._confirmMouseDownHandler) {
      this.canvas.removeEventListener('mousedown', this._confirmMouseDownHandler);
    }
    this._confirmMouseDownHandler = null;
    this._confirmClick = false;
    this._castingWaitingSplash = false;
    this._aimingMouseHeld = false;

    // 2026-06-05：解绑放大镜双花瓣按钮监听
    if (this.canvas && this._magnifierPetalClickHandler) {
      this.canvas.removeEventListener('mousedown', this._magnifierPetalClickHandler, true);
    }
    if (this.canvas && this._magnifierPetalMoveHandler) {
      this.canvas.removeEventListener('mousemove', this._magnifierPetalMoveHandler);
    }
    this._magnifierPetalClickHandler = null;
    this._magnifierPetalMoveHandler = null;
    this._aimingMouseStartedFlag = false;
    this.canvas = null;
    this.ctx = null;
  }

  _bindEvents() {
    // 清理旧的监听器
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      document.removeEventListener('keyup', this._keyUpHandler);
    }
    
    const self = this;
    console.log('[FishingScene] 初始化键盘监听器');
    
    // 统一的键盘处理器，同时更新 InputSystem 状态
    this._keyHandler = (e) => {
      const key = e.key.toLowerCase();
      console.log('[KeyDown]', key, 'keys状态:', JSON.stringify(self.input.keys));
      
      // 阻止浏览器默认行为
      e.preventDefault();
      
      // 映射按键
      let k = key;
      if (key === 'arrowup') k = 'up';
      else if (key === 'arrowdown') k = 'down';
      else if (key === 'arrowleft') k = 'left';
      else if (key === 'arrowright') k = 'right';
      else if (key === ' ') k = 'space';
      
      // 同步更新 InputSystem 状态
      if (!self.input.keys[k]) self.input.keyPressed[k] = true;
      self.input.keys[k] = true;
      
      // 教程面板：按空格关闭
      if (key === ' ' && self._tutorialCloseHandler) {
        self._tutorialCloseHandler();
        self._tutorialCloseHandler = null;
        return;
      }
      // 特殊按键处理
      if (key === 'r' && self.taskComplete) {
        // PHASE Step2：旧 tile (10,8) → 新 tile (21,16)，落在栈桥附近
        self.pause(); SceneManager.switchToInstant('village', { spawnAt: { x: 21, y: 16 } });
      }
      if (key === 'escape' && !self.taskComplete) self._showEscapeConfirm();
    };
    
    this._keyUpHandler = (e) => {
      const key = e.key.toLowerCase();
      console.log('[KeyUp]', key, 'keys状态:', JSON.stringify(self.input.keys));
      e.preventDefault();
      
      // 映射按键
      let k = key;
      if (key === 'arrowup') k = 'up';
      else if (key === 'arrowdown') k = 'down';
      else if (key === 'arrowleft') k = 'left';
      else if (key === 'arrowright') k = 'right';
      else if (key === ' ') k = 'space';
      
      // 同步更新 InputSystem 状态
      self.input.keys[k] = false;
    };
    
    document.addEventListener('keydown', this._keyHandler);
    document.addEventListener('keyup', this._keyUpHandler);

    // PHASE 18 仗7：钓鱼场景"回村"HUD 按钮（右下角 + 入水后隐藏）
    //   坐标 1096,656 / w=160,h=40 → 占 [1096,656]~[1256,696]，距右/底各 24px
    //   避让：装备钓竿木牌（左下 [20,660]~[300,700]）、操作提示（中下 [430,620]~[850,690]）、
    //         任务HUD（右上 y≤325）、baitHUD（顶部）。仅与"奇力鱼信息面板"(Playing 时 [1020,545]~[1260,700])
    //         水平重叠，但本仗已让 Playing/Waiting/BiteWindow/Reeling 期间隐藏按钮 → 不会同框。
    //   点击 → 复用现有回村流程：taskComplete=true → 直接回村；否则调 _showEscapeConfirm()
    //   不替代/不改键盘 R/ESC（铁律：键盘零回归；隐藏期间快捷键照常生效）
    this._returnVillageBtnRect = { x: 1096, y: 656, w: 160, h: 40 };
    this._returnVillageBtnHovered = false;

    const toCanvasXY = (e) => {
      const rect = self.canvas.getBoundingClientRect();
      const sx = self.canvas.width / rect.width;
      const sy = self.canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };
    this._returnVillageClickHandler = (e) => {
      if (e.button !== 0 || !self.canvas) return;
      // PHASE 18 仗7：按钮隐藏期间不响应点击（视觉/逻辑双门禁，避免"隐身按钮"被误触）
      if (!self._isReturnVillageBtnVisible()) return;
      const r = self._returnVillageBtnRect;
      const { x, y } = toCanvasXY(e);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        e.stopPropagation();
        self._handleReturnVillage();
      }
    };
    this._returnVillageMoveHandler = (e) => {
      if (!self.canvas) return;
      // PHASE 18 仗7：按钮隐藏期间清掉 hover 态 + 复位光标
      if (!self._isReturnVillageBtnVisible()) {
        if (self._returnVillageBtnHovered) {
          self._returnVillageBtnHovered = false;
          self.canvas.style.cursor = 'default';
        }
        return;
      }
      const r = self._returnVillageBtnRect;
      const { x, y } = toCanvasXY(e);
      const inBtn = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      self._returnVillageBtnHovered = inBtn;
      self.canvas.style.cursor = inBtn ? 'pointer' : 'default';
    };
    if (this.canvas) {
      this.canvas.addEventListener('click', this._returnVillageClickHandler);
      this.canvas.addEventListener('mousemove', this._returnVillageMoveHandler);
    }
  }

  /**
   * PHASE 18 仗7：回村按钮可见性判定（鱼钩入水后隐藏）
   *   显示：Idle / Aiming / Casting（抛竿前 + 抛竿动作中，浮标尚未触水）
   *   隐藏：Waiting / BiteWindow / Reeling / Playing / Caught / Failed（水下交互期 + 结算期）
   *   ⚠️ 仅控制视觉 + 鼠标命中盒；R/ESC 键盘快捷键照常生效（铁律：键盘零回归）
   *   ⚠️ 与 baitHUD 同步策略（line 473-476 仗4 HOTFIX2 模板）保持一致风格
   */
  _isReturnVillageBtnVisible() {
    if (!this.fsm) return true;
    const s = this.fsm.state;
    return s === 'Idle' || s === 'Aiming' || s === 'Casting';
  }

  /**
   * PHASE 18 仗5 - 仗3：统一回村入口（HUD 按钮 / R 键 / ESC 共用）
   *   - taskComplete=true → 任务完成可直接回村（与 R 键流程一致）
   *   - taskComplete=false → 弹原 _showEscapeConfirm 确认窗（与 ESC 流程一致）
   */
  _handleReturnVillage() {
    if (this.taskComplete) {
      this.pause();
      // PHASE Step2：旧 tile (10,8) → 新 tile (21,16)
      SceneManager.switchToInstant('village', { spawnAt: { x: 21, y: 16 } });
    } else {
      this._showEscapeConfirm();
    }
  }

  _showEscapeConfirm() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000;';
    overlay.innerHTML = `<div style="width:500px;height:200px;background:#F4E4C1;border:2px solid #3D2B1F;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'TencentSans','PingFang SC','Noto Sans SC','Heiti SC',sans-serif;color:#3D2B1F;font-size:24px;font-weight:bold;">
      <p style="margin:0 0 24px">要回村庄吗？任务进度已保存</p>
      <div style="display:flex;gap:24px;">
        <button id="esc-yes" style="padding:12px 32px;font-size:20px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;">Y - 确认</button>
        <button id="esc-no" style="padding:12px 32px;font-size:20px;background:#F44336;color:#fff;border:none;border-radius:8px;cursor:pointer;">N - 取消</button>
      </div>
    </div>`;
    document.getElementById('fishing-scene').appendChild(overlay);
    overlay.querySelector('#esc-yes').onclick = () => { overlay.remove(); this.pause(); SceneManager.switchToInstant('village', { spawnAt: { x: 21, y: 16 } }); };
    overlay.querySelector('#esc-no').onclick = () => overlay.remove();
  }

  // PHASE 16-6 仗4：按索引（0/1/2）切换鱼饵
  //   数字键 1/2/3 与 HUD 鱼饵图标点击共用此入口
  //   - 切换前校验该档库存：=0 时拒绝切换 + 飘字
  //   - 切换后写 player.equippedBait + commit + 通知 HUD 刷新
  _switchBaitByIndex(index) {
    const order = ['basic_bait', 'advanced_bait', 'legendary_bait'];
    const targetId = order[index];
    if (!targetId) return;
    const count = window.inventory ? window.inventory.getCount(targetId) : 0;
    const baitName = BAIT_EFFECTS[targetId]?.name || targetId;
    if (count <= 0) {
      this._showCodexToast(`❌ ${baitName} 库存为 0`);
      return;
    }
    const currentId = window.Save?.get('player.equippedBait') || 'basic_bait';
    if (currentId === targetId) return;  // 已装备，无需切换
    window.Save?.set('player.equippedBait', targetId);
    window.Save?.commit();
    this._showCodexToast(`${BAIT_EFFECTS[targetId]?.icon || ''} 已切换：${baitName}`);
    if (window.fishingHUD) window.fishingHUD.render();
  }

  _showCodexToast(text) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 25%; left: 50%; transform: translate(-50%, -50%);
      padding: 16px 36px; background: rgba(0,0,0,0.85); color: #FFD700;
      font: bold 28px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif; border: 3px solid #FFD700;
      border-radius: 12px; z-index: 800; pointer-events: none;
      animation: codexToastFade 2.5s ease-out forwards;
    `;
    toast.textContent = text;
    document.body.appendChild(toast);
    if (!document.getElementById('codex-toast-style')) {
      const style = document.createElement('style');
      style.id = 'codex-toast-style';
      style.textContent = `
        @keyframes codexToastFade {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          25%  { transform: translate(-50%, -50%) scale(1); }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -60%); }
        }
      `;
      document.head.appendChild(style);
    }
    setTimeout(() => toast.remove(), 2500);
  }

  _loop() {
    if (this.paused) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000; this.lastTime = now;
    const dt = Math.min(rawDt, 0.1) * this.timeScale;
    this.time += dt;
    this._update(dt);
    this._render();
    this.rafId = requestAnimationFrame(this._loop.bind(this));
  }

  _update(dt) {
    if (!this.ctx || !this.canvas) return;
    const s = this.fsm.state;
    if (s === 'Idle') this._updateIdle();
    else if (s === 'Aiming') this._updateAiming(dt);
    else if (s === 'Casting') this._updateCasting(dt);
    else if (s === 'Waiting') this._updateWaiting(dt);
    else if (s === 'BiteWindow') this._updateBiteWindow(dt);
    else if (s === 'Reeling') this._updateReeling(dt);
    else if (s === 'Playing') this._updatePlaying(dt);
    else if (s === 'Caught') this._updateCaught(dt);
    else if (s === 'Failed') this._updateFailed(dt);
    this.particles.update(dt);
    // PHASE 21-1 D5：推进鱼咬钩反馈系统（zone 判定 / 演出层计时）
    if (this.d5) this.d5.update(dt);
    // 日月潭环境动画更新
    this._updateEnvBirds(dt); this._updateEnvLeaves(dt); this._updateEnvClouds(dt);
    this._updateSmallFish(dt);
    // PHASE 16-6 仗4 HOTFIX2：鱼饵 HUD 仅在抛竿前（Idle/Aiming）可见
    //   水下拉扯（Casting/Waiting/BiteWindow/Reeling/Playing）+ 鱼获结算（Caught/Failed）期间隐藏
    if (window.fishingHUD) {
      window.fishingHUD.setVisible(s === 'Idle' || s === 'Aiming');
    }
    // PHASE 21-1 v3.0 W1 D1：驱动三鱼群 wander AI
    //   单位换算：本场景 dt 单位为「秒」（line 496 / 1000 已换算），
    //   FishGroupSystem.update 内部按「毫秒」工作（与 Nina 指令书 §3.4 / §5
    //   骨架一致：turnCooldown=800~2000ms / dt/1000 积分），
    //   故此处 dt * 1000 转回毫秒传入。
    if (this.fishGroupSystem) {
      this.fishGroupSystem.update(dt * 1000);
    }
    // PHASE 21-1 v3.0 W1 D2：推进 hover UI 状态机（同样毫秒单位）
    if (this.fishGroupHoverUI) {
      this.fishGroupHoverUI.update(dt * 1000);
    }
    // PHASE 21-1 v3.0 W1 D4：推进 CastAimSystem + WaterSplashFX（毫秒单位）
    //   - CastAimSystem 内部计时基于 performance.now()，update 主要做未来扩展占位
    //   - WaterSplashFX 同样基于 performance.now()，update 内做超时检查
    if (this.castAimSystem) this.castAimSystem.update(dt * 1000);
    if (this.waterSplashFX) this.waterSplashFX.update(dt * 1000);
    this.input.clearPressed();
  }

  // ────────────────────────────────────────────────────────────
  // PHASE 21-1 D4 扩展：进入蓄力的统一入口（空格键 / 鼠标左键 共享）
  // ------------------------------------------------------------
  // 来源：
  //   - 'space'：来自 _updateIdle 的键盘事件
  //   - 'mouse'：来自 canvas 'mousedown' 监听（左键 button=0）
  // 共享的前置检查（任何来源都必须经过）：
  //   1) 体力 ≥ 2（PHASE 17 仗1）
  //   2) 鱼饵库存 > 0（PHASE 16-6 仗4，含自动切回 basic_bait + 缺饵双轨提示）
  // 状态机转换：fsm.transition('Aiming') + castAimSystem.beginAim()
  // hold flag 设置：
  //   - source='space' → _aimingSpaceHeld=true / _aimingMouseHeld=false
  //   - source='mouse' → _aimingMouseHeld=true / _aimingSpaceHeld=false
  // 返回值：true=已进入 Aiming，false=被前置检查阻断
  // ────────────────────────────────────────────────────────────
  _tryStartAimingByInput(source) {
    // 必须 Idle 状态才能开始蓄力（Aiming/Casting/Waiting 等都不允许重入）
    if (!this.fsm.is('Idle')) return false;

    // 体力校验
    if (window.StaminaSystem && window.StaminaSystem.getCurrent() < 2) {
      if (typeof window.showFloatText === 'function') {
        window.showFloatText('💤 体力不足，去秀兰阿姨家休息吧', { color: '#FF6B6B' });
      }
      return false;
    }

    // 鱼饵校验（含自动切回 basic_bait + 缺饵双轨提示）
    const equippedBaitId = window.Save?.get('player.equippedBait') || 'basic_bait';
    const baitCount = window.inventory ? window.inventory.getCount(equippedBaitId) : 1;
    if (baitCount <= 0) {
      const basicCount = window.inventory ? window.inventory.getCount('basic_bait') : 0;
      if (equippedBaitId !== 'basic_bait' && basicCount > 0) {
        window.Save?.set('player.equippedBait', 'basic_bait');
        window.Save?.commit();
        this._showCodexToast('🪱 鱼饵不足，已切换为初级鱼饵');
        if (window.fishingHUD) window.fishingHUD.render();
      } else {
        const linShifuOpen = questSystem.getStatus('q003') === 'completed';
        const tip = linShifuOpen
          ? '❌ 鱼饵不足！可去林师傅店购买，或到农田/花圃挖蚯蚓'
          : '❌ 鱼饵不足！去农田或花圃挖蚯蚓吧';
        this._showCodexToast(tip);
        return false;
      }
    }

    // 通过 → 进入 Aiming
    console.log('🎣 进入蓄力状态（来源：' + source + '）');
    this.fsm.transition('Aiming', 'press ' + source);
    this.aimPower = 0;
    if (this.castAimSystem) this.castAimSystem.beginAim();

    // hold flag：记录是哪个键启动的，_updateAiming 据此检测释放
    if (source === 'space') {
      this._aimingSpaceHeld = this.input.isDown('space');
      this._aimingMouseHeld = false;
      this._aimingMouseStartedFlag = false;
    } else {
      this._aimingSpaceHeld = false;
      this._aimingMouseHeld = true;
      this._aimingMouseStartedFlag = true;
    }
    return true;
  }

  _updateIdle() {
    // 使用 wasPressed 检测按键按下的瞬间，进入蓄力状态
    const spacePressed = this.input.wasPressed('space');
    if (spacePressed) {
      // PHASE 21-1 D4 扩展：抽到 helper 与鼠标左键共享体力/鱼饵检查 + transition 逻辑
      this._tryStartAimingByInput('space');
    }
    if (this.input.wasPressed('b')) this._toggleAtlas();

    // PHASE 16-6 仗4：数字键 1/2/3 切换鱼饵
    for (let i = 0; i < 3; i++) {
      if (this.input.wasPressed(String(i + 1))) {
        this._switchBaitByIndex(i);
      }
    }
  }

  _updateAiming(dt) {
    // PHASE 21-1 D4：蓄力机制由 CastAimSystem 接管（按住时间累加 0.3~1.5s）
    //   原 v2.0 三角振荡 aimPower 保留为 0~100 显示用映射，不再决定落点距离
    //   落点 = CastAimSystem 内部锁定的鼠标位置（confirmCast 返回）
    if (this.castAimSystem) {
      this.aimPower = Math.round(this.castAimSystem.getChargeBarRatio() * 100);
    }

    // PHASE 21-1 D4 扩展：检测释放（空格 OR 鼠标，任一）
    //   - 空格启动 → spaceReleased = _aimingSpaceHeld && !isDown('space')
    //   - 鼠标启动 → mouseReleased = _aimingMouseHeld 之前为 true 现在 mouseup 设为 false
    //   两者任一为 true → 释放抛竿；混用按键启动以最先释放的那个为准
    const spaceReleased = this._aimingSpaceHeld && !this.input.isDown('space');
    const mouseReleased = this._aimingMouseStartedFlag && !this._aimingMouseHeld;
    const released = spaceReleased || mouseReleased;

    if (released) {
      console.log('🎯 释放抛竿！蓄力:', this.aimPower, '来源:', spaceReleased ? 'space' : 'mouse');
      // PHASE 21-1 D4：砍掉过蓄力惩罚（红线 §6-8「不实现过蓄力惩罚」）
      //   原 if (aimPower >= powerOverload) → Failed 分支整段移除
      this.fsm.transition('Casting', 'release');
      this.castProgress = 0;
      // PHASE 21-C v1.4：抛物线起点 = 程序化钓竿帧 2（甩出）的实际竿尖位置
      //   - sprite 启用时：用 _renderRodAndBob 帧 2 配置反推竿尖
      //     handX=20, handY=-40, rodAngle=-π*0.35, ROD_LENGTH=180
      //   - sprite 未就绪：回退原硬编码 (characterX-75, characterY-15)
      //   castFrom 必须与可视竿尖一致，否则飞行浮漂从空中"凭空蹦出"
      let castFromComputed;
      if (isAmingFishSheetReady()) {
        const rodAngle = -Math.PI * 0.35;
        const ROD_LENGTH = 180;
        castFromComputed = {
          x: this.characterX + 20 + Math.cos(rodAngle) * ROD_LENGTH,
          y: this.characterY - 40 + Math.sin(rodAngle) * ROD_LENGTH,
        };
      } else {
        castFromComputed = { x: this.characterX - 75, y: this.characterY - 15 };
      }
      this.castFrom = castFromComputed;
      // 抛物线终点 = CastAimSystem 锁定的鼠标位置（替代原三档固定 dist）
      const landingPoint = this.castAimSystem
        ? this.castAimSystem.confirmCast(this.castFrom)
        : { x: Math.min(this.cw - 90, this.castFrom.x + 420), y: this.ch * 0.55 + 60 };
      this.castTo = { x: landingPoint.x, y: landingPoint.y };
      // bobX/bobY 在抛物线动画完成时再 commit；动画期间由 CastAimSystem.getCurrentBobPos() 提供
      AudioSystem.playCast();
      this._aimingEHeld = false;
      this._aimingSpaceHeld = false;
      this._aimingMouseHeld = false;
      this._aimingMouseStartedFlag = false;
    }
    if (this.input.wasPressed('q') || this.input.wasPressed('escape')) {
      this.fsm.transition('Idle', 'cancel');
      // PHASE 21-1 D4：通知 CastAimSystem 取消蓄力（落点圈/进度条立即消失）
      if (this.castAimSystem) this.castAimSystem.cancelAim();
      this._aimingEHeld = false;
      this._aimingSpaceHeld = false;
      this._aimingMouseHeld = false;
      this._aimingMouseStartedFlag = false;
    }
  }

  _updateCasting(dt) {
    // PHASE 21-1 D4：Casting 阶段两段式 —— 抛物线 0.5s → 触发水花涟漪 1.2s → Waiting
    //   原 v2.0：castProgress 累加到 1（共 0.8s）→ 直接 Waiting
    //   新 v3.0：castAimSystem.isCastComplete() 触发水花，等 waterSplashFX 1.2s 完成才 Waiting
    if (!this._castingWaitingSplash) {
      // 阶段 A：抛物线进行中（CastAimSystem 内部计时）
      if (this.castAimSystem && this.castAimSystem.isCastComplete()) {
        // 抛物线动画完成 → commit landingPoint 到 bobX/bobY → 触发水花涟漪
        if (this.castTo) {
          this.bobX = this.castTo.x;
          this.bobY = this.castTo.y;
        }
        // PHASE 21-1 D14：浮漂落水即触发受惊扫描（鱼群 AABB 距离判定，命中群全员进 flee）
        if (this.fishGroupSystem && typeof this.fishGroupSystem.applyScare === 'function') {
          this.fishGroupSystem.applyScare(this.bobX, this.bobY);
        }
        if (this.waterSplashFX && this.castTo) {
          this.waterSplashFX.trigger(this.castTo.x, this.castTo.y);
        }
        if (this.castAimSystem) this.castAimSystem.finishCast();
        this._castingWaitingSplash = true;
      }
    } else {
      // 阶段 B：水花涟漪进行中（1.2s），动画结束才转 Waiting
      if (!this.waterSplashFX || !this.waterSplashFX.isActive()) {
        this.fsm.transition('Waiting', 'cast complete');
        this.waitTimer = 0;
        this.currentFish = null;
        // PHASE 21-1 D14：fishShadow 字段已删除（旧"幽灵鱼游向浮漂"已移除）
        this._castingWaitingSplash = false;
      }
    }
    // 兼容兜底：castAimSystem 缺席时退回原 v2.0 castProgress 行为
    if (!this.castAimSystem) {
      const cfg = CONFIG.casting;
      const totalDuration = cfg.windUpDuration + cfg.swingDuration + cfg.releaseDuration;
      this.castProgress += dt / totalDuration;
      if (this.castProgress >= 1) {
        this.fsm.transition('Waiting', 'cast complete');
        this.waitTimer = 0;
        this.currentFish = null;
        // PHASE 21-1 D14：fishShadow 字段已删除；兜底分支也触发受惊
        if (this.fishGroupSystem && typeof this.fishGroupSystem.applyScare === 'function') {
          this.fishGroupSystem.applyScare(this.bobX, this.bobY);
        }
      }
    }
  }

  _updateWaiting(dt) {
    this.waitTimer += dt; this._updateWaitingBite(dt);
    // PHASE 21-1 D14：BobberApproachFSM 前戏层（替代旧 fishShadow 链路）
    if (this.fishGroupSystem && typeof this.fishGroupSystem.tickBobberApproach === 'function') {
      this.fishGroupSystem.tickBobberApproach(dt, this.bobX, this.bobY);
    }
    // PHASE 21-1 D14：Waiting 期空格/鼠标左键 = 提竿
    //   试探/偷吃晃动期 → 空竿 + 降档（轻罚）
    //   真吃晃动期      → 空竿 但不降档（温柔早提，鼓励敢提）
    //   其他时段         → 静默无效（避免乱按惩罚滥用）
    const pulled = this.input.wasPressed('space') || this._confirmClick;
    if (pulled) {
      this._confirmClick = false;
      if (this.fishGroupSystem && typeof this.fishGroupSystem.getCurrentBitePhase === 'function') {
        const p = this.fishGroupSystem.getCurrentBitePhase();
        if (p.phase === 'biting' && !p.handedOff) {
          if (p.biteType === 'nibble_lite') {
            if (this.fishGroupSystem.onNibbleMiss) this.fishGroupSystem.onNibbleMiss('lite');
          } else if (p.biteType === 'nibble') {
            if (this.fishGroupSystem.onNibbleMiss) this.fishGroupSystem.onNibbleMiss('normal');
          } else if (p.biteType === 'bite') {
            if (this.fishGroupSystem.onNibbleMiss) this.fishGroupSystem.onNibbleMiss('real');
          }
          // 重启前戏（派出去的鱼放回，重新派）
          this.fishGroupSystem.resetBobberApproach();
        }
      }
    }
    if (this.input.wasPressed('q') || this.input.wasPressed('escape')) this._resetToIdle();
  }

  _selectFish() {
    // PHASE 21-1 D14 hotfix-n：鱼池统一 + q003 门禁 + 删 FISH_POOL.js legacy 映射
    const rod = window.equipment ? window.equipment.getEquippedRod() : { bigFishBonus: 0, maxSizeMul: 1.0, damageMul: 1.0 };
    const fishData = rollFishWithRod(rod);
    if (!fishData) {
      // 防御性兜底：理论上 SHUISHE 池非空 + q003 未完成时也有 ★1-3 鱼，不会进这里
      console.warn('[FishPool] rollFishWithRod returned null, fallback to first fish');
      const f0 = SHUISHE_FISH_POOL[0];
      this.currentFish = this._buildCurrentFish(f0, f0.sizeRange[0]);
      return;
    }
    // hotfix-n：直接用 SHUISHE 数据，color/hpPerTick 字段已在池中
    this.currentFish = this._buildCurrentFish(fishData, fishData.size);
    this.fishHP = this.currentFish.maxHP;

    // ─────────────────────────────────────────────────────────
    // PHASE 16-6 仗4 + hotfix-n：鱼饵效果末端注入
    //   - rarityShift +1：必把档位升一级
    //   - rarityBonus 0.3：30% 概率提档 1 级
    //   - sizeMul：作用于 size[0]
    //   - 提档时从 SHUISHE 池按 rarity 重抽一条（受 q003 门禁限制）
    // ─────────────────────────────────────────────────────────
    this._lastBaitTrigger = null;  // 'shift' | 'bonus' | null
    const equippedBaitId = window.Save?.get('player.equippedBait') || 'basic_bait';
    const baitEffect = getBaitEffect(equippedBaitId);
    if (baitEffect && (baitEffect.rarityShift > 0 || baitEffect.rarityBonus > 0 || baitEffect.sizeMul !== 1.0)) {
      // hotfix-n：天花板 = q003 门禁后的池子最高 rarity（未完成 q003 时 = 3）
      const q003Done = window.questSystem && window.questSystem.getStatus('q003') === 'completed';
      const ceiling = q003Done ? 5 : 3;

      let targetRarity = this.currentFish.rarity;
      if (baitEffect.rarityShift > 0) {
        targetRarity = Math.min(ceiling, this.currentFish.rarity + baitEffect.rarityShift);
        if (targetRarity > this.currentFish.rarity) this._lastBaitTrigger = 'shift';
      } else if (baitEffect.rarityBonus > 0 && Math.random() < baitEffect.rarityBonus) {
        targetRarity = Math.min(ceiling, this.currentFish.rarity + 1);
        if (targetRarity > this.currentFish.rarity) this._lastBaitTrigger = 'bonus';
      }

      if (targetRarity > this.currentFish.rarity) {
        const candidates = SHUISHE_FISH_POOL.filter(f => f.rarity === targetRarity);
        if (candidates.length > 0) {
          const newFish = candidates[Math.floor(Math.random() * candidates.length)];
          const [minS, maxS] = newFish.sizeRange;
          const newSize = Math.round((minS + Math.random() * (maxS - minS)) * (rod.maxSizeMul || 1.0) * 10) / 10;
          this.currentFish = this._buildCurrentFish(newFish, newSize);
          this.fishHP = this.currentFish.maxHP;
        }
      }

      if (baitEffect.sizeMul !== 1.0) {
        this.currentFish.size[0] = Math.round(this.currentFish.size[0] * baitEffect.sizeMul * 10) / 10;
        this.currentFish.size[1] = this.currentFish.size[0] * 0.5;
      }

      if (this._lastBaitTrigger === 'shift') this._showCodexToast('✨ 极品香饵威力！');
      else if (this._lastBaitTrigger === 'bonus') this._showCodexToast('🌸 香饵生效！');
    }
  }

  /**
   * PHASE 21-1 D14 hotfix-n：用 SHUISHE 鱼数据 + 体长构造 currentFish。
   * 取代旧 FISH_POOL legacy 映射；color/hpPerTick/hpDrain 全从 SHUISHE 数据直读。
   * @param {object} f    SHUISHE_FISH_POOL 中的鱼对象（含 color / hpPerTick / hpDrain 等）
   * @param {number} size 体长 cm（已乘 rod.maxSizeMul）
   */
  _buildCurrentFish(f, size) {
    return {
      id: f.id,
      name: f.species,
      rarity: f.rarity,
      color: f.color || '#4682B4',
      size: [size, size * 0.5],
      price: f.basePrice,
      baseProb: f.baseProb,
      maxHP: f.hp,
      // hotfix-n 新字段：每 3 秒安全区扣血量（基础值，未乘 rod.damageMul）
      hpPerTick: f.hpPerTick || 5,
      // hotfix-o 新字段：放松时每秒回血量（按个体差异化，覆盖旧全局 fishHPRecoverPerSecond）
      hpRecoverPerSecond: f.hpRecoverPerSecond != null ? f.hpRecoverPerSecond : 8,
      hpDrain: f.hpDrain || 0,  // @deprecated 保留
      fishPull: f.fishPull || 0,
      behavior: f.behavior || 'none',
      legendary: !!f.legendary,
      icon: f.icon,
    };
    // 注：调用方负责 this.fishHP = this.currentFish.maxHP（_initPlayingState 会做）
  }

  // PHASE 21-1 D5：鱼咬钩瞬间 —— 直接进入 BiteWindow，由 D5 系统接管全部前奏/反馈
  // v2.0 旧逻辑（biteSink 三次下沉 + playBite 程序音效）已彻底移除
  // PHASE 21-1 D14：opts.isLuckyBail 透传给 D5，让黑漂跳 shake 直入 sink
  _startBite(opts = {}) {
    if (!this.fsm.is('Waiting')) return;
    // PHASE 21-1 D14 hotfix：旧 fishShadow 链路在 _updateWaiting L941 调 _selectFish
    //   设 currentFish，新前戏链路（onBite/onLucky）跳过了这步，导致 _initPlayingState
    //   读 currentFish.maxHP 时 NPE。这里补回 —— 在每次真吃/黑漂触发前 roll 鱼种
    if (!this.currentFish) this._selectFish();
    // hotfix-z（2026-06-04）：在前戏 FSM 被 reset 之前，先抓住"上钩鱼"的引用
    //   战斗胜利后由 _onFishCaught 调 removeFishFromGroup(ref) 真正删除
    //   战斗失败/跑鱼时，ref 被 _resetToWaiting / _resetToIdle 主动清掉，鱼仍留在群里（合理）
    this._hookedFishRef = null;
    if (this.fishGroupSystem && typeof this.fishGroupSystem.takeHookedFishRef === 'function') {
      this._hookedFishRef = this.fishGroupSystem.takeHookedFishRef();
    }
    // 进 BiteWindow 之前清前戏 FSM（接棒给 D5）
    if (this.fishGroupSystem && typeof this.fishGroupSystem.resetBobberApproach === 'function') {
      this.fishGroupSystem.resetBobberApproach();
    }
    this.fsm.transition('BiteWindow', 'fish bite (D5)');
    const rod = window.equipment ? window.equipment.getEquippedRod() : null;
    const windowMul = rod ? rod.qteWindowMul : 1.0;
    // 根据"这条鱼"的 rarity 抽抖动档（含越档扰动）
    const rarity = (this.currentFish && this.currentFish.rarity) || 1;
    this.biteLevel = BiteLevelDispatcher.resolve(rarity);
    this.biteWindowElapsed = 0;
    const winCfg = CONFIG.biteWindow.windows[this.biteLevel] || { total: CONFIG.biteWindow.duration };
    this.biteWindowTimer = winCfg.total * windowMul;
    if (this.d5) this.d5.onBiteStart(this.biteLevel, { isLuckyBail: !!opts.isLuckyBail });
  }

  _updateWaitingBite(_dt) { /* D5 接管，无需 Waiting 阶段前奏逻辑 */ }

  _updateBiteWindow(dt) {
    // 2026-06-02：已 schedule 进 Reeling（300ms 过渡期内），冻结本帧所有判定
    //   - 防止 timer 走到 0 误判 timeout Failed
    //   - 防止玩家在过渡期内再次按空格重复触发
    if (this._pendingReelTimer) return;
    this.biteWindowTimer -= dt;
    // PHASE 21-1 D5：累计本窗口经过秒数，用于 zone 判定 + 抖动帧索引
    this.biteWindowElapsed = (this.biteWindowElapsed || 0) + dt;

    // hotfix（2026-06-01b）：空格 OR 鼠标左键单击 都能提竿
    if (this.input.wasPressed('space') || this._confirmClick) {
      this._confirmClick = false;
      // PHASE 21-1 D5 v2.1：四段判定 —— shake(早提=fail) / perfect / good / late
      const level = this.biteLevel || 'light';
      const w = (CONFIG.biteWindow.windows[level]) || null;
      const t = this.biteWindowElapsed;
      let zone = 'perfect';
      if (w) {
        if (t < w.shakeEnd)       zone = 'shake';    // 早提！
        else if (t < w.perfect[1]) zone = 'perfect';
        else if (t < w.good[1])    zone = 'good';
        else                        zone = 'late';
      }

      if (zone === 'shake') {
        // 早提 → 直接 Failed，原因 'early'
        if (this.d5) this.d5.onBiteWindowExit();
        this.failedReason = 'early';
        this.fsm.transition('Failed', 'early');
        return;
      }

      if (this.d5) {
        if (zone === 'perfect') this.d5.onPerfectHit(level);
        else                    this.d5.onLineUp();
        this.d5.onBiteWindowExit();
      }
      // 2026-06-02：提竿成功后延迟 800ms 进入水下视角，
      //   过渡期足够让 PERFECT 字主体浮起 + 浮漂自然沉完（sink 段最长 1.4s 截到 ~57%~80%）
      //   + 放大镜下滑消失（180ms）。早提 / 漏提 Failed 不走此延迟。
      this._scheduleReelingTransition(800);
      return;
    }
    if (this.biteWindowTimer <= 0) {
      // PHASE 21-1 D5：漏提演出（800ms 内独立计时，不阻塞状态机）
      if (this.d5) {
        this.d5.onLateMiss();
        this.d5.onBiteWindowExit();
      }
      this.failedReason = 'timeout';
      this.fsm.transition('Failed', 'timeout');
    }
  }

  _startReeling() { this.fsm.transition('Playing', 'success bite'); this._initPlayingState(); }

  /**
   * 提竿成功后的延迟过渡（2026-06-02）
   *   delayMs 内仍停留在 BiteWindow 状态（FSM 不变），仅让 D5 演出层继续跑：
   *     - PERFECT 字浮起
   *     - 浮漂沉到剪影底
   *     - 放大镜往下滑出
   *   到时再切 Playing。
   *   防重入：若已有 pending 计时器，直接复用，不叠加
   *   中断保护：reset / Failed 路径会清掉计时器，防止延迟内场景被切换后还误入 Reeling
   */
  _scheduleReelingTransition(delayMs) {
    if (this._pendingReelTimer) return; // 已在排队
    this._pendingReelTimer = setTimeout(() => {
      this._pendingReelTimer = null;
      // 只有仍在 BiteWindow（没被异常路径打断）才真的进 Playing
      if (this.fsm.is('BiteWindow')) this._startReeling();
    }, delayMs);
  }

  _cancelPendingReel() {
    if (this._pendingReelTimer) {
      clearTimeout(this._pendingReelTimer);
      this._pendingReelTimer = null;
    }
  }

  _initPlayingState() {
    const cfg = CONFIG.playing; const w = this.cw; const h = this.ch;
    // hotfix（2026-06-01）：进入 Playing 强制清零鼠标按住标记，避免上一回合残留
    this._playingMouseHeld = false;
    // 纯水下视角：鱼线从右上角（模拟从水面伸入）
    this.lineStartX = w - 60; this.lineStartY = 30;
    // 鱼初始位置在水下中央区域
    const centerX = w * 0.45; const centerY = h * 0.55; const rangeX = w * 0.15; const rangeY = h * 0.12;
    this.playingFishX = centerX + (Math.random() - 0.5) * rangeX * 2; this.playingFishY = centerY + (Math.random() - 0.5) * rangeY * 2;
    // PHASE 21-1 D7：biteLevel 透传 → 初始张力"第一印象"（老板拍板 B，保留越档悬念）
    //   见 docs/PHASE-21-1-D7-impl-spec.md §3。真实难度仍由 behavior + HP 决定，本字段仅调起手张力反差。
    //   null 兜底 60：异常路径 / GM 跳转（_initPlayingState 也被 L1473 GM 调用）
    const _bt = (cfg.biteInitialTension && cfg.biteInitialTension[this.biteLevel]) || 60;
    this.escapeSpeed = cfg.fishEscapeSpeed; this.tension = _bt; this.escapeBurstTimer = 0; this.fishMaxHP = this.currentFish.maxHP;
    this.fishYCenter = this.playingFishY; this.fishYTime = Math.random() * Math.PI * 2; this.escapeCheckTimer = 0; this.warningShown = false;
    this.slackTimer = 0; // PHASE 13-4：tension≤0 累计秒数，超过 slackFailGrace 则 slack 失败
    // PHASE 21-1 D14 hotfix-n：HP 扣血改 3 秒安全区 tick
    //   每帧累加 dt 到 safeTickTimer；满 3.0s 且 tension ∈ [low, high] 时扣 hpPerTick × damageMul
    this.safeTickTimer = 0;
    // PHASE 21-1 D14 hotfix-o：扣血反馈状态字段
    //   _fishHitShakeUntil：鱼图标抖动结束时间戳（performance.now()）
    //   _damageTexts：飘字队列（{x, y, text, color, life, vy}）
    this._fishHitShakeUntil = 0;
    this._damageTexts = [];
    // ───────────── PHASE 15：鱼行为状态机 + 视觉预警状态位 ─────────────
    // 用 currentFish 自带 fishPull / behavior 字段创建状态机；
    // FishBehavior 通过 onEvent 回调把"surge_incoming/mythic_dive"事件转交给场景层（用于"!"气泡 / 屏幕震动等）。
    this.currentFishBehavior = new FishBehavior(this.currentFish, (evt, payload) => {
      if (evt === 'surge_incoming') {
        this.surgeWarnTimer = 0.6;   // 显示 0.6s 的预告气泡
      } else if (evt === 'mythic_dive') {
        this.surgeWarnTimer = 1.2;   // 深潜冲击更长
      }
    });
    this.surgeWarnTimer = 0;          // >0 时：UI 层显示鱼图标抖动 + "！"气泡
    this.lineWarnColor  = null;       // null | 'red'(将断) | 'blue'(将松脱)
    this.dangerTextTimer = 0;         // >0 时：屏幕中央闪危险文字
    this.dangerTextKind  = null;      // null | 'low'(快收线) | 'high'(快放线) — 2026-06-05
    // PHASE 15 修复：删除 fishCurrentHP/fishSpeciesMaxHP 平行 HP 体系。
    //   现在 fishHP / maxHP 直接对接 PHASE 15 数据（fishData.hp / fishData.hpDrain），
    //   mythic 三阶段所需 hpPercent 直接用 fishHP/maxHP 计算。
    // 首次进入水下场景时显示拉力教程
    //   hotfix（2026-06-02-2）：用 setTimeout(80ms) 推迟，让 _loop 至少跑 4-5 帧
    //   把水下视角（_renderPlaying）真正绘到 canvas 后再 paused=true 弹教程
    //   ⚠️ 不能用 requestAnimationFrame —— RAF callback 与主 _loop RAF 同队列，
    //      可能在 _loop 之前就连续触发完，paused=true 反而把画面冻在 BiteWindow 残帧
    if (!window.Save?.get('flags.fishing_tutorial_shown')) {
      setTimeout(() => this._showTensionTutorialIfNeeded(), 80);
    }
  }

  _showTensionTutorialIfNeeded() {
    if (window.Save?.get('flags.fishing_tutorial_shown')) return;
    // 二次守护：弹教程时若已不在 Playing（异常路径打断），直接放弃
    if (!this.fsm.is('Playing')) return;
    this.paused = true;
    const panel = document.createElement('div');
    panel.id = 'fishing-tutorial-panel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;background:rgba(0,0,0,0.92);border:2px solid #4FC3F7;border-radius:16px;padding:28px;color:#fff;font-family:"TencentSans","PingFang SC","Noto Sans SC","Heiti SC",sans-serif;z-index:1000;text-align:center;';
    panel.innerHTML = `
      <h2 style="margin:0 0 16px;color:#FFD700;font-size:26px;">🎣 钓鱼技巧</h2>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#ddd;">
        按住<strong style="color:#4FC3F7">[空格键]</strong>或<strong style="color:#4FC3F7">[鼠标左键]</strong>和鱼搏斗，需要控制<strong style="color:#4FC3F7">鱼线拉力</strong>，别断线哦！
      </p>
      <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:16px;margin:16px 0;text-align:left;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <div style="width:60px;height:16px;background:#27AE60;border-radius:4px;"></div>
          <span style="font-size:15px;color:#27AE60;font-weight:bold;">绿色区域 — 拉力安全区</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:60px;height:16px;background:#C0392B;border-radius:4px;"></div>
          <span style="font-size:15px;color:#C0392B;">红色区域 — 断线危险区</span>
        </div>
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:#ff6b6b;font-weight:bold;">
        ⚠️ 如果放任鱼儿不管，也会脱钩哦！
      </p>
      <div id="fishing-tutorial-confirm" style="display:inline-block;padding:8px 20px;border:2px solid #FFD700;border-radius:8px;background:rgba(255,215,0,0.1);cursor:pointer;">
        <p style="margin:0;font-size:18px;color:#FFD700;font-weight:bold;">按 <strong style="color:#FFD700;">[空格键]</strong> 或 <strong style="color:#FFD700;">[鼠标左键]</strong> 继续</p>
      </div>
    `;
    document.body.appendChild(panel);

    // hotfix-z4（2026-06-04）：从"绿色区域 — 拉力安全区"文字旁出箭头，指向画布右下角拉力条
    //   - 拉力条在 1280×720 设计坐标系中心约 (cw - 130, ch - 67)，受 CSS 缩放影响
    //   - 用 canvas.getBoundingClientRect() 算视口实际像素位置
    //   - 全屏 SVG overlay 画带箭头的红色折线（脉冲呼吸 + 阴影描边突出）
    //   - panel 关闭时一并移除
    const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowSvg.id = 'fishing-tutorial-arrow';
    arrowSvg.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:999;overflow:visible;';
    const drawArrow = () => {
      // 起点：panel 内"绿色区域 — 拉力安全区"那一行右端（粗略取 panel 右上区域）
      const panelRect = panel.getBoundingClientRect();
      const sx = panelRect.right - 40;
      const sy = panelRect.top + 138; // 大约"绿色区域"行的 Y
      // 终点：画布右下角拉力条绿色安全区中心，按 CSS 缩放换算
      let ex = window.innerWidth - 130, ey = window.innerHeight - 67;
      if (this.canvas) {
        const canvasRect = this.canvas.getBoundingClientRect();
        const scaleX = canvasRect.width / 1280;
        const scaleY = canvasRect.height / 720;
        // 设计坐标系：拉力条绿区中心约 X = cw - 130, Y = ch - 67
        ex = canvasRect.left + (1280 - 130) * scaleX;
        ey = canvasRect.top + (720 - 67) * scaleY;
      }
      // 箭头终点回缩，避免线穿出箭头外
      const dxA = ex - sx, dyA = ey - sy;
      const lenA = Math.sqrt(dxA * dxA + dyA * dyA) || 1;
      const back = 14; // 线缩短 14px，把空间让给箭头
      const lineEx = ex - dxA / lenA * back;
      const lineEy = ey - dyA / lenA * back;
      // 箭头顶点角度（让黑/红箭头按相同方向旋转）
      const angleDeg = Math.atan2(dyA, dxA) * 180 / Math.PI;
      arrowSvg.innerHTML = `
        <!-- 黑色描边线：常驻不透明，作为视觉骨架（无 marker，箭头单独画 polygon） -->
        <line x1="${sx}" y1="${sy}" x2="${lineEx}" y2="${lineEy}"
              stroke="#000" stroke-width="6" stroke-linecap="round"/>
        <!-- 红色主线：仅红色闪烁 -->
        <line x1="${sx}" y1="${sy}" x2="${lineEx}" y2="${lineEy}"
              stroke="#FF3B30" stroke-width="3" stroke-linecap="round">
          <animate attributeName="opacity" values="1;0.6;1" dur="1s" repeatCount="indefinite"/>
        </line>
        <!-- 箭头：黑色外圈 + 红色内芯共用同一尖端 (0,0)，避免错位 -->
        <g transform="translate(${ex},${ey}) rotate(${angleDeg})">
          <polygon points="-18,-10 0,0 -18,10" fill="#000"/>
          <polygon points="-14,-6 0,0 -14,6" fill="#FF3B30"/>
        </g>
      `;
    };
    document.body.appendChild(arrowSvg);
    drawArrow();
    // 窗口 resize 时重算
    const resizeHandler = () => drawArrow();
    window.addEventListener('resize', resizeHandler);

    const closeTutorial = () => {
      panel.remove();
      arrowSvg.remove();
      window.removeEventListener('resize', resizeHandler);
      window.Save?.set('flags.fishing_tutorial_shown', true);
      window.Save?.commit();
      this.resume();
    };
    this._tutorialCloseHandler = closeTutorial;

    // hotfix（2026-06-01n）：教程面板按钮支持鼠标左键单击关闭（与空格键等价）
    //   - 仅按钮区域响应（避免误点 panel 其他位置触发）
    //   - 关闭后清空 _tutorialCloseHandler，防止 keydown 再次触发
    const confirmBtn = panel.querySelector('#fishing-tutorial-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (this._tutorialCloseHandler) {
          this._tutorialCloseHandler();
          this._tutorialCloseHandler = null;
        }
      });
    }
  }

  /**
   * PHASE 21-1 D14 hotfix-o：安全区扣血触发的统一反馈
   * A 鱼震动：_fishHitShakeUntil 推到 now+200ms，渲染层每帧加 ±4px 偏移
   * B 飘字：push 红色 "-N" 飘字，0.8s 上浮淡出
   * D 音效：playFishHit（短促打击音）
   * E 粒子：6 个金色火星向四周散开
   */
  /**
   * hotfix-y2（2026-06-04）：扣血流程升级为两阶段
   *   阶段 1：_launchDamageProjectile(damage) —— 从拉力条指针射出 3 颗光弹，飞向鱼（300ms）
   *   阶段 2：光弹命中 → 调 _onFishHit(damage) —— 真扣血 + 抖动 + 飘字 + 音效 + 粒子
   *
   * Combo 系统（方案 2 温和版）：
   *   连击 1 → ×1.0 / 2 → ×1.1 / 3 → ×1.25 / 4 → ×1.4 / 5+ → ×1.5（封顶）
   *   维持条件：连续 tick 都在安全区
   *   重置条件：tick 在安全区外 / Failed / Caught / _resetTo*
   */
  _launchDamageProjectile(baseDamage) {
    // ── Combo 计算 ──
    this._combo = (this._combo || 0) + 1;
    const COMBO_MUL = [1.0, 1.0, 1.1, 1.25, 1.4, 1.5];
    const idx = Math.min(this._combo, COMBO_MUL.length - 1);
    const finalDamage = Math.max(1, Math.round(baseDamage * COMBO_MUL[idx]));

    // ── 起点：拉力条 ▲ 指针位置（每帧由 _renderTensionBar 更新缓存）──
    const sx = this._tensionBarPointerX || (this.cw / 2);
    const sy = this._tensionBarPointerY || (this.ch - 80);
    // ── 终点：鱼的当前渲染位置 ──
    const tx = this.playingFishX || this.bobX || (this.cw / 2);
    const ty = this.playingFishY || this.bobY || (this.ch / 2);

    // ── 发射 3 颗错峰光弹（每颗 80ms 间隔，每颗飞行 300ms）──
    if (!this._dmgProjectiles) this._dmgProjectiles = [];
    const launchAt = performance.now();
    const colors = ['#FFD700', '#FFE066', '#FFA500']; // 金、亮黄、橙
    for (let i = 0; i < 3; i++) {
      this._dmgProjectiles.push({
        sx, sy, tx, ty,
        delay: i * 80,                    // 错峰发射
        launchedAt: launchAt,
        flightMs: 300,                    // 单颗飞行时长
        color: colors[i % colors.length],
        // hotfix-y4：光球放大 ~2 倍
        //   中间那颗 18px、两侧 14px（旧 6px / 8px）
        size: i === 1 ? 18 : 14,
        finished: false,
        damage: i === 2 ? finalDamage : 0, // 只让最后一颗触发真扣血（避免三连扣血）
        // hotfix-y4：粒子尾迹时间戳，每帧由 _updateDamageProjectiles 触发 emit
        _lastEmitAt: 0,
      });
    }
    // 起点立刻闪一下（黄色环扩散，预告"力量发出"）
    this.particles.emit(sx, sy, 8, '#FFD700', { speed: 40, gravity: 0, size: 3, decay: 0.06 });

    // 屏幕底部短暂"COMBO ×N"提示（连击 ≥2 才显示）
    if (this._combo >= 2) {
      this._comboText = {
        text: `COMBO ×${this._combo}`,
        life: 0.6,
        maxLife: 0.6,
        scale: this._combo >= 4 ? 1.4 : 1.1,
        color: this._combo >= 5 ? '#FF3B30' : (this._combo >= 3 ? '#FFD700' : '#FFE066'),
      };
    }
  }

  /**
   * 真扣血回调（由光弹命中触发）—— A/B/D/E 四件套
   * hotfix-o：原直接在 _updatePlaying 调；hotfix-y2 改由光弹命中调
   */
  _onFishHit(damage) {
    const fx = this.playingFishX || this.bobX || 0;
    const fy = this.playingFishY || this.bobY || 0;
    // A：抖动 200ms
    this._fishHitShakeUntil = performance.now() + 200;
    // B：飘字（红色"-N"，从鱼头部正上方升起 0.8s 后淡出）
    this._damageTexts.push({
      x: fx,
      y: fy - 24,
      text: `-${damage}`,
      color: '#FF3B30',
      life: 0.8,
      maxLife: 0.8,
      vy: -45,
    });
    if (this._damageTexts.length > 12) this._damageTexts.shift();
    // D：音效
    AudioSystem.playFishHit();
    // E：粒子（6 个金色火星向四周散开 + 轻微上抛 + 重力下落）
    this.particles.emit(fx, fy, 6, '#FFD700', { speed: 80, gravity: 180, size: 5, decay: 0.045 });
  }

  _updatePlaying(dt) {
    // PHASE 21-1 hotfix（2026-06-01）：鼠标左键与空格键并行，按住任意一个都视为"拉线"
    //   变量名沿用 holdingSpace 是为了下方所有原有判断零改动；含义已扩展为"按住拉杆键（空格 OR 鼠标左键）"
    const cfg = CONFIG.playing; const holdingSpace = this.input.isDown(' ') || this.input.isDown('space') || this._playingMouseHeld; const w = this.cw; const h = this.ch;
    // 收线音效控制：按住空格时启动音效，松手停止
    if (holdingSpace) AudioSystem.startReelSound();
    else AudioSystem.stopReelSound();
    if (this._checkEscape(dt)) return;
    // PHASE 21-1 D14 hotfix-n：HP 扣血新规则 —— 3 秒安全区 tick
    //   旧规则：holdingSpace 每帧 ×dt 扣 hpDrain → 删除
    //   新规则：
    //     - 每 3 秒触发 1 次 tick；触发瞬间若 tension ∈ [tensionLowThreshold, tensionHighThreshold]
    //       扣 hpPerTick × rod.damageMul（鱼竿越高级伤害越大）
    //     - 不在安全区时本 tick 不扣血
    //     - 回血规则保留：放松（!holdingSpace）且 fishHP < maxRecoverHP 时按 recoverRate 回血
    const SAFE_TICK_INTERVAL = 3.0;
    const tensionInSafeZone = this.tension >= cfg.tensionLowThreshold && this.tension <= cfg.tensionHighThreshold;
    if (this.fishHP > 0) {
      // 累加 tick 计时器；满 3s 触发一次扣血判定
      this.safeTickTimer = (this.safeTickTimer || 0) + dt;
      if (this.safeTickTimer >= SAFE_TICK_INTERVAL) {
        this.safeTickTimer -= SAFE_TICK_INTERVAL;
        if (tensionInSafeZone) {
          const rod = window.equipment ? window.equipment.getEquippedRod() : null;
          const damageMul = (rod && rod.damageMul) || 1.0;
          const hpPerTick = this.currentFish.hpPerTick || 5;
          const baseDamage = Math.round(hpPerTick * damageMul);
          // hotfix-y2：发射光弹（光弹命中时由 _updateDamageProjectiles 真扣血 + 调 _onFishHit）
          //   ⚠️ HP 不在此处扣，由命中回调内部扣（包含 combo 倍率），保证视觉与数值同步
          this._launchDamageProjectile(baseDamage);
        } else {
          // 不在安全区 → combo 中断
          this._combo = 0;
        }
      }
      // 回血保留：放松状态（未按空格）且未到回血上限时按个体 hpRecoverPerSecond 回血
      //   hotfix-o：从鱼数据直读（按星级 + 个体差异化），旧 cfg.fishHPRecoverPerSecond 已废弃
      //   hotfix-x2：HP 已经归零 → 不再回血，UI 上死死锁在 0（避免出水演绎期间 HP 数字回弹）
      //   hotfix-x5（2026-06-05）：光弹飞行中禁用回血。
      //     根因：tick 发射的光弹（最后一击）要 300ms 才命中扣血。期间若放松控压回血，
      //     残血+回血 > 光弹伤害 → 永远扣不死 → 鱼无限游 + 无限回血（用户报 bug）。
      //     解决：只要有未命中光弹在飞，就跳过回血逻辑。
      //   hotfix-x5b：HP < 1.0 时也禁用回血（兜底浮点残血回血卡顿场景）
      const hasFlyingProjectile = this._dmgProjectiles && this._dmgProjectiles.some(p => !p.finished);
      const hpRecoverRate = (this.currentFish.hpRecoverPerSecond != null)
        ? this.currentFish.hpRecoverPerSecond
        : cfg.fishHPRecoverPerSecond;
      const maxRecoverHP = this.fishMaxHP * cfg.fishHPMaxRecoverRatio;
      if (!holdingSpace && this.fishHP >= 1.0 && this.fishHP < maxRecoverHP && !hasFlyingProjectile) {
        this.fishHP = Math.min(maxRecoverHP, this.fishHP + hpRecoverRate * dt);
      }
    }
    // hotfix-x4（2026-06-04）：HP=0 → 锁存进入"出水演绎期"，玩家操作不再影响任何进度
    //   流程：HP 第一次到 0 → _fishExhaustedLatch=true，从此鱼自动上拉到 catchZoneY → Caught
    //   出水期间忽略：tension 升降、escape 检查、回血、QTE、tension 爆条、跑鱼
    //   出水期间保留：鱼图渲染、扣血飘字残留淡出、上拉 Y 动画
    //   hotfix-x5（2026-06-05）：核心修复在两处 —— 光弹飞行期间禁用回血 + 命中残血<1 钳到0。
    //     这里阈值保持 <=0 即可（前面已确保不会有浮点正残血卡住）。
    if (this.fishHP <= 0) this._fishExhaustedLatch = true;
    const fishExhausted = this._fishExhaustedLatch === true;
    if (fishExhausted) {
      // 出水演绎专属分支：只动 playingFishY（恒速向上），其他都不动
      this.fishHP = 0;                          // 锁死 0（防 UI 飘）
      this.tension = Math.max(0, this.tension - 30 * dt);  // 慢慢松线，视觉自然
      this.escapeSpeed = 0;
      this.playingFishY -= 225 * dt;            // 上拉速度
      // X 也轻微往中央靠拢（避免鱼飞出屏幕外）
      const targetX = w * 0.5;
      const dx = targetX - this.playingFishX;
      this.playingFishX += Math.sign(dx) * Math.min(Math.abs(dx), 90 * dt);
      // 到达 catchZoneY → Caught
      if (this.playingFishY <= h * cfg.catchZoneY) {
        this.fsm.transition('Caught', 'fish caught');
        this._onFishCaught();
      }
      return;
    }
    // hotfix-x（2026-06-04）：HP=0 后免疫所有 Failed 判定（爆条/逃跑等）
    //   保留出水演绎流程（上拉到 catchZoneY 才进 Caught），但期间不能再被任何失败原因打断
    //   ⚠️ 注意 _checkEscape 内部已对 fishHP<=0 早返（1508 行），此处只补 tension 爆条 + slack 失败的免疫
    if (this.tension > 70 && !this.highTensionSound) { this.highTensionSound = true; AudioSystem.playReelTick(); } else if (this.tension <= 70) this.highTensionSound = false;
    if (this.tension > cfg.maxTension * 0.85 && !this.warningShown) { this.warningShown = true; } else if (this.tension <= cfg.maxTension * 0.85 && this.warningShown) this.warningShown = false;
    // hotfix-x：鱼血归零后，按住空格也不再判"鱼线绷断"（玩家正在收线，不该被罚）
    if (!fishExhausted && this.tension > cfg.maxTension * 0.9 && holdingSpace) { const breakChance = (this.tension - cfg.maxTension * 0.9) / (cfg.maxTension * 0.1) * 0.45 * dt; if (Math.random() < breakChance) { this.fsm.transition('Failed', 'tension overflow'); this.failedReason = 'tension'; return; } }
    const sizeFactor = this.currentFish.size[0] / 30;
    if (holdingSpace && !fishExhausted) {
      const pullSpeed = 120 + sizeFactor * 60; const tensionDecay = cfg.tensionDecayPerSecond * (1 + (sizeFactor - 1) * 0.3);
      this.tension = Math.max(0, this.tension - tensionDecay * dt); this.playingFishX += pullSpeed * dt; this.escapeSpeed = cfg.fishEscapeSpeed * 0.3; this.escapeBurstTimer = 0;
    } else if (!fishExhausted) {
      // hotfix-w E：escapeBurst 期间 tension 倍率 ×2.25 → ×1.5（旧值会在 burst 1s 内把 tension 拉 45 点）
      if (this.escapeBurstTimer > 0) { this.escapeBurstTimer -= dt; this.escapeSpeed = cfg.fishEscapeSpeed * 3; this.tension += cfg.tensionPerSecond * 1.5 * dt; }
      else { this.escapeSpeed += cfg.fishEscapeSpeedIncrease * dt; this.tension += cfg.tensionPerSecond * dt; }
    } else { this.escapeSpeed = 0; this.playingFishX += 45 * dt; }
    this.playingFishX -= this.escapeSpeed * dt; this.playingFishX = Math.max(-30, Math.min(w - 90, this.playingFishX));
    this.fishYTime += dt * 1.5;
    const catchZoneRight = w * 0.9;
    if (this.playingFishX >= catchZoneRight || fishExhausted) this.fishYTime = 0;
    else { const yAmplitude = h * 0.1; this.playingFishY = this.fishYCenter + Math.sin(this.fishYTime) * yAmplitude; }
    if ((this.playingFishX >= w * cfg.catchZoneX && holdingSpace) || fishExhausted) { const pullUpSpeed = fishExhausted ? 225 : 150; this.playingFishY -= pullUpSpeed * dt; if (this.playingFishY <= h * cfg.catchZoneY) { this.fsm.transition('Caught', 'fish caught'); this._onFishCaught(); return; } }
    // hotfix-x：鱼血归零后免疫"tension 满 = Failed"和"鱼游出屏幕 = escape"
    //   前者：出水演绎期间玩家收线可能瞬间打满 tension，不该判失败
    //   后者：HP=0 后 playingFishX 已被上拉逻辑接管，不会真游出去；安全兜底
    if (!fishExhausted) {
      if (this.tension >= cfg.maxTension) { this.fsm.transition('Failed', 'tension overflow'); this.failedReason = 'tension'; }
      else if (this.playingFishX < -30) { this.fsm.transition('Failed', 'escape'); this.failedReason = 'escape'; }
    }

    // PHASE 13-4：空格控压维度（叠加在现有 QTE / 鱼挣扎逻辑上）
    //   按住空格 → tension 上升（玩家主动施压，拉力变大；视觉条变短趋红）
    //   松开空格 → tension 下降（鱼线松弛；视觉条变长趋绿）
    //   ⚠️ 玩法要求"按对方向键 -10 / 按错 +20"在 _updateReeling QTE 中保留，未动
    if (holdingSpace) this.tension += cfg.tensionRiseRate * dt;
    else              this.tension -= cfg.tensionFallRate * dt;

    // PHASE 15 仗2：鱼自身拉力（fishPull）影响。
    //   FishBehavior 每帧返回 effectivePull（行为模式相关），单位 = 每秒额外 tension 增量。
    //   - 正值 → tension 朝断线方向上涨（鱼把线往外拉，玩家按住时上升变快、松手时下降变慢）
    //   - 负值 → tension 朝松脱方向下降（mythic 深潜：鱼往下扎，线被带松）
    //   红线兼容：对 rise=15 / fall=40 / 黄金区 / slackFailGrace 都是叠加项，不替换。
    if (this.currentFishBehavior) {
      // PHASE 15 修复：hpPercent 直接用 fishHP/maxHP（与 UI 显示同源，mythic 三阶段判定准确）
      const hpPercent = this.currentFish.maxHP > 0 ? (this.fishHP / this.currentFish.maxHP) : 1;
      const effectivePull = this.currentFishBehavior.getEffectivePull(dt, hpPercent);
      this.tension += effectivePull * dt;
    }
    this.tension = Math.max(0, Math.min(cfg.maxTension, this.tension));

    // PHASE 15 仗5：视觉预警状态位（每帧重算，UI 层渲染时直接读）
    //   - lineWarnColor: 'red'(将断 ≥85) / 'blue'(将松 ≤15) / null
    //   - dangerTextTimer: 红区任一侧时刷为 0.3s（短闪），渲染层若 >0 显示对应文字
    //   - dangerTextKind: 'low'(左红区，鱼快脱钩) / 'high'(右红区，线快断) / null
    //   - surgeWarnTimer: 由 FishBehavior onEvent 触发，已在回调里设置；这里只衰减
    if (this.tension >= 85)      this.lineWarnColor = 'red';
    else if (this.tension <= 15) this.lineWarnColor = 'blue';
    else                         this.lineWarnColor = null;
    // 2026-06-05：进红区即提示语义化文字
    //   左红区（< tensionLowThreshold=40）：拉力不足，鱼要脱钩 → 提示"快收线"
    //   右红区（> tensionHighThreshold=70）：拉力过头，线要断 → 提示"快放线"
    //   中间安全/警戒区 → 文字渐隐
    if (this.tension < cfg.tensionLowThreshold) {
      this.dangerTextTimer = 0.3;
      this.dangerTextKind = 'low';
    } else if (this.tension > cfg.tensionHighThreshold) {
      this.dangerTextTimer = 0.3;
      this.dangerTextKind = 'high';
    } else if (this.dangerTextTimer > 0) {
      this.dangerTextTimer = Math.max(0, this.dangerTextTimer - dt);
      if (this.dangerTextTimer === 0) this.dangerTextKind = null;
    }
    if (this.surgeWarnTimer > 0) this.surgeWarnTimer = Math.max(0, this.surgeWarnTimer - dt);

    // PHASE 15 修复：移除 fishCurrentHP 平行扣血段。
    //   现已统一：fishHP 用 PHASE 15 的 fishData.hp 初始化，扣血率 hpDecayRate 改用 fish.hpDrain，
    //   与 UI 显示（"鱼的体力"血条）和 _onFishCaught 胜负判定全部同源。


    // PHASE 13-4：低拉力（鱼线松弛）失败判定 —— tension≤0 持续 slackFailGrace 秒 → slack
    //   与 tension≥100 鱼线断对称，均为"控压失败"。0.5 秒缓冲避开松手瞬间误触发
    if (this.tension <= 0) {
      this.slackTimer += dt;
      if (this.slackTimer >= cfg.slackFailGrace) { this.fsm.transition('Failed', 'slack'); this.failedReason = 'slack'; return; }
    } else {
      this.slackTimer = 0;
    }

    // PHASE 21-1 D14 hotfix-o：扣血飘字更新（每帧推进 life + 上浮）
    if (this._damageTexts && this._damageTexts.length > 0) {
      for (let i = this._damageTexts.length - 1; i >= 0; i--) {
        const t = this._damageTexts[i];
        t.life -= dt;
        t.y += t.vy * dt;
        if (t.life <= 0) this._damageTexts.splice(i, 1);
      }
    }

    // hotfix-y2：扣血光弹更新（每颗光弹独立计时 → 命中时调 _onFishHit + 真扣血）
    // hotfix-y4：光弹沿轨迹每 30ms 喷一次粒子尾迹
    if (this._dmgProjectiles && this._dmgProjectiles.length > 0) {
      const now = performance.now();
      for (let i = this._dmgProjectiles.length - 1; i >= 0; i--) {
        const p = this._dmgProjectiles[i];
        const elapsed = now - p.launchedAt - p.delay;
        if (elapsed < 0) continue; // 还在延迟期
        if (elapsed >= p.flightMs) {
          // 命中！触发扣血回调（仅 damage>0 的光弹真扣血，避免三连扣）
          if (!p.finished) {
            p.finished = true;
            if (p.damage > 0) {
              // 真正扣 HP（hotfix-y3：最后一击残血是浮点，飘字四舍五入到整数）
              // hotfix-x5（2026-06-05）：命中后若残血 < 1，直接钳到 0 触发 latch；
              //   避免"浮点残血 + 飞行期间回血"导致鱼无限游动（用户报 bug）
              const dmg = Math.round(Math.min(p.damage, this.fishHP));
              this.fishHP = Math.max(0, this.fishHP - dmg);
              if (this.fishHP < 1.0) this.fishHP = 0;
              this._onFishHit(dmg);
            }
          }
          this._dmgProjectiles.splice(i, 1);
        } else {
          // hotfix-y4：飞行中每 30ms 在当前位置 emit 3 颗小火花
          if (now - p._lastEmitAt > 30) {
            p._lastEmitAt = now;
            const t = elapsed / p.flightMs;
            const ease = t * t * (3 - 2 * t);
            const px = p.sx + (p.tx - p.sx) * ease;
            const pyl = p.sy + (p.ty - p.sy) * ease;
            const arc = Math.sin(t * Math.PI) * 80;
            const py = pyl - arc;
            this.particles.emit(px, py, 3, p.color, {
              speed: 35, gravity: 60, size: 3, decay: 0.06
            });
          }
        }
      }
    }

    // hotfix-y2：combo 文字更新
    if (this._comboText) {
      this._comboText.life -= dt;
      if (this._comboText.life <= 0) this._comboText = null;
    }
  }

  _calculateEscapeChance(tension, maxTension) {
    const cfg = CONFIG.playing; const tensionRatio = tension / maxTension;
    let baseChance = tensionRatio <= 0.5 ? Math.exp(Math.log(cfg.escapeBaseChanceAtZero) + (Math.log(cfg.escapeChanceAtHalf) - Math.log(cfg.escapeBaseChanceAtZero)) * tensionRatio * 2) : Math.exp(Math.log(cfg.escapeChanceAtHalf) + (Math.log(cfg.escapeChanceAtFull) - Math.log(cfg.escapeChanceAtHalf)) * (tensionRatio - 0.5) * 2);
    if (tension <= cfg.tensionLowThreshold) baseChance *= cfg.lowTensionPenaltyMultiplier;
    else if (tension >= cfg.tensionHighThreshold) baseChance *= cfg.highTensionBonusMultiplier;
    return baseChance;
  }

  _checkEscape(dt) {
    const cfg = CONFIG.playing; this.escapeCheckTimer += dt;
    if (this.escapeCheckTimer < cfg.escapeCheckInterval) return false;
    this.escapeCheckTimer = 0;
    if (this.fishHP <= 0) return false;
    // PHASE 21-1 D14 hotfix-q：安全区 [low, high] 内完全免疫"鱼自然挣脱"概率判定
    //   旧规则下安全区 multiplier=1.0，1 分钟仍约 80% 跑鱼，与新 hpPerTick 长拉锯节奏冲突
    //   新规则：精准控压 = 免疫随机跑鱼；失败只来自 tension 爆条 / slack 松脱
    if (this.tension >= cfg.tensionLowThreshold && this.tension <= cfg.tensionHighThreshold) return false;
    if (Math.random() < this._calculateEscapeChance(this.tension, cfg.maxTension)) { this.fsm.transition('Failed', 'escape'); this.failedReason = 'escape'; return true; }
    return false;
  }

  _onFishCaught() {
    AudioSystem.stopReelSound();
    // hotfix-z（2026-06-04 修订）：用 _startBite 时缓存的 _hookedFishRef 真正删除鱼
    //   原 bug：先前用 bobberFSM.follower，但 follower 在进 BiteWindow 时已被 resetBobberApproach 清空
    //   新链路：_startBite → takeHookedFishRef() → 保存 → 战斗胜利 → removeFishFromGroup(ref)
    if (this._hookedFishRef && this.fishGroupSystem && typeof this.fishGroupSystem.removeFishFromGroup === 'function') {
      this.fishGroupSystem.removeFishFromGroup(this._hookedFishRef);
    }
    this._hookedFishRef = null;
    const baseSize = this.currentFish.size[0]; this.caughtFishSize = Math.round(baseSize + (Math.random() - 0.5) * baseSize * 0.4);
    this.isNewFish = !this.atlas.has(this.currentFish.id); if (this.isNewFish) this.atlas.add(this.currentFish.id);
    this.fishCount++; this.money += this.currentFish.price; this.caughtFish = this.currentFish;
    this.particles.emit(this.playingFishX || this.bobX, this.playingFishY || this.bobY, CONFIG.caught.particleCount, '#87CEEB', { upward: true }); this.particles.emit(this.playingFishX || this.bobX, this.playingFishY || this.bobY, CONFIG.caught.particleCount, '#FFF', { speed: 90 }); AudioSystem.playFishCaught();
    const weight = (this.caughtFishSize / 100).toFixed(2);
    SceneManager.emit('fish_caught', { species: this.currentFish.name, weight: parseFloat(weight), price: this.currentFish.price, rarity: this.currentFish.rarity });

    // 图鉴系统：记录钓获
    if (window.codex) {
      const result = window.codex.onFishCaught({
        species: this.currentFish.name,
        size: this.caughtFishSize
      });
      if (result.newUnlock) {
        this._showCodexToast(`📖 新鱼解锁！${this.currentFish.name}`);
      }
    }

    // 暂存鱼货到 player.fishBag
    if (window.Save) {
      const player = window.Save.get('player');
      player.fishBag = player.fishBag || [];
      // 从 fish-pool 获取 basePrice/rarity
      const poolFish = SHUISHE_FISH_POOL.find(f => f.species === this.currentFish.name);

      // ─────────────────────────────────────────────────────────
      // PHASE 16-6 仗1：入篓前容量校验（双轨并存方案 v1.2）
      //   单一真理来源 = fishBag；本次鱼若超条数/重量任一上限 → 拒收，
      //   仅以 DOM 飘字提示「鱼篓已满，请先回村卖鱼」。
      //   注意：容量满载不影响 codex 解锁、totalFishCount、称号系统、
      //         q001/q002/q003 进度（这些已在前文 emit 时计入），
      //         避免"钓上一条稀有鱼却因鱼篓满而图鉴丢失"的项目级灾难。
      // ─────────────────────────────────────────────────────────
      const fishProbe = {
        species: this.currentFish.name,
        size: this.caughtFishSize
      };
      const cap = checkFishStorageCapacity(player, fishProbe);
      if (!cap.ok) {
        this._showCodexToast('🪣 鱼篓已满，请先回村卖鱼');
        // 拒收：不 push fishBag、不调 addFishToStorageStack
      } else {
        player.fishBag.push({
          species: this.currentFish.name,
          size: this.caughtFishSize,
          rarity: poolFish ? poolFish.rarity : (this.currentFish.rarity || 1),
          basePrice: poolFish ? poolFish.basePrice : (this.currentFish.price || 0),
          caughtAt: Date.now()
        });
        // 双轨同步：往 fishStorage 堆叠副本里累加（UI 渲染用）
        addFishToStorageStack(player, fishProbe);

        // PHASE 17 仗1：成功入篓 → 扣 2 体力
        //   只有真正入篓才扣（鱼篓满拒收的分支不扣，避免"空跑还罚体力"二次惩罚）。
        //   抛竿前已校验 ≥2，理论上不会 false；兜底 false 时仅 console.warn，不阻塞流程。
        if (window.StaminaSystem) {
          const ok = window.StaminaSystem.consumeStamina(2, 'fishing');
          if (!ok) {
            console.warn('[fishing] 体力扣减失败（理论不应发生，抛竿前已校验）');
          }
        }
      }
      window.Save.set('player', player);
      window.Save.commit();
    }

    // ─────────────────────────────────────────────────────────
    // PHASE 16-6 仗4：消耗 1 个当前鱼饵
    //   规则：成功上钩（无论入篓或满篓退回）都消耗（防止刷）
    //   兜底：消耗后若该鱼饵 = 0 且 != basic_bait → 自动切回 basic_bait
    //         若 basic_bait 也为 0 → 不切（仍持有原 id），下次抛竿在 _updateIdle 阻断
    // ─────────────────────────────────────────────────────────
    if (window.inventory && window.Save) {
      const equippedBaitId = window.Save.get('player.equippedBait') || 'basic_bait';
      const beforeCount = window.inventory.getCount(equippedBaitId);
      if (beforeCount > 0) {
        window.inventory.remove(equippedBaitId, 1);
        const afterCount = window.inventory.getCount(equippedBaitId);
        // 稀有鱼饵显示剩余数（普通蚯蚓不提示，避免噪音）
        if (equippedBaitId !== 'basic_bait') {
          const baitName = BAIT_EFFECTS[equippedBaitId]?.name || equippedBaitId;
          this._showCodexToast(`消耗 1 ${baitName}（剩余 ${afterCount}）`);
        }
        // 0 库存兜底切档
        if (afterCount === 0 && equippedBaitId !== 'basic_bait') {
          window.Save.set('player.equippedBait', 'basic_bait');
          window.Save.commit();
          this._showCodexToast('🪱 鱼饵不足，已切换为初级鱼饵');
        }
        // 通知 HUD 刷新（库存数 + 装备态变化）
        if (window.fishingHUD) window.fishingHUD.render();
      }
    }

    // 同步任务进度
    if (this.questParams) {
      // q001: 钓指定鱼种
      if (this.questParams.target === this.currentFish.name) {
        this.questParams.progress++;
        questSystem.updateProgress('q001_first_fish', this.currentFish.name);
        if (this.questParams.progress >= this.questParams.need) this.taskComplete = true;
      }
      // q002: 钓5种不同鱼
      if (this.questParams.questId === 'q002') {
        questSystem.updateProgress('q002', this.currentFish.name);
        const q002 = questSystem.getQuest('q002');
        if (q002) {
          const got = Object.values(q002.progress || {}).filter(v => v).length;
          this.questParams.progress = got;
          this.questParams.detail = QUESTS.q002.getDetailText(q002.progress);
          if (QUESTS.q002.isComplete(q002.progress)) this.taskComplete = true;
        }
      }
    }

    // q003: 钓翘嘴鲌标记（无论 questParams 是否传入）
    const q003 = questSystem.getQuest('q003');
    if (q003 && q003.status === 'active' && QUESTS.q003) {
      const result = QUESTS.q003.onFishCaught(q003.progress, this.currentFish.name);
      if (result.updated) {
        q003.progress = result.progress;
        questSystem.updateProgress('q003', this.currentFish.name);
        if (QUESTS.q003.isComplete(q003.progress)) {
          q003.status = 'ready_to_turnin';
          window.Save?.set('quests.q003', q003);
          window.Save?.commit();
        }
      }
    }

    // 检查是否可完成任务
    if (questSystem.canComplete('q001_first_fish') || questSystem.canComplete('q002') || questSystem.canComplete('q003')) {
      this.taskComplete = true;
    }
  }

  _updateReeling(dt) {
    this.qteTimer -= dt; this.tension = Math.max(0, this.tension - CONFIG.reeling.tensionDecayPerFrame * dt * 60);
    if (this.tensionChangeTimer > 0) { this.tensionChangeTimer -= dt; if (this.tensionChangeTimer <= 0) this.tensionChangeText = ''; }
    let pressed = null;
    if (this.input.wasPressed('up') || this.input.wasPressed('w')) pressed = 'up';
    else if (this.input.wasPressed('down') || this.input.wasPressed('s')) pressed = 'down';
    else if (this.input.wasPressed('left') || this.input.wasPressed('a')) pressed = 'left';
    else if (this.input.wasPressed('right') || this.input.wasPressed('d')) pressed = 'right';
    if (pressed) {
      const dmg = CONFIG.reeling.hpDamageByRarity[this.currentFish.rarity - 1];
      if (pressed === this.qteDirection) { this.fishHP -= dmg; this.tension = Math.max(0, this.tension - CONFIG.reeling.tensionSuccessBonus); this.qteResult = 'Good!'; this.qteResultColor = '#4CAF50'; AudioSystem.playReelTick(); this._completeQTE(); }
      else { this.tension += CONFIG.reeling.tensionFailPenalty; this.qteResult = `张力 +${CONFIG.reeling.tensionFailPenalty}!`; this.qteResultColor = '#FF5722'; AudioSystem.playReelTick(); this._completeQTE(); this._showTensionChange(CONFIG.reeling.tensionFailPenalty); }
    } else if (this.qteTimer <= 0) { this.tension += CONFIG.reeling.tensionTimeoutPenalty; this.qteResult = `超时 +${CONFIG.reeling.tensionTimeoutPenalty}`; this.qteResultColor = '#FFC107'; AudioSystem.playReelTick(); this._completeQTE(); this._showTensionChange(CONFIG.reeling.tensionTimeoutPenalty); }
    if (this.tension >= 100) { this.fsm.transition('Failed', 'tension overflow'); this.failedReason = 'tension'; }
    else if (this.fishHP <= 0) { this.fsm.transition('Caught', 'fish caught'); this._onFishCaught(); }
  }

  _showTensionChange(amount) { this.tensionChangeText = `+${amount}`; this.tensionChangeTimer = 0.8; }

  // ── GM 强制捕获接口 ─────────────────────────────────────
  _forceCatchFish(fish) {
    // 设置当前鱼
    this.currentFish = {
      id: fish.id,
      name: fish.name,
      rarity: fish.rarity,
      color: fish.color,
      size: fish.size,
      price: fish.price,
      legendary: fish.legendary || false
    };

    // 强制进入 Playing → Caught 流程
    this.fsm.transition('Playing', 'gm force');
    this._initPlayingState();

    // 跳过钓鱼过程，鱼立即在捕捉区域
    const catchZoneRight = this.cw * 0.9;
    this.playingFishX = catchZoneRight;
    this.playingFishY = this.ch * this.fishYCenter / this.cw;
    this.fishHP = 0; // 立即疲劳，鱼直接可捕获
    this.fishMaxHP = 100;
    this.tension = 0;
    this.isNewFish = !this.atlas.has(fish.id);
    if (this.isNewFish) this.atlas.add(fish.id);
    this.fishCount++;
    this.money += fish.price;
    this.caughtFish = this.currentFish;
    this.caughtFishSize = fish.size[0];

    // 触发捕获
    this.fsm.transition('Caught', 'gm force');
    this._onFishCaught();
  }

  _completeQTE() { this.qteIndex++; setTimeout(() => { this.qteResult = ''; }, 450); if (this.qteIndex >= this.qteTotal) { if (this.fishHP > 0) { this.fsm.transition('Failed', 'escape'); this.failedReason = 'escape'; } } else { this._nextQTE(); } }

  _nextQTE() {
    const rarity = this.currentFish ? this.currentFish.rarity : 1;
    this.qteDirection = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
    // 应用装备 QTE 速度倍率
    const rod = window.equipment ? window.equipment.getEquippedRod() : null;
    const speedMul = rod ? rod.qteSpeedMul : 1.0;
    this.qteMaxTime = CONFIG.reeling.tickDurationByRarity[rarity - 1] * speedMul;
    this.qteTimer = this.qteMaxTime;
  }

  _updateCaught(dt) {
    this.caughtTimer += dt;
    if (this.currentFish && this.currentFish.rarity >= CONFIG.caught.slowmoThreshold) this.timeScale = CONFIG.caught.slowmoScale;
    if (this.currentFish && this.currentFish.legendary) this.glowTimer += dt;
    if (this.caughtTimer >= CONFIG.caught.animationDuration && !this.showingFishInfo) this.showingFishInfo = true;
    // 按空格键确认后收回浮标，回到 Idle 重新开始抛投流程
    // hotfix（2026-06-01b）：空格 OR 鼠标左键单击 都能再次抛竿
    if (this.showingFishInfo && (this.input.wasPressed('space') || this._confirmClick)) {
      this._confirmClick = false;
      this._resetToIdle();
    }
  }

  _updateFailed(dt) {
    AudioSystem.stopReelSound();
    this.failedMessageTimer += dt; // 文字翻页计时器
    // 文字翻页：每5秒切换一条消息
    if (this.failedMessageTimer >= 5) {
      this.failedMessageTimer = 0;
      this.failedMessageIndex = (this.failedMessageIndex + 1) % this.failedMessages.length;
    }
    // 按空格键确认后再次抛竿
    // hotfix（2026-06-01b）：空格 OR 鼠标左键单击 都能确认跑鱼
    if (this.input.wasPressed('space') || this._confirmClick) {
      this._confirmClick = false;
      console.log('跑鱼后按空格键/鼠标左键确认，再次抛竿');
      this.shakeCount = 0; // 重置震动计数
      if (this.failedReason === 'escape') this._resetToWaiting(); else this._resetToIdle();
      return;
    }
  }

  _resetToWaiting() {
    this.fsm.transition('Waiting', 'reset'); this.timeScale = 1; this.waitTimer = 0; this.caughtTimer = 0; this.caughtFish = null; this.caughtFishSize = 0; this.currentFish = null; this.showingFishInfo = false; this.isNewFish = false; this.glowTimer = 0; this.warningShown = false; this.playingFishX = 0; this.playingFishY = 0; this.escapeSpeed = 0; this.fishMaxHP = 0; this.tensionChangeText = ''; this.tensionChangeTimer = 0; this.qteIndex = 0; this.qteTotal = 0; this.fishHP = 0; this.tension = 0; this.lineStartX = 0; this.lineStartY = 0; this.bobX = this.characterX + 180; this.bobY = this.ch * 0.5 + 90; this.castProgress = 0;
    // hotfix-x2：清 fishExhausted 锁存，下一条鱼重新开始判定
    this._fishExhaustedLatch = false;
    // hotfix-y2：清扣血光弹 + combo 状态
    this._dmgProjectiles = [];
    this._combo = 0;
    this._comboText = null;
    // PHASE 15：清理鱼行为状态机 + 视觉预警状态位
    this.currentFishBehavior = null; this.surgeWarnTimer = 0; this.lineWarnColor = null; this.dangerTextTimer = 0; this.dangerTextKind = null;
    // P0 放大镜：reset 兜底强制 hide（边沿检测下一帧会重新计时 150ms 出现）
    if (this.d5 && this.d5.magnifier) this.d5.magnifier.hide();
    // 取消提竿延迟（防 300ms 内被 reset 后误入 Reeling）
    this._cancelPendingReel();
    // PHASE 21-1 D14：清前戏 FSM
    if (this.fishGroupSystem && typeof this.fishGroupSystem.resetBobberApproach === 'function') {
      this.fishGroupSystem.resetBobberApproach();
    }
    // hotfix-z：清"上钩鱼"缓存引用（战斗失败/跑鱼时鱼仍在群里，引用要丢弃避免下次误删）
    this._hookedFishRef = null;
  }

  _resetToIdle() { this.fsm.transition('Idle', 'reset'); this.timeScale = 1; this.bobX = this.characterX + 120; this.bobY = this.ch * 0.5 + 90; this.currentFish = null; this.showingFishInfo = false; this._fishExhaustedLatch = false; this._dmgProjectiles = []; this._combo = 0; this._comboText = null;
    // P0 放大镜：回 Idle 强制 hide（虽然边沿检测也会自然 hide，保险）
    if (this.d5 && this.d5.magnifier) this.d5.magnifier.hide();
    // 取消提竿延迟
    this._cancelPendingReel();
    // PHASE 21-1 D14：清前戏 FSM
    if (this.fishGroupSystem && typeof this.fishGroupSystem.resetBobberApproach === 'function') {
      this.fishGroupSystem.resetBobberApproach();
    }
    // hotfix-z：清"上钩鱼"缓存引用
    this._hookedFishRef = null;
  }

  _toggleAtlas() {
    const isOpen = document.getElementById('atlas-panel'); if (isOpen) { isOpen.remove(); return; }
    const panel = document.createElement('div'); panel.id = 'atlas-panel';
    panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:600px;max-height:80%;background:rgba(0,0,0,0.9);border:2px solid #4FC3F7;border-radius:16px;padding:24px;color:#fff;font-family:"TencentSans","PingFang SC","Noto Sans SC","Heiti SC",sans-serif;overflow-y:auto;z-index:100;';
    let html = '<h2 style="text-align:center;color:#FFD700;font-size:28px;margin:0 0 20px">📖 鱼获图鉴</h2><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">';
    // PHASE 21-1 D14 hotfix-n：图鉴改用 SHUISHE_FISH_POOL（字段名 species/basePrice/icon）
    SHUISHE_FISH_POOL.forEach(f => { const owned = this.atlas.has(f.id); html += `<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:16px;text-align:center;${owned ? '' : 'opacity:0.4'}">
      <div style="font-size:48px">${owned ? (f.icon || '🐟') : '🔒'}</div><div style="font-size:18px;font-weight:bold;color:${f.color || '#4682B4'}">${f.species}</div><div style="font-size:14px;color:#aaa">${'★'.repeat(f.rarity)} | $${f.basePrice}</div></div>`; });
    html += '</div><p style="text-align:center;color:#888;margin-top:16px">按 B 或点击关闭</p>';
    panel.innerHTML = html; panel.onclick = () => panel.remove(); document.getElementById('fishing-scene').appendChild(panel);
  }

  _render() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    ctx.clearRect(0, 0, cw, ch);
    // 震屏效果：只震动3次
    if (this.fsm.is('Failed') && this.shakeCount < 3) {
      this._applyShake(ctx, 12, 0.3);
      this.shakeCount++;
    }
    // PHASE 21-1 D5：heavy 档咬钩瞬间镜头微震（60ms / ±2px / 10Hz）
    //   translate 会被末尾 setTransform(1,0,0,1,0,0) 自然清零，沿用 _applyShake 风格不 save
    if (this.d5) this.d5.applyCameraShake(ctx);
    if (this.fsm.is('Playing')) this._renderPlaying();
    // PHASE 21-1 v3.0 W1 D1+D2+D4：三鱼群占位渲染 + hover UI + CastAimSystem + WaterSplashFX
    //   - 旧 _renderAimBar / _renderCasting 不再调用（视觉由 CastAimSystem 接管）
    //   - 浮漂渲染条件加 _castingWaitingSplash：涟漪期画静止浮漂，飞行期不画（避免重叠）
    //   - waterSplashFX.render 在浮漂层之后调用，覆盖在浮漂上方
    else { this._renderBackground();
      // D5 放大镜真背景：背景画完立刻 copy 到离屏 cache（不含鱼影/鱼线/浮漂/水草动效）
      if (this._bgCacheCtx) this._bgCacheCtx.drawImage(this.canvas, 0, 0);
      if (this.fishGroupSystem) this.fishGroupSystem.render(); if (this.fishGroupHoverUI) this.fishGroupHoverUI.render(); const floatOffset = this._renderPlatform(); this._renderRodAndBob(floatOffset); this._renderCharacterBody(floatOffset); if (this.castAimSystem) this.castAimSystem.render(); if (this.waterSplashFX) this.waterSplashFX.render(); this._renderRightHand(floatOffset); /* PHASE 21-1 D14: _renderFishShadow 渲染守卫已删除 */ this._renderParticles();
      if (this.fsm.is('Caught') && this.showingFishInfo) this._renderCaught(); this._renderHUD(); if (this.fsm.is('Aiming') && this.castAimSystem) this.castAimSystem.renderChargeBar(this.characterX, this.characterY); if (this.fsm.is('Reeling')) this._renderQTE();
      // PHASE 21-1 D5：BiteWindow 反馈层**置顶**渲染（v2.0 _renderBiteAlert 已彻底移除）
      //   内部按 fx 各自时间窗自动决定是否画；BiteWindow 退出后 PERFECT/可惜/四叶草仍可续演
      if (this.d5) this.d5.render(ctx);
    }
    if (this.fsm.is('Failed')) this._renderFailed();
    // 初始状态提示：屏幕正中间显示[空格]键抛竿
    if (this.fsm.is('Idle')) this._renderIdleHint();
    if (!this.fsm.is('Playing')) this._renderTaskProgress(); if (this.taskComplete && !this.fsm.is('Playing')) this._renderTaskComplete(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  _applyShake(ctx, intensity, duration) { const offsetX = (Math.random() - 0.5) * intensity; const offsetY = (Math.random() - 0.5) * intensity; ctx.translate(offsetX, offsetY); }

  _renderBackground() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const waterLevel = ch * 0.5;

    // ── Layer 0-4 静态背景【清晨清澈】：天空 dither / 像素云 / 晨雾远山 / 晨阳 /
    //   三层青蓝湖（含柔和倒影 + 像素气泡 + 晨光反光带 + 浅滩过渡） ──
    // 全部一次性绘制到离屏 Canvas，每场仅跑一次（详见 js/render/fishing-bg.js）
    drawFishingBg(ctx, cw, ch);

    // ── Layer 4.1: 已删除 ──
    //   原"远山反向锯齿倒影"会形成尖刺/怪物嘴感，
    //   且与新版 fishing-bg.js 内置的"水波错位柔和倒影"冲突，故移除。

    // ── Layer 4.2: 已删除 ──
    //   原 ctx.stroke() 横向 Math.sin 波纹会形成工业斜纹/45°斜线感，
    //   且与新版湖面 dither + 浅滩过渡 + 反光带冲突，故移除。

    // ── Layer 4.3: 水面光斑（阳光碎点，动态，清晨柔白）──
    const sunSpotX = cw * 0.72;
    for (let i = 0; i < 10; i++) {
      const sx = sunSpotX + Math.sin(this.time * 0.8 + i * 2.1) * 90;
      const sy = waterLevel + 18 + i * 14 + Math.sin(this.time * 1.2 + i) * 5;
      // 仅在水面层（湖面上 1/3）出现，避免穿到水底
      if (sy > waterLevel + (ch - waterLevel) / 3) continue;
      const sa = (0.12 + Math.sin(this.time * 2 + i * 1.5) * 0.08);
      ctx.fillStyle = `rgba(255, 248, 224, ${Math.max(0, sa).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, 14 + Math.sin(this.time + i) * 4, 2, 0.15, 0, Math.PI * 2); ctx.fill();
    }

    // ── Layer 5: 近景植被 ──────────────────────────────
    this._renderShoreVegetation(ctx, cw, ch, waterLevel);

    // ── Layer 6: 氛围动态元素（飞鸟/落叶；动云已并入静态缓存，故不再调用 _renderEnvClouds）──
    this._renderEnvBirds(ctx);
    this._renderEnvLeaves(ctx);
  }

  /** 绘制连绵山脊（多峰叠加） */
  _drawMountainRange(ctx, cw, baseY, freqMul, heightMul, peaks, varianceMul) {
    ctx.beginPath(); ctx.moveTo(0, baseY);
    for (let x = 0; x <= cw; x += 6) {
      let h = 0;
      for (let p = 1; p <= peaks; p++) {
        h += Math.sin(x * freqMul * p + p * 1.7) * (1 / p) +
             Math.sin(x * freqMul * p * 2.3 + p * 3.1) * (1 / (p * 2));
      }
      const y = baseY - (Math.abs(h) * baseY * heightMul) - Math.sin(x * varianceMul) * baseY * 0.02;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cw, baseY); ctx.closePath(); ctx.fill();
  }

  /** 旧山体接口兼容 */
  _drawMountain(x, baseY, width, height) { const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(x - width, baseY); ctx.lineTo(x, baseY - height); ctx.lineTo(x + width, baseY); ctx.closePath(); ctx.fill(); }

  /** 湖畔植被剪影（水上部分近景） */
  _renderShoreSilhouette(ctx, cw, waterLevel) {
    // 左侧垂柳剪影
    this._drawWillowSilhouette(ctx, cw * 0.06, waterLevel - 2, 90, this.time);
    this._drawWillowSilhouette(ctx, cw * 0.18, waterLevel + 1, 70, this.time + 0.7);
    // 右侧竹林剪影
    this._drawBambooSilhouette(ctx, cw * 0.88, waterLevel - 1, 4, this.time);
    this._drawBambooSilhouette(ctx, cw * 0.96, waterLevel + 2, 3, this.time + 1.2);
    // 岸边灌木剪影
    this._drawBushSilhouette(ctx, cw * 0.25, waterLevel + 1, 22, '#1B4A2A');
    this._drawBushSilhouette(ctx, cw * 0.38, waterLevel + 3, 18, '#154020');
    this._drawBushSilhouette(ctx, cw * 0.72, waterLevel + 2, 20, '#1A3D25');
    // 水岸芦苇剪影
    this._drawReedsSilhouette(ctx, cw * 0.03, waterLevel + 5, 5, this.time);
    this._drawReedsSilhouette(ctx, cw * 0.65, waterLevel + 4, 4, this.time + 0.8);
    this._drawReedsSilhouette(ctx, cw * 0.94, waterLevel + 6, 5, this.time + 1.5);
  }

  /** 垂柳剪影 */
  _drawWillowSilhouette(ctx, x, groundY, height, time) {
    ctx.fillStyle = '#1A3D25';
    ctx.fillRect(x - 3, groundY - height * 0.45, 6, height * 0.45);
    const branchCount = 7;
    for (let i = 0; i < branchCount; i++) {
      const bx = x - 35 + i * 10;
      const sway = Math.sin(time * 1.0 + i * 0.9) * 6;
      const len = height * (0.30 + Math.sin(i * 1.3) * 0.08);
      ctx.strokeStyle = '#1A3D25'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(bx, groundY - height * 0.48);
      ctx.quadraticCurveTo(bx + sway * 0.5, groundY - height * 0.25, bx + sway, groundY - height * 0.48 + len);
      ctx.stroke();
      ctx.fillStyle = 'rgba(26,61,37,0.5)';
      ctx.beginPath(); ctx.ellipse(bx + sway, groundY - height * 0.48 + len, 4, 3, sway * 0.02, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 竹林剪影 */
  _drawBambooSilhouette(ctx, x, groundY, count, time) {
    for (let i = 0; i < count; i++) {
      const bx = x + i * 10 - count * 5;
      const sway = Math.sin(time * 1.2 + i * 1.1) * 3;
      const bh = 90 + Math.sin(i * 2.3) * 20;
      ctx.strokeStyle = '#1A3D25'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx, groundY);
      ctx.quadraticCurveTo(bx + sway * 0.3, groundY - bh * 0.5, bx + sway, groundY - bh);
      ctx.stroke();
      for (let j = 1; j < 4; j++) {
        const ny = groundY - bh * (j / 4);
        const nx = bx + sway * (j / 4);
        ctx.strokeStyle = '#14301E'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(nx - 2, ny); ctx.lineTo(nx + 2, ny); ctx.stroke();
      }
    }
  }

  /** 灌木剪影 */
  _drawBushSilhouette(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - r * 0.3, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color + 'CC';
    ctx.beginPath(); ctx.arc(x - r * 0.5, y - r * 0.1, r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.5, y - r * 0.15, r * 0.65, 0, Math.PI * 2); ctx.fill();
  }

  /** 芦苇剪影 */
  _drawReedsSilhouette(ctx, x, waterY, count, time) {
    for (let i = 0; i < count; i++) {
      const rx = x + i * 8;
      const sway = Math.sin(time * 1.8 + i * 1.5) * 5;
      const rh = 30 + Math.sin(i * 2.7) * 10;
      ctx.strokeStyle = '#1A3D25'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(rx, waterY);
      ctx.quadraticCurveTo(rx + sway * 0.5, waterY - rh * 0.5, rx + sway, waterY - rh);
      ctx.stroke();
    }
  }

  /** 水下气泡 — 纯水下视角版 */
  _renderBubbles() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    // 纯水下：气泡从底部上升，顶部循环
    const topBound = 5;
    if (!this._bubbles) {
      this._bubbles = [];
      for (let i = 0; i < 15; i++) {
        this._bubbles.push({
          x: Math.random() * cw,
          y: 40 + Math.random() * (ch - 80),
          r: 2 + Math.random() * 5,
          speed: 18 + Math.random() * 30,
          wobble: Math.random() * Math.PI * 2,
          alpha: 0.12 + Math.random() * 0.22
        });
      }
    }
    for (const b of this._bubbles) {
      b.y -= b.speed * 0.016;
      b.x += Math.sin(this.time * 2 + b.wobble) * 0.6;
      if (b.y < topBound) {
        b.y = ch - 20 - Math.random() * 50;
        b.x = Math.random() * cw;
      }
      const depthFade = 0.6 + 0.4 * Math.max(0, 1 - b.y / (ch * 0.3));
      ctx.fillStyle = `rgba(180, 235, 255, ${b.alpha * depthFade})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      // 高光
      ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * depthFade * 0.4})`;
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 焦散光纹（Caustics）—— 水面上方阳光折射产生的网状光纹 */
  _renderCaustics(ctx, cw, ch) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    const t = this.time * 0.4;
    // 焦散光纹由多层叠加正弦波构成
    for (let layer = 0; layer < 3; layer++) {
      const freq = 0.015 + layer * 0.008;
      const speed = t * (0.8 + layer * 0.4);
      ctx.fillStyle = `rgba(160, 230, 255, ${0.04 - layer * 0.01})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= cw; x += 8) {
        for (let y = 0; y < ch * 0.35; y += 8) {
          const val = Math.sin(x * freq + speed) * Math.cos(y * freq * 1.3 + speed * 0.7)
                    + Math.sin((x + y) * freq * 0.7 - speed * 0.5) * 0.5;
          if (val > 0.6) {
            const brightness = (val - 0.6) * 2.5;
            ctx.globalAlpha = brightness * 0.12 * Math.max(0, 1 - y / (ch * 0.35));
            ctx.fillRect(x, y, 8, 8);
          }
        }
      }
    }
    ctx.restore();
  }

  /** 丁达尔光柱（Light Shafts）—— 从水面射入的散射光 */
  _renderLightShafts(ctx, cw, ch) {
    // PHASE 13-3：从矢量平滑梯形 → 像素列状光带
    // 3 道光柱（左中右），每道由 4~8px 宽的硬边像素列拼接
    const shafts = [
      { baseX: cw * 0.18, width: 60, length: ch * 0.42, alphaBase: 0.10, freq: 0.30, off: 1.7 },
      { baseX: cw * 0.50, width: 80, length: ch * 0.50, alphaBase: 0.13, freq: 0.25, off: 3.4 },
      { baseX: cw * 0.82, width: 55, length: ch * 0.38, alphaBase: 0.09, freq: 0.35, off: 5.1 }
    ];
    const colCellW = 6; // 单像素列宽 6px（像素感明显但不过散）
    for (const s of shafts) {
      const sway = Math.sin(this.time * s.freq + s.off) * 25;
      const baseX = s.baseX + sway;
      const breath = 0.85 + Math.sin(this.time * 0.4 + s.off) * 0.15;
      const length = s.length * breath;
      const colCount = Math.ceil(s.width / colCellW);
      const leftX = Math.floor(baseX - (colCount * colCellW) / 2);
      for (let i = 0; i < colCount; i++) {
        // 距中心越远透明度越低（梯度）+ 顶部更亮、底部消散
        const distRatio = Math.abs(i - colCount / 2) / (colCount / 2);
        const colAlpha = s.alphaBase * (1 - distRatio * 0.7) * breath;
        // 每列底部要比顶部宽（透视感）→ 用每列再切成几段，越往下宽度略偏移
        const segH = 8;
        const segCount = Math.ceil(length / segH);
        for (let j = 0; j < segCount; j++) {
          const yTop = j * segH;
          const fade = 1 - (j / segCount); // 顶亮底淡
          const a = Math.max(0, colAlpha * (0.5 + fade * 0.5));
          ctx.fillStyle = `rgba(168, 208, 224, ${a.toFixed(3)})`;
          // 透视外撇：每往下偏 colCellW*0.06 的像素
          const colX = leftX + i * colCellW + Math.floor(j * 0.4 * (i - colCount / 2) / colCount);
          ctx.fillRect(colX, yTop, colCellW, segH);
        }
      }
    }
  }

  /** 悬浮微粒（Plankton）—— 水下浮游物 */
  _renderPlankton(ctx, cw, ch) {
    if (!this._plankton) {
      this._plankton = [];
      for (let i = 0; i < 25; i++) {
        this._plankton.push({
          x: Math.random() * cw,
          y: Math.random() * ch,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 4 - 2,
          size: 1 + Math.random() * 2,
          alpha: 0.08 + Math.random() * 0.15,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
    for (const p of this._plankton) {
      p.x += p.vx * 0.016 + Math.sin(this.time * 0.8 + p.phase) * 0.3;
      p.y += p.vy * 0.016 + Math.cos(this.time * 0.6 + p.phase) * 0.2;
      // 循环边界
      if (p.x < -5) p.x = cw + 5;
      if (p.x > cw + 5) p.x = -5;
      if (p.y < -5) p.y = ch + 5;
      if (p.y > ch + 5) p.y = -5;
      const twinkle = 0.7 + 0.3 * Math.sin(this.time * 2 + p.phase);
      ctx.fillStyle = `rgba(200, 240, 255, ${p.alpha * twinkle})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 深水暗角（Vignette）—— 四周渐暗的晕影效果 */
  _renderVignette(ctx, cw, ch) {
    const gradient = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, ch * 0.85);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.8, 'rgba(0,10,20,0.2)');
    gradient.addColorStop(1, 'rgba(0,8,15,0.55)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cw, ch);
  }

  /** 近景湖畔植被：垂柳 + 竹林 + 灌木 */
  _renderShoreVegetation(ctx, cw, ch, waterLevel) {
    // ── 左侧垂柳 ──
    this._drawWillow(ctx, cw * 0.05, waterLevel - 8, 110, this.time);
    this._drawWillow(ctx, cw * 0.15, waterLevel - 4, 85, this.time + 0.5);
    // ── 右侧竹林 ──
    this._drawBambooCluster(ctx, cw * 0.88, waterLevel - 6, 5, this.time);
    this._drawBambooCluster(ctx, cw * 0.95, waterLevel - 2, 3, this.time + 1.2);
    // ── 岸边灌木 ──
    //   2026-06-05：4 处程序绘制的绿色圆球状灌木已删除 —— 与新水墨贴图
    //   风格冲突，被反馈"圆球感太强"。_drawBush 函数保留以防其他场景调用。
    // this._drawBush(ctx, cw * 0.22, waterLevel - 2, 28, '#2E7D32');
    // this._drawBush(ctx, cw * 0.35, waterLevel + 2, 22, '#388E3C');
    // this._drawBush(ctx, cw * 0.78, waterLevel - 1, 26, '#1B5E20');
    // this._drawBush(ctx, cw * 0.82, waterLevel + 3, 20, '#33691E');
    // ── 水岸芦苇 ──
    this._drawReeds(ctx, cw * 0.02, waterLevel + 10, 6, this.time);
    this._drawReeds(ctx, cw * 0.68, waterLevel + 8, 4, this.time + 0.7);
    this._drawReeds(ctx, cw * 0.92, waterLevel + 12, 5, this.time + 1.4);
  }

  /** 垂柳 */
  _drawWillow(ctx, x, groundY, height, time) {
    // 树干
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(x - 4, groundY - height * 0.55, 8, height * 0.55);
    // 主枝
    ctx.strokeStyle = '#6D4C41'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, groundY - height * 0.55);
    ctx.quadraticCurveTo(x - 20, groundY - height * 0.7, x - 35, groundY - height * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, groundY - height * 0.55);
    ctx.quadraticCurveTo(x + 22, groundY - height * 0.72, x + 40, groundY - height * 0.58); ctx.stroke();
    // 垂枝帘幕
    const branchCount = 9;
    for (let i = 0; i < branchCount; i++) {
      const bx = x - 45 + i * 12;
      const sway = Math.sin(time * 1.2 + i * 0.9) * 8;
      const len = height * (0.35 + Math.sin(i * 1.3) * 0.1);
      ctx.strokeStyle = i % 2 === 0 ? '#4CAF50' : '#66BB6A';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, groundY - height * 0.58);
      ctx.quadraticCurveTo(bx + sway * 0.5, groundY - height * 0.3, bx + sway, groundY - height * 0.58 + len);
      ctx.stroke();
      // 叶簇
      ctx.fillStyle = i % 2 === 0 ? 'rgba(76,175,80,0.6)' : 'rgba(102,187,106,0.5)';
      ctx.beginPath(); ctx.ellipse(bx + sway, groundY - height * 0.58 + len, 6, 4, sway * 0.02, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 竹林 */
  _drawBambooCluster(ctx, x, groundY, count, time) {
    for (let i = 0; i < count; i++) {
      const bx = x + i * 12 - count * 6;
      const sway = Math.sin(time * 1.5 + i * 1.1) * 4;
      const bh = 120 + Math.sin(i * 2.3) * 25;
      // 竹竿
      ctx.strokeStyle = '#558B2F'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bx, groundY);
      ctx.quadraticCurveTo(bx + sway * 0.3, groundY - bh * 0.5, bx + sway, groundY - bh);
      ctx.stroke();
      // 竹节
      ctx.strokeStyle = '#33691E'; ctx.lineWidth = 5;
      for (let j = 1; j < 5; j++) {
        const ny = groundY - bh * (j / 5);
        const nx = bx + sway * (j / 5);
        ctx.beginPath(); ctx.moveTo(nx - 3, ny); ctx.lineTo(nx + 3, ny); ctx.stroke();
      }
      // 竹叶
      ctx.fillStyle = 'rgba(85,139,47,0.7)';
      const lx = bx + sway, ly = groundY - bh;
      for (let l = 0; l < 4; l++) {
        const la = -0.6 + l * 0.4 + Math.sin(time * 2 + i + l) * 0.15;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(la);
        ctx.beginPath(); ctx.ellipse(10, 0, 14, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  /** 灌木 */
  _drawBush(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - r * 0.3, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color + 'CC';
    ctx.beginPath(); ctx.arc(x - r * 0.5, y - r * 0.1, r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.5, y - r * 0.15, r * 0.65, 0, Math.PI * 2); ctx.fill();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.5, r * 0.4, 0, Math.PI * 2); ctx.fill();
  }

  /** 水岸芦苇 */
  _drawReeds(ctx, x, waterY, count, time) {
    for (let i = 0; i < count; i++) {
      const rx = x + i * 9;
      const sway = Math.sin(time * 2 + i * 1.5) * 6;
      const rh = 40 + Math.sin(i * 2.7) * 12;
      ctx.strokeStyle = '#7CB342'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rx, waterY);
      ctx.quadraticCurveTo(rx + sway * 0.5, waterY - rh * 0.5, rx + sway, waterY - rh);
      ctx.stroke();
      // 芦苇穗
      ctx.fillStyle = '#A1887F';
      ctx.beginPath(); ctx.ellipse(rx + sway, waterY - rh - 6, 3, 8, sway * 0.03, 0, Math.PI * 2); ctx.fill();
    }
  }

  _renderPlatform() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const x = this.characterX; const y = this.platformY;
    // 2026-06-02：浮台不动，阿明独立下移 50（通过返回 floatOffset + 50），涟漪独立上移 50
    const RIPPLE_LIFT = 50;  // 涟漪相对浮台底沿向上偏移
    const AMING_DROP  = 40;  // 阿明相对原位向下偏移（仅影响返回值）—— 50-10 上移微调
    const floatOffset = Math.sin(this.time * 1.8) * 3.75;
    const drawY = y + floatOffset;               // 浮台 y（不动，原波浪节奏）

    // 涟漪锚点：浮台底沿水面位置 - RIPPLE_LIFT（向上）
    const sprite = isShipSpriteReady();
    const platformBottomY = drawY + (sprite ? SHIP_SPRITE_SIZE.h : 60);

    // —— 1) 涟漪先画（层级在浮台之后/下方，会被浮台遮挡上半部分）—— //
    const rippleY = platformBottomY + 4 - RIPPLE_LIFT;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const phase = (this.time * 0.35 + i / 3) % 1; // 0→1 循环
      const r = 90 + phase * 70;                    // 半径 90→160
      const a = (1 - phase) * 0.22;                 // 透明度 0.22→0
      if (a <= 0.01) continue;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, rippleY, r, r * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // —— 2) 浮台外观渲染（盖在涟漪之上）—— //
    if (sprite) {
      drawShipSprite(ctx, x, drawY);
    } else {
      // 兜底：原木板 + 红色浮筒程序绘制
      const platformWidth = 210; const platformHeight = 21; const floatTubeRadius = 18;
      ctx.fillStyle = '#5D4037'; ctx.fillRect(x - platformWidth / 2, drawY + platformHeight - 6, platformWidth, 9);
      ctx.fillStyle = '#A1887F'; ctx.fillRect(x - platformWidth / 2, drawY, platformWidth, platformHeight);
      ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5; for (let i = -platformWidth / 2 + 33; i < platformWidth / 2; i += 36) { ctx.beginPath(); ctx.moveTo(x + i, drawY + 3); ctx.lineTo(x + i, drawY + platformHeight - 4); ctx.stroke(); }
      ctx.strokeStyle = '#8D6E63'; ctx.beginPath(); ctx.moveTo(x - platformWidth / 2 + 3, drawY + platformHeight / 2); ctx.lineTo(x + platformWidth / 2 - 3, drawY + platformHeight / 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - platformWidth / 2 + 7, drawY + 3, platformWidth - 14, 4);
      ctx.fillStyle = '#D32F2F';
      ctx.beginPath(); ctx.ellipse(x - platformWidth / 2 + floatTubeRadius + 6, drawY + platformHeight + floatTubeRadius, floatTubeRadius, floatTubeRadius + 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + platformWidth / 2 - floatTubeRadius - 6, drawY + platformHeight + floatTubeRadius, floatTubeRadius, floatTubeRadius + 3, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 阿明 / 鱼竿 / 浮漂位置：原 floatOffset + AMING_DROP（向下 50）
    return floatOffset + AMING_DROP;
  }

  _renderCharacter(floatOffset) {
    this._renderCharacterBody(floatOffset);
    // 右手在鱼竿之后绘制，遮挡鱼竿握把
    if (!this.fsm.is('Idle')) {
      this._renderRightHand(floatOffset);
    }
    // Layer 6.2: 主角头顶名字标签（Billboard，最高层）
    this._renderPlayerNameTag(floatOffset);
  }

  // 主角头顶名字标签（Billboard 渲染，始终面向摄像机）
  _renderPlayerNameTag(floatOffset) {
    const cfg = this.playerNameConfig;
    if (!cfg || !cfg.enabled) return;

    const ctx = this.ctx;
    // 角色头顶在屏幕上的位置：characterX 是角色中心，characterY + floatOffset 是脚底
    // 头部在 y = -82（相对于脚底），所以头顶 = y + floatOffset - 82
    const cx = this.characterX;
    const cy = this.characterY + floatOffset - 82 + cfg.offsetY;

    ctx.save();
    if (cfg.shadowBlur > 0) {
      ctx.shadowColor = cfg.shadowColor;
      ctx.shadowBlur = cfg.shadowBlur;
    }
    ctx.font = `bold ${cfg.fontSize}px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (cfg.strokeWidth > 0 && cfg.strokeColor) {
      ctx.lineWidth = cfg.strokeWidth;
      ctx.strokeStyle = cfg.strokeColor;
      ctx.strokeText(cfg.text, cx, cy);
    }
    ctx.fillStyle = cfg.color;
    ctx.fillText(cfg.text, cx, cy);
    ctx.restore();
  }

  _renderCharacterBody(floatOffset) {
    // PHASE 21-C：sprite 优先（amin-fish-back-6f.png 6 帧），未就绪回退原程序绘制
    //   - sprite 内部已含右手持竿，因此 _renderRightHand 在 sprite 启用时整个跳过
    //   - sprite 不需做 ctx.scale(-1, 1) 翻转（spec.notes 注明"原生背面帧"）
    //   - 锚点 (48, 158) = 脚底中央
    //   - footY 计算：v2.0 的 this.characterY 实际是腰部锚点（程序化绘制中
    //     鞋底在 characterY + 42），所以 sprite 脚底应对齐 characterY + 42
    //     才能与浮台顶面 platformY 对齐（platformY = characterY + 42 = ch-75）
    //   - floatOffset 由 sprite 模块内部叠加（与浮台漂浮兼容）
    if (isAmingFishSheetReady()) {
      const frameIdx = this._getAmingFishFrameIdx();
      const footY = this.characterY + 42;
      drawAmingFishFrame(this.ctx, this.characterX, footY, frameIdx, floatOffset);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 兜底：原程序化几何绘制（v2.0 风格，sprite 加载失败时启用）
    // ─────────────────────────────────────────────────────────────
    const ctx = this.ctx; const x = this.characterX; const y = this.characterY + floatOffset;
    ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
    const headRadius = 21; const bodyWidth = 39; const bodyHeight = 54; const legHeight = 36; const footSize = 15;
    ctx.fillStyle = '#FFCC80'; ctx.beginPath(); ctx.arc(0, -82, headRadius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3E2723'; ctx.beginPath(); ctx.arc(3, -87, headRadius + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5D4037'; ctx.beginPath(); ctx.arc(-3, -93, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8D6E63'; ctx.beginPath(); ctx.ellipse(0, -93, 33, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#A1887F'; ctx.beginPath(); ctx.ellipse(0, -102, 21, 12, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6D4C41'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-21, -93); ctx.quadraticCurveTo(-30, -75, -18, -67); ctx.stroke();
    ctx.fillStyle = '#5C6BC0'; ctx.fillRect(-bodyWidth / 2, -63, bodyWidth, bodyHeight);
    ctx.fillStyle = '#3F51B5'; ctx.fillRect(-bodyWidth / 2, -63, 4, bodyHeight); ctx.fillRect(bodyWidth / 2 - 4, -63, 4, bodyHeight);
    ctx.fillRect(-15, -63, 7, 33); ctx.fillRect(8, -63, 7, 33);
    ctx.fillStyle = '#FFD700'; ctx.fillRect(-12, -52, 6, 6); ctx.fillRect(10, -52, 6, 6);
    ctx.fillStyle = '#3F51B5'; ctx.fillRect(9, -30, 12, 15);
    // 左手（自然下垂）
    ctx.fillStyle = '#FFCC80'; ctx.save(); ctx.translate(-bodyWidth / 2, -40); ctx.rotate(0.3); ctx.beginPath(); ctx.ellipse(-9, 18, 9, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#F5DEB3'; ctx.beginPath(); ctx.ellipse(-12, 42, 7, 9, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#5D4037'; ctx.fillRect(-18, -9, 15, legHeight); ctx.fillRect(3, -9, 15, legHeight);
    ctx.fillStyle = '#37474F'; ctx.fillRect(-19, 27, 18, footSize); ctx.fillRect(1, 27, 18, footSize);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(0, 42, 27, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ────────────────────────────────────────────────────────────
  // PHASE 21-C：FSM 状态 → 阿明 sprite 帧索引映射（用户拍板 v1.3）
  //   ──────────────────────────────────────────────────────────
  //   Idle               → 帧 3（站立）← v1.3 调整
  //   Aiming             → 帧 1（蓄力）
  //   Casting            → 帧 2（甩出）
  //   Waiting            → 帧 3(收手)
  //   BiteWindow         → 帧 4（收手 - 继续等，鱼咬钩瞬间）
  //   Reeling/Playing    → 帧 0（站立持竿，提竿/搏斗）
  //   Caught             → 帧 0（站立持竿，捕获定格）
  //   Failed             → 帧 0（回到站立）
  //   ──────────────────────────────────────────────────────────
  //   注：用户根据线上实际视觉效果调整，以游戏内表现为准
  // ────────────────────────────────────────────────────────────
  _getAmingFishFrameIdx() {
    if (this.fsm.is('Idle')) return 3;
    if (this.fsm.is('Aiming')) return 1;
    if (this.fsm.is('Casting')) return 2;
    if (this.fsm.is('Waiting')) return 3;
    if (this.fsm.is('BiteWindow')) return 4;
    if (this.fsm.is('Reeling') || this.fsm.is('Playing')) return 0;
    if (this.fsm.is('Caught')) return 0;
    if (this.fsm.is('Failed')) return 0;
    return 0;
  }

  _renderRightHand(floatOffset) {
    // PHASE 21-C：sprite 已含右手持竿姿势 → sprite 启用时整个跳过本函数
    //   sprite 加载失败时回退原绘制（兜底）
    if (isAmingFishSheetReady()) return;
    const ctx = this.ctx; const x = this.characterX; const y = this.characterY + floatOffset;
    const bodyWidth = 39;
    ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
    // 右手（持竿）- 红色袖子+肤色手臂，遮挡鱼竿握把
    ctx.fillStyle = '#FFCC80'; ctx.save(); ctx.translate(bodyWidth / 2, -42); ctx.rotate(-0.5); ctx.beginPath(); ctx.ellipse(9, 18, 9, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#F5DEB3'; ctx.beginPath(); ctx.ellipse(15, 36, 7, 9, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.restore();
  }

  _renderCasting(floatOffset = 0) {
    const ctx = this.ctx; const cfg = CONFIG.casting; const totalDuration = cfg.windUpDuration + cfg.swingDuration + cfg.releaseDuration;
    const progress = Math.min(this.castProgress / totalDuration, 1);
    let bobX, bobY;
    if (progress < 0.4) { const swingProgress = progress / 0.4; bobX = this.castFrom.x; bobY = this.castFrom.y - 45 * (1 - swingProgress); }
    else { const releaseProgress = (progress - 0.4) / 0.6; const easeOut = 1 - Math.pow(1 - releaseProgress, 2); bobX = this.castFrom.x + (this.castTo.x - this.castFrom.x) * easeOut; bobY = this.castFrom.y + (this.castTo.y - this.castFrom.y) * easeOut; bobY -= 150 * (this.aimPower / 100) * Math.sin(releaseProgress * Math.PI); }
    const ROD_LENGTH = 180; let rodAngle;
    if (progress < 0.3) rodAngle = -Math.PI / 6 - (progress / 0.3) * Math.PI / 6;
    else if (progress < 0.4) rodAngle = -Math.PI / 3 - ((progress - 0.3) / 0.1) * Math.PI / 4;
    else rodAngle = -Math.PI / 4;
    // 鱼竿起点跟随人物右手位置
    const bodyWidth = 39;
    const x = this.characterX; const y = this.characterY + floatOffset;
    ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
    const handX = bodyWidth / 2 + 15; const handY = -42 + 36;
    ctx.save(); ctx.translate(handX, handY); ctx.rotate(-0.5);
    ctx.rotate(rodAngle + 0.5);
    const gradient = ctx.createLinearGradient(0, 0, ROD_LENGTH, 0); gradient.addColorStop(0, '#5D4037'); gradient.addColorStop(0.4, '#A1887F'); gradient.addColorStop(1, '#BCAAA4');
    ctx.fillStyle = gradient; ctx.fillRect(0, -4, 37, 8); ctx.fillRect(37, -3, 52, 6); ctx.fillRect(89, -2, 45, 4); ctx.fillRect(134, -1.5, 46, 3);
    ctx.fillStyle = '#78909C'; [45, 97, 142].forEach(pos => { ctx.beginPath(); ctx.arc(pos, 0, pos === 45 ? 4.5 : pos === 97 ? 3.75 : 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore(); // 结束鱼竿局部变换
    // 鱼线：计算竿尖在翻转坐标系中的位置，再转回屏幕坐标
    const rodTipLocalX = handX + Math.cos(rodAngle) * ROD_LENGTH;
    const rodTipLocalY = handY + Math.sin(rodAngle) * ROD_LENGTH;
    const tipX = x - rodTipLocalX;
    const tipY = y + rodTipLocalY;
    ctx.restore(); // 结束翻转坐标系
    if (progress >= 0.4) { ctx.strokeStyle = 'rgba(100,100,100,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(bobX, bobY); ctx.stroke(); }
    // PHASE 21-1 D5：抖动偏移（非 BiteWindow 时 d5 返回 {0,0,hidden:false}）
    const _d5b = this.d5 ? this.d5.getBobOffset() : { dx: 0, dy: 0, hidden: false };
    if (!_d5b.hidden) this._drawPixelBob(bobX + _d5b.dx, bobY + _d5b.dy);
  }

  _renderRodAndBob(floatOffset = 0) {
    const ctx = this.ctx; const ROD_LENGTH = 180;
    const bodyWidth = 39;
    const x = this.characterX; const y = this.characterY + floatOffset;
    // PHASE 21-C：sprite 启用时不翻转坐标系（背面视角玩家右手在屏幕右侧）
    const useSprite = isAmingFishSheetReady();
    ctx.save(); ctx.translate(x, y);
    if (!useSprite) ctx.scale(-1, 1);
    // ──────────────────────────────────────────────────────────
    // PHASE 21-C v1.4：按 sprite 帧动态调整钓竿握持点 + 竿身角度
    //   每帧右手位置不同，钓竿握把必须跟随；同时角度按动作语义切换：
    //     帧 1 蓄力：手举高在头部右上 → handY 上移；竿朝正上方
    //     帧 2 甩出：手前伸朝右      → handX 右移；竿朝右上方
    //     帧 0/3/4/5：默认站立持竿姿态 → handX=12, handY=-6, 竿斜 -π/4
    //   v2.0 程序化模式（sprite 未就绪）保持原值
    // ──────────────────────────────────────────────────────────
    let handX, handY, rodAngle;
    if (useSprite) {
      const frameIdx = this._getAmingFishFrameIdx ? this._getAmingFishFrameIdx() : 3;
      switch (frameIdx) {
        case 1:  // 蓄力：手在头顶右上方，竿朝正上偏左（-π*0.75）
          handX = 27; handY = -62; rodAngle = -Math.PI * 0.75;
          break;
        case 2:  // 甩出：手前伸右侧，竿朝右上方
          handX = 20; handY = -40; rodAngle = -Math.PI * 0.35;
          break;
        default: // 站立持竿（帧 0/3/4/5）
          handX = 12; handY = -6; rodAngle = -Math.PI / 4;
      }
    } else {
      // v2.0 程序化：右手骨骼节点（与 _renderRightHand 一致）
      handX = bodyWidth / 2 + 15;
      handY = -42 + 36;
      rodAngle = -Math.PI / 4;
    }
    ctx.save(); ctx.translate(handX, handY); ctx.rotate(-0.5);
    // 鱼竿从手部位置斜伸出（角度按帧动态变化）
    ctx.rotate(rodAngle + 0.5);
    const gradient = ctx.createLinearGradient(0, 0, ROD_LENGTH, 0); gradient.addColorStop(0, '#5D4037'); gradient.addColorStop(0.4, '#A1887F'); gradient.addColorStop(1, '#BCAAA4');
    ctx.fillStyle = gradient; ctx.fillRect(0, -4, 37, 8); ctx.fillRect(37, -3, 52, 6); ctx.fillRect(89, -2, 45, 4); ctx.fillRect(134, -1.5, 46, 3);
    ctx.fillStyle = '#78909C'; [45, 97, 142].forEach(pos => { ctx.beginPath(); ctx.arc(pos, 0, pos === 45 ? 4.5 : pos === 97 ? 3.75 : 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    // 鱼线：计算竿尖在世界坐标中的位置
    const rodTipLocalX = handX + Math.cos(rodAngle) * ROD_LENGTH;
    const rodTipLocalY = handY + Math.sin(rodAngle) * ROD_LENGTH;
    // sprite 模式不翻转 → 直接相加；v2.0 翻转模式 → 减
    const tipX = useSprite ? (x + rodTipLocalX) : (x - rodTipLocalX);
    const tipY = y + rodTipLocalY;
    ctx.restore(); // 结束坐标系
    // PHASE 21-C v1.4：Casting 飞行期（_castingWaitingSplash=false）由 CastAimSystem
    //   接管画飞行中的浮漂+鱼线，本函数仅画甩出帧的钓竿不画鱼线/浮漂
    if (this.fsm.is('Casting') && !this._castingWaitingSplash) return;

    // hotfix（2026-06-01g）：Idle / Aiming 状态下浮漂应"挂在鱼竿尖"自然下垂，
    //   而不是出现在水里。仅改绘制位置，不动 this.bobX/bobY 状态字段。
    // hotfix（2026-06-01i）：新浮漂高 48 屏幕像素（半高 24），更圆润 22 宽
    //   - Idle/Aiming：完整浮漂挂在竿尖正下，鱼线短直线
    //   - 落水状态：仅画上半 + 持续涟漪
    let bobDrawX = this.bobX;
    let bobDrawY = this.bobY;
    const inIdleLikeState = this.fsm.is('Idle') || this.fsm.is('Aiming');
    if (inIdleLikeState) {
      bobDrawX = tipX;
      bobDrawY = tipY + 22;  // 短鱼线 ~3px + 缩小后浮漂半高 ~19px（48*0.8/2≈19）
    }

    // PHASE 21-1 D5 v2.1：先取抖动+sink 偏移，鱼线终点也要跟着浮漂走（拟真）
    const _d5b = this.d5 ? this.d5.getBobOffset() : { dx: 0, dy: 0, hidden: false };
    // PHASE 21-1 D14：Waiting 期叠加前戏 dx/dy（试探/偷吃晃动），与 D5 偏移叠加
    let _preDx = 0, _preDy = 0;
    if (this.fsm.is('Waiting') && this.fishGroupSystem &&
        typeof this.fishGroupSystem.getBobberPreBiteOffset === 'function') {
      const pre = this.fishGroupSystem.getBobberPreBiteOffset();
      _preDx = pre.dx; _preDy = pre.dy;
    }
    // 鱼线终点：落水状态叠加 d5 + 前戏偏移；idle/aiming 不叠（浮漂挂竿尖，无抖动）
    const lineEndX = inIdleLikeState ? bobDrawX : (bobDrawX + _d5b.dx + _preDx);
    const lineEndY = inIdleLikeState ? bobDrawY : (bobDrawY + _d5b.dy + _preDy);

    ctx.strokeStyle = 'rgba(100,100,100,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tipX, tipY);
    if (inIdleLikeState) {
      // 短鱼线：竿尖直接连到浮漂（不再用大弧线弯到水面）
      ctx.lineTo(lineEndX, lineEndY);
    } else {
      const midX = (tipX + lineEndX) / 2;
      ctx.quadraticCurveTo(midX, Math.min(tipY, lineEndY) - 45, lineEndX, lineEndY);
    }
    ctx.stroke();

    if (inIdleLikeState) {
      // 完整浮漂挂在竿尖
      this._drawPixelBob(bobDrawX + _d5b.dx, bobDrawY + _d5b.dy, false);
    } else {
      // 落水状态：先画涟漪（在浮漂下方），再画浮漂上半（覆盖在涟漪上）
      this._drawBobRipples(bobDrawX, bobDrawY);
      // sink 阶段已沉入水下：跳过本体绘制，由 D5 render 接管水下剪影
      if (!_d5b.hidden) this._drawPixelBob(bobDrawX + _d5b.dx + _preDx, bobDrawY + _d5b.dy + _preDy, true);
    }
  }

  // PHASE 21-1 D14：_renderFishShadow 已删除（旧"幽灵鱼游向浮漂"已移除）
  //   替代物：FishGroupSystem 的三鱼群常驻渲染 + commit 4 即将引入的 BobberApproachFSM 前戏层

  _renderParticles() { this.particles.draw(this.ctx); }

  _renderPlaying() {
    // hotfix（2026-06-01k）：渲染层 holdingSpace 与 _updatePlaying 保持一致
    //   含义已扩展为"按住拉杆键（空格 OR 鼠标左键）"，鱼朝向/挣扎动画都依赖此 flag
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const cfg = CONFIG.playing; const holdingSpace = this.input.isDown(' ') || this.input.isDown('space') || this._playingMouseHeld;

    // ═══════════════════════════════════════════════════════════
    //  100% 纯水下视角 — 日月潭深潜场景
    // ═══════════════════════════════════════════════════════════

    // ── Layer 0: 水下底图（PHASE 21-1：fishing-down-bg.jpg 替代程序化深水渐变）────
    //   优先用美术贴图；未就绪/失败时回退原程序化深水渐变
    //   其他特效层（dither / 焦散 / 光柱 / 波纹 / 鱼影 / 拉力条等）保持叠加
    ctx.imageSmoothingEnabled = false; // PHASE 13-3：水下场景全程禁用反锯齿
    if (!drawFishingDownBg(ctx, cw, ch)) {
      const waterGrad = ctx.createLinearGradient(0, 0, 0, ch);
      waterGrad.addColorStop(0, '#2A7A90');     // 顶部：水面透光区
      waterGrad.addColorStop(0.08, '#1E6880');   // 浅层
      waterGrad.addColorStop(0.25, '#155568');   // 中浅层
      waterGrad.addColorStop(0.50, '#0E4252');   // 中层
      waterGrad.addColorStop(0.75, '#0A3242');   // 深层
      waterGrad.addColorStop(1, '#061E2E');       // 最深处
      ctx.fillStyle = waterGrad; ctx.fillRect(0, 0, cw, ch);
    }

    // ── Layer 0.5: Bayer 4x4 dither 颗粒（PHASE 13-3，缓存一次 / 不每帧重算）──
    ctx.drawImage(this._getUnderwaterDither(), 0, 0);

    // ── Layer 1: 焦散光纹（水面上方阳光折射产生的网状光纹）──────
    this._renderCaustics(ctx, cw, ch);

    // ── Layer 2: 丁达尔光柱（从水面射入的散射光）────────────
    this._renderLightShafts(ctx, cw, ch);

    // ── Layer 3: 水下波纹（横向流动的折射纹）────────────────
    ctx.strokeStyle = 'rgba(180, 230, 255, 0.04)'; ctx.lineWidth = 1.5;
    for (let y = 30; y < ch * 0.8; y += 28) {
      const depthFade = Math.max(0, 1 - y / (ch * 0.6));
      ctx.globalAlpha = depthFade * 0.5;
      ctx.beginPath();
      for (let x = 0; x < cw; x += 4) {
        const waveY = y + Math.sin((x + this.time * 40) / 55) * 4 + Math.sin((x + this.time * 22) / 95) * 2.5;
        x === 0 ? ctx.moveTo(x, waveY) : ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── Layer 4: 水面光斑（顶部散射光点）────────────────────
    for (let i = 0; i < 10; i++) {
      const sx = cw * (0.08 + i * 0.09) + Math.sin(this.time * 0.5 + i * 2.3) * 50;
      const sy = 15 + i * 10 + Math.sin(this.time * 0.8 + i) * 5;
      const sa = (0.06 + Math.sin(this.time * 1.2 + i * 1.7) * 0.04) * Math.max(0, 1 - sy / (ch * 0.4));
      ctx.fillStyle = `rgba(180, 235, 255, ${Math.max(0, sa)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, 14 + Math.sin(this.time + i) * 5, 2.5, 0.15, 0, Math.PI * 2); ctx.fill();
    }

    // ── Layer 5: 湖底 ──────────────────────────────────
    this._renderWaterBottom();

    // ── Layer 6: 水草 ──────────────────────────────────
    this._renderWaterWeeds();

    // ── Layer 7: 小鱼群 ───────────────────────────────
    this._renderSmallFish();

    // ── Layer 8: 气泡 ─────────────────────────────────
    this._renderBubbles();

    // ── Layer 9: 悬浮微粒（水下浮游物）──────────────────────
    this._renderPlankton(ctx, cw, ch);

    // ── Layer 10: 深水暗角（四周渐暗的晕影效果）──────────────
    this._renderVignette(ctx, cw, ch);

    // ═══════════════════════════════════════════════════════════
    //  游戏元素层
    // ═══════════════════════════════════════════════════════════

    // ── 鱼线（PHASE 13-3f：单段二次贝塞尔 · 抗锯齿 · 圆头 · 鱼端偏置 0.75）──
    // 颜色：危险阈值才变色（85+ 黄 / 95+ 红闪），与右下拉力条独立映射
    // 形状：单段 quadraticCurveTo，最低点偏鱼端 75%；总弧度仍走 curveFactor 表
    // 约束：起点不动；终点 hotfix-v 改到"鱼嘴"而非鱼中心
    // hotfix-v（2026-06-04）：鱼线细一倍（4 → 2）；终点挂到鱼嘴而不是鱼身中心
    const lineWidth = 2;
    const fishingLineColor = this._getFishingLineColor(this.tension);
    // PHASE 21-1 D14 hotfix-o：鱼抖动反馈 —— 扣血后 200ms 内 ±4px 随机偏移
    //   仅作用于渲染层（鱼线终点 + 鱼贴图），不动 this.playingFishX/Y 逻辑坐标
    let hitDx = 0, hitDy = 0;
    if (performance.now() < this._fishHitShakeUntil) {
      hitDx = Math.round((Math.random() * 2 - 1) * 4);
      hitDy = Math.round((Math.random() * 2 - 1) * 4);
    }
    const renderFishX = this.playingFishX + hitDx;
    const renderFishY = this.playingFishY + hitDy;

    // hotfix-v（2026-06-04 第三次修订）：鱼线终点回到鱼中心
    //   原因：10 种鱼嘴位置 / 朝向差异巨大（曲腰鱼下垂嘴 / 鲤鱼鱼须 / 罗非鱼宽嘴 / 朝向左右翻转），
    //   单一全局 ratio 无法对齐；per-species 偏移表代价高且每次换图都要重标。
    //   决策：鱼线挂鱼中心，鱼身遮挡末端给玩家"咬钩"感，不穿帮，零维护成本。
    this._drawSmoothFishingLine(this.lineStartX, this.lineStartY, renderFishX, renderFishY, fishingLineColor, lineWidth);
    // 钩点：小到几乎看不见，主要靠鱼身把它遮住
    ctx.fillStyle = '#2A2A2E';
    ctx.fillRect(Math.floor(renderFishX) - 2, Math.floor(renderFishY) - 2, 4, 4);

    // 渲染鱼（约束 6：鱼形状不动；hotfix-o 加扣血抖动偏移）
    // hotfix-u：增加 species 参数，_renderFish 内部优先用 PNG，未就绪兜底原几何
    this._renderFish(renderFishX, renderFishY, this.currentFish.color, this.currentFish.size[0], holdingSpace, holdingSpace, this.currentFish.name);

    // hotfix-y5（2026-06-04）：扣血光弹 / COMBO 文字 / -N 飘字 三块统一搬到 _renderHUD 之后
    //   见本函数末尾 _renderHUD() 调用之后的"战斗反馈最顶层"块
    //   留这里只为标记历史位置，三块绘制代码现已下移到拉力面板之上

    // ─────────── PHASE 15 仗5 + hotfix-w B：鱼行为视觉预警增强 ───────────
    // surge 冲刺预告：鱼上方画"!"气泡（红圆 + 黄感叹号）
    // hotfix-w B 升级：
    //   1. 气泡呼吸缩放（1.5Hz pulse），更易引起视觉注意
    //   2. 加文字 "冲刺！" 在气泡下方
    //   3. 预警从 0.5s 提前到 1.2s（鱼行为模块已改），玩家有反应时间
    if (this.surgeWarnTimer > 0) {
      const bx = Math.floor(this.playingFishX);
      const by = Math.floor(this.playingFishY - 60);
      // 呼吸缩放 1.0 ~ 1.35（3Hz pulse）
      const pulse = 1.0 + 0.35 * Math.abs(Math.sin(this.time * 3 * Math.PI));
      const r = 14 * pulse;
      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.arc(bx + 1, by + 1, r + 1, 0, Math.PI * 2); ctx.fill();
      // 红底
      ctx.fillStyle = '#E74C3C';
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
      // 黄"!"（字号随脉冲）
      this._drawPixelText('!', bx, by, Math.round(22 * pulse), '#FFE066', '#1A1A2E');
      // 文字提示
      this._drawPixelText('冲刺！', bx, by - 22, 14, '#FFE066', '#5C1A1A');
    }
    // hotfix-w B（2026-06-04）：surge 进行中红色描边框已删除
    //   原因：鱼周围硬框影响视觉沉浸，类似 debug bbox。
    //   "!冲刺！" 呼吸气泡 + 1.2s 提前预警 已经足够明显，不再需要包围盒。

    // ── 鱼身体下方耐力条（PHASE 13-3：像素方格 + 像素字）──
    const fishHPBarW = 120; const fishHPBarX = Math.floor(this.playingFishX - fishHPBarW / 2); const fishHPBarY = Math.floor(this.playingFishY + 55);
    this._drawPixelHPBar(fishHPBarX, fishHPBarY, fishHPBarW, 10, this.fishHP / this.currentFish.maxHP, 4);
    ctx.textAlign = 'center';
    this._drawPixelText(`${Math.round(this.fishHP)}/${this.currentFish.maxHP}`, this.playingFishX, fishHPBarY + 24, 12, '#FFF4D6', '#5C3A1E');
    ctx.textAlign = 'left';

    // ═══════════════════════════════════════════════════════════
    //  UI层
    // ═══════════════════════════════════════════════════════════

    // ── 屏幕正下方 操作提示（PHASE 13-3：木牌 + 像素字 + 空格键按键样式）──
    const hintW = 420; const hintH = 70; const hintX = Math.floor((cw - hintW) / 2); const hintY = Math.floor(ch - 100);
    this._drawWoodPlaque(hintX, hintY, hintW, hintH);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (holdingSpace) {
      this._drawPixelText('✓ 拉 回 中 ...', cw / 2, hintY + hintH / 2, 22, '#5DBB63', '#1A1A2E');
    } else {
      const textY = hintY + hintH / 2 - 6;
      // "按住" 米白
      this._drawPixelText('按住', cw / 2 - 110, textY, 22, '#FFF4D6', '#5C3A1E');
      // "空格键" 像素键帽：深色描边 + 浅色按键 + 米白字
      const keyW = 92, keyH = 32;
      const keyX = cw / 2 - 46;
      const keyY = textY - keyH / 2;
      // 键帽描边
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(keyX, keyY, keyW, keyH);
      // 键帽内层（按下/未按区分）
      ctx.fillStyle = '#FFE9B0';
      ctx.fillRect(keyX + 2, keyY + 2, keyW - 4, keyH - 4);
      // 顶高光
      ctx.fillStyle = '#FFF4D6';
      ctx.fillRect(keyX + 2, keyY + 2, keyW - 4, 3);
      // 底阴影
      ctx.fillStyle = '#C99A4A';
      ctx.fillRect(keyX + 2, keyY + keyH - 5, keyW - 4, 3);
      // 键帽文字
      this._drawPixelText('空格键', cw / 2, keyY + keyH / 2, 16, '#1A1A2E', null);

      // hotfix（2026-06-01l）：空格键帽右侧增加"鼠标左键"像素图标
      //   形状：16×20 像素鼠标外轮廓 + 左侧上半高亮（左键被点亮）
      //   位置：紧邻空格键帽右侧 8px，与键帽垂直居中
      const mouseW = 16, mouseH = 20;
      const mouseX = keyX + keyW + 8;
      const mouseY = textY - mouseH / 2;
      this._drawMouseLeftIcon(mouseX, mouseY, mouseW, mouseH);

      // "拉回鱼" 米白（hotfix：原 cw/2+130 → cw/2+150 给鼠标图标腾位）
      this._drawPixelText('拉回鱼', cw / 2 + 150, textY, 22, '#FFF4D6', '#5C3A1E');
    }
    if (!holdingSpace) {
      this._drawPixelText('提示：不拉鱼线时鱼会恢复体力！', cw / 2, hintY + hintH / 2 + 22, 13, '#5DBB63', '#1A1A2E');
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // ─────────── PHASE 15 仗5：屏幕级钓线/危险预警 ───────────
    // 1) 钓线状态边框：红=tension≥85（将断），蓝=tension≤15（将松）。
    //    透明度做呼吸（基于 performance.now()），不抢主视觉。
    if (this.lineWarnColor) {
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      const breathe = 0.35 + 0.25 * Math.sin(t * 6);
      ctx.strokeStyle = this.lineWarnColor === 'red'
        ? `rgba(231, 76, 60, ${breathe})`
        : `rgba(52, 152, 219, ${breathe})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, cw - 6, ch - 6);
      ctx.lineWidth = 1;
    }
    // 2026-06-05 方案A+D：原屏幕中央"快收线/快放线"文字已删除（远离玩家视线焦点，
    //   反应链路太长）。改为：拉力条 ▲ 指针红区放大变红 + 闪烁 + 指针正下方"❗ 按住/松手"
    //   动作命令词（贴在视线焦点）+ 整条震动。所有反馈集中在 ▲ 指针周围 ~30px 区域。
    //   dangerTextTimer / dangerTextKind 状态字段保留（其他位置无引用，无副作用）。

    // ── 右下角"鱼种"信息面板（PHASE 13-3：木牌质感 + 像素血条/张力条）──
    const panelW = 240; const panelH = 155; const panelX = cw - panelW - 20; const panelY = ch - panelH - 20;
    this._drawWoodPlaque(panelX, panelY, panelW, panelH);
    // 鱼名（米白大字 + 深棕描边）
    ctx.textAlign = 'center';
    this._drawPixelText(this.currentFish.name, panelX + panelW / 2, panelY + 22, 18, '#FFF4D6', '#5C3A1E');
    // 星级（金黄米白）
    this._drawPixelText('★'.repeat(this.currentFish.rarity), panelX + panelW / 2, panelY + 46, 16, '#FFD46B', '#5C3A1E');

    // 耐力条（像素方格）
    const hpBarW = panelW - 30; const hpBarX = panelX + 15; const hpBarY = panelY + 60;
    this._drawPixelHPBar(hpBarX, hpBarY, hpBarW, 16, this.fishHP / this.currentFish.maxHP, 6);
    this._drawPixelText(`鱼的体力 ${Math.round(this.fishHP)}/${this.currentFish.maxHP}`, hpBarX + hpBarW / 2, hpBarY + 28, 12, '#FFF4D6', '#5C3A1E');

    // 鱼线拉力指示器（像素方格 + 三色档分）
    const tensionBarW = hpBarW; const tensionBarX = hpBarX; const tensionBarY = panelY + 100;
    // hotfix-y2：缓存拉力条坐标 → 给扣血光弹起点用（指针 ▲ 顶端）
    this._tensionBarRect = { x: tensionBarX, y: tensionBarY, w: tensionBarW, h: 16 };
    this._tensionBarPointerX = Math.floor(tensionBarX + tensionBarW * Math.max(0, Math.min(1, this.tension / cfg.maxTension)));
    this._tensionBarPointerY = tensionBarY + 8;
    // PHASE 13-5：拉力条视觉规范定稿 —— 正向语义
    //   tension=0 → 条空（左端）；tension=100 → 条满（右端）
    //   颜色：≤40 红 / ≤70 黄 / >70 绿（getTensionColor 唯一色源，鱼线同步）
    const tensionRatio = Math.max(0, Math.min(1, this.tension / cfg.maxTension));
    const tensionPalette = getTensionColor(this.tension);
    // 2026-06-05 方案A：红区时整个拉力条（含三色区+指针+操作提示）一起轻微震动
    //   高频低幅 ±1.5px：玩家潜意识感知"危险"，但不影响读 ▲ 位置
    const _inRedZone = this.tension < cfg.tensionLowThreshold || this.tension > cfg.tensionHighThreshold;
    if (_inRedZone) {
      const shakeX = Math.sin(this.time * 40) * 1.5;
      const shakeY = Math.cos(this.time * 35) * 0.8;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }
    // hotfix-r：传 ratio=0 → 只画底色框，不画随 tension 涨/落的彩色填充格
    //   玩家只看 ▲ 指针 vs 三色区即可，无需关注填充长度数字
    this._drawPixelTensionBar(tensionBarX, tensionBarY, tensionBarW, 16, 0, tensionPalette, 6);
    // hotfix-w（2026-06-04）：拉力条三色区直接画到底（不透明），与玩法层 _checkEscape 数值严格对齐
    //   旧 bug：绿色区画到 [0.40, 0.85]，但 _checkEscape 实际安全区只到 0.70 → 玩家以为还在绿区已开始跑鱼概率
    //   新规则：从 CONFIG.playing.tensionLowThreshold/HighThreshold 直接取数，永不脱钩
    //   配色：安全区绿、两侧（slack / 危险）红，玩家一眼看清楚
    {
      const safeL = cfg.tensionLowThreshold / cfg.maxTension;   // 0.40
      const safeR = cfg.tensionHighThreshold / cfg.maxTension;  // 0.70
      const safeX = Math.floor(tensionBarX + tensionBarW * safeL);
      const safeW = Math.ceil(tensionBarW * (safeR - safeL));
      // 左侧红区 [0, safeL)：slack 区
      ctx.fillStyle = '#C0392B';
      ctx.fillRect(tensionBarX, tensionBarY, safeX - tensionBarX, 16);
      // 中央绿区 [safeL, safeR]：实际安全区
      ctx.fillStyle = '#27AE60';
      ctx.fillRect(safeX, tensionBarY, safeW, 16);
      // 右侧红区 (safeR, 1.0]：危险区
      const dangerX = safeX + safeW;
      ctx.fillStyle = '#C0392B';
      ctx.fillRect(dangerX, tensionBarY, tensionBarX + tensionBarW - dangerX, 16);
      // 绿/红交界 1px 米色细线（更清楚）
      ctx.fillStyle = 'rgba(255, 244, 214, 0.7)';
      ctx.fillRect(safeX, tensionBarY, 1, 16);
      ctx.fillRect(dangerX - 1, tensionBarY, 1, 16);
    }
    // 3. tension≥85 闪烁警告外框（在条外侧加 2px 红色描边，sin 4Hz 振荡）
    //    叠加效果：不替换填充色 —— tension=92 时绿色填充 + 红色闪烁外框（"安全但接近极限"）
    if (this.tension >= 85) {
      const flashAlpha = 0.5 + 0.5 * Math.sin(this.time * 8 * Math.PI); // 4Hz（period 0.25s）
      ctx.strokeStyle = `rgba(232, 76, 76, ${flashAlpha})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(tensionBarX - 2, tensionBarY - 2, tensionBarW + 4, 16 + 4);
      ctx.lineWidth = 1;
    }
    // 4. 当前位置 ▲ 指针（位于填充末端，即 tension/100 处）
    //   2026-06-05 方案A：进入红区时指针放大 + 变红 + 闪烁，让玩家盯着指针就能感知危险
    //   2026-06-05 方案D：指针正下方紧贴显示"按住/松手"动作命令词（贴在视线焦点）
    {
      const ptrX = Math.floor(tensionBarX + tensionBarW * tensionRatio);
      const inLowRed  = this.tension < cfg.tensionLowThreshold;
      const inHighRed = this.tension > cfg.tensionHighThreshold;
      const inRed = inLowRed || inHighRed;
      // 红区指针：放大（半宽 6→9，高度 8→12）+ 闪烁脉冲
      const baseHalfW = 6, baseH = 8;
      const halfW = inRed ? 9 : baseHalfW;
      const h     = inRed ? 12 : baseH;
      // 闪烁透明度（4Hz）：红区时在 0.55~1.0 振荡，安全/警戒区恒定 1.0
      const pulse = inRed ? (0.775 + 0.225 * Math.sin(this.time * 8 * Math.PI)) : 1.0;
      // 颜色：左红→暖橙红 / 右红→警告红 / 安全→深紫黑
      const outerColor = inLowRed ? '#E67E22' : (inHighRed ? '#E84C3C' : '#1A1A2E');
      const innerColor = inLowRed ? '#FFD89B' : (inHighRed ? '#FFC4BD' : '#FFF4D6');
      ctx.save();
      ctx.globalAlpha = pulse;
      // 外描边（深色三角）
      ctx.fillStyle = outerColor;
      ctx.beginPath();
      ctx.moveTo(ptrX, tensionBarY + 16);
      ctx.lineTo(ptrX - halfW, tensionBarY + 16 + h);
      ctx.lineTo(ptrX + halfW, tensionBarY + 16 + h);
      ctx.closePath();
      ctx.fill();
      // 内填充（高光三角）
      ctx.fillStyle = innerColor;
      ctx.beginPath();
      ctx.moveTo(ptrX, tensionBarY + 17);
      ctx.lineTo(ptrX - (halfW - 2), tensionBarY + 16 + h - 1);
      ctx.lineTo(ptrX + (halfW - 2), tensionBarY + 16 + h - 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 方案D：指针下方紧贴显示动作命令词（短词 + 黑底高对比）
      //   左红 → "❗ 按住" / 右红 → "❗ 松手" / 安全/警戒 → 不显示
      if (inRed) {
        const label = inLowRed ? '❗ 按住' : '❗ 松手';
        const labelColor = inLowRed ? '#FFD89B' : '#FFC4BD';
        // 文字描边色统一深棕，背景给个半透明黑底胶囊增强可读性
        const textY = tensionBarY + 16 + h + 14; // 紧贴三角下沿 14px
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // 黑底胶囊
        const padX = 12, padY = 6;
        ctx.font = 'bold 16px "TencentSansW7","PingFang SC","Microsoft YaHei",sans-serif';
        const textW = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(20, 14, 8, 0.88)';
        const bgX = ptrX - textW / 2 - padX;
        const bgY = textY - 10 - padY;
        const bgW = textW + padX * 2;
        const bgH = 20 + padY * 2;
        // 圆角矩形（兼容方式）
        const r = 8;
        ctx.beginPath();
        ctx.moveTo(bgX + r, bgY);
        ctx.lineTo(bgX + bgW - r, bgY);
        ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + r);
        ctx.lineTo(bgX + bgW, bgY + bgH - r);
        ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - r, bgY + bgH);
        ctx.lineTo(bgX + r, bgY + bgH);
        ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - r);
        ctx.lineTo(bgX, bgY + r);
        ctx.quadraticCurveTo(bgX, bgY, bgX + r, bgY);
        ctx.closePath();
        ctx.fill();
        // 描边
        ctx.strokeStyle = labelColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 文字
        this._drawPixelText(label, ptrX, textY, 16, labelColor, '#1A1A2E');
        ctx.restore();
      }
    }
    // hotfix-r：「鱼线拉力 41/100」数字已隐藏，玩家只看 ▲ 指针 vs 黄金区
    // hotfix-s（2026-06-03）：在拉力条下方加文字提示"请控制在安全区内"
    //   2026-06-05：在红区时此文字隐藏（让位给指针下方的动作命令词，避免视觉冲突）
    if (this.tension >= cfg.tensionLowThreshold && this.tension <= cfg.tensionHighThreshold) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      this._drawPixelText('请控制在安全区内', tensionBarX + tensionBarW / 2, tensionBarY + 38, 12, '#FFF4D6', '#5C3A1E');
    }
    // 收尾：方案A 红区震动 ctx.save 配套 restore
    if (_inRedZone) ctx.restore();
    ctx.textAlign = 'left';

    // PHASE 13-5：极限警告牌（tension ≥ 85，鱼线快断）—— 与条外闪烁外框配合，全屏红闪+木牌
    if (this.tension >= 85) {
      const flashAlpha = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.fillStyle = `rgba(244, 67, 54, ${flashAlpha * 0.3})`; ctx.fillRect(0, 0, cw, ch);
      // 极限警告：木牌 + 红底像素字
      const alertW = 460; const alertH = 88; const alertX = Math.floor((cw - alertW) / 2); const alertY = Math.floor((ch - alertH) / 2);
      // 黑色像素描边
      ctx.fillStyle = `rgba(26, 26, 46, ${flashAlpha})`;
      ctx.fillRect(alertX - 4, alertY - 4, alertW + 8, alertH + 8);
      // 红底
      ctx.fillStyle = `rgba(231, 111, 81, ${flashAlpha})`;
      ctx.fillRect(alertX, alertY, alertW, alertH);
      // 顶高光
      ctx.fillStyle = `rgba(255, 244, 214, ${flashAlpha * 0.5})`;
      ctx.fillRect(alertX, alertY, alertW, 3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      this._drawPixelText('⚠ 鱼 线 拉 力 极 限 ⚠', cw / 2, alertY + alertH / 2, 26, '#FFF4D6', '#1A1A2E');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.textAlign = 'left';
    // PHASE 13-4：屏幕底部操作提示（拉力 + QTE 双手协作）
    {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      // hotfix（2026-06-01l）：扩展为"按住[空格]或[鼠标左键]控制拉力在绿色范围"
      this._drawPixelText('按住 [空格] 或 [鼠标左键] 控制拉力在绿色范围', cw / 2, ch - 20, 14, '#FFF4D6', '#1A1A2E');
      ctx.textAlign = 'left';
    }
    this._renderHUD();

    // ════════════════════════════════════════════════════════════
    // hotfix-y5（2026-06-04）：战斗反馈最顶层
    //   光弹 / COMBO / -N 飘字 必须画在 _renderHUD（含拉力面板木牌、HUD 木牌等）之上
    //   否则光弹从拉力条 ▲ 指针射出时会被木牌底框遮挡
    // ════════════════════════════════════════════════════════════

    // 扣血光弹（从拉力条 ▲ 指针弧线飞向鱼，3 颗错峰）
    if (this._dmgProjectiles && this._dmgProjectiles.length > 0) {
      const now = performance.now();
      ctx.save();
      ctx.lineCap = 'round';
      for (const p of this._dmgProjectiles) {
        const elapsed = now - p.launchedAt - p.delay;
        if (elapsed < 0) continue;
        const t = Math.min(1, elapsed / p.flightMs);
        const ease = t * t * (3 - 2 * t);
        const x = p.sx + (p.tx - p.sx) * ease;
        const yLine = p.sy + (p.ty - p.sy) * ease;
        const arc = Math.sin(t * Math.PI) * 80;
        const y = yLine - arc;
        // 拖尾
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const tk = Math.max(0, t - k * 0.04);
          const eK = tk * tk * (3 - 2 * tk);
          const xk = p.sx + (p.tx - p.sx) * eK;
          const ykl = p.sy + (p.ty - p.sy) * eK;
          const ark = Math.sin(tk * Math.PI) * 80;
          if (k === 0) ctx.moveTo(xk, ykl - ark);
          else ctx.lineTo(xk, ykl - ark);
        }
        ctx.stroke();
        // 光弹本体（外圈光晕 + 主体 + 高光）
        const haloPulse = 0.3 + 0.3 * Math.sin(t * Math.PI * 4);
        ctx.globalAlpha = 0.35 + haloPulse;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x - p.size * 0.2, y - p.size * 0.2, p.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // -N 飘字
    if (this._damageTexts && this._damageTexts.length > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px "TencentSansW7","TencentSans","Microsoft YaHei",sans-serif';
      for (const dt of this._damageTexts) {
        const alpha = Math.max(0, dt.life / dt.maxLife);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText(dt.text, dt.x, dt.y);
        ctx.fillStyle = dt.color;
        ctx.fillText(dt.text, dt.x, dt.y);
      }
      ctx.restore();
    }

    // COMBO 文字（跟随鱼）
    if (this._comboText) {
      const ct = this._comboText;
      const alpha = Math.max(0, ct.life / ct.maxLife);
      const t = 1 - alpha;
      const cx = this.playingFishX || this.bobX || this.cw / 2;
      const cy = (this.playingFishY || this.bobY || this.ch / 2) - 50 - t * 20;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = Math.round(24 * ct.scale);
      ctx.font = `bold ${fontSize}px "TencentSansW7","TencentSans","Microsoft YaHei",sans-serif`;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 5;
      ctx.strokeText(ct.text, cx, cy);
      ctx.fillStyle = ct.color;
      ctx.fillText(ct.text, cx, cy);
      ctx.restore();
    }
  }

  _renderFish(x, y, color, size, struggling, fishFacingRight = true, species = null) {
    const ctx = this.ctx; const scale = size / 30;
    ctx.save(); ctx.translate(x, y);
    // fishFacingRight 为 true 时鱼头朝右（scaleX=1），为 false 时鱼头朝左（scaleX=-1）
    ctx.scale(fishFacingRight ? 1 : -1, 1);
    // 挣扎时鱼身摆动
    if (struggling) ctx.rotate(Math.sin(this.time * 20) * 0.2);

    // ── hotfix-u（2026-06-04）：优先使用 512×512 PNG 鱼图，未就绪兜底原几何 ──
    //   原图均"鱼头朝右"绘制，与本函数 fishFacingRight=true 时的方向一致。
    //   渲染尺寸：原几何鱼总长 ≈ 95 * scale（鱼尾尖到嘴尖 -55~+40），
    //   所以 PNG 宽度也按 95*scale 等比，高度同步，居中绘制。
    const sprite = species ? getFishSpriteBySpecies(species) : null;
    if (isFishSpriteReady(sprite)) {
      const fishW = 110 * scale;
      const fishH = fishW * (sprite.naturalHeight / sprite.naturalWidth);
      ctx.drawImage(sprite, -fishW / 2, -fishH / 2, fishW, fishH);
      ctx.restore();
      return;
    }

    // ── fallback：原程序几何（兼容未提供 species / 图未加载完 / 加载失败）──
    // 鱼身（椭圆形，朝右为正方向）
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 40 * scale, 20 * scale, 0, 0, Math.PI * 2); ctx.fill();
    // 鱼尾（在 -x 方向）
    ctx.beginPath(); ctx.moveTo(-30 * scale, 0); ctx.lineTo(-55 * scale, -15 * scale); ctx.lineTo(-55 * scale, 15 * scale); ctx.closePath(); ctx.fill();
    // 背鳍
    ctx.beginPath(); ctx.moveTo(0, -15 * scale); ctx.lineTo(-10 * scale, -30 * scale); ctx.lineTo(10 * scale, -20 * scale); ctx.closePath(); ctx.fill();
    // 眼睛（在 +x 方向，即鱼头朝向右时）
    ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(25 * scale, -5 * scale, 8 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(27 * scale, -5 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d00'; ctx.beginPath(); ctx.arc(40 * scale, 5 * scale, 5 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════
  // PHASE 13-2 像素 HUD 辅助函数
  //   _drawWoodPlaque  木牌底板（棕 + 深棕 2px 像素描边，无圆角）
  //   _drawPixelText   木牌文字（TencentSansW7 bold + 深棕 2px 描边 + 米白填充）
  //     PHASE 16-7 收尾：原 'Courier New' 等宽像素风与 TencentSans 全局字体不统一，
  //     用户验收意见统一改用 TencentSansW7。粗体 + 米白填充 + 深棕 miter 描边
  //     的视觉效果在木牌底板上仍然保留了像素 HUD 的厚重感。
  //   _drawPixelIcon   像素图标（coin / fish / target / rod）
  //   _drawPixelBob    像素浮漂（红白方块拼接）
  // ════════════════════════════════════════════════════════
  _drawWoodPlaque(x, y, w, h) {
    const ctx = this.ctx;
    // 深棕外描边（2px）
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    // 棕色主体
    ctx.fillStyle = '#8B6F47';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, Math.ceil(h) - 4);
    // 内侧浅色高光（顶 1px）
    ctx.fillStyle = '#A88860';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, 1);
    // 内侧深色阴影（底 1px）
    ctx.fillStyle = '#6B4A2A';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + Math.ceil(h) - 3, Math.ceil(w) - 4, 1);
  }
  _drawPixelText(text, x, y, size, fill, stroke) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif`;
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 2;
      ctx.strokeText(text, Math.floor(x), Math.floor(y));
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, Math.floor(x), Math.floor(y));
    ctx.textBaseline = 'alphabetic';
  }
  _drawPixelIcon(type, x, y, s) {
    // s = 单像素方块边长（默认 2）
    const ctx = this.ctx;
    s = s || 2;
    const px = (col, row, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x + col * s), Math.floor(y + row * s), w * s, h * s);
    };
    if (type === 'coin') {
      // 8x8 金币：外圈深棕，主体金黄，左上高光
      px(2, 0, 4, 1, '#5C3A1E'); px(1, 1, 1, 1, '#5C3A1E'); px(6, 1, 1, 1, '#5C3A1E');
      px(0, 2, 1, 4, '#5C3A1E'); px(7, 2, 1, 4, '#5C3A1E');
      px(1, 6, 1, 1, '#5C3A1E'); px(6, 6, 1, 1, '#5C3A1E'); px(2, 7, 4, 1, '#5C3A1E');
      px(2, 1, 4, 1, '#F4C430'); px(1, 2, 6, 4, '#F4C430'); px(2, 6, 4, 1, '#F4C430');
      px(2, 2, 1, 1, '#FFF4D6'); px(3, 2, 1, 1, '#FFF4D6'); px(2, 3, 1, 1, '#FFF4D6'); // 高光
      px(3, 3, 2, 2, '#E8B020'); // 中心 $ 暗色
    } else if (type === 'fish') {
      // 8x6 像素鱼（蓝色侧视）
      px(1, 1, 1, 1, '#1A1A2E'); px(2, 0, 4, 1, '#1A1A2E'); px(6, 1, 1, 1, '#1A1A2E');
      px(0, 2, 1, 2, '#1A1A2E'); px(7, 2, 1, 2, '#1A1A2E');
      px(1, 4, 1, 1, '#1A1A2E'); px(2, 5, 4, 1, '#1A1A2E'); px(6, 4, 1, 1, '#1A1A2E');
      px(2, 1, 4, 1, '#5A95B0'); px(1, 2, 6, 2, '#5A95B0'); px(2, 4, 4, 1, '#5A95B0');
      px(2, 2, 2, 1, '#8FBED0'); // 高光
      px(5, 2, 1, 1, '#FFFFFF'); px(5, 3, 1, 1, '#1A1A2E'); // 眼睛
      // 尾巴
      px(8, 1, 1, 1, '#1A1A2E'); px(9, 0, 1, 1, '#1A1A2E'); px(9, 2, 1, 1, '#1A1A2E');
      px(8, 2, 1, 2, '#5A95B0'); px(9, 1, 1, 1, '#5A95B0'); px(9, 3, 1, 1, '#5A95B0');
      px(8, 4, 1, 1, '#1A1A2E'); px(9, 4, 1, 1, '#1A1A2E'); px(9, 5, 1, 1, '#1A1A2E');
    } else if (type === 'target') {
      // 8x8 靶心：3 圈红白红
      px(2, 0, 4, 1, '#1A1A2E'); px(1, 1, 1, 1, '#1A1A2E'); px(6, 1, 1, 1, '#1A1A2E');
      px(0, 2, 1, 4, '#1A1A2E'); px(7, 2, 1, 4, '#1A1A2E');
      px(1, 6, 1, 1, '#1A1A2E'); px(6, 6, 1, 1, '#1A1A2E'); px(2, 7, 4, 1, '#1A1A2E');
      px(2, 1, 4, 1, '#E76F51'); px(1, 2, 6, 1, '#E76F51'); px(1, 5, 6, 1, '#E76F51'); px(2, 6, 4, 1, '#E76F51');
      px(2, 2, 4, 1, '#FFF4D6'); px(2, 5, 4, 1, '#FFF4D6');
      px(2, 3, 4, 2, '#E76F51');
      px(3, 3, 2, 2, '#1A1A2E'); // 中心黑点
    } else if (type === 'heart') {
      // ════════════════════════════════════════════════════════
      // PHASE 17 仗1 视觉补丁：8x8 像素心形（经典 RPG 风）
      //   - 红色基调 #E63946 / 高光 #FFFFFF / 描边 #1A1A2E（与 coin/fish 描边色一致，
      //     更贴合 fishing-scene 像素 HUD 整体而非纯黑）
      //   - 与 'coin'(8x8) 'fish'(8x6) 同尺寸级，s=2 时占 16x16 屏幕像素
      //   - 主美裁定的 #000000 描边在 #5C3A1E 木牌上对比过强，统一为现有 #1A1A2E
      // ════════════════════════════════════════════════════════
      // 描边（顶部凹陷的双瓣轮廓）
      px(1, 1, 2, 1, '#1A1A2E'); px(5, 1, 2, 1, '#1A1A2E');
      px(0, 2, 1, 2, '#1A1A2E'); px(3, 2, 2, 1, '#1A1A2E'); px(7, 2, 1, 2, '#1A1A2E');
      px(0, 4, 1, 1, '#1A1A2E'); px(7, 4, 1, 1, '#1A1A2E');
      px(1, 5, 1, 1, '#1A1A2E'); px(6, 5, 1, 1, '#1A1A2E');
      px(2, 6, 1, 1, '#1A1A2E'); px(5, 6, 1, 1, '#1A1A2E');
      px(3, 7, 2, 1, '#1A1A2E');
      // 红色主体
      px(1, 2, 2, 1, '#E63946'); px(5, 2, 2, 1, '#E63946');
      px(1, 3, 6, 1, '#E63946');
      px(1, 4, 6, 1, '#E63946');
      px(2, 5, 4, 1, '#E63946');
      px(3, 6, 2, 1, '#E63946');
      // 高光（左上小亮块）
      px(1, 2, 1, 1, '#FFFFFF'); px(2, 3, 1, 1, '#FFFFFF');
    } else if (type === 'rod') {
      // 12x8 像素钓竿（左下到右上的斜杆 + 鱼线 + 红浮漂）
      // 棕色竿身（斜对角）
      for (let i = 0; i < 8; i++) {
        px(i, 7 - i, 1, 1, '#5C3A1E');
        if (i < 7) px(i + 1, 7 - i, 1, 1, '#8B6F47');
      }
      // 握把
      px(0, 6, 1, 2, '#1A1A2E'); px(1, 7, 1, 1, '#1A1A2E');
      // 鱼线
      px(8, 0, 1, 1, '#AAA');
      px(9, 1, 1, 1, '#AAA'); px(10, 2, 1, 1, '#AAA');
      // 红浮漂
      px(10, 3, 2, 1, '#1A1A2E'); px(9, 4, 1, 1, '#1A1A2E'); px(12, 4, 1, 1, '#1A1A2E');
      px(10, 4, 2, 1, '#E76F51'); px(11, 4, 1, 1, '#FFF4D6');
      px(10, 5, 2, 1, '#1A1A2E');
    }
  }
  _drawPixelBob(cx, cy, clipBottom = false) {
    // hotfix（2026-06-01h）：电子发光锥形浮漂
    // hotfix（2026-06-01i）：宽度 +4px、整体更圆润
    // hotfix（2026-06-01j）：整体体积 ×0.8（缩小 20%）—— 用 ctx.scale 外层缩放
    //   栅格 11×24（cx,cy = 浮漂几何中心，水线 = cy）
    //   像素栅格 s=2，外层 scale=0.8 → 浮漂屏幕尺寸 17.6×38.4（约 18×38）
    //   row 0-11 = 上半部分（出水），row 12-23 = 下半部分（入水）
    //   clipBottom=true 时仅绘制 row 0-11（落水后）
    const ctx = this.ctx;
    const s = 2;
    const SCALE = 0.8;
    const W = 11;
    const H = 24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(SCALE, SCALE);
    // scale 之后内部坐标以浮漂中心为原点
    const x0 = -(W / 2) * s;
    const y0 = -(H / 2) * s;
    const px = (col, row, w, h, color) => {
      if (clipBottom && row >= H / 2) return;  // 水线下不画
      ctx.fillStyle = color;
      ctx.fillRect(x0 + col * s, y0 + row * s, w * s, h * s);
    };

    const OUT     = '#1A1A2E';
    const GLOW    = '#FFF8C8';
    const GLOW_HI = '#FFFFFF';
    const RED     = '#E63946';
    const RED_DK  = '#B11D2C';
    const YEL     = '#FFD43B';
    const YEL_DK  = '#D4A41A';
    const WHT     = '#FFF4D6';
    const WHT_DK  = '#C8B89A';

    // ── 发光头（row 0-1，圆润顶端） ─────────────
    px(5, 0, 1, 1, GLOW_HI);
    px(4, 1, 3, 1, GLOW);

    // ── 红锥头（row 2-5，圆润渐扩） ──────────────
    // row 2: 5 宽（窄锥头）
    px(3, 2, 1, 1, OUT); px(7, 2, 1, 1, OUT);
    px(4, 2, 1, 1, RED_DK); px(5, 2, 1, 1, RED); px(6, 2, 1, 1, RED_DK);
    // row 3: 7 宽
    px(2, 3, 1, 1, OUT); px(8, 3, 1, 1, OUT);
    px(3, 3, 1, 1, RED_DK); px(4, 3, 1, 1, RED); px(5, 3, 1, 1, RED); px(6, 3, 1, 1, RED); px(7, 3, 1, 1, RED_DK);
    // row 4: 9 宽（红锥最宽）
    px(1, 4, 1, 1, OUT); px(9, 4, 1, 1, OUT);
    px(2, 4, 1, 1, RED_DK); px(3, 4, 1, 1, RED); px(4, 4, 1, 1, RED); px(5, 4, 1, 1, RED); px(6, 4, 1, 1, RED); px(7, 4, 1, 1, RED); px(8, 4, 1, 1, RED_DK);
    // row 5: 9 宽（继续红）
    px(1, 5, 1, 1, OUT); px(9, 5, 1, 1, OUT);
    px(2, 5, 1, 1, RED); px(3, 5, 6, 1, RED); px(8, 5, 1, 1, RED_DK);

    // ── 黑色细环（row 6） ──────────────────────
    px(1, 6, 9, 1, OUT);

    // ── 黄环宽段（row 7-8，最宽 11） ─────────────
    px(0, 7, 1, 1, OUT); px(10, 7, 1, 1, OUT);
    px(1, 7, 1, 1, YEL_DK); px(2, 7, 7, 1, YEL); px(9, 7, 1, 1, YEL_DK);
    px(0, 8, 1, 1, OUT); px(10, 8, 1, 1, OUT);
    px(1, 8, 1, 1, YEL_DK); px(2, 8, 1, 1, YEL); px(3, 8, 5, 1, YEL); px(8, 8, 1, 1, YEL); px(9, 8, 1, 1, YEL_DK);

    // ── 黑色细环（row 9） ──────────────────────
    px(0, 9, 11, 1, OUT);

    // ── 白色身上半（row 10-11，露出水面） ────────
    // row 10: 9 宽
    px(1, 10, 1, 1, OUT); px(9, 10, 1, 1, OUT);
    px(2, 10, 1, 1, '#FFFFFF'); px(3, 10, 5, 1, WHT); px(8, 10, 1, 1, WHT_DK);
    // row 11: 9 宽（接水线）
    px(1, 11, 1, 1, OUT); px(9, 11, 1, 1, OUT);
    px(2, 11, 1, 1, WHT); px(3, 11, 5, 1, WHT); px(8, 11, 1, 1, WHT_DK);

    // ── 以下为下半部分（落水时被裁掉） ───────────
    // row 12-17: 9 宽继续白身
    for (let r = 12; r <= 17; r++) {
      px(1, r, 1, 1, OUT); px(9, r, 1, 1, OUT);
      px(2, r, 1, 1, WHT); px(3, r, 5, 1, WHT_DK); px(8, r, 1, 1, WHT_DK);
    }
    // row 18-19: 7 宽（向尾收）
    for (let r = 18; r <= 19; r++) {
      px(2, r, 1, 1, OUT); px(8, r, 1, 1, OUT);
      px(3, r, 5, 1, WHT_DK);
    }
    // row 20: 5 宽
    px(3, 20, 1, 1, OUT); px(7, 20, 1, 1, OUT);
    px(4, 20, 3, 1, WHT_DK);

    // ── 黑色尾杆（row 21-23） ──────────────────
    px(5, 21, 1, 1, OUT);
    px(5, 22, 1, 1, OUT);
    px(5, 23, 1, 1, OUT);

    ctx.restore();
  }

  /**
   * 浮漂落水后的持续涟漪（3 层错峰扩散）
   * @param {number} cx 浮漂水线中心 X
   * @param {number} cy 浮漂水线中心 Y（即水面 y）
   */
  _drawBobRipples(cx, cy) {
    // hotfix（2026-06-01i）：参考 dusk-effects.drawFishingRipple，但去掉鱼影且调整半径以匹配新浮漂宽度
    const ctx = this.ctx;
    const time = (this.time || 0) * 1000;
    const animPhase = (time % 1400) / 1400;  // 1.4s 一周期
    ctx.save();
    for (let layer = 0; layer < 3; layer++) {
      const offset = (animPhase + layer / 3) % 1;
      // hotfix（2026-06-01j）：浮漂缩 0.8，涟漪范围同步缩 → 11 → 37
      const r = 11 + offset * 26;
      const a = (1 - offset) * 0.5;          // 透明度从 0.5 → 0
      ctx.strokeStyle = `rgba(192, 229, 240, ${a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      // 椭圆涟漪（俯视近圆，接近水面方向稍扁）
      ctx.ellipse(cx, cy, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 像素风"鼠标左键被点击"小图标
   * - 鼠标外轮廓：圆角矩形（深色描边 + 浅色内填）
   * - 中线分隔左右键
   * - 左键上半高亮（被点击）+ 黄色"咔哒"小光斑
   * @param {number} x 左上角 X
   * @param {number} y 左上角 Y
   * @param {number} w 宽（推荐 16）
   * @param {number} h 高（推荐 20）
   */
  _drawMouseLeftIcon(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();

    // 主体外轮廓（圆角矩形 — 用 roundRect 兼容性已 OK）
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();

    // 内层（米白）
    ctx.fillStyle = '#FFE9B0';
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 3);
    ctx.fill();

    // 中线（左右键分隔）
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(x + w / 2 - 0.5, y + 2, 1, h * 0.4);

    // 左键被点击高亮（左半上部，霓虹绿）
    ctx.fillStyle = '#5DBB63';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2);
    ctx.lineTo(x + w / 2 - 1, y + 2);
    ctx.lineTo(x + w / 2 - 1, y + h * 0.42);
    ctx.lineTo(x + 2, y + h * 0.42);
    ctx.closePath();
    ctx.fill();

    // 顶部连接线（从鼠标顶端伸出 2px 小杆）
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(x + w / 2 - 0.5, y - 2, 1, 2);

    // 点击波纹（顶部小光斑，提示"按下"）
    ctx.fillStyle = '#FFE066';
    ctx.fillRect(x + w / 2 - 4, y - 5, 1, 1);
    ctx.fillRect(x + w / 2 + 3, y - 5, 1, 1);
    ctx.fillRect(x + w / 2 - 1, y - 7, 2, 1);

    ctx.restore();
  }

  _renderHUD() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    // —— 金币木牌 ——
    const coinX = Math.floor(cw * 0.008);
    const coinY = Math.floor(ch * 0.014);
    const coinW = Math.floor(cw * 0.117);
    const coinH = Math.floor(ch * 0.056);
    this._drawWoodPlaque(coinX, coinY, coinW, coinH);
    this._drawPixelIcon('coin', coinX + 10, coinY + (coinH - 16) / 2, 2);
    this._drawPixelText(`${this.money}`, coinX + 36, coinY + coinH / 2, 24, '#FFF4D6', '#5C3A1E');
    // —— 鱼数木牌 ——
    const fishX = Math.floor(cw * 0.133);
    const fishY = coinY;
    const fishW = Math.floor(cw * 0.094);
    const fishH = coinH;
    this._drawWoodPlaque(fishX, fishY, fishW, fishH);
    this._drawPixelIcon('fish', fishX + 8, fishY + (fishH - 12) / 2, 2);
    this._drawPixelText(`${this.fishCount}`, fishX + 38, fishY + fishH / 2, 24, '#FFF4D6', '#5C3A1E');

    // ════════════════════════════════════════════════════════
    // PHASE 17 仗1 视觉补丁：体力木牌（💰 → 🐟 → ❤️ 第 3 位）
    //   - 风格：与金币/鱼数完全一致的 _drawWoodPlaque + _drawPixelIcon('heart') + _drawPixelText
    //   - 数据：每帧从 window.StaminaSystem 拉值（无副作用 getter）
    //   - 文字三态（PRD v2.0）：
    //       ratio >= 20%  → 米白 #FFF4D6（与金币一致）
    //       ratio <  20%  → 暖橙 #FFA500 + 透明度 0.5↔1.0 闪烁（200ms 周期，正弦平滑）
    //       cur === 0     → 灰阶（saturate(0)）+ 整体 opacity 0.4
    //   - 整块用 ctx.save/restore 包裹，filter/globalAlpha 不污染外部渲染
    // ════════════════════════════════════════════════════════
    if (window.StaminaSystem) {
      const cur = window.StaminaSystem.getCurrent();
      const max = window.StaminaSystem.getMax();
      const ratio = max > 0 ? cur / max : 0;
      const stamX = Math.floor(cw * 0.236); // 鱼数右沿 + 间距（与金币-鱼数节奏一致）
      const stamY = coinY;
      const stamW = Math.floor(cw * 0.117);
      const stamH = coinH;

      ctx.save();
      // 三态滤镜
      let textFill = '#FFF4D6';
      if (cur === 0) {
        ctx.filter = 'saturate(0)';
        ctx.globalAlpha = 0.4;
      } else if (ratio < 0.2) {
        // 200ms 周期透明度闪烁 0.5↔1.0（正弦，避免硬切）
        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 200;
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * Math.PI * 2);
        textFill = '#FFA500';
      }

      this._drawWoodPlaque(stamX, stamY, stamW, stamH);
      // 心形 8x8 @ s=2 → 16x16 屏幕像素，与金币 icon 同尺寸 + 同左内边距 10px
      this._drawPixelIcon('heart', stamX + 10, stamY + (stamH - 16) / 2, 2);
      this._drawPixelText(`${cur}/${max}`, stamX + 36, stamY + stamH / 2, 22, textFill, '#5C3A1E');
      ctx.restore();
    }

    // —— 装备钓竿木牌（左下角）——
    if (window.equipment) {
      const rod = window.equipment.getEquippedRod();
      const rx = 20, ry = 660, rw = 280, rh = 40;
      this._drawWoodPlaque(rx, ry, rw, rh);
      this._drawPixelIcon('rod', rx + 10, ry + (rh - 16) / 2, 2);
      this._drawPixelText(`${rod.name}`, rx + 44, ry + rh / 2, 18, '#FFF4D6', '#5C3A1E');
    }

    // PHASE 18 仗7：回村按钮（右下角；Waiting/BiteWindow/Reeling 等水下交互期隐藏）
    //   命中盒来自 _bindEvents 阶段写入的 _returnVillageBtnRect = {1096,656,160,40}
    //   可见性 = _isReturnVillageBtnVisible()（同时门禁渲染/点击/hover，避免"隐身按钮"误触）
    //   hover 时金色描边强化（与面板交互标准 v1.0 一致）
    if (this._returnVillageBtnRect && this._isReturnVillageBtnVisible()) {
      const { x, y, w, h } = this._returnVillageBtnRect;
      const hovered = this._returnVillageBtnHovered;
      this._drawWoodPlaque(x, y, w, h);
      if (hovered) {
        ctx.save();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.floor(x) + 1, Math.floor(y) + 1, Math.ceil(w) - 2, Math.ceil(h) - 2);
        ctx.restore();
      }
      // 🏘️ emoji
      ctx.save();
      ctx.font = '20px "TencentSansW7", "PingFang SC", "Microsoft YaHei", "Heiti SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('🏘️', Math.floor(x + 10), Math.floor(y + h / 2));
      // "回村 (R/ESC)" 提示文字
      this._drawPixelText('回村 (R/ESC)', x + 44, y + h / 2, 18, hovered ? '#FFE9A0' : '#FFF4D6', '#5C3A1E');
      ctx.restore();
    }
  }

  _renderAimBar() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    // 20 个像素方格，每格相对屏幕约 22~24px 宽，整体宽度 ~ 450px
    const cellCount = 20;
    const cellW = 22; const cellH = 28;
    const barW = cellCount * cellW;
    const x = Math.floor((cw - barW) / 2);
    const y = Math.floor(ch - 90);
    // 深棕边框（外 3px）
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(x - 3, y - 3, barW + 6, cellH + 6);
    // 内侧木牌底色（兜底，避免方格间缝隙泛黑）
    ctx.fillStyle = '#2A1810';
    ctx.fillRect(x, y, barW, cellH);
    // 像素方格：灰/绿/黄/红，相邻格交替深浅
    for (let i = 0; i < cellCount; i++) {
      const pct = (i + 0.5) / cellCount * 100; // 当前格中心百分比
      let cMain, cDark;
      if (pct < 33)      { cMain = '#6B7280'; cDark = '#4A5360'; }
      else if (pct < 66) { cMain = '#5DBB63'; cDark = '#4A9F50'; }
      else if (pct < 95) { cMain = '#F4C430'; cDark = '#E0AE20'; }
      else               { cMain = '#E76F51'; cDark = '#C75543'; }
      // 交替深浅
      ctx.fillStyle = (i & 1) ? cDark : cMain;
      ctx.fillRect(x + i * cellW + 1, y + 1, cellW - 2, cellH - 2);
      // 顶 1px 高光
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + i * cellW + 1, y + 1, cellW - 2, 2);
      // 底 1px 暗影
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + i * cellW + 1, y + cellH - 3, cellW - 2, 2);
    }
    // 像素三角指针（8x8 方块阶梯三角，顶部白色 + 深色描边）
    const pointerX = Math.floor(x + (this.aimPower / 100) * barW);
    const pyBase = y - 4;
    const s = 2; // 像素方块边
    // 黑色描边层（先画大一圈）
    ctx.fillStyle = '#1A1A2E';
    for (let row = 0; row < 5; row++) {
      const halfW = (5 - row);
      ctx.fillRect(pointerX - halfW * s - s, pyBase - row * s - s, (halfW * 2 + 1) * s + s * 2, s);
    }
    // 白色填充层
    ctx.fillStyle = '#FFF4D6';
    for (let row = 0; row < 5; row++) {
      const halfW = (5 - row) - 1;
      if (halfW < 0) continue;
      ctx.fillRect(pointerX - halfW * s, pyBase - row * s - s, (halfW * 2 + 1) * s, s);
    }
    // 像素文字：弱力/中力/强力/过力
    const label = this.aimPower < 33 ? '弱 力' : this.aimPower < 66 ? '中 力' : this.aimPower < 95 ? '强 力' : '过 力 !';
    ctx.textAlign = 'center';
    this._drawPixelText(label, cw / 2, y + cellH + 22, 22, '#FFF4D6', '#5C3A1E');
    ctx.textAlign = 'left';
  }

  // PHASE 21-1 D5：v2.0 _renderBiteAlert（全屏红闪 + 180px 大叹号 + 提示语）已彻底移除
  //   BiteWindow 期间的视觉反馈完全交给 D5 系统（抖动 + PERFECT/可惜 字）

  _renderQTE() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const cx = cw / 2; const cy = ch / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, cw, ch);
    const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 144px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(arrows[this.qteDirection] || '?', cx, cy - 45);
    const radius = 90; const progress = this.qteTimer / this.qteMaxTime;
    ctx.strokeStyle = progress > 0.3 ? '#4CAF50' : '#F44336'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy - 45, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
    ctx.fillStyle = '#FFF'; ctx.font = "36px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.fillText(Math.ceil(this.qteTimer * 10) / 10 + 's', cx, cy + 90); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (this.qteResult) { ctx.fillStyle = this.qteResultColor; ctx.font = "bold 54px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.textAlign = 'center'; ctx.fillText(this.qteResult, cw / 2, ch / 2 + 150); ctx.textAlign = 'left'; }
  }

  _renderCaught() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const fish = this.caughtFish || this.currentFish;
    // 2026-06-02：删除自画的橙色天空 + 蓝色假水面 + 假白色波纹背景，
    //   让真实钓鱼场景（水下/水面/玩家/竿/HUD）作为结算界面的底图，与游戏场景一致
    // 半透明深色蒙版：略压暗背景，突出中央提示框 + 鱼，不再切换"另一个场景"
    ctx.fillStyle = 'rgba(0, 18, 32, 0.45)'; ctx.fillRect(0, 0, cw, ch);

    const t = Math.min(1, (this.caughtTimer - CONFIG.caught.animationDuration) / 1.0);
    // 程序化鱼：从屏幕下方游入中央，缩放 0.5 → 0.85（比原 1.0 略小，避免抢提示框）
    //   原："鱼在屏幕上半 ch*0.35 → ch*0.20" → 改成"鱼在提示框上方 ch*0.30"
    const fishY = ch * 0.30 - t * ch * 0.05; const fishScale = (0.5 + t * 0.35) * 0.85;
    ctx.save(); ctx.translate(cw / 2, fishY); ctx.scale(fishScale, fishScale);
    // hotfix-v（2026-06-04）：钓到了弹窗优先用 PNG 鱼图（与水下战斗/图鉴/鱼篓口径统一）
    //   原程序几何鱼总长 = 165*2 = 330px、高 = 90*2 = 180px → PNG 按等宽 330 绘制
    const caughtSprite = getFishSpriteBySpecies(fish.name);
    if (isFishSpriteReady(caughtSprite)) {
      const drawW = 330;
      const drawH = drawW * (caughtSprite.naturalHeight / caughtSprite.naturalWidth);
      ctx.drawImage(caughtSprite, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      // fallback：原程序几何（不阻塞，等图加载完下次弹窗就用图）
      ctx.fillStyle = fish.color; ctx.beginPath(); ctx.ellipse(0, 0, 120, 60, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-105, 0); ctx.lineTo(-165, -45); ctx.lineTo(-165, 45); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -45); ctx.lineTo(-30, -90); ctx.lineTo(45, -60); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(75, -15, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(79, -15, 10, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // 提示框放到屏幕正中央
    const boxW = 450; const boxH = 210; const boxX = (cw - boxW) / 2; const boxY = (ch - boxH) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4; ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 42px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.textAlign = 'center'; ctx.fillText('🎉 钓到了!', cw / 2, boxY + 45);
    ctx.fillStyle = '#FFF'; ctx.font = "36px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.fillText(fish.name, cw / 2, boxY + 90);
    ctx.fillStyle = '#4FC3F7'; ctx.font = "28px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.fillText('★'.repeat(fish.rarity), cw / 2, boxY + 125);
    ctx.fillStyle = '#AAA'; ctx.font = "24px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.fillText(`尺寸: ${this.caughtFishSize}cm  价格: $${fish.price}`, cw / 2, boxY + 165);
    // 按空格键 / 鼠标左键 再次抛竿提示（hotfix 2026-06-01b）
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 26px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.fillText('按 [空格] 或 [鼠标左键] 再次抛竿', cw / 2, boxY + 195); ctx.textAlign = 'left';
  }

  _renderFailed() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    const reason = this.failedReason || 'escape';
    // 根据失败原因获取消息列表
    const messages = FAILED_MESSAGES[reason] || ['哎呀...跑掉了!'];
    if (!this.failedMessages || this.failedMessages !== messages) {
      this.failedMessages = messages;
      this.failedMessageIndex = 0;
      this.failedMessageTimer = 0;
    }
    const msg = this.failedMessages[this.failedMessageIndex];
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, cw, ch);
    
    // 失败面板
    const panelW = 500; const panelH = 280; const panelX = (cw - panelW) / 2; const panelY = (ch - panelH) / 2;
    ctx.fillStyle = '#8B0000'; ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 16); ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4; ctx.stroke();
    
    // 标题
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 48px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🐟 跑鱼了!', cw / 2, panelY + 60);
    
    // 原因消息（翻页显示）
    ctx.fillStyle = '#FFF'; ctx.font = "32px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif";
    ctx.fillText(msg, cw / 2, panelY + 130);
    
    // 确认提示：[空格]或[鼠标左键] 整段高亮（hotfix 2026-06-01b）
    ctx.font = "bold 28px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif";
    const confirmLeft = '请按 '; const confirmKey = '[空格]或[鼠标左键]'; const confirmRight = ' 确认';
    const clW = ctx.measureText(confirmLeft).width;
    const ckW = ctx.measureText(confirmKey).width;
    const crW = ctx.measureText(confirmRight).width;
    const cStartX = cw / 2 - (clW + ckW + crW) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFD700'; ctx.fillText(confirmLeft, cStartX, panelY + 220);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(confirmKey, cStartX + clW, panelY + 220);
    ctx.fillStyle = '#00FF88'; ctx.fillText(confirmKey, cStartX + clW, panelY + 220);
    ctx.fillStyle = '#FFD700'; ctx.fillText(confirmRight, cStartX + clW + ckW, panelY + 220);
    ctx.fillStyle = '#AAA'; ctx.font = "20px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif";
    ctx.fillText('确认后重新抛竿', cw / 2, panelY + 255);
    
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _renderIdleHint() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    // 屏幕正中间的提示框
    //   2026-06-05：第二行加入完整钓鱼操作提示（按 [空格] / [左键] 刺鱼），文字更长 → 加宽到 540
    const hintW = 540; const hintH = 130; const hintX = (cw - hintW) / 2; const hintY = (ch - hintH) / 2 - 60;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.roundRect(hintX, hintY, hintW, hintH, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
    // 第一行（金色）：抛竿引导
    const baseY = hintY + hintH / 2 - 18;
    ctx.font = "bold 26px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('移动鼠标到鱼群，长按蓄力抛投', cw / 2, baseY);
    // 第二行（红色）：刺鱼提示
    ctx.fillStyle = '#FF6B5C'; ctx.font = "bold 22px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif";
    ctx.fillText('黑漂时按 [空格] 或 [左键] 刺鱼', cw / 2, hintY + hintH / 2 + 28);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _renderTaskProgress() {
    if (!this.questParams || !this.questParams.target) return;
    const ctx = this.ctx; const cw = this.cw;
    const isQ002 = this.questParams.questId === 'q002';
    // PHASE 18 仗6 - 仗2 → 仗8 修订：任务HUD 回到右上角（与金币/鱼数/体力同一水平线）
    //   仗6 -仗2 曾下移到 y=140，原因是回村按钮占据右上 [1100,10]~[1260,50] + baitHUD 顶部带状区。
    //   仗7 已把回村按钮挪到右下角 [1096,656]~[1256,696] → 右上空出。
    //   现回归紧凑布局：
    //     x = cw - 200 - 16 = 1064（距右边 16px）
    //     y = 10（与金币 [10,159] / 鱼数 [170,290] / 体力 [302,451] 同顶边对齐）
    //   水平不重叠：左侧顶栏 x ≤ 451 << 1064；baitHUD 居中 [509,771] << 1064。
    //   纵向：q001 高 60 → y∈[10,70]；q002 5项最高 ~185 → y∈[10,195]，仍距 baitHUD 底 130 不冲突。
    //   下沿距右下角"奇力鱼信息面板"(Playing 时 y=545~700) 仍隔 350px+ 安全。
    const x = cw - 200 - 16; const y = 10; const w = 200;
    // 根据 q002 项目数动态计算高度
    let itemCount = 0;
    if (isQ002 && this.questParams.detail) {
      itemCount = this.questParams.detail.split(/\s+/).filter(Boolean).length;
    }
    const h = isQ002 ? (55 + itemCount * 26) : 60;
    // 木牌底板（无圆角）
    this._drawWoodPlaque(x, y, w, h);
    // 像素靶心图标
    this._drawPixelIcon('target', x + 10, y + 14, 2);
    // 像素字标题
    this._drawPixelText(
      `${this.questParams.target} ${this.questParams.progress || 0}/${this.questParams.need}`,
      x + 34, y + 22, 18, '#FFF4D6', '#5C3A1E'
    );
    // q002 显示详细鱼种进度（每行一个，竖向排列，米白小字）
    if (isQ002 && this.questParams.detail) {
      const items = this.questParams.detail.split(/\s+/).filter(Boolean);
      const lineH = 26;
      const startY = y + 55;
      for (let i = 0; i < items.length; i++) {
        this._drawPixelText(items[i], x + 16, startY + i * lineH, 13, '#FFE9B0', '#5C3A1E');
      }
    }
  }

  // ============================================================
  // 水下场景优化
  // ============================================================

  _renderWaterBottom() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    // 纯水下视角：底部占屏幕底部 8%
    const bottomHeight = ch * 0.08;
    const bottomY = ch - bottomHeight;
    const grad = ctx.createLinearGradient(0, bottomY, 0, ch);
    grad.addColorStop(0, '#1E3D2B');
    grad.addColorStop(0.4, '#153020');
    grad.addColorStop(1, '#0A1F14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, bottomY, cw, bottomHeight);
    // 底部沙石质感
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < cw; x += 20) {
      ctx.beginPath(); ctx.ellipse(x + Math.sin(x * 0.5) * 4, bottomY + 3 + Math.sin(x * 0.2) * 2, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 过渡带
    const transGrad = ctx.createLinearGradient(0, bottomY - 18, 0, bottomY + 3);
    transGrad.addColorStop(0, 'rgba(30,61,43,0)');
    transGrad.addColorStop(1, 'rgba(30,61,43,0.45)');
    ctx.fillStyle = transGrad;
    ctx.fillRect(0, bottomY - 18, cw, 21);
  }

  _renderWaterWeeds() {
    // PHASE 13-3：从矢量曲线 → 4~8px 像素列阶梯状
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    const bottomY = ch * 0.92;
    const weedPositions = [cw * 0.04, cw * 0.10, cw * 0.16, cw * 0.22, cw * 0.30, cw * 0.36, cw * 0.42, cw * 0.50, cw * 0.56, cw * 0.62, cw * 0.68, cw * 0.74, cw * 0.80, cw * 0.86, cw * 0.92];
    const heights = [110, 160, 100, 140, 90, 130, 110, 150, 100, 140, 90, 130, 110, 140, 100];
    // 任务要求：#3A6B45 深绿 + #5DBB63 亮绿 2 色像素拼接
    const colMain = '#3A6B45';
    const colLight = '#5DBB63';
    const colShadow = '#264A30';
    const colW = 6;   // 单像素列宽 6px
    const stepH = 5;  // 阶梯每段高度 5px（产生明显锯齿感）
    for (let i = 0; i < weedPositions.length; i++) {
      const wx = Math.floor(weedPositions[i]);
      const wh = heights[i];
      // 整株摇摆相位
      const swayPhase = this.time * 1.2 + i * 0.8;
      // 每株 3 列：左 / 中 / 右
      for (let blade = -1; blade <= 1; blade++) {
        const segCount = Math.ceil(wh / stepH);
        for (let seg = 0; seg < segCount; seg++) {
          const yTop = bottomY - (seg + 1) * stepH;
          // 顶部摇摆幅度大，根部不动
          const swayWeight = (seg / segCount) * (seg / segCount); // 平方曲线
          const sway = Math.sin(swayPhase + blade * 0.5) * 9 * swayWeight;
          const xCenter = wx + blade * 7 + Math.floor(sway);
          // 阶梯按 colW 对齐（向下取整到偶数列）→ 像素列错位感
          const colX = Math.floor(xCenter / 2) * 2 - colW / 2;
          // 2 色交替（亮/深）+ 顶端偶尔加亮绿叶尖
          const isTip = (seg === segCount - 1);
          const isLight = (seg + i + blade) % 2 === 0;
          ctx.fillStyle = isTip ? colLight : (isLight ? colMain : colShadow);
          ctx.fillRect(colX, yTop, colW, stepH);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════
  // PHASE 13-3 水下场景像素化辅助
  //   _drawPixelLine     深灰像素硬边直线（Bresenham 风格）
  //   _drawPixelHPBar    像素方格血条
  //   _drawPixelTensionBar 像素方格张力条（绿/橙/红三档）
  //   _getUnderwaterDither 缓存的 4x4 Bayer dither 颗粒图层
  //   _getFishingLineColor 鱼线颜色按拉力 4 段映射 + ≥90 红白闪烁（PHASE 13-3b）
  // ════════════════════════════════════════════════════════
  /**
   * PHASE 13-5：鱼线颜色 —— 与拉力条共用 getTensionColor（正向语义，唯一色源）
   * - tension ≤ 40 → 红（危险，鱼快脱钩）
   * - tension ≤ 70 → 黄（警戒）
   * - tension > 70 → 绿（安全）
   * - tension ≥ 95 → 红白闪烁（断线极限警告，等价于旧版闪烁逻辑）
   */
  _getFishingLineColor(tension) {
    const base = getTensionColor(tension).main;
    if (tension >= 95) {
      return ((Date.now() / 250) | 0) % 2 === 0 ? base : '#FFEBEB';
    }
    return base;
  }
  /**
   * PHASE 13-3f：抗锯齿单段二次贝塞尔鱼线（悬链线感 · 圆头 · 鱼端偏置 0.75）
   * hotfix-v（2026-06-04）：bias 从 0.75 改为 0.5（对称悬链线）
   *   原 0.75 让最低点偏鱼端，导致鱼端附近曲率突变（"接近鱼时鱼线急转弯"）。
   *   改 0.5 后弧度在起终点之间均匀分布，符合物理悬链线，玩家视觉更自然。
   *   sag 同步降低（curveFactor *= 0.6），避免对称后整体看着太"沉"。
   * - 起点/终点完全不变
   * - 弧度总量 sag = 线长 × curveFactor（拉力联动表沿用）
   * - bias = 0.5：曲线最低点在起终点中间（对称悬链线）
   * - 控制点经验公式：control = 2·midPoint - (start+end)/2，其中 midPoint = 起终点直线 50% 处再下移 sag
   * - lineCap='round' 圆头；imageSmoothingEnabled 用 save/restore 局部开启，画完恢复像素风
   */
  _drawSmoothFishingLine(x0, y0, x1, y1, color, w) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    // 拉力系数（PHASE 13-3d 表，hotfix-v 同步降权 *0.6 让对称弧度不至于太"沉"）
    const t = this.tension;
    let curveFactor;
    if (t < 30)      curveFactor = 0.048;  // 旧 0.08
    else if (t < 60) curveFactor = 0.030;  // 旧 0.05
    else if (t < 85) curveFactor = 0.018;  // 旧 0.03
    else             curveFactor = 0.009;  // 旧 0.015
    const sag = len * curveFactor;
    // hotfix-v：偏置改 0.5，对称悬链线（最低点在中间），避免鱼端急转弯
    const bias = 0.5;
    const midX = x0 + bias * dx;
    const midY = y0 + bias * dy + sag;
    // 控制点反推（二次贝塞尔 t=0.5 处恰好是 midPoint，对称情况下简化为）
    // control = 2·mid - (start+end)/2
    const ctrlX = 2 * midX - (x0 + x1) / 2;
    const ctrlY = 2 * midY - (y0 + y1) / 2;
    // 局部开启抗锯齿 + 圆头，画完 restore 不影响像素风渲染
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(ctrlX, ctrlY, x1, y1);
    ctx.stroke();
    ctx.restore();
  }
  _drawPixelLine(x0, y0, x1, y1, color, w) {
    // Bresenham 整数直线（每像素绘制 w×w 方块），imageSmoothingEnabled 已关闭
    const ctx = this.ctx;
    ctx.fillStyle = color;
    let xi = Math.round(x0), yi = Math.round(y0);
    const x2 = Math.round(x1), y2 = Math.round(y1);
    const dx = Math.abs(x2 - xi), dy = Math.abs(y2 - yi);
    const sx = xi < x2 ? 1 : -1, sy = yi < y2 ? 1 : -1;
    let err = dx - dy;
    // 限制迭代上限（避免 stale state 导致死循环）
    const maxStep = dx + dy + 4;
    let step = 0;
    while (step++ < maxStep) {
      ctx.fillRect(xi - Math.floor(w / 2), yi - Math.floor(w / 2), w, w);
      if (xi === x2 && yi === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; xi += sx; }
      if (e2 < dx)  { err += dx; yi += sy; }
    }
  }
  _drawPixelHPBar(x, y, w, h, ratio, cellW) {
    // 像素方格血条：满血 #E76F51 / #C75543 交替；底色 #2A2A2E
    const ctx = this.ctx;
    cellW = cellW || 4;
    ratio = Math.max(0, Math.min(1, ratio));
    // 外描边 1px
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(Math.floor(x) - 1, Math.floor(y) - 1, Math.ceil(w) + 2, Math.ceil(h) + 2);
    // 底色（空槽）
    ctx.fillStyle = '#2A2A2E';
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    // 填充像素方格
    const filledW = w * ratio;
    const cellCount = Math.ceil(filledW / cellW);
    for (let i = 0; i < cellCount; i++) {
      const cx = Math.floor(x) + i * cellW;
      const cellRealW = Math.min(cellW - 1, Math.floor(x + filledW) - cx); // -1 留 1px 像素缝
      if (cellRealW <= 0) continue;
      ctx.fillStyle = (i & 1) ? '#C75543' : '#E76F51';
      ctx.fillRect(cx, Math.floor(y), cellRealW, Math.ceil(h));
      // 顶 1px 高光
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(cx, Math.floor(y), cellRealW, 1);
    }
  }
  _drawPixelTensionBar(x, y, w, h, ratio, palette, cellW) {
    // PHASE 13-3g：张力条直接接收颜色对象 { main, dark }（统一来自 getTensionColor）
    const ctx = this.ctx;
    cellW = cellW || 6;
    ratio = Math.max(0, Math.min(1, ratio));
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(Math.floor(x) - 1, Math.floor(y) - 1, Math.ceil(w) + 2, Math.ceil(h) + 2);
    ctx.fillStyle = '#2A2A2E';
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    const filledW = w * ratio;
    const cellCount = Math.ceil(filledW / cellW);
    for (let i = 0; i < cellCount; i++) {
      const cx = Math.floor(x) + i * cellW;
      const cellRealW = Math.min(cellW - 1, Math.floor(x + filledW) - cx);
      if (cellRealW <= 0) continue;
      ctx.fillStyle = (i & 1) ? palette.dark : palette.main;
      ctx.fillRect(cx, Math.floor(y), cellRealW, Math.ceil(h));
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(cx, Math.floor(y), cellRealW, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(cx, Math.floor(y) + Math.ceil(h) - 1, cellRealW, 1);
    }
  }
  /** 缓存 4x4 Bayer dither 颗粒到 offscreen，水下场景叠加用（只生成一次） */
  _getUnderwaterDither() {
    if (this._underwaterDither && this._underwaterDither.w === this.cw && this._underwaterDither.h === this.ch) {
      return this._underwaterDither.canvas;
    }
    const off = document.createElement('canvas');
    off.width = this.cw; off.height = this.ch;
    const octx = off.getContext('2d');
    const img = octx.createImageData(this.cw, this.ch);
    // 4x4 Bayer 矩阵
    const bayer = [
      [ 0,  8,  2, 10],
      [12,  4, 14,  6],
      [ 3, 11,  1,  9],
      [15,  7, 13,  5]
    ];
    for (let y = 0; y < this.ch; y++) {
      for (let x = 0; x < this.cw; x++) {
        const b = bayer[y & 3][x & 3]; // 0~15
        // 居中映射：8 = 中灰透明；<8 偏暗，>8 偏亮
        const d = b - 7; // -7..+8
        const idx = (y * this.cw + x) * 4;
        if (d < 0) {
          img.data[idx] = 0; img.data[idx + 1] = 0; img.data[idx + 2] = 0;
          img.data[idx + 3] = Math.min(255, -d * 5); // 0..35 alpha
        } else if (d > 0) {
          img.data[idx] = 255; img.data[idx + 1] = 255; img.data[idx + 2] = 255;
          img.data[idx + 3] = Math.min(255, d * 3); // 0..24 alpha（亮颗粒比暗弱）
        } else {
          img.data[idx + 3] = 0;
        }
      }
    }
    octx.putImageData(img, 0, 0);
    this._underwaterDither = { canvas: off, w: this.cw, h: this.ch };
    return off;
  }

  _initSmallFish() {
    const ch = this.ch; const cw = this.cw;
    // 纯水下视角：小鱼在整个屏幕范围内游动
    this.smallFish = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      this.smallFish.push({
        x: Math.random() * cw,
        y: ch * 0.15 + Math.random() * (ch * 0.7),
        vx: (Math.random() * 1.5 + 0.5) * (Math.random() < 0.5 ? 1 : -1),
        vy: 0,
        size: 8 + Math.random() * 6,
        color: ['#90CAF9', '#80DEEA', '#B2DFDB', '#C5E1A5', '#F0F4C3'][Math.floor(Math.random() * 5)],
        phase: Math.random() * Math.PI * 2,
        turnTimer: Math.random() * 3
      });
    }
  }

  _updateSmallFish(dt) {
    const cw = this.cw; const ch = this.ch;
    // 纯水下视角：小鱼在整个屏幕范围内游动
    const topBound = ch * 0.1;
    const bottomBound = ch * 0.85;
    for (const f of this.smallFish) {
      f.turnTimer -= dt;
      if (f.turnTimer <= 0) {
        f.vy += (Math.random() - 0.5) * 0.8;
        f.vy = Math.max(-0.6, Math.min(0.6, f.vy));
        f.turnTimer = 1.5 + Math.random() * 2.5;
      }
      const wave = Math.sin(this.time * 3 + f.phase) * 0.25;
      f.x += (f.vx + wave) * 60 * dt;
      f.y += f.vy * 30 * dt;
      if (f.x < -20) { f.x = -20; f.vx = Math.abs(f.vx); }
      if (f.x > cw + 20) { f.x = cw + 20; f.vx = -Math.abs(f.vx); }
      if (f.y < topBound) { f.y = topBound; f.vy = Math.abs(f.vy) * 0.5; }
      if (f.y > bottomBound) { f.y = bottomBound; f.vy = -Math.abs(f.vy) * 0.5; }
    }
  }

  _renderSmallFish() {
    const ctx = this.ctx;
    for (const f of this.smallFish) {
      ctx.save();
      ctx.translate(f.x, f.y);
      // 根据运动方向翻转
      ctx.scale(f.vx < 0 ? -1 : 1, 1);
      // 身体
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, f.size, f.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      // 尾鳍
      const tailWag = Math.sin(this.time * 8 + f.phase) * 0.4;
      ctx.beginPath();
      ctx.moveTo(-f.size, 0);
      ctx.lineTo(-f.size - 7, -5 + tailWag * 3);
      ctx.lineTo(-f.size - 7, 5 + tailWag * 3);
      ctx.closePath();
      ctx.fill();
      // 背鳍
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, -f.size * 0.35, 4, 3, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _renderTaskComplete() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    ctx.fillStyle = '#5C8A4C'; ctx.beginPath(); ctx.roundRect(cw / 2 - 400, ch / 2 - 60, 800, 120, 16); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.font = "bold 36px 'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✅ 任务目标达成！按 R 返回村庄', cw / 2, ch / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ============================================================
  // 日月潭环境动态元素：飞鸟 / 落叶 / 云朵
  // ============================================================

  _initEnvBirds() {
    this._envBirds = [];
    for (let i = 0; i < 5; i++) {
      this._envBirds.push({
        x: Math.random() * 1280,
        y: 40 + Math.random() * 120,
        vx: 25 + Math.random() * 35,
        wingPhase: Math.random() * Math.PI * 2,
        size: 4 + Math.random() * 3
      });
    }
  }
  _initEnvLeaves() {
    this._envLeaves = [];
    for (let i = 0; i < 8; i++) {
      this._envLeaves.push({
        x: Math.random() * 1280,
        y: Math.random() * 360,
        vx: 8 + Math.random() * 15,
        vy: 15 + Math.random() * 20,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 3,
        size: 3 + Math.random() * 3,
        color: ['#8BC34A', '#CDDC39', '#FFC107', '#FF9800', '#F44336'][Math.floor(Math.random() * 5)]
      });
    }
  }
  _initEnvClouds() {
    this._envClouds = [];
    for (let i = 0; i < 4; i++) {
      this._envClouds.push({
        x: Math.random() * 1280,
        y: 20 + Math.random() * 80,
        w: 80 + Math.random() * 120,
        speed: 5 + Math.random() * 10,
        alpha: 0.25 + Math.random() * 0.25
      });
    }
  }

  _updateEnvBirds(dt) {
    const cw = 1280;
    for (const b of this._envBirds) {
      b.x += b.vx * dt;
      b.wingPhase += dt * 8;
      if (b.x > cw + 30) { b.x = -30; b.y = 40 + Math.random() * 120; }
    }
  }
  _updateEnvLeaves(dt) {
    const cw = 1280; const ch = 720;
    for (const l of this._envLeaves) {
      l.x += (l.vx + Math.sin(this.time * 2 + l.rot) * 8) * dt;
      l.y += l.vy * dt;
      l.rot += l.rotSpeed * dt;
      if (l.y > ch || l.x > cw + 20) {
        l.x = Math.random() * cw * 0.6;
        l.y = -10;
        l.vy = 15 + Math.random() * 20;
      }
    }
  }
  _updateEnvClouds(dt) {
    const cw = 1280;
    for (const c of this._envClouds) {
      c.x += c.speed * dt;
      if (c.x > cw + c.w) { c.x = -c.w - 20; c.y = 20 + Math.random() * 80; }
    }
  }

  _renderEnvBirds(ctx) {
    ctx.strokeStyle = '#2C3E50'; ctx.lineWidth = 1.5;
    for (const b of this._envBirds) {
      const wing = Math.sin(b.wingPhase) * b.size;
      ctx.beginPath();
      ctx.moveTo(b.x - b.size, b.y + wing);
      ctx.quadraticCurveTo(b.x, b.y - Math.abs(wing) * 0.3, b.x + b.size, b.y + wing);
      ctx.stroke();
    }
  }
  _renderEnvLeaves(ctx) {
    for (const l of this._envLeaves) {
      ctx.save();
      ctx.translate(l.x, l.y); ctx.rotate(l.rot);
      ctx.fillStyle = l.color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.ellipse(0, 0, l.size, l.size * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  _renderEnvClouds(ctx) {
    for (const c of this._envClouds) {
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w * 0.5, c.w * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x - c.w * 0.25, c.y + 5, c.w * 0.35, c.w * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x + c.w * 0.22, c.y + 3, c.w * 0.38, c.w * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

const fishingScene = new FishingScene();
export default fishingScene;