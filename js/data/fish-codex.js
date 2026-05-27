// 鱼类图鉴元数据（PHASE 15：扩展到 10 种鱼）
//
// 字段说明：
//   id          —— 内部 id（与 fish-pool.js 对齐）
//   name        —— 鱼名（中文，业务键）
//   icon        —— 图鉴 emoji
//   region      —— 出没水域
//   rarity      —— 稀有度 1~5
//   sizeRange   —— 体长范围 [min, max] cm
//   season      —— 季节描述（中文，给图鉴 UI 显示用）
//   desc        —— 图鉴描述（一句话介绍）
//   legend      —— 传说/彩蛋（古老民间传说或本作剧情伏笔）
export const FISH_CODEX = {
  '奇力鱼': {
    id: 'qiliyu', name: '奇力鱼', icon: '🐟', region: '日月潭',
    rarity: 1, sizeRange: [10, 18], season: '四季',
    desc: '日月潭最常见的小型鱼，邵族人传统美食。',
    legend: '传说邵族先祖循着奇力鱼的踪迹找到了日月潭。'
  },
  '罗非鱼': {
    id: 'luofeiyu', name: '罗非鱼', icon: '🐠', region: '日月潭',
    rarity: 1, sizeRange: [15, 30], season: '四季',
    desc: '又名"吴郭鱼"，外来种但已成台湾常见食用鱼。',
    legend: '1946年由吴振辉、郭启彰从新加坡带回台湾。'
  },
  '草鱼': {
    id: 'caoyu', name: '草鱼', icon: '🐡', region: '日月潭',
    rarity: 2, sizeRange: [20, 35], season: '春夏',
    desc: '体型壮硕的淡水鱼，喜食水草，上钩时会猛冲一波。',
    legend: '老渔民说草鱼力气大，能把竹竿拖进水里。'
  },
  '曲腰鱼': {
    id: 'quyaoyu', name: '曲腰鱼', icon: '🐡', region: '日月潭',
    rarity: 2, sizeRange: [20, 40], season: '秋冬',
    desc: '日月潭三大名鱼之一，肉质鲜嫩。',
    legend: '又名"翘嘴红鲌"，邵族祭典中常见的供鱼。'
  },
  '翘嘴鲌': {
    id: 'qiaozuibo', name: '翘嘴鲌', icon: '🦈', region: '日月潭',
    rarity: 3, sizeRange: [25, 50], season: '夏季',
    desc: '凶猛的肉食性鱼类，咬钩瞬间冲击力强。',
    legend: '据说在月圆之夜，翘嘴鲌会跃出水面捕食蜻蜓。'
  },
  '鲈鱼': {
    id: 'luyu', name: '鲈鱼', icon: '🐟', region: '日月潭',
    rarity: 3, sizeRange: [25, 45], season: '夏秋',
    desc: '日月潭大嘴鲈，性格暴躁，上钩后左右乱窜。',
    legend: '月圆之夜会跃出水面捕食蜻蜓。'
  },
  '鲤鱼': {
    id: 'liyu', name: '鲤鱼', icon: '🐉', region: '日月潭',
    rarity: 4, sizeRange: [30, 60], season: '四季',
    desc: '日月潭水域里的"老顽固"，需要耐心和技巧。',
    legend: '相传鲤鱼跃龙门便化龙，是华人吉祥的象征。'
  },
  '总统鱼': {
    id: 'zongtongyu', name: '总统鱼', icon: '👑', region: '日月潭',
    rarity: 4, sizeRange: [35, 65], season: '冬季',
    desc: '曲腰鱼王，肉质鲜嫩曾为国宴菜。',
    legend: '蒋介石最爱的总统鱼，又名翘嘴红鲌。'
  },
  '日月潭鱼王': {
    id: 'riyuetanwang', name: '日月潭鱼王', icon: '🐲', region: '日月潭',
    rarity: 5, sizeRange: [50, 80], season: '四季',
    desc: '日月潭最大的鱼，传说中潜伏在拉鲁岛附近的深水王者。',
    legend: '只有最坚毅的钓手能与它搏斗超过三个回合。'
  },
  '潭神使者': {
    id: 'tanshen', name: '潭神使者', icon: '👻', region: '日月潭',
    rarity: 5, sizeRange: [40, 70], season: '四季',
    desc: '半透明的幽灵鱼影，邵族传说中拉鲁岛守护灵的化身。',
    legend: '与阿明父亲的失踪有关……'
  }
};

export function getCodexEntry(species) {
  return FISH_CODEX[species] || null;
}
