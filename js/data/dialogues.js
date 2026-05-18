// 对话脚本表

export const DIALOGUES = {
  // 开场旁白（无 NPC 字段，speaker='旁白'）
  intro_narration: {
    id: 'intro_narration',
    npc: null,
    lines: [
      { speaker: '旁白', text: '日月潭的雾，又起了。' },
      { speaker: '旁白', text: '阿爸说过，雾里的鱼，会说话。' },
      { speaker: '旁白', text: '这年夏天，我十五岁。' },
      { speaker: '旁白', text: '我决定，自己去问问看。' }
    ],
    onEnd: null
  },

  // 秀兰首次见面（自动触发）
  mom_first_meet: {
    id: 'mom_first_meet',
    npc: 'mom',
    lines: [
      { speaker: '秀兰', text: '阿明啊，你又要去钓鱼了？' },
      { speaker: '秀兰', text: '记得先去广场找阿土伯打个招呼，村长找你有事呢。' },
      { speaker: '秀兰', text: '记得你阿爸的话，钓鱼要有耐心。' }
    ],
    onEnd: null
  },

  // 秀兰默认对话
  mom_default: {
    id: 'mom_default',
    npc: 'mom',
    lines: [
      { speaker: '秀兰', text: '阿明啊，吃饱才有力气钓鱼喔～' },
      { speaker: '秀兰', text: '你爸的竹竿，要好好爱惜。' }
    ],
    onEnd: null
  },

  // 村长默认对话（未接任务时）
  chief_default: {
    id: 'chief_default',
    npc: 'chief',
    lines: [
      { speaker: '阿土伯', text: '少年仔，最近潭里的鱼怪怪的呢。' },
      { speaker: '阿土伯', text: '你阿爸是个好渔人……' }
    ],
    onEnd: null
  },

  // 村长任务发布
  chief_quest_offer: {
    id: 'chief_quest_offer',
    npc: 'chief',
    lines: [
      { speaker: '阿土伯', text: '哎哟，这不是大海的儿子嘛，长这么大了。' },
      { speaker: '阿土伯', text: '最近村里的猫一直叫，说是想吃鱼……老人家我牙口也不好，就想喝口鱼汤。' },
      { speaker: '阿土伯', text: '你能不能去码头那儿，帮阿伯钓三条奇力鱼回来？' },
      { speaker: '阿明', text: '奇力鱼？就是潭里那种银白色的小鱼对吧，没问题！' },
      { speaker: '阿土伯', text: '好囝仔！钓到了再回来找我，我给你准备了点东西。' }
    ],
    onEnd: 'acceptQuest:q001_first_fish'
  },

  // 村长任务进行中
  chief_quest_progress: {
    id: 'chief_quest_progress',
    npc: 'chief',
    lines: [
      { speaker: '阿土伯', text: '鱼汤的葱花我都切好了喔。' },
      { speaker: '阿土伯', text: '奇力鱼最爱在码头边的浅滩，清晨咬钩最勤快。' },
      { speaker: '阿明', text: '（先去码头看看吧。）' }
    ],
    onEnd: null
  },

  // 村长任务完成
  chief_quest_complete: {
    id: 'chief_quest_complete',
    npc: 'chief',
    lines: [
      { speaker: '阿土伯', text: '哇！三条都肥肥的，不愧是大海的儿子！' },
      { speaker: '阿土伯', text: '这50块钱拿去，再给你一些鱼饵，路上用得着。' },
      { speaker: '阿土伯', text: '对了……你阿爸失踪那晚，我看到湖中央有奇怪的光。' },
      { speaker: '阿明', text: '……阿爸？村长你是不是知道什么！' },
      { speaker: '阿土伯', text: '时候未到。先去把竿子练好，少年仔。' }
    ],
    onEnd: 'completeQuest:q001_first_fish'
  },

  // 林师傅默认对话
  lin_default: {
    id: 'lin_default',
    npc: 'master_lin',
    lines: [
      { speaker: '林师傅', text: '竿子要养，跟养孩子一样。' },
      { speaker: '林师傅', text: '新手？先去找村长聊聊吧。' }
    ],
    onEnd: null
  },

  // 林师傅 — q002 未完成（闲聊）
  lin_idle: {
    id: 'lin_idle',
    npc: 'master_lin',
    lines: [
      { speaker: '林师傅', text: '少年仔，钓鱼讲究心静如水，急不得。' },
      { speaker: '林师傅', text: '等你钓鱼技术练到一定程度，我再考虑教你点真本事。' }
    ],
    onEnd: null
  },

  // 林师傅 — q002 完成后首次接 q003
  lin_offer_q003: {
    id: 'lin_offer_q003',
    npc: 'master_lin',
    lines: [
      { speaker: '林师傅', text: '哎呀小芳那丫头说你把图鉴都集齐了？厉害厉害！' },
      { speaker: '林师傅', text: '我手头有一根自己削的竹竿，柔韧得很，比你那破玩意儿强多了。' },
      { speaker: '林师傅', text: '不过送你不能白送，得让我看看你是真喜欢钓鱼，还是三分钟热度。' },
      { speaker: '林师傅', text: '这样吧——卖出累计 300 金的鱼货，再钓一条翘嘴鲌给我看看。' },
      { speaker: '林师傅', text: '都做到了，竹竿就是你的，外加 200 金辛苦费。怎样，敢不敢接？' },
      { speaker: '林师傅', text: '对了，鱼货可以直接卖给我，按行情价收。' }
    ],
    onEnd: 'acceptQuest:q003'
  },

  // 林师傅 — q003 进行中
  lin_q003_progress: {
    id: 'lin_q003_progress',
    npc: 'master_lin',
    lines: [
      { speaker: '林师傅', text: '哟，回来了？怎么样？' },
      { speaker: '林师傅', text: '{q003_detail}' },
      { speaker: '林师傅', text: '别急，钓鱼不是一日之功，慢慢来。需要卖鱼随时找我。' }
    ],
    onEnd: null,
    dynamic: true
  },

  // 林师傅 — q003 可交付
  lin_q003_ready: {
    id: 'lin_q003_ready',
    npc: 'master_lin',
    lines: [
      { speaker: '林师傅', text: '哈哈，真的做到了！我没看走眼！' },
      { speaker: '林师傅', text: '这根竹竿现在是你的了。比之前那破竿子强 10 倍！' },
      { speaker: '林师傅', text: '另外我还能给你介绍点更高级的家伙——不过那都得花钱。' }
    ],
    onEnd: null
  },

  // 林师傅 — q003 已完成（开店模式）
  lin_shop: {
    id: 'lin_shop',
    npc: 'master_lin',
    lines: [
      { speaker: '林师傅', text: '想买点啥？还是来卖鱼的？' }
    ],
    onEnd: null
  },

  // 林师傅 — 卖鱼专用
  lin_sell_intro: {
    id: 'lin_sell_intro',
    npc: 'master_lin',
    lines: [
      { speaker: '林师傅', text: '让我看看你的渔获...' }
    ],
    onEnd: null
  },

  // 小芳默认对话（q001 未完成时）
  xiaofang_idle: {
    id: 'xiaofang_idle',
    npc: 'xiaofang',
    lines: [
      { speaker: '小芳', text: '哥哥你今天看起来精神不错耶～' },
      { speaker: '小芳', text: '我在整理我的鱼类图鉴，但好多鱼都还没收集到呢...' },
      { speaker: '小芳', text: '等你把村长那边的事情忙完，要不要帮我一下？😊' }
    ],
    onEnd: null
  },

  // 小芳 — q001 完成后（首次接 q002）
  xiaofang_offer_q002: {
    id: 'xiaofang_offer_q002',
    npc: 'xiaofang',
    lines: [
      { speaker: '小芳', text: '哇！哥哥你真的钓到奇力鱼啦？太厉害了！' },
      { speaker: '小芳', text: '对了，我一直在做一个《日月潭鱼类图鉴》📖' },
      { speaker: '小芳', text: '水社村钓点据说能钓到 5 种鱼：奇力鱼、罗非鱼、曲腰鱼、翘嘴鲌、鲤鱼。' },
      { speaker: '小芳', text: '哥哥你超会钓的对吧～可以帮我把这 5 种都集齐吗？' },
      { speaker: '小芳', text: '完成的话送你 200 金币和 3 个高级鱼饵唷！💕' }
    ],
    onEnd: 'acceptQuest:q002'
  },

  // 小芳 — q002 进行中
  xiaofang_q002_progress: {
    id: 'xiaofang_q002_progress',
    npc: 'xiaofang',
    lines: [
      { speaker: '小芳', text: '哥哥你回来啦～图鉴进度怎么样了？' },
      { speaker: '小芳', text: '{q002_detail}' },
      { speaker: '小芳', text: '我图鉴本上也帮你画好啦～按 T 键就能看哦！💕' }
    ],
    onEnd: null,
    dynamic: true
  },

  // 小芳 — q002 可交付
  xiaofang_q002_ready: {
    id: 'xiaofang_q002_ready',
    npc: 'xiaofang',
    lines: [
      { speaker: '小芳', text: '哇！哇！哇！哥哥你真的把 5 种都钓齐了！😍' },
      { speaker: '小芳', text: '太感谢啦！我的图鉴终于可以完工了！' },
      { speaker: '小芳', text: '这是说好的奖励——200 金币 + 3 个高级鱼饵！' }
    ],
    onEnd: 'completeQuest:q002'
  },

  // 小芳 — q002 已完成
  xiaofang_q002_done: {
    id: 'xiaofang_q002_done',
    npc: 'xiaofang',
    lines: [
      { speaker: '小芳', text: '哥哥你已经是水社村的钓鱼大师了呢～' },
      { speaker: '小芳', text: '下次去其他钓点也要带上我哦！要看更多新鱼种！🐟' }
    ],
    onEnd: null
  }
};