/**
 * 启动 Loading 条 — 玩家打开游戏到登录页之间的资源加载进度条
 * PHASE 16-8（吉卜力风暖橙渐变 + 4 段式进度文案）
 *
 * 设计原则（与既有架构对齐）：
 *   - 纯事件驱动，零侵入业务代码（main.js / cloudbase.js / profile-system.js 都不改）
 *     → 监听 cloudbase.js 已抛出的 'cloudbase:ready' / 'cloudbase:error' 事件
 *     → 轮询 window.PlayerProfile / window.SceneManager 已就绪信号
 *   - IIFE，挂 window.SplashLoader（与 PlayerProfile / Leaderboard / GMUI 等命名一致）
 *   - DOM 在脚本执行那一刻立即创建（CSS 在 <head> 已加载，不会有未样式化闪烁）
 *
 * 4 段式进度阶段：
 *   阶段 1 (0  → 30%)  "正在准备钓具..."   ← 字体加载（document.fonts.ready）
 *   阶段 2 (30 → 60%)  "连接水社村码头..." ← CloudBase SDK 就绪 / 失败（事件）
 *   阶段 3 (60 → 85%)  "唤醒沉睡的鱼群..." ← 玩家档案就绪（轮询 PlayerProfile）
 *   阶段 4 (85 → 100%) "准备出航..."       ← 场景就绪（轮询 SceneManager + 'village'）
 *
 * 5 秒兜底：无论上述钩子是否齐全，splash 5 秒后强制 hide，绝不卡死玩家。
 */
