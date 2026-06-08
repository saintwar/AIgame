// 任务数据表（鱼种配置）— PHASE 15 鱼个体差异化
// PHASE 21-1 D14 hotfix-n（2026-06-03）：四项系统级重构
//   1. 鱼池统一（删 FISH_POOL.js，本表唯一）—— 加 color 字段（旧 FISH_POOL 颜色搬过来）
//   2. 钓竿不过滤鱼池 —— rollFishWithRod 删 rarityUnlock 过滤
//   3. q003 未完成时屏蔽 ★4/★5 —— 新增 q003 状态门禁
//   4. HP 扣血改 3 秒安全区 tick —— 新字段 hpPerTick 替代 hpDrain（旧字段 @deprecated 保留 1 个里程碑兜底）
//
// 字段说明：
//   id          —— 内部 id（图鉴/任务/存档对照用）
//   species     —— 鱼名（中文，作为业务键，与 fish-codex / inventory 对齐）
//   color       —— 渲染配色（鱼鳞/血条主色等），hotfix-n 从旧 FISH_POOL 搬入
//   weight      —— 抽取基础权重（rollFishWithRod 加权用）
//   sizeRange   —— 体长范围 [min, max] cm
//   rarity      —— 稀有度 1~5（hotfix-n 不再用做"钓竿门禁"，仅 q003 门禁 + 图鉴）
//   basePrice   —— 基础售价（金）
//   baseProb    —— 上钩基础概率（fishing-scene 抽鱼用，仅参考）
//   season      —— 季节: 'all' | 'spring,summer' | 'autumn,winter' | ...
//   icon        —— 图鉴 emoji
//   --- PHASE 15 ---
//   fishPull    —— 鱼拉力值：每秒对玩家拉力条（tension）施加的额外影响
//   behavior    —— 行为模式 'none' | 'surge' | 'erratic' | 'mythic'
//   hp          —— 鱼总 HP（安全区 tick 扣减，归零即可拉上岸）
//   --- hotfix-n ---
//   hpPerTick   —— 拉力在安全区时每 3 秒扣血量（新规则，主调参字段）
//   hpDrain     —— @deprecated 旧每帧 ×dt 扣血率，hotfix-n 改为 hpPerTick；保留以防外部引用断裂
//   --- hotfix-o ---
//   hpRecoverPerSecond —— 放松线（!holdingSpace）且 < 回血上限时每秒回血量
//                         按星级 + 个体差异化（旧全局 cfg.fishHPRecoverPerSecond=8 已废弃）
//
// ⚠️ 红线：rise=15 / fall=40 / 黄金区 / 断线缓冲 不动；钓竿不再决定鱼池（hotfix-n）。

