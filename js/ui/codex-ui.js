import { FISH_CODEX } from '../data/fish-codex.js';
// hotfix-u（2026-06-04）：图鉴优先用 512×512 PNG 鱼图，未就绪兜底 emoji
import { getFishSpriteBySpecies, isFishSpriteReady } from '../render/fish-sprite-loader.js';

/**
 * 鱼类图鉴 UI（Canvas 绘制）
 *
 * PHASE 16-4.8 仗3：鼠标化改造
 *   原始结构 Canvas 绘制（非 DOM），故 CSS hover 不生效。
 *   改造方案：在 Canvas 内做坐标命中检测 + 维护 mouseHovered* 字段。
 *
 *   - mouseHoveredSlot   网格槽位 hover（独立于 selectedIdx，hover 不修改键盘选中）
 *   - mouseHoveredClose  ✕ 按钮 hover
 *
 *   外部驱动接口：
 *     handleMouseMove(x, y)  → 更新 hover 字段，返回 'pointer' | 'not-allowed' | 'default'
 *     handleMouseClick(x, y) → 命中 ✕ → 关闭；命中槽位 → 直接 selectedIdx = idx（即点即看，行为与键盘 Enter 一致）
 *
 *   ⚠️ 与策划任务原文的差异：
 *     原文要求"单击 = 选中、双击 = 打开详情卡"，但本图鉴架构是"网格 + 详情卡同屏"，
 *     selectedIdx 改变即看到详情，没有"打开详情卡"的额外动作（见 handleKey 注释）。
 *     故本仗采用"单击即选中即看详情"，与现有 Enter 等效，不引入双击。
 *     未发现的鱼仍允许选中（与键盘行为一致），但 cursor 显示 not-allowed 暗示"无更多内容"。
 */
export class CodexUI {
  constructor(canvas, codex) {
    this.canvas = canvas;
    this.codex = codex;
    this.visible = false;
    this.selectedIdx = 0;       // 当前选中鱼的索引（键盘 + 鼠标共享）
    this.species = codex.getAllSpecies();

    // 鼠标 hover 状态（仗3 新增，与 selectedIdx 独立）
    this.mouseHoveredSlot = -1;
    this.mouseHoveredClose = false;
  }

  toggle() {
    this.visible = !this.visible;
    if (this.visible) {
      this.species = this.codex.getAllSpecies();
      // 打开时默认选中第 1 个槽位（PHASE 16-6 键位规范）
      this.selectedIdx = 0;
    } else {
      this._resetHover();
    }
  }
  hide()   { this.visible = false; this._resetHover(); }

  _resetHover() {
    this.mouseHoveredSlot = -1;
    this.mouseHoveredClose = false;
  }

  handleKey(key) {
    if (!this.visible) return false;
    // 注意：village-scene 派发本函数前已 toLowerCase()，
    //   故 ESC / 方向键全部走小写匹配。
    //   （历史 bug：原代码用 'Escape' / 'ArrowLeft' / 'ArrowRight' 大写
    //   永远匹配不上，导致用户报告"ESC + 方向键无响应"。）
    if (key === 'escape' || key === 't') {
      this.hide(); return true;
    }
    // ← / ↑ / A → 上一个；→ / ↓ / D → 下一个（与背包键位风格对齐）
    //   单行循环切换，边界自动绕回。
    if (key === 'arrowleft' || key === 'arrowup' || key === 'a') {
      this.selectedIdx = (this.selectedIdx - 1 + this.species.length) % this.species.length;
      return true;
    }
    if (key === 'arrowright' || key === 'arrowdown' || key === 'd') {
      this.selectedIdx = (this.selectedIdx + 1) % this.species.length;
      return true;
    }
    // Enter：当前选中物的"确认"反馈
    //   现有 UI 是一体式（网格+详情卡同屏），选中即看详情，
    //   故已解锁时 Enter 仅消费按键避免冒泡（视觉无变化）；
    //   未解锁时同样消费（不弹提示，避免破坏现有架构）。
    if (key === 'enter') {
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────
  // 鼠标接入（仗 3 新增）
  // ─────────────────────────────────────────

  /**
   * 命中检测（与 render() 几何同步）
   * 主面板 x=160, y=60, w=960, h=600
   * 网格 gridX = x+30, gridY = y+100；slotSize=80, slotGap=12，每行 4 列
   * ✕ 按钮：右上角 30×30，位于 (x+w-40, y+10)
   */
  _hitTest(mx, my) {
    if (!this.visible) return { type: null, idx: -1 };
    const x = 160, y = 60, w = 960, h = 600;

    // ✕ 按钮命中
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
      return { type: 'close', idx: -1 };
    }

    // 网格槽位命中
    const gridX = x + 30, gridY = y + 100;
    const slotSize = 80, slotGap = 12;
    for (let i = 0; i < this.species.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const sx = gridX + col * (slotSize + slotGap);
      const sy = gridY + row * (slotSize + slotGap);
      if (mx >= sx && mx <= sx + slotSize && my >= sy && my <= sy + slotSize) {
        return { type: 'slot', idx: i };
      }
    }

    return { type: null, idx: -1 };
  }

  handleMouseMove(mx, my) {
    if (!this.visible) return 'default';
    const hit = this._hitTest(mx, my);
    this.mouseHoveredClose = hit.type === 'close';
    this.mouseHoveredSlot = hit.type === 'slot' ? hit.idx : -1;
    if (hit.type === 'close') return 'pointer';
    if (hit.type === 'slot') {
      // 未发现的鱼：cursor 提示 not-allowed（但仍允许点选，保持与键盘一致）
      const sp = this.species[hit.idx];
      return this.codex.isUnlocked(sp) ? 'pointer' : 'not-allowed';
    }
    return 'default';
  }

  handleMouseClick(mx, my) {
    if (!this.visible) return false;
    const hit = this._hitTest(mx, my);
    if (hit.type === 'close') {
      this.hide();
      return true;
    }
    if (hit.type === 'slot') {
      // 单击即选中即看详情（与键盘方向键行为等价）
      // 未发现的鱼也允许选中——会显示"???"详情，与原键盘体验一致
      this.selectedIdx = hit.idx;
      return true;
    }
    // 点面板内空白：消费点击避免穿透到 ClickToMove
    const x = 160, y = 60, w = 960, h = 600;
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) return true;
    // 点蒙层 → 关闭
    this.hide();
    return true;
  }

