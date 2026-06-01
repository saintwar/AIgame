# PHASE 21-1 D5 「鱼咬钩反馈系统」实施指令书（给 CodeBuddy）

> **版本**：v1.0 / 2026-06-01
> **作者**：主程
> **审签**：Nina（最终 grep 自检后转发）
> **路线**：全程序化 Canvas 绘制，0 张 AI 生图
> **权威源**：
> - 视觉规范：`AIgame/docs/PHASE-21-1-D5-art-spec.md`（v1.2，主美）
> - 玩法稿：`AIgame/docs/PHASE-21-1-D5-design.md`（v1.0，主策划）
> - 浮漂代码：`AIgame/js/fishing-scene.js: _drawPixelBob`（第 2574 行起）
> - 范式参考：`AIgame/js/render/aming-fish-sprite.js`（ES module + export function）
>
> **铁律**：本指令书引用的所有"已存在的资产/方法"已用 grep 核过；如你（CodeBuddy）发现任何不一致，**先停下报 Nina，禁止猜测对齐**。

---

## 0. 一句话目标

把 D5「鱼咬钩反馈系统」落到 `fishing-scene.js` 的 `BiteWindow` 状态上：**三档抖动 + 三档 PERFECT 字 + 放大镜染色 + 漏提演出 + 四叶草微光 + 猛档水花 + 镜头微震**，全部走程序化 Canvas，**不出 PNG，不引入 AI 生图**。

---

## 1. 工程现状核查（已 grep，CodeBuddy 接手前自检）

| 项 | 真实位置 / 值 | 用途 |
|---|---|---|
| `_render()` 方法 | `js/fishing-scene.js:1488` | D5 渲染挂载点 |
| `_render()` 调用点 | `js/fishing-scene.js:647` | 主循环 |
| `_update(dt)` | `js/fishing-scene.js:651` | D5 时间驱动入口 |
| `_updateBiteWindow(dt)` | `js/fishing-scene.js:1032` | 三档窗口/三段判定改造点 |
| `_renderBiteAlert()` | `js/fishing-scene.js:2899` | **将被新版反馈层替换/收编**（见 §6） |
| `_drawPixelBob(cx, cy, clipBottom)` | `js/fishing-scene.js:2574` | 浮漂程序化绘制（**只读，禁改本体**） |
| `_drawPixelBob` 调用点 | `2048 / 2129 / 2133` | 三处都要在调用前应用抖动偏移 |
| `ParticleSystem` | `js/fishing-scene.js:117-128`，实例 `this.particles`（200 行） | 猛档水花复用（见 §7） |
| `CONFIG.biteWindow.duration` | `js/fishing-scene.js:40`，当前为 `2.0` | **D5 改为三档动态值**（见 §3） |
| 状态机进入 BiteWindow | `js/fishing-scene.js:1022` `this.fsm.transition('BiteWindow', 'fish bite complete')` | `onBiteStart` 钩子注入点 |
| 模块系统 | ES module（main.js `import FishingScene from './fishing-scene.js'`） | 新模块用 `export function` |
| 项目字体（已注册） | `'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif`（index.html @font-face + woff2） | **见 §2 字体策略** |
| 版本号约定 | main.js `?v=20260601n` 开始；新增 `?v=20260601a` | ES module bump |
| 部署脚本 | `scripts/deploy.sh` 自动 bump | 上线时自动 |

**CodeBuddy 开工自检命令（先跑一遍，结果不一致则停下）**：

```bash
# 1. 接入点行号未漂移
grep -n "_render() {" AIgame/js/fishing-scene.js | head -1     # 期望 1488
grep -n "_update(dt) {" AIgame/js/fishing-scene.js | head -1   # 期望 651
grep -n "_updateBiteWindow(dt) {" AIgame/js/fishing-scene.js   # 期望 1032
grep -n "_drawPixelBob(cx, cy, clipBottom" AIgame/js/fishing-scene.js  # 期望 2574

# 2. 三处 _drawPixelBob 调用点
grep -n "this._drawPixelBob(" AIgame/js/fishing-scene.js       # 期望 2048/2129/2133

# 3. 现有粒子系统
grep -n "class ParticleSystem" AIgame/js/fishing-scene.js      # 期望 119
grep -n "this.particles = new ParticleSystem" AIgame/js/fishing-scene.js  # 期望 200

# 4. 12 色调色板（v3.0 已就位）
grep -n "#1A1A2E\|#FFF8C8\|#E63946\|#FFD43B\|#FFF4D6\|#C8B89A" AIgame/js/fishing-scene.js | head -10

# 5. 状态机 BiteWindow 进入点
grep -n "transition('BiteWindow'" AIgame/js/fishing-scene.js   # 期望 1022
```

**任意一项不匹配，立即停手报 Nina。**

---

## 2. 模块拆分与文件命名（项目范式收口）

> **范式冲突说明**：art-spec v1.2 §8.3 给出的路径 `fishing/fx/<Name>Renderer.js` 是建议路径；项目实际范式是 `js/render/<功能>.js`（参考 `aming-fish-sprite.js`）。本指令书最终落地路径**遵循项目范式**，新建子目录 `js/render/d5/`，内部模块名沿用 art-spec 的 `Renderer.js` 后缀以保持与规范文档可追溯。

