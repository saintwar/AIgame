// PHASE 21-1 D5「鱼咬钩反馈系统」· 三档抖动偏移帧表
//
// 唯一权威源：art-spec v1.2 §1.3（已逐字落码，禁止 "优化对称" 或 "亚像素插值"）
// 单位：屏幕像素（整数）；外层 ctx.scale(0.8) 补偿已含
// 采样：12fps（外部按 elapsed*12 推 frameIdx）
//
// 数值红线（指令书 §3.4）：CodeBuddy 不要改这些数组。

export const BiteShakeFrame = {
  TABLES: {
    light:  [[0,0],[0,2],[0,1],[0,0],[0,3],[0,2],[0,1],[0,1]],
    medium: [[0,0],[0,4],[0,1],[0,5],[0,2],[0,2],[0,2],[1,6],[0,4],[0,5]],
    heavy:  [[0,0],[-3,5],[-5,10],[4,12],[-2,12],[0,12]],
  },

  /**
   * 取第 frameIdx 帧的偏移
   * - light / medium：循环回帧 0
   * - heavy：保持帧 5（[0,12]）后叠 1Hz 横向 ±2px 微抖（持续态）
   *
   * 降级保底（指令书 §3.5 红线）：未启动 / 未传 level 时返回 {dx:0, dy:0}（调用方负责传 level）
   *
   * @param {'light'|'medium'|'heavy'} level
   * @param {number} frameIdx 非负整数（外部传 Math.floor(elapsedSec * 12)）
   * @returns {{dx:number, dy:number}}
   */
  sample(level, frameIdx) {
    const tbl = this.TABLES[level] || this.TABLES.light;
    if (level === 'heavy' && frameIdx >= tbl.length) {
      // 持续态：保持最后帧 + 1Hz 横向 ±2px（6 帧 = 0.5s 半周期）
      const phase = Math.floor((frameIdx - tbl.length) / 6) % 2;
      const last = tbl[tbl.length - 1];
      return { dx: last[0] + (phase ? 2 : -2), dy: last[1] };
    }
    const [dx, dy] = tbl[frameIdx % tbl.length];
    return { dx, dy };
  },
};
