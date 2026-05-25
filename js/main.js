/**
 * 游戏入口文件，初始化并启动游戏
 */

import SceneManager from './scene-manager.js';
import Save from './save-system.js';
import VillageScene from './village-scene.js';
import FishingScene from './fishing-scene.js';
import AudioSystem from './audio-system.js';
import GM from './gm-commands.js';
import GMUI from './gm-ui.js';
import { InventorySystem } from './inventory-system.js';
import { CodexSystem } from './codex-system.js';
import { EquipmentSystem } from './equipment-system.js';
import dialogueSystem from './dialogue-system.js';
// PHASE 16-6 仗1：鱼篓双轨同步（兜底老存档）
import { syncFishStorage } from './fish-storage.js';
// PHASE 17 仗1：体力系统
//   - float-text 必须最先 import：注册 window.showFloatText（副作用），
//     stamina-system 在 checkDailyReset 里会调用它弹"新的一天"飘字
//   - StaminaSystem 单例（自带 window.StaminaSystem 全局，供 fishing-scene 跨模块引用）
//   - PHASE 17 仗1 视觉补丁：体力 HUD 改由 fishing-scene._renderHUD 直接 Canvas 绘制，
//     不再使用 DOM 浮层（已删除 stamina-hud.js 与对应 mount 调用）。
//     设计依据：村庄场景（社交/经济）不需要体力信息密度；钓鱼场景才显示三件套
//     金币 → 鱼数 → 体力，与星露谷 / 牧场物语 / 塞尔达"按场景调节 HUD 密度"一致。
import './ui/float-text.js';
import StaminaSystem from './stamina-system.js';

console.log('🎮 宝岛钓手 booted @ 1280x720 HD 16:9');
console.log('📐 Tile: 64px | Map: 20x11 | Player Start: (4,5)');
console.log('%c🛠️  GM 命令: GM.run("quest list") | Ctrl+G 打开管理面板', 'color:#ff9800');

// 显示规格常量
window.GAME_CONFIG = Object.freeze({
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  TILE_SIZE: 64,
  MAP_COLS: 20,
  MAP_ROWS: 11,
  PLAYER_W: 32,
  PLAYER_H: 48,
  PLAYER_SPAWN: { x: 4, y: 5 },
  FISHING_SPOT: { x: 10, y: 9 },
  HUD_HEIGHT: 16
});

// 挂载全局调试
window.SceneManager = SceneManager;
window.Save = Save;
window.VillageScene = VillageScene;
window.FishingScene = FishingScene;
window.AudioSystem = AudioSystem;
window.GM = GM;
window.GMUI = GMUI;
// PHASE 16-4.8 仗1：dialogueSystem 暴露到全局，供 click-to-move.js 在
//   isSceneInteractive() 中判定对话状态（对话进行时鼠标点击不响应）。
//   对话系统是单例，window.dialogueSystem 与 import 的引用同源。
window.dialogueSystem = dialogueSystem;

// 注册场景
SceneManager.register('village', VillageScene);
SceneManager.register('fishing', FishingScene);

// 初始化存档
const saveData = Save.load();
console.log('📁 存档已加载:', saveData);

// 初始化背包系统
window.inventory = new InventorySystem(Save);

// PHASE 16-6 仗1：鱼篓堆叠副本兜底
//   - 老存档（v1）由 save.migrate 已注入空 fishStorage 字段；
//     这里再做一次"从 fishBag 全量重算 items"，确保 UI 第一帧正确。
//   - 新档 fishBag 为空 → items 也为空，无副作用。
//   - 与 fishing-scene 的增量同步互不冲突（增量在 _onFishCaught 内执行）。
{
  const player = Save.get('player');
  if (player) {
    syncFishStorage(player);
    Save.set('player', player);
    Save.commit();
  }
}

// 首次新建存档时给予初始物资
//   PHASE 17 hotfix - basic_bait 已由 save-system.migrate 兜底到 999（新手鱼饵死锁修复），
//   所以此处不能再用"inventory 整体为空"判定首次新档（永远不为空）。
//   改为按物品逐项判定缺失：basic_rod 没有就发，basic_bait 由 migrate 全权负责，不在此重复处理。
if (window.inventory.getCount('basic_rod') === 0) {
  window.inventory.add('basic_rod', 1);
  console.log('🎒 初始物资已发放：入门钓竿 ×1（basic_bait 由存档兜底，详见 save-system.migrate）');
}