  render(ctx) {
    if (!this.visible) return;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 1280, 720);

    // 主面板（居中 960×600）
    const x = 160, y = 60, w = 960, h = 600;
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#5fb3d9';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // 标题
    //   PHASE 16-7：图鉴 Canvas 中文文字统一改用 TencentSansW7（别名已在 index.html 注册）。
    //   原 'monospace' 在中文场景下会 fallback 到等宽中文字体，与 DOM 侧 TencentSans 视觉不统一。
    //   注意：emoji（🐟📖等）和大字号问号仍保留 sans-serif，由系统 emoji 字体渲染。
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px TencentSansW7, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📖 鱼类图鉴 · 日月潭', x + 30, y + 50);

    // 进度（右移留 ✕ 空间）
    const got = this.codex.getUnlockedCount();
    const total = this.codex.getTotalCount();
    ctx.fillStyle = '#aaccdd';
    ctx.font = 'bold 22px TencentSansW7, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`已收集 ${got}/${total}`, x + w - 60, y + 50);
    ctx.textAlign = 'left';

    // ✕ 关闭按钮（右上角 30×30；hover 时高亮）
    const cx = x + w - 40, cy = y + 10, cw = 30, ch = 30;
    ctx.fillStyle = this.mouseHoveredClose ? 'rgba(95, 179, 217, 0.3)' : 'transparent';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = this.mouseHoveredClose ? '#ffd700' : '#5fb3d9';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = this.mouseHoveredClose ? '#ffd700' : '#5fb3d9';
    ctx.font = 'bold 22px TencentSansW7, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✕', cx + cw / 2, cy + 22);
    ctx.textAlign = 'left';

    // 进度条
    const barX = x + 30, barY = y + 70, barW = w - 60, barH = 8;
    ctx.fillStyle = '#0a1525';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(barX, barY, barW * (got / total), barH);

    // 左侧网格
    const gridX = x + 30, gridY = y + 100;
    const slotSize = 80, slotGap = 12;
    this.species.forEach((sp, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const sx = gridX + col * (slotSize + slotGap);
      const sy = gridY + row * (slotSize + slotGap);
      const unlocked = this.codex.isUnlocked(sp);
      const selected = i === this.selectedIdx;
      const hovered = i === this.mouseHoveredSlot;

      // 槽背景：selected > unlocked > 普通
      ctx.fillStyle = selected ? '#5fb3d9' : (unlocked ? '#2a4a5a' : '#0a1525');
      ctx.fillRect(sx, sy, slotSize, slotSize);
      // 边框：selected > hovered > 普通
      if (selected) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
      } else if (hovered) {
        ctx.strokeStyle = '#f4d99a';  // hover 浅金色（吉卜力风）
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = '#3a5a6a';
        ctx.lineWidth = 1;
      }
      ctx.strokeRect(sx, sy, slotSize, slotSize);

      // 图标 / 问号
      ctx.textAlign = 'center';
      if (unlocked) {
        // hotfix-u：优先用 PNG，未就绪兜底 emoji
        const sprite = getFishSpriteBySpecies(sp);
        if (isFishSpriteReady(sprite)) {
          // 槽内贴鱼图，留 6px padding
          const pad = 6;
          const drawW = slotSize - pad * 2;
          const drawH = drawW * (sprite.naturalHeight / sprite.naturalWidth);
          ctx.drawImage(sprite, sx + pad, sy + (slotSize - drawH) / 2, drawW, drawH);
        } else {
          ctx.font = '40px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText(FISH_CODEX[sp].icon, sx + slotSize / 2, sy + slotSize / 2 + 14);
        }
      } else {
        ctx.font = '40px sans-serif';
        ctx.fillStyle = '#445566';
        ctx.fillText('?', sx + slotSize / 2, sy + slotSize / 2 + 14);
      }
      ctx.textAlign = 'left';
    });

    // 右侧详情卡
    const cardX = x + 460, cardY = y + 100, cardW = 470, cardH = 460;
    ctx.fillStyle = '#0e1c2a';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = '#3a5a6a';
    ctx.lineWidth = 1;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    const sp = this.species[this.selectedIdx];
    const data = FISH_CODEX[sp];
    const entry = this.codex.getEntry(sp);
    const unlocked = !!entry;

    if (unlocked) {
      // 大图标（hotfix-u：优先用 PNG，未就绪兜底 emoji）
      ctx.textAlign = 'center';
      const bigSprite = getFishSpriteBySpecies(sp);
      if (isFishSpriteReady(bigSprite)) {
        // 详情卡顶部贴大图，宽 160 居中
        const bigW = 160;
        const bigH = bigW * (bigSprite.naturalHeight / bigSprite.naturalWidth);
        ctx.drawImage(bigSprite, cardX + cardW / 2 - bigW / 2, cardY + 20, bigW, bigH);
      } else {
        ctx.font = '80px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(data.icon, cardX + cardW / 2, cardY + 90);
      }
      ctx.textAlign = 'left';

      // 名称
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 28px TencentSansW7, sans-serif';
      ctx.fillText(data.name, cardX + 20, cardY + 140);

      // 稀有度
      ctx.fillStyle = '#ffaa44';
      ctx.font = '20px TencentSansW7, sans-serif';
      ctx.fillText('★'.repeat(data.rarity) + '☆'.repeat(5 - data.rarity), cardX + 20, cardY + 170);

      // 信息行
      let yy = cardY + 200;
      const info = [
        `📍 区域：${data.region}`,
        `📏 体长：${data.sizeRange[0]}-${data.sizeRange[1]} cm（已捕最大 ${entry.maxSize || '?'} cm）`,
        `🌸 季节：${data.season}`,
        `🎣 钓获次数：${entry.count}`,
        `📅 首次：${new Date(entry.firstAt).toLocaleDateString()}`
      ];
      ctx.fillStyle = '#cce0ee';
      ctx.font = '18px TencentSansW7, sans-serif';
      info.forEach(line => { ctx.fillText(line, cardX + 20, yy); yy += 28; });

      // 描述
      ctx.fillStyle = '#aaccdd';
      ctx.font = '16px TencentSansW7, sans-serif';
      this._wrapText(ctx, data.desc, cardX + 20, yy + 10, cardW - 40, 22);

      // 传说
      ctx.fillStyle = '#ffaa44';
      ctx.font = 'italic 16px TencentSansW7, sans-serif';
      this._wrapText(ctx, '💭 ' + data.legend, cardX + 20, yy + 80, cardW - 40, 22);
    } else {
      // 未解锁
      ctx.fillStyle = '#445566';
      ctx.font = '120px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', cardX + cardW / 2, cardY + 200);
      ctx.font = 'bold 24px TencentSansW7, sans-serif';
      ctx.fillText('???', cardX + cardW / 2, cardY + 280);
      ctx.font = '18px TencentSansW7, sans-serif';
      ctx.fillText('钓到这种鱼来解锁吧～', cardX + cardW / 2, cardY + 320);
      ctx.textAlign = 'left';
    }

    // 底部提示（仗 3 追加鼠标提示）
    ctx.fillStyle = '#888';
    ctx.font = '16px TencentSansW7, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('← → ↑ ↓ / A D 切换鱼种   T / ESC 关闭   🖱️ 点格子查看 / 点 ✕ 关闭', x + 30, y + h - 20);
  }

  _wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split('');
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i];
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line, x, y);
        line = words[i];
        y += lineH;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y);
  }
}
