// 村庄场景模块（720p HD · 20x11 tile）

import SceneManager from './scene-manager.js';
import { NPCS } from './data/npcs.js';
import { DIALOGUES } from './data/dialogues.js';
import dialogueSystem from './dialogue-system.js';
import AudioSystem from './audio-system.js';
import questSystem from './quest-system.js';
import { QUESTS } from './data/quests.js';
import { InventoryUI } from './ui/inventory-ui.js';
import { CoinHUD } from './ui/coin-hud.js';
import { CodexUI } from './ui/codex-ui.js';
import { ShopUI } from './ui/shop-ui.js';
import {
  drawDuskSky, getGrassTile, drawLakeWaves,
  drawBuildingShadow, drawGoldRim, drawDuskOverlay,
  drawWoodenDock, drawFishingRipple, drawFountain, drawDistantMountains
} from './render/dusk-effects.js';
import { PALETTE } from './render/palette.js';
import { drawChiefHouse, drawFishingShop, drawAmingHome, draw711Store } from './render/buildings.js';
import {
  drawAming, drawXiulan, drawVillageChief, drawLin, drawXiaofang
} from './render/characters.js';
import { drawLakeReflections } from './render/reflections.js';
import { drawNameTag } from './render/name-tag.js';
import { drawFarmland } from './render/farmland.js';
import {
  drawDynamicSky, drawDynamicOverlay,
  getFireflyBrightness, getWindowBrightness,
  setDayNightPhaseSpeed, setDayNightPhaseOffset, getDayNightPhase,
  getDayNightPhaseName
} from './render/day-night.js';
import { drawFireflies } from './render/fireflies.js';

// ============================================================
// ArrowGuide - 新手引导箭头类
// ============================================================
class ArrowGuide {
  constructor(scene) {
    this.scene = scene;
    this.targetTile = null;
    this.visible = false;
    this.bobPhase = 0;
  }

  setTarget(tx, ty, label) {
    this.targetTile = { x: tx, y: ty, label };
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this.targetTile = null;
  }

  update(player) {
    if (!this.visible || !this.targetTile) return;
    const dx = this.targetTile.x - Math.floor(player.px / 64);
    const dy = this.targetTile.y - Math.floor(player.py / 64);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 2.5) this.hide();
    this.bobPhase += 0.1;
  }

  render(ctx, player) {
    if (!this.visible || !this.targetTile) return;

    const dx = (this.targetTile.x * 64 + 32) - player.px;
    const dy = (this.targetTile.y * 64 + 32) - player.py;
    const angle = Math.atan2(dy, dx);
    const bobY = Math.sin(this.bobPhase) * 4;

    const arrowX = player.px;
    const arrowY = player.py - 45 + bobY;

    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.rotate(angle);
    ctx.scale(0.6, 0.6);
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#3D2B1F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (this.targetTile.label) {
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.font = '14px "Cubic 11", "Noto Sans TC", monospace';
      ctx.textAlign = 'center';
      ctx.strokeText(this.targetTile.label, arrowX, arrowY - 18);
      ctx.fillText(this.targetTile.label, arrowX, arrowY - 18);
    }
  }
}

// ============================================================
// TILE 定义
// ============================================================
const TILE = {
  GRASS: 0,
  DIRT: 1,
  STONE: 2,
  WOOD: 3,
  SHALLOW: 4,
  DEEP: 5,
  ROOF: 6,
  WALL: 7,
  TREE: 8,
  FISHING: 9
};

const WALKABLE = new Set([TILE.GRASS, TILE.DIRT, TILE.STONE, TILE.WOOD, TILE.FISHING]);

const BUILDINGS = [
  { tx: 4, ty: 1, name: '村长家' },
  { tx: 13, ty: 1, name: '钓具店' },
  { tx: 1, ty: 4, name: '阿明家' },
  { tx: 15, ty: 4, name: '7-11' }
];

// 开场旁白文本
const INTRO_NARRATIONS = [
  '在台湾东海岸的小渔村——水社村',
  '住着一个叫阿明的少年',
  '他从小就跟着爷爷学钓鱼',
  '今天，是他第一次独立钓鱼的日子...'
];

// ============================================================
// VillageScene
// ============================================================
class VillageScene {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.cw = 1280;
    this.ch = 720;

    this.player = {
      tx: 4, ty: 5,
      px: 0, py: 0,
      direction: 'down',
      frame: 0,
      speed: 3
    };

    this.keys = { up: false, down: false, left: false, right: false };
    this.villageMap = [];
    this.npcs = [];

    this.rafId = null;
    this.paused = false;
    this.lastTime = 0;
    this.frameCount = 0;
    this.fps = 60;
    this.fpsTimer = 0;
    this.time = 0;
    this.animTimer = 0;

    this.debug = false;
    this.showGrid = false;
    this.questPanelOpen = false;
    this._audioStarted = false;
    this.onFishingSpot = false;
    this._lastPhase = -1;    // 上一帧昼夜相位（用于检测时段变化）
    this._lastPhaseText = ''; // 上一帧时段文字
    this.footsteps = 0; // 脚步声计数器


    // ── 主角头顶名字标签配置 ──────────────────────────────
    this.playerNameConfig = {
      enabled: true,               // 是否显示名字
      text: '阿明',               // 名字文本
    };

    // FPS 滑动窗口（60帧均值）
    this.fpsHistory = [];
    this._keyHandler = null;
    this._keyUpHandler = null;

    this.autoTriggered = false;

    // 开场状态
    this.introState = null; // 'narration' | 'title' | 'fadein' | null
    this.introTimer = 0;
    this.currentNarrLine = 0;
    this.narrOpacity = 0;
    this.btnPulse = 0; // 按钮闪烁计时器

    // 操作提示卡
    this.tutorialCardActive = false;

    // 引导箭头
    this.arrow = null;

    // 背包 & 金币 HUD
    this.inventoryUI = null;
    this.coinHUD = null;

    // 图鉴 UI
    this.codexUI = null;

