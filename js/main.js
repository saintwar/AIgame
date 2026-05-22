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

// 注册场景
SceneManager.register('village', VillageScene);
SceneManager.register('fishing', FishingScene);

// 初始化存档
const saveData = Save.load();
console.log('📁 存档已加载:', saveData);

// 初始化背包系统
window.inventory = new InventorySystem(Save);

// 首次新建存档时给予初始物资
if (Object.keys(Save.get('player.inventory') || {}).length === 0) {
  window.inventory.add('basic_rod', 1);
  window.inventory.add('basic_bait', 5);
  console.log('🎒 初始物资已发放：入门钓竿 ×1、初级鱼饵 ×5');
}

// 初始化鱼类图鉴系统
window.codex = new CodexSystem(Save.get('player'), Save);

// 初始化装备系统
window.equipment = new EquipmentSystem(Save.get('player'), window.inventory, Save);

// 监听钓鱼事件（用于更新存档）
SceneManager.on('fish_caught', ({ species, weight, price, rarity }) => {
  console.log(`📥 钓获入库: ${species} (${weight}kg, $${price})`);
  const inventory = Save.get('inventory') || { fish: [] };
  inventory.fish.push({ species, weight, price, rarity, caughtAt: Date.now() });
  Save.set('inventory', inventory);
  Save.set('player.money', (Save.get('player.money') || 0) + price);
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
})();