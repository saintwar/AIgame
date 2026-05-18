// 对话系统（打字机 + 翻页 + 跳过）

import { DIALOGUES } from './data/dialogues.js';
import QuestSystem from './quest-system.js';

class DialogueSystem {
  constructor() {
    this.active = false;
    this.currentDialog = null;
    this.currentLineIdx = 0;
    this.charIdx = 0;
    this.typingSpeed = 30;        // 字/秒
    this.lastTypeTime = 0;
    this.onEndCallback = null;
    this.dialogId = null;
    this._arrowTimer = 0;
  }

  start(dialogId, opts = null) {
    const dialog = DIALOGUES[dialogId];
    if (!dialog) {
      console.error(`DialogueSystem: 对话 "${dialogId}" 未找到`);
      return;
    }

    // 兼容旧调用：start(id, onEndFn) 和 新调用：start(id, { onEnd, replacements })
    let onEnd = null;
    let replacements = null;
    if (typeof opts === 'function') {
      onEnd = opts;
    } else if (opts && typeof opts === 'object') {
      onEnd = opts.onEnd || null;
      replacements = opts.replacements || null;
    }

    // 如果有 replacements，预处理对话文本（深拷贝避免修改全局 DIALOGUES）
    let currentDialog = dialog;
    if (replacements) {
      currentDialog = {
        ...dialog,
        lines: dialog.lines.map(line => {
          let text = line.text;
          for (const [key, val] of Object.entries(replacements)) {
            text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
          }
          return { ...line, text };
        })
      };
    }

    this.active = true;
    this.dialogId = dialogId;
    this.currentDialog = currentDialog;
    this.currentLineIdx = 0;
    this.charIdx = 0;
    this.onEndCallback = onEnd;
    this._replacements = replacements;
    this.lastTypeTime = performance.now();
    this._arrowTimer = 0;

    // 已读对话快进（3倍速）
    const readDialogues = window.Save?.get('flags.readDialogues') || [];
    if (readDialogues.includes(dialogId)) {
      this.typingSpeed = 90;
    } else {
      this.typingSpeed = 30;
    }
  }

  update(dt) {
    if (!this.active || !this.currentDialog) return;

    const now = performance.now();
    const currentLine = this.currentDialog.lines[this.currentLineIdx];
    if (!currentLine) return;

    // 打字机效果
    if (this.charIdx < currentLine.text.length) {
      if (now - this.lastTypeTime > 1000 / this.typingSpeed) {
        this.charIdx++;
        this.lastTypeTime = now;
      }
    }

    // 箭头闪烁计时
    this._arrowTimer += dt;
    if (this._arrowTimer >= 0.5) this._arrowTimer = 0;
  }

  render(ctx) {
    if (!this.active || !this.currentDialog) return;

    const currentLine = this.currentDialog.lines[this.currentLineIdx];
    if (!currentLine) return;

    const isNarration = currentLine.speaker === '旁白';

    if (isNarration) {
      // 旁白模式：黑底白字全屏字幕
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, 1280, 720);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 48px "Cubic 11", "Noto Sans TC", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentLine.text.substring(0, this.charIdx), 640, 360);