    // 钓具店 UI
    this.shopUI = null;
  }

  // 初始化
  init(params) {
    this._generateMap();

    const spawn = params?.spawnAt || { x: 4, y: 5 };
    this.player.tx = spawn.x;
    this.player.ty = spawn.y;
    this._syncPlayerPixel();

    this.player.direction = 'down';
    this.player.frame = 0;

    this.npcs = NPCS.map(n => ({
      ...n,
      px: n.x * 64 + 16,   // 角色宽 32px，左边缘对齐 tile + 16
      py: n.y * 64 + 16,   // 角色高 48px，脚底在 tile 顶边 + 48
      bobOffset: 0
    }));

    // ── 防御：进入村庄时检查秀兰对话是否已触发过 ────────
    // 若 mom_auto_triggered=true，说明首次对话已显示过，本次不再触发
    if (window.Save?.get('flags.mom_auto_triggered')) {
      this.autoTriggered = true; // 阻止 setTimeout 触发对话
    } else {
      this.autoTriggered = false;
    }

    const container = document.getElementById('village-scene');
    container.innerHTML = '';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cw;
    this.canvas.height = this.ch;
    this.canvas.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.webkitImageSmoothingEnabled = false;

    // 初始化引导箭头
    this.arrow = new ArrowGuide(this);

    // 初始化背包 UI & 金币 HUD
    this.inventoryUI = new InventoryUI(this.canvas, window.inventory);
    this.coinHUD = new CoinHUD(window.inventory);

    // 初始化图鉴 UI
    this.codexUI = new CodexUI(this.canvas, window.codex);

    // 初始化钓具店 UI
    this.shopUI = new ShopUI(this.canvas, window.inventory, window.equipment, questSystem);

    this._bindInput();
  }

  // 启动
  start() {
    this.paused = false;
    this.lastTime = performance.now();
    this.fpsTimer = 0;
    this.frameCount = 0;
    this.autoTriggered = false;
    this.questPanelOpen = false;
    this.introState = null;
    this.introTimer = 0;
    this.currentNarrLine = 0;
    this.narrOpacity = 0;
    this.tutorialCardActive = false;

    const introPlayed = window.Save?.get('flags.intro_played') || false;
    if (!introPlayed) {
      this._startIntroSequence();
    } else {
      // 非开场场景：始终确保村庄 BGM 播放（从钓鱼场景返回时 BGM 可能已停止）
      this._audioStarted = true;
      AudioSystem.init();
      AudioSystem.playBGM('music/village_bgm.mp3');
      const momAutoTriggered = window.Save?.get('flags.mom_auto_triggered') || false;
      if (!momAutoTriggered) {
        setTimeout(() => {
          if (!this.autoTriggered) {
            this.autoTriggered = true;
            this._startMomDialog();
          }
        }, 800);
      } else {
        this._updateArrowState();
      }
    }

    // q002 完成 + 图鉴 5/5 彩蛋
    if (!this._codexEasterEggBound) {
      this._codexEasterEggBound = true;
      questSystem.on('quest_completed', ({ questId }) => {
        if (questId === 'q002' && window.codex && window.codex.getUnlockedCount() >= 5) {
          this._showRewardToast('🏆 水社村图鉴大师！');
        }
      });
    }

    this._loop();
  }

  // 开场序列
  _startIntroSequence() {
    this.introState = 'narration';
    this.introTimer = 0;
    this.currentNarrLine = 0;
    this.narrOpacity = 0;
    this._updateNarrOpacity();
  }

  _updateNarrOpacity() {
    const lineIdx = this.currentNarrLine;
    const lineDuration = 2.0; // 每句2秒
    const fadeInTime = 0.4;
    const fadeOutTime = 0.4;
    const stayTime = lineDuration - fadeInTime - fadeOutTime;

    const elapsed = this.introTimer % lineDuration;

    if (elapsed < fadeInTime) {
      this.narrOpacity = elapsed / fadeInTime;
    } else if (elapsed < fadeInTime + stayTime) {
      this.narrOpacity = 1;
    } else {
      this.narrOpacity = 1 - (elapsed - fadeInTime - stayTime) / fadeOutTime;
    }
    this.narrOpacity = Math.max(0, Math.min(1, this.narrOpacity));
  }

  _nextNarrLine() {
    this.currentNarrLine++;
    if (this.currentNarrLine >= INTRO_NARRATIONS.length) {
      this.introState = 'title';
      this.introTimer = 0;
    } else {
      this.introTimer = Math.floor(this.introTimer / 2) * 2; // 保持在整句
    }
  }

  _skipIntro() {
    window.Save?.set('flags.intro_played', true);
    window.Save?.commit();

    this.introState = null;
    
    // 跳过时播放 BGM
    if (!this._audioStarted) {
      this._audioStarted = true;
      AudioSystem.init();
      AudioSystem.playBGM('music/village_bgm.mp3');
    }

    setTimeout(() => {
      if (!this.autoTriggered) {
        this.autoTriggered = true;
        this._startMomDialog();
      }
    }, 400);

    this._updateArrowState();
  }

  _startTitleCard() {
    this.introState = 'title';
    this.introTimer = 0;
  }

  _showTitleCard(ctx, cw, ch) {
    const elapsed = this.introTimer;

    let opacity = 0;
    if (elapsed < 0.4) {
      opacity = elapsed / 0.4;
    } else if (elapsed >= 1.6) {
      opacity = 1 - (elapsed - 1.6) / 0.4;
    } else {
      opacity = 1;
    }
    opacity = Math.max(0, Math.min(1, opacity));

    if (opacity <= 0) return;

    ctx.globalAlpha = opacity;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);

    ctx.fillStyle = '#A83C3C';
    ctx.font = 'bold 96px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('宝岛钓手', cw / 2, ch / 2 - 60);

    ctx.fillStyle = '#3D2B1F';
    ctx.font = '48px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('～ 水社村 ～', cw / 2, ch / 2 + 30);

    ctx.fillStyle = '#A83C3C';
    ctx.fillRect(cw / 2 - 120, ch / 2 + 70, 240, 4);

    ctx.fillStyle = '#888';
    ctx.font = '16px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('v1.1 · 720p HD', 20, ch - 40);
    ctx.textAlign = 'right';
    ctx.fillText('出品人: Aidendeng', cw - 20, ch - 40);
    ctx.textAlign = 'center';

    // 开始游戏按钮
    const btnW = 220, btnH = 56;
    const btnX = cw / 2 - btnW / 2;
    const btnY = ch / 2 + 100;

    // 缓慢呼吸闪烁效果（周期约3秒）
    const pulse = Math.sin(this.btnPulse * 2.1) * 0.5 + 0.5; // 0~1
    const btnAlpha = 0.12 + pulse * 0.18; // 填充透明度 0.12~0.30
    const borderAlpha = 0.5 + pulse * 0.5; // 边框透明度 0.5~1.0

    // 按钮背景（绿色边框 + 半透明填充，带呼吸效果）
    ctx.fillStyle = `rgba(76, 175, 80, ${btnAlpha})`;
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = `rgba(76, 175, 80, ${borderAlpha})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    // 按钮文字（带呼吸效果）
    ctx.fillStyle = `rgba(76, 175, 80, ${0.6 + pulse * 0.4})`;
    ctx.font = 'bold 24px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('开始游戏', cw / 2, btnY + btnH / 2);

    // 提示文字
    ctx.fillStyle = '#888';
    ctx.font = '14px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('点击按钮或按空格键开始', cw / 2, btnY + btnH + 24);

    ctx.globalAlpha = 1;
  }

  _fadeInScene() {
    this.introState = 'fadein';
    this.introTimer = 0;
    // 标题切换时尝试播放 BGM
    if (!this._audioStarted) {
      this._audioStarted = true;
      AudioSystem.init();
      AudioSystem.playBGM('music/village_bgm.mp3');
    }
  }

  // 开始妈妈对话
  _startMomDialog() {
    dialogueSystem.start('mom_first_meet', {
      onEnd: () => {
        window.Save?.set('flags.mom_auto_triggered', true);
        window.Save?.commit();

        if (window.Save?.get('flags.tutorial_card_shown') !== true) {
          this._showTutorialCard();
        } else {
          this._updateArrowState();
        }
      }
    });
  }

  // 显示操作提示卡
  _showTutorialCard() {
    this.tutorialCardActive = true;
    AudioSystem.playMenuOpen();
  }

  _hideTutorialCard() {
    this.tutorialCardActive = false;
    this.paused = false;
    AudioSystem.playMenuClose();
    window.Save?.set('flags.tutorial_card_shown', true);
    window.Save?.commit();
    this._updateArrowState();
  }

  // 更新箭头状态
  _updateArrowState() {
    // 教程卡片显示期间不显示箭头
    if (!window.Save?.get('flags.tutorial_card_shown')) {
      this.arrow.hide();
      return;
    }

    // 从 NPCS 数据中动态获取 NPC 坐标
    const _npcPos = (id) => {
      const npc = NPCS.find(n => n.id === id);
      return npc ? { x: npc.x, y: npc.y } : null;
    };

    // q002 优先（getStatus 会在 q001 未完成时返回 'not_started'）
    const q002Status = questSystem.getStatus('q002');
    if (q002Status === 'active') {
      const q002 = questSystem.getQuest('q002');
      const isComplete = q002 && QUESTS.q002.isComplete(q002.progress);
      if (isComplete) {
        const pos = _npcPos('xiaofang');
        if (pos) this.arrow.setTarget(pos.x, pos.y, '✅ 回找小芳');
      } else {
        this.arrow.setTarget(10, 9, '→ 钓点');
      }
      return;
    }
    if (q002Status === 'available_to_complete') {
      const pos = _npcPos('xiaofang');
      if (pos) this.arrow.setTarget(pos.x, pos.y, '✅ 回找小芳');
      return;
    }

    // q003 逻辑
    const q003Status = questSystem.getStatus('q003');
    if (q003Status === 'active') {
      const q003 = questSystem.getQuest('q003');
      const isComplete = q003 && QUESTS.q003.isComplete(q003.progress);
      if (isComplete) {
        const pos = _npcPos('master_lin');
        if (pos) this.arrow.setTarget(pos.x, pos.y, '✅ 回找林师傅');
      } else {
        this.arrow.setTarget(10, 9, '→ 钓点');
      }
      return;
    }
    if (q003Status === 'available_to_complete') {
      const pos = _npcPos('master_lin');
      if (pos) this.arrow.setTarget(pos.x, pos.y, '✅ 回找林师傅');
      return;
    }

    // q001 逻辑
    const q = questSystem.getStatus('q001_first_fish');
    if (q === 'not_started') {
      const pos = _npcPos('chief');
      if (pos) this.arrow.setTarget(pos.x, pos.y, '→ 村长');
      return;
    }
    if (q === 'active') {
      this.arrow.setTarget(10, 9, '→ 钓点');
      return;
    }
    if (q === 'available_to_complete') {
      const pos = _npcPos('chief');
      if (pos) this.arrow.setTarget(pos.x, pos.y, '✅ 交任务');
      return;
    }

    this.arrow.hide();
  }

  // 暂停
  pause() {
    this.paused = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  // 恢复
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this._loop();
  }

  // 销毁
  destroy() {
    this.pause();
    this._unbindInput();
    AudioSystem.stopAmbient();
    AudioSystem.stopBGM();
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
  }

  // ========================================================
  // 地图生成
  // ========================================================
  _generateMap() {
    const COLS = 20;
    const ROWS = 11;

    this.villageMap = [];
    for (let y = 0; y < ROWS; y++) {
      this.villageMap[y] = [];
      for (let x = 0; x < COLS; x++) {
        this.villageMap[y][x] = TILE.GRASS;
      }
    }

    for (let x = 0; x < COLS; x++) {
      this.villageMap[0][x] = TILE.TREE;
      this.villageMap[ROWS - 1][x] = TILE.TREE;
    }
    for (let y = 0; y < ROWS; y++) {
      this.villageMap[y][0] = TILE.TREE;
      this.villageMap[y][COLS - 1] = TILE.TREE;
    }

    for (let x = 1; x < COLS - 1; x++) {
      this.villageMap[9][x] = TILE.DEEP;
      this.villageMap[10][x] = TILE.DEEP;
    }

    this.villageMap[8][9] = TILE.WOOD;
    this.villageMap[8][10] = TILE.WOOD;
    this.villageMap[8][11] = TILE.WOOD;

    // 钓点扩大一倍：2x2 tile 区域
    this.villageMap[9][9] = TILE.FISHING;
    this.villageMap[9][10] = TILE.FISHING;
    this.villageMap[9][11] = TILE.FISHING;

    this.villageMap[1][4] = TILE.ROOF;
    this.villageMap[1][5] = TILE.ROOF;
    this.villageMap[2][4] = TILE.ROOF;
    this.villageMap[2][5] = TILE.ROOF;

    this.villageMap[1][13] = TILE.ROOF;
    this.villageMap[1][14] = TILE.ROOF;
    this.villageMap[2][13] = TILE.ROOF;
    this.villageMap[2][14] = TILE.ROOF;

    this.villageMap[4][1] = TILE.ROOF;
    this.villageMap[4][2] = TILE.ROOF;
    this.villageMap[5][1] = TILE.ROOF;
    this.villageMap[5][2] = TILE.ROOF;

    this.villageMap[4][15] = TILE.ROOF;
    this.villageMap[4][16] = TILE.ROOF;
    this.villageMap[5][15] = TILE.ROOF;
    this.villageMap[5][16] = TILE.ROOF;

    this.villageMap[2][8] = TILE.STONE;
    this.villageMap[2][9] = TILE.STONE;
    this.villageMap[3][8] = TILE.STONE;
    this.villageMap[3][9] = TILE.STONE;

    for (let x = 3; x <= 14; x++) {
      if (this.villageMap[5][x] === TILE.GRASS) {
        this.villageMap[5][x] = TILE.DIRT;
      }
    }

    for (let y = 2; y <= 8; y++) {
      if (this.villageMap[y][8] === TILE.GRASS) {
        this.villageMap[y][8] = TILE.DIRT;
      }
    }

    this.villageMap[1][2] = TILE.TREE;
    this.villageMap[1][17] = TILE.TREE;
    this.villageMap[8][1] = TILE.TREE;
    this.villageMap[8][2] = TILE.TREE;
    this.villageMap[8][17] = TILE.TREE;
    this.villageMap[8][18] = TILE.TREE;
  }

  // ========================================================
  // 输入处理
  // ========================================================
  _bindInput() {
    this._keyHandler = (e) => {
      const k = e.key.toLowerCase();

      // 开场中按空格键跳过（仅限标题画面）
      if (this.introState === 'title' && k === ' ') {
        this._skipIntro();
        return;
      }
      // 旁白阶段按ESC跳过
      if (this.introState === 'narration' && k === 'escape') {
        this._skipIntro();
        return;
      }

      // 操作提示卡按任意键关闭
      if (this.tutorialCardActive) {
        this._hideTutorialCard();
        return;
      }

      // 对话中拦截按键
      if (dialogueSystem.isActive()) {
        dialogueSystem.handleKey(k);
        return;
      }

      // 任务面板打开时拦截按键
      if (this.questPanelOpen) {
        if (k === 'q' || k === 'escape') {
          this.questPanelOpen = false;
          AudioSystem.playMenuClose();
        }
        return;
      }

      // 背包面板按键处理
      if (this.inventoryUI && this.inventoryUI.visible) {
        if (this.inventoryUI.handleKey(k)) return;
      }

      // 钓具店面板按键处理（优先于背包）
      if (this.shopUI && this.shopUI.visible) {
        if (this.shopUI.handleKey(k)) return;
      }

      // B 键打开背包（对话/任务面板关闭时才响应）
      if (!dialogueSystem.isActive() && !this.questPanelOpen && k === 'b') {
        if (this.inventoryUI) {
          this.inventoryUI.toggle();
          if (this.inventoryUI.visible) AudioSystem.playMenuOpen();
          else AudioSystem.playMenuClose();
        }
        return;
      }

      // 图鉴面板按键处理
      if (this.codexUI && this.codexUI.visible) {
        if (this.codexUI.handleKey(k)) return;
      }

      // T 键打开图鉴（对话/任务面板/背包关闭时才响应）
      if (!dialogueSystem.isActive() && !this.questPanelOpen && !(this.inventoryUI && this.inventoryUI.visible) && k === 't') {
        if (this.codexUI) {
          this.codexUI.toggle();
          if (this.codexUI.visible) AudioSystem.playMenuOpen();
          else AudioSystem.playMenuClose();
        }
        return;
      }

      // 调试快捷键（F1/F2/F3仅在调试模式下有效）
      if (this.debug) {
        if (k === 'f1') {
          this._debugCompleteQuest();
          return;
        }
        if (k === 'f2') {
          this._debugResetSave();
          return;
        }
        if (k === 'f3') {
          // q003 一键完成（调试）
          const q = questSystem.getQuest('q003');
          if (q && q.status === 'active') {
            q.progress.coinEarned = 300;
            q.progress.qiaozuiCaught = true;
            q.status = 'ready_to_turnin';
            window.Save?.set('quests.q003', q);
            window.Save?.commit();
            console.log('[DEBUG] q003 → ready_to_turnin');
            this._showQuestToast('q003 可交付（调试）');
          }
          return;
        }
        if (k === 'f4') {
          this._speedMult = (this._speedMult || 1) === 1 ? 10 : 1;
          setDayNightPhaseSpeed(this._speedMult);
          console.log('[Day/Night] speed:', this._speedMult + 'x');
          return;
        }
        if (k === 'f5') {
          // 强制跳到夜晚 phase=0.8
          setDayNightPhaseOffset(performance.now() * 0.8 - performance.now());
          setDayNightPhaseSpeed(1);
          console.log('[Day/Night] 跳转夜晚 phase=0.8');
          return;
        }
        // F6: 强制完成 q001
        if (k === 'f6') {
          const q = questSystem.getQuest('q001_first_fish');
          if (q) {
            q.status = 'completed';
            window.Save?.set('quests.q001_first_fish', q);
            window.Save?.commit();
            console.log('[DEBUG] q001 → completed');
            this._showQuestToast('q001 已完成（调试）');
          }
          return;
        }
        // F7: 强制 q002 可交付
        if (k === 'f7') {
          const q = questSystem.getQuest('q002');
          if (q) {
            q.progress = { 奇力鱼: true, 罗非鱼: true, 曲腰鱼: true, 翘嘴鲌: true, 鲤鱼: true };
            q.status = 'active';
            window.Save?.set('quests.q002', q);
            window.Save?.commit();
            console.log('[DEBUG] q002 → ready_to_turnin');
            this._showQuestToast('q002 可交付（调试）');
          }
          return;
        }
        // F8: 重置所有任务
        if (k === 'f8') {
          window.Save?.set('quests', {});
          window.Save?.commit();
          console.log('[DEBUG] 所有任务已重置');
          this._showQuestToast('任务已重置（调试）');
          return;
        }
        // F9: 解锁全部图鉴
        if (k === 'f9') {
          if (window.codex) {
            window.codex.getAllSpecies().forEach(sp => {
              window.codex.onFishCaught({ species: sp, size: 99 });
            });
            console.log('[DEBUG] 图鉴全解锁');
            this._showQuestToast('图鉴全解锁（调试）');
          }
          return;
        }
        // F10: 重置图鉴
        if (k === 'f10') {
          if (window.codex) {
            window.codex.player.codex = {};
            window.codex.save.commit();
            console.log('[DEBUG] 图鉴已重置');
            this._showQuestToast('图鉴已重置（调试）');
          }
          return;
        }
        // F11: 装备碳素竿（测试）
        if (k === 'f11') {
          if (window.inventory && window.equipment) {
            window.inventory.add('carbon_rod', 1);
            window.equipment.equipRod('carbon_rod');
            console.log('[DEBUG] 已装备碳素钓竿');
            this._showQuestToast('已装备碳素钓竿（调试）');
          }
          return;
        }
        // F12: 给 500 金（测试）
        if (k === 'f12') {
          if (window.inventory) {
            window.inventory.addCoin(500);
            console.log('[DEBUG] +500 金');
            this._showQuestToast('+500 金（调试）');
          }
          return;
        }
      }

      if (k === 'arrowup' || k === 'w') this.keys.up = true;
      else if (k === 'arrowdown' || k === 's') this.keys.down = true;
      else if (k === 'arrowleft' || k === 'a') this.keys.left = true;
      else if (k === 'arrowright' || k === 'd') this.keys.right = true;
      else if (k === '`') { this.debug = !this.debug; this._updateDebugBar(); }
      else if (k === 'g') this.showGrid = !this.showGrid;
      else if (k === 'q') { this.questPanelOpen = true; AudioSystem.playMenuOpen(); }
      else if (k === 'p' && !this.debug) this._resetGame();
      else if (k === 'e') this._tryInteract();
      else if (k === 'f') this._tryFishing();
      else if (k === 'm') {
        AudioSystem.init();
        const muted = AudioSystem.toggleMute();
        // 飘字提示（复用到 main.js 的 showMuteToast）
        if (window.showMuteToast) window.showMuteToast(muted);
      }
    };

    this._keyUpHandler = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') this.keys.up = false;
      else if (k === 'arrowdown' || k === 's') this.keys.down = false;
      else if (k === 'arrowleft' || k === 'a') this.keys.left = false;
      else if (k === 'arrowright' || k === 'd') this.keys.right = false;
    };

    // 点击"开始游戏"按钮（仅响应鼠标左键）
    this._clickHandler = (e) => {
      if (this.introState === 'title' && e.button === 0) {
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const btnW = 220, btnH = 56;
        const btnX = cw / 2 - btnW / 2;
        const btnY = ch / 2 + 100;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
          this._skipIntro();
        }
      }
    };

    document.addEventListener('keydown', this._keyHandler);
    document.addEventListener('keyup', this._keyUpHandler);
    this.canvas.addEventListener('click', this._clickHandler);
  }

  _unbindInput() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      document.removeEventListener('keyup', this._keyUpHandler);
      this._keyHandler = null;
      this._keyUpHandler = null;
    }
    if (this._clickHandler && this.canvas) {
      this.canvas.removeEventListener('click', this._clickHandler);
      this._clickHandler = null;
    }
  }

  _updateDebugBar() {
    const bar = document.getElementById('debug-bar');
    if (bar) bar.style.display = this.debug ? 'block' : 'none';
  }

  // 调试功能
  _debugCompleteQuest() {
    const q = window.Save?.get('quests.q001_first_fish');
    if (q) {
      q.target.count = q.target.need;
      q.status = 'available_to_complete';
      window.Save?.set('quests.q001_first_fish', q);
      window.Save?.commit();
      this._updateArrowState();
    }
  }

  _debugResetSave() {
    window.Save?.reset();
    window.location.reload();
  }

  _debugSkipIntro() {
    window.Save?.set('flags.intro_played', true);
    window.Save?.set('flags.mom_auto_triggered', true);
    window.Save?.set('flags.tutorial_card_shown', true);
    window.Save?.commit();
    window.location.reload();
  }

  // ========================================================
  // 游戏重置
  // ========================================================
  _resetGame() {
    this.pause();
    // 清除所有存档数据
    window.Save?.reset();
    // 重新加载页面
    window.location.reload();
  }

  // ========================================================
  // 钓鱼入口
  // ========================================================
  _tryFishing() {
    if (!this.onFishingSpot) return;

    const q001 = window.Save?.get('quests.q001_first_fish');
    const q002 = window.Save?.get('quests.q002');

    let params = { spot: 'shuishe', target: '奇力鱼', need: 3, progress: 0 };

    // q001 进行中：显示 q001 任务条件
    if (q001 && q001.status === 'active') {
      params.progress = q001.progress?.count || 0;
    }
    // q002 进行中：显示 q002 任务条件（5种鱼图鉴）
    else if (q002 && q002.status === 'active') {
      const got = Object.values(q002.progress || {}).filter(v => v).length;
      params = {
        spot: 'shuishe',
        questId: 'q002',
        target: '潭中百味',
        need: 5,
        progress: got,
        detail: QUESTS.q002.getDetailText(q002.progress)
      };
    }

    this.pause();
    SceneManager.switchTo('fishing', params);
  }

  // ========================================================
  // NPC 互动
  // ========================================================
  _tryInteract() {
    if (dialogueSystem.isActive()) return;

    let nearestNpc = null;
    let nearestDist = Infinity;

    for (const npc of this.npcs) {
      const dx = this.player.px - npc.px;
      const dy = this.player.py - npc.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const tileDist = dist / 64;

      if (tileDist <= 1.5 && dist < nearestDist) {
        nearestDist = dist;
        nearestNpc = npc;
      }
    }

    if (nearestNpc) {
      this._startNpcDialog(nearestNpc);
    }
  }

  _startNpcDialog(npc) {
    let dialogId = npc.defaultDialog;

    if (npc.id === 'chief') {
      const status = questSystem.getStatus('q001_first_fish');
      if (status === 'not_started') {
        dialogId = 'chief_quest_offer';
      } else if (status === 'active') {
        dialogId = 'chief_quest_progress';
      } else if (status === 'available_to_complete') {
        dialogId = 'chief_quest_complete';
      } else {
        dialogId = 'chief_default';
      }
    }

    // 小芳 q002 分支
    if (npc.id === 'xiaofang') {
      this._interactXiaofang();
      return;
    }

    // 林师傅 q003 分支
    if (npc.id === 'master_lin') {
      this._interactLin();
      return;
    }

    const dialog = DIALOGUES[dialogId];
    if (dialog) {
      dialogueSystem.start(dialogId);
    }
  }

  // 小芳互动逻辑（q002 状态分支）
  _interactXiaofang() {
    const q001 = questSystem.getQuest('q001_first_fish');
    const q002 = questSystem.getQuest('q002');

    // q002 已完成 → 闲聊
    if (q002 && q002.status === 'completed') {
      dialogueSystem.start('xiaofang_q002_done');
      return;
    }

    // q002 可交付（active 且完成 或 ready_to_turnin）
    const q002Ready = q002 && (q002.status === 'active' && QUESTS.q002.isComplete(q002.progress));
    if (q002Ready || (q002 && q002.status === 'ready_to_turnin')) {
      dialogueSystem.start('xiaofang_q002_ready', {
        onEnd: () => {
          questSystem.complete('q002');
          this._showRewardToast('+200 金 / 高级鱼饵 ×3');
          this.arrow.hide();
        }
      });
      return;
    }

    // q002 进行中 → 显示进度
    if (q002 && q002.status === 'active') {
      const detail = QUESTS.q002.getDetailText(q002.progress);
      dialogueSystem.start('xiaofang_q002_progress', {
        replacements: { q002_detail: detail }
      });
      return;
    }

    // q001 已完成 → 提供 q002
    if (q001 && q001.status === 'completed') {
      dialogueSystem.start('xiaofang_offer_q002', {
        onEnd: () => {
          questSystem.accept('q002');
          this._showQuestToast('接受任务：潭中百味');
          this._updateArrowState();
        }
      });
      return;
    }

    // q001 未完成 → 闲聊
    dialogueSystem.start('xiaofang_idle');
  }

  // 林师傅互动逻辑（q003 状态分支）
  _interactLin() {
    const q002 = questSystem.getQuest('q002');
    const q003 = questSystem.getQuest('q003');

    // q003 完成 → 开店模式
    if (q003 && q003.status === 'completed') {
      dialogueSystem.start('lin_shop', {
        onEnd: () => { if (this.shopUI) this.shopUI.openLinShop(); }
      });
      return;
    }

    // q003 可交付
    if (q003 && q003.status === 'ready_to_turnin') {
      dialogueSystem.start('lin_q003_ready', {
        onEnd: () => {
          questSystem.complete('q003');
          this._showRewardToast('+200 金 / 竹制钓竿 ×1');
          // 自动装备竹制钓竿
          if (window.equipment) {
            window.equipment.equipRod('bamboo_rod');
          }
          this._showQuestToast('🎣 自动装备：竹制钓竿');
          this._updateArrowState();
        }
      });
      return;
    }

    // q003 进行中 → 进度对话 + 直接打开卖鱼界面
    if (q003 && q003.status === 'active') {
      const detail = QUESTS.q003.getDetailText(q003.progress);
      dialogueSystem.start('lin_q003_progress', {
        replacements: { q003_detail: detail.replace(/\n/g, '；') },
        onEnd: () => { if (this.shopUI) this.shopUI.openLinShop(); }
      });
      return;
    }

    // q002 完成 → 提供 q003
    if (q002 && q002.status === 'completed' && !q003) {
      dialogueSystem.start('lin_offer_q003', {
        onEnd: () => {
          questSystem.accept('q003');
          this._showQuestToast('接受任务：林师傅的考验');
          this._updateArrowState();
        }
      });
      return;
    }

    // q002 未完成 → 闲聊
    dialogueSystem.start('lin_idle');
  }

  // 奖励飘字
  _showRewardToast(text) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `
      position: fixed;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 16px 32px;
      background: rgba(0,0,0,0.8);
      color: #FFD700;
      font: bold 32px "Cubic 11","Noto Sans TC",sans-serif;
      border: 3px solid #FFD700;
      border-radius: 10px;
      z-index: 500;
      pointer-events: none;
      animation: rewardToastFade 2s ease-out forwards;
    `;
    document.body.appendChild(div);
    if (!document.getElementById('reward-toast-style')) {
      const style = document.createElement('style');
      style.id = 'reward-toast-style';
      style.textContent = `
        @keyframes rewardToastFade {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          20%  { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -70%); }
        }
      `;
      document.head.appendChild(style);
    }
    setTimeout(() => div.remove(), 2000);
  }

  // 任务接受飘字
  _showQuestToast(text) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `
      position: fixed;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 16px 32px;
      background: rgba(0,0,0,0.8);
      color: #7CFC00;
      font: bold 28px "Cubic 11","Noto Sans TC",sans-serif;
      border: 3px solid #7CFC00;
      border-radius: 10px;
      z-index: 500;
      pointer-events: none;
      animation: rewardToastFade 2s ease-out forwards;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
  }

  // ========================================================
  // 玩家像素坐标同步
  // ========================================================
  _syncPlayerPixel() {
    this.player.px = this.player.tx * 64 + 32;
    this.player.py = this.player.ty * 64 + 24;
  }

  // ========================================================
  // 碰撞检测
  // ========================================================
  _getTileAt(tx, ty) {
    if (ty < 0 || ty >= 11 || tx < 0 || tx >= 20) return TILE.TREE;
    return this.villageMap[ty][tx];
  }

  _canMoveTo(tx, ty) {
    return WALKABLE.has(this._getTileAt(tx, ty));
  }

  _update(dt) {
    this.time += dt;

    // 昼夜时段飘字提示
    this._checkDayNightPhase();

    // 开场更新
    if (this.introState) {
      this._updateIntro(dt);
      return;
    }

    // 操作提示卡期间锁定
    if (this.tutorialCardActive) {
      return;
    }

    // 对话中锁定玩家移动
    if (dialogueSystem.isActive()) {
      dialogueSystem.update(dt);
      return;
    }

    if (this.questPanelOpen) {
      return;
    }

    // 背包面板打开时锁定移动
    if (this.inventoryUI && this.inventoryUI.visible) {
      this.coinHUD.update(dt);
      return;
    }

    // 图鉴面板打开时锁定移动
    if (this.codexUI && this.codexUI.visible) {
      this.coinHUD.update(dt);
      return;
    }

    // 钓具店面板打开时锁定移动
    if (this.shopUI && this.shopUI.visible) {
      this.coinHUD.update(dt);
      return;
    }

    // 金币 HUD 更新
    if (this.coinHUD) this.coinHUD.update(dt);
    let dx = 0, dy = 0;
    if (this.keys.up) dy -= 1;
    if (this.keys.down) dy += 1;
    if (this.keys.left) dx -= 1;
    if (this.keys.right) dx += 1;

    if (dx !== 0 && dy !== 0) {
      const norm = 0.707;
      dx *= norm;
      dy *= norm;
    }

    const speed = this.player.speed;
    const moving = dx !== 0 || dy !== 0;

    if (dy < 0) this.player.direction = 'up';
    else if (dy > 0) this.player.direction = 'down';
    else if (dx < 0) this.player.direction = 'left';
    else if (dx > 0) this.player.direction = 'right';

    if (moving) {
      const nextPx = this.player.px + dx * speed;
      const nextPy = this.player.py + dy * speed;

      const hbCx = nextPx;
      const hbCy = nextPy + 24;
      const hbHalf = 8;

      const txX = Math.floor(hbCx / 64);
      const tyMinX = Math.floor((hbCy - hbHalf) / 64);
      const tyMaxX = Math.floor((hbCy + hbHalf - 1) / 64);
      const canX = this._canMoveTo(txX, tyMinX) && this._canMoveTo(txX, tyMaxX);

      const txMinY = Math.floor((hbCx - hbHalf) / 64);
      const txMaxY = Math.floor((hbCx + hbHalf - 1) / 64);
      const tyY = Math.floor(hbCy / 64);
      const canY = this._canMoveTo(txMinY, tyY) && this._canMoveTo(txMaxY, tyY);

      if (canX) this.player.px = nextPx;
      if (canY) this.player.py = nextPy;

      this.animTimer += dt;
      if (this.animTimer >= 0.125) {
        this.animTimer = 0;
        this.player.frame = (this.player.frame + 1) % 3;
        // 脚步声
        this.footsteps++;
        if (this.footsteps % 2 === 0) AudioSystem.playFootstep();
      }
    } else {
      this.player.frame = 0;
      this.animTimer = 0;
    }

    this.player.tx = Math.floor(this.player.px / 64);
    this.player.ty = Math.floor((this.player.py + 24) / 64);
    if (this.player.tx < 0) this.player.tx = 0;
    if (this.player.tx >= 20) this.player.tx = 19;
    if (this.player.ty < 0) this.player.ty = 0;
    if (this.player.ty >= 11) this.player.ty = 10;

    // 钓点扩大：2x2 区域 (9-10, 9-10)
    this.onFishingSpot = (
      this.player.tx >= 9 && this.player.tx <= 10 &&
      this.player.ty >= 9 && this.player.ty <= 10
    );

    for (const npc of this.npcs) {
      npc.bobOffset = Math.sin(this.time * 10) * 2;
    }

    // 更新箭头状态
    this._updateArrowState();
    this.arrow.update(this.player);

    // FPS 计算
    this.fpsTimer += dt;
    this.frameCount++;
    if (this.fpsTimer >= 1.0) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }
  }

  // 开场更新
  _updateIntro(dt) {
    this.introTimer += dt;

    // 用户首次交互时初始化并播放 BGM
    if (!this._audioStarted && (this.keys.up || this.keys.down || this.keys.left || this.keys.right)) {
      this._audioStarted = true;
      AudioSystem.init();
      AudioSystem.playBGM('music/village_bgm.mp3');
    }

    if (this.introState === 'narration') {
      this._updateNarrOpacity();

      const lineDuration = 2.0;
      if (this.introTimer >= (this.currentNarrLine + 1) * lineDuration) {
        this._nextNarrLine();
      }
    } else if (this.introState === 'title') {
      // 标题画面无限停留，直到用户点击按钮或按键才进入淡入
      // 更新按钮闪烁计时器
      this.btnPulse += dt;
    } else if (this.introState === 'fadein') {
      if (this.introTimer >= 0.6) {
        this.introState = null;
        // 开场动画结束后播放 BGM
        if (!this._audioStarted) {
          this._audioStarted = true;
          AudioSystem.init();
          AudioSystem.playBGM('music/village_bgm.mp3');
        }
        setTimeout(() => {
          if (!this.autoTriggered) {
            this.autoTriggered = true;
            this._startMomDialog();
          }
        }, 800);
      }
    }
  }

  // ========================================================
  // 渲染
  // ========================================================
  _render() {
    const ctx = this.ctx;
    const cw = this.cw;
    const ch = this.ch;

    // 渲染开场序列
    if (this.introState) {
      this._renderIntro(ctx, cw, ch);
      return;
    }

    // Layer 0: 动态天空（黄昏→夜晚）⭐ Phase C
    drawDynamicSky(ctx, this.time * 1000);

    // Layer 0.5: 远山剪影 ⭐ Phase B 新增
    drawDistantMountains(ctx);

    // Layer 1: 地图层（草地用噪点 tile）
    this._renderMap();

    // Layer 1.4: 湖面倒影 ⭐ Phase C 新增
    drawLakeReflections(ctx, this.time * 1000);

    // Layer 1.5: 湖面波纹
    drawLakeWaves(ctx, this.time * 1000);

    // Layer 2: 建筑长投影（在建筑下方）
    const T = 64;
    BUILDINGS.forEach(b => {
      const bx = b.tx * T;
      const by = (b.ty + 3) * T;
      drawBuildingShadow(ctx, bx, by, 128, 128);
    });

    // Layer 3: 建筑（差异化绘制）
    const now = performance.now();
    drawChiefHouse(ctx,  4*64, (1+3)*64);
    drawFishingShop(ctx, 13*64, (1+3)*64);
    drawAmingHome(ctx,   1*64, (4+3)*64, now);
    draw711Store(ctx,   15*64, (4+3)*64, now);

    // Layer 3.5: 建筑描金边（保留夕阳侧光强化）
    BUILDINGS.forEach(b => {
      const bx = b.tx * T;
      const by = (b.ty + 3) * T;
      drawGoldRim(ctx, bx, by, 128, 128);
    });

    // Layer 4: 装饰物
    drawWoodenDock(ctx);                          // ⭐ 栈桥木纹
    drawFountain(ctx, 544, 160, this.time * 1000);  // ⭐ 喷泉水花
    this._renderDecorations();

    // Layer 5: NPC
    this._renderNPCs();

    // Layer 6: 玩家
    this._renderPlayer();

    // Layer 6.5: 钓点波纹 ⭐ Phase B 新增（玩家之后）
    // 2x2 钓点，在两个中心位置绘制波纹
    drawFishingRipple(ctx, 9*64+32, 9*64+32, this.time * 1000);
    drawFishingRipple(ctx, 10*64+32, 9*64+32, this.time * 1000 + 600);

    // Layer 7: 引导箭头、交互提示、小地图、任务HUD
    this.arrow.render(ctx, this.player);
    this._renderInteractionHints();
    this._renderFishingHint();
    this._renderQuestHUD();
    this._renderMinimap();

    // 调试信息
    if (this.debug) this._renderDebug();
    if (this.showGrid) this._renderGrid();

    // 金币 HUD（常驻）
    if (this.coinHUD) this.coinHUD.render(ctx);

    // 背包面板（覆盖层）
    if (this.inventoryUI) this.inventoryUI.render(ctx);

    // 图鉴面板（覆盖层）
    if (this.codexUI) this.codexUI.render(ctx);

    // 钓具店面板（覆盖层）
    if (this.shopUI) this.shopUI.render(ctx);

    // Layer 7.5: 萤火虫（UI 之前、滤镜之前）⭐ Phase C
    drawFireflies(ctx, this.time * 1000, getFireflyBrightness(this.time * 1000));

    // Layer 8: 全局动态滤镜（在所有场景元素之后、对话框之前）⭐ Phase C
    drawDynamicOverlay(ctx, this.time * 1000);

    // Layer 9: UI 面板
    if (this.questPanelOpen) this._renderQuestPanel();
    if (this.tutorialCardActive) this._renderTutorialCard(ctx, cw, ch);
    dialogueSystem.render(ctx);
  }

  // 渲染开场
  _renderIntro(ctx, cw, ch) {
    if (this.introState === 'narration') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);

      ctx.globalAlpha = this.narrOpacity;
      ctx.fillStyle = '#F4E4C1';
      ctx.font = '48px "Cubic 11", "Noto Sans TC", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(INTRO_NARRATIONS[this.currentNarrLine], cw / 2, ch / 2);
      ctx.globalAlpha = 1;

    } else if (this.introState === 'title') {
      this._showTitleCard(ctx, cw, ch);

    } else if (this.introState === 'fadein') {
      const progress = this.introTimer / 0.6;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);

      if (progress > 0.3) {
        const sceneOpacity = (progress - 0.3) / 0.7;
        ctx.globalAlpha = sceneOpacity;

        drawDuskSky(ctx);
        this._renderMap();
        this._renderBuildings();

        ctx.globalAlpha = 1;
      }
    }
  }

  // 渲染操作提示卡
  _renderTutorialCard(ctx, cw, ch) {
    // 全屏遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, cw, ch);

    const cardW = 720;
    const cardH = 480;
    const cardX = (cw - cardW) / 2;
    const cardY = (ch - cardH) / 2;

    // 外层边框（深栗褐）
    ctx.fillStyle = '#3D2B1F';
    ctx.beginPath();
    ctx.roundRect(cardX - 6, cardY - 6, cardW + 12, cardH + 12, 16);
    ctx.fill();

    // 内层边框（红色）
    ctx.fillStyle = '#A83C3C';
    ctx.beginPath();
    ctx.roundRect(cardX - 2, cardY - 2, cardW + 4, cardH + 4, 14);
    ctx.fill();

    // 米白底
    ctx.fillStyle = '#F4E4C1';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 12);
    ctx.fill();

    // 标题栏（红底）
    ctx.fillStyle = '#A83C3C';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, 64, [12, 12, 0, 0]);
    ctx.fill();

    // 标题文字
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📖 操作指南', cardX + cardW / 2, cardY + 32);

    // 操作说明
    const items = [
      { icon: '⌨️', text: 'WASD / 方向键    →  移动角色' },
      { icon: '💬', text: 'E 键              →  与人物互动' },
      { icon: '📋', text: 'Q 键              →  打开任务面板' },
      { icon: '🎒', text: 'B 键              →  打开背包' },
      { icon: '📖', text: 'T 键              →  打开图鉴 ⭐' },
      { icon: '🎣', text: 'F 键（钓点）      →  开始钓鱼' },
      { icon: '⏭️', text: 'ESC               →  跳过对话' }
    ];

    let y = cardY + 110;
    ctx.font = '32px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3D2B1F';

    items.forEach((item, idx) => {
      ctx.fillStyle = '#3D2B1F';
      ctx.fillText(item.icon, cardX + 60, y + idx * 56);
      ctx.fillText(item.text, cardX + 120, y + idx * 56);
    });

    // 底部提示
    ctx.fillStyle = '#888888';
    ctx.font = '28px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('按 任意键 关闭', cardX + cardW / 2, cardY + cardH - 40);
  }

  // 绘制单个 tile 颜色（原渲染逻辑保留）
  _drawTileColor(ctx, tile, px, py) {
    switch (tile) {
      case TILE.GRASS: ctx.fillStyle = '#5C8A4C'; break;
      case TILE.DIRT: ctx.fillStyle = '#C9A876'; break;
      case TILE.STONE: ctx.fillStyle = '#9A9590'; break;
      case TILE.WOOD: ctx.fillStyle = '#8B5A3C'; break;
      case TILE.SHALLOW: ctx.fillStyle = '#7AB8C4'; break;
      case TILE.DEEP: ctx.fillStyle = '#2B4F6B'; break;
      case TILE.ROOF: ctx.fillStyle = '#A83C3C'; break;
      case TILE.WALL: ctx.fillStyle = '#F4E4C1'; break;
      case TILE.TREE: ctx.fillStyle = '#3D2B1F'; break;
      case TILE.FISHING: ctx.fillStyle = '#7AB8C4'; break;
      default: ctx.fillStyle = '#5C8A4C';
    }
    ctx.fillRect(px, py, 64, 64);

    if (tile === TILE.WOOD) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(px, py + 16 * i + 8);
        ctx.lineTo(px + 64, py + 16 * i + 8);
        ctx.stroke();
      }
    }

    if (tile === TILE.FISHING) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      ctx.strokeStyle = `rgba(255,255,255,${pulse * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px + 32, py + 32, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.3 + pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(px + 32, py + 32, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tile === TILE.GRASS) {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 3; i++) {
        const gx = px + 10 + i * 20;
        const gy = py + 20 + (i % 2) * 25;
        ctx.fillRect(gx, gy, 2, 8);
      }
    }
  }

  _renderMap() {
    const ctx = this.ctx;
    const T = 64;

    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 20; x++) {
        const tile = this.villageMap[y][x];
        const px = x * T;
        const py = y * T;

        if (tile === TILE.GRASS) {
          ctx.drawImage(getGrassTile(), px, py);
        } else {
          this._drawTileColor(ctx, tile, px, py);
        }
      }
    }

    // 左上红色色块 → 菜苗农田（覆盖 ROOF tiles at [1][4],[1][5],[2][4],[2][5]）
    drawFarmland(ctx, 4 * T, 1 * T, 2 * T, 2 * T);
  }

  // 建筑渲染已移至 Layer 3（见 render 方法中的直接调用）

  _renderDecorations() {
    const ctx = this.ctx;
    const T = 64;

    const fx = 8.5 * T;
    const fy = 2.5 * T;

    ctx.fillStyle = '#7AB8C4';
    ctx.beginPath();
    ctx.arc(fx, fy, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#5D8A9A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(fx, fy, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(fx, fy, 8, 0, Math.PI * 2);
    ctx.fill();

    const dropOffset = (this.time % 1) * 16;
    ctx.fillStyle = `rgba(255,255,255,${1 - dropOffset / 16})`;
    ctx.beginPath();
    ctx.arc(fx, fy - dropOffset, 4, 0, Math.PI * 2);
    ctx.fill();

    // 静态树木（无动画）
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌳', 8 * T + 32, 8 * T + 32);
    ctx.fillText('🌳', 12 * T + 32, 8 * T + 32);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // 任务进度 HUD（右上角）
  _renderQuestHUD() {
    const ctx = this.ctx;
    const x = 900;
    let y = 18;

    // q001 active / 可交付 时显示
    const q001 = questSystem.getQuest('q001_first_fish');
    if (q001 && (q001.status === 'active' || q001.status === 'available_to_complete')) {
      const count = q001.progress?.count || 0;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, 360, 36);
      ctx.fillStyle = '#FFD700';
      ctx.font = '20px "Cubic 11","Noto Sans TC",monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🎯 奇力鱼 ${count}/3`, x + 12, y + 20);
      y += 44;
    }

    // q002 active/ready 时显示
    const q002 = questSystem.getQuest('q002');
    if (q002 && (q002.status === 'active' || q002.status === 'ready_to_turnin')) {
      const text = QUESTS.q002.getProgressText(q002.progress);
      const isReady = q002.status === 'ready_to_turnin' ||
        (q002.status === 'active' && QUESTS.q002.isComplete(q002.progress));
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, 360, 36);
      ctx.fillStyle = isReady ? '#7CFC00' : '#FFD700';
      ctx.font = '20px "Cubic 11","Noto Sans TC",monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 12, y + 20);
      y += 44;
    }

    // q003 active/ready 时显示
    const q003 = questSystem.getQuest('q003');
    if (q003 && (q003.status === 'active' || q003.status === 'ready_to_turnin')) {
      const text = QUESTS.q003.getProgressText(q003.progress);
      const isReady = q003.status === 'ready_to_turnin' ||
        (q003.status === 'active' && QUESTS.q003.isComplete(q003.progress));
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, 360, 36);
      ctx.fillStyle = isReady ? '#7CFC00' : '#FFD700';
      ctx.font = '20px "Cubic 11","Noto Sans TC",monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 12, y + 20);
    }
  }

  _renderNPCs() {
    const ctx = this.ctx;
    const time = this.time * 1000;

    // 从 this.npcs 读取正确坐标，映射到对应的渲染函数
    const drawMap = { mom: drawXiulan, chief: drawVillageChief, master_lin: drawLin, xiaofang: drawXiaofang };

    this.npcs.forEach(npc => {
      const drawFn = drawMap[npc.id];
      if (drawFn) {
        drawFn(ctx, npc.px, npc.py, npc.facing || 'down', time);
      }
      // NPC 头顶名字标签
      if (!dialogueSystem.isActive()) {
        drawNameTag(ctx, npc.px + 16, npc.py - 8, npc.name);
      }
    });

    // 保留任务标记（角色宽32px，中心在 px+16）
    for (const npc of this.npcs) {
      const cx = npc.px + 16;
      const py = npc.py + npc.bobOffset;
      this._renderNPCMarker(ctx, npc, cx, py - 28);
    }
  }

  _renderNPCMarker(ctx, npc, cx, y) {
    if (!npc.questId) return;

    const status = questSystem.getStatus(npc.questId);
    let icon = null;
    let color = null;

    if (status === 'not_started') {
      // q002 有前置依赖（q001），q001 未完成前不显示任何标记
      if (npc.questId === 'q002') {
        const preQ = window.Save?.get('quests.q001_first_fish');
        if (!preQ || preQ.status !== 'completed') return;
      }
      // q003 有前置依赖（q002），q002 未完成前不显示任何标记
      if (npc.questId === 'q003') {
        const preQ = window.Save?.get('quests.q002');
        if (!preQ || preQ.status !== 'completed') return;
      }
      icon = '!';
      color = '#FFD700';
    } else if (status === 'active') {
      icon = '?';
      color = '#FFD700';
    } else if (status === 'available_to_complete') {
      icon = '✓';
      color = '#FFD700';
    } else if (status === 'completed') {
      return;
    } else if (status === 'not_started') {
      icon = '!';
      color = '#FFD700';
    }

    if (icon) {
      ctx.font = 'bold 48px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 描边效果
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(icon, cx, y);
      // 所有标记统一使用黄色
      ctx.fillStyle = '#FFD700';
      ctx.fillText(icon, cx, y);
    }
  }

  // 主角头顶名字标签
  _renderPlayerNameTag() {
    if (dialogueSystem.isActive()) return;
    const cfg = this.playerNameConfig;
    if (!cfg || !cfg.enabled) return;
    drawNameTag(this.ctx, this.player.px + 16, this.player.py - 8, cfg.text);
  }

  _renderPlayer() {
    const ctx = this.ctx;
    const time = this.time * 1000;
    const isMoving = this.keys.up || this.keys.down || this.keys.left || this.keys.right;
    drawAming(ctx, this.player.px, this.player.py, this.player.direction, time, isMoving);
    // Layer 6.2: 主角头顶名字标签（Billboard，最高层）
    this._renderPlayerNameTag();
  }

  _renderInteractionHints() {
    if (dialogueSystem.isActive()) return;

    const ctx = this.ctx;

    for (const npc of this.npcs) {
      const dx = this.player.px - npc.px;
      const dy = this.player.py - npc.py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const tileDist = dist / 64;

      if (tileDist <= 1.5) {
        const hintX = npc.px + 16;   // 角色中心 x
        const hintY = npc.py - 40 + npc.bobOffset;

        ctx.fillStyle = '#E8C84C';
        ctx.beginPath();
        ctx.arc(hintX, hintY, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#3D2B1F';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#3D2B1F';
        ctx.font = 'bold 20px "Cubic 11", "Noto Sans TC", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('E', hintX, hintY);
      }
    }
  }

  _renderFishingHint() {
    if (!this.onFishingSpot || dialogueSystem.isActive()) return;

    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 680, 1280, 40);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎣 按 F 开始钓鱼', 640, 700);
  }

  _renderMinimap() {
    const ctx = this.ctx;
    const mapX = 980;
    const mapY = 28;
    const mapW = 288;
    const mapH = 162;
    const tileW = 14.4;
    const tileH = 14.72;
    const centerX = mapX + mapW / 2;
    const centerY = mapY + mapH / 2;
    const radius = Math.min(mapW, mapH) / 2;

    // 投影效果
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 圆形裁剪区域
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(mapX, mapY, mapW, mapH);

    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 20; x++) {
        const tile = this.villageMap[y][x];
        let color = '#5C8A4C';
        switch (tile) {
          case TILE.GRASS: color = '#5C8A4C'; break;
          case TILE.DIRT: color = '#C9A876'; break;
          case TILE.STONE: color = '#9A9590'; break;
          case TILE.WOOD: color = '#8B5A3C'; break;
          case TILE.DEEP: color = '#2B4F6B'; break;
          case TILE.FISHING: color = '#7AB8C4'; break;
          case TILE.ROOF: color = '#A83C3C'; break;
          case TILE.TREE: color = '#3D2B1F'; break;
          default: color = '#3D2B1F';
        }

        ctx.fillStyle = color;
        ctx.fillRect(mapX + x * tileW, mapY + y * tileH, tileW - 1, tileH - 1);
      }
    }

    for (const npc of this.npcs) {
      const nx = mapX + npc.x * tileW + tileW / 2;
      const ny = mapY + npc.y * tileH + tileH / 2;

      if (!npc.questId) continue;

      const status = questSystem.getStatus(npc.questId);
      let color = '#888';
      let pulse = 0;

      if (status === 'not_started') {
        // q002 有前置依赖，q001 未完成前不在小地图显示标记
        if (npc.questId === 'q002') {
          const preQ = window.Save?.get('quests.q001_first_fish');
          if (!preQ || preQ.status !== 'completed') continue;
        }
        // q003 有前置依赖，q002 未完成前不在小地图显示标记
        if (npc.questId === 'q003') {
          const preQ = window.Save?.get('quests.q002');
          if (!preQ || preQ.status !== 'completed') continue;
        }
        color = '#E8C84C';
      }
      else if (status === 'active') color = '#888';
      else if (status === 'available_to_complete') {
        color = '#5C8A4C';
        pulse = Math.sin(this.time * 4) * 2;
      } else continue;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(nx, ny, 4 + pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    const q001Status = questSystem.getStatus('q001_first_fish');
    if (q001Status === 'active' || q001Status === 'available_to_complete') {
      const fx = mapX + 10 * tileW + tileW / 2;
      const fy = mapY + 9 * tileH + tileH / 2;
      const pulse = Math.sin(this.time * 4) * 2;

      ctx.fillStyle = '#7AB8C4';
      ctx.beginPath();
      ctx.arc(fx, fy, 4 + pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    const playerMapX = mapX + Math.floor(this.player.px / 64) * tileW + tileW / 2;
    const playerMapY = mapY + Math.floor((this.player.py + 24) / 64) * tileH + tileH / 2;

    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.arc(playerMapX, playerMapY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 圆形黑色描边
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 方向标记 (N/E/S/W)
    const dirSize = 16;
    const dirOffset = radius + 10;
    const dirs = [
      { label: 'N', x: 0, y: -dirOffset },
      { label: 'E', x: dirOffset, y: 0 },
      { label: 'S', x: 0, y: dirOffset },
      { label: 'W', x: -dirOffset, y: 0 }
    ];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px "Cubic 11", "Noto Sans TC", sans-serif';

    for (const d of dirs) {
      const dx = centerX + d.x;
      const dy = centerY + d.y;

      // 方形背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(dx - dirSize / 2, dy - dirSize / 2, dirSize, dirSize);

      // 方形边框
      ctx.strokeStyle = '#AAA';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx - dirSize / 2, dy - dirSize / 2, dirSize, dirSize);

      // 文字
      ctx.fillStyle = '#FFF';
      ctx.fillText(d.label, dx, dy + 1);
    }
  }

  _renderQuestPanel() {
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 1280, 720);

    const panelX = 340;
    const panelY = 160;
    const panelW = 600;
    const panelH = 400;

    ctx.fillStyle = '#F4E4C1';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.strokeStyle = '#3D2B1F';
    ctx.lineWidth = 4;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = '#3D2B1F';
    ctx.font = 'bold 40px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📋 任务面板', panelX + panelW / 2, panelY + 50);

    const activeQuests = questSystem.getActiveQuests();

    if (activeQuests.length === 0) {
      ctx.font = '28px "Cubic 11", "Noto Sans TC", monospace';
      ctx.fillStyle = '#888';
      ctx.fillText('暂无进行中的任务', panelX + panelW / 2, panelY + 200);
    } else {
      let y = panelY + 100;
      for (const q of activeQuests) {
        const tpl = window.QUESTS?.[q.id] || { name: q.id, description: '' };

        ctx.font = 'bold 24px "Cubic 11", "Noto Sans TC", monospace';
        ctx.fillStyle = '#3D2B1F';
        ctx.textAlign = 'left';
        ctx.fillText(tpl.name, panelX + 40, y);

        const status = questSystem.getStatus(q.id);
        let badgeColor = '#E8C84C';
        let badgeText = '进行中';
        if (status === 'available_to_complete') {
          badgeColor = '#5C8A4C';
          badgeText = '可交';
        }

        ctx.fillStyle = badgeColor;
        const badgeX = panelX + panelW - 120;
        ctx.fillRect(badgeX, y - 14, 80, 28);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 16px "Cubic 11", "Noto Sans TC", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, badgeX + 40, y + 1);

        y += 40;
        ctx.font = '20px "Cubic 11", "Noto Sans TC", monospace';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'left';
        const questTpl = QUESTS[q.id];
        if (q.id === 'q001_first_fish') {
          const cnt = q.progress?.count || 0;
          ctx.fillText(`奇力鱼 ${cnt}/3`, panelX + 40, y);
        } else if (questTpl && questTpl.getDetailText) {
          ctx.fillText(questTpl.getDetailText(q.progress), panelX + 40, y);
        }

        y += 60;
      }
    }

    ctx.font = '20px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.fillText('按 Q 关闭', panelX + panelW / 2, panelY + panelH - 30);
  }

  _renderDebug() {
    const ctx = this.ctx;
    const cw = this.cw;
    const ch = this.ch;
    const panelW = 280;
    const panelH = 420;
    const panelX = cw - panelW - 16;
    const panelY = 16;

    // 面板背景 + 投影
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.restore();

    // 边框
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let y = panelY + 12;

    // === 标题 ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px "Cubic 11", monospace';
    ctx.fillText('🐛 DEBUG MODE', panelX + 12, y);
    y += 28;

    // 分隔线
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 8, y);
    ctx.lineTo(panelX + panelW - 8, y);
    ctx.stroke();
    y += 12;

    // === 性能 ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px "Cubic 11", monospace';
    ctx.fillText('📊 性能', panelX + 12, y);
    y += 20;

    // FPS 滑动窗口均值
    const fps = this.fps;
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > 60) this.fpsHistory.shift();
    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

    ctx.fillStyle = '#0f0';
    ctx.font = '13px monospace';
    ctx.fillText(`FPS: ${fps.toFixed(0)} (avg ${avgFps.toFixed(1)})`, panelX + 16, y);
    y += 18;
    ctx.fillText(`Frame: ${(1000 / fps).toFixed(1)}ms`, panelX + 16, y);
    y += 18;
    ctx.fillText(`Time: ${this.time.toFixed(1)}s`, panelX + 16, y);
    y += 22;

    // 分隔线
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(panelX + 8, y);
    ctx.lineTo(panelX + panelW - 8, y);
    ctx.stroke();
    y += 12;

    // === 玩家 ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px "Cubic 11", monospace';
    ctx.fillText('🎮 玩家', panelX + 12, y);
    y += 20;

    ctx.fillStyle = '#0f0';
    ctx.font = '13px monospace';
    ctx.fillText(`Pos: (${Math.round(this.player.px)}, ${Math.round(this.player.py)}) px`, panelX + 16, y);
    y += 18;
    ctx.fillText(`Tile: (${this.player.tx}, ${this.player.ty})`, panelX + 16, y);
    y += 18;
    ctx.fillText(`Dir: ${this.player.direction}`, panelX + 16, y);
    y += 18;
    ctx.fillText(`Speed: ${this.player.speed} px/f`, panelX + 16, y);
    y += 22;

    // 分隔线
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(panelX + 8, y);
    ctx.lineTo(panelX + panelW - 8, y);
    ctx.stroke();
    y += 12;

    // === 任务 ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px "Cubic 11", monospace';
    ctx.fillText('📋 任务', panelX + 12, y);
    y += 20;

    const q001Status = questSystem.getStatus('q001_first_fish');
    const activeQuests = questSystem.getActiveQuests();
    let questInfo = '无';
    if (activeQuests.length > 0) {
      const q = activeQuests[0];
      questInfo = `${q.target.count}/${q.target.need}`;
    }

    ctx.fillStyle = '#0f0';
    ctx.font = '13px monospace';
    ctx.fillText(`q001: ${q001Status} (${questInfo})`, panelX + 16, y);
    y += 18;

    let arrowInfo = '隐藏';
    if (this.arrow.visible && this.arrow.targetTile) {
      arrowInfo = `→ (${this.arrow.targetTile.x}, ${this.arrow.targetTile.y})`;
    }
    ctx.fillText(`Arrow: ${arrowInfo}`, panelX + 16, y);
    y += 22;

    // 分隔线
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(panelX + 8, y);
    ctx.lineTo(panelX + panelW - 8, y);
    ctx.stroke();
    y += 12;

    // === 存档 ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px "Cubic 11", monospace';
    ctx.fillText('💾 存档', panelX + 12, y);
    y += 20;

    const money = window.Save?.get('player.money') || 0;
    const flags = Object.keys(window.Save?.get('flags') || {}).length;
    const readDialogues = (window.Save?.get('flags.readDialogues') || []).length;

    ctx.fillStyle = '#0f0';
    ctx.font = '13px monospace';
    ctx.fillText(`Money: $${money}`, panelX + 16, y);
    y += 18;
    ctx.fillText(`Flags: ${flags} 个`, panelX + 16, y);
    y += 18;
    ctx.fillText(`ReadDialogs: ${readDialogues} 条`, panelX + 16, y);
    y += 22;

    // 分隔线
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(panelX + 8, y);
    ctx.lineTo(panelX + panelW - 8, y);
    ctx.stroke();
    y += 12;

    // === 热键 ===
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px "Cubic 11", monospace';
    ctx.fillText('🔧 热键', panelX + 12, y);
    y += 20;

    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('F1 完成 F2 重置 F3 跳过', panelX + 16, y);
    y += 16;
    ctx.fillText('G 网格 M 静音 ESC 跳过', panelX + 16, y);

    // 碰撞箱（红色方块）
    const hbCx = this.player.px;
    const hbCy = this.player.py + 24;
    const hbHalf = 8;
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 1;
    ctx.strokeRect(hbCx - hbHalf, hbCy - hbHalf, 16, 16);
  }

  _renderGrid() {
    const ctx = this.ctx;
    const T = 64;

    ctx.strokeStyle = 'rgba(255,255,255,0.125)';
    ctx.lineWidth = 1;

    for (let y = 0; y <= 11; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * T);
      ctx.lineTo(1280, y * T);
      ctx.stroke();
    }

    for (let x = 0; x <= 20; x++) {
      ctx.beginPath();
      ctx.moveTo(x * T, 0);
      ctx.lineTo(x * T, 704);
      ctx.stroke();
    }

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const labels = [
      { x: 4, y: 5, text: 'P' },
      { x: 10, y: 9, text: 'F' },
      { x: 4, y: 2, text: '村长家' },
      { x: 13, y: 2, text: '钓具店' },
      { x: 15, y: 5, text: '7-11' }
    ];

    labels.forEach(l => {
      const bx = l.x * T + 2;
      const by = l.y * T + 2;
      const tw = ctx.measureText(l.text).width;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 2, by - 2, tw + 4, 16);
      ctx.fillStyle = '#FFFF00';
      ctx.fillText(l.text, bx, by);
    });
  }

  // ========================================================
  // 游戏循环
  // ========================================================
  _loop() {
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.1);

    // tutorialCardActive / 对话期间只渲染不更新逻辑，避免 player 漂移
    if (!this.paused) {
      this._update(dt);
    }
    this._render();

    this.rafId = requestAnimationFrame(() => this._loop());
  }

  // ========================================================
  // 昼夜时段飘字
  // ========================================================
  _getPhaseText(phase) {
    // 四阶段流转：黎明 → 白天 → 黄昏 → 夜晚
    if (phase < 0.05)  return '黎明破晓';
    if (phase < 0.10)  return '晨曦微露';
    if (phase < 0.15)  return '朝霞满天';
    if (phase < 0.25)  return '旭日东升';
    if (phase < 0.40)  return '晴空万里';
    if (phase < 0.50)  return '日正当中';
    if (phase < 0.55)  return '午后斜阳';
    if (phase < 0.60)  return '黄昏降临';
    if (phase < 0.65)  return '夕阳西下';
    if (phase < 0.70)  return '暮色渐浓';
    if (phase < 0.78)  return '华灯初上';
    if (phase < 0.85)  return '夜幕低垂';
    if (phase < 0.93)  return '星光满天';
    return '黎明将至';
  }

  _checkDayNightPhase() {
    // 开场/教程/对话期间不显示
    if (this.introState || this.tutorialCardActive || dialogueSystem.isActive()) return;

    const time = performance.now();
    const phase = getDayNightPhase(time);
    const text = this._getPhaseText(phase);

    // 跨越阈值时触发飘字（时段文字变化时触发）
    if (this._lastPhaseText && text !== this._lastPhaseText) {
      this.showPhaseToast(text);
    }
    this._lastPhase = phase;
    this._lastPhaseText = text;
  }

  showPhaseToast(text) {
    const old = document.getElementById('phase-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'phase-toast';
    toast.style.cssText = `
      position: fixed;
      top: 38%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 18px 36px;
      background: rgba(0,0,0,0.75);
      color: #FFD700;
      font: bold 28px "Cubic 11","Noto Sans TC",sans-serif;
      border: 3px solid #FFD700;
      border-radius: 12px;
      z-index: 300;
      pointer-events: none;
      text-shadow: 0 0 10px #FFD700;
      animation: phaseToastFade 2.5s ease-out forwards;
    `;
    toast.textContent = text;
    document.body.appendChild(toast);

    // 添加动画
    if (!document.getElementById('phase-toast-style')) {
      const style = document.createElement('style');
      style.id = 'phase-toast-style';
      style.textContent = `
        @keyframes phaseToastFade {
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
}

const villageScene = new VillageScene();
export default villageScene;