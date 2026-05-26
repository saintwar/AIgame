import { ITEMS } from '../data/items.js';
import { InventorySystem } from '../inventory-system.js';
import { syncFishStorage } from '../fish-storage.js';

/**
 * 鱼篓升级表（PHASE 16-6 仗3）
 *
 * 数据形态说明：升级不是物品（不进 ITEMS 注册表 / 不进背包），
 * 而是 player.fishStorage 的状态变更，因此本地用常量数组维护。
 *
 * 约定：bagLevel 与 save-system.DEFAULT_FISH_STORAGE.bagLevel 单调递增对应。
 *   bagLevel 1（默认）：木竹篓 8 条 / 5kg ── 不在购买列表（已拥有）
 *   bagLevel 2          ：藤编大篓 12 条 / 10kg
 *   bagLevel 3          ：保鲜冰篓 20 条 / 20kg
 */
export const BAG_UPGRADES = [
  {
    bagLevel: 2,
    name: '藤编大篓',
    icon: '🧺',
    desc: '更宽敞，能装更多更重的鱼',
    price: 500,
    maxSlots: 12,
    maxWeight: 10000
  },
  {
    bagLevel: 3,
    name: '保鲜冰篓',
    icon: '🧊',
    desc: '专业保鲜，渔获不贬值，容量再翻倍',
    price: 2000,
    maxSlots: 20,
    maxWeight: 20000
  }
];

