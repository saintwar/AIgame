import { ITEMS } from '../data/items.js';
import { computeBagWeight } from '../fish-storage.js';

/**
 * 背包 UI（Canvas 绘制）
 *
 * PHASE 16-4.8 仗3：鼠标化改造（hover + 视觉，业务零增量）
 * PHASE 16-6 仗1：新增「渔获」分类（首位、默认打开）
 *   - 与现有 4 类（bait/rod/material/misc）共存
 *   - 数据源不同：渔获走 player.fishStorage.items（堆叠副本，由 fish-storage.js 维护），
 *     其余仍走 inventory.getByCategory(tab)（ITEMS 注册表）
 *   - 渲染特例：渔获页顶部双轨容量条 + 堆叠条目（图标/名称/×count/均重/总重）
 *   - 容量条用 fishBag 实时聚合（条数 = fishBag.length；重量 = computeBagWeight）
 *   - 满载时双轨变红（视觉报警，本仗不做满载弹窗）
 *
 * 鼠标 hit-test 几何与 render() 必须同步，渔获条目高度（rowH=60）与现有保持一致；
 * 但渔获页"标题区"占位 = 容量条 88px，故 listY 与其它 tab 不同 —— 用 _getListY() 抽出。
 */
export class InventoryUI {
  constructor(canvas, inventory) {
    this.canvas = canvas;
    this.inventory = inventory;
    this.visible = false;
    // PHASE 16-6 仗1：渔获作为首位、默认打开
    this.currentTab = 'fish';
    this.tabs = [
      // PHASE 16-6 仗1 修订：渔获用 🐟，材料改用 🧰（避免与🐠/🐟视觉冲突）
      { key: 'fish',     label: '🐟 渔获' },
      { key: 'bait',     label: '🪱 鱼饵' },
      { key: 'rod',      label: '🎣 钓竿' },
      { key: 'material', label: '🧰 材料' },
      { key: 'misc',     label: '📦 杂项' }
    ];

    // 鼠标 hover 状态（仗3）
    this.mouseHoveredTab = -1;     // tab 索引（0..4），-1 = 无
    this.mouseHoveredItem = -1;    // 物品行索引，-1 = 无
    this.mouseHoveredClose = false;
  }

  toggle() { this.visible = !this.visible; if (!this.visible) this._resetHover(); }
  hide()   { this.visible = false; this._resetHover(); }

  _resetHover() {
    this.mouseHoveredTab = -1;
    this.mouseHoveredItem = -1;
    this.mouseHoveredClose = false;
  }

  // ─────────────────────────────────────────────────────────
  // PHASE 16-6 仗1：渔获页数据访问辅助
  // ─────────────────────────────────────────────────────────

  /** 当前 tab 是否为「渔获」 */
  _isFishTab() { return this.currentTab === 'fish'; }

  /** 渔获页：物品列表起始 Y 坐标（额外为容量条让 88px） */
  _getListY(tabY) {
    return this._isFishTab() ? tabY + 60 + 88 : tabY + 60;
  }

  /** 读 player.fishStorage.items（兜底空数组） */
  _getFishItems() {
    const player = window.Save && window.Save.get('player');
    const items = player && player.fishStorage && player.fishStorage.items;
    return Array.isArray(items) ? items : [];
  }

  /** 读容量上下文（条数/重量/上限/满载 flag） */
  _getCapacity() {
    const player = (window.Save && window.Save.get('player')) || {};
    const fs = player.fishStorage || { maxSlots: 8, maxWeight: 5000, bagLevel: 1 };
    const bag = Array.isArray(player.fishBag) ? player.fishBag : [];
    const slots = bag.length;
    const weight = computeBagWeight(bag);
    return {
      slots, maxSlots: fs.maxSlots,
      weight, maxWeight: fs.maxWeight,
      bagLevel: fs.bagLevel || 1,
      slotsFull: slots >= fs.maxSlots,
      weightFull: weight >= fs.maxWeight
    };
  }

  // ─────────────────────────────────────────────────────────
  // 键盘
  // ─────────────────────────────────────────────────────────

