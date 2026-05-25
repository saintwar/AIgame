/**
 * RestPanel — 秀兰阿姨民宿弹窗（PHASE 17 仗2）
 * ────────────────────────────────────────────────────────
 * 职责：
 *   玩家在秀兰对话中选「我想休息一下」后弹出本面板，
 *   提供 3 档"花金币恢复体力"的选项（小憩 / 午休 / 满血复活）。
 *
 * 复用：
 *   - 视觉/几何：复刻 ShopUI 同尺寸主面板（x=240,y=90,w=800,h=540），
 *     ✕ 关闭按钮位置 (x+w-40,y+10) 30×30，与背包/图鉴/店铺严格一致。
 *   - 输入交互：键鼠双通道（数字键 1/2/3/4 / ↑↓+Enter / ESC / 鼠标点击 / hover）
 *   - 字体/配色：'TencentSansW7' + 棕底金字（#2d1b0e / #d4a574 / #ffd700）
 *
 * 数值规格（PRD v2.0，由老板钉死）：
 *   - 小憩  : 30 体力 / 20 金币
 *   - 午休  : 60 体力 / 40 金币
 *   - 满血  : 至上限 / 80 金币
 *   - 不了  : 直接关闭
 *
 * 业务流（chooseRest）：
 *   1) 体力满（cur >= max）→ 飘字"体力已满"+ 不扣钱、不关面板
 *   2) 金币不足 → 飘字"金币不足"+ 不扣钱、不关面板（红色 #FF6B6B）
 *   3) 扣金币（inventory.spendCoin） → 恢复体力（StaminaSystem.restoreStamina）
 *      → 飘字"💤 睡了一觉，恢复 X 体力"（金色大号）→ 关面板 → Save.commit
 *
 * 灰显规则（实时根据金币状态）：
 *   - coin < 20  → 全部 3 档灰显，顶部黄色提示"金币不足，先去钓几条鱼吧"
 *   - coin < 40  → 仅小憩可选；午休/满血灰显
 *   - coin < 80  → 满血灰显
 *   - 灰显项点击 → 飘字"金币不足"，不扣钱
 *
 * 全局：
 *   window.restPanel 单例，由 main.js 挂载；DialogueSystem 选项 callback
 *   引用 window.restPanel.open() 打开。
 *
 * 渲染挂载：
 *   village-scene._render 在 shopUI.render 之后调 restPanel.render(ctx)，
 *   保证遮罩层级正确（背景半透 + 主面板覆盖在场景之上）。
 */

import StaminaSystem from '../stamina-system.js';

/**
 * 民宿菜单（PRD v2.0 数值）
 *   stamina === 'max' 表示恢复至上限
 */
const REST_MENU = [
  { id: 'short',  stamina: 30,    coin: 20, label: '小憩',     desc: '稍事休息' },
  { id: 'middle', stamina: 60,    coin: 40, label: '午休一觉', desc: '舒舒服服睡一觉' },
  { id: 'full',   stamina: 'max', coin: 80, label: '满血复活', desc: '彻底恢复至满' }
];

