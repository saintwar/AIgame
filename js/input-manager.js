/**
 * InputManager — 全局输入调度层（雏形）
 * PHASE 16-4.8 仗2
 * ─────────────────────────────────────────────
 * 用途：
 *   1. 为后续仗 3（UI 面板）/ 仗 4（对话/NPC）鼠标化提供统一注册接口
 *   2. 移动端预埋：mouse 事件未来可路由到 touch（本仗未启用）
 *   3. 不强制现有事件代码迁移，仅作为"新功能优先用"
 *
 * 关键约束：
 *   - 与 ClickToMove（村庄 Canvas 内点击寻路）零冲突：
 *     ClickToMove 监听 canvas.click，本模块在 document 层用事件委托，
 *     两者不互相阻断（除非业务代码主动调 stopPropagation）
 *   - 雏形阶段：API 已定型但暂无业务接入；console 输出"已就绪"日志即可。
 *
 * API：
 *   - InputManager.onClick(selector, callback, scope?)
 *   - InputManager.onHover(selector, callback, scope?)
 *   - InputManager.off(eventType, selector)
 *   - InputManager.isScopeActive(scope)
 *
 * scope 取值：
 *   - undefined / null → 始终激活
 *   - 'village' / 'fishing' / 'login' / 'title' → 仅在 SceneManager.currentScene
 *     等于该值时触发
 */
(function () {
  'use strict';

  const handlers = {
    click: [],   // [{ selector, callback, scope }]
    hover: [],   // [{ selector, callback, scope }]
  };

  /**
   * 注册全局点击处理器（事件委托模式）
   * @param {string} selector - CSS 选择器
   * @param {(e: MouseEvent) => void} callback
   * @param {string=} scope - 可选场景作用域
   */
  function onClick(selector, callback, scope) {
    handlers.click.push({ selector, callback, scope: scope || null });
  }

  /**
   * 注册全局 hover 处理器
   * @param {string} selector
   * @param {(e: MouseEvent, phase: 'enter' | 'leave') => void} callback
   * @param {string=} scope
   */
  function onHover(selector, callback, scope) {
    handlers.hover.push({ selector, callback, scope: scope || null });
  }

  /**
   * 移除处理器（按 selector 全量移除该 selector 的所有同类型处理器）
   * @param {'click' | 'hover'} eventType
   * @param {string} selector
   */
  function off(eventType, selector) {
    if (!handlers[eventType]) return;
    handlers[eventType] = handlers[eventType].filter(h => h.selector !== selector);
  }

  /**
   * 检查"作用域"是否激活（防止跨场景触发）
   * 实现方式：读 SceneManager.currentScene（与 click-to-move.js 同源）。
   * 这是项目里最权威的场景判断——VillageScene/FishingScene 是场景类
   * 实例的全局别名，但它们没有 isActive() 方法，且实例在 destroy 后
   * 仍可能挂在 window 上，所以不能用 instance 是否存在来判断。
   */
  function isScopeActive(scope) {
    if (!scope) return true;
    const sm = window.SceneManager;
    if (!sm) return false;
    return sm.currentScene === scope;
  }

  /**
   * 全局事件分发（事件委托）
   * 注意：matches/closest 在 IE 不可用——但本项目用的字体已要求现代浏览器
   * （woff2 + Chrome 36+），所以无需 polyfill。
   */
  function bindGlobal() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || !target.matches) return;
      for (const h of handlers.click) {
        if (!isScopeActive(h.scope)) continue;
        if (target.matches(h.selector) || (target.closest && target.closest(h.selector))) {
          h.callback(e);
        }
      }
    });

    // hover 用 mouseover/mouseout（事件冒泡，可委托）
    document.addEventListener('mouseover', (e) => {
      const target = e.target;
      if (!target || !target.matches) return;
      for (const h of handlers.hover) {
        if (!isScopeActive(h.scope)) continue;
        if (target.matches(h.selector)) {
          h.callback(e, 'enter');
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target;
      if (!target || !target.matches) return;
      for (const h of handlers.hover) {
        if (!isScopeActive(h.scope)) continue;
        if (target.matches(h.selector)) {
          h.callback(e, 'leave');
        }
      }
    });
  }

  // 暴露全局 API
  window.InputManager = {
    onClick,
    onHover,
    off,
    isScopeActive
  };

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGlobal);
  } else {
    bindGlobal();
  }

  console.log('[InputManager] 雏形已就绪');
})();
