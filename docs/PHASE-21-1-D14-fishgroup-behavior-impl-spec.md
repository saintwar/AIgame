# PHASE 21-1 D14 — 鱼群行为系统重构 实施 Spec（v3.0）

> **范围**：把"v3.0 鱼群行为重构"的 4 条老板需求 + 前两轮设计封板，整合成一份**独立可编码**的实施 spec。
> **与 D11–D13 关系**：D11–D13（大鱼系统 / groupSlot=center 锁定 / 全局 roll）**互不重叠**——D14 改的是"常规鱼群层"行为（鱼群随机化、惊吓、咬钩前戏、删旧 fishShadow），**不动**大鱼层。
> **平行 spec**：`PHASE-21-1-D11-D13-bigfish-impl-spec.md`、`PHASE-21-1-req5-battle-ux-spec.md`。
> **生效版本**：PHASE 21-1 v3.0（W1 D14）
> **作者**：主策（Claude） · 审稿：Nina · 编码：CodeBuddy
> **撰写时间**：2026-06-03

---

## 0. 强制前置：核仓事实（grep 锚点）

主程编码前请先复核以下行号，与本 spec 一一对齐。**所有锚点已在仓库 commit `cb12a6d` 时点核实**。

| 锚点 | 文件 | 行号 / 函数 | 用途 |
|---|---|---|---|
| **A1** 三鱼群配置 | `js/systems/fish-group-system.js` | `init()` L73~L91（`fishGroups[].centerX/centerY/fishCount/wanderArea`） | 需求1 随机化注入点 |
| **A2** wander update | `js/systems/fish-group-system.js` | `update(dt)` L97~L138 | 需求2 受惊态注入点（外加 state 分支） |
| **A3** spawn 初始 | `js/systems/fish-group-system.js` | `_spawnFish()` L222~L242 | 需求1 体型/位置随机注入 |
| **A4** roll 体型 | `js/systems/fish-group-system.js` | `_rollFishSize()` L260~L283 | 需求1 与"丰富度/体型暗示"解耦点（**删** SIZE_DIST_BY_DENSITY 反向表） |
| **A5** 黄色高亮描边 | `js/systems/fish-group-hover-ui.js` | `_drawHighlight()` L196~L213，色值 `#FFD700` | 需求1 删除黄框 |
| **A6** 浮窗描边/底色 | `js/systems/fish-group-hover-ui.js` | `_drawPopup()` L230~L246（`#FFD700` 1px 描边） | 需求1 浮窗保留但去金边讨论（见 §1.5） |
| **A7** "鱼群密度" 文案 | `js/systems/fish-group-hover-ui.js` | L257 `ctx.fillText('鱼群密度', ...)` | 需求1 改名"资源丰富度" |
| **A8** 密度档视觉表 | `js/systems/fish-group-hover-ui.js` | `_densityVisual()` L271~L275（"5 字符密度图"） | 需求1 文案/字段重命名 |
| **A9** 体型暗示 SIZE_HINT | `js/systems/fish-group-hover-ui.js` | L29~L33 + `_getMaxSize()` L39~L44 | 需求1 与"丰富度"解耦 |
| **B1** 抛竿落水 commit | `js/fishing-scene.js` | `_updateCasting()` L896~L935；L905~L906 `bobX/bobY` commit；L917 `transition('Waiting')` | 需求2 抛漂入水触发点 |
| **B2** Waiting 旧逻辑 | `js/fishing-scene.js` | `_updateWaiting()` L938~L967；**L940~L948 `fishShadow` 左右随机生成 + 朝 bobber 游 + 概率 `_startBite`** | **需求4 删除主战场** |
| **B3** _startBite | `js/fishing-scene.js` | L1067~L1082 `_startBite()` → `transition('BiteWindow')` | 需求3 真吃/黑漂的 D5 入口 |
| **B4** D5 onBiteStart | `js/render/d5/d5-bite-feedback.js` | `D5BiteFeedback.onBiteStart(level, opts)` L70+ / L111 | 需求3 真吃→ shake 段 / 黑漂→短路 shake 直入 sink 段的接入参数 |
| **B5** D5 getBobOffset | `js/render/d5/d5-bite-feedback.js` | `getBobOffset()` L284~L307（`{dx, dy, hidden}`，sink 段 `dy >= SINK_HIDE_DY` 时 `hidden=true`） | 需求3 偷吃/试探的浮漂晃动复用此输出 |
| **B6** 浮漂绘制 | `js/fishing-scene.js` | `_drawPixelBob()` 调用点 L2233（`bobX + _d5b.dx, bobY + _d5b.dy`） | 需求3 前戏层叠加抖动入口 |
| **B7** _renderFishShadow | `js/fishing-scene.js` | L2329 + render 守卫 L1650 `if (this.fishShadow && this.fishShadow.moving)` | 需求4 删除点 |
| **B8** waitTimer 重置 | `js/fishing-scene.js` | L217 / L918 / L931 / L1604 | 需求4 删除连带清理 |

