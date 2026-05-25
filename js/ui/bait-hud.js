/**
 * BaitHUD — 钓鱼场景顶部正中鱼饵切换器（DOM 常驻 HUD）
 * PHASE 16-6 仗4
 * ────────────────────────────────────────────────────────
 * 设计：
 *   - DOM 弹窗常驻（非弹出面板，HUD 即面板）
 *   - 顶部正中 fixed，3 档鱼饵图标横排
 *   - 当前装备的鱼饵高亮边框 + 库存为 0 时灰显
 *   - 点击切换 / 数字键 1/2/3 切换（数字键由 fishing-scene 派发）
 *   - 鼠标 hover 显示效果说明（tooltip）
 *
 * 生命周期：
 *   - fishing-scene start 时 mount()，destroy 时 unmount()
 *   - 切换鱼饵 / 消耗鱼饵 / 库存变化时调用 render() 刷新
 *
 * 全局别名：window.fishingHUD（fishing-scene 切换鱼饵后通知刷新）
 */

import { BAIT_EFFECTS, BAIT_ORDER } from '../data/bait-effects.js';

class BaitHUD {
  constructor() {
    this.root = null;
    this._onSwitch = null;  // 由 fishing-scene 注入
  }

  /**
   * @param {(index:number)=>void} onSwitch 点击切换回调（同数字键 1/2/3）
   */
  mount(onSwitch) {
    this._onSwitch = onSwitch;
    if (this.root) this.unmount();
    const root = document.createElement('div');
    root.id = 'bait-hud';
    root.className = 'bait-hud';
    root.innerHTML = `
      <div class="bait-hud-label">鱼饵</div>
      <div class="bait-hud-slots"></div>
      <div class="bait-hud-hint">数字键 1/2/3 或点击切换</div>
    `;
    // PHASE 16-6 仗4 HOTFIX：挂到 #fishing-scene（或 #game-root）而不是 body。
    //   原因：#game-root 在窄屏下有 transform: scale(...)，position:fixed 会
    //   脱离 transform 上下文相对 viewport 定位，结果 HUD 飘到画布黑边外、
    //   且窄 viewport 把 flex 子项压成纵列。改用 absolute 挂到画布容器内，
    //   既能跟随缩放，也能锚定在 1280×720 设计坐标系的顶部正中。
    const host =
      document.getElementById('fishing-scene') ||
      document.getElementById('game-root') ||
      document.body;
    host.appendChild(root);
    this.root = root;
    this.render();
  }

  unmount() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    this._onSwitch = null;
  }

  /**
   * PHASE 16-6 仗4 HOTFIX2：HUD 显隐控制
   *   主策划要求：仅在抛竿前（Idle/Aiming）显示，水下拉扯 / 鱼获结算期间隐藏
   *   实现：切换 .hidden class，CSS transition 0.18s 软淡入淡出
   * @param {boolean} visible
   */
  setVisible(visible) {
    if (!this.root) return;
    this.root.classList.toggle('hidden', !visible);
  }

  render() {
    if (!this.root) return;
    const slotsEl = this.root.querySelector('.bait-hud-slots');
    if (!slotsEl) return;
    const equippedId = window.Save?.get('player.equippedBait') || 'basic_bait';
    slotsEl.innerHTML = '';
    BAIT_ORDER.forEach((baitId, index) => {
      const effect = BAIT_EFFECTS[baitId];
      const count = window.inventory ? window.inventory.getCount(baitId) : 0;
      const isEquipped = equippedId === baitId;
      const isEmpty = count <= 0;
      const slot = document.createElement('div');
      slot.className = 'bait-slot';
      if (isEquipped) slot.classList.add('equipped');
      if (isEmpty) slot.classList.add('empty');
      slot.innerHTML = `
        <div class="bait-slot-key">${index + 1}</div>
        <div class="bait-slot-icon">${effect.icon}</div>
        <div class="bait-slot-name">${effect.name}</div>
        <div class="bait-slot-count">${count}</div>
        <div class="bait-slot-tooltip">
          <div class="bait-slot-tooltip-title">${effect.icon} ${effect.name}</div>
          <div class="bait-slot-tooltip-desc">${effect.description}</div>
          <div class="bait-slot-tooltip-key">按 ${index + 1} 装备</div>
        </div>
      `;
      slot.addEventListener('click', () => {
        if (this._onSwitch) this._onSwitch(index);
      });
      slotsEl.appendChild(slot);
    });
  }
}

// 单例 + 全局别名
const baitHUD = new BaitHUD();
if (typeof window !== 'undefined') {
  window.fishingHUD = baitHUD;
}

export default baitHUD;