### 2.1 文件清单（共 7 个新增模块 + 2 个文件改造）

| # | 路径 | 导出 | 说明 |
|---|---|---|---|
| M0 | `AIgame/js/render/d5/d5-palette.js` | `export const D5_COLORS` / `D5_FONT_STACK` | 色板 + 字体常量统一引入点（防散落） |
| M1 | `AIgame/js/render/d5/bite-shake-frame.js` | `export const BiteShakeFrame` | §3.4 三档抖动偏移帧表（`sample(level, frameIdx) → {dx, dy}`） |
| M2 | `AIgame/js/render/d5/perfect-text-renderer.js` | `export function drawPerfectText(ctx, x, y, tier, t)` | §5 三档 PERFECT 字 |
| M3 | `AIgame/js/render/d5/miss-text-renderer.js` | `export function drawMissText(ctx, x, y, t)` | §6 「可惜……」 |
| M4 | `AIgame/js/render/d5/magnifier-tint-renderer.js` | `export function drawMagnifierTint(ctx, rect, mode, t)` | §7 猛档泛红 + LATE 呼吸（mode='heavy'/'late'） |
| M5 | `AIgame/js/render/d5/clover-glow-renderer.js` | `export function drawCloverGlow(ctx, x, y, t)` | §8 四叶草 7×7 微光 |
| M6 | `AIgame/js/render/d5/splash-particle-fx.js` | `export function emitHeavySplash(particles, x, y)` | §9 猛档水花（**复用 `this.particles`**） |
| M7 | `AIgame/js/render/d5/d5-bite-feedback.js` | `export class D5BiteFeedback` | **总入口控制器**——`update(dt)` / `render(ctx)` / `onBiteStart(level)` / `onLateMiss()` / `onPerfectHit(tier)` 等 |
| C1 | `AIgame/js/fishing-scene.js`（改造） | — | §3-§4 状态机改造、`_drawPixelBob` 调用前接抖动偏移、`_renderBiteAlert` 收编为 D5BiteFeedback 子项 |
| C2 | `AIgame/js/main.js`（仅版本号 bump） | — | 主入口 `?v=20260601a`（如 import 链路上有需要的话） |

> **不做**：不新增 `fishing/fx/` 目录、不在 art-spec 推荐路径以外建模块、不改 `_drawPixelBob` 本体、不改 `ParticleSystem` 类。

### 2.2 调色板常量（M0 内容）

```js
// js/render/d5/d5-palette.js
export const D5_COLORS = {
  // v3.0 浮漂同源 9 色（与 fishing-scene._drawPixelBob 内字面量逐字对齐）
  OUT:     '#1A1A2E',
  GLOW:    '#FFF8C8',
  GLOW_HI: '#FFFFFF',
  RED:     '#E63946',
  RED_DK:  '#B11D2C',
  YEL:     '#FFD43B',
  YEL_DK:  '#D4A41A',
  WHT:     '#FFF4D6',
  WHT_DK:  '#C8B89A',
  // D5 反馈层 3 色
  LATE:        '#E8553D', // LATE 警示橙红
  PERFECT_HI:  '#FFEEB0', // PERFECT 高光金
  CLOVER:      '#7AC862', // 四叶草明亮草绿
  // 既有警示红（猛档边框泛红，复用 v3.0 既有用法）
  WARN:        '#C8412B',
  // 四叶草专用高光（用途收窄，art-spec §0.2/§6.1）
  CLOVER_HI:   '#F4E4BC',
};

// 项目实际可用字体栈（index.html 已注册 TencentSansW7 woff2）
// art-spec §5.0 推荐的 'Fusion Pixel 12px','Zpix','Cubic 11','Press Start 2P'
// 项目内未注册，作为前置 fallback 写入字符串中，浏览器找不到时自动回落。
export const D5_FONT_STACK =
  `'Fusion Pixel 12px','Zpix','Cubic 11','Press Start 2P',` +
  `'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif`;
