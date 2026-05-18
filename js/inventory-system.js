import { ITEMS } from './data/items.js';
import { SHUISHE_FISH_POOL } from './data/fish-pool.js';

export class InventorySystem {
  constructor(saveSystem) {
    this.save = saveSystem;
    // 确保 player.inventory 和 player.coin 存在
    if (!this.save.get('player.inventory')) {
      this.save.set('player.inventory', {});
    }
    if (this.save.get('player.coin') == null) {
      this.save.set('player.coin', 0);
    }
    this.listeners = [];
  }

  // 获取整个背包对象
  getInventory() {
    return this.save.get('player.inventory') || {};
  }

  // 增加物品，返回 true 表示成功
  add(itemId, count = 1) {
    if (!ITEMS[itemId]) {
      console.warn(`[Inventory] 未知物品 ${itemId}`);
      return false;
    }
    const inv = this.getInventory();
    inv[itemId] = (inv[itemId] || 0) + count;
    this.save.set('player.inventory', inv);
    this._emit('item_added', { itemId, count });
    this.save.commit();
    return true;
  }

  // 消耗物品，返回 true 表示成功
  remove(itemId, count = 1) {
    const inv = this.getInventory();
    const cur = inv[itemId] || 0;
    if (cur < count) return false;
    inv[itemId] = cur - count;
    if (inv[itemId] === 0) delete inv[itemId];
    this.save.set('player.inventory', inv);
    this._emit('item_removed', { itemId, count });
    this.save.commit();
    return true;
  }

  has(itemId, count = 1) {
    return (this.getInventory()[itemId] || 0) >= count;
  }

  getCount(itemId) {
    return this.getInventory()[itemId] || 0;
  }

  // 金币操作
  getCoin() {
    return this.save.get('player.coin') || 0;
  }

  addCoin(n) {
    const coin = this.getCoin() + n;
    this.save.set('player.coin', coin);
    this._emit('coin_changed', coin);
    this.save.commit();
  }

  spendCoin(n) {
    const coin = this.getCoin();
    if (coin < n) return false;
    this.save.set('player.coin', coin - n);
    this._emit('coin_changed', coin - n);
    this.save.commit();
    return true;
  }

  // 按分类返回物品列表
  getByCategory(category) {
    const inv = this.getInventory();
    return Object.entries(inv)
      .filter(([id]) => ITEMS[id]?.category === category)
      .map(([id, count]) => ({ ...ITEMS[id], count }));
  }

  on(event, fn) { this.listeners.push({ event, fn }); }
  off(event, fn) {
    this.listeners = this.listeners.filter(l => !(l.event === event && l.fn === fn));
  }
  _emit(event, data) { this.listeners.filter(l => l.event === event).forEach(l => l.fn(data)); }

  // 卖鱼专用方法（按尺寸加成）
  sellFish({ species, size, rarity, basePrice }) {
    const fishData = SHUISHE_FISH_POOL.find(f => f.species === species);
    const sizeRange = fishData?.sizeRange || [10, 60];
    const [minS, maxS] = sizeRange;
    const sizeRatio = maxS > minS ? (size - minS) / (maxS - minS) : 0;
    let mul = 1.0;
    if (sizeRatio > 0.8) mul = 2.0;
    else if (sizeRatio > 0.5) mul = 1.5;
    else if (sizeRatio > 0.3) mul = 1.2;

    const finalPrice = Math.round(basePrice * mul);
    this.addCoin(finalPrice);
    this._emit('fish_sold', { species, size, price: finalPrice, mul });
    // 触发任务系统 onFishSold 钩子
    if (window.questSystem) {
      window.questSystem.onFishSold({ species, size, price: finalPrice, mul });
    }
    return finalPrice;
  }
}
