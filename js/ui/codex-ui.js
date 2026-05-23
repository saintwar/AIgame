import { FISH_CODEX } from '../data/fish-codex.js';

export class CodexUI {
  constructor(canvas, codex) {
    this.canvas = canvas;
    this.codex = codex;
    this.visible = false;
    this.selectedIdx = 0;       // 当前选中鱼的索引
    this.species = codex.getAllSpecies();
  }

  toggle() {
    this.visible = !this.visible;
    if (this.visible) {
      this.species = this.codex.getAllSpecies();
      // 打开时默认选中第 1 个槽位（PHASE 16-6 键位规范）
      this.selectedIdx = 0;
    }
  }
  hide()   { this.visible = false; }

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

    // 进度
    const got = this.codex.getUnlockedCount();
    const total = this.codex.getTotalCount();
    ctx.fillStyle = '#aaccdd';
    ctx.font = 'bold 22px TencentSansW7, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`已收集 ${got}/${total}`, x + w - 30, y + 50);
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

      // 槽背景
      ctx.fillStyle = selected ? '#5fb3d9' : (unlocked ? '#2a4a5a' : '#0a1525');
      ctx.fillRect(sx, sy, slotSize, slotSize);
      ctx.strokeStyle = selected ? '#ffd700' : '#3a5a6a';
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeRect(sx, sy, slotSize, slotSize);

      // 图标 / 问号
      ctx.font = '40px sans-serif';
      ctx.textAlign = 'center';
      if (unlocked) {
        ctx.fillStyle = '#fff';
        ctx.fillText(FISH_CODEX[sp].icon, sx + slotSize / 2, sy + slotSize / 2 + 14);
      } else {
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
      // 大图标
      ctx.font = '80px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(data.icon, cardX + cardW / 2, cardY + 90);
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

    // 底部提示
    ctx.fillStyle = '#888';
    ctx.font = '16px TencentSansW7, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('← → ↑ ↓ / A D 切换鱼种   Enter 确认   T / ESC 关闭', x + 30, y + h - 20);
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