```

> **字体策略说明**（已征询主美口径，工程视角补充）：项目内只注册了 `TencentSansW7`，art-spec §5.0 列出的像素字体未入库。落地策略**保留 art-spec 的像素字体名作为前置 fallback**（未来若主美引入字体即生效），并把 `TencentSansW7` 作为兜底主字体。**若 PERFECT 字"稳/妙/完美"在 TencentSansW7 下视觉偏圆润不够像素感，提交录屏时 Nina 会与主美确认是否需要后续再补字体——本仗不卡此事**。

---

## 3. 三档窗口 / 三段判定 / 抖动偏移（核心改造）

### 3.1 三档总长（**取自 design.md §4.1**）

| 档位 | 总长 ms | PERFECT (ms) | GOOD (ms) | LATE (ms) |
|---|---|---|---|---|
| 🟢 light | 1200 | 0~500 | 500~900 | 900~1200 |
| 🟡 medium | 1000 | 0~350 | 350~750 | 750~1000 |
| 🔴 heavy | 800 | 0~250 | 250~600 | 600~800 |

**改造 `CONFIG.biteWindow`**（`fishing-scene.js:40`）：

```js
biteWindow: {
  duration: 2.0,          // 保留为 fallback（未指定档位时用旧值，避免回归）
  windows: {
    light:  { total: 1.200, perfect: [0, 0.500], good: [0.500, 0.900], late: [0.900, 1.200] },
    medium: { total: 1.000, perfect: [0, 0.350], good: [0.350, 0.750], late: [0.750, 1.000] },
    heavy:  { total: 0.800, perfect: [0, 0.250], good: [0.250, 0.600], late: [0.600, 0.800] },
  },
},
```

### 3.2 状态机改造（`_updateBiteWindow` 1032 行）

**当前实现**（只算总倒计时 + 空格/点击立即提竿）→ 改造为：

1. 进入 BiteWindow 瞬间（`fsm.transition('BiteWindow'...)` 后）：
   - 根据本次咬钩档位 `level` 抽样：`this.biteLevel = D5BiteFeedback.dispatchLevel(fishGroupRef)`（玩法稿 §3 主映射 + 越档 30%，**实现见 §4**）
   - `this.biteWindowTimer = CONFIG.biteWindow.windows[level].total * windowMul`（杆系数沿用）
   - `this.biteWindowElapsed = 0`
   - 通知 D5：`this.d5.onBiteStart(level, fishGroupRef)`
2. 每帧 `dt`：
   - `this.biteWindowElapsed += dt; this.biteWindowTimer -= dt`
   - 根据 `biteWindowElapsed` 落入哪段，更新 `this.biteZone ∈ {'perfect','good','late'}`
   - `late` 段进入瞬间触发 `this.d5.onLateZoneEnter()`（启动放大镜呼吸）
3. 玩家提竿（`space` / `_confirmClick`）：
   - 根据 `biteZone` 决定结果：`PERFECT` / `GOOD` / `LATE`
   - LATE 段额外抽 50/30/20（见 design §5.2）
   - PERFECT 时通知 `this.d5.onPerfectHit(level)` 启动字渲染（**字会 boostover Reeling 状态**，因为 PERFECT 字在 D6 搏斗开始后还会停留 600~800ms）
   - 调用既有 `this._startReeling()`（GOOD/LATE 成功）或脱钩演出（LATE 失败）
4. 窗口超时（`biteWindowTimer <= 0`）：
   - `this.d5.onLateMiss(level)`（启动「可惜……」+ 涟漪 + 鱼影远离）
   - 状态机进入 `Failed`（保留 `failedReason='timeout'`），等漏提演出 800ms 自然回 `Waiting`（演出由 D5 内部计时，不阻塞状态机）

> **D6 接口契约**（design.md §8.1）：`HOOK_JUDGED` 事件在 `_startReeling` 内 emit，载荷 `{judgement, initialTension, hpModifier, fishPullCoef, fishGroupRef, biteLevel, isLuckyBail}`。**本仗仅落 PERFECT/GOOD/LATE 三个值**，搏斗系统具体消费方式仍在 D6（不在本仗范围）。

### 3.3 BiteLevelDispatcher（档位调度）

放在 `D5BiteFeedback` 类内静态方法 `dispatchLevel(fishGroupRef)`：

```js
// 主映射 70% + 越档 30%（design §3.1 / §3.2）
const MAIN_MAP = {
  small_school:    [['light', 0.70], ['medium', 0.25], ['heavy', 0.05]],
  medium_school:   [['light', 0.20], ['medium', 0.70], ['heavy', 0.10]],
  rare_big_school: [['light', 0.05], ['medium', 0.25], ['heavy', 0.70]],
};
```

`fishGroupRef` 字段名以 D1 `FishGroupSystem` 实际为准（**接入前 grep `class FishGroupSystem`，对齐它给出的鱼群类型字段**），找不到时 fallback 全 'light'。

### 3.4 抖动偏移帧表（**取自 art-spec v1.2 §1.3**，逐字落码）

```js
// js/render/d5/bite-shake-frame.js
export const BiteShakeFrame = {
  // 12fps，整数像素，已含外层 ctx.scale(0.8) 补偿（即数值就是屏幕像素）
  TABLES: {
    light:  [[0,0],[0,2],[0,1],[0,0],[0,3],[0,2],[0,1],[0,1]],
    medium: [[0,0],[0,4],[0,1],[0,5],[0,2],[0,2],[0,2],[1,6],[0,4],[0,5]],
    heavy:  [[0,0],[-3,5],[-5,10],[4,12],[-2,12],[0,12]],
  },
  // 持续态：light/medium 循环回帧 0；heavy 保持帧 5（[0,12]）+ 1Hz 横向 ±2px 微抖
  sample(level, frameIdx) {
    const tbl = this.TABLES[level] || this.TABLES.light;
    if (level === 'heavy' && frameIdx >= tbl.length) {
      // 持续态：保持最后帧 + 1Hz 横向 ±2px（用 elapsed s 算，外部传 frameIdx 即可换算）
      const phase = Math.floor((frameIdx - tbl.length) / 6) % 2; // 6 帧 = 0.5s 半周期
      return { dx: tbl[tbl.length - 1][0] + (phase ? 2 : -2), dy: tbl[tbl.length - 1][1] };
    }
    const [dx, dy] = tbl[frameIdx % tbl.length];
    return { dx, dy };
  },
};
```

> **数值红线**：以上数组**逐字来自 art-spec v1.2 §1.3**。CodeBuddy 不要"优化对称"或"加亚像素插值"，整数即整数。

### 3.5 接入 `_drawPixelBob`（三处调用点 2048/2129/2133）

> **铁律**：`_drawPixelBob` 函数本体禁改（art-spec §1.4）。只改调用前一行。

伪改造（以 2048 行 `this._drawPixelBob(bobX, bobY)` 为例）：

```js
// 原：this._drawPixelBob(bobX, bobY);
// 改：
let dx = 0, dy = 0;
if (this.fsm.is('BiteWindow') && this.d5) {
  ({ dx, dy } = this.d5.getBobOffset()); // 内部维护 frameIdx，按 12fps 推进
}
this._drawPixelBob(bobX + dx, bobY + dy);
```

`d5.getBobOffset()` 内部：用 `this.biteWindowElapsed * 12` 算 `frameIdx`，调 `BiteShakeFrame.sample(this.biteLevel, frameIdx)`。**模块未加载/未启动时返回 `{dx:0, dy:0}`**（降级保底，art-spec §1.4 红线）。

> 2129 / 2133 两处是落水/未落水分支，同样套上面的偏移逻辑（同一份 `dx/dy`，clipBottom 参数保持原状）。

---

## 4. D5BiteFeedback 总入口（M7）

`js/render/d5/d5-bite-feedback.js`：

```js
import { D5_COLORS, D5_FONT_STACK } from './d5-palette.js';
import { BiteShakeFrame } from './bite-shake-frame.js';
import { drawPerfectText } from './perfect-text-renderer.js';
import { drawMissText } from './miss-text-renderer.js';
import { drawMagnifierTint } from './magnifier-tint-renderer.js';
import { drawCloverGlow } from './clover-glow-renderer.js';
import { emitHeavySplash } from './splash-particle-fx.js';

