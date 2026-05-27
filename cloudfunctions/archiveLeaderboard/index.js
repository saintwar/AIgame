/**
 * archiveLeaderboard 云函数
 * ------------------------------------------------------------
 * 功能：每日定时（北京时间 15:00）把 leaderboard_today 全量归档到
 *       leaderboard_history（每条附 archiveDate / archivedAt），
 *       然后清空 leaderboard_today，让新一日榜单从零起算。
 *
 * SDK 选型：@cloudbase/node-sdk（项目前端用 @cloudbase/js-sdk，云端配套）
 *   - wx-server-sdk 是微信小程序云函数专用，本项目是 Web，不适用
 *
 * 触发方式：
 *   1. 定时触发器（生产）：cloudbaserc.json 配 cron 0 0 15 * * * *
 *   2. 控制台 / CLI 手动触发（验证）
 *
 * 数据契约（leaderboard_today 文档，来自 js/leaderboard-system.js）：
 *   {
 *     _id, _openid, nickname, score, fishCount,
 *     bestFish: { name, weight, rarity },
 *     date,         // 字符串 YYYY-MM-DD
 *     updatedAt     // 毫秒时间戳
 *   }
 *
 * 归档后写入 leaderboard_history 的文档额外字段：
 *   - archiveDate  YYYY-MM-DD（归档日，与 date 通常相同但语义不同：date=玩家钓鱼那一日，archiveDate=本次归档动作发生日）
 *   - archivedAt   云端 serverDate（归档时间戳，便于审计）
 *   - _id 由 cloud 自动生成（不保留 today 的原 _id）
 *
 * 返回结构：
 *   { success: true, date, archivedCount, message }
 *   { success: false, error, date }
 */

const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV  // 自动取当前环境，避免硬编码 envId 跨环境部署出错
});
const db = app.database();

// 北京时间 YYYY-MM-DD（UTC+8）
function getBeijingDateStr() {
  const now = new Date();
  // 转 UTC+8（毫秒数 + 8h），再用 toISOString 切前 10 位
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

exports.main = async (event, context) => {
  const dateStr = getBeijingDateStr();

  try {
    // ─── 1. 读取今日排行榜全量记录 ─────────────────────────
    //   单次 .get() 默认上限 100 条（云函数）；当前榜单玩家不会很多，
    //   但保险起见用循环分页一直读到读完。
    const allRecords = [];
    const PAGE = 100;
    while (true) {
      const res = await db.collection('leaderboard_today')
        .skip(allRecords.length)
        .limit(PAGE)
        .get();
      if (!res.data || res.data.length === 0) break;
      allRecords.push(...res.data);
      if (res.data.length < PAGE) break;
    }

    if (allRecords.length === 0) {
      return { success: true, message: 'No records to archive', date: dateStr, archivedCount: 0 };
    }

    // ─── 2. 写入 leaderboard_history（并行批次，每批 100） ───
    const archiveRecords = allRecords.map(record => {
      const { _id, ...rest } = record;  // 丢掉旧 _id，history 自动生成新 _id
      return {
        ...rest,
        archiveDate: dateStr,
        archivedAt: db.serverDate()
      };
    });

    const BATCH = 100;
    let archived = 0;
    for (let i = 0; i < archiveRecords.length; i += BATCH) {
      const batch = archiveRecords.slice(i, i + BATCH);
      const tasks = batch.map(r => db.collection('leaderboard_history').add(r));
      await Promise.all(tasks);
      archived += batch.length;
    }

    // ─── 3. 清空 leaderboard_today（按 _id 并行删） ──────
    //   注意：必须用上一步读到的 _id 列表来删，避免"读—写之间有新写入被误删"。
    //   即使删除期间有玩家新写入今日榜，新记录不在 allRecords 列表里，会被保留。
    let deleted = 0;
    for (let i = 0; i < allRecords.length; i += BATCH) {
      const batch = allRecords.slice(i, i + BATCH);
      const tasks = batch.map(r => db.collection('leaderboard_today').doc(r._id).remove());
      await Promise.all(tasks);
      deleted += batch.length;
    }

    return {
      success: true,
      date: dateStr,
      archivedCount: archived,
      deletedCount: deleted,
      message: `Archived ${archived} records for ${dateStr}, cleared ${deleted} from leaderboard_today`
    };

  } catch (error) {
    console.error('[archiveLeaderboard] FAIL', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
      date: dateStr
    };
  }
};
