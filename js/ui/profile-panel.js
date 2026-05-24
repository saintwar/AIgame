/**
 * 个人主页面板（PHASE 16-5）
 * 职责：展示玩家昵称 / 当前称号 / 下一称号进度 / 历史最佳数据 / 称号墙
 * 入口：① 村庄 HUD 「👤 我的」按钮（点击）
 *       ② 键盘 V 键（开关）—— 注意 P 键已被 _resetGame 占用，本仗改用 V
 * 关闭：✕ 按钮 / ESC / 点击面板外
 *
 * 数据：每次 open 时 refreshContent 拉一次（与 leaderboard-panel 同范式）；
 *       钓鱼回调里的"称号升级"通过 window.showTitleUpgradeToast 主动通知。
 *
 * 依赖：
 *   - window.TitleSystem（必需，title-system.js 必须先加载）
 *   - window.PlayerProfile（昵称展示，可选）
 *   - window.Save（兜底直读 player.titleStats）
 *   - window.codex（兜底直读已解锁鱼种数）
 */
(function () {
  'use strict';

  let panelEl = null;
  let hudBtnEl = null;
  let isOpen = false;

  // ─────────────────────────────────────────────
  // 1. 创建面板 DOM
  // ─────────────────────────────────────────────
  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.className = 'profile-panel';
    panelEl.innerHTML = `
      <div class="profile-header">
        <div class="profile-name-row">
          <span class="profile-icon">👤</span>
          <span class="profile-nickname">钓手</span>
          <button class="profile-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="profile-title-row">
          <span class="label">当前称号</span>
          <span class="title-icon"></span>
          <span class="title-name"></span>
        </div>
      </div>

      <div class="profile-card title-progress-card">
        <h4>下一称号</h4>
        <div class="next-title-info"></div>
        <div class="progress-row fish-count-row">
          <span class="progress-label">累计鱼数</span>
          <div class="progress-bar"><div class="progress-fill fish-count-fill"></div></div>
          <span class="progress-text fish-count-text"></span>
        </div>
        <div class="progress-row species-row">
          <span class="progress-label">鱼种解锁</span>
          <div class="progress-bar"><div class="progress-fill species-fill"></div></div>
          <span class="progress-text species-text"></span>
        </div>
      </div>

      <div class="profile-card history-best-card">
        <h4>历史最佳</h4>
        <div class="best-row">
          <span class="best-label">▎ 单条最重</span>
          <span class="best-value best-fish-weight"></span>
        </div>
        <div class="best-row">
          <span class="best-label">▎ 累计鱼数</span>
          <span class="best-value total-fish-count"></span>
        </div>
        <div class="best-row">
          <span class="best-label">▎ 累计重量</span>
          <span class="best-value total-weight"></span>
        </div>
      </div>

      <div class="profile-card title-wall-card">
        <h4>全部称号</h4>
        <div class="title-wall"></div>
      </div>
    `;
    document.body.appendChild(panelEl);

    // 关闭按钮
    panelEl.querySelector('.profile-close').addEventListener('click', closePanel);

    // 点击面板外（即 panelEl 自身）关闭——但点 panel 内部不关
    panelEl.addEventListener('click', (e) => {
      if (e.target === panelEl) closePanel();
    });
  }

  // ─────────────────────────────────────────────
  // 2. 打开 / 关闭
  // ─────────────────────────────────────────────
  function openPanel() {
    if (!panelEl) createPanel();
    refreshContent();
    panelEl.classList.add('show');
    isOpen = true;
  }

  function closePanel() {
    if (!isOpen) return;
    if (panelEl) panelEl.classList.remove('show');
    isOpen = false;
  }

  function togglePanel() {
    if (isOpen) closePanel();
    else openPanel();
  }

  // ─────────────────────────────────────────────
  // 3. 刷新内容（每次 open 调用一次，坑 6：不在每帧调）
  // ─────────────────────────────────────────────
  function refreshContent() {
    if (!panelEl) return;
    const TitleSystem = window.TitleSystem;
    if (!TitleSystem) {
      console.warn('[ProfilePanel] TitleSystem 未就绪');
      return;
    }

    const ctx = TitleSystem.getStatsContext();
    const stats = ctx.titleStats;
    const currentTitle = TitleSystem.calculateTitle(ctx);
    const next = TitleSystem.getNextTitleProgress();

    // 昵称
    const nickname = (window.PlayerProfile && window.PlayerProfile.nickname) || '钓手';
    panelEl.querySelector('.profile-nickname').textContent = nickname;

    // 当前称号
    panelEl.querySelector('.title-icon').textContent = currentTitle.icon;
    const titleNameEl = panelEl.querySelector('.title-name');
    titleNameEl.textContent = currentTitle.name;
    titleNameEl.style.color = currentTitle.color;

    // 下一称号进度
    const fishRow = panelEl.querySelector('.fish-count-row');
    const speciesRow = panelEl.querySelector('.species-row');
    const nextInfo = panelEl.querySelector('.next-title-info');
    if (next.isMax) {
      nextInfo.innerHTML = '🌟 <strong>你已达成全部称号！</strong>';
      fishRow.style.display = 'none';
      speciesRow.style.display = 'none';
    } else {
      fishRow.style.display = '';
      speciesRow.style.display = '';
      nextInfo.innerHTML =
        `${next.next.icon} <strong style="color:${next.next.color}">${next.next.name}</strong>` +
        ` — ${next.next.desc}`;
      const fp = next.progress.fishCount;
      const sp = next.progress.speciesCount;
      const fpPct = fp.target > 0 ? Math.min(100, (fp.current / fp.target) * 100) : 100;
      const spPct = sp.target > 0 ? Math.min(100, (sp.current / sp.target) * 100) : 100;
      panelEl.querySelector('.fish-count-fill').style.width = fpPct + '%';
      panelEl.querySelector('.fish-count-text').textContent = `${fp.current} / ${fp.target}`;
      panelEl.querySelector('.species-fill').style.width = spPct + '%';
      panelEl.querySelector('.species-text').textContent = `${sp.current} / ${sp.target}`;
    }

    // 历史最佳
    const bestWeightEl = panelEl.querySelector('.best-fish-weight');
    if (stats.bestSingleFishWeight > 0) {
      const date = stats.bestSingleFishDate ? stats.bestSingleFishDate.slice(0, 10) : '';
      // weight 已是 kg；以"克"为更直观的单条展示（< 1kg 时用 g，>= 1kg 用 kg）
      const w = stats.bestSingleFishWeight;
      const wText = w >= 1 ? `${w.toFixed(2)} kg` : `${Math.round(w * 1000)} g`;
      bestWeightEl.textContent = `🐟 ${stats.bestSingleFishName} ${wText}` +
        (date ? ` (${date})` : '');
    } else {
      bestWeightEl.textContent = '— 还没有钓上鱼 —';
    }
    panelEl.querySelector('.total-fish-count').textContent = `📊 ${ctx.fishCount} 条`;
    panelEl.querySelector('.total-weight').textContent =
      `⚖️ ${(stats.totalCaughtWeight || 0).toFixed(2)} kg`;

    // 称号墙
    const wall = panelEl.querySelector('.title-wall');
    wall.innerHTML = '';
    TitleSystem.TITLES.forEach(t => {
      const unlocked = ctx.fishCount >= t.requireFishCount &&
                       ctx.speciesCount >= t.requireSpeciesCount;
      const item = document.createElement('div');
      item.className = 'title-wall-item ' + (unlocked ? 'unlocked' : 'locked');
      item.innerHTML =
        `<span class="wall-icon">${unlocked ? t.icon : '🔒'}</span>` +
        `<span class="wall-name">${t.name}</span>`;
      if (unlocked) item.style.color = t.color;
      item.title = t.desc + (unlocked ? '' :
        `（需累计 ${t.requireFishCount} 条、解锁 ${t.requireSpeciesCount} 种）`);
      wall.appendChild(item);
    });
  }

  // ─────────────────────────────────────────────
  // 4. 键盘控制：V 键开关 + ESC 关闭
  //    （坑 1：P 键已被 _resetGame 占用，本仗改用 V 键。
  //     全局搜确认 V 键当前未被任何 keydown 监听占用。）
  // ─────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();

    // ESC 关面板
    if (k === 'escape' && isOpen) {
      closePanel();
      return;
    }

    // V 键开关：仅在村庄场景生效；对话/钓鱼/其他面板可见时不响应
    if (k === 'v') {
      // 守卫 1：必须村庄场景
      if (!window.SceneManager || window.SceneManager.currentScene !== 'village') return;
      // 守卫 2：对话进行中不响应
      if (window.dialogueSystem && window.dialogueSystem.isActive &&
          window.dialogueSystem.isActive()) return;
      // 守卫 3：村庄内有其他全屏面板打开时不响应
      const vs = window.VillageScene;
      if (vs) {
        if (vs.inventoryUI && vs.inventoryUI.visible) return;
        if (vs.codexUI && vs.codexUI.visible) return;
        if (vs.shopUI && vs.shopUI.visible) return;
        if (vs.questPanelOpen) return;
      }
      // 守卫 4：在输入框中（如昵称弹窗）不响应
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      togglePanel();
      e.preventDefault();
    }
  });

  // ─────────────────────────────────────────────
  // 5. HUD「👤 我的」按钮 + 场景显隐联动（仿 leaderboard-panel）
  // ─────────────────────────────────────────────
  function ensureHudBtn() {
    if (hudBtnEl) return hudBtnEl;
    const btn = document.createElement('button');
    btn.id = 'hud-profile-btn';
    btn.className = 'hud-profile-btn hud-btn';  // .hud-btn 复用 main.css 的 hover/active 反馈
    btn.innerHTML = '👤 我的';
    btn.title = '个人主页 (V)';
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
      // 切场景时若面板还开着也一并关闭
      if (isOpen) closePanel();
    }
  }

  function bootstrapHud() {
    const villageDiv = document.getElementById('village-scene');
    if (!villageDiv) {
      setTimeout(bootstrapHud, 100);
      return;
    }
    syncHudVisibility();
    const observer = new MutationObserver(syncHudVisibility);
    observer.observe(villageDiv, { attributes: true, attributeFilter: ['style'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapHud);
  } else {
    bootstrapHud();
  }

  // ─────────────────────────────────────────────
  // 6. 称号升级气泡（全局函数，由 main.js 在 fish_caught 回调里调用）
  // ─────────────────────────────────────────────
  window.showTitleUpgradeToast = function (title) {
    if (!title) return;
    // 移除旧气泡（防止短时间内连续升级两级时堆叠）
    const old = document.querySelector('.title-upgrade-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = 'title-upgrade-toast';
    toast.innerHTML = `
      <div class="toast-prefix">🎉 获得新称号</div>
      <div class="toast-icon">${title.icon}</div>
      <div class="toast-title-name" style="color:${title.color}">${title.name}</div>
      <div class="toast-title-desc">${title.desc}</div>
    `;
    document.body.appendChild(toast);

    // 入场动画：下一帧加 .show
    requestAnimationFrame(() => toast.classList.add('show'));

    // 3 秒后淡出 + 600ms 后移除
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 600);
    }, 3000);
  };

  // 暴露 API
  window.ProfilePanel = {
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
    refresh: refreshContent,
  };

  console.log('[ProfilePanel] 已就绪');
})();