export class D5BiteFeedback {
  constructor(scene) {
    this.scene = scene;            // FishingScene 反向引用（取 ctx / particles / cw / ch / bobX / bobY）
    this.biteLevel = null;
    this.biteWindowElapsed = 0;
    this.biteZone = null;
    // 演出层独立计时（不依赖状态机，可跨 BiteWindow→Failed/Reeling 续演）
    this.fx = {
      magnifierTint: null,         // {mode:'heavy'|'late', startMs, endMs|null}
      perfectText:   null,         // {tier, startMs, x, y}
      missText:      null,         // {startMs, x, y}
      cloverGlow:    null,         // {startMs, x, y}
      cameraShake:   null,         // {startMs, durMs:60}
    };
    this._frameTime = 0;           // 累计 ms（与 dt 同步）
  }

  // ── D5 事件 API ─────────────
  onBiteStart(level, fishGroupRef) {
    this.biteLevel = level;
    this.biteWindowElapsed = 0;
    this.biteZone = 'perfect';
    if (level === 'heavy') {
      this.fx.magnifierTint = { mode: 'heavy', startMs: this._frameTime, endMs: this._frameTime + 580 };
      this.fx.cameraShake   = { startMs: this._frameTime, durMs: 60 };
      emitHeavySplash(this.scene.particles, this.scene.bobX, this.scene.bobY);
    }
    if (this._isLuckyBail(fishGroupRef)) {
      // 保底：四叶草 0.5s，咬钩前 0.5s 已由 dispatcher 安排（这里同帧触发即可，玩家可见 0.3s 重叠）
      this.fx.cloverGlow = { startMs: this._frameTime, x: this.scene.bobX, y: this.scene.bobY - 14 };
    }
  }
  onLateZoneEnter() {
    if (this.fx.magnifierTint?.mode === 'heavy') return; // 猛档优先（art-spec §7）
    this.fx.magnifierTint = { mode: 'late', startMs: this._frameTime, endMs: null };
  }
  onPerfectHit(tier) {
    this.fx.perfectText = { tier, startMs: this._frameTime, x: this.scene.bobX, y: this.scene.bobY - 30 };
    if (this.fx.magnifierTint?.mode === 'late') this.fx.magnifierTint = null; // 提竿即停
  }
  onLateMiss() {
    this.fx.missText = { startMs: this._frameTime, x: this.scene.bobX, y: this.scene.bobY + 18 };
    this.fx.magnifierTint = null;
    // 涟漪复用：触发一次"500ms 加速版"——见 §10
  }
  onLineUp() { this.fx.magnifierTint = null; } // 成功提竿，停 LATE 呼吸

