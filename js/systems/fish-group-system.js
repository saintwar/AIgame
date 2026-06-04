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
// PHASE 21-1 D14：体型独立 roll（与 fishCount/丰富度解耦）
//   - 每条鱼独立伯努利累加抽样：r < small / r < small+medium / 否则 large
//   - 不再按 group.fishCount 分档；不再有"稀疏档保底 1 large"
//   - 大鱼"承诺"由 D11 大鱼层兜底（每局至多 1 条大鱼挂靠某随机群）
// ────────────────────────────────────────────────────────────
const FISH_SIZE_DIST = { small: 0.50, medium: 0.35, large: 0.15 };

// ────────────────────────────────────────────────────────────
// PHASE 21-1 D14：鱼群随机化布局边界与参数
// ────────────────────────────────────────────────────────────
const WATER_BOUNDS = { minX: 120, maxX: 1160, minY: 420, maxY: 660 }; // 水域可用 AABB
const GROUP_GAP_X = 40;     // 群间 X 方向最小间距（除两 halfW 外的留白）
const GROUP_GAP_Y = 30;     // 群间 Y 方向最小间距
const LAYOUT_RETRY_MAX = 20;// 每群最多重试 20 次

// 旧 D1 三组（随机布局 20 次失败时的兜底）
const FALLBACK_LAYOUT = [
  { id: 'left',   centerX: 320, centerY: 480, fishCount: 3, wanderArea: { w: 220, h: 140 } },
  { id: 'center', centerX: 640, centerY: 540, fishCount: 5, wanderArea: { w: 180, h: 120 } },
  { id: 'right',  centerX: 960, centerY: 480, fishCount: 7, wanderArea: { w: 120, h: 80  } },
];

function _randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

// ────────────────────────────────────────────────────────────
// PHASE 21-1 D14：受惊系统参数（Q1 老板拍板 R_SCARE=120）
// ────────────────────────────────────────────────────────────
const R_SCARE      = 120;   // px，浮漂落水后受惊判定半径（以群 center 为参考点）
const R_SCARE_SQ   = R_SCARE * R_SCARE;
// PHASE 21-1 D14 hotfix-2026-06-03d：受惊三段曲线（panic 乱窜 + escape 冲刺 + decay 衰减）
//   panic 期（0-PANIC_MS）：方向每 30-50ms 重 roll 一次，朝四面八方乱跳 → 慌乱真实感
//   escape 期（PANIC_MS-dashMs）：方向锁定"远离浮漂 + ±30° 扰动"，恒定高速冲出
//   decay 期（dashMs-fleeTimer 末）：速度按 easeOutCubic 衰减到 FLEE_DECAY_FLOOR
//   fleeTimer 到 → 切 returning 30px/s 朝群中心慢游回
// PHASE 21-1 D14 hotfix-2026-06-03e：
//   - panic 期延长到每条 100-150ms（独立 roll，加长"慌张"体感）
//   - dashMs / dashSpeed 拉大范围 → 每条逃离距离差异更明显
const FLEE_PANIC_MS_MIN     = 350;  // 慌乱乱窜阶段最短（每条独立，中位 400ms）
const FLEE_PANIC_MS_MAX     = 450;  // 慌乱乱窜阶段最长
const FLEE_PANIC_REROLL_MIN = 100;  // panic 期方向 reroll 最短间隔（hotfix-i：60→100）
const FLEE_PANIC_REROLL_MAX = 150;  // panic 期方向 reroll 最长间隔（hotfix-i：80→150）
// hotfix-h：每条 panic 期总换向次数上限（每条独立 roll 2-5 次）
//   达到上限后方向锁定不再变，玩家看到鱼"乱跳几下然后突然定住一瞬间，再切冲刺"
const FLEE_PANIC_REROLL_COUNT_MIN = 2;
const FLEE_PANIC_REROLL_COUNT_MAX = 5;
const FLEE_PANIC_SPEED_MIN  = 75;   // panic 期速度最小（hotfix-g 降一半 150→75）
const FLEE_PANIC_SPEED_MAX  = 110;  // panic 期速度最大（hotfix-g 降一半 220→110）
const FLEE_DASH_SPEED_MIN   = 50;   // escape 冲刺最小（hotfix-j 速度减半 100→50，逃距缩半）
const FLEE_DASH_SPEED_MAX   = 110;  // escape 冲刺最大（hotfix-j 速度减半 220→110）
const FLEE_DASH_MS_MIN      = 250;  // 冲刺最短
const FLEE_DASH_MS_MAX      = 900;  // 冲刺最长
const FLEE_DIR_JITTER_RAD   = Math.PI / 6; // escape 期 ±30° 扰动
const FLEE_DECAY_FLOOR      = 4;    // px/s 衰减期最低速（hotfix-j 减半 8→4）
const FLEE_MIN_MS  = 2500;  // 受惊总持续最短
const FLEE_MAX_MS  = 5000;  // 受惊总持续最长
const RETURN_SPEED = 30;    // px/s，回游速度（同 wander）
// PHASE 21-1 D14 hotfix-2026-06-03f：逃跑范围锁定屏幕下半部
//   canvas 720px 高，下半部 = y ≥ 360；flee 鱼 y 不允许 < FLEE_Y_MIN
const FLEE_Y_MIN = 360;
// hotfix-k：笨鱼豁免 —— 受惊瞬间每条 10% 概率不进 flee 态（保持 wander 继续游）
//   视觉：群里大多数鱼狂逃，偶尔有 1-2 条"呆呆"游过去看浮漂
const DUMB_FISH_IMMUNE_PROB = 0.10;

