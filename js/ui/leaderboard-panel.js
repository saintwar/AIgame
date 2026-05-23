/**
 * 今日榜单 UI 面板
 * PHASE 16-4
 *
 * 视觉：吉卜力像素风，色板与 ui/nickname-dialog.js 完全对齐
 *   #3A2A1A 深棕底 / #C49A4A 金棕描边 / #FFD580 高亮金 /
 *   #F5E6D3 米白文字 / #5C3A1E 深棕分隔
 *
 * 入口：村庄 HUD 右上角"🏆 排行榜"按钮
 * 关闭：✕ 按钮 / 点遮罩 / Esc
 *
 * 数据：每次打开拉一次（不做 setInterval 自动刷新，留后期）
 *
 * 依赖：window.Leaderboard（leaderboard-system.js）
 *      window.CloudBase（cloudbase.js）—— 仅取 openid 高亮"我"
 *      window.SceneManager（main.js 暴露，可能晚于本文件就绪）
 */
(function () {
  'use strict';

  // ── 主题色（与 nickname-dialog 一致） ──
  const C_BG       = '#3A2A1A';
  const C_BORDER   = '#C49A4A';
  const C_HIGHLIGHT = '#FFD580';
  const C_TEXT     = '#F5E6D3';
  const C_DEEP     = '#5C3A1E';
  const C_DIM      = '#9A7B4F';

  let panelEl = null;
  let isOpen = false;
  let hudBtnEl = null;

  // ─────────────────────────────────────────
  // 1. 注入样式（自包含，避免污染 index.html）
  // ─────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('leaderboard-style')) return;
    const style = document.createElement('style');
    style.id = 'leaderboard-style';
    style.textContent = `
      .leaderboard-overlay {
        position: fixed; inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(2px);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
        opacity: 0; pointer-events: none;
        transition: opacity 0.25s ease;
        font-family: 'TencentSans', 'Noto Sans TC', 'PingFang TC', 'Microsoft YaHei', sans-serif;
      }
      .leaderboard-overlay.show { opacity: 1; pointer-events: auto; }

      .leaderboard-panel {
        background: ${C_BG};
        border: 3px solid ${C_BORDER};
        border-radius: 14px;
        width: min(440px, 92vw);
        max-height: 80vh;
        box-shadow: 0 8px 32px rgba(0,0,0,0.55), inset 0 0 0 1px ${C_DEEP};
        display: flex; flex-direction: column;
        overflow: hidden;
        color: ${C_TEXT};
      }

      .leaderboard-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px;
        background: ${C_DEEP};
        border-bottom: 2px solid ${C_BORDER};
      }
      .leaderboard-title {
        margin: 0; font-size: 22px;
        color: ${C_HIGHLIGHT};
        font-weight: 700;
        letter-spacing: 1px;
        text-shadow: 1px 1px 0 #000;
      }
      .leaderboard-close {
        background: transparent; border: none;
        font-size: 22px; color: ${C_BORDER};
        cursor: pointer; padding: 4px 10px; line-height: 1;
        transition: color 0.15s, transform 0.15s;
      }
      .leaderboard-close:hover { color: ${C_HIGHLIGHT}; transform: scale(1.15); }

      .leaderboard-body {
        padding: 12px 16px 18px;
        overflow-y: auto;
      }
      .leaderboard-list-header,
      .leaderboard-row {
        display: grid;
        grid-template-columns: 56px 1fr 80px 56px;
        gap: 8px; padding: 8px 6px;
        align-items: center;
      }
      .leaderboard-list-header {
        font-size: 13px; color: ${C_DIM}; font-weight: 600;
        border-bottom: 1px dashed ${C_BORDER};
        margin-bottom: 4px; letter-spacing: 1px;
      }
      .leaderboard-row {
        font-size: 15px; color: ${C_TEXT};
        border-radius: 6px;
        transition: background 0.15s;
      }
      .leaderboard-row:hover { background: rgba(196, 154, 74, 0.16); }
      .leaderboard-row.is-me {
        background: rgba(255, 213, 128, 0.22);
        font-weight: 600;
        color: ${C_HIGHLIGHT};
        box-shadow: inset 0 0 0 1px ${C_BORDER};
      }
      .col-rank { text-align: center; font-size: 16px; }
      .col-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .col-score, .col-fish {
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: ${C_HIGHLIGHT};
      }

      .leaderboard-empty,
      .leaderboard-mine-empty,
      .leaderboard-loading {
        text-align: center; padding: 28px 12px;
        color: ${C_DIM}; font-size: 14px;
      }
      .leaderboard-divider {
        text-align: center; margin: 14px 0 6px;
        font-size: 12px; color: ${C_DIM};
        letter-spacing: 2px;
      }
      .leaderboard-tip {
        margin-top: 14px;
        padding: 10px 12px;
        border: 1px dashed ${C_BORDER};
        font-size: 12.5px;
        line-height: 1.6;
        color: ${C_HIGHLIGHT};
        text-align: center;
        background: rgba(196, 154, 74, 0.12);
        border-radius: 8px;
        letter-spacing: 0.5px;
        text-shadow: 1px 1px 0 #000;
      }

      /* ─── HUD 排行榜按钮 ─── */
      .hud-leaderboard-btn {
        position: fixed;
        top: 12px; right: 12px;
        z-index: 100;
        background: linear-gradient(180deg, ${C_HIGHLIGHT} 0%, ${C_BORDER} 100%);
        border: 2px solid ${C_DEEP};
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 14px; font-weight: 700;
        color: ${C_BG};
        cursor: pointer;
        box-shadow: 0 3px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4);
        font-family: 'TencentSans', 'Noto Sans TC', 'PingFang TC', 'Microsoft YaHei', sans-serif;
        letter-spacing: 1px;
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .hud-leaderboard-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 5px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.5);
      }
      .hud-leaderboard-btn:active { transform: translateY(0); }
    `;
    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────
  // 2. 面板 DOM（懒加载）
  // ─────────────────────────────────────────
  function createPanel() {
    if (panelEl) return panelEl;
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'leaderboard-overlay';
    overlay.innerHTML = `
      <div class="leaderboard-panel">
        <div class="leaderboard-header">
          <h2 class="leaderboard-title">🏆 今日榜单</h2>
          <button class="leaderboard-close" aria-label="关闭">✕</button>
        </div>
        <div class="leaderboard-body">
          <div class="leaderboard-list-header">
            <span class="col-rank">排名</span>
            <span class="col-name">钓手</span>
            <span class="col-score">总分</span>
            <span class="col-fish">条数</span>
          </div>
          <div class="leaderboard-list" id="leaderboard-list">
            <div class="leaderboard-loading">加载中...</div>
          </div>
          <div class="leaderboard-mine" id="leaderboard-mine"></div>
          <div class="leaderboard-tip">☕ 每日 15:00 排名前两位，可找开发者兑换咖啡一杯。</div>
        </div>
      </div>
    `;

    // 点遮罩区关闭（点面板内部不冒泡）
    overlay.addEventListener('click', closePanel);
    overlay.querySelector('.leaderboard-panel')
      .addEventListener('click', (e) => e.stopPropagation());
    overlay.querySelector('.leaderboard-close')
      .addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });

    document.body.appendChild(overlay);
    panelEl = overlay;
    return overlay;
  }

  // ─────────────────────────────────────────
  // 3. 渲染
  // ─────────────────────────────────────────
  function renderList(list, myOpenid) {
    const listEl = document.getElementById('leaderboard-list');
    if (!list || list.length === 0) {
      listEl.innerHTML = '<div class="leaderboard-empty">还没人钓鱼，快去当第一名吧！</div>';
      return;
    }
    listEl.innerHTML = list.map((row, idx) => {
      const rank = idx + 1;
      const isMe = row._openid === myOpenid;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      return `
        <div class="leaderboard-row${isMe ? ' is-me' : ''}">
          <span class="col-rank">${medal}</span>
          <span class="col-name">${escapeHtml(row.nickname || '匿名')}</span>
          <span class="col-score">${row.score || 0}</span>
          <span class="col-fish">${row.fishCount || 0}</span>
        </div>
      `;
    }).join('');
  }

  function renderMine(myRecord, myRank, topListLength) {
    const mineEl = document.getElementById('leaderboard-mine');
    if (!myRecord) {
      mineEl.innerHTML = '<div class="leaderboard-mine-empty">你今天还没开张哦 🎣</div>';
      return;
    }
    if (myRank > 0 && myRank <= topListLength) {
      // 已在 Top 内，无需重复显示
      mineEl.innerHTML = '';
      return;
    }
    mineEl.innerHTML = `
      <div class="leaderboard-divider">— 我的位置 —</div>
      <div class="leaderboard-row is-me">
        <span class="col-rank">${myRank > 0 ? '#' + myRank : '—'}</span>
        <span class="col-name">${escapeHtml(myRecord.nickname || '我')}</span>
        <span class="col-score">${myRecord.score || 0}</span>
        <span class="col-fish">${myRecord.fishCount || 0}</span>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ─────────────────────────────────────────
  // 4. 打开 / 关闭
  // ─────────────────────────────────────────
  async function openPanel() {
    if (isOpen) return;
    isOpen = true;
    createPanel();
    // 双 RAF 确保 .show 与 createPanel 触发的回流分离，淡入动画才生效
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panelEl.classList.add('show');
    }));

    const myOpenid = window.CloudBase?.openid;

    try {
      if (!window.Leaderboard) {
        throw new Error('Leaderboard 系统未就绪');
      }
      const topRes = await window.Leaderboard.fetchTopToday(10);
      const list = topRes.success ? (topRes.list || []) : [];

      // 计算我的排名
      let myRank = -1;
      let myRecord = null;
      if (myOpenid) {
        const idx = list.findIndex(r => r._openid === myOpenid);
        if (idx >= 0) {
          myRank = idx + 1;
          myRecord = list[idx];
        } else {
          // 不在 Top 10，单独查
          const mineRes = await window.Leaderboard.fetchMyToday();
          if (mineRes.success && mineRes.record) {
            myRecord = mineRes.record;
            myRank = 0;  // 排名未知（本仗简化为不显示具体名次）
          }
        }
      }

      // 异步过程中可能已被关闭，避免覆盖空 DOM
      if (!isOpen) return;
      renderList(list, myOpenid);
      renderMine(myRecord, myRank, list.length);
    } catch (e) {
      console.error('[Leaderboard UI] 加载失败:', e);
      const listEl = document.getElementById('leaderboard-list');
      if (listEl) listEl.innerHTML = '<div class="leaderboard-empty">加载失败，请稍后重试</div>';
      const mineEl = document.getElementById('leaderboard-mine');
      if (mineEl) mineEl.innerHTML = '';
    }
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    if (panelEl) panelEl.classList.remove('show');
  }

  // ─────────────────────────────────────────
  // 5. ESC 关闭
  // ─────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closePanel();
  });

  // ─────────────────────────────────────────
  // 6. HUD 按钮 + 场景显隐联动
  //    村庄场景显示时按钮可见，其他场景隐藏。
  //    通过 MutationObserver 监听 #village-scene 的 style.display 变化，
  //    完全不依赖 SceneManager 内部实现，零侵入。
  // ─────────────────────────────────────────
  function ensureHudBtn() {
    if (hudBtnEl) return hudBtnEl;
    injectStyles();
    const btn = document.createElement('button');
    btn.id = 'hud-leaderboard-btn';
    btn.className = 'hud-leaderboard-btn';
    btn.innerHTML = '🏆 排行榜';
    btn.addEventListener('click', () => openPanel());
    document.body.appendChild(btn);
    hudBtnEl = btn;
    return btn;
  }

  function syncHudVisibility() {
    const villageDiv = document.getElementById('village-scene');
    if (!villageDiv) return;
    const visible = villageDiv.style.display !== 'none' && villageDiv.style.display !== '';
    if (visible) {
      ensureHudBtn().style.display = 'block';
    } else if (hudBtnEl) {
      hudBtnEl.style.display = 'none';
    }
  }

  function bootstrapHud() {
    const villageDiv = document.getElementById('village-scene');
    if (!villageDiv) {
      // village-scene div 还没创建（极早期），稍后重试
      setTimeout(bootstrapHud, 100);
      return;
    }
    syncHudVisibility();
    // 监听 style 属性变化（SceneManager.switchTo 改 display）
    const observer = new MutationObserver(syncHudVisibility);
    observer.observe(villageDiv, { attributes: true, attributeFilter: ['style'] });
  }

  // DOM ready 后启动 HUD 联动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapHud);
  } else {
    bootstrapHud();
  }

  window.LeaderboardPanel = {
    open: openPanel,
    close: closePanel,
  };

  console.log('[Leaderboard UI] 面板已就绪');
})();