(function () {
  'use strict';

  let overlay = null;
  let bar = null;
  let percentEl = null;
  let tipEl = null;
  let currentProgress = 0;
  let hidden = false;

  const TIPS = [
    { upTo: 30,  text: '正在准备钓具...' },
    { upTo: 60,  text: '连接水社村码头...' },
    { upTo: 85,  text: '唤醒沉睡的鱼群...' },
    { upTo: 100, text: '准备出航...' }
  ];

  // 5 秒兜底：硬上限，超时无论如何都强制 hide（约束 4）
  const FAILSAFE_MS = 5000;
  // 阶段 1 兜底：旧浏览器 document.fonts.ready 可能不存在，1.2s 后强推 30%
  const STAGE1_FALLBACK_MS = 1200;
  // 阶段 2 兜底：万一 CloudBase 事件丢失（罕见），3s 后强推 60%
  const STAGE2_FALLBACK_MS = 3000;
  // 阶段 3 兜底：PlayerProfile 也可能因 IIFE 异常缺失，4s 后强推 85%
  const STAGE3_FALLBACK_MS = 4000;

  /* ─────────────────── DOM 创建 ─────────────────── */

  function createOverlay() {
    if (overlay) return; // 防止重复创建
    overlay = document.createElement('div');
    overlay.id = 'splash-loader';
    // innerHTML 直接写，DOM 量极小、无 XSS 风险（全部静态文案）
    overlay.innerHTML =
      '<div class="splash-content">' +
        '<div class="splash-logo">🎣 宝岛钓手</div>' +
        '<div class="splash-bar-wrap"><div class="splash-bar" id="splash-bar"></div></div>' +
        '<div class="splash-percent" id="splash-percent">0%</div>' +
        '<div class="splash-tip" id="splash-tip">正在准备钓具...</div>' +
      '</div>';

    // body 还没就绪时（极早期同步执行）走 documentElement，hide 时一并清理
    (document.body || document.documentElement).appendChild(overlay);

    bar = overlay.querySelector('#splash-bar');
    percentEl = overlay.querySelector('#splash-percent');
    tipEl = overlay.querySelector('#splash-tip');
  }

  /* ─────────────────── 进度控制 ─────────────────── */

  function setProgress(target) {
    if (hidden) return;
    if (target < currentProgress) return; // 进度只增不减
    currentProgress = Math.min(100, target);
    if (bar) bar.style.width = currentProgress + '%';
    if (percentEl) percentEl.textContent = Math.floor(currentProgress) + '%';
    // 文案：取第一个 upTo >= 当前进度 的阶段
    const tip = TIPS.find(function (t) { return currentProgress <= t.upTo; });
    if (tip && tipEl) tipEl.textContent = tip.text;
  }

  /**
   * 平滑推进到指定百分比（用 rAF 缓动，避免 width transition 在大跨度时显得"突兀")
   * @param {number} target 目标百分比
   * @param {number} duration 缓动时长（ms）
   * @returns {Promise<void>}
   */
  function smoothTo(target, duration) {
    duration = duration || 600;
    return new Promise(function (resolve) {
      if (hidden) { resolve(); return; }
      const start = currentProgress;
      const delta = Math.min(100, target) - start;
      if (delta <= 0) { resolve(); return; }
      const startTime = performance.now();
      function tick(now) {
        if (hidden) { resolve(); return; }
        const t = Math.min(1, (now - startTime) / duration);
        // easeOutCubic：开头快、收尾稳
        const eased = 1 - Math.pow(1 - t, 3);
        setProgress(start + delta * eased);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  /* ─────────────────── 隐藏 / 销毁 ─────────────────── */

  async function hide() {
    if (hidden || !overlay) return;
    hidden = true;
    // 直接补到 100（如果还没到）
    setProgress(100);
    // 停留 300ms 让玩家看清"100%"
    await new Promise(function (r) { setTimeout(r, 300); });
    overlay.style.transition = 'opacity 0.5s ease';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    // 等淡出动画结束
    await new Promise(function (r) { setTimeout(r, 520); });
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = bar = percentEl = tipEl = null;
    console.log('[Splash] 加载完成，已隐藏');
  }

  /* ─────────────────── 阶段钩子（事件驱动） ─────────────────── */

  // 阶段 1：字体加载（30%）
  function hookStage1Fonts() {
    let done = false;
    const finish = function () {
      if (done) return; done = true;
      smoothTo(30, 500);
    };
    // 优先 document.fonts.ready（Chrome 35+/Firefox 41+/Safari 10+）
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(finish, finish);
    }
    // 兜底：旧浏览器 / fonts API 异常
    setTimeout(finish, STAGE1_FALLBACK_MS);
  }

  // 阶段 2：CloudBase（60%） — 监听 cloudbase.js 既有事件
  function hookStage2CloudBase() {
    let done = false;
    const finish = function () {
      if (done) return; done = true;
      smoothTo(60, 600);
    };
    // 也许已经就绪了（极快网络）
    if (window.CloudBase && (window.CloudBase.ready || window.CloudBase.error)) {
      finish();
      return;
    }
    window.addEventListener('cloudbase:ready', finish, { once: true });
    window.addEventListener('cloudbase:error', finish, { once: true });
    // 兜底：事件丢失或 SDK 加载失败
    setTimeout(finish, STAGE2_FALLBACK_MS);
  }

  // 阶段 3：PlayerProfile（85%） — 轮询档案是否加载完毕
  function hookStage3Profile() {
    let done = false;
    const finish = function () {
      if (done) return; done = true;
      smoothTo(85, 600);
    };
    // 轮询：PlayerProfile.load() 内部会读 localStorage 立刻拿到 nickname/createdAt
    // 同时 main.js 的 bootstrap async IIFE 会 await PlayerProfile.load()
    // 我们这里只关心"load 流程已经走完"——表现为 nickname/createdAt 已被设置，
    // 或 cloudSynced 字段被触碰过。
    const start = Date.now();
    const timer = setInterval(function () {
      if (done) { clearInterval(timer); return; }
      const p = window.PlayerProfile;
      // 任何一个字段非默认值 → 视为 load 已执行（即使没昵称）
      if (p && (p.nickname !== null || p.openid !== null || p.createdAt !== null || p.cloudSynced)) {
        clearInterval(timer);
        finish();
      } else if (Date.now() - start > STAGE3_FALLBACK_MS) {
        clearInterval(timer);
        finish();
      }
    }, 100);
  }

  // 阶段 4：场景就绪（100%） — 等 SceneManager 切到 village
  function hookStage4Scene() {
    let done = false;
    const finish = function () {
      if (done) return; done = true;
      // 推到 100% 并触发 hide
      smoothTo(100, 500).then(hide);
    };
    // 轮询 SceneManager 当前场景。村庄一旦激活就视为完全就绪。
    // 注：main.js 末尾 `SceneManager.switchToInstant('village')`，
    //     此时 SceneManager.current（或类似字段）会变成 'village'。
    //     我们做最宽松判断：SceneManager 存在 + 任意 current/active 字段被设置。
    const start = Date.now();
    const timer = setInterval(function () {
      if (done) { clearInterval(timer); return; }
      const sm = window.SceneManager;
      const isReady = sm && (
        sm.current === 'village' ||
        sm.currentScene === 'village' ||
        (sm.current && typeof sm.current === 'object') ||
        (typeof sm.getCurrent === 'function' && sm.getCurrent())
      );
      if (isReady) {
        clearInterval(timer);
        finish();
      } else if (Date.now() - start > FAILSAFE_MS) {
        // 5 秒兜底：约束 4 — 无论如何强制 hide
        clearInterval(timer);
        console.warn('[Splash] 5s 兜底触发，强制隐藏（场景未就绪信号丢失）');
        finish();
      }
    }, 100);
  }

  /* ─────────────────── 启动 ─────────────────── */

  // 立刻显示（DOM 还没 ready 也没关系，我们直接挂 documentElement）
  createOverlay();

  // 启动 4 阶段钩子。每个阶段都是独立的 Promise / 轮询，
  // 互不阻塞——某阶段卡住，下一阶段的进度不会被回退（setProgress 是单调的）。
  hookStage1Fonts();
  hookStage2CloudBase();
  hookStage3Profile();
  hookStage4Scene();

  // 全局兜底：哪怕所有钩子都失败，5 秒后也强制结束
  setTimeout(function () {
    if (!hidden) {
      console.warn('[Splash] 全局 5s 兜底：强制隐藏 splash');
      hide();
    }
  }, FAILSAFE_MS);

  /* ─────────────────── 公开 API（便于业务代码主动推进 / 调试） ─────────────────── */

  window.SplashLoader = {
    setProgress: setProgress,
    smoothTo: smoothTo,
    hide: hide,
    isHidden: function () { return hidden; },
    // 调试用
    _debug: function () {
      return { progress: currentProgress, hidden: hidden };
    }
  };
})();