/**
 * ShopUI（PHASE 16-6 仗3 扩展）
 *
 * 职责：村庄两家店铺的统一 UI
 *   - 林师傅综合鱼具店：openLinShop({ buyOnly: true })  → 钓具/鱼饵 + 鱼篓升级双 tab
 *   - 秀兰阿姨鱼摊：openXiulanShop()                    → 直进 sell 模式，专门收购鱼
 *
 * 关键约束：
 *   1) 林师傅不再收鱼；卖鱼业务完整迁移到秀兰
 *   2) 鱼价统一用 InventorySystem.computeFishPrice / sellFish，不再本地复算
 *   3) 卖鱼后必须同步 fishStorage（仗 1 后不同步会导致渔获分类显示错）
 *   4) 售出/购买飘字用 _showCoinFloat（金色 +¥X / -¥X 动画）
 *
 * PHASE 16-6 仗3 新增：
 *   - linBuyList 增加 basic_bait（项目自带伏笔）
 *   - buy 模式新增双 tab：gear（钓具/鱼饵） / bag（鱼篓升级）
 *   - 数字键 1/2 切换 tab；上下/Enter 维持原逻辑但作用于当前 tab 列表
 *   - 鱼篓升级业务：扣金币 → 改 player.fishStorage.{bagLevel,maxSlots,maxWeight} → commit
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

    // 林师傅出售清单（PHASE 16-6 仗3：补 basic_bait 入门饵）
    this.linBuyList = ['basic_bait', 'advanced_bait', 'legendary_bait', 'bamboo_rod', 'carbon_rod'];

    // PHASE 16-6 仗3：buy 模式内部 tab（'gear' = 钓具/鱼饵，'bag' = 鱼篓升级）
    this.buyTab = 'gear';

    // ─── PHASE 16-6 仗3 UX 补丁：鼠标交互状态 ─────────────────────
    // 视觉一致性参照 inventory-ui 仗 16-4.8 仗3 的 hover 字段范式。
    // 所有 hover 字段在 hide() / 切 mode / 切 tab 时归零，避免视觉残影。
    this.mouseHoveredClose = false;     // ✕ 关闭按钮
    this.mouseHoveredTab   = -1;        // 0=gear, 1=bag, -1=无
    this.mouseHoveredItem  = -1;        // buy 商品行 / sell 鱼货行索引
    this.mouseHoveredMenu  = -1;        // menu 列表索引（林师傅 menu 仅 1 项=购买）
  }

  /**
   * PHASE 16-6 仗3 UX 补丁：清空所有 hover 字段。
   * 必须在 hide / 切 mode / 切 tab / 切店主时调用，否则上一态的 hover 视觉会残留。
   */
  _resetHover() {
    this.mouseHoveredClose = false;
    this.mouseHoveredTab   = -1;
    this.mouseHoveredItem  = -1;
    this.mouseHoveredMenu  = -1;
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
    // PHASE 16-6 仗3：每次开店默认回到「钓具/鱼饵」tab，光标归零
    this.buyTab = 'gear';
    this.selectedIdx = 0;
    this._resetHover();
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
    this._resetHover();
  }

  hide() { this.visible = false; this._resetHover(); }

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
      // PHASE 16-6 仗3：双 tab 切换（1=钓具/鱼饵，2=鱼篓升级）
      if (key === '1') {
        if (this.buyTab !== 'gear') { this.buyTab = 'gear'; this.selectedIdx = 0; this.mouseHoveredItem = -1; }
        return true;
      }
      if (key === '2') {
        if (this.buyTab !== 'bag')  { this.buyTab = 'bag';  this.selectedIdx = 0; this.mouseHoveredItem = -1; }
        return true;
      }

      const list = this._currentBuyList();
      if (key === 'arrowup')   { this.selectedIdx = Math.max(0, this.selectedIdx - 1); return true; }
      if (key === 'arrowdown') { this.selectedIdx = Math.min(Math.max(0, list.length - 1), this.selectedIdx + 1); return true; }
      if (key === 'enter' || key === ' ') {
        if (this.buyTab === 'bag') this._buyBagUpgrade();
        else                       this._buyItem();
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

  // ─── PHASE 16-6 仗3 UX 补丁：鼠标交互 ─────────────────────
  //
  // 设计原则（与 inventory-ui 仗 16-4.8 仗3 完全对齐）：
  //   1) 命中盒几何与 render 函数硬同步——render 改坐标必同步改 _hitTest
  //   2) 单击 = 等价键盘 ↑↓+Enter（选中即买/卖一条），双击 = 业务执行（仅 buy 模式）
  //      └ sell 模式不支持双击避免误卖（一条鱼可能很贵），单击即卖（同 Enter 语义）
  //   3) ✕ 按钮永远在 (x+w-40, y+10) 30×30，与背包/图鉴严格一致
  //   4) menu 模式（林师傅非 buyOnly 路径）的"1. 购买装备"也支持点击
  //
  // 主面板几何：x=240, y=90, w=800, h=540（与 render 一致）

  /**
   * 命中测试，返回 { type, idx }
   *   type: 'close' | 'tab' | 'item' | 'menu' | 'panel' | null
   *   idx:  对应索引；type=close/panel 时 idx=-1
   *
   * panel 类型（点中面板内空白）：用来吞点击事件，避免误穿透到 ClickToMove。
   */
  _hitTest(mx, my) {
    if (!this.visible) return { type: null, idx: -1 };
    const x = 240, y = 90, w = 800, h = 540;

    // ✕ 按钮（最高优先级；和 inventory-ui 同位）
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
      return { type: 'close', idx: -1 };
    }

    // 面板外 → 不命中
    if (mx < x || mx > x + w || my < y || my > y + h) return { type: null, idx: -1 };

    if (this.mode === 'buy') {
      // Tab 命中（与 _renderBuyTabs 几何同步）
      const tabY = y + 75, tabW = 200, tabH = 34, tabGap = 16;
      for (let i = 0; i < 2; i++) {
        const tx = x + 30 + i * (tabW + tabGap);
        if (mx >= tx && mx <= tx + tabW && my >= tabY && my <= tabY + tabH) {
          return { type: 'tab', idx: i };
        }
      }
      // 商品行命中（按当前 buyTab 选不同几何）
      if (this.buyTab === 'gear') {
        const list = this.linBuyList;
        const itemX = x + 20, itemW = w - 40;
        for (let i = 0; i < list.length; i++) {
          const iy = y + 130 + i * 64;
          if (mx >= itemX && mx <= itemX + itemW && my >= iy && my <= iy + 56) {
            return { type: 'item', idx: i };
          }
        }
      } else {
        // bag tab：headerY = y+130，行从 headerY+30 = y+160 开始，每行 90px、可视高 80
        const itemX = x + 20, itemW = w - 40;
        for (let i = 0; i < BAG_UPGRADES.length; i++) {
          const iy = y + 160 + i * 90;
          if (mx >= itemX && mx <= itemX + itemW && my >= iy && my <= iy + 80) {
            return { type: 'item', idx: i };
          }
        }
      }
    } else if (this.mode === 'sell') {
      const fishBag = window.Save?.get('player.fishBag') || [];
      const visibleStart = Math.max(0, this.selectedIdx - 3);
      const visibleEnd = Math.min(fishBag.length, visibleStart + 6);
      const itemX = x + 20, itemW = w - 40;
      for (let i = visibleStart; i < visibleEnd; i++) {
        const iy = y + 120 + (i - visibleStart) * 50;
        if (mx >= itemX && mx <= itemX + itemW && my >= iy && my <= iy + 45) {
          return { type: 'item', idx: i };
        }
      }
    } else if (this.mode === 'menu') {
      // 林师傅 menu：只有"1. 🛒 购买装备"一项（参见 _renderMenu）
      // 命中盒：行起点 x+80, y+200 附近，做一个宽松命中区
      if (mx >= x + 60 && mx <= x + w - 60 && my >= y + 175 && my <= y + 230) {
        return { type: 'menu', idx: 0 };
      }
    }

    return { type: 'panel', idx: -1 };
  }

  /**
   * mousemove → 更新 hover 字段，返回 cursor 类型
   *   'pointer' = 在可点击元素上；'default' = 面板内空白；'default' = 面板外（应该不会传进来）
   */
  handleMouseMove(mx, my) {
    if (!this.visible) return 'default';
    const hit = this._hitTest(mx, my);
    this.mouseHoveredClose = hit.type === 'close';
    this.mouseHoveredTab   = hit.type === 'tab'  ? hit.idx : -1;
    this.mouseHoveredItem  = hit.type === 'item' ? hit.idx : -1;
    this.mouseHoveredMenu  = hit.type === 'menu' ? hit.idx : -1;
    if (hit.type === 'close' || hit.type === 'tab' || hit.type === 'menu') return 'pointer';
    if (hit.type === 'item') return 'pointer';
    return 'default';
  }

  /**
   * 单击：
   *   - ✕ → 关闭面板
   *   - tab → 切换 buyTab，重置选中和 hover
   *   - item（buy gear/bag）→ 选中（同 ↑↓）
   *   - item（sell）→ 选中 + 立即单卖（与键盘 Enter 等价；卖鱼是最常用动作，与背包"单击=选中"语义不同但更符合卖鱼工作流）
   *   - menu → 进入 buy 模式（仅林师傅非 buyOnly 路径会到）
   *   - panel → 吞点击（防止穿透到 ClickToMove）
   *
   * 返回 true 表示已处理（村庄场景需 stopImmediatePropagation）。
   */
  handleMouseClick(mx, my) {
    if (!this.visible) return false;
    const hit = this._hitTest(mx, my);
    if (hit.type === 'close') { this.hide(); return true; }
    if (hit.type === 'tab') {
      const newTab = hit.idx === 0 ? 'gear' : 'bag';
      if (this.buyTab !== newTab) {
        this.buyTab = newTab;
        this.selectedIdx = 0;
        this.mouseHoveredItem = -1;
      }
      return true;
    }
    if (hit.type === 'menu') {
      this.mode = 'buy';
      this.selectedIdx = 0;
      this._resetHover();
      return true;
    }
    if (hit.type === 'item') {
      this.selectedIdx = hit.idx;
      // sell：单击 = 选中 + 单卖（与键盘 Enter 一致）
      if (this.mode === 'sell') this._sellOne();
      // buy：单击仅选中，双击才购买（防误买）
      return true;
    }
    if (hit.type === 'panel') return true; // 吞掉空白点击
    return false;
  }

  /**
   * 双击（仅 buy 模式商品行）：选中 + 立即购买，等价 ↑↓+Enter。
   * sell 模式单击已是单卖，无需双击；图鉴/背包同理无双击业务。
   */
  handleMouseDblClick(mx, my) {
    if (!this.visible) return false;
    if (this.mode !== 'buy') return false;
    const hit = this._hitTest(mx, my);
    if (hit.type !== 'item') return false;
    this.selectedIdx = hit.idx;
    if (this.buyTab === 'bag') this._buyBagUpgrade();
    else                       this._buyItem();
    return true;
  }

  // ─── 业务 ─────────────────────────────────────────────────

  /**
   * PHASE 16-6 仗3：返回当前 buy tab 对应的列表（render 与 handleKey 共用）
   *   gear → 钓竿/鱼饵 ITEMS id 字符串数组
   *   bag  → BAG_UPGRADES 升级配置数组（含已购占位）
   */
  _currentBuyList() {
    return this.buyTab === 'bag' ? BAG_UPGRADES : this.linBuyList;
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
    // PHASE 16-6 仗3：购买飘字（金币 -¥X，与卖鱼 +¥X 对称）
    this._showCoinFloat(`-¥${item.price}`, `${item.icon} ${item.name}`);
  }

  /**
   * PHASE 16-6 仗3：购买鱼篓升级
   *
   * 业务流：
   *   1) 校验 selectedIdx → 取目标升级（BAG_UPGRADES）
   *   2) 校验当前 bagLevel：必须严格 = upgrade.bagLevel - 1，跨级购买拒绝
   *      （UI 只让玩家选"下一级"；这里再做一次防御）
   *   3) 校验金币
   *   4) 扣金币 → 写 player.fishStorage.{bagLevel,maxSlots,maxWeight} → commit
   *   5) 飘字 + toast；下次 render 自动展示"已升级"
   *
   * 注意：不动 fishStorage.items（已装的鱼），也不动 fishBag。
   * 容量提升后玩家可以装更多，原有鱼一条都不少。
   */
  _buyBagUpgrade() {
    const upgrade = BAG_UPGRADES[this.selectedIdx];
    if (!upgrade) return;

    const player = window.Save?.get('player');
    if (!player || !player.fishStorage) {
      this._toast('鱼篓数据异常，无法升级');
      return;
    }
    const curLevel = player.fishStorage.bagLevel || 1;

    // 已是该级或更高 → 拒绝
    if (curLevel >= upgrade.bagLevel) {
      this._toast(`已经拥有「${upgrade.name}」或更高级鱼篓！`);
      return;
    }
    // 跨级（如当前 1，想买 3）→ 拒绝，并提示需要先买的那一级
    if (curLevel !== upgrade.bagLevel - 1) {
      const prereq = BAG_UPGRADES.find(u => u.bagLevel === upgrade.bagLevel - 1);
      this._toast(`需要先升级到「${prereq ? prereq.name : '上一级'}」`);
      return;
    }
    // 金币
    if (!this.inventory.spendCoin(upgrade.price)) {
      this._toast('金币不足！');
      return;
    }

    // 落盘
    player.fishStorage.bagLevel  = upgrade.bagLevel;
    player.fishStorage.maxSlots  = upgrade.maxSlots;
    player.fishStorage.maxWeight = upgrade.maxWeight;
    window.Save.set('player', player);
    window.Save.commit();

    this._showCoinFloat(`-¥${upgrade.price}`, `🎉 升级到「${upgrade.name}」`);
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
      <div style="font:bold 36px 'TencentSans','PingFang SC','Noto Sans SC','Heiti SC',sans-serif;color:#FFD700;text-shadow:0 0 12px #FFD700;">${big}</div>
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

    // 金币（PHASE 16-6 仗3 UX：往左挪 40px 给 ✕ 按钮腾位）
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px "TencentSansW7", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${this.inventory.getCoin()} 金`, x + w - 70, y + 50);
    ctx.textAlign = 'left';

    // PHASE 16-6 仗3 UX：✕ 关闭按钮（与 inventory-ui 几何/视觉规范严格一致）
    this._renderCloseBtn(ctx, x, y, w);

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

  /**
   * PHASE 16-6 仗3 UX：✕ 关闭按钮
   * 几何与 inventory-ui._hitTest 严格同步：(x+w-40, y+10) 30×30。
   * 视觉：默认描边 #d4a574，hover 时金色描边 + 半透金底 + 文字变金（替代 DOM rotate 90°）。
   */
  _renderCloseBtn(ctx, x, y, w) {
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    ctx.fillStyle = this.mouseHoveredClose ? 'rgba(255, 215, 0, 0.25)' : 'transparent';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = this.mouseHoveredClose ? '#ffd700' : '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = this.mouseHoveredClose ? '#ffd700' : '#d4a574';
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', cx + cw / 2, cy + ch / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _renderMenu(ctx, x, y, w, h) {
    // PHASE 16-6 仗2：菜单只剩"购买装备"（决策 B：林师傅不收鱼）
    // PHASE 16-6 仗3 UX：菜单项支持鼠标点击 → hover 高亮
    const hovered = this.mouseHoveredMenu === 0;
    if (hovered) {
      ctx.fillStyle = 'rgba(244,217,154,0.18)';
      ctx.fillRect(x + 60, y + 175, w - 120, 55);
      ctx.strokeStyle = '#f4d99a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 60, y + 175, w - 120, 55);
    }
    ctx.fillStyle = hovered ? '#ffd700' : '#fff';
    ctx.font = 'bold 28px "TencentSansW7", sans-serif';
    ctx.fillText('1. 🛒 购买装备', x + 80, y + 210);

    ctx.fillStyle = '#888';
    ctx.font = '18px "TencentSansW7", sans-serif';
    ctx.fillText('按 [1] 或单击进入购买', x + 80, y + 280);

    ctx.fillStyle = '#aaa';
    ctx.font = '16px "TencentSansW7", sans-serif';
    ctx.fillText('💡 卖鱼请去找村口的秀兰阿姨', x + 80, y + 360);
  }

  _renderBuy(ctx, x, y, w, h) {
    // PHASE 16-6 仗3：双 tab 头部（钓具/鱼饵 / 鱼篓升级）
    this._renderBuyTabs(ctx, x, y, w);

    if (this.buyTab === 'bag') {
      this._renderBagUpgrades(ctx, x, y, w, h);
    } else {
      this._renderGearList(ctx, x, y, w, h);
    }

    ctx.fillStyle = '#888';
    ctx.font = '14px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    // PHASE 16-6 仗3 UX：键鼠双通道提示
    ctx.fillText('1/2 切换分类   ↑↓ 选择   Enter 购买   或 单击选中 / 双击购买', x + 30, y + h - 50);
  }

  /**
   * PHASE 16-6 仗3：buy 模式 tab 头（在标题下方画两个分类按钮）
   *   位置：紧贴店铺标题下方，与原来的"🛒 购买商品"小标题位置一致
   *   PHASE 16-6 仗3 UX：增加 hover 视觉（参照 inventory-ui tab 的 hover 描边）
   */
  _renderBuyTabs(ctx, x, y, w) {
    const tabs = [
      { key: 'gear', label: '🎣 钓具/鱼饵' },
      { key: 'bag',  label: '🧺 鱼篓升级' }
    ];
    const tabY = y + 75;
    const tabW = 200, tabH = 34, tabGap = 16;
    tabs.forEach((tab, i) => {
      const tx = x + 30 + i * (tabW + tabGap);
      const active = tab.key === this.buyTab;
      const hovered = this.mouseHoveredTab === i;
      // 三态颜色：active > hovered > default（参照 inventory-ui 范式）
      if (active)        ctx.fillStyle = '#d4a574';
      else if (hovered)  ctx.fillStyle = '#7a5230';
      else               ctx.fillStyle = '#5a3a1f';
      ctx.fillRect(tx, tabY, tabW, tabH);
      // hover 时金色描边
      if (hovered && !active) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(tx, tabY, tabW, tabH);
      }
      ctx.fillStyle = active ? '#2d1b0e' : '#d4a574';
      ctx.font = 'bold 18px "TencentSansW7", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${i + 1}. ${tab.label}`, tx + 14, tabY + 23);
    });
  }

  /** PHASE 16-6 仗3：钓具/鱼饵列表（沿用旧 _renderBuy 的核心）
   *  PHASE 16-6 仗3 UX：行 hover 高亮（暖橙黄半透 + 金色描边）
   */
  _renderGearList(ctx, x, y, w, h) {
    this.linBuyList.forEach((itemId, i) => {
      const item = ITEMS[itemId];
      if (!item) return;
      const iy = y + 130 + i * 64;
      const owned = item.category === 'rod' ? this.inventory.has(itemId) : false;
      const selected = i === this.selectedIdx;
      const hovered = this.mouseHoveredItem === i;

      // 背景：selected > hovered > 默认透明（hover 与背包/图鉴风格一致）
      if (selected)      ctx.fillStyle = 'rgba(212,165,116,0.3)';
      else if (hovered)  ctx.fillStyle = 'rgba(244,217,154,0.18)';
      else               ctx.fillStyle = 'transparent';
      ctx.fillRect(x + 20, iy, w - 40, 56);
      // hover 描边
      if (hovered && !selected) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 20, iy, w - 40, 56);
      }

      ctx.font = '32px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(item.icon, x + 35, iy + 28);

      ctx.font = 'bold 20px "TencentSansW7", sans-serif';
      ctx.fillStyle = owned ? '#7CFC00' : '#fff';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${item.name}${owned ? ' ✅已拥有' : ''}`, x + 85, iy + 26);

      // 鱼饵显示当前持有数量（堆叠物）
      if (item.category === 'bait') {
        const stackCount = this.inventory.getCount(itemId);
        if (stackCount > 0) {
          ctx.fillStyle = '#aaccdd';
          ctx.font = '14px "TencentSansW7", sans-serif';
          ctx.fillText(`（已有 ${stackCount}）`, x + 85 + ctx.measureText(item.name).width + 10, iy + 26);
        }
      }

      ctx.fillStyle = '#bbb';
      ctx.font = '14px "TencentSansW7", sans-serif';
      ctx.fillText(item.desc, x + 85, iy + 46);

      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 20px "TencentSansW7", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${item.price} 金`, x + w - 40, iy + 34);
      ctx.textAlign = 'left';
    });
  }

  /**
   * PHASE 16-6 仗3：鱼篓升级列表
   *
   * 渲染规则：
   *   - 列出 bagLevel 1（默认）+ BAG_UPGRADES 全部 = 共 3 行
   *   - 当前等级 → 灰色 "已使用"
   *   - 已超过该等级 → 灰色 "已升级"
   *   - 下一级 → 高亮可购买（绿色边）
   *   - 跨级 → 灰色 "需先升级"
   *   - 选中行 → 棕色高亮背景
   * 列表项与 BAG_UPGRADES 数组一一对应（不含 lv1），所以 selectedIdx 直接用。
   */
  _renderBagUpgrades(ctx, x, y, w, h) {
    const player = window.Save?.get('player') || {};
    const fs = player.fishStorage || { bagLevel: 1, maxSlots: 8, maxWeight: 5000 };
    const curLevel = fs.bagLevel || 1;

    // 当前鱼篓状态条（顶部信息）
    const headerY = y + 130;
    const lv1Name = '木竹篓';
    const curName = curLevel === 3 ? '保鲜冰篓' : (curLevel === 2 ? '藤编大篓' : lv1Name);
    ctx.fillStyle = '#aaccdd';
    ctx.font = 'bold 18px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`当前：🪣 ${curName}（${fs.maxSlots} 条 / ${(fs.maxWeight / 1000).toFixed(0)}kg）`, x + 30, headerY);

    // 升级行（每行 90px）
    BAG_UPGRADES.forEach((up, i) => {
      const iy = headerY + 30 + i * 90;
      const selected = i === this.selectedIdx;
      const hovered = this.mouseHoveredItem === i;
      const owned = curLevel >= up.bagLevel;
      const buyable = curLevel === up.bagLevel - 1;
      const locked = !owned && !buyable;

      // 行背景：selected > hovered > 默认透明
      if (selected)      ctx.fillStyle = 'rgba(212,165,116,0.3)';
      else if (hovered)  ctx.fillStyle = 'rgba(244,217,154,0.18)';
      else               ctx.fillStyle = 'transparent';
      ctx.fillRect(x + 20, iy, w - 40, 80);
      // 可购买高亮边框
      if (buyable && selected) {
        ctx.strokeStyle = '#7CFC00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 20, iy, w - 40, 80);
      } else if (hovered && !selected) {
        // 仅 hover 描边
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 20, iy, w - 40, 80);
      }

      // 图标
      ctx.font = '40px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(up.icon, x + 38, iy + 40);

      // 名称 + 状态徽章
      ctx.font = 'bold 22px "TencentSansW7", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = owned ? '#7CFC00' : (locked ? '#888' : '#fff');
      let statusTag = '';
      if (owned)        statusTag = curLevel === up.bagLevel ? '  ✅ 当前使用' : '  ✅ 已升级';
      else if (locked)  statusTag = '  🔒 需先升级';
      ctx.fillText(`${up.name}${statusTag}`, x + 95, iy + 28);

      // 容量描述
      ctx.fillStyle = '#bbb';
      ctx.font = '15px "TencentSansW7", sans-serif';
      ctx.fillText(`容量：${up.maxSlots} 条 / ${(up.maxWeight / 1000).toFixed(0)}kg`, x + 95, iy + 50);

      // 描述
      ctx.fillStyle = '#aaa';
      ctx.font = '13px "TencentSansW7", sans-serif';
      ctx.fillText(up.desc, x + 95, iy + 70);

      // 价格（已拥有显示 ✅，否则显示 X 金）
      ctx.textAlign = 'right';
      if (owned) {
        ctx.fillStyle = '#7CFC00';
        ctx.font = 'bold 22px "TencentSansW7", sans-serif';
        ctx.fillText('✅', x + w - 40, iy + 38);
      } else {
        ctx.fillStyle = locked ? '#888' : '#ffd700';
        ctx.font = 'bold 22px "TencentSansW7", sans-serif';
        ctx.fillText(`${up.price} 金`, x + w - 40, iy + 38);
      }
      ctx.textAlign = 'left';
    });
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
      const hovered = this.mouseHoveredItem === i;

      // 行背景：selected > hovered > 斑马纹
      if (selected)      ctx.fillStyle = 'rgba(212,165,116,0.3)';
      else if (hovered)  ctx.fillStyle = 'rgba(244,217,154,0.18)';
      else               ctx.fillStyle = (i % 2 === 0 ? 'rgba(212,165,116,0.05)' : 'transparent');
      ctx.fillRect(x + 20, iy, w - 40, 45);
      // hover 描边
      if (hovered && !selected) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 20, iy, w - 40, 45);
      }

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
    ctx.fillText('↑↓ 选择   Enter 单卖   A 全部出售   或 单击鱼货 = 单卖', x + 30, y + h - 50);
  }
}
