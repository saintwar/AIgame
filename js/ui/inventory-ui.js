import { ITEMS } from '../data/items.js';

/**
 * 背包 UI（Canvas 绘制）
 *
 * PHASE 16-4.8 仗3：鼠标化改造
 *   原始结构是 Canvas 绘制（非 DOM），故 CSS hover 完全不生效。
 *   改造方案：在 Canvas 内做坐标命中检测 + 维护 mouseHovered* 字段。
 *
 *   - mouseHoveredTab    分类按钮 hover（独立于 currentTab，hover 不切分类）
 *   - mouseHoveredItem   物品行 hover（仅视觉，无业务）
 *   - mouseHoveredClose  ✕ 按钮 hover
 *
 *   外部驱动接口（由 village-scene._moveHandler / _clickHandler 调用）：
 *     handleMouseMove(x, y)  → 更新 hover 字段并返回 cursor 类型 'pointer' | 'default'
 *     handleMouseClick(x, y) → 命中 tab → 切 tab；命中 ✕ → 关闭；命中物品行 → 仅视觉无操作（留 P1）
 *
 *   键盘逻辑零回归：原 handleKey 完全保留，方向键/数字键/B/ESC 不变。
 *
 *   ⚠️ 不引入"双击 = 装备/使用"——背包当前根本没有"选中即操作"的现有逻辑，
 *      贸然加会引入新决策（哪种道具单击触发什么），与本仗范围（"鼠标化 = hover + 视觉"）冲突。
 *      留 P1 单独评估。
 */
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

    // 鼠标 hover 状态（仗3 新增）
    this.mouseHoveredTab = -1;     // tab 索引（0..3），-1 = 无
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

  handleKey(key) {
    if (!this.visible) return false;
    if (key === 'escape' || key === 'b') {
      this.hide(); return true;
    }
    // ← / → 循环切换分类（PHASE 16-5 改造：原 TAB 键 → 方向键，与图鉴键位对齐）
    //   说明：village-scene 派发本函数前已 toLowerCase()，
    //   故这里匹配 'arrowleft' / 'arrowright'。
    //   一旦消费方向键即 return true，village-scene 会跳过后续
    //   `this.keys.left/right = true` 的赋值，从而不会触发玩家移动 → 零冲突。
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
    // 数字键快速切换
    if (['1','2','3','4'].includes(key)) {
      this.currentTab = this.tabs[parseInt(key)-1].key;
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────
  // 鼠标接入（仗 3 新增）
  // ─────────────────────────────────────────

  /**
   * 鼠标坐标命中检测（与 render() 几何同步，写错就 hover 漂移）
   * 返回 { type: 'tab'|'item'|'close'|null, idx }
   *
   * Canvas 主面板几何（与 render 完全一致）：
   *   主面板：x=240, y=90, w=800, h=540
   *   ✕ 按钮：右上角 30×30，位于 (x+w-40, y+10)
   *   Tab 栏：tabY = y+80, 每个 tab w=175 h=40，间距 185，起点 x+30
   *   物品列表：listY = tabY+60，每行 h=55，宽 w-60，起点 x+30
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
    const tabY = y + 80, tabW = 175, tabH = 40, tabGap = 185;
    for (let i = 0; i < this.tabs.length; i++) {
      const tx = x + 30 + i * tabGap;
      if (mx >= tx && mx <= tx + tabW && my >= tabY && my <= tabY + tabH) {
        return { type: 'tab', idx: i };
      }
    }

    // 物品行命中
    const items = this.inventory.getByCategory(this.currentTab);
    const listY = tabY + 60, rowH = 60, rowVisH = 55;
    const itemX = x + 30, itemW = w - 60;
    for (let i = 0; i < items.length; i++) {
      const iy = listY + i * rowH;
      if (mx >= itemX && mx <= itemX + itemW && my >= iy && my <= iy + rowVisH) {
        return { type: 'item', idx: i };
      }
    }

    return { type: null, idx: -1 };
  }

  /**
   * 鼠标移动 → 更新 hover 字段
   * 返回值供调用方设置 canvas.style.cursor：'pointer' | 'default'
   */
  handleMouseMove(mx, my) {
    if (!this.visible) return 'default';
    const hit = this._hitTest(mx, my);
    this.mouseHoveredClose = hit.type === 'close';
    this.mouseHoveredTab = hit.type === 'tab' ? hit.idx : -1;
    this.mouseHoveredItem = hit.type === 'item' ? hit.idx : -1;
    return hit.type ? 'pointer' : 'default';
  }

  /**
   * 鼠标点击 → 命中 tab/✕/物品行 分发
   * 返回 true 表示已处理（调用方应阻止冒泡，避免 ClickToMove 寻路）
   */
  handleMouseClick(mx, my) {
    if (!this.visible) return false;
    const hit = this._hitTest(mx, my);
    if (hit.type === 'close') {
      this.hide();
      return true;
    }
    if (hit.type === 'tab') {
      this.currentTab = this.tabs[hit.idx].key;
      return true;
    }
    if (hit.type === 'item') {
      // 仅视觉选中，不触发功能（约束 1：键盘双轨保留，本仗不引入新业务）
      return true;
    }
    // 点面板内空白也算"消费点击"——避免点空处穿透到 ClickToMove
    const x = 240, y = 90, w = 800, h = 540;
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) return true;
    // 点面板外蒙层 → 关闭
    this.hide();
    return true;
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
    ctx.font = 'bold 32px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎒 阿明的背包', x + 30, y + 50);

    // 金币显示（右上，留出 ✕ 按钮空间）
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px "TencentSansW7", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${this.inventory.getCoin()} 金`, x + w - 60, y + 50);
    ctx.textAlign = 'left';

    // ✕ 关闭按钮（右上角 30×30；hover 时高亮）
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    ctx.fillStyle = this.mouseHoveredClose ? 'rgba(255, 215, 0, 0.25)' : 'transparent';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = this.mouseHoveredClose ? '#ffd700' : '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = this.mouseHoveredClose ? '#ffd700' : '#d4a574';
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✕', cx + cw / 2, cy + 22);
    ctx.textAlign = 'left';

    // Tab 栏
    const tabY = y + 80;
    this.tabs.forEach((tab, i) => {
      const tx = x + 30 + i * 185;
      const active = tab.key === this.currentTab;
      const hovered = this.mouseHoveredTab === i;
      // 背景：active > hovered > 普通
      if (active) {
        ctx.fillStyle = '#d4a574';
      } else if (hovered) {
        ctx.fillStyle = '#7a5230';  // hover 浅金棕
      } else {
        ctx.fillStyle = '#5a3a1f';
      }
      ctx.fillRect(tx, tabY, 175, 40);
      // hover 边框（吉卜力风浅金）
      if (hovered && !active) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(tx, tabY, 175, 40);
      }
      ctx.fillStyle = active ? '#2d1b0e' : '#d4a574';
      ctx.font = '20px "TencentSansW7", sans-serif';
      ctx.fillText(tab.label, tx + 15, tabY + 27);
    });

    // 物品列表
    const items = this.inventory.getByCategory(this.currentTab);
    const listY = tabY + 60;
    if (items.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '20px "TencentSansW7", sans-serif';
      ctx.fillText('（这一类还没有物品）', x + 40, listY + 30);
    } else {
      items.forEach((item, i) => {
        const iy = listY + i * 60;
        const hovered = this.mouseHoveredItem === i;
        // 物品行背景：hover > 斑马纹
        if (hovered) {
          ctx.fillStyle = 'rgba(244,217,154,0.18)';
        } else {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(212,165,116,0.1)' : 'transparent';
        }
        ctx.fillRect(x + 30, iy, w - 60, 55);
        // hover 边框
        if (hovered) {
          ctx.strokeStyle = '#f4d99a';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 30, iy, w - 60, 55);
        }
        // 图标
        ctx.font = '36px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(item.icon, x + 45, iy + 40);
        // 名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px "TencentSansW7", sans-serif';
        ctx.fillText(`${item.name} ×${item.count}`, x + 100, iy + 28);
        // 已装备标记
        if (item.category === 'rod' && window.equipment && window.equipment.getEquippedRod().id === item.id) {
          ctx.fillStyle = '#7CFC00';
          ctx.font = 'bold 18px "TencentSansW7", sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('⚔️ 已装备', x + w - 40, iy + 28);
          ctx.textAlign = 'left';
        }
        // 描述
        ctx.fillStyle = '#bbb';
        ctx.font = '16px "TencentSansW7", sans-serif';
        ctx.fillText(item.desc, x + 100, iy + 48);
      });
    }

    // 底部提示（仗 3 追加鼠标提示）
    ctx.fillStyle = '#888';
    ctx.font = '16px "TencentSansW7", sans-serif';
    ctx.fillText('← → / 1-4 切换分类   B/ESC 关闭   🖱️ 点 Tab 切换 / 点 ✕ 关闭', x + 30, y + h - 20);
  }
}