// 初始化鱼类图鉴系统
window.codex = new CodexSystem(Save.get('player'), Save);

// 初始化装备系统
window.equipment = new EquipmentSystem(Save.get('player'), window.inventory, Save);

// PHASE 17 仗1：体力系统启动
//   1) checkDailyReset：跨日重置 + 首次登录静默初始化 lastResetDate
//      （必须在场景启动前调用，确保 fishing-scene 第一帧拿到的是已重置后的当日数值）
//   2) HUD 渲染由 fishing-scene._renderHUD 接管（Canvas 木牌风），无独立 mount 步骤
StaminaSystem.checkDailyReset();

// 监听钓鱼事件（用于更新存档）
SceneManager.on('fish_caught', ({ species, weight, price, rarity }) => {
  console.log(`📥 钓获入库: ${species} (${weight}kg, $${price})`);
  const inventory = Save.get('inventory') || { fish: [] };
  inventory.fish.push({ species, weight, price, rarity, caughtAt: Date.now() });
  Save.set('inventory', inventory);
  // PHASE 16-6 经济统一：钓鱼上钩不直发金币（鱼进鱼篓，卖给秀兰才变 coin）。
  //   原 `Save.set('player.money', ...)` 是 PHASE 1 死代码，写到的是 HUD 不读的孤儿字段，
  //   会导致 GM/debug 浮窗显示与 HUD 不一致。已移除。

  // ─────────────────────────────────────────────────────────
  // PHASE 16-5：历史最佳数据 + 称号升级（约束 1：仅扩展，不动核心玩法）
  //   数据存放：Save.player.titleStats 子树（老档兼容由 TitleSystem 兜底）
  //   单位约定：weight 此处是 kg（与 fishing-scene 的 emit 单位一致）
  //              titleStats.bestSingleFishWeight / totalCaughtWeight 同步存 kg
  //   字段：currentTitleId / bestSingleFishWeight / bestSingleFishName /
  //         bestSingleFishDate / totalCaughtWeight
  // ─────────────────────────────────────────────────────────
  if (window.TitleSystem && typeof weight === 'number' && weight > 0) {
    // 1. 读 + 兜底（getStatsContext 内部已老档兼容）
    const ctx = window.TitleSystem.getStatsContext();
    const stats = ctx.titleStats;

    // 2. 累计重量
    stats.totalCaughtWeight = +(stats.totalCaughtWeight + weight).toFixed(3);

    // 3. 单条最重（仅当超过历史时刷新）
    if (weight > stats.bestSingleFishWeight) {
      stats.bestSingleFishWeight = weight;
      stats.bestSingleFishName = species;
      stats.bestSingleFishDate = new Date().toISOString();
    }

    // 4. 称号升级检查（仅升不降；升级后弹气泡）
    //    注意：本回调先于 inventory.fish.push 持久化，但 calculateTitle 走的
    //    是 Save.get('inventory.fish').length —— 上面的 Save.set 已生效在内存，
    //    所以鱼数已是 +1 后的最新值。✅
    const lastTitleId = stats.currentTitleId || 'newbie';
    const newTitle = window.TitleSystem.checkTitleUpgrade(lastTitleId);
    if (newTitle) {
      stats.currentTitleId = newTitle.id;
      console.log(`[TitleSystem] 🎉 称号升级：${lastTitleId} → ${newTitle.id}`);
      if (typeof window.showTitleUpgradeToast === 'function') {
        // 让升级气泡稍微延后到鱼信息淡出后呈现，避免堆叠
        setTimeout(() => window.showTitleUpgradeToast(newTitle), 800);
      }
    }

    // 5. 写回（与下面 Save.commit() 合并一次写盘）
    Save.set('player.titleStats', stats);
  }

  Save.commit();

  // 🆕 PHASE 16-3：异步提交到云端排行榜（fire-and-forget，失败不阻塞游戏）
  // 注意单位换算：fishing-scene.js emit 的 weight 是 kg（如 0.35），而 leaderboard
  // schema 里 weight 单位是克，所以 ×1000 再传。species → name 字段名映射。
  if (window.Leaderboard && typeof weight === 'number' && weight > 0) {
    window.Leaderboard.submitFish({
      name: species,
      weight: Math.round(weight * 1000),
      rarity: rarity || 'common',
    }).catch(e => console.warn('[Leaderboard] 提交失败:', e));
  }
});

