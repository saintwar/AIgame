/**
 * 称号系统（PHASE 16-5）
 * IIFE，零依赖，挂 window.TitleSystem
 *
 * 数据来源约定（不新建重复字段，复用现有存档结构）：
 *   - 累计鱼数：Save.get('inventory.fish').length
 *   - 鱼种解锁：window.codex.getUnlockedCount()
 *   - 称号 ID / 历史最佳：Save.get('player.titleStats')（新增子树，老档兼容默认值）
 *
 * 称号规则：
 *   双门槛同时满足（fishCount + speciesCount），从高到低取第一个满足的称号。
 *   只升不降：checkTitleUpgrade 内置守卫，数据回滚不触发"获得新称号"。
 */
(function () {
  'use strict';

  /**
   * 称号定义表（按门槛递进）
   */
  const TITLES = [
    {
      id: 'newbie',
      name: '钓鱼新手',
      desc: '初次踏上水社村码头的钓手',
      icon: '🎣',
      requireFishCount: 0,
      requireSpeciesCount: 0,
      color: '#9b9b9b'
    },
    {
      id: 'novice',
      name: '小试身手',
      desc: '已经能稳定钓上鱼了',
      icon: '🐟',
      requireFishCount: 10,
      requireSpeciesCount: 3,
      color: '#7cb87c'
    },
    {
      id: 'harvester',
      name: '渔获满载',
      desc: '渔篓常常满载而归',
      icon: '🎏',
      requireFishCount: 50,
      requireSpeciesCount: 8,
      color: '#5b9bd5'
    },
    {
      id: 'master',
      name: '钓鱼达人',
      desc: '已是水社村人人称道的钓鱼好手',
      icon: '🏆',
      requireFishCount: 150,
      requireSpeciesCount: 15,
      color: '#d4b87a'
    },
    {
      id: 'legend',
      name: '潭心传说',
      desc: '日月潭最深处的鱼群也无法逃脱你的钓线',
      icon: '⭐',
      requireFishCount: 300,
      requireSpeciesCount: 25,
      color: '#e89c4a'
    }
  ];

  /**
   * 从 Save 读取统计上下文（统一聚合点）
   * @returns {{ fishCount:number, speciesCount:number, titleStats:object }}
   */
  function getStatsContext() {
    const fishCount = (window.Save && (window.Save.get('inventory.fish') || []).length) || 0;
    const speciesCount = (window.codex && typeof window.codex.getUnlockedCount === 'function')
      ? window.codex.getUnlockedCount() : 0;
    // 老档兼容：player.titleStats 不存在 → 返回默认对象（不写盘，由调用方决定是否 commit）
    let titleStats = (window.Save && window.Save.get('player.titleStats')) || null;
    if (!titleStats) {
      titleStats = {
        currentTitleId: 'newbie',
        bestSingleFishWeight: 0,    // 单位 kg（与 fishing-scene 的 emit 单位一致）
        bestSingleFishName: '',
        bestSingleFishDate: null,   // ISO 8601 字符串
        totalCaughtWeight: 0,       // 单位 kg（累计）
      };
    } else {
      // 兜底：老档可能少字段
      if (titleStats.currentTitleId === undefined) titleStats.currentTitleId = 'newbie';
      if (titleStats.bestSingleFishWeight === undefined) titleStats.bestSingleFishWeight = 0;
      if (titleStats.bestSingleFishName === undefined) titleStats.bestSingleFishName = '';
      if (titleStats.bestSingleFishDate === undefined) titleStats.bestSingleFishDate = null;
      if (titleStats.totalCaughtWeight === undefined) titleStats.totalCaughtWeight = 0;
    }
    return { fishCount, speciesCount, titleStats };
  }

  /**
   * 计算当前应得的最高称号
   * @param {{fishCount:number, speciesCount:number}} ctx 可选；缺省自动从 Save 读
   * @returns {Object} 当前称号定义（恒不为 null）
   */
  function calculateTitle(ctx) {
    const { fishCount, speciesCount } = ctx || getStatsContext();
    for (let i = TITLES.length - 1; i >= 0; i--) {
      const t = TITLES[i];
      if (fishCount >= t.requireFishCount && speciesCount >= t.requireSpeciesCount) {
        return t;
      }
    }
    return TITLES[0];
  }

  /**
   * 检查称号是否升级（约束 3：只升不降）
   * @param {string} lastTitleId
   * @returns {Object|null} 若升级则返回新称号，否则 null
   */
  function checkTitleUpgrade(lastTitleId) {
    const current = calculateTitle();
    if (current.id === lastTitleId) return null;
    const lastIndex = TITLES.findIndex(t => t.id === lastTitleId);
    const currentIndex = TITLES.findIndex(t => t.id === current.id);
    // 数据回滚或未知 lastTitleId（lastIndex=-1）保护：未知按 0 处理（首次启动）
    const li = lastIndex < 0 ? 0 : lastIndex;
    if (currentIndex > li) return current;
    return null;
  }

  /**
   * 获取下一个称号 + 进度（用于面板进度条）
   * @returns {{ isMax:boolean, current:Object, next?:Object, progress?:Object }}
   */
  function getNextTitleProgress() {
    const ctx = getStatsContext();
    const current = calculateTitle(ctx);
    const currentIndex = TITLES.findIndex(t => t.id === current.id);
    if (currentIndex >= TITLES.length - 1) {
      return { isMax: true, current };
    }
    const next = TITLES[currentIndex + 1];
    return {
      isMax: false,
      current,
      next,
      progress: {
        fishCount: { current: ctx.fishCount, target: next.requireFishCount },
        speciesCount: { current: ctx.speciesCount, target: next.requireSpeciesCount }
      }
    };
  }

  /**
   * 一个称号是否已解锁（用于称号墙渲染）
   */
  function isTitleUnlocked(titleId) {
    const t = TITLES.find(x => x.id === titleId);
    if (!t) return false;
    const { fishCount, speciesCount } = getStatsContext();
    return fishCount >= t.requireFishCount && speciesCount >= t.requireSpeciesCount;
  }

  // 暴露全局 API
  window.TitleSystem = {
    TITLES,
    getStatsContext,
    calculateTitle,
    checkTitleUpgrade,
    getNextTitleProgress,
    isTitleUnlocked,
  };

  console.log('[TitleSystem] 已就绪 - 共', TITLES.length, '个称号');
})();
