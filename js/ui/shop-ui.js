import { ITEMS } from '../data/items.js';
import { SHUISHE_FISH_POOL } from '../data/fish-pool.js';

export class ShopUI {
  constructor(canvas, inventory, equipment, questSystem) {
    this.canvas = canvas;
    this.inventory = inventory;
    this.equipment = equipment;
    this.questSystem = questSystem;
    this.visible = false;
    this.mode = 'menu';        // menu / buy / sell
    this.selectedIdx = 0;

    // 林师傅出售清单
    this.linBuyList = ['bamboo_rod', 'carbon_rod', 'advanced_bait', 'legendary_bait'];
  }

  openLinShop() {
    this.visible = true;
    this.mode = 'menu';
    this.selectedIdx = 0;
  }

  hide() { this.visible = false; }

  handleKey(key) {
    if (!this.visible) return false;
    if (key === 'Escape' || key === 'b') {
      if (this.mode === 'menu') this.hide();
      else this.mode = 'menu';
      return true;
    }

    if (this.mode === 'menu') {
      if (key === '1') { this.mode = 'buy';  this.selectedIdx = 0; return true; }
      if (key === '2') { this.mode = 'sell'; this.selectedIdx = 0; return true; }
      return false;
    }

    if (this.mode === 'buy') {
      if (key === 'ArrowUp')   { this.selectedIdx = Math.max(0, this.selectedIdx - 1); return true; }
      if (key === 'ArrowDown') { this.selectedIdx = Math.min(this.linBuyList.length - 1, this.selectedIdx + 1); return true; }
      if (key === 'Enter' || key === ' ') {
        this._buyItem();
        return true;
      }
      return false;
    }

    if (this.mode === 'sell') {
      const fishBag = window.Save?.get('player.fishBag') || [];
      if (fishBag.length === 0) return false;
      if (key === 'ArrowUp')   { this.selectedIdx = Math.max(0, this.selectedIdx - 1); return true; }
      if (key === 'ArrowDown') { this.selectedIdx = Math.min(fishBag.length - 1, this.selectedIdx + 1); return true; }
      if (key === 'Enter' || key === ' ') {
        this._sellOne();
        return true;
      }
      if (key === 'a') {
        this._sellAll();
        return true;
      }
      return false;
    }
    return false;
  }

  _buyItem() {
    const itemId = this.linBuyList[this.selectedIdx];
    const item = ITEMS[itemId];
    if (!item) return;
    if (item.category === 'rod' && this.inventory.has(itemId)) {
      this._toast('已经拥有这个钓竿了！');
      return;
    }
    if (!this.inventory.spendCoin(item.price)) {
      this._toast('金币不足！');
      return;
    }
    this.inventory.add(itemId, 1);
    this._toast(`✅ 购买成功：${item.name}`);
  }

  _sellOne() {
    const fishBag = window.Save?.get('player.fishBag');
    if (!fishBag || fishBag.length === 0) return;
    if (this.selectedIdx >= fishBag.length) this.selectedIdx = 0;
    const fish = fishBag[this.selectedIdx];
    const price = this.inventory.sellFish(fish);
    fishBag.splice(this.selectedIdx, 1);
    if (this.selectedIdx >= fishBag.length) this.selectedIdx = Math.max(0, fishBag.length - 1);
    window.Save.set('player.fishBag', fishBag);
    window.Save.commit();
    this._toast(`💰 +${price} 金 (${fish.species} ${fish.size}cm)`);
  }

  _sellAll() {
    const fishBag = window.Save?.get('player.fishBag') || [];
    if (fishBag.length === 0) return;
    let total = 0;
    fishBag.forEach(fish => { total += this.inventory.sellFish(fish); });
    window.Save.set('player.fishBag', []);
    this.selectedIdx = 0;
    window.Save.commit();
    this._toast(`💰 全部售出：+${total} 金`);
  }

  _toast(msg) {
    if (window.toastSystem) window.toastSystem.show(msg);
    else console.log(msg);
  }

  render(ctx) {
    if (!this.visible) return;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 1280, 720);

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
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('🎣 林师傅钓具店', x + 30, y + 50);