// ========================================================
// 首次用户交互：初始化音频（浏览器策略）
// ========================================================
const initAudio = () => {
  AudioSystem.init();
  document.removeEventListener('click', initAudio);
  document.removeEventListener('keydown', initAudio);
};
document.addEventListener('click', initAudio);
document.addEventListener('keydown', initAudio);

// ========================================================
// 静音按钮（右下角）
// ========================================================
function createMuteButton() {
  const btn = document.createElement('button');
  btn.id = 'mute-btn';
  // PHASE 16-4.8 仗2：加 .hud-btn class 接管 hover/active 反馈（css/main.css）
  // 不去动下面的 inline style——inline cursor:pointer 与外部 .hud-btn 规则等价不冲突，
  // 但 inline 没法定义 :hover 伪类，所以靠外部 CSS 通过 class 选择器追加 hover 动画。
  btn.className = 'hud-btn';
  btn.textContent = '🔊';
  btn.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    font-size: 24px;
    background: rgba(0,0,0,0.6);
    color: #fff;
    border: 2px solid #FFD700;
    border-radius: 50%;
    cursor: pointer;
    z-index: 100;
    transition: all 0.2s;
  `;
  btn.title = 'M - 静音切换';
  btn.addEventListener('click', () => toggleMute());
  document.body.appendChild(btn);
}

let muteToastTimeout = null;
function toggleMute() {
  const muted = AudioSystem.toggleMute();
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = muted ? '🔇' : '🔊';
  showMuteToast(muted);
}

function showMuteToast(muted) {
  // 移除旧提示
  const old = document.getElementById('mute-toast');
  if (old) old.remove();
  if (muteToastTimeout) clearTimeout(muteToastTimeout);

  const toast = document.createElement('div');
  toast.id = 'mute-toast';
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 20px 40px;
    background: rgba(0,0,0,0.85);
    color: #FFD700;
    font-size: 32px;
    font-weight: bold;
    border: 3px solid #FFD700;
    border-radius: 12px;
    z-index: 200;
    pointer-events: none;
    animation: toastFade 1s ease-out forwards;
  `;
  toast.textContent = muted ? '🔇 已静音' : '🔊 已开启';
  document.body.appendChild(toast);

  // 添加动画
  const style = document.createElement('style');
  style.textContent = `
    @keyframes toastFade {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
      30% { transform: translate(-50%, -50%) scale(1); }
      70% { opacity: 1; }
      100% { opacity: 0; transform: translate(-50%, -50%) translateY(-20px); }
    }
  `;
  document.head.appendChild(style);

  muteToastTimeout = setTimeout(() => {
    toast.remove();
    style.remove();
  }, 1000);
}

// M 键监听（全局）
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'm') {
    AudioSystem.init(); // 确保已初始化
    toggleMute();
  }
});