  handleKey(key) {
    if (!this.visible) return false;
    if (key === 'escape' || key === 'b') { this.hide(); return true; }
    if (key === 'arrowleft') {
      const idx = this.tabs.findIndex(t => t.key === this.currentTab);
      this.currentTab = this.tabs[(idx - 1 + this.tabs.length) % this.tabs.length].key;
      return true;
    }
    if (key === 'arrowright') {
      const idx = this.tabs.findIndex(t => t.key === this.currentTab);
      this.currentTab = this.tabs[(idx + 1) % this.tabs.length].key;
      return true;
    }
    // 数字键 1..5（PHASE 16-6 仗1：随 tabs 数量从 4 → 5）
    if (['1','2','3','4','5'].includes(key)) {
      const i = parseInt(key) - 1;
      if (i >= 0 && i < this.tabs.length) {
        this.currentTab = this.tabs[i].key;
        return true;
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────
  // 鼠标命中（仗 3 / 仗1 增加渔获 tab 适配）
  // ─────────────────────────────────────────────────────────

  /**
   * Canvas 主面板几何：
   *   主面板：x=240, y=90, w=800, h=540
   *   ✕ 按钮：(x+w-40, y+10) 30×30
   *   Tab 栏：tabY = y+80, 每个 tab 145×40，间距 152，起点 x+30
   *           （PHASE 16-6 仗1：tab 数量从 4→5，需缩小宽度避免溢出 800px）
   *   物品列表：listY 与现有保持 = tabY + 60；
   *           渔获页因顶部容量条多吃 88px，listY = tabY + 148
   */
  _hitTest(mx, my) {
    if (!this.visible) return { type: null, idx: -1 };
    const x = 240, y = 90, w = 800, h = 540;

    // ✕ 按钮命中
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
      return { type: 'close', idx: -1 };
    }

    // Tab 栏命中
    const tabY = y + 80, tabW = 145, tabH = 40, tabGap = 152;
    for (let i = 0; i < this.tabs.length; i++) {
      const tx = x + 30 + i * tabGap;
      if (mx >= tx && mx <= tx + tabW && my >= tabY && my <= tabY + tabH) {
        return { type: 'tab', idx: i };
      }
    }

    // 物品行命中
    const listY = this._getListY(tabY);
    const items = this._isFishTab()
      ? this._getFishItems()
      : this.inventory.getByCategory(this.currentTab);
    const rowH = 60, rowVisH = 55;
    const itemX = x + 30, itemW = w - 60;
    for (let i = 0; i < items.length; i++) {
      const iy = listY + i * rowH;
      if (mx >= itemX && mx <= itemX + itemW && my >= iy && my <= iy + rowVisH) {
        return { type: 'item', idx: i };
      }
    }

    return { type: null, idx: -1 };
  }

  handleMouseMove(mx, my) {
    if (!this.visible) return 'default';
    const hit = this._hitTest(mx, my);
    this.mouseHoveredClose = hit.type === 'close';
    this.mouseHoveredTab = hit.type === 'tab' ? hit.idx : -1;
    this.mouseHoveredItem = hit.type === 'item' ? hit.idx : -1;
    return hit.type ? 'pointer' : 'default';
  }

  handleMouseClick(mx, my) {
    if (!this.visible) return false;
    const hit = this._hitTest(mx, my);
    if (hit.type === 'close') { this.hide(); return true; }
    if (hit.type === 'tab') { this.currentTab = this.tabs[hit.idx].key; return true; }
    if (hit.type === 'item') return true; // 仅视觉选中，无业务
    const x = 240, y = 90, w = 800, h = 540;
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) return true; // 面板内空白也吞
    this.hide(); return true;
  }

  // ─────────────────────────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────────────────────────

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
    ctx.font = 'bold 32px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎒 阿明的背包', x + 30, y + 50);

