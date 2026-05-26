/**
 * 存档系统 - 基于 localStorage 的持久化存储
 */

const STORAGE_KEY = 'bdds_save_v1';

/**
 * PHASE 16-6 仗1：鱼篓默认配置（木竹篓）
 *   bagLevel：1=木竹篓 / 2=藤编大篓 / 3=保鲜冰篓
 *   maxSlots：条数上限；maxWeight：重量上限（克）
 *   items：堆叠展示用，运行时由 fish-storage.js 维护
 */
const DEFAULT_FISH_STORAGE = {
  items: [],
  maxSlots: 8,
  maxWeight: 5000,
  bagLevel: 1
};

/**
 * PHASE 17 仗1：体力系统默认配置
 *   current：当前体力（每日 0:00 自动重置到 max）
 *   max：体力上限（PRD v2.0 = 100）
 *   lastResetDate：上次重置日期 'YYYY-MM-DD'（空串 = 从未登录，首次进游戏会被
 *                  StaminaSystem.checkDailyReset 设为今日，且不弹"新的一天"飘字）
 */
const DEFAULT_STAMINA = {
  current: 100,
  max: 100,
  lastResetDate: ''
};

/** 默认存档数据 */
const DEFAULT_SAVE = {
  version: 2,
  player: {
    name: '阿明', x: 4, y: 5, money: 0, coin: 0,
    inventory: {}, codex: {}, equipment: { rod: 'basic_rod' },
    // PHASE 16-6 仗4：当前装备的鱼饵 id（默认 basic_bait）
    equippedBait: 'basic_bait',
    fishBag: [],
    // PHASE 16-6 仗1：鱼篓堆叠展示数据（与 fishBag 双轨并存）
    fishStorage: { ...DEFAULT_FISH_STORAGE, items: [] },
    // PHASE 17 仗1：体力系统（钓鱼/未来玩法消耗、跨日重置）
    stamina: { ...DEFAULT_STAMINA },
    // PHASE 18 仗3：挖蚯蚓 — 16 块地格的独立 30min CD（key=tile_<tx>_<ty>，value=可挖时间戳）
    diggingCD: {},
    // PHASE 18 仗3：连续空挖计数（全局，3 次必出蚯蚓×1 保底）
    dryDigCount: 0
  },
  quests: {},
  inventory: { fish: [] },
  flags: { tutorial_done: false, intro_played: false, fishing_tutorial_shown: false },
  lastScene: 'village',
  display: { resolution: '1280x720', tileSize: 64, aspect: '16:9' },
  updatedAt: 0
};

class Save {
  constructor() {
    /** @type {object|null} */
    this._cache = null;
  }