export class RestPanel {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{getCoin:Function, spendCoin:Function}} inventory
   */
  constructor(canvas, inventory) {
    this.canvas = canvas;
    this.inventory = inventory;
    this.visible = false;

    // 选中索引：0/1/2 = 三档恢复，3 = 告辞
    this.selectedIdx = 0;

    // hover 状态（与 shop-ui 同范式：每帧 mousemove 刷新，render 时读）
    this.mouseHoveredClose = false;
    this.mouseHoveredItem = -1;  // 0/1/2/3 行 hover；-1=无
  }

  open() {
    this.visible = true;
    this.selectedIdx = 0;
    this._resetHover();
  }

  hide() {
    this.visible = false;
    this._resetHover();
  }

  _resetHover() {
    this.mouseHoveredClose = false;
    this.mouseHoveredItem = -1;
  }

  // ─── 输入：键盘 ─────────────────────────────────────────
  // village-scene._keyHandler 已对 e.key 做 toLowerCase，传入永远是小写串。
  handleKey(key) {
    if (!this.visible) return false;

    if (key === 'escape') { this.hide(); return true; }

    // 数字键 1/2/3/4 直选（PRD 必须）
    if (key === '1') { this.selectedIdx = 0; this._chooseRest(REST_MENU[0]); return true; }
    if (key === '2') { this.selectedIdx = 1; this._chooseRest(REST_MENU[1]); return true; }
    if (key === '3') { this.selectedIdx = 2; this._chooseRest(REST_MENU[2]); return true; }
    if (key === '4') { this.selectedIdx = 3; this.hide(); return true; }

    // ↑↓+Enter（兼容键盘老用户）
    if (key === 'arrowup')   { this.selectedIdx = Math.max(0, this.selectedIdx - 1); return true; }
    if (key === 'arrowdown') { this.selectedIdx = Math.min(3, this.selectedIdx + 1); return true; }
    if (key === 'enter' || key === ' ') {
      if (this.selectedIdx === 3) this.hide();
      else this._chooseRest(REST_MENU[this.selectedIdx]);
      return true;
    }
    return false;
  }

  // ─── 输入：鼠标 ─────────────────────────────────────────
  /**
   * 命中测试。type: 'close' | 'item' | 'panel' | null
   * 几何与 render 严格同步（详见 _renderItems）。
   */
  _hitTest(mx, my) {
    if (!this.visible) return { type: null, idx: -1 };
    const x = 240, y = 90, w = 800, h = 540;

    // ✕ 按钮（与 shop-ui 同位）
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
      return { type: 'close', idx: -1 };
    }

    // 面板外
    if (mx < x || mx > x + w || my < y || my > y + h) return { type: null, idx: -1 };

    // 4 个选项行（与 _renderItems 几何同步）
    const itemX = x + 30, itemW = w - 60;
    for (let i = 0; i < 4; i++) {
      const iy = y + 180 + i * 70;
      if (mx >= itemX && mx <= itemX + itemW && my >= iy && my <= iy + 60) {
        return { type: 'item', idx: i };
      }
    }
    return { type: 'panel', idx: -1 };
  }

  handleMouseMove(mx, my) {
    if (!this.visible) return 'default';
    const hit = this._hitTest(mx, my);
    this.mouseHoveredClose = hit.type === 'close';
    this.mouseHoveredItem = hit.type === 'item' ? hit.idx : -1;
    if (hit.type === 'close') return 'pointer';
    if (hit.type === 'item') return 'pointer';
    return 'default';
  }

  /**
   * 单击：✕→关闭；item→选中并立即执行（数字键等价）；panel→吞掉防穿透。
   * 返回 true 表示已消费事件，调用方应 stopImmediatePropagation。
   */
  handleMouseClick(mx, my) {
    if (!this.visible) return false;
    const hit = this._hitTest(mx, my);
    if (hit.type === 'close') { this.hide(); return true; }
    if (hit.type === 'item') {
      this.selectedIdx = hit.idx;
      if (hit.idx === 3) this.hide();
      else this._chooseRest(REST_MENU[hit.idx]);
      return true;
    }
    if (hit.type === 'panel') return true;  // 吞掉空白点击
    return false;
  }

  // ─── 业务：恢复逻辑 ─────────────────────────────────────
  _chooseRest(option) {
    if (!option) return;

    // 1) 体力满拦截（在金币校验前，避免"花了钱白睡"的最坏体验）
    const cur = StaminaSystem.getCurrent();
    const max = StaminaSystem.getMax();
    if (cur >= max) {
      this._float('❤️ 你的体力已经满了，不需要休息', '#888');
      return;
    }

    // 2) 金币校验
    const coin = this.inventory.getCoin();
    if (coin < option.coin) {
      this._float('💰 金币不足', '#FF6B6B');
      return;
    }

    // 3) 扣金币（spendCoin 内含再校验，理论必成功）
    if (!this.inventory.spendCoin(option.coin)) {
      this._float('💰 金币不足', '#FF6B6B');
      return;
    }

    // 4) 计算实际恢复量（满血复活 = 当前缺多少补多少）
    const restoreAmount = option.stamina === 'max'
      ? max - cur
      : option.stamina;
    StaminaSystem.restoreStamina(restoreAmount, 'rest');

    // 5) 飘字反馈
    this._float(`💤 睡了一觉，恢复 ${restoreAmount} 体力`, '#FFD700', 'large');

    // 6) 关闭面板（StaminaSystem.restoreStamina / inventory.spendCoin 已内部 commit）
    this.hide();
  }

  _float(text, color, size = 'normal') {
    if (typeof window !== 'undefined' && typeof window.showFloatText === 'function') {
      window.showFloatText(text, { color, size });
    }
  }

  // ─── 渲染 ───────────────────────────────────────────────
  render(ctx) {
    if (!this.visible) return;

    // 半透黑遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 1280, 720);

    // 主面板（与 shop-ui 同尺寸，复用整套视觉）
    const x = 240, y = 90, w = 800, h = 540;
    ctx.fillStyle = '#2d1b0e';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // 标题 + 副标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('🛏️ 秀兰阿姨民宿', x + 30, y + 50);

    // 当前金币 + 体力（右对齐头部，参照 shop-ui 显示金币的位置）
    const coin = this.inventory.getCoin();
    const cur = StaminaSystem.getCurrent();
    const max = StaminaSystem.getMax();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${coin}    ❤️ ${cur}/${max}`, x + w - 70, y + 50);
    ctx.textAlign = 'left';

    // ✕ 关闭按钮
    this._renderCloseBtn(ctx, x, y, w);

    // 副文案 + 灰显警示
    ctx.fillStyle = '#aaccdd';
    ctx.font = '20px "TencentSansW7", sans-serif';
    ctx.fillText('想休息一下吗？', x + 30, y + 100);

    // 灰显规则提示（金币不足时顶部红字）
    if (coin < REST_MENU[0].coin) {
      ctx.fillStyle = '#FFD166';
      ctx.font = 'bold 18px "TencentSansW7", sans-serif';
      ctx.fillText('💰 金币不足，先去钓几条鱼吧', x + 30, y + 140);
    } else {
      ctx.fillStyle = '#888';
      ctx.font = '16px "TencentSansW7", sans-serif';
      ctx.fillText('数字键 1/2/3/4 直选，或鼠标点击 / ↑↓+Enter，ESC 关闭', x + 30, y + 140);
    }

    // 选项列表
    this._renderItems(ctx, x, y, w, h);

    // 底部提示
    ctx.fillStyle = '#888';
    ctx.font = '14px "TencentSansW7", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('1/2/3 选档位   4 / ESC 告辞   或鼠标点击', x + 30, y + h - 20);
  }

  _renderCloseBtn(ctx, x, y, w) {
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    ctx.fillStyle = this.mouseHoveredClose ? 'rgba(255,215,0,0.25)' : 'transparent';
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

  /**
   * 4 个选项行（PRD 排版）：
   *   ① 小憩         恢复 30 体力 / 20 金币       [选择]
   *   ② 午休一觉     恢复 60 体力 / 40 金币       [选择]
   *   ③ 满血复活     恢复至上限 / 80 金币         [选择]
   *   ④ 不了，告辞                                 [选择]
   *
   * 状态：
   *   - 体力满 → 全部 3 档灰显（即使有钱也无意义）
   *   - 金币不足 → 该档灰显（颜色 #555 + 价格红字）
   *   - 选中行 → 棕色高亮 + 金边
   *   - hover  → 暖橙黄半透 + 金色描边（与 shop-ui 一致）
   */
  _renderItems(ctx, x, y, w, h) {
    const coin = this.inventory.getCoin();
    const cur = StaminaSystem.getCurrent();
    const max = StaminaSystem.getMax();
    const isFull = cur >= max;

    const itemX = x + 30, itemW = w - 60;

    // 前 3 档（恢复选项）
    for (let i = 0; i < REST_MENU.length; i++) {
      const opt = REST_MENU[i];
      const iy = y + 180 + i * 70;
      const selected = i === this.selectedIdx;
      const hovered = this.mouseHoveredItem === i;
      const affordable = coin >= opt.coin;
      const disabled = !affordable || isFull;

      // 行背景
      if (selected && !disabled) ctx.fillStyle = 'rgba(212,165,116,0.3)';
      else if (hovered)          ctx.fillStyle = 'rgba(244,217,154,0.18)';
      else                       ctx.fillStyle = 'transparent';
      ctx.fillRect(itemX, iy, itemW, 60);

      // hover/selected 描边
      if (selected && !disabled) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeRect(itemX, iy, itemW, 60);
      } else if (hovered) {
        ctx.strokeStyle = '#f4d99a';
        ctx.lineWidth = 2;
        ctx.strokeRect(itemX, iy, itemW, 60);
      }

      // 主文本
      const titleColor = disabled ? '#666' : '#fff';
      const descColor  = disabled ? '#555' : '#bbb';
      const priceColor = disabled
        ? (affordable ? '#666' : '#FF6B6B')
        : '#ffd700';

      ctx.fillStyle = titleColor;
      ctx.font = 'bold 22px "TencentSansW7", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const numTag = ['①', '②', '③'][i];
      const restoreLabel = opt.stamina === 'max' ? '恢复至上限' : `恢复 ${opt.stamina} 体力`;
      ctx.fillText(`${numTag}  ${opt.label}`, itemX + 16, iy + 28);

      ctx.fillStyle = descColor;
      ctx.font = '16px "TencentSansW7", sans-serif';
      ctx.fillText(`${restoreLabel} · ${opt.desc}`, itemX + 16, iy + 50);

      // 右侧价格（金币不足红字 / 满血灰）
      ctx.fillStyle = priceColor;
      ctx.font = 'bold 22px "TencentSansW7", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${opt.coin} 金`, itemX + itemW - 16, iy + 30);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // 第 4 项：告辞（永远可点）
    const i4 = 3;
    const iy = y + 180 + i4 * 70;
    const selected = this.selectedIdx === 3;
    const hovered = this.mouseHoveredItem === 3;
    if (selected)      ctx.fillStyle = 'rgba(212,165,116,0.3)';
    else if (hovered)  ctx.fillStyle = 'rgba(244,217,154,0.18)';
    else               ctx.fillStyle = 'transparent';
    ctx.fillRect(itemX, iy, itemW, 60);
    if (selected) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.strokeRect(itemX, iy, itemW, 60);
    } else if (hovered) {
      ctx.strokeStyle = '#f4d99a';
      ctx.lineWidth = 2;
      ctx.strokeRect(itemX, iy, itemW, 60);
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('④  不了，告辞', itemX + 16, iy + 38);
  }
}

// 单例延迟挂载（main.js 启动时 new RestPanel(canvas, inventory) → window.restPanel）
export default RestPanel;