  // ── 主循环 ─────────────
  update(dt) {
    this._frameTime += dt * 1000;
    if (this.scene.fsm.is('BiteWindow')) {
      this.biteWindowElapsed += dt;
      this._updateZone();
    }
    this._reapExpired();
  }
  render(ctx) {
    // Z-order：浮漂下方涟漪（既有）→ 浮漂本体（既有）→ 染色蒙版（multiply）→ PERFECT/可惜/四叶草（最上层）
    // 本方法在 _renderBiteAlert 位置调用，之后场景层不再画反馈
    if (this.fx.magnifierTint) drawMagnifierTint(ctx, this._magRect(), this.fx.magnifierTint.mode, this._frameTime - this.fx.magnifierTint.startMs);
    if (this.fx.cloverGlow)    drawCloverGlow(ctx, this.fx.cloverGlow.x, this.fx.cloverGlow.y, this._frameTime - this.fx.cloverGlow.startMs);
    if (this.fx.perfectText)   drawPerfectText(ctx, this.fx.perfectText.x, this.fx.perfectText.y, this.fx.perfectText.tier, this._frameTime - this.fx.perfectText.startMs);
    if (this.fx.missText)      drawMissText(ctx, this.fx.missText.x, this.fx.missText.y, this._frameTime - this.fx.missText.startMs);
  }
  // ── 浮漂偏移查询（_drawPixelBob 三处调用前调用） ─────────────
  getBobOffset() {
    if (!this.biteLevel || !this.scene.fsm.is('BiteWindow')) return { dx: 0, dy: 0 };
    const frameIdx = Math.floor(this.biteWindowElapsed * 12);
    return BiteShakeFrame.sample(this.biteLevel, frameIdx);
  }
  // ── 镜头微震（在 _render 顶层调用一次，translate 整个画布） ─────────────
  applyCameraShake(ctx) {
    if (!this.fx.cameraShake) return;
    const t = this._frameTime - this.fx.cameraShake.startMs;
    if (t > this.fx.cameraShake.durMs) { this.fx.cameraShake = null; return; }
    // art-spec §3：每 10ms 在 [-2, +2] 随机 (Δx, Δy)，整数
    const dx = Math.round((Math.random() * 4 - 2));
    const dy = Math.round((Math.random() * 4 - 2));
    ctx.translate(dx, dy);
  }

  // ── 内部 ─────────────
  _updateZone() {
    const w = (this.scene.constructor.CONFIG || /* CONFIG */).biteWindow.windows[this.biteLevel];
    const t = this.biteWindowElapsed;
    const prev = this.biteZone;
    if (t < w.perfect[1]) this.biteZone = 'perfect';
    else if (t < w.good[1]) this.biteZone = 'good';
    else this.biteZone = 'late';
    if (prev !== 'late' && this.biteZone === 'late') this.onLateZoneEnter();
  }
  _magRect() {
    // 放大镜矩形：以浮漂为中心 ±60×80（CodeBuddy 接入时按 fishing-scene 既有放大镜实际矩形对齐）
    const cx = Math.floor(this.scene.bobX), cy = Math.floor(this.scene.bobY - 20);
    return { x: cx - 60, y: cy - 40, w: 120, h: 80 };
  }
  _reapExpired() { /* 按各 fx 的 endMs 清理 */ }
  _isLuckyBail(fg) { return !!fg?.isLuckyBail; }
}
```

> **集成点**：
> - `FishingScene.constructor`（200 行附近）`this.particles = new ParticleSystem();` 后追加 `this.d5 = new D5BiteFeedback(this);`
> - `_update(dt)` 651 行，在 `this.particles.update(dt);` 旁追加 `this.d5.update(dt);`
> - `_render()` 1488 行，进入 else 分支前先 `ctx.save(); this.d5.applyCameraShake(ctx);`，渲染管线末尾 `_renderHUD` 之前调用 `this.d5.render(ctx);`，最后 `ctx.restore();`
> - 既有 `_renderBiteAlert` 的"红屏闪烁 + 大叹号 + 提示文案"，**本仗暂保留**（与 D5 反馈层共存），下一仗再决定是否合并/收编（避免本仗动两块）。**Nina 已知此并行**。

---

## 5. PERFECT 三档字渲染（M2）

> **art-spec §5 全数值落地**。字体 fallback 用 `D5_FONT_STACK`。

```js
// js/render/d5/perfect-text-renderer.js
import { D5_COLORS, D5_FONT_STACK } from './d5-palette.js';

const TIERS = {
  light:  { text: '稳！',   fontSize: 14, holdMs: 270, totalMs: 600, rise: 6,
            shadows: [['#FFEEB0', 4]] },
  medium: { text: '妙！',   fontSize: 16, holdMs: 370, totalMs: 700, rise: 8,
            shadows: [['#FFEEB0', 3], ['#FFD43B', 8]] },
  heavy:  { text: '完美！', fontSize: 20, holdMs: 470, totalMs: 800, rise: 10,
            shadows: [['#FFEEB0', 2], ['#FFD43B', 6], ['#D4A41A', 12]],
            rays: true },
};