> **铁律重申（2026-05-31 老板确立）**：本 spec 引用的所有行号 / 函数名 / 字段名都是基于上表锚点真实存在的代码。主程发现任何对不上的地方，**先停下来**对账，不要按设计稿假设动手。

---

## 1. 需求 1 — 鱼群随机化与命名重构

### 1.1 设计目标
- 每局开场鱼群分布"广阔且不可预测"，强化"猎人式观察"价值。
- "密度档"耦合的视觉/概率表全部解耦——"丰富度"只描述资源观感，"体型暗示"独立由群内最大体型决定。
- 删除 hover 黄色外框，hover 留浮窗（去金边讨论见 §1.5）。
- "鱼群密度" → "资源丰富度"（玩家视角文案 + 内部字段命名同步）。

### 1.2 随机化范围（每局开场 roll，局内锁定）

**坐标系**：fishing-scene canvas `1280×720`，水域可用范围 `x∈[120, 1160]`，`y∈[420, 660]`（避开角色平台 + UI 安全区，已用 D1 三组实测值反推）。

| 维度 | 旧（D1/D3 写死） | 新（D14 随机） | 备注 |
|---|---|---|---|
| 鱼群数量 | 3 群（left/center/right） | **3 群**（保持 3，避免渲染压力 / hover 命中歧义） | id 改为 `g0/g1/g2` 或保留 left/center/right 都可，对外只是 key |
| `centerX` | 320 / 640 / 960 | `randInt(120 + halfW, 1160 - halfW)` | 见 §1.3 群间最小间距 |
| `centerY` | 480 / 540 / 480 | `randInt(420 + halfH, 660 - halfH)` | 同上 |
| `fishCount` | 3 / 5 / 7 | `randInt(3, 8)` 每群独立 roll | 三档丰富度仍按 ≤3/4–6/≥7 映射（见 §1.6） |
| `wanderArea.w` | 220 / 180 / 120 | `randInt(140, 240)` | 与丰富度**解耦**，纯表现 |
| `wanderArea.h` | 140 / 120 / 80 | `randInt(90, 150)` | 同上 |
| 单条 `swimSpeed` | 全 30 | 保持 30（D14 不动） | 留 D15+ |
| 单条 `size` | 反向概率表（密度 → 体型） | **每条独立 roll**：`{small: 0.5, medium: 0.35, large: 0.15}` 全局固定表，**与 fishCount 无关** | 见 §1.4 |

### 1.3 群间最小间距（避免重叠）

- **判定**：以 `wanderArea` AABB 为准，两群 AABB **不相交**（含边距），即
  - `|c1.x - c2.x| ≥ (halfW1 + halfW2) + GAP_X`
  - `|c1.y - c2.y| ≥ (halfH1 + halfH2) + GAP_Y`
  - 推荐 `GAP_X = 40`，`GAP_Y = 30`。
- **算法**：3 群按顺序 roll，每群最多重试 20 次；20 次仍冲突则**回退到固定布局**（旧 D1 三组），保证不卡死。
- **日志**：失败回退要 `console.warn('[FishGroup] random layout fallback')`，方便定位极端水域。

### 1.4 体型独立 roll（删除 SIZE_DIST_BY_DENSITY）

```js
// 替换 fish-group-system.js L34~L38 的 SIZE_DIST_BY_DENSITY
const FISH_SIZE_DIST = { small: 0.50, medium: 0.35, large: 0.15 };
```

- **每条鱼独立伯努利累加抽样**，不再按 group.fishCount 分档。
- **删除**稀疏档保底（旧 `_rollFishSize` 末尾的 "至少 1 条 large"）——丰富度低 ≠ 必有大鱼，大鱼的"承诺"由 D11 大鱼层兜底（见 §1.7）。
- 整局锁定不变：仍只在 `init()` 时 roll 一次。

### 1.5 删除 hover 黄色外框

- **删除**：`fish-group-hover-ui.js::_drawHighlight()` 整个函数体，以及 `render()` 内对它的调用（`this._drawHighlight(ctx, g)` 一行）。
- **保留**：浮窗本体 + hover 0.5s 延迟 + 边缘翻转。
- **浮窗描边**：保留 `#FFD700` 1px 金边作为浮窗自身边框（这个不算"鱼群外框"，是 UI 元素，老板原话"不显示黄色外框"指鱼群 wanderArea 那个呼吸金框）。**待老板确认**见 §尾。
- **副作用**：`hoveredGroupId` / `hoverStartTime` / `popupVisible` 等状态字段保留（浮窗仍依赖）。