// ────────────────────────────────────────────────────────────
// hotfix-t（2026-06-03）：保证"全程安全区"必能钓获 —— 所有鱼平均净扣 ≥ +0.5/秒
//   平均每秒净扣 = hpPerTick/3 − hpRecoverPerSecond
//   设计目标（全程安全区不离开的最短击败时间）：
//     ★1 ≈ +1.6/s  → 15~20 秒（新手鱼）
//     ★2 ≈ +1.2/s  → 40~55 秒
//     ★3 ≈ +0.9/s  → 90~100 秒
//     ★4 ≈ +0.7/s  → 170~190 秒
//     ★5 ≈ +0.5/s  → 360~400 秒（极限挑战）
//   全部为正值，玩家不会因纯回血>纯扣血而陷入永远拉不上来的死循环。
//   ★3+ 仍需依赖钓竿 damageMul（1.5~2.5×）大幅缩短实际时间。
// ────────────────────────────────────────────────────────────
export const SHUISHE_FISH_POOL = [
  // —— 稀有度 1：新手鱼 ——
  // hpPerTick/3 ≈ 2.67，recover 1.0 → 净扣 ≈ 1.67/s
  { id: 'qiliyu',     species: '奇力鱼',   color: '#4682B4', weight: 35, sizeRange: [10, 18], rarity: 1, basePrice: 5,    baseProb: 0.25, season: 'all',
    icon: '🐟', fishPull: 3,  hp: 30,  hpPerTick: 8,  hpRecoverPerSecond: 1.0, hpDrain: 10, behavior: 'none' },
  { id: 'luofeiyu',   species: '罗非鱼',   color: '#8B7D6B', weight: 25, sizeRange: [15, 30], rarity: 1, basePrice: 8,    baseProb: 0.22, season: 'all',
    icon: '🐠', fishPull: 2,  hp: 25,  hpPerTick: 8,  hpRecoverPerSecond: 1.0, hpDrain: 12, behavior: 'none' },

  // —— 稀有度 2 ——
  // hpPerTick/3 = 2.0，recover 0.8 → 净扣 ≈ 1.2/s
  { id: 'caoyu',      species: '草鱼',     color: '#6B8E23', weight: 20, sizeRange: [20, 35], rarity: 2, basePrice: 15,   baseProb: 0.18, season: 'spring,summer',
    icon: '🐡', fishPull: 6,  hp: 50,  hpPerTick: 6,  hpRecoverPerSecond: 0.8, hpDrain: 8,  behavior: 'none' },
  { id: 'quyaoyu',    species: '曲腰鱼',   color: '#6B8E23', weight: 18, sizeRange: [20, 40], rarity: 2, basePrice: 20,   baseProb: 0.14, season: 'autumn,winter',
    icon: '🐡', fishPull: 8,  hp: 65,  hpPerTick: 6,  hpRecoverPerSecond: 1.0, hpDrain: 7,  behavior: 'surge' },

  // —— 稀有度 3 ——
  // hpPerTick/3 ≈ 1.67，recover 0.7~0.9 → 净扣 ≈ 0.77~0.97/s
  { id: 'qiaozuibo',  species: '翘嘴鲌',   color: '#CD853F', weight: 12, sizeRange: [25, 50], rarity: 3, basePrice: 30,   baseProb: 0.09, season: 'summer',
    icon: '🦈', fishPull: 10, hp: 80,  hpPerTick: 5,  hpRecoverPerSecond: 0.7, hpDrain: 6,  behavior: 'surge' },
  { id: 'luyu',       species: '鲈鱼',     color: '#4682B4', weight: 10, sizeRange: [25, 45], rarity: 3, basePrice: 40,   baseProb: 0.06, season: 'summer,autumn',
    icon: '🐟', fishPull: 12, hp: 90,  hpPerTick: 5,  hpRecoverPerSecond: 0.9, hpDrain: 6,  behavior: 'erratic' },

  // —— 稀有度 4：q003 完成后才出 ——
  // hpPerTick/3 ≈ 1.33，recover 0.6 → 净扣 ≈ 0.73/s
  { id: 'liyu',       species: '鲤鱼',     color: '#FF6347', weight: 8,  sizeRange: [30, 60], rarity: 4, basePrice: 60,   baseProb: 0.04, season: 'all',
    icon: '🐉', fishPull: 14, hp: 120, hpPerTick: 4,  hpRecoverPerSecond: 0.6, hpDrain: 5,  behavior: 'surge' },
  { id: 'zongtongyu', species: '总统鱼',   color: '#9370DB', weight: 6,  sizeRange: [35, 65], rarity: 4, basePrice: 500,  baseProb: 0.015, season: 'winter',
    icon: '👑', fishPull: 16, hp: 130, hpPerTick: 4,  hpRecoverPerSecond: 0.6, hpDrain: 5,  behavior: 'erratic' },

  // —— 稀有度 5：q003 完成后才出 ——
  // hpPerTick/3 = 1.0，recover 0.5 → 净扣 ≈ 0.5/s（极限挑战，需 ~6-7 分钟）
  { id: 'riyuetanwang', species: '日月潭鱼王', color: '#FFD700', weight: 3, sizeRange: [50, 80], rarity: 5, basePrice: 3000, baseProb: 0.005, season: 'all',
    icon: '🐲', fishPull: 22, hp: 200, hpPerTick: 3, hpRecoverPerSecond: 0.5, hpDrain: 4,  behavior: 'mythic', legendary: true },
  { id: 'tanshen',    species: '潭神使者', color: '#E0FFFF', weight: 2,  sizeRange: [40, 70], rarity: 5, basePrice: 5000, baseProb: 0.003, season: 'all',
    icon: '👻', fishPull: 20, hp: 180, hpPerTick: 3, hpRecoverPerSecond: 0.5, hpDrain: 4,  behavior: 'mythic', legendary: true }
];