    // 金币
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${this.inventory.getCoin()} 金`, x + w - 30, y + 50);
    ctx.textAlign = 'left';

    if (this.mode === 'menu') this._renderMenu(ctx, x, y, w, h);
    else if (this.mode === 'buy') this._renderBuy(ctx, x, y, w, h);
    else if (this.mode === 'sell') this._renderSell(ctx, x, y, w, h);

    ctx.fillStyle = '#888';
    ctx.font = '16px "Cubic 11", "Noto Sans TC", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ESC/B 返回', x + 30, y + h - 20);
  }

  _renderMenu(ctx, x, y, w, h) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('1. 🛒 购买装备', x + 80, y + 200);
    ctx.fillText('2. 🐟 出售鱼货', x + 80, y + 280);

    const fishBag = window.Save?.get('player.fishBag') || [];
    ctx.fillStyle = '#aaa';
    ctx.font = '20px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText(`(当前鱼货 ${fishBag.length} 条)`, x + 380, y + 280);

    ctx.fillStyle = '#888';
    ctx.font = '18px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('按数字键选择', x + 80, y + 360);
  }

  _renderBuy(ctx, x, y, w, h) {
    ctx.fillStyle = '#aaccdd';
    ctx.font = 'bold 22px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('🛒 购买商品', x + 30, y + 90);

    this.linBuyList.forEach((itemId, i) => {
      const item = ITEMS[itemId];
      if (!item) return;
      const iy = y + 120 + i * 70;
      const owned = item.category === 'rod' ? this.inventory.has(itemId) : false;
      const selected = i === this.selectedIdx;

      ctx.fillStyle = selected ? 'rgba(212,165,116,0.3)' : 'transparent';
      ctx.fillRect(x + 20, iy, w - 40, 60);

      ctx.font = '36px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.icon, x + 35, iy + 30);

      ctx.font = 'bold 22px "Cubic 11", "Noto Sans TC", monospace';
      ctx.fillStyle = owned ? '#7CFC00' : '#fff';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${item.name}${owned ? ' ✅已拥有' : ''}`, x + 90, iy + 28);

      ctx.fillStyle = '#bbb';
      ctx.font = '15px "Cubic 11", "Noto Sans TC", monospace';
      ctx.fillText(item.desc, x + 90, iy + 50);

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px "Cubic 11", "Noto Sans TC", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${item.price} 金`, x + w - 40, iy + 38);
      ctx.textAlign = 'left';
    });

    ctx.fillStyle = '#888';
    ctx.font = '14px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('↑↓ 选择   Enter/Space 购买', x + 30, y + h - 50);
  }

  _renderSell(ctx, x, y, w, h) {
    ctx.fillStyle = '#aaccdd';
    ctx.font = 'bold 22px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText('🐟 出售鱼货', x + 30, y + 90);

    const fishBag = window.Save?.get('player.fishBag') || [];
    if (fishBag.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '20px "Cubic 11", "Noto Sans TC", monospace';
      ctx.fillText('鱼篓空空，先去钓鱼吧～', x + 80, y + 200);
      return;
    }

    // 滚动列表（只显示 6 行）
    const visibleStart = Math.max(0, this.selectedIdx - 3);
    const visibleEnd = Math.min(fishBag.length, visibleStart + 6);

    for (let i = visibleStart; i < visibleEnd; i++) {
      const fish = fishBag[i];
      const iy = y + 120 + (i - visibleStart) * 50;
      const selected = i === this.selectedIdx;

      // 估价
      const fishData = SHUISHE_FISH_POOL.find(f => f.species === fish.species);
      const sizeRange = fishData ? fishData.sizeRange : [10, 60];
      const ratio = sizeRange[1] > sizeRange[0] ? (fish.size - sizeRange[0]) / (sizeRange[1] - sizeRange[0]) : 0;
      let mul = 1.0;
      if (ratio > 0.8) mul = 2.0;
      else if (ratio > 0.5) mul = 1.5;
      else if (ratio > 0.3) mul = 1.2;
      const price = Math.round(fish.basePrice * mul);

      ctx.fillStyle = selected ? 'rgba(212,165,116,0.3)' : (i % 2 === 0 ? 'rgba(212,165,116,0.05)' : 'transparent');
      ctx.fillRect(x + 20, iy, w - 40, 45);

      ctx.fillStyle = '#fff';
      ctx.font = '20px "Cubic 11", "Noto Sans TC", monospace';
      ctx.fillText(`${fish.species} (${fish.size}cm)`, x + 40, iy + 30);

      ctx.fillStyle = mul >= 2.0 ? '#FF69B4' : (mul >= 1.5 ? '#7CFC00' : '#ffd700');
      ctx.font = 'bold 20px "Cubic 11", "Noto Sans TC", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${price} 金${mul > 1 ? ' ×' + mul.toFixed(1) : ''}`, x + w - 40, iy + 30);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = '#888';
    ctx.font = '14px "Cubic 11", "Noto Sans TC", monospace';
    ctx.fillText(`鱼篓 ${fishBag.length} 条   ↑↓ 选择   Enter 单卖   A 全卖`, x + 30, y + h - 50);
  }
}