    // 金币显示
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${this.inventory.getCoin()} 金`, x + w - 60, y + 50);
    ctx.textAlign = 'left';

    // ✕ 关闭按钮
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    ctx.fillStyle = this.mouseHoveredClose ? 'rgba(255, 215, 0, 0.25)' : 'transparent';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = this.mouseHoveredClose ? '#ffd700' : '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = this.mouseHoveredClose ? '#ffd700' : '#d4a574';
    ctx.font = 'bold 22px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✕', cx + cw / 2, cy + 22);
    ctx.textAlign = 'left';

    // Tab 栏（5 个，宽 145×40，间距 152；与 _hitTest 同步）
    const tabY = y + 80;
    const tabW = 145, tabH = 40, tabGap = 152;
    this.tabs.forEach((tab, i) => {
      const tx = x + 30 + i * tabGap;
      const active = tab.key === this.currentTab;
      const hovered = this.mouseHoveredTab === i;
      if (active)        ctx.fillStyle = '#d4a574';
      else if (hovered)  ctx.fillStyle = '#7a5230';
      else               ctx.fillStyle = '#5a3a1f';
      ctx.fillRect(tx, tabY, tabW, tabH);
      if (hovered && !active) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(tx, tabY, tabW, tabH);
      }
      ctx.fillStyle = active ? '#2d1b0e' : '#d4a574';
      ctx.font = '18px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.fillText(tab.label, tx + 12, tabY + 27);
    });

    // 内容区
    if (this._isFishTab()) {
      this._renderFishTab(ctx, x, y, w, h, tabY);
    } else {
      this._renderItemList(ctx, x, y, w, h, tabY);
    }

    // 底部提示
    ctx.fillStyle = '#888';
    ctx.font = '16px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('← → / 1-5 切换分类   B/ESC 关闭   🖱️ 点 Tab 切换 / 点 ✕ 关闭', x + 30, y + h - 20);
  }

  // ─────────────────────────────────────────────────────────
  // 渔获页（PHASE 16-6 仗1）
  // ─────────────────────────────────────────────────────────

  _renderFishTab(ctx, x, y, w, h, tabY) {
    const cap = this._getCapacity();
    const items = this._getFishItems();

    // ── 顶部双轨容量条（88px 高度）──
    // PHASE 16-6 仗1 修订：标题与进度条分两行排版，避免文字重叠
    //   标题行：barAreaY + 22（"🪣 木竹篓" / 右侧满载警告）
    //   进度条：barAreaY + 50（高度 22px，label 直接绘制在条内）
    const barAreaY = tabY + 60;
    const barAreaH = 88;
    // 背景描边盒
    ctx.fillStyle = 'rgba(212,165,116,0.06)';
    ctx.fillRect(x + 30, barAreaY, w - 60, barAreaH - 8);
    ctx.strokeStyle = '#5a3a1f';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 30, barAreaY, w - 60, barAreaH - 8);

    // 第 1 行：鱼篓等级 / 名称（标题）
    const bagName = cap.bagLevel === 3 ? '保鲜冰篓'
                  : cap.bagLevel === 2 ? '藤编大篓' : '木竹篓';
    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 18px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🪣 ${bagName}`, x + 42, barAreaY + 22);

    // 第 1 行右侧：满载警告
    if (cap.slotsFull || cap.weightFull) {
      ctx.fillStyle = '#ff7043';
      ctx.font = 'bold 14px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('⚠ 鱼篓已满，请回村卖鱼', x + w - 42, barAreaY + 22);
      ctx.textAlign = 'left';
    }

    // 第 2 行：双轨进度条（条数左半 / 重量右半）
    const trackW = (w - 60 - 24 - 24) / 2 - 12;
    const track1X = x + 42;
    const track2X = track1X + trackW + 24;
    const trackY = barAreaY + 50;
    const trackH = 22;
    this._renderProgressBar(ctx, track1X, trackY, trackW, trackH,
      cap.slots, cap.maxSlots, '条', cap.slotsFull);
    this._renderProgressBar(ctx, track2X, trackY, trackW, trackH,
      cap.weight, cap.maxWeight, 'g', cap.weightFull);

    // ── 条目列表 ──
    const listY = this._getListY(tabY);
    if (items.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '20px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.fillText('（鱼篓空空，去日月潭钓几条吧～）', x + 40, listY + 30);
      return;
    }

    // 视口高度 = 主面板底部预留 60px → 最多容纳行数
    const maxRows = Math.floor((h - (listY - y) - 60) / 60);
    const visible = items.slice(0, maxRows);

    visible.forEach((item, i) => {
      const iy = listY + i * 60;
      const hovered = this.mouseHoveredItem === i;
      // 背景：hover > 斑马纹
      ctx.fillStyle = hovered
        ? 'rgba(244,217,154,0.18)'
        : (i % 2 === 0 ? 'rgba(212,165,116,0.1)' : 'transparent');
      ctx.fillRect(x + 30, iy, w - 60, 55);
      if (hovered) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 30, iy, w - 60, 55);
      }
      // 图标（用 🐟 兜底；后续仗 2 可接入鱼种 emoji 表）
      ctx.font = '36px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText('🐟', x + 45, iy + 40);
      // 名称 ×count
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.fillText(`${item.name} ×${item.count}`, x + 100, iy + 28);
      // 副信息：均重 / 总重
      ctx.fillStyle = '#bbb';
      ctx.font = '16px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.fillText(`均 ${item.avgWeight}g · 共 ${item.totalWeight}g`, x + 100, iy + 48);
      // 右侧总重高亮
      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 18px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${item.totalWeight}g`, x + w - 40, iy + 36);
      ctx.textAlign = 'left';
    });

    // 列表被截断的 hint
    if (visible.length < items.length) {
      ctx.fillStyle = '#888';
      ctx.font = '14px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`···还有 ${items.length - visible.length} 种未显示`, x + w - 40, listY + visible.length * 60 + 16);
      ctx.textAlign = 'left';
    }
  }

  /** 单根容量进度条（PHASE 16-6 仗1 修订：label 内嵌、垂直居中、带描边） */
  _renderProgressBar(ctx, bx, by, bw, bh, value, max, unit, full) {
    const ratio = max > 0 ? Math.min(1, value / max) : 0;
    // 背景槽
    ctx.fillStyle = '#2a1808';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#5a3a1f';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    // 填充：满载红 / 接近满黄 / 默认绿
    let color = '#5DBB63';
    if (full) color = '#E76F51';
    else if (ratio >= 0.85) color = '#F4C430';
    ctx.fillStyle = color;
    ctx.fillRect(bx + 1, by + 1, Math.max(0, (bw - 2) * ratio), bh - 2);
    // 文字（条内居中，深色描边保证在任何底色上都清晰）
    const label = `${unit === '条' ? '条数' : '重量'}  ${value} / ${max} ${unit}`;
    ctx.font = 'bold 13px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(label, bx + 8, by + bh / 2 + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, bx + 8, by + bh / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // ─────────────────────────────────────────────────────────
  // 普通分类（保留原渲染逻辑）
  // ─────────────────────────────────────────────────────────

  _renderItemList(ctx, x, y, w, h, tabY) {
    const items = this.inventory.getByCategory(this.currentTab);
    const listY = this._getListY(tabY);
    if (items.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '20px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.fillText('（这一类还没有物品）', x + 40, listY + 30);
      return;
    }
    items.forEach((item, i) => {
      const iy = listY + i * 60;
      const hovered = this.mouseHoveredItem === i;
      ctx.fillStyle = hovered
        ? 'rgba(244,217,154,0.18)'
        : (i % 2 === 0 ? 'rgba(212,165,116,0.1)' : 'transparent');
      ctx.fillRect(x + 30, iy, w - 60, 55);
      if (hovered) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 30, iy, w - 60, 55);
      }
      // 图标
      ctx.font = '36px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(item.icon, x + 45, iy + 40);
      // 名称
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.fillText(`${item.name} ×${item.count}`, x + 100, iy + 28);
      // 已装备标记
      if (item.category === 'rod' && window.equipment && window.equipment.getEquippedRod().id === item.id) {
        ctx.fillStyle = '#7CFC00';
        ctx.font = 'bold 18px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('⚔️ 已装备', x + w - 40, iy + 28);
        ctx.textAlign = 'left';
      }
      // 描述
      ctx.fillStyle = '#bbb';
      ctx.font = '16px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
      ctx.fillText(item.desc, x + 100, iy + 48);
    });
  }
}
