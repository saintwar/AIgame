// ============================================================
// FishGroupSystem — PHASE 21-1 v3.0 W1 D1
// ------------------------------------------------------------
// 三鱼群（左/中/右）数据结构 + 鱼群刷新 + wander 状态游动 AI + 占位渲染
//
// D1 范围（严格不越界）：
//   - 写死三组配置（位置 / 鱼数 / wanderArea），不接概率公式
//   - 每条鱼仅 wander 状态（'approach' / 'flee' 留 D2+ / D5）
//   - 占位色块渲染（8×4 椭圆 + 1px 三角尾），不接 21-2 鱼 sprite
//   - 不画 wanderArea 边框、不画水波纹、不画密集度高亮
//
// 单位约定：
//   - update(dt) 内部 dt 单位 **毫秒**（与 Nina 指令书 §3.4 / §5 骨架一致）
//   - 调用方（fishing-scene._update）若使用秒，需在挂载点做 dt * 1000 转换
//   - swimSpeed 单位 px/秒；turnCooldown 单位 ms
//
// 渲染层序（fishing-scene._render() 内）：
//   背景底图 → buildings/装饰 → 【FishGroupSystem.render()】 → UI（HUD/拉力条/HP）
//
// 红线（来自 Nina v2.0 + W1 D1 指令书）：
//   - 不修改 HookTimingJudge / BattleStateSystem / 拉力 rise=15 fall=40
//   - 不修改 assets/ui/battle/ 8 张图
//   - 不修改 obstacles-shuishe.json / village-scene 相关
//   - 不接概率公式刷鱼（推迟 D3）
//   - 不分鱼体型差异（推迟 D3）
// ============================================================

