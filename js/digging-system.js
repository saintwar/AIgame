/**
 * digging-system.js — 挖蚯蚓核心玩法（PHASE 18 仗3）
 * ────────────────────────────────────────────────────────
 * 职责：
 *   村庄 4 块地（左上🟫农田 / 右上🌺花圃 / 左下🌺花圃 / 右下🟫农田，共 16 格）
 *   提供"靠近 + 按 E / 点击"挖鱼饵核心玩法。
 *
 * 数据流：
 *   tryDig(tx, ty)
 *     ├─ 1. CD 检查：未到 → 飘字"⏰ 30:00 后可挖" + 不消耗体力
 *     ├─ 2. 体力 < 2 → 飘字"💔 体力不足" + 不消耗
 *     ├─ 3. 通过 → StaminaSystem.consumeStamina(2)
 *     └─ 4. 抽卡 → 派饵 + 飘字 + 写 CD + 持久化
 *
 * 存档字段（save-system.js 已声明）：
 *   player.diggingCD: { "tile_<tx>_<ty>": <可挖时间戳ms> }
 *   player.dryDigCount: number  (连续空挖计数，3 次必出蚯蚓×1 保底)
 *
 * 概率表（PRD 严格不允许调整）：
 *   农田：蚯蚓×1 60% / ×2 20% / ×3 5% / 香饵 12% / 极品 2.5% / 空 0.5%
 *   花圃：蚯蚓×1 50% / ×2 15% / 香饵 25% / 极品 5% / 空 5%
 *
 * CD：每格独立 30min（30*60*1000 ms），跨日 4:00 重置不影响
 *
 * 防连点：单格 2s 锁（运行时 Map，不持久化）
 */

import Save from './save-system.js';

// ────────────────────────────────────────────────────────
// 静态配置
// ────────────────────────────────────────────────────────

/** 单格 CD：30min */
const CD_MS = 30 * 60 * 1000;

/** 单次挖掘体力消耗 */
const STAMINA_COST = 2;

/** 防连点锁：单格 2s */
const LOCK_MS = 2000;

/** 4-邻判定（曼哈顿距离=1） */
const INTERACT_DIST = 1;

/**
 * 16 格地块表（与 village-scene.js _renderMap 内 4 块 2T×2T 区域对齐）
 *   left-top   (4,1)(5,1)(4,2)(5,2)   farm
 *   right-top  (13,1)(14,1)(13,2)(14,2)   garden
 *   left-bottom (1,4)(2,4)(1,5)(2,5)   garden
 *   right-bottom (15,4)(16,4)(15,5)(16,5)   farm
 */
const DIG_TILES = (() => {
  const tiles = [];
  // 左上 农田
  for (let ty = 1; ty <= 2; ty++) for (let tx = 4; tx <= 5; tx++) tiles.push({ tx, ty, type: 'farm' });
  // 右上 花圃
  for (let ty = 1; ty <= 2; ty++) for (let tx = 13; tx <= 14; tx++) tiles.push({ tx, ty, type: 'garden' });
  // 左下 花圃
  for (let ty = 4; ty <= 5; ty++) for (let tx = 1; tx <= 2; tx++) tiles.push({ tx, ty, type: 'garden' });
  // 右下 农田
  for (let ty = 4; ty <= 5; ty++) for (let tx = 15; tx <= 16; tx++) tiles.push({ tx, ty, type: 'farm' });
  return tiles;
})();

/**
 * 概率表 — 累积区间格式（lo, hi, result）
 *   严格按 PRD：不允许调整
 *   result.bait = 鱼饵 id（'basic_bait' / 'advanced_bait' / 'legendary_bait'），null=空挖
 *   result.count = 数量
 *   result.tier = 飘字档位（'white_1' / 'yellow_2' / 'yellow_3' / 'pink' / 'gold' / 'gray'）
 */
