/**
 * float-text.js — 全局 DOM 飘字工具（PHASE 17 仗1）
 * ────────────────────────────────────────────────────────
 * 职责：
 *   提供 window.showFloatText(text, opts) 让任意系统在屏幕中央弹一条
 *   带渐变上浮动画的提示。补齐项目长期"每个模块自己写一份 _showFloatText
 *   并 inject CSS"的散落问题（quest-system / fishing-scene._showCodexToast）。
 *
 * 接口：
 *   window.showFloatText(text, {
 *     color?: string,         // 文字颜色（默认 '#FFD700'）
 *     size?: 'normal'|'large',// 字号档位（normal=44px / large=56px，默认 normal）
 *     duration?: number,      // 持续毫秒（默认 2400）
 *   })
 *
 * 设计：
 *   - 单例样式注入，多次调用 0 副作用
 *   - 挂到 #game-root（与缩放容器对齐，跟随窄屏 transform:scale）
 *   - pointer-events:none 不影响任何点击
 *   - 与 quest-system._showFloatText 视觉风格保持一致（沿用同一份 keyframes）
 *   - 不复用 quest-system 的私有方法，避免循环依赖
 *
 * 注意：
 *   - 同时多条飘字会重叠（垂直堆叠由各调用方自行错位 / 间隔）；本仗不做队列
 *   - duration 短于动画时长（2400ms）时，仅缩短 setTimeout，CSS 动画仍 2.4s 走完
 */

const STYLE_ID = 'float-text-style';
const KEYFRAME = 'floatTextFade';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes ${KEYFRAME} {
      0%   { opacity: 0; transform: translate(-50%, 30%) scale(0.6); }
      20%  { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
      35%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
      85%  { opacity: 1; transform: translate(-50%, -60%) scale(1.0); }
      100% { opacity: 0; transform: translate(-50%, -90%) scale(1.0); }
    }
    .float-text-toast {
      position: absolute;
      top: 30%;
      left: 50%;
      transform: translate(-50%, -50%);
      /* 末尾追加 emoji 字体：飘字含 🪱 ⏰ 💔 ✨ 等 emoji，前面字体均不含这些字符，
         若 fallback 链末尾没有 emoji 字体，浏览器会显示豆腐方框（旧 bug：🪱→□）。
         按 macOS / Windows / Linux 顺序覆盖。 */
      font-family: 'TencentSans', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Heiti SC', sans-serif,
                   'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji';
      text-shadow: 0 0 8px #000, 0 0 16px #000;
      pointer-events: none;
      z-index: 1000;
      white-space: nowrap;
      will-change: transform, opacity;
    }
    .float-text-toast.size-normal { font-size: 44px; }
    .float-text-toast.size-large  { font-size: 56px; }
  `;
  document.head.appendChild(style);
}

/**
 * 显示一条飘字
 * @param {string} text
 * @param {{color?:string, size?:'normal'|'large', duration?:number}} [opts]
 */
function showFloatText(text, opts = {}) {
  ensureStyle();
  const { color = '#FFD700', size = 'normal', duration = 2400 } = opts;
  const div = document.createElement('div');
  div.className = `float-text-toast size-${size === 'large' ? 'large' : 'normal'}`;
  div.style.color = color;
  div.style.animation = `${KEYFRAME} ${duration}ms ease-out forwards`;
  div.textContent = text;

  const host = document.getElementById('game-root') || document.body;
  host.appendChild(div);
  setTimeout(() => div.remove(), duration);
}

if (typeof window !== 'undefined') {
  // 不覆盖：若有人后挂了同名函数（罕见），保留先到者
  if (typeof window.showFloatText !== 'function') {
    window.showFloatText = showFloatText;
  }
}

export default showFloatText;
export { showFloatText };
