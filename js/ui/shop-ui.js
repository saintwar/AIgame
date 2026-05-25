import { ITEMS } from '../data/items.js';
import { InventorySystem } from '../inventory-system.js';
import { syncFishStorage } from '../fish-storage.js';

/**
 * ShopUI（PHASE 16-6 仗2 重构）
 *
 * 职责：村庄两家店铺的统一 UI
 *   - 林师傅钓具店：openLinShop({ buyOnly: true })  → 仅卖钓具（决策 B 后只读购买）
 *   - 秀兰阿姨鱼摊：openXiulanShop()                → 直进 sell 模式，专门收购鱼
 *
 * 关键约束（决策 B / C）：
 *   1) 林师傅不再收鱼；卖鱼业务完整迁移到秀兰
 *   2) 鱼价统一用 InventorySystem.computeFishPrice / sellFish，不再本地复算
 *   3) 卖鱼后必须同步 fishStorage（仗 1 后不同步会导致渔获分类显示错）
 *   4) 售出飘字用 _showCoinFloat（金色 +¥X 动画）
 */
export class ShopUI {
  constructor(canvas, inventory, equipment, questSystem) {
    this.canvas = canvas;
    this.inventory = inventory;
    this.equipment = equipment;
    this.questSystem = questSystem;
    this.visible = false;
    this.mode = 'menu';        // menu / buy / sell
    this.selectedIdx = 0;

    // 店铺身份：'lin' | 'xiulan'
    this.shopOwner = 'lin';
    // 林师傅 buyOnly 模式（决策 B：林师傅不收鱼）
    this.buyOnly = false;

    // 林师傅出售清单
    this.linBuyList = ['bamboo_rod', 'carbon_rod', 'advanced_bait', 'legendary_bait'];
  }

  // ─── 店铺入口 ─────────────────────────────────────────────
  /**
   * 林师傅钓具店
   * @param {{ buyOnly?: boolean }} opts buyOnly=true 时跳过 menu 直接进 buy 模式
   */
  openLinShop(opts = {}) {
    this.shopOwner = 'lin';
    this.buyOnly = !!opts.buyOnly;
    this.visible = true;
    // PHASE 16-6 仗2：林师傅 buyOnly → 直接进 buy；保留兼容路径（无参→menu，但 menu 也只剩购买项）
    this.mode = this.buyOnly ? 'buy' : 'menu';
    this.selectedIdx = 0;
  }

  /**
   * 秀兰阿姨鱼摊（PHASE 16-6 仗2）
   * 直进 sell 模式，跳过 menu —— 她不卖东西、只收鱼。
   */
  openXiulanShop() {
    this.shopOwner = 'xiulan';
    this.buyOnly = false;
    this.visible = true;
    this.mode = 'sell';
    this.selectedIdx = 0;
  }

  hide() { this.visible = false; }

