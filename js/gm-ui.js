/**
 * GM 管理面板 UI
 * 功能：
 *   - 默认隐藏，通过快捷键 Ctrl+G 唤醒
 *   - 环境校验：仅在开发/测试模式启用
 *   - 模块化命令分类、参数输入、执行按钮、日志反馈
 */

import GM from './gm-commands.js';
import Save from './save-system.js';
import { QUESTS } from './data/quests.js';

// ============================================================
// 环境校验
// ============================================================
/**
 * 判断当前是否为开发/测试环境
 * 规则：URL 包含 localhost / 127.0.0.1 / dev. / test.
 *       或者 localStorage 强制开启 dev mode
 */
function isDevEnv() {
  try {
    const loc = location.hostname || '';
    const devPatterns = ['localhost', '127.0.0.1', 'dev.', 'test.', 'local'];
    const isLocal = devPatterns.some(p => loc.includes(p));
    const forceDev = localStorage.getItem('__gm_dev_mode__') === '1';
    return isLocal || forceDev;
  } catch {
    return false;
  }
}

const DEV_MODE = isDevEnv();

// ============================================================
// 样式
// ============================================================
const STYLES = `
  @keyframes gmFadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes gmFadeOut {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-8px); }
  }

  #gm-panel {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 480px;
    max-height: 85vh;
    background: #1a1a2e;
    border: 1px solid #0f3460;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    font-family: 'Courier New', Consolas, monospace;
    font-size: 13px;
    color: #e0e0e0;
    z-index: 99999;
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  #gm-panel.gm-open {
    display: flex;
    animation: gmFadeIn 0.2s ease forwards;
  }
  #gm-panel.gm-closing {
    animation: gmFadeOut 0.15s ease forwards;
  }

  /* ── 标题栏 ── */
  #gm-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    border-radius: 12px 12px 0 0;
    user-select: none;
    cursor: move;
  }
  #gm-titlebar .gm-title {
    font-size: 14px;
    font-weight: bold;
    color: #e94560;
    letter-spacing: 1px;
  }
  #gm-titlebar .gm-subtitle {
    font-size: 11px;
    color: #555;
    margin-left: 8px;
  }
  #gm-close-btn {
    width: 22px; height: 22px;
    border: none; background: #e94560;
    color: #fff; border-radius: 4px;
    cursor: pointer; font-size: 14px;
    line-height: 1;
    transition: background 0.15s;
  }
  #gm-close-btn:hover { background: #ff2d55; }

  /* ── 标签栏 ── */
  #gm-tabs {
    display: flex;
    background: #0f3460;
    padding: 6px 8px 0;
    gap: 4px;
  }
  .gm-tab {
    padding: 5px 12px;
    border: none; background: transparent;
    color: #888; border-radius: 6px 6px 0 0;
    cursor: pointer; font-size: 12px;
    transition: background 0.15s, color 0.15s;
  }
  .gm-tab:hover { background: #1a3a6a; color: #ccc; }
  .gm-tab.active { background: #1a1a2e; color: #fff; font-weight: bold; }

  /* ── 内容区 ── */
  #gm-content {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  #gm-content::-webkit-scrollbar { width: 4px; }
  #gm-content::-webkit-scrollbar-track { background: transparent; }
  #gm-content::-webkit-scrollbar-thumb { background: #0f3460; border-radius: 2px; }

  /* ── 命令卡片 ── */
  .gm-cmd-card {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .gm-cmd-header {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 6px;
  }
  .gm-cmd-name {
    font-size: 13px; font-weight: bold;
    color: #e94560;
  }
  .gm-cmd-desc {
    font-size: 11px; color: #888; margin-left: auto;
  }
  .gm-usage {
    font-size: 11px; color: #555; margin-bottom: 8px;
  }

  /* ── 参数行 ── */
  .gm-param-row {
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 6px;
  }
  .gm-param-row label {
    font-size: 11px; color: #888;
    min-width: 55px;
  }
  .gm-param-row input {
    flex: 1; padding: 4px 8px;
    background: #0d1b2a; border: 1px solid #0f3460;
    border-radius: 4px; color: #e0e0e0; font-size: 12px;
    outline: none;
  }
  .gm-param-row input:focus { border-color: #e94560; }

  /* ── 执行按钮 ── */
  .gm-exec-btn {
    width: 100%; padding: 6px;
    background: #e94560; border: none;
    border-radius: 6px; color: #fff;
    font-size: 12px; font-weight: bold;
    cursor: pointer; transition: background 0.15s;
  }
  .gm-exec-btn:hover { background: #ff2d55; }
  .gm-exec-btn:active { background: #c0392b; }

  /* ── 日志区 ── */
  #gm-log-wrap {
    border-top: 1px solid #0f3460;
    padding: 8px 12px;
    background: #0d1b2a;
  }
  #gm-log-header {
    display: flex; justify-content: space-between;
    margin-bottom: 6px;
  }
  #gm-log-header span {
    font-size: 11px; color: #555;
  }
  #gm-log-header button {
    background: none; border: none; color: #555;
    cursor: pointer; font-size: 11px;
  }
  #gm-log-header button:hover { color: #888; }
  #gm-log {
    max-height: 120px; overflow-y: auto;
    font-size: 11px; line-height: 1.6;
  }
  #gm-log::-webkit-scrollbar { width: 3px; }
  #gm-log::-webkit-scrollbar-thumb { background: #0f3460; }
  .gm-log-entry { margin-bottom: 2px; }
  .gm-log-entry.gm-log-success { color: #4CAF50; }
  .gm-log-entry.gm-log-error   { color: #f44336; }
  .gm-log-entry.gm-log-info    { color: #2196F3; }
  .gm-log-entry.gm-log-warn    { color: #ff9800; }
  .gm-log-entry .gm-log-time { color: #444; margin-right: 6px; }

  /* ── 响应式小屏 ── */
  @media (max-width: 520px) {
    #gm-panel { width: calc(100vw - 40px); right: 20px; }
  }
`;