export class FishGroupSystem {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.fishGroups = [];
  }

  // ──────────────────────────────────────────────
  // 生命周期：init / update / render / dispose
  // ──────────────────────────────────────────────

  /**
   * 初始化三鱼群配置 + 按密度档刷鱼。
   * @param {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}} params
   */
  init({ canvas, ctx }) {
    this.canvas = canvas;
    this.ctx = ctx;

    // D1 写死三组配置（与指令书 §3.2 一致）：
    //   稀疏档（left）：3 条 / 220×140 范围
    //   中密档（center）：5 条 / 180×120 范围
    //   极密档（right）：7 条 / 120×80 范围
    this.fishGroups = [
      { id: 'left',   centerX: 320, centerY: 480, fishCount: 3, fishes: [], wanderArea: { w: 220, h: 140 } },
      { id: 'center', centerX: 640, centerY: 540, fishCount: 5, fishes: [], wanderArea: { w: 180, h: 120 } },
      { id: 'right',  centerX: 960, centerY: 480, fishCount: 7, fishes: [], wanderArea: { w: 120, h: 80  } },
    ];

    for (const g of this.fishGroups) {
      for (let i = 0; i < g.fishCount; i++) {
        g.fishes.push(this._spawnFish(g, i));
      }
    }
  }

  /**
   * 每帧驱动 wander AI。
   * @param {number} dt 距上帧的时间（毫秒）
   */
  update(dt) {
    if (!this.fishGroups || this.fishGroups.length === 0) return;
    for (const g of this.fishGroups) {
      const halfW = g.wanderArea.w / 2;
      const halfH = g.wanderArea.h / 2;
      const minX = g.centerX - halfW;
      const maxX = g.centerX + halfW;
      const minY = g.centerY - halfH;
      const maxY = g.centerY + halfH;

      for (const f of g.fishes) {
        f.turnCooldown -= dt;

        // ① 到达目标 ±10px 内 或 turnCooldown 用尽 → 重选目标
        const dx0 = f.targetX - f.x;
        const dy0 = f.targetY - f.y;
        const reachedSq = dx0 * dx0 + dy0 * dy0;   // 比开方便宜
        if (reachedSq < 100 /* = 10² */ || f.turnCooldown <= 0) {
          this._pickNewTarget(f, g);
        }

        // ② 朝向计算 + 速度向量
        const dx = f.targetX - f.x;
        const dy = f.targetY - f.y;
        const ang = Math.atan2(dy, dx);
        f.vx = Math.cos(ang) * f.swimSpeed;
        f.vy = Math.sin(ang) * f.swimSpeed;

        // ③ 位置积分（swimSpeed 单位 px/秒，dt 单位 ms → / 1000）
        f.x += f.vx * dt / 1000;
        f.y += f.vy * dt / 1000;

        // ④ 边界硬约束：触边时 clamp 并立即反向重选目标，避免贴墙抖动
        let bounced = false;
        if (f.x < minX) { f.x = minX; bounced = true; }
        else if (f.x > maxX) { f.x = maxX; bounced = true; }
        if (f.y < minY) { f.y = minY; bounced = true; }
        else if (f.y > maxY) { f.y = maxY; bounced = true; }
        if (bounced) this._pickNewTarget(f, g);
      }
    }
  }

  /**
   * D1 占位渲染：单条鱼 = 8×4 椭圆 + 1px 三角尾。
   * 朝向：vx < 0 时整体水平翻转（ctx.scale(-1, 1)）。
   * 颜色：#2A4858（项目色卡的深湖蓝）。
   * imageSmoothingEnabled = false，与项目像素风铁律一致。
   */
  render() {
    const ctx = this.ctx;
    if (!ctx || !this.fishGroups) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2A4858';

    for (const g of this.fishGroups) {
      for (const f of g.fishes) {
        const facingLeft = f.vx < 0;
        ctx.save();
        // 像素风：取整避免亚像素抖动
        ctx.translate(Math.round(f.x), Math.round(f.y));
        if (facingLeft) ctx.scale(-1, 1);

        // 身体：8×4 椭圆（默认朝右 → 头在右、尾在左）
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // 尾巴：1px 小三角形（默认朝右时尾在左侧 (-4, 0) → (-6, ±1)）
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-6, -1);
        ctx.lineTo(-6, 1);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * 退场清理：清空所有鱼数据，置空引用，防 memory leak。
   * 与 fishing-scene.destroy() 对称调用。
   */
  dispose() {
    if (this.fishGroups) {
      for (const g of this.fishGroups) {
        if (g.fishes) g.fishes.length = 0;
      }
      this.fishGroups.length = 0;
    }
    this.fishGroups = [];
    this.canvas = null;
    this.ctx = null;
  }

  // ──────────────────────────────────────────────
  // 内部工具方法
  // ──────────────────────────────────────────────

  /**
   * 在 group 中央 ±wanderArea/4 范围随机生成一条鱼（D1 全 small / swimSpeed=30）。
   */
  _spawnFish(g, i) {
    const halfW = g.wanderArea.w / 2;
    const halfH = g.wanderArea.h / 2;
    // 初始位置：中央 ±wanderArea/4 范围（避免一开始就贴边）
    const x = g.centerX + (Math.random() - 0.5) * halfW;
    const y = g.centerY + (Math.random() - 0.5) * halfH;
    return {
      id: `${g.id}_${i}`,
      groupId: g.id,
      x, y,
      vx: 0, vy: 0,
      // D1 全 small；D3 接 21-2 sprite 时再分 small / medium / large
      size: 'small',
      // 初始 target = 当前位置 → 第一帧 turnCooldown<=0 → 立即触发 _pickNewTarget
      targetX: x, targetY: y,
      turnCooldown: 0,
      // small=30 / medium=22 / large=14（D1 全 30）
      swimSpeed: 30,
      // D1 仅 'wander'；'approach' 留 D2+，'flee' 留 D5
      state: 'wander',
    };
  }

  /**
   * 在该 group 的 wanderArea 内随机选新目标点 + 重置 turnCooldown（800~2000ms）。
   */
  _pickNewTarget(fish, g) {
    fish.targetX = g.centerX + (Math.random() - 0.5) * g.wanderArea.w;
    fish.targetY = g.centerY + (Math.random() - 0.5) * g.wanderArea.h;
    // 800~2000ms 随机间隔，让鱼群整体节奏松散自然
    fish.turnCooldown = 800 + Math.random() * 1200;
  }
}