### 1.6 "鱼群密度" → "资源丰富度"

| 改动项 | 旧 | 新 |
|---|---|---|
| 浮窗第 1 行文案（A7 L257） | `'鱼群密度'` | `'资源丰富度'` |
| 内部函数名 | `_densityVisual(count)` | `_richnessVisual(count)` |
| 视觉档位语义 | "稀疏 / 中密 / 极密" | **"贫瘠 / 一般 / 丰饶"**（玩家观感更直观） |
| 视觉档位映射 | `<=3 / <=5 / >=7` | **`<=3 / 4-6 / >=7`**（fishCount 现在是 3–8 连续整数） |
| 视觉表（dots/color 不变） | ●○○○○ #FF6B6B / ●●●○○ #FFD93D / ●●●●● #6BCB77 | 同左 |

> **代码字段命名**：`fishGroups[].fishCount` 字段名**保留**（语义就是"鱼数量"，无需改）；只在 hover-ui 这一个用户面字段改名。

### 1.7 与 D11 大鱼系统的边界

| 行为 | 由谁负责 | D14 是否动 |
|---|---|---|
| 常规鱼群随机分布 / wander / 受惊 / 派鱼吃饵 | **D14（本 spec）** | ✅ |
| 大鱼全局 roll（每局至多 1 条） | D11 | ❌ 不动 |
| 大鱼 `groupSlot=center` 锁定中央群 | D11 | ❌ 不动；但 D14 随机化后**没有"中央群"了**——见下条 |
| 大鱼挂靠群的选择规则 | **本次 D14 调整**：D11 原 `groupSlot='center'` 改为 `groupSlot='auto'`，D11 在 3 个随机群里**等概率随机选 1 群**作为大鱼宿主 | D11 接口轻调（仅 1 处） |
| 大鱼 hover 第 2 行"上钩节奏"文案 | D11 已封板 | ❌ 不动 |
| 大鱼体型暗示在 hover 浮窗的显示 | D11 已封板（`★` 绿） | ❌ 不动；与 D14 `_getMaxSize()` 兼容（large 仍走 ★） |

> **D11 接口微调**：在 D11 spec 的 `bigFishHostGroup` 选群逻辑里，把"取 id==='center' 的群"改成"3 群中 `Math.floor(Math.random() * 3)` 取 1"。**这是 D14 引入的唯一对 D11 的反向修改**，请同步通知 D11 主程。

### 1.8 hover 第 2 行"上钩节奏"与体型暗示解耦关系（最终敲定）

- **第 1 行**：`资源丰富度` label
- **第 2 行**：丰富度 5 字符图（贫瘠/一般/丰饶）—— **只看 `fishCount`，与体型无关**
- **第 3 行**：体型暗示 `⚠ / ⚠⚠ / ★` —— **只看群内最大体型，与丰富度无关**
- 这就是"解耦"的最终落地：玩家可观察到"丰饶 + ★"（多且有大物，正面）/"贫瘠 + ★"（少但有大物，赌博位）/"丰饶 + ⚠"（多但全小，肉鸽刷量位）等组合。

> 注意：D11 大鱼存在时该宿主群第 3 行强制 ★，这是 D11 已封板逻辑，D14 不动。

### 1.9 验收点（DoD §1）
1. 每次进入钓鱼场景，3 群中心位置/大小/鱼数明显不同（连刷 5 局应可肉眼看出）。
2. 群间不重叠，AABB 间距 ≥ 30/40px。
3. 浮窗第 1 行显示"资源丰富度"，第 2 行根据 fishCount 显示三档点阵，第 3 行根据群内最大体型显示 ⚠/⚠⚠/★。
4. hover 进入鱼群范围**不再出现金色呼吸描边**；浮窗仍按 0.5s 延迟弹出。
5. 离开场景再进入，鱼群重新 roll；不退场则布局锁定。

---

## 2. 需求 2 — 抛漂惊吓 / 逃窜 / 回游