  // ─── 输入 ─────────────────────────────────────────────────
  // 注意：village-scene 的 _keyHandler 已对 e.key 做 toLowerCase，
  //       传入 handleKey 的 key 永远是小写串（'escape' / 'arrowup' / 'enter' / ' ' / '1' / 'a' / 'b'）。
  //       本方法所有比较都用小写，避免历史上 'Escape' 永不匹配的 bug。
  handleKey(key) {
    if (!this.visible) return false;
    if (key === 'escape' || key === 'b') {
      const menuLess = (this.shopOwner === 'xiulan') || (this.shopOwner === 'lin' && this.buyOnly);
      if (this.mode === 'menu' || menuLess) this.hide();
      else this.mode = 'menu';
      return true;
    }

    if (this.mode === 'menu') {
      if (key === '1') { this.mode = 'buy';  this.selectedIdx = 0; return true; }
      // PHASE 16-6 仗2：林师傅菜单移除"出售鱼货"（鱼让秀兰收）
      return false;
    }

    if (this.mode === 'buy') {
      if (key === 'arrowup')   { this.selectedIdx = Math.max(0, this.selectedIdx - 1); return true; }
      if (key === 'arrowdown') { this.selectedIdx = Math.min(this.linBuyList.length - 1, this.selectedIdx + 1); return true; }
      if (key === 'enter' || key === ' ') {
        this._buyItem();
        return true;
      }
      return false;
    }

    if (this.mode === 'sell') {
      const fishBag = window.Save?.get('player.fishBag') || [];
      if (fishBag.length === 0) return false;
      if (key === 'arrowup')   { this.selectedIdx = Math.max(0, this.selectedIdx - 1); return true; }
      if (key === 'arrowdown') { this.selectedIdx = Math.min(fishBag.length - 1, this.selectedIdx + 1); return true; }
      if (key === 'enter' || key === ' ') {
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

  // ─── 业务 ─────────────────────────────────────────────────
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

    // PHASE 16-6 仗2：同步 fishStorage（仗 1 后必须）—— 全量重算最稳
    const player = window.Save.get('player');
    syncFishStorage(player);
    window.Save.set('player', player);
    window.Save.commit();

    // 飘字：金色 +¥X
    this._showCoinFloat(`+¥${price}`, `${fish.species} ${fish.size}cm`);
  }

  _sellAll() {
    const fishBag = window.Save?.get('player.fishBag') || [];
    if (fishBag.length === 0) return;
    let total = 0;
    fishBag.forEach(fish => { total += this.inventory.sellFish(fish); });
    window.Save.set('player.fishBag', []);
    this.selectedIdx = 0;

    // PHASE 16-6 仗2：同步 fishStorage（清空所有 items）
    const player = window.Save.get('player');
    syncFishStorage(player);
    window.Save.set('player', player);
    window.Save.commit();

    this._showCoinFloat(`+¥${total}`, '全部售出');
  }

  // ─── 飘字 ─────────────────────────────────────────────────
  _toast(msg) {
    if (window.toastSystem) window.toastSystem.show(msg);
    else console.log(msg);
  }

  /**
   * 金币飘字（PHASE 16-6 仗2）
   * 复用 village-scene._showRewardToast 的风格（金边/金字/居中弹跳）。
   * 无依赖：直接 DOM 注入，不需要 scene 句柄。
   */
  _showCoinFloat(big, sub) {
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 30%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 14px 28px;
      background: rgba(0,0,0,0.82);
      border: 3px solid #FFD700;
      border-radius: 12px;
      z-index: 600;
      pointer-events: none;
      text-align: center;
      animation: coinFloatFade 1.6s ease-out forwards;
    `;
    div.innerHTML = `
      <div style="font:bold 36px 'TencentSans','Noto Sans TC',sans-serif;color:#FFD700;text-shadow:0 0 12px #FFD700;">${big}</div>
      ${sub ? `<div style="font:18px 'TencentSans',sans-serif;color:#fff;opacity:.85;margin-top:4px">${sub}</div>` : ''}
    `;
    if (!document.getElementById('coin-float-style')) {
      const style = document.createElement('style');
      style.id = 'coin-float-style';
      style.textContent = `
        @keyframes coinFloatFade {
          0%   { opacity: 0; transform: translate(-50%, -40%) scale(0.5); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
          30%  { transform: translate(-50%, -50%) scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -75%) scale(1); }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1600);
  }

  // ─── 渲染 ─────────────────────────────────────────────────
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

    // 标题（按店主切换）
    const title = (this.shopOwner === 'xiulan')
      ? '🐟 秀兰阿姨鱼摊'
      : '🎣 林师傅钓具店';
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, x + 30, y + 50);

    // 金币
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px "TencentSansW7", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${this.inventory.getCoin()} 金`, x + w - 30, y + 50);
    ctx.textAlign = 'left';

    if (this.mode === 'menu') this._renderMenu(ctx, x, y, w, h);
    else if (this.mode === 'buy') this._renderBuy(ctx, x, y, w, h);
    else if (this.mode === 'sell') this._renderSell(ctx, x, y, w, h);

    ctx.fillStyle = '#888';
    ctx.font = '16px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    // 底部操作提示按 mode/owner 调整
    let escHint = 'ESC/B 关闭';
    if (this.shopOwner === 'lin' && !this.buyOnly && this.mode !== 'menu') {
      escHint = 'ESC/B 返回菜单';
    }
    ctx.fillText(escHint, x + 30, y + h - 20);
  }

  _renderMenu(ctx, x, y, w, h) {
    // PHASE 16-6 仗2：菜单只剩"购买装备"（决策 B：林师傅不收鱼）
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px "TencentSansW7", sans-serif';
    ctx.fillText('1. 🛒 购买装备', x + 80, y + 200);

    ctx.fillStyle = '#888';
    ctx.font = '18px "TencentSansW7", sans-serif';
    ctx.fillText('按 [1] 进入购买', x + 80, y + 280);

    ctx.fillStyle = '#aaa';
    ctx.font = '16px "TencentSansW7", sans-serif';
    ctx.fillText('💡 卖鱼请去找村口的秀兰阿姨', x + 80, y + 360);
  }

  _renderBuy(ctx, x, y, w, h) {
    ctx.fillStyle = '#aaccdd';
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
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

      ctx.font = 'bold 22px "TencentSansW7", sans-serif';
      ctx.fillStyle = owned ? '#7CFC00' : '#fff';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${item.name}${owned ? ' ✅已拥有' : ''}`, x + 90, iy + 28);

