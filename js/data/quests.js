// 任务数据表

export const QUESTS = {
  q001_first_fish: {
    id: 'q001_first_fish',
    name: '潭边的早晨',
    giver: 'chief',
    description: '帮村长阿土伯钓 3 条奇力鱼',
    target: { fish: '奇力鱼', count: 0, need: 3 },
    // PHASE 18 仗4：奖励对齐 PRD v2.0 — 100 金币 + 5 蚯蚓（原 50 金币为历史值）
    reward: { coin: 100, bait: 5 },
    onCompleteFlag: 'q001_done'
  },

  q002: {
    id: 'q002',
    title: '潭中百味',
    giver: 'xiaofang',
    prerequisite: 'q001_first_fish',   // 必须 q001 已完成
    description: '小芳想集齐日月潭水社村钓点的所有鱼种图鉴，帮她钓全 5 种不同的鱼吧！',

    // 目标鱼种（调整：鲤鱼 → 草鱼，降低门槛，让入门竿玩家也能直接推进）
    targetSpecies: ['奇力鱼', '罗非鱼', '草鱼', '曲腰鱼', '翘嘴鲌'],

    // 进度结构：{ 奇力鱼: false, 罗非鱼: false, ... }
    initialProgress: () => ({
      奇力鱼: false, 罗非鱼: false, 草鱼: false, 曲腰鱼: false, 翘嘴鲌: false
    }),

    // 进度更新逻辑（不重复计数）
    onFishCaught: (progress, species) => {
      if (progress[species] === false) {
        progress[species] = true;
        return { updated: true, progress };
      }
      return { updated: false, progress };
    },

    // 完成判定
    isComplete: (progress) => {
      return Object.values(progress).every(v => v === true);
    },

    // 显示进度（HUD 用）
    getProgressText: (progress) => {
      const got = Object.values(progress).filter(v => v).length;
      return `🐟 潭中百味 ${got}/5`;
    },

    // 详细进度（小芳对话/任务面板用）
    getDetailText: (progress) => {
      return Object.entries(progress)
        .map(([sp, ok]) => `${ok ? '✅' : '⬜'} ${sp}`)
        .join('  ');
    },

    reward: {
      coin: 200,
      items: [{ id: 'advanced_bait', name: '高级鱼饵', count: 3 }]
    }
  },

  q003: {
    id: 'q003',
    title: '林师傅的考验',
    giver: 'lin',
    prerequisite: 'q002',
    description: '林师傅说要送阿明一把好钓竿，但要先证明自己——卖出价值 300 金的鱼货，并钓到一条翘嘴鲌。',

    initialProgress: () => ({
      coinEarned: 0,
      qiaozuiCaught: false
    }),

    // 卖鱼时调用
    onFishSold: (progress, { species, price }) => {
      progress.coinEarned += price;
      return { updated: true, progress };
    },

    // 钓鱼时调用
    onFishCaught: (progress, species) => {
      if (species === '翘嘴鲌' && !progress.qiaozuiCaught) {
        progress.qiaozuiCaught = true;
        return { updated: true, progress };
      }
      return { updated: false, progress };
    },

    isComplete: (progress) => {
      return progress.coinEarned >= 300 && progress.qiaozuiCaught;
    },

    getProgressText: (progress) => {
      return `🎣 林师傅考验 ${Math.min(progress.coinEarned, 300)}/300金`;
    },

    getDetailText: (progress) => {
      const coinOK = progress.coinEarned >= 300 ? '✅' : '⬜';
      const fishOK = progress.qiaozuiCaught ? '✅' : '⬜';
      return `${coinOK} 累计鱼货 ${Math.min(progress.coinEarned, 300)}/300 金\n${fishOK} 钓到翘嘴鲌`;
    },

    reward: {
      coin: 200,
      items: [{ id: 'bamboo_rod', name: '竹制钓竿', count: 1 }]
    }
  }
};