  /** 读取存档，无则返回默认对象 */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._cache = this.migrate(parsed);
      } else {
        this._cache = JSON.parse(JSON.stringify(DEFAULT_SAVE));
      }
    } catch (e) {
      console.error('Save.load 失败:', e);
      this._cache = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    }
    return this._cache;
  }

  /**
   * 获取嵌套属性
   * @param {string} path - 点路径，如 "player.money"
   * @returns {*}
   */
  get(path) {
    if (!this._cache) this.load();
    const keys = path.split('.');
    let result = this._cache;
    for (const key of keys) {
      if (result == null || typeof result !== 'object') return undefined;
      result = result[key];
    }
    return result;
  }

  /**
   * 设置嵌套属性，自动创建中间对象
   * @param {string} path - 点路径，如 "player.money"
   * @param {*} value - 要设置的值
   */
  set(path, value) {
    if (!this._cache) this.load();
    const keys = path.split('.');
    let target = this._cache;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (target[key] == null || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    target[keys[keys.length - 1]] = value;
  }

  /** 提交写入 localStorage */
  commit() {
    if (!this._cache) return;
    this._cache.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
    } catch (e) {
      console.error('Save.commit 失败:', e);
    }
  }

  /** 重置存档 */
  reset() {
    this._cache = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * 存档迁移/升级
   * @param {object} save - 原始存档对象
   * @returns {object}
   */
  migrate(save) {
    if (!save || typeof save !== 'object') {
      return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    }

    // ─────────────────────────────────────────────────────────
    // PHASE 16-6 仗1：fishStorage 字段兜底
    //   老存档可能没有 fishStorage（v1 → v2）→ 给默认值；
    //   items 留空数组，由 fish-storage.js 在 InventorySystem 初始化时
    //   通过 syncFishStorage(player) 从 fishBag 全量重算推导填充。
    //   maxSlots / maxWeight / bagLevel 缺哪补哪，已有的不动（玩家可能已升级）。
    // ─────────────────────────────────────────────────────────
    if (save.player && typeof save.player === 'object') {
      if (!save.player.fishStorage || typeof save.player.fishStorage !== 'object') {
        save.player.fishStorage = { ...DEFAULT_FISH_STORAGE, items: [] };
      } else {
        const fs = save.player.fishStorage;
        if (!Array.isArray(fs.items))     fs.items = [];
        if (typeof fs.maxSlots !== 'number')  fs.maxSlots = DEFAULT_FISH_STORAGE.maxSlots;
        if (typeof fs.maxWeight !== 'number') fs.maxWeight = DEFAULT_FISH_STORAGE.maxWeight;
        if (typeof fs.bagLevel !== 'number')  fs.bagLevel = DEFAULT_FISH_STORAGE.bagLevel;
      }
      // fishBag 兜底（老老存档极端情况）
      if (!Array.isArray(save.player.fishBag)) save.player.fishBag = [];

      // PHASE 16-6 仗4：equippedBait 字段兜底（老存档无此字段 → 默认 basic_bait）
      if (typeof save.player.equippedBait !== 'string') {
        save.player.equippedBait = 'basic_bait';
      }

      // ─────────────────────────────────────────────────────────
      // PHASE 17 hotfix - 临时兜底：新手鱼饵死锁修复
      //   背景：q001 卡 3 条奇力鱼期间，basic_bait 用光后无补给来源
      //         （挖蚯蚓玩法未上线 / 林师傅店铺需 q003 后开放），
      //         玩家无法继续钓鱼 → MVP 红线。
      //   策略：basic_bait（普通蚯蚓）兜底到 999；advanced_bait /
      //         legendary_bait 保持原值（稀缺资源，不通胀）。
      //   同时命中：
      //     - 全新存档（inventory: {}）→ 直接灌 999
      //     - 老存档 basic_bait 缺失 / = 0 → 补到 999
      //     - 老存档 basic_bait > 0 → 不动（玩家自己买的不覆盖）
      //   PHASE 18 挖蚯蚓玩法上线后，本兜底应推翻删除。
      // ─────────────────────────────────────────────────────────
      if (!save.player.inventory || typeof save.player.inventory !== 'object') {
        save.player.inventory = {};
      }
      const inv = save.player.inventory;
      if (!inv.basic_bait || inv.basic_bait === 0) {
        inv.basic_bait = 999;
      }
      if (inv.advanced_bait === undefined) inv.advanced_bait = 0;
      if (inv.legendary_bait === undefined) inv.legendary_bait = 0;

      // PHASE 17 仗1：stamina 字段兜底
      //   - 老存档无 stamina → 注入默认值（满血 + 空 lastResetDate，首次登录会被
      //     StaminaSystem.checkDailyReset 静默初始化为今日，不弹"新的一天"飘字）
      //   - 字段残缺（旧版本写过部分字段）→ 缺哪补哪
      if (!save.player.stamina || typeof save.player.stamina !== 'object') {
        save.player.stamina = { ...DEFAULT_STAMINA };
      } else {
        const st = save.player.stamina;
        if (typeof st.max !== 'number' || st.max <= 0) st.max = DEFAULT_STAMINA.max;
        if (typeof st.current !== 'number') st.current = st.max;
        // current 不能超 max（防御 max 被外力下调的情况）
        if (st.current > st.max) st.current = st.max;
        if (st.current < 0) st.current = 0;
        if (typeof st.lastResetDate !== 'string') st.lastResetDate = '';
      }

      // PHASE 16-6 经济统一：回收孤儿 player.money（早期任务奖励误写字段，HUD 不读）
      //   一次性归并到 player.coin，并清零 money 防止重复迁移。
      if (typeof save.player.money === 'number' && save.player.money > 0) {
        save.player.coin = (save.player.coin || 0) + save.player.money;
        console.log(`[migrate] 回收孤儿 player.money=${save.player.money} → player.coin=${save.player.coin}`);
        save.player.money = 0;
      }

      // PHASE 18 仗3：挖蚯蚓字段兜底
      //   - diggingCD：每格独立 30min CD 时间戳；老存档缺失 → 空对象（全格可挖）
      //   - dryDigCount：连续空挖计数（保底机制）；老存档缺失 → 0
      //   注：跨日 4:00 重置不影响 CD（CD 由 Date.now() 比对，自然延续）
      if (!save.player.diggingCD || typeof save.player.diggingCD !== 'object') {
        save.player.diggingCD = {};
      }
      if (typeof save.player.dryDigCount !== 'number' || save.player.dryDigCount < 0) {
        save.player.dryDigCount = 0;
      }
    }

    // 标记到新版本（不强校验，仅作记录）
    if (typeof save.version !== 'number' || save.version < 2) {
      save.version = 2;
    }
    return save;
  }
}

const saveInstance = new Save();
export default saveInstance;