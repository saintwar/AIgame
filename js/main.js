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
SceneManager.switchToInstant('village');