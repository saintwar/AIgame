// PHASE 16-6 仗4：鱼饵差异化效果配置
//
// 与项目现有物品系统对齐：鱼饵 id = basic_bait / advanced_bait / legendary_bait
// 任务书原 id (worm/scented/premium) 已映射到项目实际 id。
//
// 设计：
// - basic_bait    = 普通蚯蚓（基线，无加成）
// - advanced_bait = 香饵（rarityBonus +30% 概率把普通鱼提档；sizeMul 1.1）
// - legendary_bait= 极品香饵（rarityShift +1 必出更高档；sizeMul 1.25）
export const BAIT_EFFECTS = {
  basic_bait: {
    id: 'basic_bait',
    name: '初级鱼饵',
    icon: '🪱',
    rarityBonus: 0,
    rarityShift: 0,
    sizeMul: 1.0,
    description: '普通蚯蚓，钓常见鱼，新手必备'
  },
  advanced_bait: {
    id: 'advanced_bait',
    name: '高级鱼饵',
    icon: '🦐',
    rarityBonus: 0.3,
    rarityShift: 0,
    sizeMul: 1.1,
    description: '稀有鱼概率 +30%，重量 +10%'
  },
  legendary_bait: {
    id: 'legendary_bait',
    name: '传说鱼饵',
    icon: '✨',
    rarityBonus: 0,
    rarityShift: 1,
    sizeMul: 1.25,
    description: '稀有度直升一档，重量 +25%'
  }
};

// 鱼饵循环顺序（数字键 1/2/3 直接选档；任务书数字键裁定）
export const BAIT_ORDER = ['basic_bait', 'advanced_bait', 'legendary_bait'];

export function getBaitEffect(id) {
  return BAIT_EFFECTS[id] || BAIT_EFFECTS.basic_bait;
}
