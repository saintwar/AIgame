// 鱼类图鉴元数据（先做水社村 5 种，预留 80 鱼接口）
export const FISH_CODEX = {
  '奇力鱼': {
    id: 'qili', name: '奇力鱼', icon: '🐟', region: '日月潭',
    rarity: 1, sizeRange: [10, 18], season: '四季',
    desc: '日月潭最常见的小型鱼，邵族人传统美食。',
    legend: '传说邵族先祖循着奇力鱼的踪迹找到了日月潭。'
  },
  '罗非鱼': {
    id: 'luofei', name: '罗非鱼', icon: '🐠', region: '日月潭',
    rarity: 1, sizeRange: [15, 30], season: '四季',
    desc: '又名"吴郭鱼"，外来种但已成台湾常见食用鱼。',
    legend: '1946年由吴振辉、郭启彰从新加坡带回台湾。'
  },
  '曲腰鱼': {
    id: 'quyao', name: '曲腰鱼', icon: '🐡', region: '日月潭',
    rarity: 2, sizeRange: [20, 40], season: '春秋',
    desc: '日月潭三大名鱼之一，肉质鲜嫩。',
    legend: '蒋介石最爱的"总统鱼"，又名"翘嘴红鲌"。'
  },
  '翘嘴鲌': {
    id: 'qiaozui', name: '翘嘴鲌', icon: '🦈', region: '日月潭',
    rarity: 3, sizeRange: [25, 50], season: '夏秋',
    desc: '凶猛的肉食性鱼类，咬钩瞬间冲击力强。',
    legend: '据说在月圆之夜，翘嘴鲌会跃出水面捕食蜻蜓。'
  },
  '鲤鱼': {
    id: 'liyu', name: '鲤鱼', icon: '🐉', region: '日月潭',
    rarity: 4, sizeRange: [30, 60], season: '四季',
    desc: '日月潭水域里的"老顽固"，需要耐心和技巧。',
    legend: '相传鲤鱼跃龙门便化龙，是华人吉祥的象征。'
  }
};

export function getCodexEntry(species) {
  return FISH_CODEX[species] || null;
}