      // 底部提示
      if (this.charIdx >= currentLine.text.length) {
        ctx.font = '24px "Cubic 11", "Noto Sans TC", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const showArrow = this._arrowTimer < 0.25;
        if (showArrow) {
          ctx.fillText('▼', 640, 440);
        }
        ctx.fillText('按空格继续 / ESC跳过', 640, 480);
      }
    } else {
      // 对话模式
      const boxY = 540;
      const boxH = 180;

      // 对话框背景
      ctx.fillStyle = 'rgba(244,228,193,0.95)';
      ctx.beginPath();
      this._roundRect(ctx, 0, boxY, 1280, boxH, 8);
      ctx.fill();

      // 双线边框
      ctx.strokeStyle = '#3D2B1F';
      ctx.lineWidth = 4;
      ctx.beginPath();
      this._roundRect(ctx, 0, boxY, 1280, boxH, 8);
      ctx.stroke();

      ctx.strokeStyle = '#A83C3C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this._roundRect(ctx, 4, boxY + 4, 1272, boxH - 8, 6);
      ctx.stroke();

      // 标题条
      ctx.fillStyle = '#A83C3C';
      ctx.beginPath();
      this._roundRect(ctx, 8, boxY + 8, 240, 48, 4);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px "Cubic 11", "Noto Sans TC", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentLine.speaker, 128, boxY + 32);

      // 对话文字
      ctx.fillStyle = '#3D2B1F';
      ctx.font = '32px "Cubic 11", "Noto Sans TC", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const displayText = currentLine.text.substring(0, this.charIdx);
      this._wrapText(ctx, displayText, 64, boxY + 80, 1152, 48);

      // 继续提示箭头
      if (this.charIdx >= currentLine.text.length) {
        ctx.font = '24px "Cubic 11", "Noto Sans TC", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        // 闪烁动画
        const showArrow = this._arrowTimer < 0.35;
        const arrowAlpha = showArrow ? 0.85 : 0.25;
        ctx.fillStyle = `rgba(61,43,31,${arrowAlpha})`;
        ctx.fillText('▼', 1216, boxY + boxH - 16);

        // 按键提示文字
        ctx.font = '16px "Cubic 11", "Noto Sans TC", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(61,43,31,0.45)';
        const isLastLine = this.currentLineIdx >= this.currentDialog.lines.length - 1;
        const hintText = isLastLine ? '按空格结束' : '按空格继续';
        ctx.fillText(hintText, 1216, boxY + boxH - 44);
      }
    }
  }

  handleKey(key) {
    if (!this.active || !this.currentDialog) return;

    const currentLine = this.currentDialog.lines[this.currentLineIdx];
    if (!currentLine) {
      // 当前行异常，强制结束
      this._end();
      return;
    }

    if (key === ' ') {
      // 空格键
      if (this.charIdx < currentLine.text.length) {
        // 立即显示完当前句
        this.charIdx = currentLine.text.length;
      } else {
        // 进入下一句
        this._next();
      }
    } else if (key === 'escape') {
      // ESC 跳过整段对话
      this._end();
    }
  }

  _next() {
    this.currentLineIdx++;
    if (this.currentLineIdx >= this.currentDialog.lines.length) {
      this._end();
    } else {
      this.charIdx = 0;
      this.lastTypeTime = performance.now();
    }
  }

  _end() {
    // 先标记为非活跃，确保不会卡死
    this.active = false;
    this.charIdx = 0;
    this.currentLineIdx = 0;

    const callback = this.onEndCallback;
    const dialogId = this.dialogId;
    const currentDialog = this.currentDialog;

    // 清理引用（防止回调中再次触发）
    this.currentDialog = null;
    this.onEndCallback = null;
    this.dialogId = null;

    // 记录已读
    try {
      const save = window.Save;
      if (save) {
        const readDialogues = save.get('flags.readDialogues') || [];
        if (dialogId && !readDialogues.includes(dialogId)) {
          readDialogues.push(dialogId);
          save.set('flags.readDialogues', readDialogues);
        }

        // 解析 onEnd 钩子
        if (currentDialog?.onEnd) {
          const [action, questId] = currentDialog.onEnd.split(':');
          if (action === 'acceptQuest') QuestSystem.accept(questId);
          if (action === 'completeQuest') QuestSystem.complete(questId);
        }

        save.commit();
      }
    } catch (e) {
      console.error('DialogueSystem _end error:', e);
    }

    // 执行回调
    if (callback) {
      try {
        callback();
      } catch (e) {
        console.error('DialogueSystem onEndCallback error:', e);
      }
    }
  }

  isActive() {
    return this.active;
  }

  // 辅助：圆角矩形路径
  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 辅助：文字换行
  _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = text.split('');
    let line = '';
    let lineY = y;

    for (let i = 0; i < chars.length; i++) {
      const testLine = line + chars[i];
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && line !== '') {
        ctx.fillText(line, x, lineY);
        line = chars[i];
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line !== '') {
      ctx.fillText(line, x, lineY);
    }
  }
}

const dialogueSystem = new DialogueSystem();
export default dialogueSystem;