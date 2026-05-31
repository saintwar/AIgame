// ============================================================
// FishGroupSystem — PHASE 21-1 v3.0 W1 D1 + D3
// ------------------------------------------------------------
// 三鱼群（左/中/右）数据结构 + 鱼群刷新 + wander 状态游动 AI + 按体型差异化渲染
//
// D1 范围：写死三组配置（位置 / 鱼数 / wanderArea）+ wander AI + 占位渲染
// D3 范围：在 D1 之上叠加：
//   - 反向概率表 SIZE_DIST_BY_DENSITY（密度越大，大鱼概率越小）
//   - 稀疏档保底：3 条全 small 时强制把第一条改为 large
//   - 体型可视化分档（small/medium/large 三档 bodyW/bodyH/tailW/tailH/双色）
//   - roll 时机：仅 init 时一次性 roll，整局锁定（不每次抛竿重 roll）
//
// 单位约定：
//   - update(dt) 内部 dt 单位 **毫秒**（与 Nina 指令书一致）
//   - 调用方（fishing-scene._update）若使用秒，需在挂载点做 dt * 1000 转换
//   - swimSpeed 单位 px/秒；turnCooldown 单位 ms
//
// 渲染层序（fishing-scene._render() 内）：
//   背景底图 → buildings/装饰 → 【FishGroupSystem.render()】 → UI（HUD/拉力条/HP）
//
// 红线（来自 Nina v2.0 + W1 D3 指令书）：
//   - 不修改 HookTimingJudge / BattleStateSystem / 拉力 rise=15 fall=40
//   - 不修改 assets/ui/battle/ 8 张图
//   - 不修改 obstacles-shuishe.json / village-scene 相关
//   - 不修改 PHASE 15 fishPool weight/fishPull/behavior 数据
//   - D1 wanderArea / vx 朝向翻转 / wander AI 逻辑保持不变
//   - 不画 wanderArea 调试边框 / 不加 alpha 渐变 / 描边 / 高光
//   - 搏斗期鱼群仍不渲染（由 fishing-scene._render Playing 分支控制）
// ============================================================

// ────────────────────────────────────────────────────────────
// PHASE 21-1 D3：密度档 → 体型反向概率表（主策划拍板）
//   - 密度越大 → 大鱼概率越小（"猎人逆理"激发玩家选稀疏档赌大物）
//   - 稀疏档（fishCount<=3）：sparse 表 + init 末尾保底强制 1 large
//   - 中密档（fishCount===5）：medium 表
//   - 极密档（fishCount>=7）：dense 表
//   - 表内三档 small+medium+large 之和必须 = 1.0，由抽样函数累加判定
// ────────────────────────────────────────────────────────────
const SIZE_DIST_BY_DENSITY = {
  sparse: { small: 0.20, medium: 0.40, large: 0.40 },
  medium: { small: 0.50, medium: 0.35, large: 0.15 },
  dense:  { small: 0.75, medium: 0.22, large: 0.03 },
};

