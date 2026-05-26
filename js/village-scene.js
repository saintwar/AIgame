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
import { StaminaHUD } from './ui/stamina-hud.js';
import { CodexUI } from './ui/codex-ui.js';
import { ShopUI } from './ui/shop-ui.js';
import { RestPanel } from './ui/rest-panel.js';
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
import { drawFlowerbed } from './render/flowerbed.js';
import diggingSystem from './digging-system.js';
import { drawTitleBg } from './render/title-bg.js';
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
      ctx.font = '14px "TencentSansW7", sans-serif';
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

// PHASE 13-6：钓鱼场景碰撞修复 —— FISHING tile 从"可走"移除，让三个圆圈（水波纹钓点）也成为碰撞墙
//   背景：旧版玩家能从栈桥 WOOD([8][9..11]) 一步迈到水中钓点 FISHING([9][9..11])，视觉是"人站湖里"，逻辑不合理
//   正确语义：栈桥（WOOD）才是合法站位 + 钓鱼触发区；湖水（DEEP）+ 钓点（FISHING）全部是不可达
//   ⚠️ WOOD（栈桥）依然可走 —— 玩家在栈桥上按 F 即可钓鱼，钓向南侧（y+1 行）的圆圈
const WALKABLE = new Set([TILE.GRASS, TILE.DIRT, TILE.STONE, TILE.WOOD]);

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
      // PHASE 13-9-fix：constructor 默认值与 init() 中 spawnAt fallback 同步为 (4, 7)
      //   真正生效的是 init() 第 ~243 行的 spawnAt fallback（前 2 仗失败的真正根因）
      //   这里仅作占位/兜底，避免后续误读
      tx: 4, ty: 7,
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
    this._loginBgmStarted = false; // 登录 BGM 幂等标记（仅 intro 阶段使用）
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
    this._btnHoverTarget = 0; // 0=离开, 1=悬停
    this._btnHover = 0;       // 平滑过渡值 (0→1)
    this._btnPressed = false; // 鼠标按下状态

    // 操作提示卡
    this.tutorialCardActive = false;

    // 引导箭头
    this.arrow = null;

    // 背包 & 金币 HUD
    this.inventoryUI = null;
    this.coinHUD = null;
    // PHASE 18 仗3 hotfix：体力 HUD（沿用钓鱼场景木牌+像素心形风格，左上角金币胶囊右侧）
    this.staminaHUD = null;
    // PHASE 18 仗3 hotfix：鼠标当前悬停的格子（用于 CD 倒计时按需显示）；null = 不在任何格上
    //   {tx, ty} — 由 _moveHandler 玩法分支末尾在"无面板"时更新；离开 canvas / 进面板 → 重置 null
    this._hoverTile = null;

    // 图鉴 UI
    this.codexUI = null;

    // 钓具店 UI
    this.shopUI = null;

    // PHASE 17 仗2：秀兰民宿弹窗 UI
    this.restPanel = null;
  }

  // 初始化
  init(params) {
    this._generateMap();

    // PHASE 13-9-fix：spawnAt 默认值 y: 5 → 7（前 2 仗失败的真正根因）
    //   旧 bug：13-8/13-9 改的是 constructor 中 this.player = { tx, ty } 的默认值，
    //          但 init() 此处会用 spawnAt 覆写！main.js 进入村庄时不传 spawnAt，
    //          就走 fallback {x:4, y:5} → 永远落在村长家墙身 [5][4] WALL 上 → 开局卡墙
    //   修复：把 fallback 的 y 从 5 改为 7（任务推荐 +2 格），落到 [7][4]=GRASS 安全格
    //         位置：村长家正南 2 格（屋檐外的草地），叙事上像"刚从家门口走出来"
    //   ⚠️ 同时同步 constructor 默认值（行 153~167）以保持代码一致，避免后续误读
    const spawn = params?.spawnAt || { x: 4, y: 7 };
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
    // PHASE 18 仗4 收尾【村庄 HUD v3 修复】：StaminaHUD 改用 ❤️ emoji 后，
    //   图标位置/文字起始与 CoinHUD 完全对齐 → 体力 HUD 宽 160 → 150 收回（emoji 系图标
    //   占用比像素心形小一圈，"100/100" 5 字符在 w=150 内充分容纳）。
    //   y=4 维持（顶部留 4px 草地呼吸边）；间距 8px 维持。
    this.coinHUD = new CoinHUD(window.inventory, { x: 20, y: 4, w: 180, h: 44 });
    this.staminaHUD = new StaminaHUD({ x: 208, y: 4, w: 150, h: 44 });
    // PHASE 18 仗5 - 仗1：游戏指南 HUD 按钮（紧邻 StaminaHUD 之后）
    //   几何：x=368(=208+150+10), y=4, w=180, h=44，与金币/体力木牌同高同 baseline
    //   命中区域 = 整块木牌；hover 时 _guideHUDHovered=true → 渲染高亮描边
    this._guideHUDRect = { x: 368, y: 4, w: 180, h: 44 };
    this._guideHUDHovered = false;
    // 操作提示卡 ✕ 关闭按钮（坐标在 _renderTutorialCard 内动态计算并写回此字段）
    this._tutorialCloseRect = null;
    this._tutorialCloseHovered = false;

    // 初始化图鉴 UI
    this.codexUI = new CodexUI(this.canvas, window.codex);

    // 初始化钓具店 UI
    this.shopUI = new ShopUI(this.canvas, window.inventory, window.equipment, questSystem);
    // PHASE 16-6 仗2：挂全局，供 dialogue-system 的 'openXiulanShop' / 'openLinBuyOnly' 协议调用
    window.shopUI = this.shopUI;

    // PHASE 17 仗2：秀兰民宿弹窗
    //   挂全局，供 dialogue-system 的 mom_menu 选项 callback 调用 window.restPanel.open()
    this.restPanel = new RestPanel(this.canvas, window.inventory);
    window.restPanel = this.restPanel;

    this._bindInput();

    // PHASE 16-4.8 仗1：鼠标点击寻路（仅村庄场景，钓鱼场景不挂）
    //   click-to-move.js 是 IIFE 已在 index.html 内 defer 加载完毕，
    //   通过 window.ClickToMove.attach(this) 把本场景实例（含 canvas/player/keys/
    //   _canMoveTo/_tryInteract/_showQuestToast）传过去。
    //   若 ClickToMove 缺失（CDN 失败或脚本未加载），守卫保证 WASD 零回归。
    if (window.ClickToMove && typeof window.ClickToMove.attach === 'function') {
      window.ClickToMove.attach(this);
    }
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
    // 判定是否"从其他场景返回村庄"（如钓鱼场景回村）：
    //   场景已 enter 过一次后，此后 start() 都是返场，应保持游戏内状态、不要再弹标题。
    //   首次硬刷新时 _hasEnteredVillage 不存在 → 一定走标题分支。
    const isReturning = !!this._hasEnteredVillage;
    this._hasEnteredVillage = true;

    if (!introPlayed) {
      // 全新存档：完整开场（旁白 → 标题）
      this._startIntroSequence();
    } else if (!isReturning) {
      // 老玩家、刚硬刷新：直接进入标题画面（"开始游戏"按钮），不放旁白。
      // 点按钮后 _skipIntro() 会统一处理 BGM、妈妈对话、箭头状态，与全新存档汇合。
      this._startTitleCard();
    } else {
      // 从其他场景（钓鱼等）返回村庄：恢复正常游戏状态，确保村庄 BGM 播放
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
    // 登录界面 BGM（旁白 + 标题阶段共用 login.mp3）
    //   AudioSystem.playBGM 内部已处理浏览器自动播放策略：
    //     - 首次手势前调用 → 挂起到 _pendingBGM，等首次 click/keydown 后自动播放
    //     - 用户点开始游戏（_skipIntro）时会 playBGM('village_bgm.mp3') → 内部 stopBGM 后无缝切歌
    this._playLoginBGM();
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

  async _skipIntro() {
    // PHASE 16-2 修复：进入正式游戏前先收集昵称（已有昵称会直接放行）
    //   - 防重入：弹窗期间多次点击/按键不重复触发
    //   - 弹窗期间不切换 introState，登录页保持显示与 BGM 不中断
    if (this._skipping) return;
    this._skipping = true;
    try {
      if (typeof window.ensureNickname === 'function') {
        await window.ensureNickname();
      }
    } catch (e) {
      console.error('[VillageScene] ensureNickname 出错（已忽略）:', e && e.message);
    }
    this._skipping = false;

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
    // 老存档跳过旁白直接进标题：同样需要登录 BGM
    this._playLoginBGM();
  }

  /**
   * 登录界面 BGM 播放（幂等）
   *   - 仅在 intro 阶段（旁白 + 标题）调用；_skipIntro 后会被 village_bgm 替换
   *   - 用 _loginBgmStarted 防同实例重复加载
   *   - PHASE 18 仗5：main.js bootstrap 已主动 playBGM('login.mp3') 把它挂起到
   *     _pendingBGM（玩家点击 splash 时自动播放），所以村庄进 intro 时若检测到
   *     AudioSystem 已经在播 / 已挂起 login.mp3，跳过本次调用以避免 stopBGM →
   *     重新加载导致的"咔"一下断音。
   */
  _playLoginBGM() {
    if (this._loginBgmStarted) return;
    this._loginBgmStarted = true;
    AudioSystem.init();
    // 幂等检测：main.js 已挂起 / 已播 login.mp3，不重复调用
    const curSrc = AudioSystem._bgmAudio && AudioSystem._bgmAudio.src;
    const pendSrc = AudioSystem._pendingBGM && AudioSystem._pendingBGM.src;
    if ((curSrc && curSrc.indexOf('login.mp3') >= 0) ||
        (pendSrc && pendSrc.indexOf('login.mp3') >= 0)) {
      return;
    }
    AudioSystem.playBGM('music/login.mp3');
  }

  _showTitleCard(ctx, cw, ch) {
    const elapsed = this.introTimer;

    let opacity = 0;
    if (elapsed < 0.4) {
      opacity = elapsed / 0.4;  // 前 0.4s 淡入
    } else {
      opacity = 1;              // 淡入后无限停留，直到玩家点击/按键
    }
    opacity = Math.max(0, Math.min(1, opacity));

    if (opacity <= 0) return;

    ctx.globalAlpha = opacity;

    // ── 像素吉卜力日月潭黄昏背景（替代纯白） ──
    drawTitleBg(ctx, cw, ch);

    // ── 标题动画：漂浮 + 金色光泽 ──────────────────────
    const floatY = Math.sin(this.btnPulse * Math.PI * 2 / 4) * (-8); // 4s 周期，8px 幅度
    const titleBaseY = ch / 2 - 60;
    const titleY = titleBaseY + floatY;
    const titleText = '宝岛钓手';

    ctx.font = 'bold 96px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(titleText).width;

    // 金色光泽：6s 周期，前 1.5s 扫过，后 4.5s 静止
    const shinePhase = this.btnPulse % 6;

    if (shinePhase < 1.5) {
      // 离屏 Canvas：先画文字，再用 source-atop 叠加光泽（精确裁剪到文字形状）
      if (!this._titleOffscreen) this._titleOffscreen = document.createElement('canvas');
      const oc = this._titleOffscreen;
      const ocW = Math.ceil(textWidth) + 20;
      const ocH = 116;
      oc.width = ocW;
      oc.height = ocH;
      const octx = oc.getContext('2d');
      octx.clearRect(0, 0, ocW, ocH);

      // ⚠️ 必须在绘制前设置字体（oc.width 重置了上下文，font 回到默认值）
      octx.font = 'bold 96px "TencentSansW7", sans-serif';
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';

      // 描边（深棕像素素描边，保证背景可读性）
      octx.strokeStyle = '#5C3A1E';
      octx.lineWidth = 4;
      octx.lineJoin = 'round';
      octx.strokeText(titleText, ocW / 2, ocH / 2);

      // 暖金高光（左上 1px 内描边，模拟光照）
      octx.strokeStyle = '#FFD580';
      octx.lineWidth = 1;
      octx.strokeText(titleText, ocW / 2 - 1, ocH / 2 - 1);

      // 基础文字（米白）
      octx.fillStyle = '#FFF4D6';
      octx.fillText(titleText, ocW / 2, ocH / 2);

      // 光泽渐变（120deg 斜向扫过）
      const progress = shinePhase / 1.5;
      const sweepX = -ocW * 0.3 + progress * ocW * 1.6;
      const shineBand = ocW * 0.35;
      const grad = octx.createLinearGradient(
        sweepX - shineBand, 0,
        sweepX + shineBand, ocH
      );
      grad.addColorStop(0, 'rgba(255,215,0,0)');
      grad.addColorStop(0.40, 'rgba(255,215,0,0)');
      grad.addColorStop(0.50, 'rgba(255,215,0,0.25)');
      grad.addColorStop(0.60, 'rgba(255,215,0,0)');
      grad.addColorStop(1, 'rgba(255,215,0,0)');

      octx.globalCompositeOperation = 'source-atop';
      octx.fillStyle = grad;
      octx.fillRect(0, 0, ocW, ocH);
      octx.globalCompositeOperation = 'source-over';

      ctx.drawImage(oc, cw / 2 - ocW / 2, titleY - ocH / 2);
    } else {
      ctx.strokeStyle = '#5C3A1E';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(titleText, cw / 2, titleY);
      // 暖金高光（左上 1px 内描边）
      ctx.strokeStyle = '#FFD580';
      ctx.lineWidth = 1;
      ctx.strokeText(titleText, cw / 2 - 1, titleY - 1);
      ctx.fillStyle = '#FFF4D6';
      ctx.fillText(titleText, cw / 2, titleY);
    }

    ctx.font = '48px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 副标题描边（深紫，保证在山脉背景上可读）
    ctx.strokeStyle = 'rgba(50, 30, 60, 0.6)';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeText('～ 水社村 ～', cw / 2, ch / 2 + 30);
    // 副标题阴影
    ctx.shadowColor = 'rgba(50, 30, 60, 0.95)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#FFF4E0';
    ctx.fillText('～ 水社村 ～', cw / 2, ch / 2 + 30);
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#A83C3C';
    ctx.fillRect(cw / 2 - 120, ch / 2 + 70, 240, 4);

    ctx.fillStyle = '#888';
    ctx.font = '16px "TencentSansW7", sans-serif';
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

    // 悬停动画参数
    const h = this._btnHover; // 0~1 平滑过渡
    const pressed = this._btnPressed && h > 0.3;
    const hoverLift = pressed ? -1 : h * -3;     // 悬停抬升 3px / 按下 1px
    const hoverScale = pressed ? 1.02 : 1 + h * 0.04; // 缩放 1.04 / 按下 1.02

    ctx.save();
    // 以按钮中心为缩放原点
    const btnCX = btnX + btnW / 2;
    const btnCY = btnY + btnH / 2;
    ctx.translate(btnCX, btnCY + hoverLift);
    ctx.scale(hoverScale, hoverScale);
    ctx.translate(-btnCX, -btnCY);

    // 按钮背景（半透明深色 + 亮金边框，带呼吸效果）
    const bgAlpha = 0.65 + pulse * 0.10 + h * 0.10;
    ctx.fillStyle = `rgba(${15 + h * 5}, ${15 + h * 5}, ${35 + h * 5}, ${bgAlpha})`;
    ctx.fillRect(btnX, btnY, btnW, btnH);

    // 边框
    const borderBright = pressed ? 0.9 : (0.7 + pulse * 0.3 + h * 0.15);
    const borderColor = h > 0.3 ? '#FFE08A' : `rgba(255, 209, 102, ${borderBright})`;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3 + h;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    // 金色光晕（悬停时扩散）
    ctx.shadowColor = `rgba(255, 209, 102, ${0.3 + h * 0.3})`;
    ctx.shadowBlur = 16 + h * 32;
    ctx.strokeRect(btnX, btnY, btnW, btnH);

    // 按下时额外阴影
    if (pressed) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 按钮文字（亮金色 + 阴影）
    const textBright = h > 0.3 ? '#FFE8A8' : '#FFD166';
    ctx.fillStyle = textBright;
    ctx.font = 'bold 24px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = h > 0.3 ? 'rgba(255,224,138,0.5)' : 'rgba(0,0,0,0.8)';
    ctx.shadowOffsetY = h > 0.3 ? 0 : 2;
    ctx.shadowBlur = h > 0.3 ? 8 : 4;
    ctx.fillText('开始游戏', cw / 2, btnY + btnH / 2);
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;

    ctx.restore();

    // 提示文字（白字 + 黑描边）
    ctx.font = '14px "TencentSansW7", sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText('点击按钮或按空格键开始', cw / 2, btnY + btnH + 24);
    ctx.fillStyle = '#FFFFFF';
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

    // PHASE 16-4.8 仗1：解绑鼠标点击寻路（必须在 canvas 被移除前调用）
    //   detach 内部会从 canvas 上 removeEventListener，等 canvas.parentNode.removeChild
    //   后再解绑就无效了，会泄漏一组监听器到下一次 init。
    if (window.ClickToMove && typeof window.ClickToMove.detach === 'function') {
      window.ClickToMove.detach();
    }

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

    // PHASE 13-8：建筑物碰撞「高度 50%」补丁（取代 13-7 的整体 sprite 覆盖）
    //   13-7 旧策略：把每个房子 sprite 视觉占的 2×2 = 4 格全部标 WALL
    //               → 房子上半（屋顶/装饰）也被封死，紧邻房子的出生点 / NPC 互动位被覆盖
    //               → 阿明开局卡在村长家右下角 [5][4]，按方向键纹丝不动
    //   13-8 新策略：2D 像素游戏通用做法 —— 碰撞只覆盖 sprite 的「下半墙身」
    //               每个房子视觉占 [上半行][下半行][左..右]，仅在「下半行」打 WALL
    //               上半行（屋顶/高墙）保持原 tile（GRASS/DIRT），玩家可走入但视觉被屋顶遮挡
    //   留口规则保留：林师傅 NPC 站位 [5][13] 不封 / 阿明家下半墙身已是 TREE 无需重复
    // 村长家 sprite 视觉占格：[4..5][4..5]，墙身 = [5][4..5]
    this.villageMap[5][4] = TILE.WALL;
    this.villageMap[5][5] = TILE.WALL;
    // 钓具店 sprite 视觉占格：[4..5][13..14]，墙身 = [5][13..14]
    //   ⚠️ [5][13] 留给林师傅 NPC（13-7 同样规则）—— 商店门口可走 + NPC 不卡墙
    this.villageMap[5][14] = TILE.WALL;
    // 阿明家 sprite 视觉占格：[7..8][1..2]，墙身 = [8][1..2]
    //   ⚠️ [8][1]/[8][2] 已是 TREE（行 848-849），TREE 本身不可走 → 墙身碰撞天然成立，无需追加
    // 7-11 sprite 视觉占格：[7..8][15..16]，墙身 = [8][15..16]
    this.villageMap[8][15] = TILE.WALL;
    this.villageMap[8][16] = TILE.WALL;

    // PHASE 13-7：栈桥踩水说明
    //   13-6 已将 FISHING 移出 WALKABLE，[9][9..11] 三格在 _canMoveTo 中返回 false，玩家无法移入
    //   若仍有"视觉穿模"感（角色 sprite 高度 > 1 tile，头/脚溢出），属 sprite 渲染问题而非碰撞缺陷
    //   现有碰撞盒 hbHalf=8 (16×16，半格)，中心位于 (px, py+24)；走到栈桥前缘 ty=8 时
    //   下一步目标 ty=9 = FISHING/DEEP 全不可走 → canY=false → 停在栈桥边界，符合"移动死边界"
    //   故本次不再追加格子碰撞，避免影响 13-6 已稳定的 FISHING tile 视觉

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

      // PHASE 17 仗2：秀兰民宿弹窗按键处理（与 shopUI 同优先级，二者互斥不会同时打开）
      if (this.restPanel && this.restPanel.visible) {
        if (this.restPanel.handleKey(k)) return;
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
      else if (k === 'e') {
        // PHASE 18 仗3：挖蚯蚓 — 优先级高于 NPC 互动
        //   规则：玩家相邻 (曼哈顿=1) 任意可挖地块格子 → 触发挖；否则走原 NPC 流程
        //   挖掘成功(true) / 被 CD/体力/锁拦截(false) 都视为"挖掘意图"消费 e 键，不再 fallback NPC，
        //   避免"靠近地块时按 e 误触地块旁的 NPC"。
        if (this._tryDigNearby()) {
          // 挖掘流程已处理（成功扣体力 或 提示后被拦）
        } else {
          this._tryInteract();
        }
      }
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

    // ─────────────────────────────────────────
    // 鼠标坐标转 Canvas 坐标（DPR 安全；与 ClickToMove 同款公式）
    // ─────────────────────────────────────────
    const toCanvasXY = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    // 点击：①title 阶段 → "开始游戏"按钮 ②玩法阶段 → 优先派给可见面板
    this._clickHandler = (e) => {
      if (e.button !== 0) return;

      // PHASE 16-4.8 仗3：玩法阶段，面板可见时优先派发，并阻断冒泡
      // PHASE 16-6 hotfix：必须用 stopImmediatePropagation，因为
      //   ClickToMove.onClick 与本 _clickHandler 注册在同一个 canvas 元素上，
      //   stopPropagation 仅阻冒泡、无法阻断同元素的其他监听器。
      //   场景：点 ✕ 关闭面板 → handleMouseClick 内 hide() → visible=false →
      //         随后 ClickToMove.onClick 跑、isSceneInteractive 已通过 → 角色误寻路。
      if (this.introState !== 'title') {
        // PHASE 18 仗5 - 仗1：操作提示卡打开 → 派发到 ✕ 命中
        //   教程卡是模态层（line 2097 在 questPanel 之后渲染），点击必须先派给它
        //   不在 ✕ 命中区域 → 也要阻断 ClickToMove（避免点穿教程卡触发寻路）
        if (this.tutorialCardActive) {
          const { x, y } = toCanvasXY(e);
          const r = this._tutorialCloseRect;
          if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            this._hideTutorialCard();
          }
          e.stopImmediatePropagation();
          return;
        }
        // PHASE 18 仗5 - 仗1：游戏指南 HUD 按钮（玩法阶段、教程卡未开时可点）
        //   仅在没有面板打开 / 不在对话中时响应；与 staminaHUD 同 y=4 草地区域
        {
          const { x, y } = toCanvasXY(e);
          const g = this._guideHUDRect;
          if (g && !dialogueSystem.isActive() && !this.questPanelOpen
              && !(this.inventoryUI && this.inventoryUI.visible)
              && !(this.codexUI && this.codexUI.visible)
              && !(this.shopUI && this.shopUI.visible)
              && !(this.restPanel && this.restPanel.visible)
              && x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) {
            this._showTutorialCard();
            e.stopImmediatePropagation();
            return;
          }
        }
        // PHASE 16-4.8 仗4：对话激活 → 整框 click = 等同空格（推进/跳过打字机）
        // 必须放在所有面板派发之前，因为对话框覆盖在所有 UI 之上、且 isSceneInteractive
        // 在对话激活时返回 false → ClickToMove 不会寻路；但 stopImmediatePropagation 双保险。
        // PHASE 18 仗5 - 仗2：传 (x,y) 让 dialogueSystem 命中选项菜单条目（如秀兰 mom_menu）
        if (dialogueSystem.isActive()) {
          const { x, y } = toCanvasXY(e);
          if (dialogueSystem.handleClick(x, y)) {
            e.stopImmediatePropagation();
          }
          return;
        }
        // PHASE 16-6 仗3 UX：店铺面板优先派发（与键盘 handleKey 优先级一致）
        if (this.shopUI && this.shopUI.visible) {
          const { x, y } = toCanvasXY(e);
          if (this.shopUI.handleMouseClick(x, y)) {
            e.stopImmediatePropagation();
          }
          return;
        }
        // PHASE 17 仗2：秀兰民宿弹窗鼠标点击派发
        if (this.restPanel && this.restPanel.visible) {
          const { x, y } = toCanvasXY(e);
          if (this.restPanel.handleMouseClick(x, y)) {
            e.stopImmediatePropagation();
          }
          return;
        }
        if (this.inventoryUI && this.inventoryUI.visible) {
          const { x, y } = toCanvasXY(e);
          if (this.inventoryUI.handleMouseClick(x, y)) {
            e.stopImmediatePropagation();
          }
          return;
        }
        if (this.codexUI && this.codexUI.visible) {
          const { x, y } = toCanvasXY(e);
          if (this.codexUI.handleMouseClick(x, y)) {
            e.stopImmediatePropagation();
          }
          return;
        }
        // PHASE 16-4.8 仗4：在栈桥上 → 点击底部"🎣 按 F 开始钓鱼"提示条 = 启动钓鱼
        // 提示条像素范围（与 _renderFishingHint 一致）：x=0..1280, y=680..720
        if (this.onFishingSpot) {
          const { x, y } = toCanvasXY(e);
          if (x >= 0 && x <= 1280 && y >= 680 && y <= 720) {
            this._tryFishing();
            e.stopImmediatePropagation();
            return;
          }
        }

        // PHASE 18 仗3：点击地块格子 — 玩家相邻才触发挖（不相邻 → 走 ClickToMove 寻路；
        //   但 ROOF 不在 WALKABLE，寻路终点会落到相邻可走格 → 自然不与 ClickToMove 冲突）
        {
          const { x, y } = toCanvasXY(e);
          const gx = Math.floor(x / 64);
          const gy = Math.floor(y / 64);
          if (diggingSystem.isDigTile(gx, gy)
              && diggingSystem.isAdjacent(this.player.tx, this.player.ty, gx, gy)) {
            diggingSystem.tryDig(gx, gy);
            e.stopImmediatePropagation();   // 防止 ClickToMove 再寻路（不相邻时不阻断，让寻路自然进行）
            return;
          }
        }
        return;  // 玩法阶段无面板 → 交给 ClickToMove 处理
      }

      // title 阶段："开始游戏"按钮
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const btnW = 220, btnH = 56;
      const btnX = cw / 2 - btnW / 2;
      const btnY = ch / 2 + 100;
      const { x, y } = toCanvasXY(e);
      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
        this._skipIntro();
      }
    };

    // 鼠标移动：①title 阶段 → 按钮 hover ②玩法阶段 → 面板 hover 转发
    this._moveHandler = (e) => {
      // PHASE 16-4.8 仗3：玩法阶段，面板可见时转发 mousemove，更新 hover 字段 + cursor
      if (this.introState !== 'title') {
        // PHASE 18 仗5 - 仗1：操作提示卡打开 → 仅 hover ✕ 按钮
        if (this.tutorialCardActive) {
          const { x, y } = toCanvasXY(e);
          const r = this._tutorialCloseRect;
          const inClose = !!(r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
          this._tutorialCloseHovered = inClose;
          this.canvas.style.cursor = inClose ? 'pointer' : 'default';
          this._hoverTile = null;
          return;
        }
        // PHASE 18 仗5 - 仗1：游戏指南 HUD 按钮 hover（无面板/对话时才检测，避免与面板 hover 冲突）
        //   注意：此处仅做 _guideHUDHovered 状态更新；实际 cursor 在面板派发结束后由 ClickToMove 决定
        //   若命中按钮 → 提前 return 抢占 cursor=pointer
        {
          const { x, y } = toCanvasXY(e);
          const g = this._guideHUDRect;
          const noPanel = !dialogueSystem.isActive() && !this.questPanelOpen
            && !(this.inventoryUI && this.inventoryUI.visible)
            && !(this.codexUI && this.codexUI.visible)
            && !(this.shopUI && this.shopUI.visible)
            && !(this.restPanel && this.restPanel.visible);
          if (g && noPanel && x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) {
            this._guideHUDHovered = true;
            this.canvas.style.cursor = 'pointer';
            this._hoverTile = null;
            return;
          }
          this._guideHUDHovered = false;
        }
        // PHASE 16-4.8 仗4：对话激活 → 整框可点 → cursor pointer
        // PHASE 18 仗5 - 仗2：选项菜单激活时，hover 选项条目 → 同步 choiceIdx + 'pointer'
        if (dialogueSystem.isActive()) {
          const { x, y } = toCanvasXY(e);
          const cursor = dialogueSystem.handleMouseMove(x, y);
          this.canvas.style.cursor = cursor || 'pointer';
          this._hoverTile = null;
          return;
        }
        // PHASE 16-6 仗3 UX：店铺面板优先派发 hover
        if (this.shopUI && this.shopUI.visible) {
          const { x, y } = toCanvasXY(e);
          this.canvas.style.cursor = this.shopUI.handleMouseMove(x, y);
          this._hoverTile = null;
          return;
        }
        // PHASE 17 仗2：秀兰民宿弹窗 hover 派发
        if (this.restPanel && this.restPanel.visible) {
          const { x, y } = toCanvasXY(e);
          this.canvas.style.cursor = this.restPanel.handleMouseMove(x, y);
          this._hoverTile = null;
          return;
        }
        if (this.inventoryUI && this.inventoryUI.visible) {
          const { x, y } = toCanvasXY(e);
          this.canvas.style.cursor = this.inventoryUI.handleMouseMove(x, y);
          this._hoverTile = null;
          return;
        }
        if (this.codexUI && this.codexUI.visible) {
          const { x, y } = toCanvasXY(e);
          this.canvas.style.cursor = this.codexUI.handleMouseMove(x, y);
          this._hoverTile = null;
          return;
        }
        // PHASE 16-4.8 仗4：栈桥上 → hover 底部钓鱼提示条 → cursor pointer
        if (this.onFishingSpot) {
          const { x, y } = toCanvasXY(e);
          if (x >= 0 && x <= 1280 && y >= 680 && y <= 720) {
            this.canvas.style.cursor = 'pointer';
            this._fishingHintHover = true;
            this._hoverTile = null;
            return;
          }
          this._fishingHintHover = false;
        }
        // PHASE 18 仗3 hotfix：无面板时记录鼠标当前所在格（供 digging-overlay CD 倒计时按需显示）
        //   T=64；超出地图范围 → 不更新（保留上一次值无所谓，render 端会用 isDigTile 二次过滤）
        {
          const { x, y } = toCanvasXY(e);
          this._hoverTile = { tx: Math.floor(x / 64), ty: Math.floor(y / 64) };
        }
        // 无面板：恢复默认（ClickToMove 自己会按 hover 网格设置 cursor）
        return;
      }

      // title 阶段：开始游戏按钮 hover
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      const btnW = 220, btnH = 56;
      const btnX = cw / 2 - btnW / 2;
      const btnY = ch / 2 + 100;
      const { x, y } = toCanvasXY(e);
      this._btnHoverTarget = (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) ? 1 : 0;
      this.canvas.style.cursor = this._btnHoverTarget ? 'pointer' : 'default';
    };

    // 鼠标按下/抬起 → 按压反馈
    this._downHandler = (e) => {
      if (this.introState === 'title' && e.button === 0) this._btnPressed = true;
    };
    this._upHandler = () => { this._btnPressed = false; };

    // PHASE 18 仗3 hotfix：鼠标移出 canvas → 清空悬停格，避免 CD 倒计时残留显示
    this._leaveHandler = () => { this._hoverTile = null; };

    // PHASE 16-6 仗3 UX：双击仅店铺商品行使用（双击购买）
    //   - 浏览器 dblclick 是 click 之后另发的事件，不会和单击 selected 冲突
    //   - 仅在 buy 模式 + 命中商品行 时消费；其它面板透传给单击逻辑
    this._dblClickHandler = (e) => {
      if (e.button !== 0) return;
      if (this.introState === 'title') return;
      if (this.shopUI && this.shopUI.visible) {
        const { x, y } = toCanvasXY(e);
        if (this.shopUI.handleMouseDblClick(x, y)) {
          e.stopImmediatePropagation();
        }
      }
    };

    document.addEventListener('keydown', this._keyHandler);
    document.addEventListener('keyup', this._keyUpHandler);
    this.canvas.addEventListener('click', this._clickHandler);
    this.canvas.addEventListener('dblclick', this._dblClickHandler);
    this.canvas.addEventListener('mousemove', this._moveHandler);
    this.canvas.addEventListener('mouseleave', this._leaveHandler);
    this.canvas.addEventListener('mousedown', this._downHandler);
    window.addEventListener('mouseup', this._upHandler);
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
      this.canvas.removeEventListener('mousemove', this._moveHandler);
      this.canvas.removeEventListener('mouseleave', this._leaveHandler);
      this.canvas.removeEventListener('mousedown', this._downHandler);
      this._clickHandler = null;
      this._moveHandler = null;
      this._leaveHandler = null;
      this._downHandler = null;
    }
    if (this._dblClickHandler && this.canvas) {
      this.canvas.removeEventListener('dblclick', this._dblClickHandler);
      this._dblClickHandler = null;
    }
    if (this._upHandler) {
      window.removeEventListener('mouseup', this._upHandler);
      this._upHandler = null;
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
    // PHASE 13-6：进入钓鱼前强制阿明朝下（朝向湖面/南方）
    //   栈桥 ty=8、钓点 ty=9 在其正南方，物理上抛竿就是朝下
    //   保证 FishingScene Casting 状态从"朝下抛竿"开始，视觉连贯
    this.player.direction = 'down';
    SceneManager.switchTo('fishing', params);
  }

  // ========================================================
  // PHASE 18 仗3：挖蚯蚓 — 找到玩家相邻最近的可挖地块格并尝试挖
  // ========================================================
  /**
   * @returns {boolean} 是否找到相邻地块（无论挖掘是否被 CD/体力拦截，只要相邻就视为"挖掘意图"，
   *   返回 true 让 e 键消费在挖掘上而不 fallback NPC 互动）
   */
  _tryDigNearby() {
    if (dialogueSystem.isActive()) return false;
    const near = diggingSystem.getNearestAdjacentTile(this.player.tx, this.player.ty);
    if (!near) return false;
    diggingSystem.tryDig(near.tile.tx, near.tile.ty);
    return true;
  }

  // ========================================================
  // NPC 互动
  // ========================================================
  _tryInteract() {

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

    // PHASE 16-6 仗2：秀兰鱼贩分支（菜单：卖鱼 / 闲聊 / 离开）
    if (npc.id === 'mom') {
      this._interactMom();
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
  // PHASE 16-6 仗2：剥离 sell 入口 —— 林师傅只卖钓具，不再收鱼。
  //   收鱼业务完整迁移到秀兰阿姨（_interactMom + openXiulanShop）。
  //   实现：调用 openLinShop({ buyOnly: true }) 让菜单不再出现"出售鱼货"。
  //   注：q003「累计卖出 300 金鱼货」依然由 inventory.sellFish 触发的
  //       fish_sold 事件统计，所以无论玩家把鱼卖给谁，q003 都会推进，零回归。
  _interactLin() {
    const q002 = questSystem.getQuest('q002');
    const q003 = questSystem.getQuest('q003');

    // q003 完成 → 开店模式（仅购买）
    if (q003 && q003.status === 'completed') {
      dialogueSystem.start('lin_shop', {
        onEnd: () => { if (this.shopUI) this.shopUI.openLinShop({ buyOnly: true }); }
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

    // q003 进行中 → 进度对话（不再自动开店；玩家想卖鱼请去找秀兰）
    if (q003 && q003.status === 'active') {
      const detail = QUESTS.q003.getDetailText(q003.progress);
      dialogueSystem.start('lin_q003_progress', {
        replacements: { q003_detail: detail.replace(/\n/g, '；') }
        // PHASE 16-6 仗2：移除 onEnd 的 openLinShop（鱼让秀兰收）
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

  // ────────────────────────────────────────────────────────────
  // PHASE 16-6 仗2：秀兰阿姨鱼贩互动
  //   入口：进 mom_menu（带选项分支：卖鱼/闲聊/离开）。
  //   流程：
  //     选 "🐟 卖鱼给阿姨" → action: 'mom_sell_intro'
  //                       → 该对话 onEnd: 'openXiulanShop' 协议
  //                       → DialogueSystem._end 调 window.shopUI.openXiulanShop()
  //     选 "💬 随便聊聊"   → action: 'mom_chat'（顺序对话）
  //     选 "👋 先走了"     → action: { close: true }（直接关闭）
  //   首次见面 mom_first_meet 走 _startMomDialog 老路径不变（autoTrigger）。
  // ────────────────────────────────────────────────────────────
  _interactMom() {
    dialogueSystem.start('mom_menu');
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
      font: bold 32px "TencentSans","PingFang SC","Noto Sans SC","Heiti SC",sans-serif;
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
      font: bold 28px "TencentSans","PingFang SC","Noto Sans SC","Heiti SC",sans-serif;
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

    // PHASE 17 仗2：秀兰民宿弹窗打开时锁定移动
    if (this.restPanel && this.restPanel.visible) {
      this.coinHUD.update(dt);
      return;
    }

    // 金币 HUD 更新
    if (this.coinHUD) this.coinHUD.update(dt);
    // PHASE 18 仗3 hotfix：体力 HUD 更新（当前 no-op，预留未来动画/弹跳）
    if (this.staminaHUD) this.staminaHUD.update(dt);

    // PHASE 16-4.8 仗1：鼠标点击寻路推进（必须在 WASD 段之前）
    //   - 返回 true：本帧由寻路控制玩家移动 → 跳过 WASD 段，避免 else 分支把 frame=0
    //     重置导致行走动画静止
    //   - 返回 false：未寻路 / 已被 WASD 接管 / 已抵达终点 → 走 WASD 流程（原逻辑零回归）
    //   ClickToMove.update 内部已处理"WASD 任一键按下 → 主动 cancelPath 后返回 false"
    //   的接管逻辑，因此 WASD 永远优先生效（约束 1 键盘零回归）。
    let pathDriven = false;
    if (window.ClickToMove && typeof window.ClickToMove.update === 'function') {
      pathDriven = window.ClickToMove.update(dt) === true;
    }
    if (pathDriven) {
      // 寻路控制中：onFishingSpot / NPC bob / 箭头 / FPS 仍要刷新（原 _update 末段逻辑）
      this.onFishingSpot = (this._getTileAt(this.player.tx, this.player.ty) === TILE.WOOD);
      for (const npc of this.npcs) {
        npc.bobOffset = Math.sin(this.time * 10) * 2;
      }
      this._updateArrowState();
      this.arrow.update(this.player);
      this.fpsTimer += dt;
      this.frameCount++;
      if (this.fpsTimer >= 1.0) {
        this.fps = Math.round(this.frameCount / this.fpsTimer);
        this.frameCount = 0;
        this.fpsTimer = 0;
      }
      return;
    }

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

    // PHASE 13-6：钓鱼触发区从"钓点 FISHING tile"改为"栈桥 WOOD tile"
    //   语义：玩家站在栈桥任意一格（WOOD）即触发钓鱼提示；按 F 开始钓鱼
    //   栈桥位置：[8][9..11]（3 格），村庄内 WOOD 只此一处，直接查 tile id 最稳
    //   ⚠️ FISHING tile 现在已被移出 WALKABLE（见顶部 WALKABLE 定义），玩家根本踩不到水中钓点，旧判定永远 false
    this.onFishingSpot = (this._getTileAt(this.player.tx, this.player.ty) === TILE.WOOD);

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
      // 平滑过渡悬停动画（0.25s 过渡）
      this._btnHover += (this._btnHoverTarget - this._btnHover) * Math.min(1, dt * 10);
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
    // PHASE 18 仗3 微调 v3：可挖格子交互提示（与 NPC 提示同层，相邻 ≤1 + 可挖才显示）
    this._renderDigHints();
    this._renderFishingHint();
    this._renderQuestHUD();
    this._renderMinimap();

    // 调试信息
    if (this.debug) this._renderDebug();
    if (this.showGrid) this._renderGrid();

    // 金币 HUD（常驻）
    if (this.coinHUD) this.coinHUD.render(ctx);
    // PHASE 18 仗3 hotfix：体力 HUD（常驻，与金币 HUD 同层级）
    if (this.staminaHUD) this.staminaHUD.render(ctx);
    // PHASE 18 仗5 - 仗1：游戏指南 HUD 按钮（与金币/体力同层级常驻）
    this._renderGuideHUD(ctx);

    // 背包面板（覆盖层）
    if (this.inventoryUI) this.inventoryUI.render(ctx);

    // 图鉴面板（覆盖层）
    if (this.codexUI) this.codexUI.render(ctx);

    // 钓具店面板（覆盖层）
    if (this.shopUI) this.shopUI.render(ctx);

    // PHASE 17 仗2：秀兰民宿面板（覆盖层，与 shopUI 互斥）
    if (this.restPanel) this.restPanel.render(ctx);

    // Layer 7.5: 萤火虫（UI 之前、滤镜之前）⭐ Phase C
    drawFireflies(ctx, this.time * 1000, getFireflyBrightness(this.time * 1000));

    // Layer 8: 全局动态滤镜（在所有场景元素之后、对话框之前）⭐ Phase C
    drawDynamicOverlay(ctx, this.time * 1000);

    // Layer 9: UI 面板
    if (this.questPanelOpen) this._renderQuestPanel();
    if (this.tutorialCardActive) this._renderTutorialCard(ctx, cw, ch);

    // PHASE 16-4.8 仗1：鼠标点击寻路 overlay（hover 边框 + 点击波纹）
    //   插入位置：UI 面板之后、对话框之前。
    //   - 在 UI 面板（任务/教程卡）之后：避免边框画在面板上方造成视觉干扰
    //     （ClickToMove.renderOverlay 内部已用 isSceneInteractive 守卫，UI 打开时
    //      hover 不绘制，但点击波纹的 200ms 余晖可能仍在 → 显式排序更稳）
    //   - 在 dialogueSystem.render 之前：对话框是最高优先级 UI，必须盖住所有叠加层
    if (window.ClickToMove && typeof window.ClickToMove.renderOverlay === 'function') {
      window.ClickToMove.renderOverlay(ctx);
    }

    dialogueSystem.render(ctx);
  }

  // 渲染开场
  _renderIntro(ctx, cw, ch) {
    if (this.introState === 'narration') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);

      ctx.globalAlpha = this.narrOpacity;
      ctx.fillStyle = '#F4E4C1';
      ctx.font = '48px "TencentSansW7", sans-serif';
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
    ctx.font = 'bold 36px "TencentSansW7", sans-serif';
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
    ctx.font = '32px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3D2B1F';

    items.forEach((item, idx) => {
      ctx.fillStyle = '#3D2B1F';
      ctx.fillText(item.icon, cardX + 60, y + idx * 56);
      ctx.fillText(item.text, cardX + 120, y + idx * 56);
    });

    // PHASE 18 仗6 - 仗1：底部提示移至面板外（面板下方 28px，灰色小字居中）
    //   原方案（cardY + cardH - 40）与第 7 项 ESC 行 y=446 重叠（cardH=480 装不下 7 行+提示）。
    //   改为外置：①不与列表项混排；②不需要扩 cardH 影响整体布局；③字号缩到 20px 更克制。
    //   外层红色边框 cardY + cardH + 2，外层栗褐边框 cardY + cardH + 6，
    //   故文字 y = cardY + cardH + 28（与边框间距 16px，与 baseline=alphabetic 字底约对齐）。
    ctx.fillStyle = 'rgba(255, 244, 214, 0.85)';   // 米白偏亮，遮罩底（rgba(0,0,0,0.7)）上可读
    ctx.font = '20px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('按 任意键 或 ESC 关闭', cardX + cardW / 2, cardY + cardH + 28);

    // PHASE 18 仗5 - 仗1：右上角 ✕ 关闭按钮
    //   几何 36×36，定位 cardX+cardW-46, cardY+14（红色标题栏内）
    //   交互：hover 旋转 90° + 描边变金 + 半透金底（"hover旋转90°动效"原始要求）
    //   命中坐标写回 this._tutorialCloseRect 供 _clickHandler/_moveHandler 派发
    const closeW = 36, closeH = 36;
    const closeX = cardX + cardW - closeW - 14;
    const closeY = cardY + 14;
    this._tutorialCloseRect = { x: closeX, y: closeY, w: closeW, h: closeH };

    const hovered = this._tutorialCloseHovered;
    ctx.save();
    // hover 时整体旋转 90°（绕按钮中心）
    if (hovered) {
      const hcx = closeX + closeW / 2;
      const hcy = closeY + closeH / 2;
      ctx.translate(hcx, hcy);
      ctx.rotate(Math.PI / 2);
      ctx.translate(-hcx, -hcy);
    }
    // 底色（hover 半透金 / 默认透明）
    ctx.fillStyle = hovered ? 'rgba(255, 215, 0, 0.30)' : 'rgba(255,255,255,0.10)';
    ctx.fillRect(closeX, closeY, closeW, closeH);
    // 描边
    ctx.strokeStyle = hovered ? '#ffd700' : '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(closeX, closeY, closeW, closeH);
    // ✕ 字
    ctx.fillStyle = hovered ? '#ffd700' : '#FFFFFF';
    ctx.font = 'bold 26px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', closeX + closeW / 2, closeY + closeH / 2 + 1);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * PHASE 18 仗5 - 仗1：游戏指南 HUD 按钮渲染
   * 风格：木牌（克隆 CoinHUD/StaminaHUD 配色）+ "📖 游戏指南"文字
   * hover 时金色描边强化（与 shop-ui ✕ 同套高亮规范）
   * 入口：点击 → _showTutorialCard()（同 mom 对话首次教程触发）
   */
  _renderGuideHUD(ctx) {
    if (!this._guideHUDRect) return;
    const { x, y, w, h } = this._guideHUDRect;
    const hovered = this._guideHUDHovered;

    ctx.save();
    // 木牌底板（与 CoinHUD._drawWoodPlaque 完全同源）
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    ctx.fillStyle = hovered ? '#A87F4E' : '#8B6F47';   // hover 略亮
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, Math.ceil(h) - 4);
    ctx.fillStyle = '#A88860';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, 1);
    ctx.fillStyle = '#6B4A2A';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + Math.ceil(h) - 3, Math.ceil(w) - 4, 1);
    // hover 金色描边（与面板交互标准 v1.0 一致）
    if (hovered) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.floor(x) + 1, Math.floor(y) + 1, Math.ceil(w) - 2, Math.ceil(h) - 2);
    }

    // 📖 emoji
    ctx.font = '20px "TencentSansW7", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('📖', Math.floor(x + 8), Math.floor(y + h / 2));

    // "游戏指南" 文字（描边 + 填充，与 CoinHUD 数字同字号 22）
    const text = '游戏指南';
    const tx = x + 38;
    const ty = y + h / 2;
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
    ctx.strokeStyle = '#5C3A1E';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    ctx.strokeText(text, Math.floor(tx), Math.floor(ty));
    ctx.fillStyle = hovered ? '#FFE9A0' : '#FFF4D6';
    ctx.fillText(text, Math.floor(tx), Math.floor(ty));

    ctx.textBaseline = 'alphabetic';
    ctx.restore();
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

        if (tile === TILE.GRASS || tile === TILE.WALL) {
          // PHASE 13-7：WALL 是建筑物碰撞标记（4 个房子 sprite 视觉占格）
          //   渲染时按 GRASS 处理（画草地贴图）—— 因为房子 sprite 是不规则形状（屋顶斜面），
          //   sprite 内部有透明像素，需要底层是草地以保持视觉一致；
          //   _drawTileColor 中 WALL 颜色 #F4E4C1 米黄色仅作 fallback，本路径不会触发
          ctx.drawImage(getGrassTile(), px, py);
        } else {
          this._drawTileColor(ctx, tile, px, py);
        }
      }
    }

    // 左上红色色块 → 菜苗农田（覆盖 ROOF tiles at [1][4],[1][5],[2][4],[2][5]）
    drawFarmland(ctx, 4 * T, 1 * T, 2 * T, 2 * T);

    // 右上红色色块 → 像素花圃（覆盖 ROOF tiles at [1][13],[1][14],[2][13],[2][14]）
    drawFlowerbed(ctx, 13 * T, 1 * T, 2 * T, 2 * T);

    // 左下红色色块 → 像素花圃（覆盖 ROOF tiles at [4][1],[4][2],[5][1],[5][2]）
    drawFlowerbed(ctx, 1 * T, 4 * T, 2 * T, 2 * T);

    // 右下红色色块 → 菜苗农田（覆盖 ROOF tiles at [4][15],[4][16],[5][15],[5][16]）
    drawFarmland(ctx, 15 * T, 4 * T, 2 * T, 2 * T);

    // PHASE 18 仗3：挖蚯蚓 — 16 格地块叠加层（CD 倒计时 / 低体力灰显 / 相邻金边高亮）
    this._renderDiggingOverlay(ctx, T);
  }

  // ========================================================
  // PHASE 18 仗3：挖蚯蚓视觉叠加层
  //   - 体力 < 2：所有可挖格 alpha 0.4 + 灰色叠加（饱和度归零的廉价近似）
  //   - CD 中：黑色半透明蒙层（常驻）；倒计时数字按需显示 — 玩家相邻该格 或 鼠标悬停该格
  //     （hotfix：原 16 格倒计时全屏常驻太吵，改为"按需"，玩家不关心的格仅留蒙层提示状态）
  //   - 玩家相邻该格 且 CD 已到 且 体力 ≥ 2：描金边 #FFD700 / 2px / 1.2s sin 呼吸
  // ========================================================
  _renderDiggingOverlay(ctx, T) {
    const tiles = diggingSystem.getAllTiles();
    const SS = window.StaminaSystem;
    const lowStamina = !!(SS && typeof SS.getCurrent === 'function' && SS.getCurrent() < 2);
    const px = this.player.tx;
    const py = this.player.ty;
    const hover = this._hoverTile;   // {tx,ty} | null

    // 呼吸：1.2s 周期 → ω = 2π / 1.2 ≈ 5.236
    const breath = 0.5 + 0.5 * Math.sin(this.time * (2 * Math.PI / 1.2));

    for (const t of tiles) {
      const x = t.tx * T;
      const y = t.ty * T;
      const cdLeft = diggingSystem.getCDRemainMs(t.tx, t.ty);
      const onCD = cdLeft > 0;

      // ① 体力不足：alpha 0.4 + 灰色叠加（在所有格上盖一层中灰，模拟饱和度归零）
      if (lowStamina) {
        ctx.save();
        ctx.globalAlpha = 0.6;          // 总体压暗
        ctx.fillStyle = '#888888';
        ctx.fillRect(x, y, T, T);
        ctx.restore();
      }

      // ② CD 中：半透明黑蒙层（常驻）；倒计时数字仅在玩家相邻或鼠标悬停时显示
      if (onCD) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, T, T);
        ctx.restore();

        // hotfix：按需显示倒计时（避免 16 格全屏常驻数字太吵）
        //   - 玩家曼哈顿距离 ≤ 1 → 显示（"走近就能看见自己马上能挖的那一格还剩多久"）
        //   - 鼠标悬停该格    → 显示（"想看哪一格悬停哪一格"）
        const playerNear = (Math.abs(px - t.tx) + Math.abs(py - t.ty)) <= 1;
        const mouseHover = !!(hover && hover.tx === t.tx && hover.ty === t.ty);
        if (playerNear || mouseHover) {
          // 倒计时 mm:ss
          const mm = Math.floor(cdLeft / 60000);
          const ss = Math.floor((cdLeft % 60000) / 1000);
          const txt = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
          ctx.save();
          ctx.fillStyle = '#FFD700';
          ctx.font = 'bold 18px "TencentSans","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 4;
          ctx.fillText(txt, x + T / 2, y + T / 2);
          ctx.restore();
        }
      }

      // ③ 玩家相邻 + 可挖（非 CD 且 体力够）→ 金边呼吸高亮
      const adjacent = (Math.abs(px - t.tx) + Math.abs(py - t.ty)) <= 1;
      if (adjacent && !onCD && !lowStamina) {
        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.55 + 0.45 * breath;     // 0.55 ↔ 1.0 呼吸
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 6 + 6 * breath;
        ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
        ctx.restore();
      }
    }
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
      ctx.font = '20px "TencentSansW7", sans-serif';
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
      ctx.font = '20px "TencentSansW7", sans-serif';
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
      ctx.font = '20px "TencentSansW7", sans-serif';
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
    // HOTFIX：原 y=py-28 与名字标签 box（py-28~py-8）完全重叠，48px serif "?" 字符高度
    // ~48px → 覆盖到 npc.py-52~py-4 → 截图里"阿土伯"的"土"被问号压住，看起来像"阿?伯"。
    // 移到名字标签上方（py-44，留出名字 box 20px + 间距）。
    for (const npc of this.npcs) {
      const cx = npc.px + 16;
      const py = npc.py + npc.bobOffset;
      this._renderNPCMarker(ctx, npc, cx, py - 44);
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
      // 任务标记字体：原 serif 衬线，与全局字体风格不一致；改用与项目一致的 sans 字体
      // （? ! ✓ 都是 ASCII / 通用符号，子集字体均覆盖）
      ctx.font = 'bold 36px "TencentSansW7", "PingFang SC", "Heiti SC", sans-serif';
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
    // PHASE 16-4.8 仗1-FIX：行走动画判定要兼容鼠标点击寻路
    //   原 bug：isMoving 只看 WASD → 鼠标寻路时角色双腿静止
    //   修复：再叠加 ClickToMove.isWalking() 信号
    const wasdMoving = this.keys.up || this.keys.down || this.keys.left || this.keys.right;
    const clickMoving = !!(window.ClickToMove
      && typeof window.ClickToMove.isWalking === 'function'
      && window.ClickToMove.isWalking());
    const isMoving = wasdMoving || clickMoving;
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
        ctx.font = 'bold 20px "TencentSansW7", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('E', hintX, hintY);
      }
    }
  }

  // ========================================================
  // PHASE 18 仗3 微调 v3：可挖格子交互提示
  //   - 玩家曼哈顿距离 ≤ 1 的【可挖】（CD=0 且 体力≥2）格子上方显示提示框
  //   - 文案：🪱 点击 / [E] 挖掘
  //   - 视觉：沿用 NPC 提示色板 #E8C84C 底 + #3D2B1F 边/字（与 _renderInteractionHints 一致）
  //   - 隐藏条件：对话激活 / 任意面板可见 / 距离>1 / CD 中 / 体力<2
  // ========================================================
  _renderDigHints() {
    if (dialogueSystem.isActive()) return;
    // 任意面板可见时不画（避免覆盖在面板下/上造成混乱）
    if (this.shopUI && this.shopUI.visible) return;
    if (this.restPanel && this.restPanel.visible) return;
    if (this.inventoryUI && this.inventoryUI.visible) return;
    if (this.codexUI && this.codexUI.visible) return;

    const SS = window.StaminaSystem;
    const lowStamina = !!(SS && typeof SS.getCurrent === 'function' && SS.getCurrent() < 2);
    if (lowStamina) return;   // 体力不足 → 已有飘字反馈，不显示提示

    const T = 64;
    const px = this.player.tx;
    const py = this.player.ty;
    const tiles = diggingSystem.getAllTiles();
    const ctx = this.ctx;

    for (const t of tiles) {
      // 仅 玩家相邻（曼哈顿 ≤ 1） + 非 CD 的格子
      if ((Math.abs(px - t.tx) + Math.abs(py - t.ty)) > 1) continue;
      if (diggingSystem.getCDRemainMs(t.tx, t.ty) > 0) continue;

      // 提示框中心：格子顶部正上方 24px
      const cx = t.tx * T + T / 2;
      const cy = t.ty * T - 24;

      // 量字宽 → 自适应胶囊尺寸（与 NPC 金圆同色板，扩展为胶囊容纳长文案）
      const text = '🪱 点击 / [E] 挖掘';
      ctx.save();
      ctx.font = 'bold 14px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      const textW = ctx.measureText(text).width;
      const padX = 10, padY = 6;
      const boxW = textW + padX * 2;
      const boxH = 14 + padY * 2;
      const boxX = cx - boxW / 2;
      const boxY = cy - boxH / 2;

      // 圆角矩形底（NPC 金 #E8C84C）
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(boxX + r, boxY);
      ctx.lineTo(boxX + boxW - r, boxY);
      ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + r);
      ctx.lineTo(boxX + boxW, boxY + boxH - r);
      ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH);
      ctx.lineTo(boxX + r, boxY + boxH);
      ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - r);
      ctx.lineTo(boxX, boxY + r);
      ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
      ctx.closePath();
      ctx.fillStyle = '#E8C84C';
      ctx.fill();
      ctx.strokeStyle = '#3D2B1F';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 文案
      ctx.fillStyle = '#3D2B1F';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy + 1);
      ctx.restore();
    }
  }

  _renderFishingHint() {
    if (!this.onFishingSpot || dialogueSystem.isActive()) return;

    const ctx = this.ctx;

    // PHASE 13-6：栈桥金色脉冲外框（玩家站栈桥时强化"这里可以钓鱼"视觉引导）
    //   栈桥像素范围：x=[9*64, 12*64)=[576, 768)，y=[8*64, 9*64)=[512, 576)，整体 192×64
    //   2Hz 脉冲：透明度在 0.30~0.90 之间正弦振荡（基础 rgba(255,215,128,0.6) ± 0.3）
    //   只画 stroke 不 fill —— 不会盖住站在栈桥上的阿明像素
    const dockX = 9 * 64, dockY = 8 * 64, dockW = 3 * 64, dockH = 64;
    const pulse = 0.6 + 0.3 * Math.sin(this.time * 2 * Math.PI * 2); // 2Hz
    ctx.strokeStyle = `rgba(255, 215, 128, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(dockX - 1, dockY - 1, dockW + 2, dockH + 2);
    ctx.lineWidth = 1;

    // PHASE 16-4.8 仗4：底部提示条 hover 时整条加亮（视觉告知"可点击"）
    const hovered = !!this._fishingHintHover;
    ctx.fillStyle = hovered ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 680, 1280, 40);
    if (hovered) {
      ctx.strokeStyle = '#FFD76A';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 681, 1278, 38);
    }

    ctx.fillStyle = hovered ? '#FFE4B5' : '#FFFFFF';
    ctx.font = 'bold 24px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // PHASE 16-4.8 仗4：补"或点击此处"，告知玩家可鼠标启动
    ctx.fillText('🎣 按 F 开始钓鱼  ·  或点击此处', 640, 700);
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
          case TILE.WALL: color = '#5C8A4C'; break;   // PHASE 13-7：WALL 为建筑物碰撞标记，minimap 按草地色显示，不破坏原有小地图外观
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
    ctx.font = 'bold 11px "TencentSansW7", sans-serif';

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
    ctx.font = 'bold 40px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📋 任务面板', panelX + panelW / 2, panelY + 50);

    const activeQuests = questSystem.getActiveQuests();

    if (activeQuests.length === 0) {
      ctx.font = '28px "TencentSansW7", sans-serif';
      ctx.fillStyle = '#888';
      ctx.fillText('暂无进行中的任务', panelX + panelW / 2, panelY + 200);
    } else {
      let y = panelY + 100;
      for (const q of activeQuests) {
        const tpl = window.QUESTS?.[q.id] || { name: q.id, description: '' };

        ctx.font = 'bold 24px "TencentSansW7", sans-serif';
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
        ctx.font = 'bold 16px "TencentSansW7", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, badgeX + 40, y + 1);

        y += 40;
        ctx.font = '20px "TencentSansW7", sans-serif';
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

    ctx.font = '20px "TencentSansW7", sans-serif';
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
    ctx.font = 'bold 16px "TencentSansW7", sans-serif';
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
    ctx.font = 'bold 13px "TencentSansW7", sans-serif';
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
    y += 18;

    // PHASE 16-1：CloudBase 登录状态指示
    //   绿色 ☁ + openid 前 8 位 = 已就绪
    //   红色 ☁ 离线           = 初始化失败（游戏仍正常）
    //   黄色 ☁ 连接中...        = SDK 加载中或登录请求中
    //   ⚠️ openid 完整值仅在 console 输出，HUD 仅显示前 8 位避免泄露
    const cb = window.CloudBase;
    if (cb && cb.ready && cb.openid) {
      ctx.fillStyle = '#5FAE3D';
      ctx.fillText(`\u2601 ${cb.openid.slice(0, 8)}`, panelX + 16, y);
    } else if (cb && cb.error) {
      ctx.fillStyle = '#E74C3C';
      ctx.fillText('\u2601 \u79bb\u7ebf', panelX + 16, y);
    } else {
      ctx.fillStyle = '#F39C12';
      ctx.fillText('\u2601 \u8fde\u63a5\u4e2d...', panelX + 16, y);
    }
    y += 18;

    // PHASE 16-2：玩家昵称（橙金色，与主题色一致）
    const pp = window.PlayerProfile;
    if (pp && pp.nickname) {
      ctx.fillStyle = '#FFD580';
      // 🎣 + 昵称；云端未同步时加 (本地) 后缀
      const suffix = pp.cloudSynced ? '' : ' (\u672c\u5730)';
      ctx.fillText(`\ud83c\udfa3 ${pp.nickname}${suffix}`, panelX + 16, y);
    }
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
    ctx.font = 'bold 13px "TencentSansW7", sans-serif';
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
    ctx.font = 'bold 13px "TencentSansW7", sans-serif';
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
    ctx.font = 'bold 13px "TencentSansW7", sans-serif';
    ctx.fillText('💾 存档', panelX + 12, y);
    y += 20;

    const money = (window.inventory && window.inventory.getCoin()) ?? window.Save?.get('player.coin') ?? 0;
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
    ctx.font = 'bold 13px "TencentSansW7", sans-serif';
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
    // PHASE 16-6 仗3 UX：店铺/背包/图鉴/个人主页/排行榜面板打开时也不显示
    //   原因：phase toast 是 fixed DOM（z-index:300），而店铺等是 Canvas 渲染（z-index:0），
    //         一切 DOM 飘字都会盖在 Canvas 面板上 ——「华灯初上盖店铺」bug 就源于此。
    //         不提 z-index 是因为 z-index 战争解不掉（Canvas 是单元素），跳过才是正解。
    if (this.shopUI && this.shopUI.visible) return;
    if (this.inventoryUI && this.inventoryUI.visible) return;
    if (this.codexUI && this.codexUI.visible) return;
    // PHASE 17 仗2：秀兰民宿弹窗打开时也屏蔽 DOM 飘字（防"华灯初上"盖面板）
    if (this.restPanel && this.restPanel.visible) return;
    // 个人主页 / 排行榜是 DOM 面板（z-index:9000+），它们打开时玩家也不该被气泡打扰
    if (document.querySelector('.profile-panel.show')) return;
    if (document.querySelector('.leaderboard-overlay.show')) return;

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
      font: bold 28px "TencentSans","PingFang SC","Noto Sans SC","Heiti SC",sans-serif;
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