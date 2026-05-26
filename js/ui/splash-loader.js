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
 * 12 秒兜底：无论上述钩子是否齐全，splash 12 秒后强制 hide，绝不卡死玩家。
 * （PHASE 16-9：从 5s 提到 12s——GitHub Pages 海外 CDN + 首次冷启动时
 *  43 个 ES module + CloudBase SDK 537KB 的下载 + 解析峰值能到 6~10s，
 *  5s 经常误触发兜底，导致 splash 提前消失而 main.js 还没 booted。）
 */
(function () {
  'use strict';

  let overlay = null;
  let bar = null;
  let percentEl = null;
  let tipEl = null;
  let currentProgress = 0;
  let hidden = false;
  // PHASE 18 仗5：进度满后展示"点击进入"提示，等用户点击才真正 hide。
  //   目的：登录 BGM (login.mp3) 必须在用户首次手势后才能播放（浏览器自动播放策略），
  //         如果 splash 自动 hide 直接进入旁白，旁白阶段无任何交互 → 整段静音。
  //   方案：splash 100% 后变成 ready 状态，文案 "点击进入游戏"，玩家点击 = 首次手势，
  //         AudioSystem 解锁 → 旁白第一帧 BGM 立即响。
  let readyForGesture = false;
  let onClickHide = null;
  // PHASE 18 仗6：whenGestured() Promise — 玩家点击/手势后才 resolve。
  //   main.js bootstrap 用 await SplashLoader.whenGestured() 把 switchToInstant('village')
  //   阻塞到玩家手势之后，从根源避免"未点击时旁白已开播"。
  //   - 玩家点击 splash → onClickHide → hide() → 同步 resolve gesturePromise
  //   - 不再有 12s 全局 FAILSAFE 自动 hide：玩家不点 splash 就一直停留在加载界面，
  //     绝不进入旁白，符合"无手势不开播"的产品需求。
  let _resolveGesture = null;
  const gesturePromise = new Promise(function (r) { _resolveGesture = r; });

  const TIPS = [
    { upTo: 30,  text: '正在准备钓具...' },
    { upTo: 60,  text: '连接水社村码头...' },
    { upTo: 85,  text: '唤醒沉睡的鱼群...' },
    { upTo: 100, text: '准备出航...' }
  ];

  // 全局兜底：硬上限，超时无论如何都强制 hide
  // PHASE 16-9：5000 → 12000。GitHub Pages 海外 CDN + 43 个 ES module + CloudBase
  //            SDK 537KB 的弱网首次访问，实测 6~10s 是正常区间；5s 会在 main.js
  //            booted 之前误触发，导致 splash 提前消失，玩家黑屏 1~2s。
  //            提到 12s 兜住极端情况；正常路径下方案 3（main.js 主动 hide）
  //            会比这个兜底先触发，所以这个值再大也不会拖慢正常流程。
  const FAILSAFE_MS = 12000;
  // 阶段 1 兜底：旧浏览器 document.fonts.ready 可能不存在，1.2s 后强推 30%
  const STAGE1_FALLBACK_MS = 1200;
  // 阶段 2 兜底：万一 CloudBase 事件丢失（罕见），4s 后强推 60%
  // PHASE 16-9：3000 → 4000，给海外 CDN 拉 SDK 多留 1s
  const STAGE2_FALLBACK_MS = 4000;
  // 阶段 3 兜底：PlayerProfile 也可能因 IIFE 异常缺失，8s 后强推 85%
  // PHASE 16-9：4000 → 8000，与 FAILSAFE_MS 12s 拉开档次
  const STAGE3_FALLBACK_MS = 8000;

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

  /**
   * 进度满后切换到"点击进入"待机态，等用户点击触发真正的 hide。
   * 设计动机：见顶部 readyForGesture 注释 —— 旁白 BGM 必须在玩家首次手势后才能响。
   *   - 若已 hidden 或已在 ready 态 → 幂等返回
   *   - 强制把进度推到 100%（防止某些路径未走 smoothTo 直接 hide）
   *   - 替换 tip 文案为"点击进入游戏"，加 cursor:pointer 视觉暗示
   *   - 全局监听 click/keydown/touchstart 任一即触发 hide（首次手势会一并解锁 AudioContext）
   * 兜底：FAILSAFE_MS（12s）后强制 hide，玩家不点也不会卡死。
   */
  function prepareReady() {
    if (hidden || readyForGesture) return;
    readyForGesture = true;
    setProgress(100);
    if (tipEl) {
      tipEl.textContent = '👆 点击任意位置进入游戏';
      tipEl.style.opacity = '1';
      tipEl.style.fontSize = '15px';
      tipEl.style.fontWeight = 'bold';
      tipEl.style.cursor = 'pointer';
      // 呼吸闪烁吸引注意
      tipEl.style.animation = 'splash-tip-pulse 1.2s ease-in-out infinite';
    }
    if (overlay) {
      overlay.style.cursor = 'pointer';
    }
    // 任意手势触发 hide。capture=true 抢在业务监听之前 — 但不要 stopPropagation，
    // 让该事件继续冒泡到 AudioSystem 的 _bindFirstGestureOnce 监听器，从而完成 ctx 创建。
    onClickHide = function () {
      // 移除监听后再 hide，避免 hide 内部 await 期间二次触发
      window.removeEventListener('pointerdown', onClickHide, true);
      window.removeEventListener('keydown', onClickHide, true);
      window.removeEventListener('touchstart', onClickHide, true);
      onClickHide = null;
      hide();
    };
    window.addEventListener('pointerdown', onClickHide, true);
    window.addEventListener('keydown', onClickHide, true);
    window.addEventListener('touchstart', onClickHide, true);
    console.log('[Splash] 已就绪，等待玩家点击进入');
  }

  async function hide() {
    if (hidden || !overlay) return;
    hidden = true;
    // 兜底清理：极端路径（错误兜底直接调 hide）下 onClickHide 监听可能还挂着
    if (onClickHide) {
      window.removeEventListener('pointerdown', onClickHide, true);
      window.removeEventListener('keydown', onClickHide, true);
      window.removeEventListener('touchstart', onClickHide, true);
      onClickHide = null;
    }
    // PHASE 18 仗6：立即 resolve gesturePromise，让 main.js 的 await 解锁，
    //   村庄场景启动（switchToInstant + 旁白）与 splash 淡出动画并行进行 ——
    //   玩家点击的瞬间就能听到旁白配乐 + 看到淡出过渡，体验最连贯。
    if (_resolveGesture) {
      _resolveGesture();
      _resolveGesture = null;
    }
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

  // 阶段 4：准备完毕（100%）
  // PHASE 18 仗6：原本依赖 SceneManager.current === 'village' 来判定"场景就绪"，
  //   但现在 main.js bootstrap 反过来 await SplashLoader.whenGestured() 才切场景，
  //   会形成"splash 等场景、场景等 splash"的死锁。改为：
  //   - 直接监听阶段 3（PlayerProfile 就绪）完成 → smoothTo(100) → prepareReady
  //   - 不再轮询 SceneManager；FAILSAFE 仅用于阶段 3 钩子失败的极端兜底
  function hookStage4Ready() {
    let done = false;
    const finish = function () {
      if (done) return; done = true;
      smoothTo(100, 500).then(prepareReady);
    };
    // 轮询：currentProgress 达到 85% 视为阶段 3 完成（hookStage3Profile.smoothTo(85)）
    const start = Date.now();
    const timer = setInterval(function () {
      if (done) { clearInterval(timer); return; }
      if (currentProgress >= 85) {
        clearInterval(timer);
        finish();
      } else if (Date.now() - start > FAILSAFE_MS) {
        // 兜底：阶段 3 钩子失败，强制推到 ready 态（仍等玩家点击）
        clearInterval(timer);
        console.warn('[Splash] ' + (FAILSAFE_MS / 1000) + 's 兜底触发，强制进入 ready 态（阶段 3 信号丢失）');
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
  hookStage4Ready();

  // PHASE 18 仗6：移除全局 12s 自动 hide 兜底。
  //   原 setTimeout(hide, FAILSAFE_MS) 会在 12s 后强制隐藏 splash → 触发 main.js
  //   进入村庄旁白，违反"无玩家手势不开播"的产品需求。
  //   现在的兜底改为：阶段钩子失败时仍能进入 prepareReady（见 hookStage4Ready 内部
  //   的 FAILSAFE_MS 兜底），但玩家不点击就一直停留在"点击进入"态，绝不自动跳过。

  /* ─────────────────── 公开 API（便于业务代码主动推进 / 调试） ─────────────────── */

  window.SplashLoader = {
    setProgress: setProgress,
    smoothTo: smoothTo,
    // PHASE 18 仗5：业务方（main.js）应优先调用 prepareReady（展示"点击进入"提示），
    //   而不是直接 hide。直接 hide 仅供错误兜底场景使用。
    prepareReady: prepareReady,
    hide: hide,
    isHidden: function () { return hidden; },
    isReady: function () { return readyForGesture; },
    // PHASE 18 仗6：业务方等待"玩家首次手势"信号的入口。main.js bootstrap 用：
    //   await window.SplashLoader.whenGestured();
    //   SceneManager.switchToInstant('village');
    // 玩家点击 splash 调 hide() 时同步 resolve 此 Promise，让村庄场景启动与 splash
    // 淡出动画并行进行；玩家不点击 → Promise 永不 resolve → 旁白永不开播。
    whenGestured: function () { return gesturePromise; },
    // 调试用
    _debug: function () {
      return { progress: currentProgress, hidden: hidden, ready: readyForGesture };
    }
  };
})();