// ────────────────────────────────────────────────────────────
// PHASE 21-1 D14：BobberApproachFSM 前戏层参数（Q4/Q5 老板拍板）
// ────────────────────────────────────────────────────────────
const APPROACH_SPEED        = 45;     // px/s，approach 速度（wander 30 / flee 80 之间）
const SEARCH_DELAY_MIN_MS   = 1500;   // 派鱼延迟最短
const SEARCH_DELAY_MAX_MS   = 4000;   // 派鱼延迟最长
const APPROACH_REACHED_SQ   = 225;    // (15px)² 抵达浮漂阈值
// 咬钩类型概率（35/30/25/10）
const BITE_PROB = {
  nibble_lite: 0.35,
  nibble:      0.65,  // 累加：35 + 30
  bite:        0.90,  // 累加：35 + 30 + 25
  // 余下 → lucky
};
// 浮漂晃动帧表（dx 序列，dy 全 0；每帧 100ms）
//   按下列时长跑完帧表后切相应后续动作
const PRE_BITE_FRAMES = {
  nibble_lite: { dxs: [-2, 0, +2, 0], frameMs: 100 },                 // 400ms × 1 组
  nibble:      { dxs: [-3, 0, +3, 0, -3, 0, +3, 0],            frameMs: 100 }, // 800ms × 1 组
  bite:        { dxs: [-4, 0, +4, 0, -4, 0, +4, 0, -4, 0, +4, 0], frameMs: 100 }, // 1200ms 简化为 12 帧 100ms（spec 600/200ms × 3 等效）
  lucky:       { dxs: [0],                                     frameMs: 800 }, // 不晃，纯延迟 800ms 后切 sink
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

    // PHASE 21-1 D14：BobberApproachFSM —— 单浮漂前戏状态机
    //   phase: null='idle'（无浮漂） | 'searching' | 'approach' | 'biting'
    //   onBite/onLucky：fishing-scene 注入的回调，用于"真吃/黑漂"时切 BiteWindow
    //   onNibbleMiss：fishing-scene 注入，玩家试探/偷吃期误提竿时的空竿提示
    this.bobberFSM = this._newBobberFSM();
    this.onBite        = null;
    this.onLucky       = null;
    this.onNibbleMiss  = null;  // 'lite' | 'normal' | 'real'（试探/偷吃 / 真吃早提）
  }

  _newBobberFSM() {
    return {
      phase: null,
      searchTimer: 0,
      follower: null,      // {fish, group} 被派鱼引用
      biteType: null,      // 'nibble_lite' / 'nibble' / 'bite' / 'lucky'
      frameIdx: 0,
      frameTimer: 0,
      currentDx: 0,
      currentDy: 0,
      // 防 D5 接管后前戏仍在 tick 的兜底：fishing-scene 进 BiteWindow 时清
      handedOff: false,
    };
  }

  // ──────────────────────────────────────────────
  // 生命周期：init / update / render / dispose
  // ──────────────────────────────────────────────

  /**
   * 初始化三鱼群配置 + 刷鱼。
   * PHASE 21-1 D14：布局每局开场随机化（局内锁定）：
   *   - 3 群 / id 沿用 left/center/right（对外仅是 key）
   *   - fishCount 每群独立 randInt(3,8)
   *   - wanderArea.w randInt(140,240) / .h randInt(90,150)
   *   - centerX/Y 在 WATER_BOUNDS 内 randInt，群间 AABB 不交（GAP_X/Y 留白）
   *   - 最多 20 次重试；失败回退 FALLBACK_LAYOUT（旧 D1 三组）
   *   - 体型每条独立伯努利 roll（FISH_SIZE_DIST，与 fishCount 无关）
   *
   * @param {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}} params
   */
  init({ canvas, ctx }) {
    this.canvas = canvas;
    this.ctx = ctx;

    this.fishGroups = this._rollRandomLayout();

    for (const g of this.fishGroups) {
      for (let i = 0; i < g.fishCount; i++) {
        g.fishes.push(this._spawnFish(g, i));
      }
      // PHASE 21-1 D14：每条独立 roll 体型（无 fishCount 分档，无保底）
      this._rollFishSize(g);
    }
  }

  /**
   * PHASE 21-1 D14：roll 三群随机布局，群间 AABB 不交。
   * 失败 20 次回退 FALLBACK_LAYOUT，并 console.warn。
   * @returns {Array} 含 id/centerX/centerY/fishCount/fishes/wanderArea 的 3 群
   */
  _rollRandomLayout() {
    const ids = ['left', 'center', 'right'];
    const groups = [];
    for (let gi = 0; gi < 3; gi++) {
      let placed = null;
      for (let retry = 0; retry < LAYOUT_RETRY_MAX; retry++) {
        const fishCount = _randInt(3, 8);
        const w = _randInt(140, 240);
        const h = _randInt(90, 150);
        const halfW = w / 2;
        const halfH = h / 2;
        const cx = _randInt(WATER_BOUNDS.minX + halfW, WATER_BOUNDS.maxX - halfW);
        const cy = _randInt(WATER_BOUNDS.minY + halfH, WATER_BOUNDS.maxY - halfH);
        // 检查与已放置群是否相交
        let conflict = false;
        for (const o of groups) {
          const ohw = o.wanderArea.w / 2;
          const ohh = o.wanderArea.h / 2;
          if (
            Math.abs(cx - o.centerX) < (halfW + ohw + GROUP_GAP_X) &&
            Math.abs(cy - o.centerY) < (halfH + ohh + GROUP_GAP_Y)
          ) { conflict = true; break; }
        }
        if (!conflict) {
          placed = { id: ids[gi], centerX: cx, centerY: cy, fishCount, fishes: [], wanderArea: { w, h } };
          break;
        }
      }
      if (!placed) {
        console.warn('[FishGroup] random layout fallback');
        return FALLBACK_LAYOUT.map(g => ({ ...g, fishes: [], wanderArea: { ...g.wanderArea } }));
      }
      groups.push(placed);
    }
    return groups;
  }

  /**
   * 每帧驱动鱼群 AI。
   * PHASE 21-1 D14：state 分三段：
   *   - 'flee'      : 受惊期，按锁定向量逃窜，忽略 wanderArea 硬约束
   *   - 'returning' : flee 到时后切此态，朝群中央随机点回游，抵达后切 wander
   *   - 'wander'    : 默认游弋，沿用原 D1 逻辑
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
        // PHASE 21-1 D14：approach/biting 由 tickBobberApproach 独占控制位置/朝向，
        //   update(dt) 不能再走 wander 分支覆盖 targetX/Y，否则鱼飘回 wanderArea 永远不到浮漂
        if (f.state === 'approach' || f.state === 'biting') continue;

        // ────── 受惊态：三段曲线（panic 乱窜 + escape 冲刺 + decay 衰减） ──────
        if (f.state === 'flee') {
          f.fleeTimer -= dt;
          const elapsed = f.fleeTotalMs - f.fleeTimer;
          let speed;
          if (elapsed < f.fleePanicMs) {
            // ── panic 期：方向每 60-80ms 重 roll，朝四面八方乱跳 ──
            //   hotfix-h：每条最多 reroll 2-5 次，达上限后方向锁定不再变
            f.fleePanicRerollTimer -= dt;
            if (f.fleePanicRerollTimer <= 0 && f.fleePanicRerollCount < f.fleePanicRerollMax) {
              const ang = Math.random() * Math.PI * 2;
              f.fleeDirX = Math.cos(ang);
              f.fleeDirY = Math.sin(ang);
              f.fleePanicRerollTimer = FLEE_PANIC_REROLL_MIN + Math.random() * (FLEE_PANIC_REROLL_MAX - FLEE_PANIC_REROLL_MIN);
              f.fleePanicRerollCount++;
            }
            speed = FLEE_PANIC_SPEED_MIN + Math.random() * (FLEE_PANIC_SPEED_MAX - FLEE_PANIC_SPEED_MIN);
          } else if (elapsed < f.fleeDashMs) {
            // ── escape 期：方向切到锁定的"远离浮漂"，恒定冲速 ──
            f.fleeDirX = f.fleeEscDirX;
            f.fleeDirY = f.fleeEscDirY;
            speed = f.fleeDashSpeed;
          } else {
            // ── decay 期：方向保持 escape，速度指数衰减到 FLEE_DECAY_FLOOR ──
            f.fleeDirX = f.fleeEscDirX;
            f.fleeDirY = f.fleeEscDirY;
            const decayDur = Math.max(1, f.fleeTotalMs - f.fleeDashMs);
            const t = (elapsed - f.fleeDashMs) / decayDur; // 0→1
            const decay = Math.pow(1 - t, 3);
            speed = FLEE_DECAY_FLOOR + (f.fleeDashSpeed - FLEE_DECAY_FLOOR) * decay;
          }
          const vx = f.fleeDirX * speed;
          const vy = f.fleeDirY * speed;
          f.x += vx * dt / 1000;
          f.y += vy * dt / 1000;
          // PHASE 21-1 D14 hotfix-f：逃跑锁定屏幕下半部
          //   y 撞 FLEE_Y_MIN 上墙 → clamp + 翻转 Y 方向（撞墙反弹），保持 panic/escape 的速度
          if (f.y < FLEE_Y_MIN) {
            f.y = FLEE_Y_MIN;
            f.fleeDirY = Math.abs(f.fleeDirY); // 强制向下
            f.fleeEscDirY = Math.abs(f.fleeEscDirY);
          }
          f.vx = vx; f.vy = vy;
          if (f.fleeTimer <= 0) {
            // 切回游态：目标 = 群中央 ±wanderArea/2 随机
            f.state = 'returning';
            f.targetX = g.centerX + (Math.random() - 0.5) * g.wanderArea.w;
            f.targetY = g.centerY + (Math.random() - 0.5) * g.wanderArea.h;
            f.swimSpeed = RETURN_SPEED;
            f.turnCooldown = 800 + Math.random() * 1200;
          }
          continue;
        }

        // ────── wander / returning 共用 ──────
        f.turnCooldown -= dt;

        const dx0 = f.targetX - f.x;
        const dy0 = f.targetY - f.y;
        const reachedSq = dx0 * dx0 + dy0 * dy0;
        const reached = reachedSq < 100;

        if (f.state === 'returning' && reached) {
          // 回到群内 → 切 wander，下一帧由 _pickNewTarget 接管
          f.state = 'wander';
          this._pickNewTarget(f, g);
        } else if (f.state === 'wander' && (reached || f.turnCooldown <= 0)) {
          // wander 才频繁换 target；returning 锁定回群中心，禁止 _pickNewTarget 打断
          this._pickNewTarget(f, g);
        }

        const dx = f.targetX - f.x;
        const dy = f.targetY - f.y;
        const ang = Math.atan2(dy, dx);
        f.vx = Math.cos(ang) * f.swimSpeed;
        f.vy = Math.sin(ang) * f.swimSpeed;

        f.x += f.vx * dt / 1000;
        f.y += f.vy * dt / 1000;

        // 边界硬约束：仅 wander 触发（returning 鱼可能从屏外回游，
        //   若 clamp 会瞬移到 wanderArea 边缘，玩家会看到"突然出现一批新鱼"的诡异感）
        if (f.state === 'wander') {
          let bounced = false;
          if (f.x < minX) { f.x = minX; bounced = true; }
          else if (f.x > maxX) { f.x = maxX; bounced = true; }
          if (f.y < minY) { f.y = minY; bounced = true; }
          else if (f.y > maxY) { f.y = maxY; bounced = true; }
          if (bounced) this._pickNewTarget(f, g);
        }
      }
    }
  }

  /**
   * PHASE 21-1 D14：浮漂落水触发受惊扫描。
   * 对每群计算 dist(bobber → centerX/Y)，命中半径 R_SCARE 的整群全员进 flee。
   * 命中已 flee 群 → 刷新 fleeTimer + 重算方向（Q2 拍板：真实感优先）。
   * 由 fishing-scene._updateCasting() 在浮漂 commit 后调用。
   *
   * @param {number} bobX 浮漂屏幕 X
   * @param {number} bobY 浮漂屏幕 Y
   */
  applyScare(bobX, bobY) {
    if (!this.fishGroups) return;
    for (const g of this.fishGroups) {
      const ddx = bobX - g.centerX;
      const ddy = bobY - g.centerY;
      if (ddx * ddx + ddy * ddy > R_SCARE_SQ) continue;
      // 该群命中 → 全员进 flee（已 flee 也刷新）
      for (const f of g.fishes) {
        // hotfix-k：笨鱼豁免 —— 10% 概率不进 flee（保持当前态继续 wander/returning）
        //   对已 flee 的鱼也跳过，让 flee 中的笨鱼"反应过来"提前停止逃跑回 wander
        if (Math.random() < DUMB_FISH_IMMUNE_PROB) {
          if (f.state === 'flee') {
            f.state = 'wander';
            f.swimSpeed = 30;
            f.turnCooldown = 0; // 立即 _pickNewTarget
          }
          continue;
        }
        // PHASE 21-1 D14 hotfix-e：每条独立 panic/dash 时长，逃距差异化
        const panicMs   = FLEE_PANIC_MS_MIN + Math.random() * (FLEE_PANIC_MS_MAX - FLEE_PANIC_MS_MIN);
        const dashSpeed = FLEE_DASH_SPEED_MIN + Math.random() * (FLEE_DASH_SPEED_MAX - FLEE_DASH_SPEED_MIN);
        const dashMsExtra = FLEE_DASH_MS_MIN + Math.random() * (FLEE_DASH_MS_MAX - FLEE_DASH_MS_MIN);
        const dashMs    = panicMs + dashMsExtra; // dashMs = panic 段 + escape 段总时长
        const totalMs   = FLEE_MIN_MS + Math.random() * (FLEE_MAX_MS - FLEE_MIN_MS);
        f.fleePanicMs = panicMs;
        // hotfix-h：每条独立的 reroll 次数上限（2-5），达到后方向锁定
        f.fleePanicRerollMax = FLEE_PANIC_REROLL_COUNT_MIN +
          Math.floor(Math.random() * (FLEE_PANIC_REROLL_COUNT_MAX - FLEE_PANIC_REROLL_COUNT_MIN + 1));
        f.fleePanicRerollCount = 1; // 已 roll 一次（第一次初始化方向算 1 次）
        // 锁定 escape 期方向：远离浮漂 + ±30° 扰动
        let dx = f.x - bobX;
        let dy = f.y - bobY;
        const escAng = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * FLEE_DIR_JITTER_RAD;
        f.fleeEscDirX = Math.cos(escAng);
        f.fleeEscDirY = Math.sin(escAng);
        // panic 期方向第一次 roll（朝四面八方乱跳，与浮漂方向无关）
        const panicAng0 = Math.random() * Math.PI * 2;
        f.fleeDirX = Math.cos(panicAng0);
        f.fleeDirY = Math.sin(panicAng0);
        f.fleePanicRerollTimer = FLEE_PANIC_REROLL_MIN + Math.random() * (FLEE_PANIC_REROLL_MAX - FLEE_PANIC_REROLL_MIN);
        f.fleeDashSpeed = dashSpeed;
        f.fleeDashMs = dashMs;
        f.fleeTotalMs = totalMs;
        f.fleeTimer = totalMs;
        // 兼容旧字段（render 朝向用）
        const panicSpeed0 = FLEE_PANIC_SPEED_MIN + Math.random() * (FLEE_PANIC_SPEED_MAX - FLEE_PANIC_SPEED_MIN);
        f.fleeVx = f.fleeDirX * panicSpeed0;
        f.fleeVy = f.fleeDirY * panicSpeed0;
        f.state = 'flee';
        f.swimSpeed = panicSpeed0;
      }
    }
    // 受惊瞬间复位前戏 FSM（spec §3.3：approach 被受惊覆盖时整个前戏中断重启）
    if (this.bobberFSM.follower && this.bobberFSM.follower.fish.state === 'flee') {
      this.resetBobberApproach();
    }
  }

  // ────────────────────────────────────────────────
  // PHASE 21-1 D14：BobberApproachFSM —— 前戏四态
  //   由 fishing-scene._updateWaiting 每帧调 tickBobberApproach
  //   由 fishing-scene._renderRodAndBob 每帧取 getBobberPreBiteOffset
  //   由 fishing-scene._startBite / _resetToIdle / _resetToWaiting 调 resetBobberApproach
  // ────────────────────────────────────────────────

  /**
   * 每帧推进前戏 FSM（fishing-scene._updateWaiting 内调用）。
   * @param {number} dt    秒（注意：与 update(dt) 的 ms 不一致 —— 由 fishing-scene 的 _update 使用秒）
   * @param {number} bobX  浮漂屏幕 X
   * @param {number} bobY  浮漂屏幕 Y
   */
  tickBobberApproach(dt, bobX, bobY) {
    if (this.bobberFSM.handedOff) return;
    const dtMs = dt * 1000;
    const s = this.bobberFSM;

    // ── 状态 0：idle → searching（仅在没有跑过本浮漂时进入 searching） ──
    if (s.phase === null) {
      s.phase = 'searching';
      s.searchTimer = SEARCH_DELAY_MIN_MS + Math.random() * (SEARCH_DELAY_MAX_MS - SEARCH_DELAY_MIN_MS);
      return;
    }

    // ── 状态 1：searching → approach ──
    if (s.phase === 'searching') {
      s.searchTimer -= dtMs;
      if (s.searchTimer > 0) return;
      // 选离浮漂最近、非 flee/returning 态的群里 1 条 wander 鱼
      const pick = this._selectBobberFollower(bobX, bobY);
      if (!pick) {
        // 全场无可派鱼 → 重新等
        s.searchTimer = SEARCH_DELAY_MIN_MS + Math.random() * (SEARCH_DELAY_MAX_MS - SEARCH_DELAY_MIN_MS);
        return;
      }
      s.follower = pick;
      pick.fish.state = 'approach';
      pick.fish.targetX = bobX;
      pick.fish.targetY = bobY;
      pick.fish.swimSpeed = APPROACH_SPEED;
      s.phase = 'approach';
      return;
    }

    // ── 状态 2：approach → biting ──
    if (s.phase === 'approach') {
      const fish = s.follower && s.follower.fish;
      if (!fish || fish.state !== 'approach') {
        // 被受惊打断 / 异常 → 重启前戏
        this.resetBobberApproach();
        return;
      }
      // 鱼朝浮漂移动（这里不走 update(dt) 的 wander 逻辑，自己控制）
      const dx = bobX - fish.x;
      const dy = bobY - fish.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < APPROACH_REACHED_SQ) {
        // 抵达 → 切 biting + roll 咬钩类型
        fish.state = 'biting';
        s.biteType = this._rollBiteType();
        s.frameIdx = 0;
        s.frameTimer = 0;
        s.phase = 'biting';
        return;
      }
      const len = Math.sqrt(distSq) || 1;
      const vx = (dx / len) * APPROACH_SPEED;
      const vy = (dy / len) * APPROACH_SPEED;
      fish.vx = vx; fish.vy = vy;
      fish.x += vx * dt;  // dt 是秒
      fish.y += vy * dt;
      return;
    }

    // ── 状态 3：biting → 结束（交棒 D5 / 标记结束） ──
    if (s.phase === 'biting') {
      const cfg = PRE_BITE_FRAMES[s.biteType];
      s.frameTimer += dtMs;
      if (s.frameTimer >= cfg.frameMs) {
        s.frameTimer -= cfg.frameMs;
        s.frameIdx++;
      }
      if (s.frameIdx < cfg.dxs.length) {
        s.currentDx = cfg.dxs[s.frameIdx] || 0;
        s.currentDy = 0;
      } else {
        // 帧表跑完 → 切相应后续
        s.handedOff = true;
        s.currentDx = 0; s.currentDy = 0;
        const bt = s.biteType;
        // 派出去的鱼回 wander（避免一直锁在 biting）
        if (s.follower && s.follower.fish) {
          s.follower.fish.state = 'wander';
          s.follower.fish.swimSpeed = 30;
        }
        if (bt === 'bite') {
          if (this.onBite) this.onBite();
        } else if (bt === 'lucky') {
          if (this.onLucky) this.onLucky();
        } else {
          // 试探/偷吃：未交棒，玩家可能没提竿 → 重启前戏（再派一次）
          s.handedOff = false;
          this.resetBobberApproach();
        }
      }
    }
  }

  /** 前戏层产出的浮漂偏移（由 fishing-scene._renderRodAndBob 在 Waiting 期叠加） */
  getBobberPreBiteOffset() {
    return { dx: this.bobberFSM.currentDx | 0, dy: this.bobberFSM.currentDy | 0 };
  }

  /**
   * hotfix-z（2026-06-04 修订）：取出"当前正在上钩的鱼"引用（不删除，仅返回）
   *   时机：fishing-scene._startBite 进 BiteWindow 之前，趁 follower 还在拿到引用
   *   调用方负责保管引用，战斗胜利后调 removeFishFromGroup() 真正删除
   *   返回：{fish, group} 或 null
   */
  takeHookedFishRef() {
    const f = this.bobberFSM.follower;
    if (f && f.fish && f.group) {
      return { fish: f.fish, group: f.group };
    }
    return null;
  }

  /**
   * hotfix-z：根据 takeHookedFishRef() 返回的引用，把鱼从所在群里彻底删掉
   *   - group.fishes 数组 splice
   *   - group.fishCount 同步 -1（HUD 浮窗密度文案用）
   *   - 兜底：若鱼已飘到别群（受惊态），扫所有群按引用查找
   */
  removeFishFromGroup(ref) {
    if (!ref || !ref.fish) return false;
    const tryRemove = (g) => {
      if (!g || !Array.isArray(g.fishes)) return false;
      const idx = g.fishes.indexOf(ref.fish);
      if (idx < 0) return false;
      g.fishes.splice(idx, 1);
      if (typeof g.fishCount === 'number') {
        g.fishCount = Math.max(0, g.fishCount - 1);
      }
      return true;
    };
    if (tryRemove(ref.group)) return true;
    // 兜底：扫所有群
    for (const g of (this.fishGroups || [])) {
      if (tryRemove(g)) return true;
    }
    return false;
  }

  /** 玩家在试探/偷吃/真吃晃动期按提竿键 —— 由 fishing-scene 决定罚则后调本方法重置 */
  resetBobberApproach() {
    // 派出去的鱼放回 wander（如果还在 approach/biting）
    if (this.bobberFSM.follower && this.bobberFSM.follower.fish) {
      const fish = this.bobberFSM.follower.fish;
      if (fish.state === 'approach' || fish.state === 'biting') {
        fish.state = 'wander';
        fish.swimSpeed = 30;
      }
    }
    this.bobberFSM = this._newBobberFSM();
  }

  /** 当前是否正在 biting 阶段（fishing-scene 提竿判断罚则用） */
  getCurrentBitePhase() {
    return {
      phase: this.bobberFSM.phase,
      biteType: this.bobberFSM.biteType,
      handedOff: this.bobberFSM.handedOff,
    };
  }

  // ── 内部辅助 ──
  _selectBobberFollower(bobX, bobY) {
    let best = null;
    let bestDist = Infinity;
    for (const g of this.fishGroups) {
      const dx = bobX - g.centerX;
      const dy = bobY - g.centerY;
      const d = dx * dx + dy * dy;
      // 跳过整群处于 flee/returning（spec §2.4/§3.6：受惊群不派鱼）
      const groupAvailable = g.fishes.some(f => f.state === 'wander');
      if (!groupAvailable) continue;
      if (d < bestDist) { best = g; bestDist = d; }
    }
    if (!best) return null;
    // 从该群里随便挑 1 条 wander 鱼
    const wanderFishes = best.fishes.filter(f => f.state === 'wander');
    if (wanderFishes.length === 0) return null;
    const fish = wanderFishes[Math.floor(Math.random() * wanderFishes.length)];
    return { fish, group: best };
  }

  _rollBiteType() {
    const r = Math.random();
    if (r < BITE_PROB.nibble_lite) return 'nibble_lite';
    if (r < BITE_PROB.nibble)      return 'nibble';
    if (r < BITE_PROB.bite)        return 'bite';
    return 'lucky';
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
    // PHASE 21-1 D14：清理前戏 FSM
    this.bobberFSM = this._newBobberFSM();
    this.onBite = null;
    this.onLucky = null;
    this.onNibbleMiss = null;
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
      // D1 默认占位 'small'；D14 _rollFishSize 会覆盖
      size: 'small',
      // 初始 target = 当前位置 → 第一帧 turnCooldown<=0 → 立即触发 _pickNewTarget
      targetX: x, targetY: y,
      turnCooldown: 0,
      swimSpeed: 30,
      // PHASE 21-1 D14：'wander' / 'flee' / 'returning' / 'approach' / 'biting'
      //   D14 commit 3 实装 wander/flee/returning；commit 4 加 approach/biting
      state: 'wander',
      // 受惊态字段（state==='flee' 时使用，其它态为 0）
      fleeTimer: 0,
      fleeVx: 0,
      fleeVy: 0,
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
   * PHASE 21-1 D14：每条鱼独立伯努利累加抽样体型，与 fishCount 解耦。
   *   - 全局表 FISH_SIZE_DIST = {small:.50, medium:.35, large:.15}
   *   - 不再按 fishCount 分档；不再有"稀疏档保底 1 large"
   *   - 大鱼"承诺"由 D11 大鱼层兜底
   *   - 只在 init() 时调用一次，update / 抛竿不重 roll，整局锁定
   */
  _rollFishSize(group) {
    for (const f of group.fishes) {
      const r = Math.random();
      if (r < FISH_SIZE_DIST.small) f.size = 'small';
      else if (r < FISH_SIZE_DIST.small + FISH_SIZE_DIST.medium) f.size = 'medium';
      else f.size = 'large';
    }
  }
}
