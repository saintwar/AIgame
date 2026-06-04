// 鱼类行为状态机（PHASE 15 仗3）
//
// 概览：
//   每条鱼上钩后会创建一个 FishBehavior 实例，
//   每帧调用 getEffectivePull(dt, hpPercent) 返回它当前对玩家拉力条施加的"鱼拉力"。
//   返回值会被 fishing-scene._updatePlaying 在 tension 更新公式中作为加项使用：
//     tension += effectivePull * dt
//
// 行为类型：
//   - none    平稳拉力，新手鱼（奇力鱼/罗非鱼/草鱼）
//   - surge   平静 → 冲刺 交替（曲腰鱼/翘嘴鲌/鲤鱼）
//   - erratic 高频左右乱窜（鲈鱼/总统鱼）
//   - mythic  三阶段：试探 → 狂暴 → 垂死挣扎（日月潭鱼王/潭神使者）
//
// 事件：
//   外部可通过 onEvent 回调监听 'surge_incoming'，用于 UI 预警（鱼图标抖动 + "！"气泡）。
//   事件触发时机：surge 模式 calm 阶段剩余 ≤0.5 秒时（每个 calm 周期最多触发一次）。
//
// 红线：本模块只输出"额外拉力"数值与 UI 事件，不直接修改 tension/HP，由调用方控制。
export class FishBehavior {
  /**
   * @param {Object} fishConfig SHUISHE_FISH_POOL 中的单条鱼数据
   * @param {Function} [onEvent] (eventName, payload) => void 行为事件回调（可选）
   */
  constructor(fishConfig, onEvent) {
    this.type     = fishConfig.behavior || 'none';
    this.basePull = fishConfig.fishPull || 0;
    this.onEvent  = typeof onEvent === 'function' ? onEvent : null;

    // 通用状态
    this.state         = 'calm';
    this.timer         = 0;
    this.currentPull   = this.basePull;

    // surge 专用
    this.calmDuration   = 2.0 + Math.random() * 2.0; // 2~4s
    this.surgeDuration  = 0;
    this._surgeWarned   = false; // 当前 calm 周期是否已发过 surge_incoming

    // erratic 专用
    this.nextInterval  = 0.3 + Math.random() * 0.5;  // 0.3~0.8s 一变向
    this.lastDirection = 1;

    // mythic 专用
    this.phase         = 1;
    this.diveCooldown  = 8 + Math.random() * 4;       // 阶段2 深潜 CD：8~12s
    this.diveTimer     = 0;
    this.diving        = false;
    this.diveDuration  = 0;
  }

  /**
   * 主入口：每帧返回当前鱼对玩家拉力条的额外影响
   * @param {number} dt 帧间隔（秒）
   * @param {number} [hpPercent] 鱼当前血量百分比（仅 mythic 用），0~1
   * @returns {number} effectivePull
   */
  getEffectivePull(dt, hpPercent = 1) {
    switch (this.type) {
      case 'none':    return this.basePull;
      case 'surge':   return this._calcSurge(dt);
      case 'erratic': return this._calcErratic(dt);
      case 'mythic':  return this._calcMythic(dt, hpPercent);
      default:        return this.basePull;
    }
  }

  // —— surge：平静(2~4s, 0.5×) → 冲刺(0.8~1.5s, 1.5×) 循环 ——
  // hotfix-w（2026-06-04）：
  //   E. 倍数 ×2.0 → ×1.5（仍保留 surge 张力差，但削弱"突然冲刺爆条"概率）
  //   B. 预警提前到 ≤1.2s（旧 0.5s），并把 isSurging 公开给 UI 层做条上闪烁
  _calcSurge(dt) {
    this.timer += dt;

    // calm → surge 切换
    if (this.state === 'calm') {
      // hotfix-w B：距离冲刺 ≤1.2s 时发一次预警事件（旧 0.5s 玩家来不及反应）
      if (!this._surgeWarned && this.calmDuration - this.timer <= 1.2) {
        this._surgeWarned = true;
        if (this.onEvent) this.onEvent('surge_incoming', { lead: this.calmDuration - this.timer });
      }
      if (this.timer >= this.calmDuration) {
        this.state = 'surge';
        this.timer = 0;
        this.surgeDuration = 0.8 + Math.random() * 0.7;
      }
    }
    // surge → calm 切换
    else if (this.state === 'surge' && this.timer >= this.surgeDuration) {
      this.state = 'calm';
      this.timer = 0;
      this.calmDuration = 2.0 + Math.random() * 2.0;
      this._surgeWarned = false; // 新一轮 calm，预警重置
    }

    // hotfix-w E：surge 倍数 ×2.0 → ×1.5（削弱跳变烈度，但仍保留差异感）
    return this.state === 'calm' ? this.basePull * 0.5 : this.basePull * 1.5;
  }