### 2.1 触发条件
- **入口**：`_updateCasting()` L905~L906 浮漂落水 commit `bobX/bobY` 后、L917 `transition('Waiting')` 之前，调用 `this.fishGroupSystem.applyScare(this.bobX, this.bobY)`。
- **判定**：对每个鱼群计算 `dist = hypot(bobX - g.centerX, bobY - g.centerY)`，命中条件 `dist <= R_SCARE`。
- **R_SCARE（惊吓半径）**：建议 `120 px`（约 wanderArea 半径的中位）。**待老板确认**见 §尾。
- **作用域**：仅命中的"那一群"全员逃窜；多群同时命中时**全部命中群**都进入逃窜（极端贴边抛投正常被惩罚）。

### 2.2 受惊行为（FleeState）

新增字段（鱼对象层 `f`）：
```js
f.state          // 'wander' | 'flee' | 'returning'  （旧只有 'wander'）
f.fleeTimer      // ms，剩余受惊时间，flee 进入时 randInt(2000, 5000)
f.fleeVx, f.fleeVy   // 受惊瞬间锁定的逃窜速度向量（避免每帧抖）
```

**逃窜方向**：`(f.x - bobX, f.y - bobY)` 归一化（远离浮漂）。
**逃窜速度**：`80 px/s`（约为 wander 30 的 2.7 倍，明显加速）。
**持续时间**：每条鱼独立 `randInt(2000, 5000) ms`（老板原话"2-5 秒后回游"）。
**逃窜出界处理**：受惊期间**忽略 wanderArea 边界硬约束**（不 clamp、不反向）——鱼可以"暂时游出 wanderArea"，否则贴墙鱼直接卡死，演出不真实。

### 2.3 回游行为（ReturningState）

`fleeTimer <= 0` 时切 `state = 'returning'`：
- `targetX/targetY = g.centerX + (Math.random()-0.5)*halfW, g.centerY + (...)*halfH`（回鱼群中央随机点）
- `swimSpeed = 30`（恢复 wander 速度）
- 走原 wander 的位置积分 + 朝向计算逻辑
- 抵达后（`reachedSq < 100`）切回 `state = 'wander'`，正常 `_pickNewTarget`

### 2.4 二次受惊 / 受惊期能否被吃饵？（拍板）

| 情形 | 决策 | 理由 |
|---|---|---|
| 鱼处于 `flee` 时玩家再次抛漂落点近 | **刷新 `fleeTimer = randInt(2000, 5000)`，方向重算** | 真实感优先；玩家应学会"别在受惊群继续作妖" |
| 鱼处于 `returning` 时再次受惊 | 切回 `flee`，同上 | 同上 |
| 受惊期间需求 3 的"派鱼吃饵 roll" | **短路**：`state !== 'wander'` 的鱼整群跳过派鱼 roll | 受惊鱼不可能去吃饵；回 wander 后才进吃饵判定 |
| 受惊期间是否阻断 hover 浮窗 | **不阻断**（hover UI 与鱼行为状态解耦） | UI 一致性 |

### 2.5 与 D5 抛竿落水链路接入点

- **不修改** D5/BattleStateSystem 任何代码。
- 仅在 `_updateCasting()` L906 与 L917 之间**新增 1 行**：
  ```js
  if (this.fishGroupSystem) this.fishGroupSystem.applyScare(this.bobX, this.bobY);
  ```
- `_updateCasting()` 失败分支 L930（cast complete 兜底）**也加一次**（保证落水必触发）。

### 2.6 新方法 API（fish-group-system.js）

```js
/**
 * 浮漂落水时触发：对所有鱼群做距离判定，命中群全员进入 flee 态。
 * 由 fishing-scene._updateCasting() 在 bobX/bobY commit 后调用。
 * @param {number} bobX
 * @param {number} bobY
 */
applyScare(bobX, bobY) { /* 详见 §2.7 伪代码 */ }
```

### 2.7 update(dt) 改造伪代码

```js
update(dt) {
  for (const g of this.fishGroups) {
    for (const f of g.fishes) {
      if (f.state === 'flee') {
        f.fleeTimer -= dt;
        // 用 flee 锁定向量；不做 wanderArea 硬约束
        f.x += f.fleeVx * dt / 1000;
        f.y += f.fleeVy * dt / 1000;
        f.vx = f.fleeVx; f.vy = f.fleeVy;   // 保留给 render() 朝向用
        if (f.fleeTimer <= 0) {
          f.state = 'returning';
          f.targetX = g.centerX + (Math.random()-0.5)*g.wanderArea.w;
          f.targetY = g.centerY + (Math.random()-0.5)*g.wanderArea.h;
          f.swimSpeed = 30;
        }
      } else {
        // wander / returning 共用同一段（唯一区别：returning 抵达后切 wander）
        // ... 现有 L107~L137 逻辑保持，加上抵达切态：
        if (reachedSq < 100 && f.state === 'returning') {
          f.state = 'wander';
        }
      }
    }
  }
}
```

