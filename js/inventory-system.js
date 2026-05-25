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

  // 卖鱼专用方法（PHASE 16-6 仗2 修订：统一公式 ceil(basePrice × rarityMul × sizeMul)）
  //
  // 设计契约：
  //   - 单一真理来源：本方法是全工程唯一的鱼价计算入口；
  //     ShopUI 渲染显示价时也调 computeFishPrice()，避免显示价 ≠ 实卖价。
  //   - rarityMul 三档（决策 C）：
  //       rarity 1     → ×1 (普通)
  //       rarity 2-3   → ×2 (稀有)
  //       rarity 4-5   → ×4 (史诗)
  //   - sizeMul = clamp(weight / 鱼种标准均重, 0.7, 2.0)
  //       weight(g) = size(cm) × 10（沿用 fish-storage 的占位换算）
  //       鱼种标准均重 = (sizeRange.min + sizeRange.max) / 2 × 10 (g)
  //   - 最终向上取整 Math.ceil
  //   - 老存档/无 sizeRange 鱼兜底：sizeMul = 1.0
  sellFish(fish) {
    const { species, size } = fish;
    const finalPrice = this.computeFishPrice(fish);
    this.addCoin(finalPrice);
    // 派发事件（保持原 mul 字段用于动画/任务回调，按"综合倍率"算）
    const mul = (fish.basePrice && fish.basePrice > 0)
      ? finalPrice / fish.basePrice
      : 1.0;
    this._emit('fish_sold', { species, size, price: finalPrice, mul });
    if (window.questSystem) {
      window.questSystem.onFishSold({ species, size, price: finalPrice, mul });
    }
    return finalPrice;
  }

  /**
   * 估算单条鱼售价（不扣鱼、不加金、纯只读）。
   * ShopUI 列表显示用；与 sellFish 共用同一公式。
   */
  computeFishPrice(fish) {
    if (!fish) return 0;
    const basePrice = fish.basePrice || 0;
    if (basePrice <= 0) return 0;

    // rarity 三档
    const rarity = fish.rarity || 1;
    let rarityMul = 1;
    if (rarity >= 4)      rarityMul = 4;   // 史诗
    else if (rarity >= 2) rarityMul = 2;   // 稀有
    else                  rarityMul = 1;   // 普通

    // size 相对鱼种标准均重的倍率
    const fishData = SHUISHE_FISH_POOL.find(f => f.species === fish.species);
    let sizeMul = 1.0;
    if (fishData && Array.isArray(fishData.sizeRange) && fishData.sizeRange.length === 2) {
      const [minS, maxS] = fishData.sizeRange;
      const standardSize = (minS + maxS) / 2;
      if (standardSize > 0 && fish.size > 0) {
        sizeMul = fish.size / standardSize;
        // clamp 0.7 ~ 2.0
        if (sizeMul < 0.7) sizeMul = 0.7;
        else if (sizeMul > 2.0) sizeMul = 2.0;
      }
    }

    return Math.ceil(basePrice * rarityMul * sizeMul);
  }

  /**
   * 鱼稀有度名称（UI 显示用）
   * @param {number} rarity
   * @returns {{ name:string, color:string }}
   */
  static rarityInfo(rarity) {
    if (rarity >= 4) return { name: '史诗', color: '#A06CD5' }; // 紫
    if (rarity >= 2) return { name: '稀有', color: '#4FC3F7' }; // 蓝
    return { name: '普通', color: '#AAAAAA' };                  // 灰
  }
}
