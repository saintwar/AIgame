/**
 * 排行榜系统
 * 负责：分数提交（累加式覆盖更新）+ 榜单读取
 * PHASE 16-3
 *
 * 数据模型 leaderboard_today（每玩家今日 1 条，按 _openid + date 唯一）：
 *   { _openid, nickname, score, fishCount, bestFish:{name,weight,rarity},
 *     date:'YYYY-MM-DD', updatedAt }
 *
 * 评分公式（极简版）：score = weight（克）
 *
 * 依赖：window.CloudBase（cloudbase.js）/ window.PlayerProfile（profile-system.js）
 * 因此 index.html 中本文件必须排在以上两者之后。
 */
(function () {
  'use strict';

  const COLLECTION = 'leaderboard_today';

  /**
   * 获取今日 YYYY-MM-DD 字符串（本地时区）
   */
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  window.Leaderboard = {
    /**
     * 提交单条钓鱼成果（增量累加式）
     * @param {Object} fish - { name, weight, rarity }
     * @param {number} fish.weight - 鱼重（克）
     * @returns {Promise<{success:boolean, totalScore?:number, error?:string}>}
     */
    async submitFish(fish) {
      // 1. 前置校验
      if (!fish || typeof fish.weight !== 'number' || fish.weight <= 0) {
        return { success: false, error: '无效的鱼数据' };
      }
      if (!window.CloudBase?.ready || !window.CloudBase.openid) {
        console.warn('[Leaderboard] CloudBase 未就绪，跳过云端提交');
        return { success: false, error: 'CloudBase 未就绪' };
      }
      // 昵称获取（三级降级，绝不丢分）：
      //   1) PlayerProfile.nickname（正常路径）
      //   2) localStorage 备份（PlayerProfile 未及时初始化时兜底）
      //   3) 匿名_xxxx（openid 后 4 位，最后兜底）
      // 后续 update 每次都覆盖 nickname 字段，玩家正式填昵称后会自动同步。
      const openid = window.CloudBase.openid;
      let nickname = window.PlayerProfile?.nickname;
      let nicknameSource = 'profile';
      if (!nickname || !String(nickname).trim()) {
        // 兜底 1：localStorage
        try {
          const raw = localStorage.getItem('bdds_player_profile_v1');
          if (raw) {
            const data = JSON.parse(raw);
            if (data && data.nickname && String(data.nickname).trim()) {
              nickname = data.nickname;
              nicknameSource = 'localStorage';
            }
          }
        } catch (_) { /* 忽略解析错误 */ }
      }
      if (!nickname || !String(nickname).trim()) {
        // 兜底 2：匿名_<openid 后 4 位>
        const tail = String(openid).slice(-4) || '0000';
        nickname = `匿名_${tail}`;
        nicknameSource = 'fallback';
        console.warn(
          '[Leaderboard] 玩家无昵称，使用匿名兜底提交。诊断信息:',
          {
            'PlayerProfile.nickname': window.PlayerProfile?.nickname,
            'PlayerProfile.openid': window.PlayerProfile?.openid,
            'PlayerProfile.cloudSynced': window.PlayerProfile?.cloudSynced,
            'CloudBase.openid': openid,
            fallback: nickname,
          }
        );
      } else if (nicknameSource === 'localStorage') {
        console.warn('[Leaderboard] PlayerProfile.nickname 为空，已从 localStorage 兜底:', nickname);
      }

      const date = todayStr();
      // 极简评分公式：score = weight（克）
      const incScore = Math.round(fish.weight);

      try {
        const db = window.CloudBase.db;

        // 2. 查询当前玩家今日记录
        const res = await db.collection(COLLECTION)
          .where({ _openid: openid, date })
          .get();

        if (res.data && res.data.length > 0) {
          // 3a. 已有今日记录 → 累加
          const cur = res.data[0];
          const newScore = (cur.score || 0) + incScore;
          const newFishCount = (cur.fishCount || 0) + 1;
          const newBest = (!cur.bestFish || fish.weight > (cur.bestFish.weight || 0))
            ? {
                name: fish.name || '未知',
                weight: fish.weight,
                rarity: fish.rarity || 'common',
              }
            : cur.bestFish;

          await db.collection(COLLECTION).doc(cur._id).update({
            nickname,                  // 防止昵称被改后未同步
            score: newScore,
            fishCount: newFishCount,
            bestFish: newBest,
            updatedAt: Date.now(),
          });

          console.log(`[Leaderboard] ✅ 累加: +${incScore} 分 → 总 ${newScore} 分（${newFishCount} 条）`);
          return { success: true, totalScore: newScore };
        } else {
          // 3b. 今日首钓 → 新建
          await db.collection(COLLECTION).add({
            nickname,
            score: incScore,
            fishCount: 1,
            bestFish: {
              name: fish.name || '未知',
              weight: fish.weight,
              rarity: fish.rarity || 'common',
            },
            date,
            updatedAt: Date.now(),
          });

          console.log(`[Leaderboard] ✅ 今日首钓: ${incScore} 分`);
          return { success: true, totalScore: incScore };
        }
      } catch (e) {
        console.error('[Leaderboard] ❌ 云端提交失败:', e.message || e);
        return { success: false, error: e.message || String(e) };
      }
    },

    /**
     * 拉取今日榜单 Top N（本仗只供 F12 测试用，UI 留 16-4）
     */
    async fetchTopToday(limit = 10) {
      if (!window.CloudBase?.ready) {
        return { success: false, error: 'CloudBase 未就绪' };
      }
      try {
        const db = window.CloudBase.db;
        const date = todayStr();
        const res = await db.collection(COLLECTION)
          .where({ date })
          .orderBy('score', 'desc')
          .limit(limit)
          .get();
        return { success: true, list: res.data || [] };
      } catch (e) {
        console.error('[Leaderboard] 拉榜失败:', e);
        return { success: false, error: e.message || String(e) };
      }
    },

    /**
     * 查询当前玩家今日记录（F12 测试用）
     */
    async fetchMyToday() {
      if (!window.CloudBase?.ready || !window.CloudBase.openid) {
        return { success: false, error: 'CloudBase 未就绪' };
      }
      try {
        const db = window.CloudBase.db;
        const date = todayStr();
        const res = await db.collection(COLLECTION)
          .where({ _openid: window.CloudBase.openid, date })
          .get();
        return { success: true, record: res.data?.[0] || null };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    },
  };

  console.log('[Leaderboard] 系统已就绪');
})();
