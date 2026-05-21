/**
 * CloudBase 云开发模块
 * 负责：SDK 初始化 + 匿名登录 + 全局 app/auth/db 实例
 * PHASE 16-1
 *
 * 设计原则：
 *   - IIFE，不污染 ES Module 作用域（main.js 是 module，本文件先于它加载）
 *   - 失败必降级：任何错误都不抛到主线程，游戏照常运行
 *   - openid 只放内存（window.CloudBase.openid），不写 SaveSystem
 *   - 状态可通过 debug HUD（按 ` 键）查看
 *
 * SDK 选型说明：
 *   index.html 加载的是 @cloudbase/js-sdk@1.6.0 的 UMD 全量包，
 *   暴露的全局变量名为 `cloudbase`（不是早期 tcb-js-sdk 的 `tcb`）。
 *   API：cloudbase.init({ env }) / app.auth({ persistence }) /
 *        auth.anonymousAuthProvider().signIn() / auth.currentUser.uid
 */
(function() {
  'use strict';

  // 环境配置
  const ENV_ID = 'saintwar-ai-d5g58v9z1a8b3afe9';

  // 全局状态
  window.CloudBase = {
    app: null,           // SDK app 实例
    auth: null,          // 鉴权实例
    db: null,            // 数据库实例
    openid: null,        // 当前玩家 openid（即 currentUser.uid）
    ready: false,        // 是否已就绪
    error: null,         // 错误信息
  };

  /**
   * 初始化 CloudBase
   * @returns {Promise<boolean>} 是否成功
   */
  async function initCloudBase() {
    try {
      // 1. 检查 SDK 是否加载（兼容 tcb / cloudbase 两种全局名）
      const sdk = (typeof cloudbase !== 'undefined') ? cloudbase
                : (typeof tcb !== 'undefined') ? tcb
                : null;
      if (!sdk) {
        throw new Error('CloudBase SDK 未加载，请检查 index.html 的 script 标签');
      }

      // 2. 初始化 app
      console.log('[CloudBase] 初始化中...envId:', ENV_ID);
      const app = sdk.init({ env: ENV_ID });
      window.CloudBase.app = app;

      // 3. 获取鉴权实例（持久化到 localStorage，刷新页面复用登录态）
      const auth = app.auth({ persistence: 'local' });
      window.CloudBase.auth = auth;

      // 4. 检查登录状态
      let loginState = await auth.getLoginState();

      if (!loginState) {
        // 首次进入，匿名登录
        console.log('[CloudBase] 首次登录，启动匿名登录...');
        await auth.anonymousAuthProvider().signIn();
        loginState = await auth.getLoginState();
      } else {
        console.log('[CloudBase] 复用已有登录态');
      }

      // 5. 拿到 openid（SDK 对象含循环引用，禁用 stringify / 整对象 log）
      //    SDK 2.6.5 / @cloudbase/js-sdk 1.x 中 openid 字段位置不固定，
      //    用 5 条兜底链按优先级取，全部失败才视为致命错误
      let openid = null;

      // 路径1：currentUser.uid（@cloudbase/js-sdk 1.x 标准）
      if (auth.currentUser && auth.currentUser.uid) {
        openid = auth.currentUser.uid;
      }
      // 路径2：currentUser.openid（旧版本字段）
      else if (auth.currentUser && auth.currentUser.openid) {
        openid = auth.currentUser.openid;
      }
      // 路径3：loginState.user.uid
      else if (loginState && loginState.user && loginState.user.uid) {
        openid = loginState.user.uid;
      }
      // 路径4：loginState.user._user.openid（深层嵌套）
      else if (loginState && loginState.user && loginState.user._user && loginState.user._user.openid) {
        openid = loginState.user._user.openid;
      }
      // 路径5：refreshToken 截取（最坏兜底，避免无 openid 阻塞游戏）
      else if (loginState && loginState.credential && loginState.credential.refreshToken) {
        openid = 'anon_' + loginState.credential.refreshToken.slice(0, 16);
      }

      if (!openid) {
        // 所有路径失败：输出诊断信息（仅基本类型 + Object.keys，禁 stringify）
        console.warn('[CloudBase] 拿 openid 失败，诊断信息：');
        console.warn('  hasCurrentUser:', !!auth.currentUser);
        console.warn('  currentUser keys:', auth.currentUser ? Object.keys(auth.currentUser) : 'null');
        console.warn('  hasLoginState:', !!loginState);
        console.warn('  loginType:', loginState && loginState._loginType);
        console.warn('  hasUser:', loginState && !!loginState.user);
        console.warn('  userKeys:', loginState && loginState.user ? Object.keys(loginState.user) : 'null');
        throw new Error('无法从 SDK 获取 openid，请查看上方诊断信息');
      }

      window.CloudBase.openid = openid;
      console.log('[CloudBase] ✅ 拿到 openid:', openid);

      // 6. 初始化数据库
      window.CloudBase.db = app.database();

      // 7. 标记就绪
      window.CloudBase.ready = true;

      console.log('[CloudBase] ✅ 就绪');
      console.log('[CloudBase] loginType:', loginState && (loginState._loginType || loginState.loginType));
      console.log('[CloudBase] hasUser:', !!(loginState && loginState.user));

      // 触发就绪事件（前端可监听后启用排行榜上传/拉取）
      window.dispatchEvent(new CustomEvent('cloudbase:ready', {
        detail: { openid }
      }));

      // PHASE 16-1 验收补丁：弹窗显示状态（验收通过后请删除本段）
      setTimeout(() => {
        const status =
          '🎯 CloudBase 验收报告 🎯\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '状态: ' + (window.CloudBase.ready ? '✅ 就绪' : '❌ 失败') + '\n' +
          'openid: ' + (window.CloudBase.openid
            ? window.CloudBase.openid.slice(0, 16) + '...'
            : '❌ NULL') + '\n' +
          '错误: ' + (window.CloudBase.error || '✅ 无') + '\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '请截图发给主程验收';
        alert(status);
      }, 1500);

      return true;

    } catch (err) {
      // 仅打印 err.message + stack，不打 err 本身（SDK 错误对象也可能含循环引用）
      console.error('[CloudBase] ❌ 初始化失败:', err && err.message ? err.message : String(err));
      if (err && err.stack) console.error(err.stack);
      window.CloudBase.error = (err && err.message) || String(err);
      window.CloudBase.ready = false;

      // 触发失败事件（前端可降级到本地榜）
      window.dispatchEvent(new CustomEvent('cloudbase:error', {
        detail: { message: window.CloudBase.error }
      }));

      // PHASE 16-1 验收补丁：失败也要弹窗（验收通过后请删除本段）
      setTimeout(() => {
        alert(
          '❌ CloudBase 初始化失败 ❌\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '错误: ' + ((err && err.message) || String(err)) + '\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '请截图发给主程诊断'
        );
      }, 1500);

      return false;
    }
  }

  // 在 DOMContentLoaded 之后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloudBase);
  } else {
    initCloudBase();
  }

  // 暴露到全局供调试与手动重连
  window.CloudBase.init = initCloudBase;

})();
