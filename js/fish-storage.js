/**
 * 鱼篓堆叠数据工具（PHASE 16-6 仗1）
 *
 * 设计契约（v1.2 双轨并存）：
 *   - 单一真理来源 = player.fishBag（个体精确数组）
 *   - player.fishStorage.items = UI 展示用堆叠副本，按 speciesId 聚合
 *   - 卖鱼 / 任务系统继续读 fishBag，零回归
 *   - 容量校验仅看 fishBag 实时聚合（条数 + 总重）
 *
 * 数据形态：
 *   fishBag      = [{ species, size, rarity, basePrice, caughtAt }, ...]
 *   fishStorage  = {
 *     items: [{ speciesId, name, count, totalWeight, avgWeight }],
 *     maxSlots, maxWeight, bagLevel
 *   }
 *
 * 重量单位统一为「克」。
 *   fishing-scene 当前以 size(cm) 暂存 fishBag，emit 时换算为 kg；
 *   本模块对外接收 fishData = { species, size, weight? }，
 *   weight 缺省时按 size→g 推导（见 _deriveWeightGrams）。
 *
 * 模块为 ES Module，main.js import 后挂到 window.FishStorage（供 GM/调试调用）。
 */

// ─────────────────────────────────────────────────────────
// 私有工具
// ─────────────────────────────────────────────────────────

/**
 * size(cm) → weight(g) 推导
 *   现有项目里：weight(kg) = size / 100，即 size 越大、重量越大、且 1cm ≈ 10g。
 *   显然这是占位算法，但为了和 fishing-scene 现有 emit 一致，
 *   这里复用同样系数：weight(g) = size(cm) * 10。
 *   未来仗 2 / 仗 3 引入鱼种基重曲线时，统一改这一处即可。
 */
function _deriveWeightGrams(fish) {
  if (typeof fish.weight === 'number' && fish.weight > 0) return fish.weight; // 已是克
  const size = typeof fish.size === 'number' ? fish.size : 0;
  return Math.max(1, Math.round(size * 10));
}

/**
 * 从一条 fishBag 记录提取展示用 speciesId 与名称
 *   现有 fishBag 没有 speciesId 字段（只有 species 中文名），
 *   故 speciesId = species（以中文名作 key），name = species。
 *   这与未来 SHUISHE_FISH_POOL.find(f => f.species === ...) 的查询路径一致。
 */
function _idOfFish(fish) {
  return String(fish.species || fish.speciesId || 'unknown');
}

// ─────────────────────────────────────────────────────────
// 公共 API
// ─────────────────────────────────────────────────────────

/**
 * 全量重算 fishStorage.items：基于 fishBag 数组按种类聚合
 *   - 不动 maxSlots / maxWeight / bagLevel
 *   - 老存档兜底（fishStorage 为空但 fishBag 已有数据）走这条路
 *   - 单卖一条后调用 → items 自动同步（仗 2 卖鱼会用到）
 *
 * @param {object} player Save.get('player') 引用（直接修改）
 * @returns {object} 重算后的 fishStorage（同 player.fishStorage 引用）
 */
export function syncFishStorage(player) {
  if (!player || typeof player !== 'object') return null;
  if (!player.fishStorage || typeof player.fishStorage !== 'object') {
    player.fishStorage = { items: [], maxSlots: 8, maxWeight: 5000, bagLevel: 1 };
  }
  const fs = player.fishStorage;
  const bag = Array.isArray(player.fishBag) ? player.fishBag : [];

  // 按 speciesId 聚合
  /** @type {Record<string, {speciesId:string,name:string,count:number,totalWeight:number}>} */
  const map = {};
  for (const fish of bag) {
    const id = _idOfFish(fish);
    const w = _deriveWeightGrams(fish);
    if (!map[id]) {
      map[id] = { speciesId: id, name: fish.species || id, count: 0, totalWeight: 0 };
    }
    map[id].count += 1;
    map[id].totalWeight += w;
  }

  fs.items = Object.values(map).map(it => ({
    speciesId: it.speciesId,
    name: it.name,
    count: it.count,
    totalWeight: Math.round(it.totalWeight),
    avgWeight: Math.round(it.totalWeight / Math.max(1, it.count))
  }));
  return fs;
}

/**
 * 计算 fishBag 当前的总重量（克）
 * @param {Array} bag fishBag 数组
 */
export function computeBagWeight(bag) {
  if (!Array.isArray(bag)) return 0;
  let sum = 0;
  for (const fish of bag) sum += _deriveWeightGrams(fish);
  return Math.round(sum);
}

/**
 * 入篓预检：本条鱼能否入篓（不修改任何数据）
 *   单一真理来源 = fishBag；条数 / 重量任一超限即拒。
 *
 * @param {object} player Save.get('player') 引用
 * @param {{species:string, size?:number, weight?:number}} fishData 待入篓鱼
 * @returns {{ ok:boolean, reason?:string,
 *            currentSlots:number, currentWeight:number,
 *            maxSlots:number, maxWeight:number,
 *            incomingWeight:number }}
 */
export function checkFishStorageCapacity(player, fishData) {
  const fs = (player && player.fishStorage) || { maxSlots: 8, maxWeight: 5000 };
  const bag = (player && Array.isArray(player.fishBag)) ? player.fishBag : [];
  const currentSlots = bag.length;
  const currentWeight = computeBagWeight(bag);
  const incomingWeight = _deriveWeightGrams(fishData || {});

  if (currentSlots + 1 > fs.maxSlots) {
    return { ok: false, reason: 'slots',
             currentSlots, currentWeight,
             maxSlots: fs.maxSlots, maxWeight: fs.maxWeight,
             incomingWeight };
  }
  if (currentWeight + incomingWeight > fs.maxWeight) {
    return { ok: false, reason: 'weight',
             currentSlots, currentWeight,
             maxSlots: fs.maxSlots, maxWeight: fs.maxWeight,
             incomingWeight };
  }
  return { ok: true,
           currentSlots, currentWeight,
           maxSlots: fs.maxSlots, maxWeight: fs.maxWeight,
           incomingWeight };
}

/**
 * 把已入篓的鱼累加到 fishStorage.items（增量更新，不动 fishBag）
 *   调用方：fishing-scene._onFishCaught 在 fishBag.push 之后调用本函数
 *   - 已有同 speciesId → count+1 / totalWeight+w / 重算 avgWeight
 *   - 没有 → 新增条目（count=1）
 *
 * @param {object} player Save.get('player') 引用
 * @param {{species:string, size?:number, weight?:number}} fishData
 */
export function addFishToStorage(player, fishData) {
  if (!player || !fishData) return;
  if (!player.fishStorage || !Array.isArray(player.fishStorage.items)) {
    player.fishStorage = { items: [], maxSlots: 8, maxWeight: 5000, bagLevel: 1 };
  }
  const id = _idOfFish(fishData);
  const w = _deriveWeightGrams(fishData);
  const items = player.fishStorage.items;
  let entry = items.find(it => it.speciesId === id);
  if (entry) {
    entry.count += 1;
    entry.totalWeight = Math.round((entry.totalWeight || 0) + w);
    entry.avgWeight = Math.round(entry.totalWeight / Math.max(1, entry.count));
  } else {
    items.push({
      speciesId: id,
      name: fishData.species || id,
      count: 1,
      totalWeight: w,
      avgWeight: w
    });
  }
}

// 暴露到 window 便于 GM/调试控制台直接调用
if (typeof window !== 'undefined') {
  window.FishStorage = { syncFishStorage, addFishToStorage,
                        checkFishStorageCapacity, computeBagWeight };
}