### 2.8 验收点（DoD §2）
1. 浮漂落入 R_SCARE 范围内的鱼群，全员立即向远离浮漂方向加速逃窜（肉眼可见明显加速）。
2. 同场其他鱼群完全不受影响（继续 wander）。
3. 每条鱼受惊持续 2–5s，时间到后回游到群中央，速度恢复正常。
4. 受惊期间不会有鱼吃饵（需求3 派鱼 roll 被短路）。
5. 二次抛漂打到同群可重置受惊时间。
6. 受惊鱼可暂时游出 wanderArea（不被卡墙），回游后正常 wander 在群内。

---

## 3. 需求 3 — 四态咬钩前戏 + D5 复用

> **背景**：前两轮已封板「试探/偷吃/真吃/黑漂」状态机；本节是"翻译为代码"。**核心约束：D5 不动**——前戏层在 D5 之前/之外完成，真吃/黑漂时再交棒进 D5。

### 3.1 状态机（鱼群层 / 距 BiteWindow 之前）

```
                         ┌─────────────────────┐
                         │ 鱼群 wander 态      │
                         │ (无 bobber 干扰)    │
                         └─────────┬───────────┘
                                   │
                          浮漂落水（waitTimer 触发）
                                   ▼
                         ┌─────────────────────┐
                         │ Discover：最近群    │
                         │ 派 1 条鱼"发现浮漂" │
                         │ → 锁定该条 fish.id  │
                         └─────────┬───────────┘
                                   │ roll 咬钩类型
                  ┌────────────┬───┴────┬─────────────┐
                  ▼            ▼        ▼             ▼
              试探(35%)   偷吃(30%)  真吃(25%)     黑漂(10%)
              dock 1     dock 2-3   dock 3 + sink  直接 sink 800ms
              不进 D5    不进 D5    → D5 完整链路   → D5 短路
                  │            │        │             │
                  └────────────┘        ▼             ▼
                  误判提竿 = 空竿罚    交给 D5 接管   交给 D5 接管
                  下次降档（参照 D5 NIBBLE）
```

**前戏层归属**：`fish-group-system.js` 新增内部状态机 `BobberApproachFSM`（每条 bobber 生命周期 1 个实例），生命周期与 `_updateWaiting` 平行（替代旧 fishShadow 逻辑）。

### 3.2 前戏触发（Waiting 期）

- **入口**：`_updateWaiting()` 第一行后调用 `this.fishGroupSystem.tickBobberApproach(dt, this.bobX, this.bobY)`。
- **删除**：旧 L940~L948 整段 `fishShadow` 生成 + 朝 bobber 移动 + 概率 `_startBite` 逻辑（详见 §4）。
- **派鱼条件**：
  - 浮漂在水中（FSM === 'Waiting'）持续 `randInt(1500, 4000) ms` 后启动 Discover；
  - 选**距浮漂最近的、且非 flee/returning 态**的鱼群作为"发现浮漂的群"；
  - 在该群内随机选 1 条 `state==='wander'` 的鱼作 `bobberFollower`，把它的 `state` 切到 `'approach'`，`targetX/targetY` 锁定为 `bobX/bobY`。

### 3.3 接近行为（approach）

- 速度 `45 px/s`（介于 wander 30 与 flee 80 之间）。
- 抵达浮漂 ±15px 内（`reachedSq < 225`）→ 切 `state = 'biting'`，roll 咬钩类型。
- approach 期间允许被需求2 受惊打断（受惊优先级最高，整群进 flee，bobberFollower 的 'approach' 也被覆盖为 'flee'，前戏中断、需重新启动）。

### 3.4 咬钩类型 roll（最终敲定概率）

| 类型 | 概率 | 浮漂表现（晃动） | 时长 | 后续 |
|---|---|---|---|---|
| 试探 NIBBLE_LITE | **35%** | 单次轻晃（dx≤±2px，dy 0），1 下 | 400 ms | 不进 D5；玩家提竿 = 空竿，下次降档（沿用 D5 NIBBLE 罚则） |
| 偷吃 NIBBLE | **30%** | 中等晃动（dx≤±3px），2-3 下 | 800 ms | 不进 D5；玩家提竿 = 空竿，下次降档 |
| 真吃 BITE | **25%** | 强晃动（dx≤±4px）3 下 → 沉水 | 600ms 晃 + D5 全程 | **进 D5**：`onBiteStart(level, {isLuckyBail:false})` 走完整 shake→sink |
| 黑漂 LUCKY | **10%** | 不晃动，直接沉水 800ms | 800 ms | **进 D5 短路**：`onBiteStart(level, {isLuckyBail:true})`（新参数语义），D5 跳 shake 段直入 sink |

