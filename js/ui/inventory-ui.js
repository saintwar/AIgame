import { ITEMS } from '../data/items.js';

export class InventoryUI {
  constructor(canvas, inventory) {
    this.canvas = canvas;
    this.inventory = inventory;
    this.visible = false;
    this.currentTab = 'bait';
    this.tabs = [
      { key: 'bait',     label: '🪱 鱼饵' },
      { key: 'rod',      label: '🎣 钓竿' },
      { key: 'material', label: '🐠 材料' },
      { key: 'misc',     label: '📦 杂项' }
    ];
  }

  toggle() { this.visible = !this.visible; }
  hide()   { this.visible = false; }

  handleKey(key) {
    if (!this.visible) return false;
    if (key === 'escape' || key === 'b') {
      this.hide(); return true;
    }
    // Tab 切换
    if (key === 'tab') {
      const idx = this.tabs.findIndex(t => t.key === this.currentTab);
      this.currentTab = this.tabs[(idx + 1) % this.tabs.length].key;
      return true;
    }
    // 数字键快速切换
    if (['1','2','3','4'].includes(key)) {
      this.currentTab = this.tabs[parseInt(key)-1].key;
      return true;
    }
    return false;
  }

  render(ctx) {
    if (!this.visible) return;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, 1280, 720);

    // 主面板（居中 800×540）
    const x = 240, y = 90, w = 800, h = 540;
    ctx.fillStyle = '#2d1b0e';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('🎒 阿明的背包', x + 30, y + 50);

    // 金币显示（右上）
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${this.inventory.getCoin()} 金`, x + w - 30, y + 50);
    ctx.textAlign = 'left';

    // Tab 栏
    const tabY = y + 80;
    this.tabs.forEach((tab, i) => {
      const tx = x + 30 + i * 185;
      const active = tab.key === this.currentTab;
      ctx.fillStyle = active ? '#d4a574' : '#5a3a1f';
      ctx.fillRect(tx, tabY, 175, 40);
      ctx.fillStyle = active ? '#2d1b0e' : '#d4a574';
      ctx.font = '20px "Cubic 11", "Noto Sans TC", monospace';
      ctx.fillText(tab.label, tx + 15, tabY + 27);
    });

    // 物品列表
    const items = this.inventory.getByCategory(this.currentTab);
    const listY = tabY + 60;
    if (items.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '20px "Cubic 11", "Noto Sans TC", monospace';
      ctx.fillText('（这一类还没有物品）', x + 40, listY + 30);
    } else {
      items.forEach((item, i) => {
        const iy = listY + i * 60;
        // 物品行背景
        ctx.fillStyle = i % 2 === 0 ? 'rgba(212,165,116,0.1)' : 'transparent';
        ctx.fillRect(x + 30, iy, w - 60, 55);
        // 图标
        ctx.font = '36px sans-serif';
        ctx.fillText(item.icon, x + 45, iy + 40);
        // 名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px "Cubic 11", "Noto Sans TC", monospace';
        ctx.fillText(`${item.name} ×${item.count}`, x + 100, iy + 28);
        // 已装备标记
        if (item.category === 'rod' && window.equipment && window.equipment.getEquippedRod().id === item.id) {
          ctx.fillStyle = '#7CFC00';
          ctx.font = 'bold 18px "Cubic 11", "Noto Sans TC", monospace';
          ctx.textAlign = 'right';
          ctx.fillText('⚔️ 已装备', x + w - 40, iy + 28);
          ctx.textAlign = 'left';
        }
        // 描述
        ctx.fillStyle = '#bbb';
        ctx.font = '16px "Cubic 11", "Noto Sans TC", monospace';
        ctx.fillText(item.desc, x + 100, iy + 48);
      });
    }

    // 底部提示
    ctx.fillStyle = '#888';
    ctx.font = '16px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('Tab/1-4 切换分类   B/ESC 关闭', x + 30, y + h - 20);
  }
}