// ============================================================
// GMUI 主类
// ============================================================
class GMUI {
  constructor() {
    /** @type {boolean} */
    this._open = false;
    /** @type {HTMLElement} */
    this._panel = null;
    /** @type {HTMLElement} */
    this._logEl = null;
    /** @type {string} 当前标签页 */
    this._activeTab = 'quest';
    /** @type {Map<string, Function>} 命令卡片渲染函数 */
    this._cardRenderers = new Map();
    /** @type {Array} 日志队列 */
    this._logQueue = [];
    /** @type {number} */
    this._logId = 0;

    if (DEV_MODE) {
      this._init();
    }
  }

  // ── 初始化 ──────────────────────────────────────────────
  _init() {
    this._injectStyles();
    this._buildPanel();
    this._registerHotkey();
    this._buildCardRenderers();
  }

  _injectStyles() {
    if (document.getElementById('gm-ui-styles')) return;
    const el = document.createElement('style');
    el.id = 'gm-ui-styles';
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  _buildPanel() {
    // 主容器
    const panel = document.createElement('div');
    panel.id = 'gm-panel';

    // 标题栏
    const titlebar = document.createElement('div');
    titlebar.id = 'gm-titlebar';
    titlebar.innerHTML = `
      <div>
        <span class="gm-title">🛠️ GM PANEL</span>
        <span class="gm-subtitle">DEV ONLY</span>
      </div>
      <button id="gm-close-btn" title="关闭 (Ctrl+G)">✕</button>
    `;
    panel.appendChild(titlebar);

    // 标签栏
    const tabs = document.createElement('div');
    tabs.id = 'gm-tabs';
    const tabDefs = [
      { id: 'quest',  label: '📋 任务' },
      { id: 'item',   label: '🎒 物品' },
      { id: 'player', label: '👤 玩家' },
      { id: 'fish',   label: '🐟 鱼类' },
      { id: 'scene',  label: '🗺️ 场景' },
      { id: 'system', label: '⚙️  系统' },
    ];
    tabDefs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'gm-tab' + (t.id === this._activeTab ? ' active' : '');
      btn.dataset.tab = t.id;
      btn.textContent = t.label;
      btn.addEventListener('click', () => this._switchTab(t.id));
      tabs.appendChild(btn);
    });
    panel.appendChild(tabs);