const DIG_TABLE_FARM = [
  // 累积上界 / 结果
  { hi: 0.60, result: { bait: 'basic_bait',     count: 1, tier: 'white_1' } },   // 蚯蚓×1 60%
  { hi: 0.80, result: { bait: 'basic_bait',     count: 2, tier: 'yellow_2' } },  // 蚯蚓×2 20%
  { hi: 0.85, result: { bait: 'basic_bait',     count: 3, tier: 'yellow_3' } },  // 蚯蚓×3  5%
  { hi: 0.97, result: { bait: 'advanced_bait',  count: 1, tier: 'pink' } },      // 香饵×1 12%
  { hi: 0.995, result: { bait: 'legendary_bait', count: 1, tier: 'gold' } },     // 极品×1 2.5%
  { hi: 1.00, result: { bait: null,             count: 0, tier: 'gray' } }       // 空挖   0.5%
];

const DIG_TABLE_GARDEN = [
  { hi: 0.50, result: { bait: 'basic_bait',     count: 1, tier: 'white_1' } },   // 蚯蚓×1 50%
  { hi: 0.65, result: { bait: 'basic_bait',     count: 2, tier: 'yellow_2' } },  // 蚯蚓×2 15%
  { hi: 0.90, result: { bait: 'advanced_bait',  count: 1, tier: 'pink' } },      // 香饵×1 25%
  { hi: 0.95, result: { bait: 'legendary_bait', count: 1, tier: 'gold' } },      // 极品×1  5%
  { hi: 1.00, result: { bait: null,             count: 0, tier: 'gray' } }       // 空挖    5%
];

/** 飘字档位 → { color, size, text(count) } */
const FLOAT_PRESETS = {
  white_1:  { color: '#FFFFFF', size: 'normal', text: () => '🪱 +1' },
  yellow_2: { color: '#FFC107', size: 'large',  text: () => '🪱🪱 +2 不错!' },
  yellow_3: { color: '#FFC107', size: 'large',  text: () => '🪱🪱🪱 +3 大丰收!' },
  pink:     { color: '#FF6BB5', size: 'normal', text: () => '🌸 香饵 +1' },
  gold:     { color: '#FFD700', size: 'large',  text: () => '✨ 极品香饵!' },
  gray:     { color: '#888888', size: 'normal', text: () => '💧 什么都没挖到' }
};

// ────────────────────────────────────────────────────────
// 内部工具
// ────────────────────────────────────────────────────────

function tileId(tx, ty) {
  return `tile_${tx}_${ty}`;
}

function findTile(tx, ty) {
  return DIG_TILES.find(t => t.tx === tx && t.ty === ty) || null;
}

function rollTable(table) {
  const r = Math.random();
  for (const row of table) {
    if (r < row.hi) return row.result;
  }
  // 浮点边界兜底（理论不达）
  return table[table.length - 1].result;
}

function showFloat(tier) {
  if (typeof window.showFloatText !== 'function') return;
  const preset = FLOAT_PRESETS[tier];
  if (!preset) return;
  window.showFloatText(preset.text(), { color: preset.color, size: preset.size });
}

// ────────────────────────────────────────────────────────
// DiggingSystem 单例
// ────────────────────────────────────────────────────────

class DiggingSystem {
  constructor() {
    /** @type {Map<string, number>} 防连点：tileId → 解锁时间戳 */
    this._lockUntil = new Map();
  }

  // ────────────────────────────────────────────
  // 公开查询
  // ────────────────────────────────────────────

  /** 是否是可挖地块格 */
  isDigTile(tx, ty) {
    return !!findTile(tx, ty);
  }

  /** 该格剩余 CD（ms），0=可挖 */
  getCDRemainMs(tx, ty) {
    const cdMap = Save.get('player.diggingCD') || {};
    const until = cdMap[tileId(tx, ty)] || 0;
    const left = until - Date.now();
    return left > 0 ? left : 0;
  }

  isOnCD(tx, ty) {
    return this.getCDRemainMs(tx, ty) > 0;
  }

  /** 所有 16 块地（供渲染层遍历） */
  getAllTiles() {
    return DIG_TILES;
  }