  /**
   * hotfix-w B：UI 层可查"鱼当前是否正在冲刺"，用于拉力条警示边框/鱼身抖动
   * 仅对 surge / mythic 阶段1/阶段3 有效
   */
  isSurging() {
    return this.type === 'surge' && this.state === 'surge';
  }

  // —— erratic：每 0.4~1.0s 随机变向，幅度 0.4~1.2× basePull，80% 概率正向 ——
  // hotfix-w E：旧 ×0.5~2.0 + 70% 正向 → 新 ×0.4~1.2 + 80% 正向
  //   原因：上限 ×2 + 30% 概率反向 = "卡住不动突然蹦"的最大单一来源
  //   新规则：波动更柔，主要是正向脉冲（鱼在挣扎而非"假装不动"）
  //   节奏：0.3~0.8s → 0.4~1.0s（每秒变向少一些，玩家更好读节奏）
  _calcErratic(dt) {
    this.timer += dt;
    if (this.timer >= this.nextInterval) {
      this.timer = 0;
      this.nextInterval = 0.4 + Math.random() * 0.6;
      const direction = Math.random() > 0.2 ? 1 : -1;   // 80% 正向（旧 70%）
      const intensity = 0.4 + Math.random() * 0.8;       // 0.4~1.2（旧 0.5~2.0）
      this.currentPull   = this.basePull * intensity * direction;
      this.lastDirection = direction;
    }
    return this.currentPull;
  }

  // —— mythic：三阶段（按 hpPercent 切档） ——
  //   阶段1 试探（hp>60%）：surge 变体（弱）
  //   阶段2 狂暴（25~60%）：erratic ×1.5 + 周期性"深潜"（pull = -30 持续 1s，鱼把线带松）
  //   阶段3 垂死挣扎（<25%）：surge ×2，几乎永不停歇
  _calcMythic(dt, hpPercent) {
    if (hpPercent > 0.6)       this.phase = 1;
    else if (hpPercent > 0.25) this.phase = 2;
    else                       this.phase = 3;

    switch (this.phase) {
      case 1:
        return this._calcSurge(dt);
      case 2: {
        // 深潜技能：每 8~12s 触发一次，期间 pull = -20 持续 1s
        // hotfix-w E：深潜 -30 → -20（仍能拽松，但不会瞬间把 tension 拉到 slack 失败区）
        this.diveTimer += dt;
        if (this.diving) {
          if (this.diveTimer >= this.diveDuration) {
            this.diving = false;
            this.diveTimer = 0;
            this.diveCooldown = 8 + Math.random() * 4;
          } else {
            return -20; // 鱼往下潜，把线拽松（玩家若按住反而是好事）
          }
        } else if (this.diveTimer >= this.diveCooldown) {
          this.diving = true;
          this.diveTimer = 0;
          this.diveDuration = 1.0;
          if (this.onEvent) this.onEvent('mythic_dive', { phase: 2 });
          return -20;
        }
        // hotfix-w E：阶段2 erratic 乘数 ×1.5 → ×1.2
        return this._calcErratic(dt) * 1.2;
      }
      case 3:
        // hotfix-w E：阶段3 surge ×2.0 → ×1.5（再叠加 _calcSurge 内的 ×1.5 = 总 ×2.25，
        //   仍是阶段1 的 2.25 倍残暴度，保留"垂死挣扎"差异感）
        return this._calcSurge(dt) * 1.5;
      default:
        return this.basePull;
    }
  }
}