    // 内容区
    const content = document.createElement('div');
    content.id = 'gm-content';
    panel.appendChild(content);

    // 日志区
    const logWrap = document.createElement('div');
    logWrap.id = 'gm-log-wrap';
    logWrap.innerHTML = `
      <div id="gm-log-header">
        <span>📜 执行日志</span>
        <button id="gm-log-clear">清空</button>
      </div>
      <div id="gm-log"></div>
    `;
    panel.appendChild(logWrap);

    document.body.appendChild(panel);
    this._panel = panel;
    this._logEl = document.getElementById('gm-log');

    // 关闭按钮
    document.getElementById('gm-close-btn')
      .addEventListener('click', () => this.hide());

    // 清空日志
    document.getElementById('gm-log-clear')
      .addEventListener('click', () => this._clearLog());

    // 拖拽标题栏移动
    this._makeDraggable(titlebar, panel);

    // 初始渲染
    this._renderTab(this._activeTab);
  }

  _makeDraggable(handle, target) {
    let ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      ox = e.clientX - target.offsetLeft;
      oy = e.clientY - target.offsetTop;
      handle.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      target.style.left = (e.clientX - ox) + 'px';
      target.style.top  = (e.clientY - oy) + 'px';
      target.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      handle.style.cursor = 'move';
    });
  }

  // ── 快捷键注册 ──────────────────────────────────────────
  _registerHotkey() {
    window.addEventListener('keydown', e => {
      // Ctrl+G
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  // ── 标签切换 ────────────────────────────────────────────
  _switchTab(tabId) {
    this._activeTab = tabId;
    document.querySelectorAll('.gm-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    this._renderTab(tabId);
  }

  _renderTab(tabId) {
    const content = document.getElementById('gm-content');
    content.innerHTML = '';
    const renderer = this._cardRenderers.get(tabId);
    if (renderer) renderer(content);
  }

  // ── 面板显示/隐藏 ───────────────────────────────────────
  toggle() {
    this._open ? this.hide() : this.show();
  }

  show() {
    if (!DEV_MODE) {
      console.warn('[GM] 正式环境禁止打开 GM 面板');
      return;
    }
    this._panel.classList.remove('gm-closing');
    this._panel.classList.add('gm-open');
    this._open = true;
    this._refreshActiveTab();
  }

  hide() {
    this._panel.classList.add('gm-closing');
    this._panel.classList.remove('gm-open');
    setTimeout(() => {
      this._panel.classList.remove('gm-closing');
    }, 150);
    this._open = false;
  }

  _refreshActiveTab() {
    this._renderTab(this._activeTab);
  }

  // ── 日志 ────────────────────────────────────────────────
  _appendLog(type, message) {
    const id = ++this._logId;
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this._logQueue.push({ id, type, message, time });
    if (this._logQueue.length > 50) this._logQueue.shift();

    if (!this._logEl) return;
    const entry = document.createElement('div');
    entry.className = `gm-log-entry gm-log-${type}`;
    entry.dataset.id = id;
    entry.innerHTML = `<span class="gm-log-time">[${time}]</span>${message}`;
    this._logEl.appendChild(entry);
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }

  _clearLog() {
    this._logQueue = [];
    if (this._logEl) this._logEl.innerHTML = '';
  }

  _log(type, message) {
    this._appendLog(type, message);
    // 同时打印到控制台
    const colorMap = {
      success: '#4CAF50', error: '#f44336', info: '#2196F3', warn: '#ff9800'
    };
    console.log(`%c[GM] ${message}`, `color:${colorMap[type] || ''}`);
  }

  // ── 命令执行包装 ─────────────────────────────────────────
  _exec(cmdStr) {
    const result = GM.run(cmdStr);
    const typeMap = { success: 'success', error: 'error', info: 'info', warn: 'warn' };
    const type = typeMap[result?.type] || 'info';
    this._log(type, result?.message || cmdStr);
    this._refreshActiveTab();
    return result;
  }

  // ── 卡片渲染器工厂 ───────────────────────────────────────
  _buildCardRenderers() {
    // 通用：创建单个命令卡片
    const makeCard = (container, cmd, fields, execFn) => {
      const card = document.createElement('div');
      card.className = 'gm-cmd-card';

      let fieldsHtml = '';
      fields.forEach(f => {
        fieldsHtml += `
          <div class="gm-param-row">
            <label for="gm-${cmd.name.replace(/\s+/g, '-')}-${f.name}">${f.label}</label>
            <input
              id="gm-${cmd.name.replace(/\s+/g, '-')}-${f.name}"
              type="text"
              placeholder="${f.placeholder || f.name}"
              data-param="${f.name}"
              ${f.default !== undefined ? `value="${f.default}"` : ''}
            />
          </div>
        `;
      });

      card.innerHTML = `
        <div class="gm-cmd-header">
          <span class="gm-cmd-name">${cmd.name}</span>
          <span class="gm-cmd-desc">${cmd.description}</span>
        </div>
        <div class="gm-usage">用法: ${cmd.usage}</div>
        ${fieldsHtml}
        <button class="gm-exec-btn">▶ 执行</button>
      `;

      const execBtn = card.querySelector('.gm-exec-btn');
      execBtn.addEventListener('click', () => {
        const args = fields.map(f => {
          const input = card.querySelector(`[data-param="${f.name}"]`);
          return input ? input.value.trim() : '';
        }).filter(v => v !== '');
        execFn(args);
      });

      container.appendChild(card);
    };

    // ── 任务标签页 ─────────────────────────────────────────
    this._cardRenderers.set('quest', (container) => {
      // 任务列表总览
      const listCard = document.createElement('div');
      listCard.className = 'gm-cmd-card';
      listCard.innerHTML = `
        <div class="gm-cmd-header">
          <span class="gm-cmd-name">📋 任务状态总览</span>
        </div>
      `;
      const listWrap = document.createElement('div');
      listWrap.id = 'gm-quest-list';
      listCard.appendChild(listWrap);
      container.appendChild(listCard);

      const rows = (GM.listCommands().filter(c => c.category === 'quest'));
      const cmdDefs = [
        {
          cmd: { name: 'quest complete', description: '强制完成任务', usage: 'quest complete <questId>' },
          fields: [{ name: 'questId', label: '任务ID', placeholder: 'q001_first_fish' }],
          exec: args => this._exec(`quest complete ${args[0]}`)
        },
        {
          cmd: { name: 'quest reset', description: '重置任务状态', usage: 'quest reset <questId>' },
          fields: [{ name: 'questId', label: '任务ID', placeholder: 'q001_first_fish' }],
          exec: args => this._exec(`quest reset ${args[0]}`)
        },
        {
          cmd: { name: 'quest activate', description: '强制激活任务（跳过前置）', usage: 'quest activate <questId>' },
          fields: [{ name: 'questId', label: '任务ID', placeholder: 'q001_first_fish' }],
          exec: args => this._exec(`quest activate ${args[0]}`)
        },
        {
          cmd: { name: 'quest setprogress', description: '直接修改任务进度', usage: 'quest setprogress <questId> <count>' },
          fields: [
            { name: 'questId', label: '任务ID', placeholder: 'q001_first_fish' },
            { name: 'count', label: '进度值', placeholder: '3', default: '3' }
          ],
          exec: args => this._exec(`quest setprogress ${args[0]} ${args[1]}`)
        },
        {
          cmd: { name: 'quest list', description: '列出所有任务状态', usage: 'quest list' },
          fields: [],
          exec: () => this._exec('quest list')
        }
      ];

      cmdDefs.forEach(def => makeCard(container, def.cmd, def.fields, def.exec));

      // 实时渲染任务列表
      this._renderQuestList(listWrap);
    });

    // ── 物品标签页 ─────────────────────────────────────────
    this._cardRenderers.set('item', (container) => {
      const cmdDefs = [
        {
          cmd: { name: 'item add', description: '向背包添加物品', usage: 'item add <itemId> [count=1]' },
          fields: [
            { name: 'itemId', label: '物品ID', placeholder: 'basic_bait' },
            { name: 'count', label: '数量', placeholder: '1', default: '1' }
          ],
          exec: args => this._exec(`item add ${args[0]} ${args[1] || 1}`)
        },
        {
          cmd: { name: 'item remove', description: '从背包删除物品', usage: 'item remove <itemId> [count=1]' },
          fields: [
            { name: 'itemId', label: '物品ID', placeholder: 'basic_bait' },
            { name: 'count', label: '数量', placeholder: '1', default: '1' }
          ],
          exec: args => this._exec(`item remove ${args[0]} ${args[1] || 1}`)
        },
        {
          cmd: { name: 'item clear', description: '清空整个背包', usage: 'item clear' },
          fields: [],
          exec: () => this._exec('item clear')
        },
        {
          cmd: { name: 'item list', description: '列出背包所有物品', usage: 'item list' },
          fields: [],
          exec: () => this._exec('item list')
        },
        {
          cmd: { name: 'item unlock', description: '强制解锁获取条件', usage: 'item unlock <flagKey>' },
          fields: [{ name: 'flagKey', label: '标志键', placeholder: 'advanced_bait_unlocked' }],
          exec: args => this._exec(`item unlock ${args[0]}`)
        }
      ];
      cmdDefs.forEach(def => makeCard(container, def.cmd, def.fields, def.exec));
    });

    // ── 玩家标签页 ─────────────────────────────────────────
    this._cardRenderers.set('player', (container) => {
      const cmdDefs = [
        {
          cmd: { name: 'player money', description: '设置玩家金币', usage: 'player money <amount>' },
          fields: [{ name: 'amount', label: '金币', placeholder: '9999', default: '9999' }],
          exec: args => this._exec(`player money ${args[0]}`)
        },
        {
          cmd: { name: 'player bait', description: '设置鱼饵数量', usage: 'player bait <count>' },
          fields: [{ name: 'count', label: '鱼饵', placeholder: '99', default: '99' }],
          exec: args => this._exec(`player bait ${args[0]}`)
        },
        {
          cmd: { name: 'player status', description: '显示玩家状态', usage: 'player status' },
          fields: [],
          exec: () => this._exec('player status')
        }
      ];
      cmdDefs.forEach(def => makeCard(container, def.cmd, def.fields, def.exec));
    });

    // ── 系统标签页 ─────────────────────────────────────────
    this._cardRenderers.set('system', (container) => {
      const cmdDefs = [
        {
          cmd: { name: 'system save', description: '保存当前存档', usage: 'system save' },
          fields: [],
          exec: () => this._exec('system save')
        },
        {
          cmd: { name: 'system reset', description: '完全重置存档', usage: 'system reset' },
          fields: [],
          exec: () => {
            if (confirm('⚠️ 确定要完全重置存档吗？游戏将刷新。')) {
              this._exec('system reset');
            }
          }
        },
        {
          cmd: { name: 'system flag', description: '查询/设置标志位', usage: 'system flag <key> [value]' },
          fields: [
            { name: 'key', label: '标志键', placeholder: 'some_flag_key' },
            { name: 'value', label: '值(选填)', placeholder: 'true' }
          ],
          exec: args => this._exec(`system flag ${args[0]}` + (args[1] ? ` ${args[1]}` : ''))
        },
        {
          cmd: { name: 'system flags', description: '列出所有标志位', usage: 'system flags' },
          fields: [],
          exec: () => this._exec('system flags')
        },
        {
          cmd: { name: 'system reload', description: '重新加载存档', usage: 'system reload' },
          fields: [],
          exec: () => this._exec('system reload')
        }
      ];
      cmdDefs.forEach(def => makeCard(container, def.cmd, def.fields, def.exec));
    });

    // ── 鱼类标签页 ─────────────────────────────────────────
    this._cardRenderers.set('fish', (container) => {
      const cmdDefs = [
        {
          cmd: { name: 'fish forcecatch', description: '强制捕获指定鱼类（需在钓鱼场景）', usage: 'fish forcecatch [fishId]' },
          fields: [
            { name: 'fishId', label: '鱼种ID', placeholder: '留空随机（f1-f5）', default: '' }
          ],
          exec: args => this._exec('fish forcecatch' + (args[0] ? ` ${args[0]}` : ''))
        },
        {
          cmd: { name: 'fish catchall', description: '添加所有鱼种各1条到渔获', usage: 'fish catchall' },
          fields: [],
          exec: () => this._exec('fish catchall')
        },
        {
          cmd: { name: 'fish list', description: '列出玩家渔获历史', usage: 'fish list' },
          fields: [],
          exec: () => this._exec('fish list')
        },
        {
          cmd: { name: 'fish clear', description: '清空所有渔获记录', usage: 'fish clear' },
          fields: [],
          exec: () => {
            if (confirm('⚠️ 确定要清空所有渔获记录吗？')) {
              this._exec('fish clear');
            }
          }
        }
      ];
      cmdDefs.forEach(def => makeCard(container, def.cmd, def.fields, def.exec));

      // 鱼种图鉴
      const fishPool = [
        { id: 'f1', name: '吴郭鱼', rarity: 1, price: 15 },
        { id: 'f2', name: '草鱼', rarity: 2, price: 45 },
        { id: 'f3', name: '奇力鱼', rarity: 3, price: 120 },
        { id: 'f4', name: '总统鱼', rarity: 4, price: 500 },
        { id: 'f5', name: '日月潭鱼王', rarity: 5, price: 3000 },
      ];
      const atlas = Save.get('inventory')?.fish || [];
      const caughtIds = new Set(atlas.map(f => f.id || f.species));

      const atlasCard = document.createElement('div');
      atlasCard.className = 'gm-cmd-card';
      atlasCard.innerHTML = `
        <div class="gm-cmd-header">
          <span class="gm-cmd-name">📖 鱼类图鉴</span>
          <span class="gm-cmd-desc">${caughtIds.size}/${fishPool.length} 已捕获</span>
        </div>
        <div id="gm-fish-atlas"></div>
      `;
      container.appendChild(atlasCard);
      const atlasDiv = atlasCard.querySelector('#gm-fish-atlas');
      let atlasHtml = '<table style="width:100%;font-size:11px;border-collapse:collapse">';
      atlasHtml += `<tr style="color:#555;border-bottom:1px solid #0f3460">
        <th style="text-align:left;padding:3px 6px">ID</th>
        <th style="text-align:left;padding:3px 6px">鱼种</th>
        <th style="text-align:left;padding:3px 6px">稀有度</th>
        <th style="text-align:left;padding:3px 6px">价格</th>
        <th style="text-align:left;padding:3px 6px">状态</th>
      </tr>`;
      fishPool.forEach(f => {
        const caught = caughtIds.has(f.id);
        atlasHtml += `<tr style="border-bottom:1px solid #0d1b2a">
          <td style="padding:3px 6px;color:#e94560">${f.id}</td>
          <td style="padding:3px 6px;color:#ccc">${f.name}</td>
          <td style="padding:3px 6px;color:#FFD700">${'★'.repeat(f.rarity)}</td>
          <td style="padding:3px 6px;color:#4CAF50">$${f.price}</td>
          <td style="padding:3px 6px">${caught ? '<span style="color:#4CAF50">✅ 已捕获</span>' : '<span style="color:#888">❌ 未捕获</span>'}</td>
        </tr>`;
      });
      atlasHtml += '</table>';
      atlasDiv.innerHTML = atlasHtml;
    });

    // ── 场景标签页 ─────────────────────────────────────────
    this._cardRenderers.set('scene', (container) => {
      const cmdDefs = [
        {
          cmd: { name: 'scene switch', description: '切换到指定场景', usage: 'scene switch <sceneId>' },
          fields: [
            { name: 'sceneId', label: '场景ID', placeholder: 'village / fishing', default: 'village' }
          ],
          exec: args => this._exec(`scene switch ${args[0]}`)
        },
        {
          cmd: { name: 'scene reload', description: '重新加载当前场景', usage: 'scene reload' },
          fields: [],
          exec: () => this._exec('scene reload')
        },
        {
          cmd: { name: 'scene info', description: '显示当前场景详细信息', usage: 'scene info' },
          fields: [],
          exec: () => this._exec('scene info')
        }
      ];
      cmdDefs.forEach(def => makeCard(container, def.cmd, def.fields, def.exec));

      // 当前场景状态卡片
      const sceneStatusCard = document.createElement('div');
      sceneStatusCard.className = 'gm-cmd-card';
      sceneStatusCard.innerHTML = `
        <div class="gm-cmd-header">
          <span class="gm-cmd-name">🗺️ 当前场景状态</span>
        </div>
        <div id="gm-scene-status"></div>
      `;
      container.appendChild(sceneStatusCard);
      this._renderSceneStatus(sceneStatusCard.querySelector('#gm-scene-status'));
    });
  }

  _renderSceneStatus(container) {
    const scene = window.SceneManager?.currentScene;
    if (!scene) {
      container.innerHTML = '<span style="color:#888;font-size:12px">当前无活动场景</span>';
      return;
    }
    const status = [
      { label: '场景ID', value: scene.id || 'unknown' },
      { label: '玩家X', value: scene.player?.px ?? scene.characterX ?? 'N/A' },
      { label: '玩家Y', value: scene.player?.py ?? scene.characterY ?? 'N/A' },
      { label: '方向', value: scene.player?.direction ?? 'N/A' },
      { label: '时间', value: scene.time ? scene.time.toFixed(2) + 's' : 'N/A' },
      { label: '金币', value: Save.get('player.money') ?? 0 },
    ];
    let html = '<table style="width:100%;font-size:11px">';
    status.forEach(s => {
      html += `<tr style="border-bottom:1px solid #0d1b2a">
        <td style="padding:3px 6px;color:#888">${s.label}</td>
        <td style="padding:3px 6px;color:#e0e0e0;text-align:right">${s.value}</td>
      </tr>`;
    });
    html += '</table>';
    container.innerHTML = html;
  }

  // ── 任务列表渲染 ─────────────────────────────────────────
  _renderQuestList(container) {
    const all = Save.get('quests') || {};

    let html = `<table style="width:100%;font-size:11px;border-collapse:collapse">`;
    html += `<tr style="color:#555;border-bottom:1px solid #0f3460">
      <th style="text-align:left;padding:3px 6px">ID</th>
      <th style="text-align:left;padding:3px 6px">名称</th>
      <th style="text-align:left;padding:3px 6px">状态</th>
      <th style="text-align:left;padding:3px 6px">进度</th>
    </tr>`;

    Object.entries(QUESTS).forEach(([id, tpl]) => {
      const q = all[id];
      let status = '<span style="color:#555">❌ 未定义</span>';
      let progress = '-';
      if (q) {
        const statusMap = {
          not_started: '<span style="color:#888">⏳ 未接取</span>',
          active: '<span style="color:#FFD700">🔄 进行中</span>',
          completed: '<span style="color:#4CAF50">✅ 已完成</span>',
          available_to_complete: '<span style="color:#4CAF50">✓ 可交付</span>'
        };
        status = statusMap[q.status] || `❓ ${q.status}`;
        if (id === 'q001_first_fish' && q.progress?.count !== undefined) {
          progress = `${q.progress.count}/${q.progress.need || 3}`;
        } else if (q.progress && typeof q.progress === 'object') {
          const got = Object.values(q.progress).filter(v => v === true).length;
          progress = `${got}/${Object.keys(q.progress).length}`;
        }
      }
      const name = tpl.name || tpl.title || id;
      html += `<tr style="border-bottom:1px solid #0d1b2a">
        <td style="padding:3px 6px;color:#e94560">${id}</td>
        <td style="padding:3px 6px;color:#ccc">${name}</td>
        <td style="padding:3px 6px">${status}</td>
        <td style="padding:3px 6px;color:#888">${progress}</td>
      </tr>`;
    });

    html += `</table>`;
    container.innerHTML = html;
  }
}

// ============================================================
// 导出 & 挂载
// ============================================================
const GMUI_INSTANCE = new GMUI();
export default GMUI_INSTANCE;

// 如果是开发模式，挂载到 window
if (typeof window !== 'undefined' && DEV_MODE) {
  window.GMUI = GMUI_INSTANCE;
  // 启动 Banner 提示快捷键
  console.log('%c🛠️  GM 面板已就绪 | 快捷键: Ctrl+G | 或 GMUI.show()', 'color:#ff9800');
}