  /**
   * 找出玩家当前最近的可挖格（曼哈顿=1）
   *   优先级：CD 已到 > CD 中（玩家高亮的格子也包括 CD 中的，便于看倒计时）
   *   返回 { tile, dist } 或 null
   */
  getNearestAdjacentTile(playerTx, playerTy) {
    let best = null;
    for (const t of DIG_TILES) {
      const dist = Math.abs(t.tx - playerTx) + Math.abs(t.ty - playerTy);
      if (dist <= INTERACT_DIST) {
        if (!best || dist < best.dist) best = { tile: t, dist };
      }
    }
    return best;
  }

  /** 玩家是否相邻指定格 */
  isAdjacent(playerTx, playerTy, tx, ty) {
    return (Math.abs(playerTx - tx) + Math.abs(playerTy - ty)) <= INTERACT_DIST;
  }

  // ────────────────────────────────────────────
  // 主流程
  // ────────────────────────────────────────────

  /**
   * 尝试挖掘一格
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean} 是否真的执行了挖掘（true=已扣体力 + 派发结果；false=被 CD/体力/锁拦截）
   */
  tryDig(tx, ty) {
    const tile = findTile(tx, ty);
    if (!tile) return false;
    const id = tileId(tx, ty);

    // ① 防连点锁（运行时，不持久化）
    const now = Date.now();
    const lock = this._lockUntil.get(id) || 0;
    if (now < lock) return false;

    // ② CD 检查
    const remain = this.getCDRemainMs(tx, ty);
    if (remain > 0) {
      const mm = Math.floor(remain / 60000);
      const ss = Math.floor((remain % 60000) / 1000);
      const mmStr = String(mm).padStart(2, '0');
      const ssStr = String(ss).padStart(2, '0');
      if (typeof window.showFloatText === 'function') {
        window.showFloatText(`⏰ ${mmStr}:${ssStr} 后可挖`, { color: '#FFC107', size: 'normal' });
      }
      return false;
    }

    // ③ 体力检查（不足 → 不消耗）
    const SS = window.StaminaSystem;
    if (SS && typeof SS.getCurrent === 'function' && SS.getCurrent() < STAMINA_COST) {
      if (typeof window.showFloatText === 'function') {
        window.showFloatText('💔 体力不足', { color: '#FF6B6B', size: 'normal' });
      }
      return false;
    }

    // ④ 消耗体力（StaminaSystem.consumeStamina 不足时返回 false 且不扣，双保险）
    if (SS && typeof SS.consumeStamina === 'function') {
      const ok = SS.consumeStamina(STAMINA_COST, 'digging');
      if (!ok) {
        if (typeof window.showFloatText === 'function') {
          window.showFloatText('💔 体力不足', { color: '#FF6B6B', size: 'normal' });
        }
        return false;
      }
    }

    // ⑤ 上锁 + 抽卡
    this._lockUntil.set(id, now + LOCK_MS);

    const table = tile.type === 'farm' ? DIG_TABLE_FARM : DIG_TABLE_GARDEN;
    let result = rollTable(table);

    // ⑥ 保底：连续 3 次空挖必出蚯蚓×1
    let dryCount = Save.get('player.dryDigCount') || 0;
    if (result.bait === null) {
      dryCount += 1;
      if (dryCount >= 3) {
        // 触发保底，覆盖结果
        result = { bait: 'basic_bait', count: 1, tier: 'white_1' };
        dryCount = 0;
      }
    } else {
      dryCount = 0;
    }
    Save.set('player.dryDigCount', dryCount);

    // ⑦ 派饵 + 飘字
    if (result.bait && result.count > 0) {
      if (window.inventory && typeof window.inventory.add === 'function') {
        window.inventory.add(result.bait, result.count);
      } else {
        // 兜底：直接写 Save（与 quest-system.js 中同款 fallback）
        const inv = Save.get('player.inventory') || {};
        inv[result.bait] = (inv[result.bait] || 0) + result.count;
        Save.set('player.inventory', inv);
      }
    }
    showFloat(result.tier);

    // ⑧ 写 CD + 持久化
    const cdMap = Save.get('player.diggingCD') || {};
    cdMap[id] = now + CD_MS;
    Save.set('player.diggingCD', cdMap);
    Save.commit();

    return true;
  }
}

const diggingSystem = new DiggingSystem();

if (typeof window !== 'undefined') {
  window.DiggingSystem = diggingSystem;
}

export default diggingSystem;