export function drawPerfectText(ctx, x, y, tier, t) {
  const c = TIERS[tier]; if (!c || t < 0 || t > c.totalMs) return;
  // 三段曲线（art-spec §5.0）
  let scale = 1, alpha = 1, yOff = 0;
  if (t < 180) {                          // 弹性进入
    const k = t / 180;
    scale = easeOutBack(k, 1.7) * 0.4 + 0.6; // 0.6→1.15→1.0 用 back 曲线模拟
    alpha = k;
  } else if (t < 180 + c.holdMs) {       // 停留 + 上飘
    const k = (t - 180) / c.holdMs;
    yOff = -k * c.rise * 0.8;            // 0 → -0.8*rise
  } else {                                // 淡出
    const k = (t - 180 - c.holdMs) / 150;
    yOff = -c.rise * 0.8 - k * c.rise * 0.6; // -0.8r → -1.4r
    alpha = 1 - easeInQuad(k);
  }

  const cx = Math.floor(x), cy = Math.floor(y + yOff);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.font = `bold ${c.fontSize}px ${D5_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = D5_COLORS.OUT;

  // 多层金光叠加（art-spec §5.1/§5.2/§5.3）
  for (const [shColor, shBlur] of c.shadows) {
    ctx.shadowColor = shColor;
    ctx.shadowBlur = shBlur;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = D5_COLORS.WHT;
    ctx.fillText(c.text, 0, 0);
  }
  // 4 道放射光（仅 heavy）
  if (c.rays) drawRays(ctx);
  ctx.restore();
}

function drawRays(ctx) {
  const angles = [0, 90, 180, 270];
  ctx.shadowBlur = 0;
  for (const deg of angles) {
    ctx.save();
    ctx.rotate(deg * Math.PI / 180);
    const grad = ctx.createLinearGradient(8, 0, 20, 0);
    grad.addColorStop(0, 'rgba(255,238,176,1)');
    grad.addColorStop(1, 'rgba(255,238,176,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(8, -1, 12, 2);
    ctx.restore();
  }
}
function easeOutBack(k, s = 1.70158) { k -= 1; return k*k*((s+1)*k+s)+1; }
function easeInQuad(k) { return k*k; }
```

> **低端机性能预案**（工程视角风险）：
> - `shadowBlur` 在低端机叠 3 层 × 60fps 可能掉到 30fps 以下。**不替换为别的方案**（不否方案），但提供降级开关：`D5BiteFeedback` 构造时检测 `navigator.hardwareConcurrency <= 2` 或可配开关 `window.__D5_LOW_FX = true`，则 heavy 档自动降为 medium 配置（去三层为两层、去放射光）。**默认不开降级**，等 Nina 录屏帧率确认后决定。

---

## 6. 「可惜……」字渲染（M3）

```js
// js/render/d5/miss-text-renderer.js
import { D5_COLORS, D5_FONT_STACK } from './d5-palette.js';

export function drawMissText(ctx, x, y, t) {
  if (t < 0 || t > 800) return;
  // α 关键帧：0→0% / 120ms→100% / 600ms→100% / 800ms→0%
  let a = 0;
  if (t < 120) a = easeOutQuad(t / 120);
  else if (t < 600) a = 1;
  else a = 1 - easeOutQuad((t - 600) / 200);

  const cx = Math.floor(x), cy = Math.floor(y);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `12px ${D5_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = D5_COLORS.OUT;
  ctx.strokeText('可惜……', cx, cy);
  ctx.fillStyle = D5_COLORS.WHT_DK;
  ctx.fillText('可惜……', cx, cy);
  ctx.restore();
}
function easeOutQuad(k) { return 1 - (1 - k) * (1 - k); }
```

---

## 7. 放大镜染色蒙版（M4）

> **Z-order 红线**（art-spec §0.0 第 2 条 + 实施工程口径）：染色用 `multiply` 合成模式，**渲染顺序在浮漂本体之上、PERFECT/可惜/四叶草之下**。`multiply` 会"染色"已有像素而非覆盖，故不会糊掉浮漂本体细节。

```js
// js/render/d5/magnifier-tint-renderer.js
import { D5_COLORS } from './d5-palette.js';

// art-spec §2.1（heavy 一次性）/ §2.2（late 持续呼吸）
export function drawMagnifierTint(ctx, rect, mode, t) {
  let alpha = 0, color = D5_COLORS.WARN;
  if (mode === 'heavy') {
    if (t > 580) return;
    if (t < 80)  alpha = (t / 80) * 0.70;             // 0→70% linear
    else         alpha = 0.70 * (1 - easeOutQuad((t - 80) / 500)); // 70%→0% easeOutQuad
    color = D5_COLORS.WARN;     // #C8412B
  } else if (mode === 'late') {
    // 2Hz 呼吸 [30%, 70%]
    alpha = 0.30 + 0.40 * (Math.sin(2 * Math.PI * t / 500) * 0.5 + 0.5);
    color = D5_COLORS.LATE;     // #E8553D
  } else return;

  const x = Math.floor(rect.x), y = Math.floor(rect.y);
  const w = Math.floor(rect.w), h = Math.floor(rect.h);
  const b = 4; // 边框 4px

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  // 4 段矩形拼环（禁用 arc）
  ctx.fillRect(x,         y,         w, b);     // top
  ctx.fillRect(x,         y + h - b, w, b);     // bottom
  ctx.fillRect(x,         y + b,     b, h - 2*b); // left
  ctx.fillRect(x + w - b, y + b,     b, h - 2*b); // right
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over'; // 显式复位（art-spec §2.1）
}
function easeOutQuad(k) { return 1 - (1 - k) * (1 - k); }
```

> **`_magRect()` 实际值对齐**：D5BiteFeedback._magRect 给的是占位 `{x:cx-60, y:cy-40, w:120, h:80}`。CodeBuddy 在合入前**必须用 grep 找到 fishing-scene 既有放大镜的真实绘制矩形**（搜 `magnifier` / `放大镜`），对齐后再把数值改对。**找不到放大镜矩形，停下报 Nina**。

---

## 8. 四叶草微光（M5）

```js
// js/render/d5/clover-glow-renderer.js
import { D5_COLORS } from './d5-palette.js';

// 7×7 ASCII（art-spec §6.1，G=主色绿 #7AC862，H=#F4E4BC，.=透明）
const CLOVER = [
  ['.','.','G','G','G','.','.'],
  ['.','G','G','H','G','G','.'],
  ['G','G','H','H','H','G','G'],
  ['G','H','H','H','H','H','G'],
  ['G','G','H','H','H','G','G'],
  ['.','G','G','H','G','G','.'],
  ['.','.','G','G','G','.','.'],
];
// 6 帧关键帧（art-spec §6.2）
const KF = [
  { t: 0,   scale: 0.4,  alpha: 0,   blur: 0, dy: 0  },
  { t: 80,  scale: 1.20, alpha: 1,   blur: 4, dy: 0  },
  { t: 160, scale: 1.0,  alpha: 1,   blur: 4, dy: 0  },
  { t: 280, scale: 1.0,  alpha: 1,   blur: 3, dy: 0  },
  { t: 400, scale: 1.0,  alpha: 0.6, blur: 2, dy: -2 },
  { t: 500, scale: 0.9,  alpha: 0,   blur: 0, dy: -4 },
];

export function drawCloverGlow(ctx, x, y, t) {
  if (t < 0 || t > 500) return;
  const k = lerpKF(t);
  ctx.save();
  ctx.globalAlpha = k.alpha;
  ctx.translate(Math.floor(x), Math.floor(y + k.dy));
  ctx.scale(k.scale, k.scale);
  ctx.translate(-3, -3);
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const ch = CLOVER[j][i]; if (ch === '.') continue;
    if (ch === 'G') {
      ctx.shadowColor = D5_COLORS.PERFECT_HI; // #FFEEB0
      ctx.shadowBlur  = k.blur;
      ctx.fillStyle   = D5_COLORS.CLOVER;     // #7AC862
    } else { // 'H'
      ctx.shadowBlur  = 0; // 高光不带外发光（art-spec §6.2 红线）
      ctx.fillStyle   = D5_COLORS.CLOVER_HI;  // #F4E4BC
    }
    ctx.fillRect(i, j, 1, 1);
  }
  ctx.restore();
}
function lerpKF(t) {
  for (let i = 1; i < KF.length; i++) {
    if (t <= KF[i].t) {
      const a = KF[i-1], b = KF[i];
      const r = (t - a.t) / (b.t - a.t);
      return {
        scale: a.scale + (b.scale - a.scale) * r,
        alpha: a.alpha + (b.alpha - a.alpha) * r,
        blur:  a.blur  + (b.blur  - a.blur ) * r,
        dy:    a.dy    + (b.dy    - a.dy   ) * r,
      };
    }
  }
  return KF[KF.length - 1];
}
```

> **位置浮动红线**（art-spec §6.2 末尾）：每次触发位置 ±2px 随机偏移，避免被识破系统提示。在 `D5BiteFeedback.onBiteStart` 内已通过 `bobX/bobY` 自然偏移，**额外加** `+ Math.round(Math.random()*4-2)`。

---

## 9. 猛档水花粒子（M6，**复用 ParticleSystem**）

> **不新建粒子系统**。复用 `fishing-scene.js:117-128` 的 `ParticleSystem`，参数化调用 `emit`。

```js
// js/render/d5/splash-particle-fx.js
// art-spec §8.1 ④：抛物线 N=12 粒子，重力+初速 8 帧 ≈ 667ms
// ParticleSystem.emit(x, y, count, color, opts) 既有签名（fishing-scene.js:122-126）
// opts: { speed, upward, decay, size, gravity }
export function emitHeavySplash(particles, x, y) {
  // 12 粒水花，向上 + 向四周溅射
  particles.emit(x, y, 12, '#A8D8E8', {
    speed:   180,        // 比 caught 默认 120 高 50%（猛档=爆发感）
    upward:  true,       // 触发 vy -= 150 初始上抛
    decay:   0.04,       // life 1 → 0 用约 25 帧 ≈ 417ms（与 8 帧水花视觉吻合）
    size:    4,          // 比默认 8 小，更像水珠
    gravity: 360,        // 比默认 300 大 20%，落得快有"水"的质感
  });
  // 第二批 4 粒"大水珠"（白色高光），稍慢
  particles.emit(x, y, 4, '#FFFFFF', {
    speed:   120, upward: true, decay: 0.05, size: 3, gravity: 320,
  });
}
```

> **粒子色板合规**：水花蓝 `#A8D8E8` 不在 12 色调色板。**与主美口径一致**——水花是 environmental fx，不计入像素色板（art-spec §0.1 范围只覆盖浮漂/HUD/字/图标）。如主美在录屏复审时反对，改用 `D5_COLORS.GLOW = '#FFF8C8'` 即可（一行修改）。