// ========================================================
// 全局错误兜底
// ========================================================
window.addEventListener('error', (e) => {
  showErrorOverlay(e.error?.stack || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  showErrorOverlay(e.reason?.stack || String(e.reason));
});

function showErrorOverlay(msg) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.9);
    color: #fff; font-family: monospace; padding: 40px;
    z-index: 9999; overflow: auto;
  `;
  div.innerHTML = `
    <h2 style="color:#ff6b6b">😵 哎哟，游戏出了点小问题</h2>
    <p>请按 F12 打开控制台查看详情，或刷新页面重试。</p>
    <pre style="background:#222;padding:16px;border-radius:8px;font-size:12px;">${msg}</pre>
    <button onclick="location.reload()" style="padding:12px 24px;font-size:16px;cursor:pointer;background:#A83C3C;color:#fff;border:none;border-radius:4px;">🔄 刷新重试</button>
    <button onclick="localStorage.removeItem('bdds_save_v1');location.reload()" style="padding:12px 24px;font-size:16px;cursor:pointer;background:#666;color:#fff;border:none;border-radius:4px;margin-left:12px;">🗑️ 清档重启</button>
  `;
  document.body.appendChild(div);
}

// ========================================================
// 启动游戏
// ========================================================
createMuteButton();

/**
 * PHASE 16-2：进入村庄前确保有昵称
 *   - 已有 → 直接放行
 *   - 没有 → 弹窗强制输入（不可取消）
 *   - PlayerProfile / NicknameDialog 由 profile-system.js / nickname-dialog.js 注入到 window，
 *     在 index.html 中早于本 module 加载，此处可直接使用
 */
async function ensureNickname() {
  // 防御：若 IIFE 未加载（罕见），直接跳过避免阻塞主线
  if (!window.PlayerProfile || !window.NicknameDialog) {
    console.warn('[Bootstrap] PlayerProfile/NicknameDialog 未就绪，跳过昵称检查');
    return;
  }

  // 1. 加载档案（本地 + 云端兜底）
  await window.PlayerProfile.load();

  // 2. 已有昵称 → 直接通过
  if (window.PlayerProfile.hasNickname()) {
    console.log('[Profile] 已有昵称:', window.PlayerProfile.nickname);
    return;
  }

  // 3. 没有昵称 → 弹窗（不可取消）
  console.log('[Profile] 无昵称，弹窗收集中...');
  const nickname = await window.NicknameDialog.open({
    title: '🎣 欢迎来到日月潭！',
    canCancel: false,
  });

  // 4. 保存（云端失败不阻塞）
  if (nickname) {
    try {
      await window.PlayerProfile.saveNickname(nickname);
      console.log('[Profile] 昵称已保存:', nickname);
    } catch (e) {
      console.error('[Profile] 保存昵称失败:', e && e.message);
      // 仅本地校验类错误（如 ">12 字"）才会到这；UI 已经拦截，此处兜底
    }
  }
}

// PHASE 16-2 修复：昵称弹窗时机改为"点击开始游戏后"才触发，
//   故这里不再于 bootstrap 阶段调用 ensureNickname，
//   而是由 village-scene._skipIntro 在玩家点击开始游戏时统一调用。
//   暴露到全局供 village-scene.js 调用：
window.ensureNickname = ensureNickname;

// PHASE 16-3 修复：PlayerProfile.load() 必须在场景启动前就执行，
//   否则任何"绕过开始按钮"的路径（GM 命令、调试入口、热刷新后 Save 已存在等）
//   都会让 PlayerProfile.nickname 一直是 null，导致 Leaderboard.submitFish
//   走入"无昵称"分支、丢失分数。
//   load() 内部会兼容 localStorage 已有数据（直接读出），无昵称时不会弹窗
//   （弹窗仍由 ensureNickname 在点击"开始游戏"时触发），故这里 fire-and-forget
//   也安全；但用 await 更稳，能保证 nickname 在场景渲染第一帧前已就绪。
(async () => {
  try {
    if (window.PlayerProfile && typeof window.PlayerProfile.load === 'function') {
      await window.PlayerProfile.load();
    }
  } catch (e) {
    console.warn('[Bootstrap] PlayerProfile.load() 失败（不阻塞游戏）:', e && e.message);
  }
  SceneManager.switchToInstant('village');

  // PHASE 16-9：村庄场景已就绪，主动通知 splash 隐藏
  //   原本 splash-loader.js 通过轮询 SceneManager.current === 'village' 自行收尾，
  //   但海外网络下 main.js booted 时刻可能已经接近 / 超过全局兜底时长，
  //   主动 hide 能确保 splash 在"游戏真正可玩"那一刻精准消失，
  //   而不是被全局 setTimeout 兜底提前 / 延后触发。
  //   带 isHidden 守卫避免与轮询路径重复 hide（hide 自身也已幂等）。
  if (window.SplashLoader && !window.SplashLoader.isHidden()) {
    window.SplashLoader.hide();
  }
})();