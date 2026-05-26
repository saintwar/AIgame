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

    // PHASE 16-6 仗2：选项分支基础设施
    //   契约：当前 line 含 `choices: [{ label, action }]` 字段时，
    //   打字机播完 → 渲染选项菜单（↑↓ 选 / Enter 确认）→ 触发 action。
    //   action 形态：
    //     - 'string'         → 视为下一段对话 ID，调 this.start(action)
    //     - { dialogId }     → 同上
    //     - { close: true }  → 直接关闭对话框
    //     - { callback: fn } → 关闭对话框后调用 fn
    //   choices 出现时，本行不再走 _next() 顺序播放（改由选项 action 决定走向）。
    this.choiceIdx = 0;
    // PHASE 18 仗5 - 仗2：选项命中盒数组（每帧 _renderChoices 重建；非选项行为 null）
    this._choiceRects = null;
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
    this.choiceIdx = 0;
    // PHASE 18 仗5 - 仗2：清空旧对话残留命中盒（避免上一段对话点击穿透到新段）
    this._choiceRects = null;

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
      ctx.font = 'bold 48px "TencentSansW7", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentLine.text.substring(0, this.charIdx), 640, 360);

      // 底部提示
      if (this.charIdx >= currentLine.text.length) {
        ctx.font = '24px "TencentSansW7", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const showArrow = this._arrowTimer < 0.25;
        if (showArrow) {
          ctx.fillText('▼', 640, 440);
        }
        // PHASE 16-4.8 仗4：补"/ 点击"提示，告知玩家可鼠标点击推进
        ctx.fillText('按空格 / 点击继续 · ESC跳过', 640, 480);
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
      ctx.font = 'bold 28px "TencentSansW7", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentLine.speaker, 128, boxY + 32);

      // 对话文字
      ctx.fillStyle = '#3D2B1F';
      ctx.font = '32px "TencentSansW7", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const displayText = currentLine.text.substring(0, this.charIdx);
      this._wrapText(ctx, displayText, 64, boxY + 80, 1152, 48);

      // PHASE 16-6 仗2：分支选项渲染（仅在打字机完成 + 当前行有 choices 时）
      const hasChoices = Array.isArray(currentLine.choices) && currentLine.choices.length > 0;
      const typingDone = this.charIdx >= currentLine.text.length;

      if (hasChoices && typingDone) {
        this._renderChoices(ctx, currentLine.choices, boxY);
      } else if (typingDone) {
        // 继续提示箭头（原有逻辑）
        ctx.font = '24px "TencentSansW7", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        // 闪烁动画
        const showArrow = this._arrowTimer < 0.35;
        const arrowAlpha = showArrow ? 0.85 : 0.25;
        ctx.fillStyle = `rgba(61,43,31,${arrowAlpha})`;
        ctx.fillText('▼', 1216, boxY + boxH - 16);

        // 按键提示文字
        ctx.font = '16px "TencentSansW7", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(61,43,31,0.45)';
        const isLastLine = this.currentLineIdx >= this.currentDialog.lines.length - 1;
        // PHASE 16-4.8 仗4：补"/ 点击"提示
        const hintText = isLastLine ? '按空格 / 点击 结束' : '按空格 / 点击 继续';
        ctx.fillText(hintText, 1216, boxY + boxH - 44);
      }
    }
  }

  /**
   * PHASE 16-6 仗2：选项菜单渲染
   *   覆盖在对话框右下角，每项一行；选中项有红底高亮 + ▶ 指示器。
   *   坐标基于对话框 boxY=540 / boxH=180，从 boxY+80 开始向下排。
   *
   * PHASE 18 仗5 - 仗2：选项命中区域写回 this._choiceRects 供鼠标点击/hover 派发
   */
  _renderChoices(ctx, choices, boxY) {
    const startX = 720;          // 选项区左边界（避开左侧对话文字）
    const startY = boxY + 80;    // 与正文同顶
    const lineH = 30;
    const padX = 14;
    const w = 480;

    // PHASE 18 仗5 - 仗2：每帧重建命中盒（坐标与红底高亮严格同步）
    this._choiceRects = [];

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      const y = startY + i * lineH;
      const selected = i === this.choiceIdx;

      // 命中盒（与红底矩形完全一致：startX, y - lineH/2 + 2, w, lineH - 4）
      this._choiceRects.push({
        x: startX,
        y: y - lineH / 2 + 2,
        w: w,
        h: lineH - 4,
        idx: i
      });

      if (selected) {
        // 选中态：红底白字
        ctx.fillStyle = 'rgba(168,60,60,0.85)';
        ctx.beginPath();
        this._roundRect(ctx, startX, y - lineH / 2 + 2, w, lineH - 4, 4);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px "TencentSansW7", sans-serif';
        ctx.fillText(`▶ ${c.label}`, startX + padX, y);
      } else {
        ctx.fillStyle = '#3D2B1F';
        ctx.font = '20px "TencentSansW7", sans-serif';
        ctx.fillText(`  ${c.label}`, startX + padX, y);
      }
    }

    // 操作提示
    ctx.fillStyle = 'rgba(61,43,31,0.55)';
    ctx.font = '14px "TencentSansW7", sans-serif';
    ctx.textAlign = 'right';
    // PHASE 18 仗5 - 仗2：补"鼠标点击 / 单击"提示（键盘操作零回归）
    ctx.fillText('↑↓ 选择   Enter / 单击 确认   ESC 取消', 1216, boxY + 180 - 14);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  handleKey(key) {
    if (!this.active || !this.currentDialog) return;

    const currentLine = this.currentDialog.lines[this.currentLineIdx];
    if (!currentLine) {
      // 当前行异常，强制结束
      this._end();
      return;
    }

    // PHASE 16-6 仗2：选项激活时（打字机完成 + 有 choices）走选项分支
    const hasChoices = Array.isArray(currentLine.choices) && currentLine.choices.length > 0;
    const typingDone = this.charIdx >= currentLine.text.length;
    if (hasChoices && typingDone) {
      if (key === 'ArrowUp' || key === 'arrowup') {
        this.choiceIdx = (this.choiceIdx - 1 + currentLine.choices.length) % currentLine.choices.length;
        return;
      }
      if (key === 'ArrowDown' || key === 'arrowdown') {
        this.choiceIdx = (this.choiceIdx + 1) % currentLine.choices.length;
        return;
      }
      if (key === 'Enter' || key === 'enter' || key === ' ') {
        this._activateChoice(currentLine.choices[this.choiceIdx]);
        return;
      }
      if (key === 'escape' || key === 'Escape') {
        // ESC 关闭对话（视为取消）
        this._end();
        return;
      }
      // 其它键忽略（避免空格意外推进）
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

  /**
   * PHASE 16-6 仗2：选项激活
   *   action 协议：
   *     - string             → start(action)（跳到下一段对话）
   *     - { dialogId }       → start(dialogId)
   *     - { close: true }    → 直接 _end()
   *     - { callback: fn }   → _end() 后调 fn（典型用例：关闭对话→打开商店）
   */
  _activateChoice(choice) {
    if (!choice) return;
    const action = choice.action;

    // 选项触发后，先把当前对话标记结束（清状态），再分发 action。
    // 注意：必须先清 active，避免 callback 里再 start 新对话时旧 _end 钩子误触发。
    const dialogId = this.dialogId;
    this.active = false;
    this.currentDialog = null;
    this.currentLineIdx = 0;
    this.charIdx = 0;
    this.dialogId = null;
    this.onEndCallback = null;

    // 已读对话记录（与 _end 保持一致）
    try {
      const save = window.Save;
      if (save && dialogId) {
        const readDialogues = save.get('flags.readDialogues') || [];
        if (!readDialogues.includes(dialogId)) {
          readDialogues.push(dialogId);
          save.set('flags.readDialogues', readDialogues);
          save.commit();
        }
      }
    } catch (e) {
      console.error('DialogueSystem _activateChoice save error:', e);
    }

    if (typeof action === 'string') {
      this.start(action);
    } else if (action && typeof action === 'object') {
      if (action.callback) {
        try { action.callback(); } catch (e) { console.error('Choice callback error:', e); }
      }
      if (action.dialogId) {
        this.start(action.dialogId);
      }
      // close: true 或不带 dialogId → 已经清状态，等同关闭
    }
  }

  /**
   * PHASE 16-4.8 仗4：鼠标点击 = 等同空格键（推进/跳过打字机）
   * 设计协议（坑 2）：单击 = 立即展示完整文字（打字机中）/ 进入下一句（打字机完成后）
   * 与 RPGMaker / 星露谷一致；旁白模式同样适用。
   *
   * PHASE 18 仗5 - 仗2：选项菜单激活时支持鼠标点击命中选择
   *   - 命中某选项 → choiceIdx 同步更新 + 立即触发 _activateChoice
   *   - 未命中任何选项 → 仅消费事件、不动作（防误触/防穿透 ClickToMove）
   *   - 调用方应传入 (x, y) canvas 坐标；不传则退化为"消费事件不动作"
   * 键盘操作零回归：↑↓+Enter 路径完全保留。
   * @param {number} [x] canvas 坐标 X
   * @param {number} [y] canvas 坐标 Y
   * @returns {boolean} 是否消费了点击（true：调用方应 stopPropagation）
   */
  handleClick(x, y) {
    if (!this.active || !this.currentDialog) return false;
    const currentLine = this.currentDialog.lines[this.currentLineIdx];
    if (currentLine) {
      const hasChoices = Array.isArray(currentLine.choices) && currentLine.choices.length > 0;
      const typingDone = this.charIdx >= currentLine.text.length;
      if (hasChoices && typingDone) {
        // PHASE 18 仗5 - 仗2：命中检测（坐标系：canvas）
        const rects = this._choiceRects;
        if (rects && typeof x === 'number' && typeof y === 'number') {
          for (const r of rects) {
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
              this.choiceIdx = r.idx;
              this._activateChoice(currentLine.choices[r.idx]);
              return true;
            }
          }
        }
        // 未命中或未传坐标 → 消费事件不动作
        return true;
      }
    }
    this.handleKey(' ');
    return true;
  }

  /**
   * PHASE 18 仗5 - 仗2：选项菜单 hover 派发
   *   - 命中某选项 → choiceIdx 同步更新 + 返回 'pointer' cursor
   *   - 未命中 → 返回 ''（保持默认 cursor，由调用方决定）
   * @param {number} x canvas 坐标
   * @param {number} y canvas 坐标
   * @returns {string} cursor 值（'pointer' 或 ''）
   */
  handleMouseMove(x, y) {
    if (!this.active || !this.currentDialog) return '';
    const currentLine = this.currentDialog.lines[this.currentLineIdx];
    if (!currentLine) return '';
    const hasChoices = Array.isArray(currentLine.choices) && currentLine.choices.length > 0;
    const typingDone = this.charIdx >= currentLine.text.length;
    if (!hasChoices || !typingDone) return '';
    const rects = this._choiceRects;
    if (!rects) return '';
    for (const r of rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.choiceIdx = r.idx;
        return 'pointer';
      }
    }
    return '';
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
          // PHASE 16-6 仗2：开店协议（让数据层 dialogues.js 不依赖 village-scene）
          //   'openXiulanShop' → 调全局 shopUI.openXiulanShop()
          //   'openLinBuyOnly' → 调全局 shopUI.openLinShop({buyOnly:true})
          if (action === 'openXiulanShop' && window.shopUI) {
            window.shopUI.openXiulanShop();
          }
          if (action === 'openLinBuyOnly' && window.shopUI) {
            window.shopUI.openLinShop({ buyOnly: true });
          }
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