---

## 10. 漏提演出 800ms（涟漪复用 + 鱼影远离）

> art-spec §4 时间轴。**涟漪复用 `_drawBobRipples`（fishing-scene.js:2693）的 1.4s 三层错峰扩散**，本仗只触发一次"加速版"——**实现在 D5BiteFeedback 内补一个 `RippleBurst` 子状态**，绕开既有 `_drawBobRipples` 的常驻循环：

```js
// 在 D5BiteFeedback.onLateMiss 内追加
this.fx.rippleBurst = { startMs: this._frameTime, x: this.scene.bobX, y: this.scene.bobY };
// render 时一帧手动画一个椭圆，扩散速度 ×1.5、α 60%→0%、500ms 内
```

**鱼影远离**（art-spec §4.3）：
- 复用 `assets/.../fish_shadow_3layers.png` 远景层（**先 grep 确认资产路径**：`grep -rn "fish_shadow" AIgame/js/`，找不到则报 Nina，**禁止猜路径**）
- 浮漂下方 16px、30° 斜向下、500ms 移动 64px、α 25%→0%

> **如果 grep 不到 `fish_shadow_3layers.png`**：本仗鱼影远景**降级为不画**（保留涟漪 + 「可惜……」即可，不堵流程），在指令书反馈给 Nina。

