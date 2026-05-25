/**
 * StaminaSystem — 体力系统（PHASE 17 仗1：地基）
 * ────────────────────────────────────────────────────────
 * 职责：
 *   - 体力数值的读 / 扣 / 回 / 跨日重置
 *   - 持久化（透传 Save）
 *   - 事件广播（'stamina_changed' / 'stamina_depleted'），供 HUD/未来玩法订阅
 *   - 不耦合任何具体玩法（钓鱼集成在 fishing-scene 里调 consumeStamina）
 *
 * 数值规格（PRD v2.0）：
 *   - max = 100（默认上限）
 *   - 钓鱼成功一条扣 2（仅"成功入篓"那一刻；失败/跑鱼/空竿不扣）
 *   - 每日 0:00（自然日切换）自动恢复满血
 *
 * 跨日策略（"自然日切换"）：
 *   - 用 'YYYY-MM-DD' 字符串比较（本地时区），简单稳健
 *   - 任意"对外动作"前调用 checkDailyReset()，确保拿到的体力是当日数值
 *   - 首次登录（lastResetDate === ''）静默初始化，不弹"新的一天"飘字
 *
 * 设计约束：
 *   - 所有读写都走 Save，不缓存内存副本（避免与其它模块的 Save.set('player', ...)
 *     全量回写产生竞态——参考 fishing-scene 在入篓时也会 Save.set('player', player)）
 *   - 事件接口模仿 InventorySystem.on / _emit 的轻量 EventEmitter 风格
 *   - 不实现 saveAll；用 Save.commit()（项目唯一持久化入口）
 *
 * 使用：
 *   import StaminaSystem from './stamina-system.js';
 *   StaminaSystem.checkDailyReset();          // 启动时调用一次
 *   if (StaminaSystem.consumeStamina(2, 'fishing')) { ... }
 *   StaminaSystem.restoreStamina(100);        // 仗2 秀兰住宿用
 *   StaminaSystem.on('stamina_changed', (data) => { ... });
 *
 * 全局别名：window.StaminaSystem
 */

import Save from './save-system.js';

/**
 * 获取今日日期字符串（本地时区，'YYYY-MM-DD'）
 *   不用 toISOString()——它走 UTC，会让东八区 0:00~8:00 误判跨日
 * @returns {string}
 */
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class StaminaSystem {
  constructor() {
    /** @type {Object<string, Function[]>} */
    this._listeners = {};
  }

  // ─── 内部读写 ─────────────────────────────────────────
  _getStamina() {
    // save-system.migrate 已保证 stamina 字段健全；此处仅再做一道兜底以防外部
    // 模块整体替换 player 时漏字段（fishing-scene 入篓时会 Save.set('player', player)）。
    let st = Save.get('player.stamina');
    if (!st || typeof st !== 'object') {
      st = { current: 100, max: 100, lastResetDate: '' };
      Save.set('player.stamina', st);
    }
    return st;
  }

  // ─── 事件接口（轻量 EventEmitter，仿 InventorySystem）────
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }
  _emit(event, payload) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error(`[StaminaSystem] listener error on ${event}:`, e); }
    });
  }

  // ─── 公开读接口 ───────────────────────────────────────
  /** 当前体力值 */
  getCurrent() { return this._getStamina().current; }
  /** 体力上限 */
  getMax() { return this._getStamina().max; }
  /** 体力比例 0~1（HUD 视觉状态判断用） */
  getRatio() {
    const st = this._getStamina();
    return st.max > 0 ? st.current / st.max : 0;
  }

  // ─── 跨日重置 ─────────────────────────────────────────
  /**
   * 每日 0:00 自动恢复满血。在游戏启动时 + 关键操作前调用。
   *   - 首次登录（lastResetDate === ''）静默初始化为今日，不弹飘字
   *   - 跨日触发时：满血 + 飘字"🌅 新的一天，体力满满！"
   */
  checkDailyReset() {
    const today = getTodayString();
    const st = this._getStamina();
    if (st.lastResetDate === today) return;  // 同日，无需重置

    const wasFirstLogin = st.lastResetDate === '';
    st.current = st.max;
    st.lastResetDate = today;
    Save.set('player.stamina', st);
    Save.commit();
    this._emit('stamina_changed', { current: st.current, max: st.max, reason: 'daily_reset' });

    if (!wasFirstLogin && typeof window !== 'undefined' && typeof window.showFloatText === 'function') {
      window.showFloatText('🌅 新的一天，体力满满！', { color: '#FFD700', size: 'large' });
    }
  }

  // ─── 体力扣减 ─────────────────────────────────────────
  /**
   * 消耗体力。
   * @param {number} amount 扣减数量（必须 > 0）
   * @param {string} [reason='unknown'] 扣减原因（事件 payload，便于未来分析）
   * @returns {boolean} 扣减是否成功（true=已扣并持久化；false=体力不足，原状态保持）
   */
  consumeStamina(amount, reason = 'unknown') {
    if (typeof amount !== 'number' || amount <= 0) {
      console.warn('[StaminaSystem] consumeStamina: invalid amount', amount);
      return false;
    }
    const st = this._getStamina();
    if (st.current < amount) return false;

    st.current -= amount;
    Save.set('player.stamina', st);
    Save.commit();
    this._emit('stamina_changed', { current: st.current, max: st.max, reason });

    // 体力刚好归零 → 友善提示（PRD：去秀兰阿姨家睡一觉吧）
    //   仗2 实装秀兰住宿；仗1 阶段先把提示发出来，玩家路径已经引导明确。
    if (st.current === 0) {
      this._emit('stamina_depleted', { reason });
      if (typeof window !== 'undefined' && typeof window.showFloatText === 'function') {
        window.showFloatText('💤 你太累了，去秀兰阿姨家睡一觉吧', {
          color: '#FF6B6B', size: 'large', duration: 3000
        });
      }
    }
    return true;
  }

  // ─── 体力恢复 ─────────────────────────────────────────
  /**
   * 恢复体力（不超 max）。仗2 秀兰住宿、未来食物道具等回血路径调用。
   * @param {number} amount 恢复数量（必须 > 0）
   * @param {string} [reason='unknown'] 来源（事件 payload）
   */
  restoreStamina(amount, reason = 'unknown') {
    if (typeof amount !== 'number' || amount <= 0) {
      console.warn('[StaminaSystem] restoreStamina: invalid amount', amount);
      return;
    }
    const st = this._getStamina();
    st.current = Math.min(st.current + amount, st.max);
    Save.set('player.stamina', st);
    Save.commit();
    this._emit('stamina_changed', { current: st.current, max: st.max, reason });
  }
}

// 单例 + 全局别名
const staminaSystem = new StaminaSystem();
if (typeof window !== 'undefined') {
  window.StaminaSystem = staminaSystem;
}

export default staminaSystem;