      ctx.fillStyle = '#bbb';
      ctx.font = '15px "TencentSansW7", sans-serif';
      ctx.fillText(item.desc, x + 90, iy + 50);

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px "TencentSansW7", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${item.price} 金`, x + w - 40, iy + 38);
      ctx.textAlign = 'left';
    });

    ctx.fillStyle = '#888';
    ctx.font = '14px "TencentSansW7", sans-serif';
    ctx.fillText('↑↓ 选择   Enter/Space 购买', x + 30, y + h - 50);
  }

  _renderSell(ctx, x, y, w, h) {
    // PHASE 16-6 仗2：UI 重做
    //   - 标题随店主切换（"鱼货收购" / "出售鱼货"）
    //   - 每行：🐟 名 + 重量 + 稀有度色标 + 估价（统一公式）
    //   - 底部"按 A 全部出售"提示固定显示
    const subtitle = (this.shopOwner === 'xiulan') ? '🐟 鱼货收购' : '🐟 出售鱼货';
    ctx.fillStyle = '#aaccdd';
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(subtitle, x + 30, y + 90);

    const fishBag = window.Save?.get('player.fishBag') || [];
    if (fishBag.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '20px "TencentSansW7", sans-serif';
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

      // 行背景
      ctx.fillStyle = selected
        ? 'rgba(212,165,116,0.3)'
        : (i % 2 === 0 ? 'rgba(212,165,116,0.05)' : 'transparent');
      ctx.fillRect(x + 20, iy, w - 40, 45);

      // 估价（统一公式）
      const price = this.inventory.computeFishPrice(fish);

      // 重量（g）
      const weightG = Math.max(1, Math.round((fish.size || 0) * 10));

      // 稀有度
      const rInfo = InventorySystem.rarityInfo(fish.rarity || 1);

      // 主行：🐟 名 重量
      ctx.fillStyle = '#fff';
      ctx.font = '20px "TencentSansW7", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🐟 ${fish.species}  ${weightG}g`, x + 40, iy + 22);

      // 稀有度标签（色块）
      const labelW = 56;
      const labelH = 22;
      const labelX = x + 40 + ctx.measureText(`🐟 ${fish.species}  ${weightG}g  `).width + 10;
      const labelY = iy + 22 - labelH / 2;
      ctx.fillStyle = rInfo.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(labelX, labelY, labelW, labelH);
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px "TencentSansW7", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rInfo.name, labelX + labelW / 2, iy + 22);

      // 价格（右对齐）
      ctx.font = 'bold 22px "TencentSansW7", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`¥${price}`, x + w - 40, iy + 22);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // 总价合计
    let totalPrice = 0;
    fishBag.forEach(f => { totalPrice += this.inventory.computeFishPrice(f); });
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 18px "TencentSansW7", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`合计 ¥${totalPrice}（${fishBag.length} 条）`, x + w - 40, y + h - 70);
    ctx.textAlign = 'left';

    // 操作提示
    ctx.fillStyle = '#888';
    ctx.font = '14px "TencentSansW7", sans-serif';
    ctx.fillText('↑↓ 选择   Enter 单卖   A 全部出售', x + 30, y + h - 50);
  }
}
