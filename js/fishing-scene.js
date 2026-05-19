// 钓鱼场景模块（720p HD）

import SceneManager from './scene-manager.js';
import questSystem from './quest-system.js';
import { QUESTS } from './data/quests.js';
import { rollFishWithRod, SHUISHE_FISH_POOL } from './data/fish-pool.js';
import { drawFishingBg } from './render/fishing-bg.js';

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  aiming: { chargeCycle: 1.5, powerWeakMax: 33, powerMidMax: 66, powerStrongMax: 95, powerOverload: 96 },
  casting: { windUpDuration: 0.25, swingDuration: 0.35, releaseDuration: 0.20, idleAngle: -Math.PI / 4, windUpAngle: -Math.PI / 12, releaseAngle: -Math.PI * 0.42, arcHeightBase: 180, overshootAmount: 0.06 },
  waiting: { fishSpawnDelay: 2.0, biteSinkCount: 3, biteSinkDepth: 9, biteSinkDuration: 0.2 },
  biteWindow: { duration: 2.0 },
  reeling: { qteCountByRarity: [3, 5, 7, 9, 11], tickDurationByRarity: [1.6, 1.4, 1.2, 1.0, 0.8], hpDamageByRarity: [35, 20, 15, 12, 10], tensionPenaltyByRarity: [15, 18, 20, 22, 25], tensionSuccessBonus: 10, tensionFailPenalty: 20, tensionTimeoutPenalty: 20 },
  playing: { maxTension: 100, tensionPerSecond: 20, tensionDecayPerSecond: 6, fishEscapeSpeed: 225, fishEscapeSpeedIncrease: 12, catchZoneX: 0.9, catchZoneY: 0.2, tensionLowThreshold: 40, tensionHighThreshold: 70, escapeBaseChanceAtZero: 0.08, escapeChanceAtHalf: 0.015, escapeChanceAtFull: 0.001, lowTensionPenaltyMultiplier: 3.0, highTensionBonusMultiplier: 0.3, escapeCheckInterval: 0.5, fishHPRecoverPerSecond: 8, fishHPMaxRecoverRatio: 0.3 },
  caught: { animationDuration: 2.0, slowmoThreshold: 4, slowmoScale: 0.3, particleCount: 18, legendaryGlowDuration: 0.5 },
  failed: { resetDuration: 1.5 },
  fish: { travelSpeed: 120, biteProbBase: 0.6 },
};