> **拍板理由**：试探多/真吃中/黑漂稀有，符合"博弈层次感由轻到重"。**待老板确认**见 §尾——尤其黑漂 10% 是否过高。

### 3.5 浮漂晃动表现（前戏层）

**关键复用决策**：试探/偷吃**不复用** `D5BiteFeedback.getBobOffset()`（D5 不动 = 不能在 D5 之外调它的状态机），而是**前戏层自己产出 dx/dy 偏移**，通过和 D5 同样的 `_drawPixelBob(bobX + dx, bobY + dy)` 路径叠加到浮漂上。

- 在 `fish-group-system.js` 新增 `getBobberPreBiteOffset() → {dx, dy}`，输出当前前戏帧的偏移。
- `fishing-scene.js::_renderRodAndBob` 在 L2231~L2233 D5 偏移之前（FSM === 'Waiting' 时）先叠前戏偏移：
  ```js
  // L2231 上方
  let preDx = 0, preDy = 0;
  if (this.fsm.is('Waiting') && this.fishGroupSystem) {
    const pb = this.fishGroupSystem.getBobberPreBiteOffset();
    preDx = pb.dx; preDy = pb.dy;
  }
  // 原 L2233 改为：
  if (!_d5b.hidden) this._drawPixelBob(bobX + preDx + _d5b.dx, bobY + preDy + _d5b.dy);
  ```
- 前戏帧表（建议）：
  - 试探：`[-2, 0, +2, 0]`（每帧 100ms × 4 = 400ms）
  - 偷吃：`[-3, 0, +3, 0, -3, 0, +3, 0, -3, 0, +3, 0]`（每帧 100ms，最多 3 组循环）
  - 真吃：`[-4, 0, +4, 0, -4, 0, +4, 0, -4, 0, +4, 0]`（200ms×3，共 600ms）→ 切 D5

### 3.6 真吃 / 黑漂 → D5 衔接

**真吃**：前戏 600ms 晃完后调用现有 `_startBite()`（B3 L1067），`_startBite` 内部 `transition('BiteWindow')` + `D5.onBiteStart(level, {isLuckyBail:false})`，**完全复用现有链路**。

**黑漂**：前戏直接调用 `_startBite({isLuckyBail:true})`（_startBite 接口需加可选第 2 参数透传给 D5），D5 在 `onBiteStart` 里识别 `opts.isLuckyBail===true` 时**跳过 shake 段**（比如把 `biteWindowElapsed` 直接置到 `w.shakeEnd`），玩家进入 BiteWindow 后立刻就在"sink 段"。

> **D5 改动量评估**：`onBiteStart(level, opts)` 的 `opts.isLuckyBail` 当前已存在（B4 L111 `opts = {}`），但内部分支可能未实现。请主程核 D5 对该参数的处理；**若无处理，本 spec 允许在 D5 增 ≤ 5 行 if 分支**，不视为破坏 D5 封板（属"复用接口的最小扩展"，与"D5 不动"的精神一致）。

### 3.7 玩家提竿时机的惩罚（试探 / 偷吃 误判）

- 试探/偷吃期间玩家按空格 = 空竿；
- 走 D5 NIBBLE 罚则：`window.fishingState.nextBiteLevelMod = -1`（下次 BiteLevelDispatcher 降一档）；
- 视觉提示：`'空竿了…'` Toast 1.5s（复用 D5 toast 通道，若无则 console.log 占位）。
- **真吃晃动期**（已 roll 真吃但 D5 还没接手的 600ms）按空格：算"早提"，给一次"温柔早提"——空竿 + 不降档（鼓励玩家敢提）。

### 3.8 验收点（DoD §3）
1. Waiting 期 1.5–4s 后，离浮漂最近的群里有 1 条鱼游向浮漂。
2. 抵达后浮漂出现晃动；按 35/30/25/10 概率分布出现 4 种表现（连刷 50 次统计验证）。
3. 试探/偷吃期间按空格 = 空竿提示 + 下次咬钩档降一档。
4. 真吃 600ms 晃完后**自动**进 D5 BiteWindow，shake → sink → 抓鱼/失败链路完整不破。
5. 黑漂触发后浮漂不晃直接下沉 800ms，进 D5 后立即在 sink 段（玩家来不及看 shake）。
6. 受惊群里的鱼**不会**被选为前戏鱼（被需求 2 短路）。

---

## 4. 需求 4 — 删除"左右随机出现鱼游向浮漂"旧设定

