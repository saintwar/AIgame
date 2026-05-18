// 任务数据表（鱼种配置）

// 水社村钓点鱼池（5 种鱼，含稀有度与基础价格）
export const SHUISHE_FISH_POOL = [
  { species: '奇力鱼',   weight: 35, sizeRange: [10, 18], rarity: 1, basePrice: 5  },
  { species: '罗非鱼',   weight: 25, sizeRange: [15, 30], rarity: 1, basePrice: 8  },
  { species: '曲腰鱼',   weight: 20, sizeRange: [20, 40], rarity: 2, basePrice: 15 },
  { species: '翘嘴鲌',   weight: 12, sizeRange: [25, 50], rarity: 3, basePrice: 30 },
  { species: '鲤鱼',     weight: 8,  sizeRange: [30, 60], rarity: 4, basePrice: 60 }
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