const FAILED_MESSAGES = { overload: ['干! 用力过头炸线啦!', '拍谢，钓线炸掉了'], timeout: ['啊~ 跑了啦...', '呜呜不小心发呆了'], tension: ['这尾靠北大! 线撑不住~', '它太拼了啦'], escape: ['它挣脱了耶...', '差一点点啊!'] };

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
import { FISH_POOL } from './FISH_POOL.js';
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
    this.waitTimer = 0; this.currentFish = null; this.fishShadow = null; this.fishShadowPos = { x: 0, y: 0 };
    this.biteCount = 0; this.biteSinking = false; this.biteSinkingProgress = 0; this.biteResumeTimer = 0;
    this.biteWindowTimer = 0; this.qteIndex = 0; this.qteTotal = 0; this.qteDirection = ''; this.qteTimer = 0; this.qteMaxTime = 0;
    this.fishHP = 0; this.fishMaxHP = 0; this.tension = 0; this.qteResult = ''; this.qteResultColor = '#FFF';
    this.tensionChangeText = ''; this.tensionChangeTimer = 0; this.playingFishX = 0; this.playingFishY = 0; this.playingFishColor = '';
    this.fishYCenter = 0; this.fishYTime = 0; this.escapeSpeed = 0; this.escapeBurstTimer = 0; this.escapeCheckTimer = 0;
    this.lineStartX = 0; this.lineStartY = 0; this.caughtTimer = 0; this.failedTimer = 0; this.failedReason = '';
    this.caughtFish = null; this.caughtFishSize = 0; this.isNewFish = false; this.glowTimer = 0; this.warningShown = false; this.highTensionSound = false;
    this.characterX = 0; this.platformY = 0; this.characterY = 0; this.bobX = 0; this.bobY = 0;
    this.shakeCount = 0; this.failedMessageTimer = 0; this.failedMessageIndex = 0;
    this.fsm = new StateMachine(); this.particles = new ParticleSystem(); this.input = new InputSystem();
    this.atlas = new Set(); this.newFishHintShown = false; this.showingFishInfo = false; this.taskComplete = false;
    this._aimingEHeld = false; this._aimingSpaceHeld = false;
    // 小鱼群
    this.smallFish = []; this._initSmallFish();

    // ── 日月潭环境动画数据 ──────────────────────────────
    this._envBirds = []; this._envLeaves = []; this._envClouds = [];
    this._initEnvBirds(); this._initEnvLeaves(); this._initEnvClouds();

    // 初始化全局音频系统
    AudioSystem.init();

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
    const container = document.getElementById('fishing-scene');
    container.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280; this.canvas.height = 720;
    this.canvas.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false; this.ctx.webkitImageSmoothingEnabled = false;
    this.characterX = this.cw * 0.3; this.platformY = this.ch - 75; this.characterY = this.platformY - 42; this.bobX = this.characterX + 120; this.bobY = this.ch * 0.5 + 90;
    // 初始化输入系统（不监听事件，由 _bindEvents 统一处理）
    this.input.setupListeners(null, null);
    this._bindEvents();
    // 设置Canvas默认字体为腾讯体W7
    this.ctx.font = '16px "TencentSansW7", "Noto Sans TC", sans-serif';
  }

  start() { this.paused = false; this.lastTime = performance.now(); AudioSystem.playFishingAmbient(); this._loop(); }

  pause() { this.paused = true; if (this.rafId) cancelAnimationFrame(this.rafId); }

  resume() { if (!this.paused) return; this.paused = false; this.lastTime = performance.now(); this._loop(); }

  destroy() {
    this.pause();
    // 清理 InputSystem 的键盘监听
    this.input.destroy && this.input.destroy();
    // 清理 FishingScene 自己的键盘监听
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      document.removeEventListener('keyup', this._keyUpHandler);
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
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
        self.pause(); SceneManager.switchToInstant('village', { spawnAt: { x: 10, y: 8 } });
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
  }

  _showEscapeConfirm() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000;';
    overlay.innerHTML = `<div style="width:500px;height:200px;background:#F4E4C1;border:2px solid #3D2B1F;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"TencentSansW7", sans-serif;color:#3D2B1F;font-size:24px;font-weight:bold;">
      <p style="margin:0 0 24px">要回村庄吗？任务进度已保存</p>
      <div style="display:flex;gap:24px;">
        <button id="esc-yes" style="padding:12px 32px;font-size:20px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;">Y - 确认</button>
        <button id="esc-no" style="padding:12px 32px;font-size:20px;background:#F44336;color:#fff;border:none;border-radius:8px;cursor:pointer;">N - 取消</button>
      </div>
    </div>`;
    document.getElementById('fishing-scene').appendChild(overlay);
    overlay.querySelector('#esc-yes').onclick = () => { overlay.remove(); this.pause(); SceneManager.switchToInstant('village', { spawnAt: { x: 10, y: 8 } }); };
    overlay.querySelector('#esc-no').onclick = () => overlay.remove();
  }

  _showCodexToast(text) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 25%; left: 50%; transform: translate(-50%, -50%);
      padding: 16px 36px; background: rgba(0,0,0,0.85); color: #FFD700;
      font: bold 28px "TencentSansW7", sans-serif; border: 3px solid #FFD700;
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
    // 日月潭环境动画更新
    this._updateEnvBirds(dt); this._updateEnvLeaves(dt); this._updateEnvClouds(dt);
    this._updateSmallFish(dt);
    this.input.clearPressed();
  }

  _updateIdle() {
    // 使用 wasPressed 检测按键按下的瞬间，进入蓄力状态
    const spacePressed = this.input.wasPressed('space');
    console.log('[_updateIdle] Space键wasPressed:', spacePressed);
    console.log('[_updateIdle] 当前keys状态:', JSON.stringify(this.input.keys));
    
    if (spacePressed) {
      console.log('🎣 进入蓄力状态');
      this.fsm.transition('Aiming', 'press Space'); 
      this.aimPower = 0;
      // 记录进入蓄力状态时，Space键是否处于按下状态（用于检测释放）
      this._aimingSpaceHeld = this.input.isDown('space');
      console.log('[_updateIdle] 记录蓄力按键状态: _aimingSpaceHeld=', this._aimingSpaceHeld);
    }
    if (this.input.wasPressed('b')) this._toggleAtlas();
  }

  _updateAiming(dt) {
    const cfg = CONFIG.aiming; const period = cfg.chargeCycle * 2;
    const cycleTime = (performance.now() / 1000) % period;
    this.aimPower = cycleTime < cfg.chargeCycle ? (cycleTime / cfg.chargeCycle) * 100 : 100 - ((cycleTime - cfg.chargeCycle) / cfg.chargeCycle) * 100;
    this.aimPower = Math.round(this.aimPower);
    
    const spaceDown = this.input.isDown('space');
    console.log('[_updateAiming] aimPower:', this.aimPower, 'spaceDown:', spaceDown);
    console.log('[_updateAiming] _aimingSpaceHeld:', this._aimingSpaceHeld);
    
    // 检测释放：进入时按了Space，现在松开了
    const spaceReleased = this._aimingSpaceHeld && !this.input.isDown('space');
    console.log('[_updateAiming] spaceReleased:', spaceReleased);
    
    if (spaceReleased) {
      console.log('🎯 释放抛竿！蓄力:', this.aimPower);
      if (this.aimPower >= cfg.powerOverload) { this.fsm.transition('Failed', 'overload'); this.failedReason = 'overload'; }
      else {
        this.fsm.transition('Casting', 'release'); this.castProgress = 0;
        this.castFrom = { x: this.characterX - 75, y: this.characterY - 15 };
        let dist = this.aimPower <= cfg.powerWeakMax ? 225 : this.aimPower <= cfg.powerMidMax ? 420 : 630;
        this.castTo = { x: Math.min(this.cw - 90, this.castFrom.x + dist), y: this.ch * 0.55 + 60 };
        this.bobX = this.castTo.x; this.bobY = this.castTo.y;
        AudioSystem.playCast();
      }
      this._aimingEHeld = false;
      this._aimingSpaceHeld = false;
    }
    if (this.input.wasPressed('q') || this.input.wasPressed('escape')) {
      this.fsm.transition('Idle', 'cancel');
      this._aimingEHeld = false;
      this._aimingSpaceHeld = false;
    }
  }

  _updateCasting(dt) {
    const cfg = CONFIG.casting; const totalDuration = cfg.windUpDuration + cfg.swingDuration + cfg.releaseDuration;
    this.castProgress += dt / totalDuration;
    if (this.castProgress >= 1) { this.fsm.transition('Waiting', 'cast complete'); this.waitTimer = 0; this.currentFish = null; this.fishShadow = null; }
  }

  _updateWaiting(dt) {
    this.waitTimer += dt; this._updateWaitingBite(dt);
    if (!this.fishShadow && this.waitTimer >= CONFIG.waiting.fishSpawnDelay) {
      this._selectFish();
      if (this.currentFish) {
        this.fishShadow = { ...this.currentFish };
        const side = Math.random() < 0.5 ? -1 : 1;
        this.fishShadowPos = { x: this.bobX + side * (150 + Math.random() * 150), y: this.bobY + (Math.random() - 0.5) * 60 };
        this.fishShadow.targetX = this.bobX; this.fishShadow.targetY = this.bobY; this.fishShadow.moving = true;
        this.fishShadow.facingRight = side > 0;
      }
    }
    if (this.fishShadow && this.fishShadow.moving) {
      const dx = this.fishShadow.targetX - this.fishShadowPos.x; const dy = this.fishShadow.targetY - this.fishShadowPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.fishShadow.facingRight = dx > 0;
      if (dist > 7) {
        const speed = CONFIG.fish.travelSpeed;
        this.fishShadowPos.x += (dx / dist) * speed * dt; this.fishShadowPos.y += (dy / dist) * speed * dt;
      } else {
        this.fishShadow.moving = false;
        if (Math.random() < this.currentFish.baseProb + Math.random() * 0.4) this._startBite();
        else { this.fishShadow = null; this.waitTimer = CONFIG.waiting.fishSpawnDelay - 0.5; }
      }
    }
    if (this.input.wasPressed('q') || this.input.wasPressed('escape')) this._resetToIdle();
  }

  _selectFish() {
    // 根据装备的钓竿决定鱼种
    const rod = window.equipment ? window.equipment.getEquippedRod() : { rarityUnlock: 5, bigFishBonus: 0, maxSizeMul: 1.0 };
    const fishData = rollFishWithRod(rod);
    if (!fishData) {
      // fallback：旧逻辑
      const totalProb = FISH_POOL.reduce((sum, f) => sum + f.baseProb, 0);
      let rand = Math.random() * totalProb;
      for (const fish of FISH_POOL) { rand -= fish.baseProb; if (rand <= 0) { this.currentFish = { ...fish }; this.currentFish.maxHP = fish.rarity * 120; this.fishHP = this.currentFish.maxHP; break; } }
      return;
    }
    // 将 fish-pool.js 数据映射为 FishingScene 内部格式
    const legacy = FISH_POOL.find(f => f.name === fishData.species);
    this.currentFish = legacy ? { ...legacy } : {
      id: fishData.species, name: fishData.species,
      rarity: fishData.rarity, color: '#4682B4',
      size: [fishData.size, fishData.size * 0.5],
      price: fishData.basePrice, baseProb: fishData.weight / 100
    };
    this.currentFish.size = [fishData.size, fishData.size * 0.5];
    this.currentFish.price = fishData.basePrice;
    this.currentFish.maxHP = fishData.rarity * 120;
    this.fishHP = this.currentFish.maxHP;
  }

  _startBite() { this.biteCount = 0; this.biteSinking = true; this.biteSinkingProgress = 0; this.biteResumeTimer = 0; }

  _updateWaitingBite(dt) {
    if (!this.fsm.is('Waiting')) return;
    if (!this.biteSinking && this.biteCount > 0 && this.biteCount < CONFIG.waiting.biteSinkCount) {
      this.biteResumeTimer -= dt;
      if (this.biteResumeTimer <= 0) { this.biteSinking = true; this.biteSinkingProgress = 0; }
    }
    if (this.biteSinking) {
      this.biteSinkingProgress += dt / CONFIG.waiting.biteSinkDuration;
      if (this.biteSinkingProgress >= 1) {
        this.biteSinking = false; this.biteSinkingProgress = 0; this.bobY = this.ch * 0.65 + 60;
        this.biteCount++; AudioSystem.playBite();
        if (this.biteCount >= CONFIG.waiting.biteSinkCount) {
          this.fsm.transition('BiteWindow', 'fish bite complete');
          const rod = window.equipment ? window.equipment.getEquippedRod() : null;
          const windowMul = rod ? rod.qteWindowMul : 1.0;
          this.biteWindowTimer = CONFIG.biteWindow.duration * windowMul;
        }
        else this.biteResumeTimer = 0.3;
      } else this.bobY = this.ch * 0.65 + 60 + CONFIG.waiting.biteSinkDepth * this.biteSinkingProgress;
    }
  }

  _updateBiteWindow(dt) {
    this.biteWindowTimer -= dt;
    if (this.input.wasPressed('space')) { this._startReeling(); return; }
    if (this.biteWindowTimer <= 0) { this.fsm.transition('Failed', 'timeout'); this.failedReason = 'timeout'; }
  }

  _startReeling() { this.fsm.transition('Playing', 'success bite'); this._initPlayingState(); }

  _initPlayingState() {
    const cfg = CONFIG.playing; const w = this.cw; const h = this.ch;
    // 纯水下视角：鱼线从右上角（模拟从水面伸入）
    this.lineStartX = w - 60; this.lineStartY = 30;
    // 鱼初始位置在水下中央区域
    const centerX = w * 0.45; const centerY = h * 0.55; const rangeX = w * 0.15; const rangeY = h * 0.12;
    this.playingFishX = centerX + (Math.random() - 0.5) * rangeX * 2; this.playingFishY = centerY + (Math.random() - 0.5) * rangeY * 2;
    this.escapeSpeed = cfg.fishEscapeSpeed; this.tension = 60; this.escapeBurstTimer = 0; this.fishMaxHP = this.currentFish.maxHP;
    this.fishYCenter = this.playingFishY; this.fishYTime = Math.random() * Math.PI * 2; this.escapeCheckTimer = 0; this.warningShown = false;
    // 首次进入水下场景时显示拉力教程
    this._showTensionTutorialIfNeeded();
  }

  _showTensionTutorialIfNeeded() {
    if (window.Save?.get('flags.fishing_tutorial_shown')) return;
    this.paused = true;
    const panel = document.createElement('div');
    panel.id = 'fishing-tutorial-panel';
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;background:rgba(0,0,0,0.92);border:2px solid #4FC3F7;border-radius:16px;padding:28px;color:#fff;font-family:"TencentSansW7", sans-serif;z-index:1000;text-align:center;';
    panel.innerHTML = `
      <h2 style="margin:0 0 16px;color:#FFD700;font-size:26px;">🎣 钓鱼技巧</h2>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#ddd;">
        鱼上钩后进入<strong style="color:#4FC3F7">水下视角</strong>，需要控制<strong style="color:#4FC3F7">鱼线拉力</strong>来收服鱼儿！
      </p>
      <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:16px;margin:16px 0;text-align:left;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <div style="width:60px;height:16px;background:#44ff44;border-radius:4px;"></div>
          <span style="font-size:15px;color:#44ff44;font-weight:bold;">绿色区域 — 最佳拉力</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <div style="width:60px;height:16px;background:#ffaa00;border-radius:4px;"></div>
          <span style="font-size:15px;color:#ffaa00;">黄色区域 — 注意调整</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:60px;height:16px;background:#ff4444;border-radius:4px;"></div>
          <span style="font-size:15px;color:#ff4444;">红色区域 — 危险！鱼会逃跑</span>
        </div>
      </div>
      <p style="margin:0 0 20px;font-size:15px;color:#aaa;">
        💡 按住 <strong style="color:#fff">空格键</strong> 收线降低拉力，松开让拉力回升<br>
        保持拉力在 <strong style="color:#44ff44">绿色区域</strong> 最容易成功！
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#ff6b6b;font-weight:bold;">
        ⚠️ 如果放任鱼儿不管，也会脱钩哦！
      </p>
      <div style="display:inline-block;padding:8px 20px;border:2px solid #FFD700;border-radius:8px;background:rgba(255,215,0,0.1);">
        <p style="margin:0;font-size:18px;color:#FFD700;font-weight:bold;">按 <strong style="color:#FFD700;">空格键</strong> 继续</p>
      </div>
    `;
    document.body.appendChild(panel);
    const closeTutorial = () => {
      panel.remove();
      window.Save?.set('flags.fishing_tutorial_shown', true);
      window.Save?.commit();
      this.resume();
    };
    this._tutorialCloseHandler = closeTutorial;
  }

  _updatePlaying(dt) {
    const cfg = CONFIG.playing; const holdingSpace = this.input.isDown(' ') || this.input.isDown('space'); const w = this.cw; const h = this.ch;
    // 收线音效控制：按住空格时启动音效，松手停止
    if (holdingSpace) AudioSystem.startReelSound();
    else AudioSystem.stopReelSound();
    if (this._checkEscape(dt)) return;
    const hpDecayRate = 5 + this.currentFish.rarity * 4.5; const hpRecoverRate = cfg.fishHPRecoverPerSecond; const maxRecoverHP = this.fishMaxHP * cfg.fishHPMaxRecoverRatio;
    if (this.fishHP > 0) { if (holdingSpace) this.fishHP = Math.max(0, this.fishHP - hpDecayRate * dt); else if (this.fishHP < maxRecoverHP) this.fishHP = Math.min(maxRecoverHP, this.fishHP + hpRecoverRate * dt); }
    const fishExhausted = this.fishHP <= 0;
    if (this.tension > 70 && !this.highTensionSound) { this.highTensionSound = true; AudioSystem.playReelTick(); } else if (this.tension <= 70) this.highTensionSound = false;
    if (this.tension > cfg.maxTension * 0.85 && !this.warningShown) { this.warningShown = true; } else if (this.tension <= cfg.maxTension * 0.85 && this.warningShown) this.warningShown = false;
    if (this.tension > cfg.maxTension * 0.9 && holdingSpace) { const breakChance = (this.tension - cfg.maxTension * 0.9) / (cfg.maxTension * 0.1) * 0.45 * dt; if (Math.random() < breakChance) { this.fsm.transition('Failed', 'tension overflow'); this.failedReason = 'tension'; return; } }
    const sizeFactor = this.currentFish.size[0] / 30;
    if (holdingSpace && !fishExhausted) {
      const pullSpeed = 120 + sizeFactor * 60; const tensionDecay = cfg.tensionDecayPerSecond * (1 + (sizeFactor - 1) * 0.3);
      this.tension = Math.max(0, this.tension - tensionDecay * dt); this.playingFishX += pullSpeed * dt; this.escapeSpeed = cfg.fishEscapeSpeed * 0.3; this.escapeBurstTimer = 0;
    } else if (!fishExhausted) {
      if (this.escapeBurstTimer > 0) { this.escapeBurstTimer -= dt; this.escapeSpeed = cfg.fishEscapeSpeed * 3; this.tension += cfg.tensionPerSecond * 2.25 * dt; }
      else { this.escapeSpeed += cfg.fishEscapeSpeedIncrease * dt; this.tension += cfg.tensionPerSecond * dt; }
    } else { this.escapeSpeed = 0; this.playingFishX += 45 * dt; }
    this.playingFishX -= this.escapeSpeed * dt; this.playingFishX = Math.max(-30, Math.min(w - 90, this.playingFishX));
    this.fishYTime += dt * 1.5;
    const catchZoneRight = w * 0.9;
    if (this.playingFishX >= catchZoneRight || fishExhausted) this.fishYTime = 0;
    else { const yAmplitude = h * 0.1; this.playingFishY = this.fishYCenter + Math.sin(this.fishYTime) * yAmplitude; }
    if ((this.playingFishX >= w * cfg.catchZoneX && holdingSpace) || fishExhausted) { const pullUpSpeed = fishExhausted ? 225 : 150; this.playingFishY -= pullUpSpeed * dt; if (this.playingFishY <= h * cfg.catchZoneY) { this.fsm.transition('Caught', 'fish caught'); this._onFishCaught(); return; } }
    if (this.tension >= cfg.maxTension) { this.fsm.transition('Failed', 'tension overflow'); this.failedReason = 'tension'; }
    else if (this.playingFishX < -30) { this.fsm.transition('Failed', 'escape'); this.failedReason = 'escape'; }
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
    if (Math.random() < this._calculateEscapeChance(this.tension, cfg.maxTension)) { this.fsm.transition('Failed', 'escape'); this.failedReason = 'escape'; return true; }
    return false;
  }

  _onFishCaught() {
    AudioSystem.stopReelSound();
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
      player.fishBag.push({
        species: this.currentFish.name,
        size: this.caughtFishSize,
        rarity: poolFish ? poolFish.rarity : (this.currentFish.rarity || 1),
        basePrice: poolFish ? poolFish.basePrice : (this.currentFish.price || 0),
        caughtAt: Date.now()
      });
      window.Save.set('player', player);
      window.Save.commit();
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
    if (this.showingFishInfo && this.input.wasPressed('space')) {
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
    if (this.input.wasPressed('space')) {
      console.log('跑鱼后按空格键确认，再次抛竿');
      this.shakeCount = 0; // 重置震动计数
      if (this.failedReason === 'escape') this._resetToWaiting(); else this._resetToIdle();
      return;
    }
  }

  _resetToWaiting() {
    this.fsm.transition('Waiting', 'reset'); this.timeScale = 1; this.waitTimer = 0; this.caughtTimer = 0; this.caughtFish = null; this.caughtFishSize = 0; this.currentFish = null; this.fishShadow = null; this.biteSinking = false; this.biteCount = 0; this.biteSinkingProgress = 0; this.biteResumeTimer = 0; this.showingFishInfo = false; this.isNewFish = false; this.glowTimer = 0; this.warningShown = false; this.playingFishX = 0; this.playingFishY = 0; this.escapeSpeed = 0; this.fishMaxHP = 0; this.tensionChangeText = ''; this.tensionChangeTimer = 0; this.qteIndex = 0; this.qteTotal = 0; this.fishHP = 0; this.tension = 0; this.lineStartX = 0; this.lineStartY = 0; this.bobX = this.characterX + 180; this.bobY = this.ch * 0.5 + 90; this.castProgress = 0;
  }

  _resetToIdle() { this.fsm.transition('Idle', 'reset'); this.timeScale = 1; this.bobX = this.characterX + 120; this.bobY = this.ch * 0.5 + 90; this.fishShadow = null; this.currentFish = null; this.biteSinking = false; this.showingFishInfo = false; }

  _toggleAtlas() {
    const isOpen = document.getElementById('atlas-panel'); if (isOpen) { isOpen.remove(); return; }
    const panel = document.createElement('div'); panel.id = 'atlas-panel';
    panel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:600px;max-height:80%;background:rgba(0,0,0,0.9);border:2px solid #4FC3F7;border-radius:16px;padding:24px;color:#fff;font-family:"TencentSansW7", sans-serif;overflow-y:auto;z-index:100;';
    let html = '<h2 style="text-align:center;color:#FFD700;font-size:28px;margin:0 0 20px">📖 鱼获图鉴</h2><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">';
    FISH_POOL.forEach(f => { const owned = this.atlas.has(f.id); html += `<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:16px;text-align:center;${owned ? '' : 'opacity:0.4'}">
      <div style="font-size:48px">${owned ? '🐟' : '🔒'}</div><div style="font-size:18px;font-weight:bold;color:${f.color}">${f.name}</div><div style="font-size:14px;color:#aaa">${'★'.repeat(f.rarity)} | $${f.price}</div></div>`; });
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
    if (this.fsm.is('Playing')) this._renderPlaying();
    else { this._renderBackground(); const floatOffset = this._renderPlatform(); this._renderCharacterBody(floatOffset); if (!this.fsm.is('Casting')) this._renderRodAndBob(floatOffset); if (this.fsm.is('Casting')) this._renderCasting(floatOffset); this._renderRightHand(floatOffset); if (this.fishShadow && this.fishShadow.moving) this._renderFishShadow(); this._renderParticles(); if (this.fsm.is('Caught') && this.showingFishInfo) this._renderCaught(); this._renderHUD(); if (this.fsm.is('Aiming')) this._renderAimBar(); if (this.fsm.is('BiteWindow')) this._renderBiteAlert(); if (this.fsm.is('Reeling')) this._renderQTE(); }
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
    const shaftCount = 6;
    for (let i = 0; i < shaftCount; i++) {
      const baseX = cw * (0.1 + i * 0.15) + Math.sin(this.time * 0.3 + i * 1.7) * 40;
      const width = 25 + Math.sin(this.time * 0.25 + i * 2.1) * 12;
      const length = ch * (0.35 + Math.sin(this.time * 0.2 + i * 1.3) * 0.1);
      const alpha = 0.06 + Math.sin(this.time * 0.4 + i * 0.9) * 0.025;
      const shaftGrad = ctx.createLinearGradient(baseX, 0, baseX, length);
      shaftGrad.addColorStop(0, `rgba(180, 235, 255, ${alpha * 1.5})`);
      shaftGrad.addColorStop(0.3, `rgba(140, 210, 240, ${alpha})`);
      shaftGrad.addColorStop(0.7, `rgba(100, 180, 220, ${alpha * 0.4})`);
      shaftGrad.addColorStop(1, 'rgba(80, 160, 200, 0)');
      ctx.fillStyle = shaftGrad;
      ctx.beginPath();
      ctx.moveTo(baseX - width * 0.4, 0);
      ctx.lineTo(baseX + width * 0.4, 0);
      ctx.lineTo(baseX + width * 1.2, length);
      ctx.lineTo(baseX - width * 1.2, length);
      ctx.closePath();
      ctx.fill();
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
    this._drawBush(ctx, cw * 0.22, waterLevel - 2, 28, '#2E7D32');
    this._drawBush(ctx, cw * 0.35, waterLevel + 2, 22, '#388E3C');
    this._drawBush(ctx, cw * 0.78, waterLevel - 1, 26, '#1B5E20');
    this._drawBush(ctx, cw * 0.82, waterLevel + 3, 20, '#33691E');
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
    const platformWidth = 210; const platformHeight = 21; const floatTubeRadius = 18;
    const floatOffset = Math.sin(this.time * 1.8) * 3.75; const drawY = y + floatOffset;
    ctx.fillStyle = '#5D4037'; ctx.fillRect(x - platformWidth / 2, drawY + platformHeight - 6, platformWidth, 9);
    ctx.fillStyle = '#A1887F'; ctx.fillRect(x - platformWidth / 2, drawY, platformWidth, platformHeight);
    ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1.5; for (let i = -platformWidth / 2 + 33; i < platformWidth / 2; i += 36) { ctx.beginPath(); ctx.moveTo(x + i, drawY + 3); ctx.lineTo(x + i, drawY + platformHeight - 4); ctx.stroke(); }
    ctx.strokeStyle = '#8D6E63'; ctx.beginPath(); ctx.moveTo(x - platformWidth / 2 + 3, drawY + platformHeight / 2); ctx.lineTo(x + platformWidth / 2 - 3, drawY + platformHeight / 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - platformWidth / 2 + 7, drawY + 3, platformWidth - 14, 4);
    ctx.fillStyle = '#D32F2F';
    ctx.beginPath(); ctx.ellipse(x - platformWidth / 2 + floatTubeRadius + 6, drawY + platformHeight + floatTubeRadius, floatTubeRadius, floatTubeRadius + 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + platformWidth / 2 - floatTubeRadius - 6, drawY + platformHeight + floatTubeRadius, floatTubeRadius, floatTubeRadius + 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3;
    for (let r = 120; r <= 180; r += 30) { ctx.beginPath(); ctx.ellipse(x, drawY + platformHeight + floatTubeRadius + 7, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke(); }
    return floatOffset;
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
    ctx.font = `bold ${cfg.fontSize}px \"Cubic 11\", \"TencentSansW7\", \"Noto Sans TC\", sans-serif`;
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

  _renderRightHand(floatOffset) {
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
    ctx.fillStyle = '#F44336'; ctx.beginPath(); ctx.arc(bobX, bobY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(bobX - 3, bobY - 3, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  _renderRodAndBob(floatOffset = 0) {
    const ctx = this.ctx; const ROD_LENGTH = 180; const ROD_ANGLE = -Math.PI / 4;
    const bodyWidth = 39;
    // 使用与角色相同的翻转坐标系，确保鱼竿和右手位置完全一致
    const x = this.characterX; const y = this.characterY + floatOffset;
    ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
    // 右手骨骼节点位置（与 _renderRightHand 一致）
    const handX = bodyWidth / 2 + 15; const handY = -42 + 36;
    ctx.save(); ctx.translate(handX, handY); ctx.rotate(-0.5);
    // 鱼竿从手部位置向上倾斜45°
    ctx.rotate(ROD_ANGLE + 0.5);
    const gradient = ctx.createLinearGradient(0, 0, ROD_LENGTH, 0); gradient.addColorStop(0, '#5D4037'); gradient.addColorStop(0.4, '#A1887F'); gradient.addColorStop(1, '#BCAAA4');
    ctx.fillStyle = gradient; ctx.fillRect(0, -4, 37, 8); ctx.fillRect(37, -3, 52, 6); ctx.fillRect(89, -2, 45, 4); ctx.fillRect(134, -1.5, 46, 3);
    ctx.fillStyle = '#78909C'; [45, 97, 142].forEach(pos => { ctx.beginPath(); ctx.arc(pos, 0, pos === 45 ? 4.5 : pos === 97 ? 3.75 : 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    // 鱼线：计算竿尖在世界坐标中的位置
    const rodTipLocalX = handX + Math.cos(ROD_ANGLE) * ROD_LENGTH;
    const rodTipLocalY = handY + Math.sin(ROD_ANGLE) * ROD_LENGTH;
    // 翻转坐标系转换回屏幕坐标
    const tipX = x - rodTipLocalX;
    const tipY = y + rodTipLocalY;
    ctx.restore(); // 结束翻转坐标系
    ctx.strokeStyle = 'rgba(100,100,100,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tipX, tipY); const midX = (tipX + this.bobX) / 2; ctx.quadraticCurveTo(midX, Math.min(tipY, this.bobY) - 45, this.bobX, this.bobY); ctx.stroke();
    ctx.fillStyle = '#F44336'; ctx.beginPath(); ctx.arc(this.bobX, this.bobY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(this.bobX, this.bobY - 12, 6, 0, Math.PI * 2); ctx.fill();
  }

  _renderFishShadow() {
    const ctx = this.ctx; const fish = this.fishShadow; const x = this.fishShadowPos.x; const y = this.fishShadowPos.y;
    ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#1a1a2e';
    const bodyWidth = fish.size[0] * 1.5; const bodyHeight = fish.size[1] * 0.5;
    if (!fish.facingRight) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
    ctx.beginPath(); ctx.ellipse(x, y, bodyWidth, bodyHeight, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - bodyWidth, y); ctx.lineTo(x - bodyWidth - bodyWidth * 0.8, y - bodyHeight * 0.8); ctx.lineTo(x - bodyWidth - bodyWidth * 0.8, y + bodyHeight * 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _renderParticles() { this.particles.draw(this.ctx); }

  _renderPlaying() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const cfg = CONFIG.playing; const holdingSpace = this.input.isDown(' ') || this.input.isDown('space');

    // ═══════════════════════════════════════════════════════════
    //  100% 纯水下视角 — 日月潭深潜场景
    // ═══════════════════════════════════════════════════════════

    // ── Layer 0: 深水渐变（从上方微光到深处暗蓝）────────────
    const waterGrad = ctx.createLinearGradient(0, 0, 0, ch);
    waterGrad.addColorStop(0, '#2A7A90');     // 顶部：水面透光区
    waterGrad.addColorStop(0.08, '#1E6880');   // 浅层
    waterGrad.addColorStop(0.25, '#155568');   // 中浅层
    waterGrad.addColorStop(0.50, '#0E4252');   // 中层
    waterGrad.addColorStop(0.75, '#0A3242');   // 深层
    waterGrad.addColorStop(1, '#061E2E');       // 最深处
    ctx.fillStyle = waterGrad; ctx.fillRect(0, 0, cw, ch);

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

    // 鱼线（水下视角：从右上角延伸入水）
    let lineColor = this.tension >= cfg.tensionHighThreshold ? '#44ff44' : this.tension <= cfg.tensionLowThreshold ? '#ff4444' : '#ffaa00';
    ctx.strokeStyle = lineColor; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(this.lineStartX, this.lineStartY);
    const sag = this.tension > 50 ? 30 - (this.tension - 50) * 0.75 : 30; const midX = (this.lineStartX + this.playingFishX) / 2; ctx.quadraticCurveTo(midX, Math.max(this.lineStartY, this.playingFishY) + sag, this.playingFishX, this.playingFishY); ctx.stroke();
    ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(this.playingFishX, this.playingFishY, 9, 0, Math.PI * 2); ctx.fill();

    // 渲染鱼
    this._renderFish(this.playingFishX, this.playingFishY, this.currentFish.color, this.currentFish.size[0], holdingSpace, holdingSpace);

    // 鱼身体下方耐力条
    const fishHPBarW = 120; const fishHPBarX = this.playingFishX - fishHPBarW / 2; const fishHPBarY = this.playingFishY + 55;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(fishHPBarX - 3, fishHPBarY - 3, fishHPBarW + 6, 16);
    ctx.fillStyle = '#333'; ctx.fillRect(fishHPBarX, fishHPBarY, fishHPBarW, 10);
    ctx.fillStyle = '#F44336'; ctx.fillRect(fishHPBarX, fishHPBarY, fishHPBarW * Math.max(0, this.fishHP / this.currentFish.maxHP), 10);
    ctx.fillStyle = '#FFF'; ctx.font = "12px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.fillText(Math.round(this.fishHP) + '/' + this.currentFish.maxHP, this.playingFishX, fishHPBarY + 22); ctx.textAlign = 'left';

    // ═══════════════════════════════════════════════════════════
    //  UI层
    // ═══════════════════════════════════════════════════════════

    // 屏幕正下方 操作提示
    const hintW = 400; const hintH = 70; const hintX = (cw - hintW) / 2; const hintY = ch - 100;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.beginPath(); ctx.roundRect(hintX, hintY, hintW, hintH, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (holdingSpace) {
      ctx.fillStyle = '#FFF'; ctx.font = "bold 28px 'TencentSansW7', sans-serif";
      ctx.fillText('✓ 拉回中...', cw / 2, hintY + hintH / 2);
    } else {
      const textY = hintY + hintH / 2 - 8;
      ctx.fillStyle = '#FFF'; ctx.font = "bold 28px 'TencentSansW7', sans-serif";
      ctx.fillText('按住', cw / 2 - 85, textY);
      ctx.fillStyle = '#FF4444'; ctx.font = "bold 40px 'TencentSansW7', sans-serif";
      ctx.fillText('空格键', cw / 2 + 8, textY);
      ctx.fillStyle = '#FFF'; ctx.font = "bold 28px 'TencentSansW7', sans-serif";
      ctx.fillText('拉回鱼', cw / 2 + 110, textY);
    }
    if (!holdingSpace) { ctx.fillStyle = '#4CAF50'; ctx.font = "16px 'TencentSansW7', sans-serif"; ctx.fillText('提示：不拉鱼线时鱼会恢复体力！', cw / 2, hintY + hintH / 2 + 22); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // 右侧信息面板（右下角）
    const panelW = 240; const panelH = 155; const panelX = cw - panelW - 20; const panelY = ch - panelH - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 20px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center';
    ctx.fillText(this.currentFish.name, panelX + panelW / 2, panelY + 28);
    ctx.fillStyle = '#FFF'; ctx.font = "16px 'TencentSansW7', sans-serif";
    ctx.fillText('★'.repeat(this.currentFish.rarity), panelX + panelW / 2, panelY + 50);

    // 耐力条
    const hpBarW = panelW - 30; const hpBarX = panelX + 15; const hpBarY = panelY + 65;
    ctx.fillStyle = '#333'; ctx.fillRect(hpBarX, hpBarY, hpBarW, 16);
    ctx.fillStyle = '#F44336'; ctx.fillRect(hpBarX, hpBarY, hpBarW * Math.max(0, this.fishHP / this.currentFish.maxHP), 16);
    ctx.fillStyle = '#FFF'; ctx.font = "12px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center';
    ctx.fillText(`鱼的体力 ${Math.round(this.fishHP)}/${this.currentFish.maxHP}`, hpBarX + hpBarW / 2, hpBarY + 26);

    // 鱼线拉力指示器
    const tensionBarW = hpBarW; const tensionBarX = hpBarX; const tensionBarY = panelY + 100;
    ctx.fillStyle = '#222'; ctx.fillRect(tensionBarX, tensionBarY, tensionBarW, 16);
    const tensionColor = this.tension >= cfg.tensionHighThreshold ? '#44ff44' : this.tension <= cfg.tensionLowThreshold ? '#ff4444' : '#ffaa00';
    ctx.fillStyle = tensionColor; ctx.fillRect(tensionBarX, tensionBarY, tensionBarW * (this.tension / cfg.maxTension), 16);
    ctx.fillStyle = '#FFF'; ctx.font = "12px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center';
    ctx.fillText(`鱼线拉力 ${Math.round(this.tension)}/${cfg.maxTension}`, tensionBarX + tensionBarW / 2, tensionBarY + 28);

    if (this.tension <= cfg.tensionLowThreshold) {
      const flashAlpha = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.fillStyle = `rgba(244, 67, 54, ${flashAlpha * 0.3})`; ctx.fillRect(0, 0, cw, ch);
      const alertW = 450; const alertH = 90; const alertX = (cw - alertW) / 2; const alertY = (ch - alertH) / 2;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * flashAlpha})`; ctx.fillRect(alertX - 6, alertY - 6, alertW + 12, alertH + 12);
      ctx.fillStyle = `rgba(244, 67, 54, ${flashAlpha})`; ctx.fillRect(alertX, alertY, alertW, alertH);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`; ctx.font = "bold 42px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.fillText('⚠ 鱼线拉力极限 ⚠', cw / 2, alertY + 57); ctx.textAlign = 'left';
    }
    ctx.textAlign = 'left';
    this._renderHUD();
  }

  _renderFish(x, y, color, size, struggling, fishFacingRight = true) {
    const ctx = this.ctx; const scale = size / 30;
    ctx.save(); ctx.translate(x, y);
    // fishFacingRight 为 true 时鱼头朝右（scaleX=1），为 false 时鱼头朝左（scaleX=-1）
    ctx.scale(fishFacingRight ? 1 : -1, 1);
    // 挣扎时鱼身摆动
    if (struggling) ctx.rotate(Math.sin(this.time * 20) * 0.2);
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

  _renderHUD() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cw * 0.008, ch * 0.014, cw * 0.117, ch * 0.056);
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 30px 'TencentSansW7', sans-serif"; ctx.fillText(`💰 ${this.money}`, cw * 0.016, ch * 0.053);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(cw * 0.133, ch * 0.014, cw * 0.094, ch * 0.056);
    ctx.fillStyle = '#4FC3F7'; ctx.fillText(`🐟 ${this.fishCount}`, cw * 0.141, ch * 0.053);

    // 装备钓竿显示（左下角）
    if (window.equipment) {
      const rod = window.equipment.getEquippedRod();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(20, 660, 280, 40);
      ctx.fillStyle = '#ffd700';
      ctx.font = "18px 'TencentSansW7', sans-serif";
      ctx.fillText(`${rod.icon} ${rod.name}`, 30, 686);
    }
  }

  _renderAimBar() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const barW = 450; const barH = 30; const x = (cw - barW) / 2; const y = ch - 90;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 3, y - 3, barW + 6, barH + 6);
    const segW = barW / 100; for (let i = 0; i < 100; i++) { ctx.fillStyle = i < 33 ? '#9E9E9E' : i < 66 ? '#4CAF50' : i < 95 ? '#FFC107' : '#F44336'; ctx.fillRect(x + i * segW, y, segW, barH); }
    const pointerX = x + this.aimPower * segW; ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.moveTo(pointerX, y - 12); ctx.lineTo(pointerX - 9, y - 3); ctx.lineTo(pointerX + 9, y - 3); ctx.closePath(); ctx.fill();
    ctx.font = "21px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.fillText(this.aimPower < 33 ? '弱力' : this.aimPower < 66 ? '中力' : this.aimPower < 95 ? '强力' : '⚠️过力!', cw / 2, y + barH + 30); ctx.textAlign = 'left';
  }

  _renderBiteAlert() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    ctx.fillStyle = 'rgba(255,0,0,0.2)'; ctx.fillRect(0, 0, cw, ch);
    if (Math.sin(Date.now() / 100) > 0) {
      ctx.fillStyle = '#FF0000'; ctx.font = "bold 180px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', cw / 2, ch / 2);
      // "快按" 和 "提竿!" 分段渲染，[空格] 键使用高对比度霓虹绿
      const baseY = ch / 2 + 120;
      ctx.font = "42px 'TencentSansW7', sans-serif";
      const leftText = '快按 ';
      const keyText = '[空格]';
      const rightText = ' 提竿!';
      const leftW = ctx.measureText(leftText).width;
      const keyW = ctx.measureText(keyText).width;
      const totalW = leftW + keyW + ctx.measureText(rightText).width;
      const startX = cw / 2 - totalW / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFF';
      ctx.fillText(leftText, startX, baseY);
      // [空格] 键：霓虹绿 + 黑色描边高亮
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      ctx.strokeText(keyText, startX + leftW, baseY);
      ctx.fillStyle = '#00FF88';
      ctx.fillText(keyText, startX + leftW, baseY);
      ctx.fillStyle = '#FFF';
      ctx.fillText(rightText, startX + leftW + keyW, baseY);
      ctx.textAlign = 'center';
      ctx.font = "30px 'TencentSansW7', sans-serif"; ctx.fillText(`剩余 ${(this.biteWindowTimer).toFixed(1)}s`, cw / 2, ch / 2 + 180);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }

  _renderQTE() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const cx = cw / 2; const cy = ch / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, cw, ch);
    const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 144px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(arrows[this.qteDirection] || '?', cx, cy - 45);
    const radius = 90; const progress = this.qteTimer / this.qteMaxTime;
    ctx.strokeStyle = progress > 0.3 ? '#4CAF50' : '#F44336'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy - 45, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
    ctx.fillStyle = '#FFF'; ctx.font = "36px 'TencentSansW7', sans-serif"; ctx.fillText(Math.ceil(this.qteTimer * 10) / 10 + 's', cx, cy + 90); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (this.qteResult) { ctx.fillStyle = this.qteResultColor; ctx.font = "bold 54px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.fillText(this.qteResult, cw / 2, ch / 2 + 150); ctx.textAlign = 'left'; }
  }

  _renderCaught() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch; const fish = this.caughtFish || this.currentFish;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.4); skyGrad.addColorStop(0, '#FF8C00'); skyGrad.addColorStop(0.5, '#FFB347'); skyGrad.addColorStop(1, '#FFE4B5');
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, cw, ch * 0.4);
    ctx.fillStyle = '#4A90A4'; ctx.fillRect(0, ch * 0.4, cw, ch * 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3;
    for (let y = ch * 0.45; y < ch; y += 38) { ctx.beginPath(); for (let x = 0; x < cw; x += 5) { const waveY = y + Math.sin((x + this.time * 90) / 75) * 9; x === 0 ? ctx.moveTo(x, waveY) : ctx.lineTo(x, waveY); } ctx.stroke(); }
    const t = Math.min(1, (this.caughtTimer - CONFIG.caught.animationDuration) / 1.0);
    // 提示框在鱼下方：鱼中心 y 从 ch*0.5 改为 ch*0.75
    const fishY = ch * 0.35 - t * ch * 0.15; const fishScale = 0.5 + t * 0.5;
    ctx.save(); ctx.translate(cw / 2, fishY); ctx.scale(fishScale, fishScale);
    ctx.fillStyle = fish.color; ctx.beginPath(); ctx.ellipse(0, 0, 120, 60, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-105, 0); ctx.lineTo(-165, -45); ctx.lineTo(-165, 45); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -45); ctx.lineTo(-30, -90); ctx.lineTo(45, -60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(75, -15, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(79, -15, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 提示框放到屏幕正中央
    const boxW = 450; const boxH = 210; const boxX = (cw - boxW) / 2; const boxY = (ch - boxH) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4; ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 42px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.fillText('🎉 钓到了!', cw / 2, boxY + 45);
    ctx.fillStyle = '#FFF'; ctx.font = "36px 'TencentSansW7', sans-serif"; ctx.fillText(fish.name, cw / 2, boxY + 90);
    ctx.fillStyle = '#4FC3F7'; ctx.font = "28px 'TencentSansW7', sans-serif"; ctx.fillText('★'.repeat(fish.rarity), cw / 2, boxY + 125);
    ctx.fillStyle = '#AAA'; ctx.font = "24px 'TencentSansW7', sans-serif"; ctx.fillText(`尺寸: ${this.caughtFishSize}cm  价格: $${fish.price}`, cw / 2, boxY + 165);
    // 按空格键再次抛竿提示
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 26px 'TencentSansW7', sans-serif"; ctx.fillText('按 [空格] 再次抛竿', cw / 2, boxY + 195); ctx.textAlign = 'left';
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
    ctx.fillStyle = '#FFD700'; ctx.font = "bold 48px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🐟 跑鱼了!', cw / 2, panelY + 60);
    
    // 原因消息（翻页显示）
    ctx.fillStyle = '#FFF'; ctx.font = "32px 'TencentSansW7', sans-serif";
    ctx.fillText(msg, cw / 2, panelY + 130);
    
    // 确认提示：[空格] 键高亮
    ctx.font = "bold 28px 'TencentSansW7', sans-serif";
    const confirmLeft = '请按 '; const confirmKey = '[空格]'; const confirmRight = ' 确认';
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
    ctx.fillStyle = '#AAA'; ctx.font = "20px 'TencentSansW7', sans-serif";
    ctx.fillText('确认后重新抛竿', cw / 2, panelY + 255);
    
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _renderIdleHint() {
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    // 屏幕正中间的提示框
    const hintW = 400; const hintH = 120; const hintX = (cw - hintW) / 2; const hintY = (ch - hintH) / 2 + 60;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.roundRect(hintX, hintY, hintW, hintH, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
    // "按住 " + "[空格]" + " 键抛竿" 分段渲染，[空格] 键高亮
    const line1 = '按住 ';
    const key1 = '[空格]';
    const line1r = ' 键抛竿';
    const baseY = hintY + hintH / 2 - 15;
    ctx.font = "bold 36px 'TencentSansW7', sans-serif";
    const l1W = ctx.measureText(line1).width;
    const k1W = ctx.measureText(key1).width;
    const l1rW = ctx.measureText(line1r).width;
    const startX1 = cw / 2 - (l1W + k1W + l1rW) / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFD700'; ctx.fillText(line1, startX1, baseY);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(key1, startX1 + l1W, baseY);
    ctx.fillStyle = '#00FF88'; ctx.fillText(key1, startX1 + l1W, baseY);
    ctx.fillStyle = '#FFD700'; ctx.fillText(line1r, startX1 + l1W + k1W, baseY);
    ctx.fillStyle = '#AAA'; ctx.font = "22px 'TencentSansW7', sans-serif";
    ctx.textAlign = 'center'; ctx.fillText('长按蓄力，松手抛竿', cw / 2, hintY + hintH / 2 + 30);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _renderTaskProgress() {
    if (!this.questParams || !this.questParams.target) return;
    const ctx = this.ctx; const cw = this.cw;
    const isQ002 = this.questParams.questId === 'q002';
    const x = cw - 220; const y = 30; const w = 200;
    // 根据 q002 项目数动态计算高度
    let itemCount = 0;
    if (isQ002 && this.questParams.detail) {
      itemCount = this.questParams.detail.split(/\s+/).filter(Boolean).length;
    }
    const h = isQ002 ? (55 + itemCount * 26) : 60;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.font = "bold 22px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center';
    ctx.fillText(`🎯 ${this.questParams.target} ${this.questParams.progress || 0}/${this.questParams.need}`, x + w / 2, y + 30); ctx.textAlign = 'left';
    // q002 显示详细鱼种进度（每行一个，竖向排列）
    if (isQ002 && this.questParams.detail) {
      ctx.fillStyle = '#AAA'; ctx.font = "14px 'TencentSansW7', sans-serif";
      const items = this.questParams.detail.split(/\s+/).filter(Boolean);
      const lineH = 26;
      const startY = y + 55;
      for (let i = 0; i < items.length; i++) {
        ctx.fillText(items[i], x + 16, startY + i * lineH);
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
    const ctx = this.ctx; const cw = this.cw; const ch = this.ch;
    // 纯水下视角：水草从屏幕底部生长
    const bottomY = ch * 0.92;
    const weedPositions = [cw * 0.04, cw * 0.10, cw * 0.16, cw * 0.22, cw * 0.30, cw * 0.36, cw * 0.42, cw * 0.50, cw * 0.56, cw * 0.62, cw * 0.68, cw * 0.74, cw * 0.80, cw * 0.86, cw * 0.92];
    const heights = [110, 160, 100, 140, 90, 130, 110, 150, 100, 140, 90, 130, 110, 140, 100];
    const colors = ['#1B5E20', '#2E7D32', '#388E3C', '#1B5E20', '#43A047', '#2E7D32', '#388E3C', '#1B5E20', '#2E7D32', '#388E3C', '#1B5E20', '#43A047', '#2E7D32', '#388E3C', '#1B5E20'];
    for (let i = 0; i < weedPositions.length; i++) {
      const wx = weedPositions[i];
      const wh = heights[i];
      ctx.save();
      ctx.translate(wx, bottomY);
      for (let j = 0; j < 3; j++) {
        const bladeX = (j - 1) * 7;
        const sway = Math.sin(this.time * 1.5 + i * 1.3 + j * 0.8) * 8;
        const curve = Math.sin(this.time * 1.1 + i * 0.9 + j * 0.5) * 5;
        ctx.beginPath();
        ctx.strokeStyle = colors[i]; ctx.lineWidth = 3;
        ctx.moveTo(bladeX, 0);
        ctx.quadraticCurveTo(bladeX + sway, -wh * 0.5, bladeX + sway + curve, -wh);
        ctx.stroke();
        // 叶片
        const leafAngle = Math.sin(this.time * 1.3 + i + j) * 0.25;
        ctx.save(); ctx.translate(bladeX + sway + curve * 0.8, -wh * 0.7); ctx.rotate(leafAngle);
        ctx.beginPath(); ctx.ellipse(0, 0, 4, 10, 0.4, 0, Math.PI * 2); ctx.fillStyle = colors[i]; ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
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
    ctx.fillStyle = '#FFF'; ctx.font = "bold 36px 'TencentSansW7', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✅ 任务目标达成！按 R 返回村庄', cw / 2, ch / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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