### 4.1 真实代码位置（已 grep 确认）

| 文件 | 行号 | 内容 |
|---|---|---|
| `js/fishing-scene.js` | L940~L948 | `_updateWaiting()` 内 `if (!this.fishShadow && this.waitTimer >= ...)` 块——`side = ±1`、`bobX + side*(150~300)` 生成 fishShadow |
| `js/fishing-scene.js` | L950~L961 | fishShadow 朝 bobber 移动 + 抵达后 `_startBite` 概率 |
| `js/fishing-scene.js` | L2329~L2360 左右 | `_renderFishShadow()` 整个函数 |
| `js/fishing-scene.js` | L1650 | `_render()` 内 `if (this.fishShadow && this.fishShadow.moving) this._renderFishShadow();` 调用守卫 |
| `js/fishing-scene.js` | L217 / L918 / L931 / L1604 / L1613 | `fishShadow / fishShadowPos` 字段初始化与重置 |

### 4.2 删除指令（精确）

1. **删 _updateWaiting 内 L940~L961**：从 `if (!this.fishShadow && this.waitTimer >= CONFIG.waiting.fishSpawnDelay) {` 到外层 `}` 整段，**替换为**：
   ```js
   // PHASE 21-1 D14：旧 fishShadow 左右随机出现 + 朝 bobber 游 已删除
   //   替代为 FishGroupSystem 的 BobberApproachFSM（前戏层四态）
   if (this.fishGroupSystem) {
     this.fishGroupSystem.tickBobberApproach(dt, this.bobX, this.bobY);
   }
   ```
2. **删 `_renderFishShadow()`** 整个函数（L2329~函数结束）。
3. **删 _render() L1650** 中的 `if (this.fishShadow && this.fishShadow.moving) this._renderFishShadow();` 一句。
4. **删字段初始化**：L217 `this.fishShadow = null; this.fishShadowPos = ...`，以及 L918/L931/L1604/L1613 的 `this.fishShadow = null` 重置（可保留为 noop，但建议彻底删干净）。
5. **CONFIG.waiting.fishSpawnDelay / CONFIG.fish.travelSpeed**：保留（D14 派鱼前戏层暂未用，但删除可能引发其他模块引用断裂；建议加 `// @deprecated D14` 注释）。

### 4.3 替代关系（结构性替换，非叠加）

| 旧逻辑 | 新逻辑（D14） |
|---|---|
| 全局随机生 1 条 fishShadow，从 bobber 左/右 150–300px 生成，朝 bobber 游 | 鱼群定位 + 浮漂落水受惊 + 派"最近群里 1 条 wander 鱼"approach 浮漂 |
| 抵达浮漂 ±7px 后 `Math.random() < baseProb + ...` 决定咬钩 | 抵达浮漂 ±15px 后 roll 试探/偷吃/真吃/黑漂 四态 |
| 单一咬钩=直接 _startBite | 四态前戏，仅真吃/黑漂入 D5 |

### 4.4 验收点（DoD §4）
1. 全场 grep `fishShadow` 仅在注释或 `@deprecated` 中出现，无代码引用。
2. Waiting 期不再看到从屏幕边缘游向浮漂的"幽灵鱼影"。
3. 鱼群里的鱼直接派代表去吃饵（视觉上能追溯到"哪条鱼离开了群"）。

---

## 5. 集成验收清单（DoD 总）

### 5.1 需求 1/2/3/4 各 3–5 条（汇总自 §1.9 / §2.8 / §3.8 / §4.4）见各节末尾。

### 5.2 与已落地系统的回归不破清单

| 系统 | 不破点 | 验证方式 |
|---|---|---|
| **D5 三档反馈** | shake 帧表 / sink 时长 / PERFECT/可惜 字 / 抖动偏移 | 真吃路径 100% 走完 D5（可手动改 §3.4 概率为真吃 100% 跑 5 局） |
| **D5 NIBBLE 降档** | `nextBiteLevelMod = -1` 在试探/偷吃误提竿时触发 | 检查下次 `BiteLevelDispatcher.resolve` 输出降档 |
| **D7 biteLevel 透传** | `biteInitialTension[level]` 仍用同一 level 决定初始张力 | 真吃路径下张力初值随 level 变化 |
| **D11 大鱼层** | 大鱼仍每局至多 1 条；hover 第 3 行 ★ 仍是大鱼宿主群 | D11 接口仅 `groupSlot='auto'` 改动；连刷 10 局至少 1 局有大鱼 |
| **D11 hover 第 2 行"上钩节奏"** | 该字段不动 | 浮窗第 2 行正常 |
| **D12 大鱼搏斗** | 大鱼真吃链路完整不破（大鱼也是常规鱼群里被派出来的，走相同前戏） | 大鱼场景手测 |
| **D13 / req5 搏斗UX** | 搏斗期鱼群仍不渲染（fishing-scene Playing 分支控制） | 进入 Playing 后看不到鱼群图层 |
| **CastAimSystem** | 抛投瞄准不动 | 抛投手感无变化 |
| **WaterSplashFX** | 落水水花不动 | 落水视觉无变化 |
| **fishing-scene FSM** | Idle/Aiming/Casting/Waiting/BiteWindow/Reeling/Playing/Caught/Failed 状态机不动 | 跑通完整流程 5 次 |