// ────────────────────────────────────────────────────────────
// PHASE 21-1 D3：体型可视化规格（主美拍板）
//   - bodyW/bodyH：身体椭圆轴长（pixel；rx=bodyW/2, ry=bodyH/2）
//   - tailW/tailH：尾巴三角形宽（向后延伸像素数）/ 高（垂直跨度）
//   - body：身体填充色；tail：尾巴填充色（一般为 body 加深 ≈ 0.75 倍亮度）
//   - medium 沿用 D1 已上线 #2A4858（不要改成 #2B4F6B），small/large 由
//     主美按"小鱼浅 / 大鱼深"梯度推算，与 D1 色卡保持一致
// ────────────────────────────────────────────────────────────
const FISH_SIZE_VISUAL = {
  small:  { bodyW: 8,  bodyH: 4, tailW: 1, tailH: 3, body: '#4A6878', tail: '#37505A' },
  medium: { bodyW: 12, bodyH: 6, tailW: 2, tailH: 4, body: '#2A4858', tail: '#1F3744' },
  large:  { bodyW: 16, bodyH: 8, tailW: 2, tailH: 5, body: '#1A2838', tail: '#13202C' },
};

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
      // PHASE 21-1 D3：spawn 完毕后按密度档反向概率表 roll 体型
      //   - 稀疏档保底机制在 _rollFishSize 内部处理
      //   - 整局锁定：仅 init 时 roll 一次，update / 抛竿不重 roll
      this._rollFishSize(g);
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
   * D1 占位渲染 + D3 体型差异化：
   *   - bodyW × bodyH 椭圆 + tailW × tailH 三角尾，颜色按 fish.size 取 FISH_SIZE_VISUAL
   *   - 朝向：vx < 0 时整体水平翻转（ctx.scale(-1, 1)）
   *   - 锚点（统一规则，所有档位一致）：
   *       身体椭圆几何中心 = (fish.x, fish.y)
   *       尾巴附在身体后端中点（默认朝右 → 后端 = (-bodyW/2, 0)），
   *       远端两顶点 = (-bodyW/2 - tailW, ±tailH/2)
   *   - imageSmoothingEnabled = false，与项目像素风铁律一致
   *   - 体型未知（理论不会发生）→ 兜底使用 small 规格
   */
  render() {
    const ctx = this.ctx;
    if (!ctx || !this.fishGroups) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    for (const g of this.fishGroups) {
      for (const f of g.fishes) {
        const vis = FISH_SIZE_VISUAL[f.size] || FISH_SIZE_VISUAL.small;
        const halfBW = vis.bodyW / 2;
        const halfBH = vis.bodyH / 2;
        const halfTH = vis.tailH / 2;
        const facingLeft = f.vx < 0;

        ctx.save();
        // 像素风：取整避免亚像素抖动
        ctx.translate(Math.round(f.x), Math.round(f.y));
        if (facingLeft) ctx.scale(-1, 1);

        // 身体：椭圆，中心 (0, 0)
        ctx.fillStyle = vis.body;
        ctx.beginPath();
        ctx.ellipse(0, 0, halfBW, halfBH, 0, 0, Math.PI * 2);
        ctx.fill();

        // 尾巴：三角形，附在身体后端中点 (-halfBW, 0)，向后延伸 tailW，上下扩 tailH/2
        ctx.fillStyle = vis.tail;
        ctx.beginPath();
        ctx.moveTo(-halfBW, 0);
        ctx.lineTo(-halfBW - vis.tailW, -halfTH);
        ctx.lineTo(-halfBW - vis.tailW, halfTH);
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
   * 在 group 中央 ±wanderArea/4 范围随机生成一条鱼。
   * D1 默认 size='small'（占位），D3 init 末尾会被 _rollFishSize 覆盖。
   * swimSpeed 当前全 30；D3 暂不区分体型游速（large 慢于 small 留 D4+）。
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
      // D1 默认占位 'small'；D3 _rollFishSize 会覆盖
      size: 'small',
      // 初始 target = 当前位置 → 第一帧 turnCooldown<=0 → 立即触发 _pickNewTarget
      targetX: x, targetY: y,
      turnCooldown: 0,
      // small=30 / medium=22 / large=14（D1/D3 全 30；按体型分级游速留 D4+）
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

  /**
   * PHASE 21-1 D3：按密度档反向概率表给该 group 内每条鱼独立 roll size。
   *   - 密度档判定：fishCount<=3 sparse / ===5 medium / >=7 dense
   *   - 每条鱼独立伯努利累加抽样（small → small+medium → 否则 large）
   *   - 稀疏档保底：roll 完无 large 时强制把 fishes[0] 改为 large
   *     （避免 0.2³≈0.8% 全 small 极端 → 玩家"赌大物"承诺破灭）
   *   - 只在 init() 时调用一次，update / 抛竿不重 roll，整局锁定
   */
  _rollFishSize(group) {
    const tier =
      group.fishCount <= 3 ? 'sparse' :
      group.fishCount === 5 ? 'medium' :
      'dense';
    const dist = SIZE_DIST_BY_DENSITY[tier];

    for (const f of group.fishes) {
      const r = Math.random();
      if (r < dist.small) f.size = 'small';
      else if (r < dist.small + dist.medium) f.size = 'medium';
      else f.size = 'large';
    }

    // 稀疏档保底：必须至少有 1 条 large
    if (tier === 'sparse' && !group.fishes.some(f => f.size === 'large')) {
      group.fishes[0].size = 'large';
    }
  }
}
