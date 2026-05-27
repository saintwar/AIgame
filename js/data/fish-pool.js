// 任务数据表（鱼种配置）— PHASE 15 鱼个体差异化
//
// 字段说明：
//   id          —— 内部 id（图鉴/任务/存档对照用）
//   species     —— 鱼名（中文，作为业务键，与 fish-codex / inventory 对齐）
//   weight      —— 抽取基础权重（rollFishWithRod 加权用）
//   sizeRange   —— 体长范围 [min, max] cm
//   rarity      —— 稀有度 1~5（与钓竿 rarityUnlock 阈值联动）
//   basePrice   —— 基础售价（金）
//   baseProb    —— 上钩基础概率（fishing-scene 抽鱼用，仅参考）
//   season      —— 季节: 'all' | 'spring,summer' | 'autumn,winter' | ...
//   icon        —— 图鉴 emoji
//   --- PHASE 15 新增 ---
//   fishPull    —— 鱼拉力值：每秒对玩家拉力条（tension）施加的额外影响
//                  正值 = 鱼朝断线方向拉，按住空格上升变快、松手下降变慢
//   behavior    —— 行为模式 'none' | 'surge' | 'erratic' | 'mythic'
//                  对应 FishBehavior 状态机
//   hp          —— 鱼总 HP（黄金区时按 hpDrain 扣减，归零即可拉上岸）
//   hpDrain     —— 玩家把 tension 控在黄金区时，鱼每秒掉血量
//   behaviorConfig —— 行为模式专属参数（可选，预留）
//
// ⚠️ 红线：rise=15 / fall=40 / 黄金区 / 断线缓冲 / 钓竿 rarityUnlock 机制 不动。
export const SHUISHE_FISH_POOL = [
  // —— 稀有度 1：新手鱼，fishPull 极小，体验与改动前几乎无差异 ——
  { id: 'qiliyu',     species: '奇力鱼',   weight: 35, sizeRange: [10, 18], rarity: 1, basePrice: 5,    baseProb: 0.25, season: 'all',
    icon: '🐟', fishPull: 3,  hp: 30,  hpDrain: 10, behavior: 'none' },
  { id: 'luofeiyu',   species: '罗非鱼',   weight: 25, sizeRange: [15, 30], rarity: 1, basePrice: 8,    baseProb: 0.22, season: 'all',
    icon: '🐠', fishPull: 2,  hp: 25,  hpDrain: 12, behavior: 'none' },

  // —— 稀有度 2：开始有拉力差异，曲腰鱼引入 surge 冲刺 ——
  { id: 'caoyu',      species: '草鱼',     weight: 20, sizeRange: [20, 35], rarity: 2, basePrice: 15,   baseProb: 0.18, season: 'spring,summer',
    icon: '🐡', fishPull: 6,  hp: 50,  hpDrain: 8,  behavior: 'none' },
  { id: 'quyaoyu',    species: '曲腰鱼',   weight: 18, sizeRange: [20, 40], rarity: 2, basePrice: 20,   baseProb: 0.14, season: 'autumn,winter',
    icon: '🐡', fishPull: 8,  hp: 65,  hpDrain: 7,  behavior: 'surge' },

  // —— 稀有度 3：surge / erratic 拉锯感更明显 ——
  { id: 'qiaozuibo',  species: '翘嘴鲌',   weight: 12, sizeRange: [25, 50], rarity: 3, basePrice: 30,   baseProb: 0.09, season: 'summer',
    icon: '🦈', fishPull: 10, hp: 80,  hpDrain: 6,  behavior: 'surge' },
  { id: 'luyu',       species: '鲈鱼',     weight: 10, sizeRange: [25, 45], rarity: 3, basePrice: 40,   baseProb: 0.06, season: 'summer,autumn',
    icon: '🐟', fishPull: 12, hp: 90,  hpDrain: 6,  behavior: 'erratic' },

  // —— 稀有度 4：高拉力，需要节奏控制 ——
  { id: 'liyu',       species: '鲤鱼',     weight: 8,  sizeRange: [30, 60], rarity: 4, basePrice: 60,   baseProb: 0.04, season: 'all',
    icon: '🐉', fishPull: 14, hp: 120, hpDrain: 5,  behavior: 'surge' },
  { id: 'zongtongyu', species: '总统鱼',   weight: 6,  sizeRange: [35, 65], rarity: 4, basePrice: 500,  baseProb: 0.015, season: 'winter',
    icon: '👑', fishPull: 16, hp: 130, hpDrain: 5,  behavior: 'erratic' },

  // —— 稀有度 5：传说级，三阶段 mythic 行为 ——
  { id: 'riyuetanwang', species: '日月潭鱼王', weight: 3, sizeRange: [50, 80], rarity: 5, basePrice: 3000, baseProb: 0.005, season: 'all',
    icon: '🐲', fishPull: 22, hp: 200, hpDrain: 4,  behavior: 'mythic', legendary: true },
  { id: 'tanshen',    species: '潭神使者', weight: 2,  sizeRange: [40, 70], rarity: 5, basePrice: 5000, baseProb: 0.003, season: 'all',
    icon: '👻', fishPull: 20, hp: 180, hpDrain: 4,  behavior: 'mythic', legendary: true }
];

// 根据当前装备的钓竿过滤可钓鱼种
export function getAvailableFish(rodRarityUnlock) {
  return SHUISHE_FISH_POOL.filter(f => f.rarity <= rodRarityUnlock);
}

// 根据钓竿加权抽取鱼种，并计算体长
export function rollFishWithRod(rod) {
  const pool = getAvailableFish(rod.rarityUnlock);
  if (pool.length === 0) return null;

  // 加权权重 = weight * (1 + bigFishBonus * rarity)
  const adjusted = pool.map(f => ({
    ...f,
    adjWeight: f.weight * (1 + (rod.bigFishBonus || 0) * f.rarity)
  }));
  const total = adjusted.reduce((s, f) => s + f.adjWeight, 0);
  let roll = Math.random() * total;
  for (const f of adjusted) {
    roll -= f.adjWeight;
    if (roll <= 0) {
      // 体长加成
      const [minS, maxS] = f.sizeRange;
      const baseSize = minS + Math.random() * (maxS - minS);
      const size = baseSize * rod.maxSizeMul;
      return { ...f, size: Math.round(size * 10) / 10 };
    }
  }
  return null;
}