---

## 6. 技术债登记

| ID | 内容 | 优先级 | 备注 |
|---|---|---|---|
| TD-D14-1 | `CONFIG.waiting.fishSpawnDelay / CONFIG.fish.travelSpeed` 保留为 deprecated，下个里程碑彻底删 | P3 | 不阻塞邀测 |
| TD-D14-2 | D5 `onBiteStart` 的 `opts.isLuckyBail` 分支若需新增，应在 D5 spec 补一份微更新单 | P2 | 邀测前补 |
| TD-D14-3 | 鱼群随机布局 20 次重试失败回退用了"硬编码 D1 三组"，长期应改为更稳健的 quad-tree 布点 | P3 | 邀测后 |
| TD-D14-4 | 受惊期鱼"暂时游出 wanderArea"的视觉边界需主美评估（可能游到水域外） | P2 | 邀测前主美确认；必要时把 R_SCARE 内再加一个"软边界 clamp" |
| TD-D14-5 | 前戏层晃动帧表与 D5 shake 帧表的"过渡感"（真吃 600ms 晃完瞬间切 D5 shake，是否有跳变）需玩家测试 | P2 | 邀测对照 |

---

## 7. 待老板 / Nina 拍板

| # | 问题 | 主策建议 | 备注 |
|---|---|---|---|
| Q1 | **R_SCARE 惊吓半径** = 120px 是否合适？ | 120px（≈ wanderArea 半径中位） | 调大 = 抛漂风险更大；调小 = 受惊几乎不触发 |
| Q2 | **受惊期间二次抛漂**是否刷新 fleeTimer？ | 刷新（真实感 + 惩罚作妖） | 主策已选刷新；老板若反对改为"忽略二次" |
| Q3 | **受惊期 hover 浮窗是否变红/警示**（语义"这群被惊了"）？ | 不动 UI（保持解耦） | 若老板要做需主美补一档红色配色 |
| Q4 | **黑漂概率 10%** 是否过高？ | 10% 起步，邀测看反馈再调；建议下限 5%、上限 15% | 黑漂是惊喜时刻，过密会麻木 |
| Q5 | **试探/偷吃浮漂"轻微 1 下 / 2-3 下"的具体振幅**（本 spec 给的 ±2 / ±3px 是否够明显）？ | 像素风优先小振幅；±2/±3 在 1280×720 内眼能看出 | 主美请评估 |
| Q6 | **浮窗 #FFD700 金边是否一并去掉**（老板"不显示黄色外框"是否覆盖到浮窗描边）？ | **建议保留浮窗金边**（属于 UI 元素，与"鱼群外框"语义不同） | 老板 1 句话即可拍板 |
| Q7 | **D11 大鱼宿主群从 'center' 改为 'auto' 等概率随机** 是否同意？ | 建议同意（D14 随机化后已无固定中央群） | 若不同意需 D14 保留一组固定 'center' 配置 |

---

## 8. 实施顺序建议（给主程）

> 整包预计 1.5 工作日。建议拆 4 个独立 commit，便于回滚。

1. **commit 1**：删除需求 4 旧逻辑（§4.2）+ 验证场景空跑不报错（fishShadow 删干净）。
2. **commit 2**：fish-group-system.js 随机化 + 删黄框 + 文案改名（§1.2~§1.6）。
3. **commit 3**：受惊系统 `applyScare` + flee/returning 状态（§2）。
4. **commit 4**：前戏四态 `tickBobberApproach` + D5 衔接（§3）。
5. **回归测试**：用 §5.2 清单逐项过一遍。

---

## 9. 一句话总结

> D14 把"鱼群"从"密度档写死的装饰图层"升级为"局内随机布局、能被惊吓、会派代表来探/偷/吃/黑漂的真实生态"，同时把旧 fishShadow 这条"幽灵鱼游向浮漂"的旁路彻底拆掉。D5/D7/D11–D13 全部不破。

— END —
