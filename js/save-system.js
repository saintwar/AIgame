/**
 * 存档系统 - 基于 localStorage 的持久化存储
 */

const STORAGE_KEY = 'bdds_save_v1';

/** 默认存档数据 */
const DEFAULT_SAVE = {
  version: 1,
  player: { name: '阿明', x: 4, y: 5, money: 0, coin: 0, inventory: {}, codex: {}, equipment: { rod: 'basic_rod' }, fishBag: [] },
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
    // 当前 version=1，无需迁移
    return save;
  }
}

const saveInstance = new Save();
export default saveInstance;