/**
 * 昵称输入弹窗
 * 风格：吉卜力像素风（沿用项目主题色 #3A2A1A / #C49A4A / #FFD580）
 * PHASE 16-2
 *
 * 用法：
 *   const name = await window.NicknameDialog.open({ canCancel: false });
 *   // name === null 表示取消（canCancel:true 时才可能）
 */
(function() {
  'use strict';

  // 推荐昵称池（台湾本土风味 + 钓鱼主题，避免敏感词）
  const SUGGESTIONS = [
    '日月潭浪人', '阿里山钓客', '北港老饕', '高雄船长',
    '基隆夜钓', '澎湖小将', '屏东海风', '宜兰山溪',
    '台中钓神', '花莲渔郎', '嘉义鱼王', '小琉球船家',
  ];

  // 主题色
  const C_BG = '#3A2A1A';
  const C_BORDER = '#C49A4A';
  const C_HIGHLIGHT = '#FFD580';
  const C_TEXT = '#F5E6D3';
  const C_DEEP = '#5C3A1E';
  const C_INPUT_BG = '#2A1A0E';
  const C_DANGER = '#E74C3C';

  window.NicknameDialog = {
    /**
     * 打开昵称弹窗
     * @param {Object} opts
     * @param {string} [opts.title]
     * @param {string} [opts.defaultValue]
     * @param {boolean} [opts.canCancel]  - 是否可取消（首次进入应为 false）
     * @returns {Promise<string|null>}    - 昵称或 null（取消）
     */
    open(opts = {}) {
      return new Promise((resolve) => {
        const {
          title = '🎣 给自己起个钓鱼名号',
          defaultValue = '',
          canCancel = false,
        } = opts;

        // ============ 遮罩 ============
        const mask = document.createElement('div');
        mask.id = 'nickname-dialog-mask';
        mask.style.cssText = `
          position: fixed; left: 0; top: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.65); z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          font-family: 'TencentSans', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Heiti SC', sans-serif;
          backdrop-filter: blur(2px);
        `;

        // ============ 弹窗主体 ============
        const dialog = document.createElement('div');
        dialog.style.cssText = `
          width: 480px; padding: 28px;
          background: ${C_BG};
          border: 4px solid ${C_BORDER};
          box-shadow: 0 0 0 2px ${C_DEEP}, 0 8px 32px rgba(0,0,0,0.6);
          color: ${C_TEXT};
          image-rendering: pixelated;
          animation: nickPop 0.25s ease-out;
        `;

        // 标题
        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        titleEl.style.cssText = `
          font-size: 22px; font-weight: bold; text-align: center;
          margin-bottom: 8px; color: ${C_HIGHLIGHT};
          text-shadow: 2px 2px 0 ${C_DEEP};
        `;

        // 副标题
        const subEl = document.createElement('div');
        subEl.textContent = '此名号将出现在排行榜上（最多12字）';
        subEl.style.cssText = `
          font-size: 13px; text-align: center;
          margin-bottom: 20px; color: ${C_BORDER};
        `;

        // 输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 12;
        input.value = defaultValue;
        input.placeholder = '输入你的钓鱼名号...';
        input.style.cssText = `
          width: 100%; padding: 12px;
          font-size: 18px; font-family: inherit;
          background: ${C_INPUT_BG}; color: #FFF4D6;
          border: 2px solid ${C_BORDER}; outline: none;
          box-sizing: border-box;
          margin-bottom: 12px;
        `;

        // 字数计数器
        const counter = document.createElement('div');
        counter.style.cssText = `
          font-size: 12px; text-align: right; color: ${C_BORDER};
          margin-bottom: 16px;
        `;
        const updateCounter = () => {
          counter.textContent = `${input.value.length} / 12`;
          counter.style.color = input.value.length > 12 ? C_DANGER : C_BORDER;
        };
        updateCounter();
        input.addEventListener('input', () => {
          // 用户开始输入时清除错误样式
          input.style.borderColor = C_BORDER;
          input.placeholder = '输入你的钓鱼名号...';
          updateCounter();
        });

        // ============ 推荐昵称 ============
        const suggestLabel = document.createElement('div');
        suggestLabel.textContent = '✨ 想不出？随机推荐：';
        suggestLabel.style.cssText = `
          font-size: 13px; color: ${C_BORDER}; margin-bottom: 8px;
        `;

        const suggestBox = document.createElement('div');
        suggestBox.style.cssText = `
          display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px;
        `;
        // 随机选 4 个
        const shuffled = [...SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 4);
        shuffled.forEach((name) => {
          const tag = document.createElement('button');
          tag.textContent = name;
          tag.style.cssText = `
            padding: 6px 10px; font-size: 13px; font-family: inherit;
            background: ${C_DEEP}; color: ${C_TEXT};
            border: 1px solid ${C_BORDER}; cursor: pointer;
            transition: background 0.15s, color 0.15s;
          `;
          tag.addEventListener('click', () => {
            input.value = name;
            updateCounter();
            input.focus();
          });
          tag.addEventListener('mouseenter', () => {
            tag.style.background = C_BORDER;
            tag.style.color = C_BG;
          });
          tag.addEventListener('mouseleave', () => {
            tag.style.background = C_DEEP;
            tag.style.color = C_TEXT;
          });
          suggestBox.appendChild(tag);
        });

        // ============ 按钮区 ============
        const btnBox = document.createElement('div');
        btnBox.style.cssText = `
          display: flex; gap: 12px; justify-content: flex-end;
        `;

        // 清理函数（关闭弹窗 + 移除注入样式）
        const closeAll = () => {
          if (mask.parentNode) mask.remove();
          const style = document.getElementById('nick-pop-style');
          if (style) style.remove();
          document.removeEventListener('keydown', escListener);
        };

        // ESC 监听（仅 canCancel 时生效）
        const escListener = (e) => {
          if (e.key === 'Escape' && canCancel) {
            closeAll();
            resolve(null);
          }
        };
        document.addEventListener('keydown', escListener);

        const okBtn = document.createElement('button');
        okBtn.textContent = '确定';
        okBtn.style.cssText = `
          padding: 10px 24px; font-size: 16px; font-family: inherit;
          background: ${C_BORDER}; color: ${C_BG}; font-weight: bold;
          border: 2px solid ${C_HIGHLIGHT}; cursor: pointer;
        `;
        okBtn.addEventListener('click', () => {
          const val = input.value.trim();
          if (!val) {
            input.style.borderColor = C_DANGER;
            input.placeholder = '请输入昵称！';
            input.focus();
            return;
          }
          if (val.length > 12) {
            input.style.borderColor = C_DANGER;
            input.focus();
            return;
          }
          closeAll();
          resolve(val);
        });

        // 回车提交
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            okBtn.click();
          }
        });

        if (canCancel) {
          const cancelBtn = document.createElement('button');
          cancelBtn.textContent = '取消';
          cancelBtn.style.cssText = `
            padding: 10px 24px; font-size: 16px; font-family: inherit;
            background: ${C_DEEP}; color: ${C_BORDER};
            border: 2px solid ${C_BORDER}; cursor: pointer;
          `;
          cancelBtn.addEventListener('click', () => {
            closeAll();
            resolve(null);
          });
          btnBox.appendChild(cancelBtn);
        }
        btnBox.appendChild(okBtn);

        // ============ 注入动画 keyframes ============
        if (!document.getElementById('nick-pop-style')) {
          const style = document.createElement('style');
          style.id = 'nick-pop-style';
          style.textContent = `
            @keyframes nickPop {
              0% { transform: scale(0.7); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
          `;
          document.head.appendChild(style);
        }

        // ============ 组装 ============
        dialog.appendChild(titleEl);
        dialog.appendChild(subEl);
        dialog.appendChild(input);
        dialog.appendChild(counter);
        dialog.appendChild(suggestLabel);
        dialog.appendChild(suggestBox);
        dialog.appendChild(btnBox);
        mask.appendChild(dialog);
        document.body.appendChild(mask);

        // 自动聚焦输入框
        setTimeout(() => input.focus(), 100);
      });
    },
  };
})();
