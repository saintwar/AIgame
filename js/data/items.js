export const ITEMS = {
  // 鱼饵类
  basic_bait:    { id:'basic_bait',    name:'初级鱼饵',  category:'bait', icon:'🪱', desc:'最普通的蚯蚓鱼饵', stack:99, price:5 },
  advanced_bait: { id:'advanced_bait', name:'高级鱼饵',  category:'bait', icon:'🦐', desc:'用虾肉制成，咬钩率提升', stack:99, price:20 },
  legendary_bait:{ id:'legendary_bait',name:'传说鱼饵',  category:'bait', icon:'✨', desc:'传说中能引来鱼王的神秘饵料', stack:99, price:100 },

  // 钓竿类（3 段进阶）
  // PHASE 21-1 D14 hotfix-n：rarityUnlock @deprecated（钓竿不再过滤鱼池）
  //   新增 damageMul：每次安全区 tick 扣血量 = fishData.hpPerTick × damageMul
  basic_rod: {
    id:'basic_rod', name:'入门钓竿', category:'rod', icon:'🎣',
    desc:'阿明从家里翻出的旧竿子，凑合用',
    stack:1, price:0,
    qteWindowMul: 1.0,
    qteSpeedMul: 1.0,
    bigFishBonus: 0,
    maxSizeMul: 1.0,
    damageMul: 1.0,        // hotfix-n 新增
    rarityUnlock: 2        // @deprecated hotfix-n
  },
  bamboo_rod: {
    id:'bamboo_rod', name:'竹制钓竿', category:'rod', icon:'🎍',
    desc:'林师傅手工削的竹竿，更柔韧耐用',
    stack:1, price:300,
    qteWindowMul: 1.25,
    qteSpeedMul: 0.85,
    bigFishBonus: 0.10,
    maxSizeMul: 1.15,
    damageMul: 1.5,        // hotfix-n 新增
    rarityUnlock: 3        // @deprecated hotfix-n
  },
  carbon_rod: {
    id:'carbon_rod', name:'碳素钓竿', category:'rod', icon:'⚜️',
    desc:'专业级碳素纤维钓竿，钓界传奇',
    stack:1, price:1500,
    qteWindowMul: 1.5,
    qteSpeedMul: 0.7,
    bigFishBonus: 0.25,
    maxSizeMul: 1.35,
    damageMul: 2.5,        // hotfix-n 新增
    rarityUnlock: 5        // @deprecated hotfix-n
  },

  // 材料/杂项（占位）
  fish_scale:    { id:'fish_scale',    name:'鱼鳞',      category:'material', icon:'🐠', desc:'闪亮的鱼鳞，或许有用', stack:99, price:2 },
};

// 工具函数
export function getItem(id) { return ITEMS[id] || null; }
export function getCategoryItems(items, category) {
  return Object.entries(items)
    .filter(([id]) => ITEMS[id]?.category === category)
    .map(([id, count]) => ({ ...ITEMS[id], count }));
}