// ────────────────────────────────────────────────────────────
// PHASE 21-1 D14 hotfix-n：q003 门禁辅助函数
//   q003 未完成 → ★4/★5 鱼种完全不出（filter 掉）
//   q003 完成   → 全鱼池开放
// ────────────────────────────────────────────────────────────
function _isQ003Completed() {
  // 容错：questSystem 未挂载（早期场景）默认 false（保守按未完成处理）
  if (!window.questSystem || typeof window.questSystem.getStatus !== 'function') return false;
  return window.questSystem.getStatus('q003') === 'completed';
}

/**
 * 2026-06-05 BL-001 方案E（2026-06-08 加强为 100%）：
 *   q001"钓 3 条奇力鱼"任务进行中时，鱼池只剩奇力鱼一种（抽中率 100%）。
 *   原先权重×2（47%）方案体感推进仍偏慢，改为完全锁池保证新手 3~5 次抛竿即可完成。
 *   任务完成后 getStatus 返回 'completed'，getAvailableFish 自动恢复完整鱼池，
 *   后期生态不受影响。叙事侧已在 chief_quest_offer 对话尾铺垫"这季节奇力鱼最多"。
 */
function _isQ001Active() {
  if (!window.questSystem || typeof window.questSystem.getStatus !== 'function') return false;
  return window.questSystem.getStatus('q001_first_fish') === 'active';
}

/**
 * 取当前可钓鱼池。
 * 优先级：
 *   1) q001 active → 仅奇力鱼（新手任务专属，100% 抽中率）
 *   2) q003 未完成 → 屏蔽 ★4/★5
 *   3) 否则 → 全鱼池
 * 保留旧函数签名兼容旧调用方（inventory-system 等仅遍历用，与门禁无关）。
 */
export function getAvailableFish(/* rodRarityUnlock */) {
  if (_isQ001Active()) {
    const onlyQiliyu = SHUISHE_FISH_POOL.filter(f => f.id === 'qiliyu');
    // 兜底：万一 id 不匹配（数据被改），退化到 ★≤3，避免空池死锁
    if (onlyQiliyu.length > 0) return onlyQiliyu;
  }
  if (_isQ003Completed()) return SHUISHE_FISH_POOL;
  return SHUISHE_FISH_POOL.filter(f => f.rarity <= 3);
}

/**
 * 按钓竿加权抽取鱼种 + 计算体长。
 * PHASE 21-1 D14 hotfix-n 改动：
 *   - 删除 rarityUnlock 过滤（钓竿不再决定能钓哪些鱼）
 *   - 新增 q003 门禁（未完成 → ★4/★5 不出）
 *   - 保留 bigFishBonus 加权（高级竿仍偏向大鱼）
 *   - 保留 maxSizeMul 体长加成
 *   - 2026-06-08：q001 active 时 getAvailableFish 已锁池为奇力鱼一种，
 *     此处不再需要 QILIYU_BOOST 二次加权，单池单选。
 */
export function rollFishWithRod(rod) {
  const pool = getAvailableFish();
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
      const size = baseSize * (rod.maxSizeMul || 1.0);
      return { ...f, size: Math.round(size * 10) / 10 };
    }
  }
  return null;
}