---

## 11. DoD 清单（≤5 条，可勾选）

- [ ] **D-1 三档抖动可视区分**：dev 环境 console 注入 `window.fishingScene.d5.onBiteStart('light'|'medium'|'heavy')` 三档分别录屏 5s，老板 + Nina 一致判定差异清晰
- [ ] **D-2 三段判定行为正确**：手动测试三档 × {提早/PERFECT/GOOD/LATE/漏提} 共 12 路径，进入正确演出分支（PERFECT→稳/妙/完美字、LATE→呼吸+⚠（⚠暂可不画）、漏提→可惜+涟漪）
- [ ] **D-3 像素硬边一致**：与 v3.0 浮漂同框截图，所有程序化资产无反锯齿/无半透明边缘糊化（弹性帧豁免）
- [ ] **D-4 性能不掉帧**：默认配置（heavy 三层 shadowBlur + 放射光）在 dev 机器 ≥ 50fps；如低于，开启 `__D5_LOW_FX` 降级开关后 ≥ 55fps
- [ ] **D-5 既有钓鱼链路零回归**：从抛竿到提竿到鱼获展示完整跑通 5 次，Caught / Failed / 回 Waiting 状态切换正常，控制台无新增 error/warn

---

## 12. 提交规范

- **commit 前缀**：`[d5]`（例：`[d5] add three-tier bite shake offset table`）
- **单 PR 范围**：建议拆 3 个 PR
  1. `[d5] palette + shake frame + bite window 3-tier`（M0/M1 + 状态机改造，不含视觉演出）
  2. `[d5] perfect text + miss text + clover glow renderers`（M2/M3/M5）
  3. `[d5] magnifier tint + heavy splash + camera shake`（M4/M6 + applyCameraShake）
- **ES module bump**：M7 落地后 main.js bump `?v=20260601a`（即 `js/main.js?v=20260601a`，跟随主入口）；新增子模块通过 import 链一并刷新，无需各自挂版本号
- **PR 模板必含**：
  - 5s 实机录屏（每档一条 + 漏提一条 + PERFECT 三档一条 = 7 条）
  - grep 自检命令（§1 那一组）输出截图
  - 色板/字号对照本指令书的截图标注

---

## 13. 给 CodeBuddy 的开工铁律（再强调一次）

1. **先跑 §1 grep 自检**，任意一项不匹配立即停手报 Nina
2. **数值/色值/帧表**全部从本指令书或 art-spec v1.2 / design.md v1.0 直接抄，不"优化"、不"对称化"、不加亚像素
3. **`_drawPixelBob` 函数本体禁改**，只在调用前一行加 `dx/dy` 偏移
4. **`ParticleSystem` 类禁改**，只通过 `emit(x,y,count,color,opts)` 调用
5. **`fish_shadow_3layers.png` 资产引用前必须 grep 确认存在**，找不到走降级（§10 末尾）
6. **放大镜矩形真实坐标必须 grep 对齐**（§7 末尾），不要用占位值上线
7. **字体栈用 `D5_FONT_STACK`** 即可，不要单独引字体
8. **PERFECT 字 shadowBlur 性能不达标**时不替换方案，按 §5 末尾打开 `__D5_LOW_FX` 降级开关
9. **既有 `_renderBiteAlert`（红屏闪烁 + 大叹号）本仗保留**，不要顺手删——下一仗再决定
10. **完成后录屏发 Nina**，Nina 跑最终 grep 自检后转主美双签

---

## 14. 待 Nina 协调的一个潜在冲突点（标出，不替决策）

- **art-spec §6.1 高光色 `#F4E4BC`** 与 changelog §6.1 提到的"v1.2 修正改用 #FFF4D6"语义存在文字冲突，但 art-spec v1.2 §0.2 明确"#F4E4BC 用途收窄为四叶草专用高光"，故本指令书**采用 #F4E4BC**。如最终主美口径要求改 #FFF4D6，**只需改 `d5-palette.js: CLOVER_HI` 一行**。
- 玩法稿 §7.3 提到的"⚠ 8×8 像素 ⚠ 标"art-spec §2.2 也定义了 ASCII 像素图，但本仗演出排期紧，**LATE 段⚠ 标默认不画**（仅放大镜呼吸已能传达 LATE 警示）。如 Nina/主美要求必画，再追加约 30 行像素绘制（数据源直接抄 art-spec §2.2 ASCII）。

---

**指令书完。CodeBuddy 拿到此文档即可开工。完成后录屏 + grep 自检结果 → Nina → 主美双签。**
