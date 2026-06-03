# PHASE 21-1 大鱼留存系统 · 最终实施 Spec（D11+D12+D13 合并版）

> 版本：impl-spec v1.0（封板合并版）
> 日期：2026-06-03
> 决策：老板拍板「直接开做，邀测前落地，不放 v3.1」
> 范围：D11（全局 roll 大鱼 + 废弃 SIZE_DIST 旧逻辑）+ D12（跨局留存/三终态解除/咬钩加成/字段表）+ D13（装备引导咬钩后触发）
> 交付对象：主程（CodeBuddy）。本文件为**唯一权威实施依据**，主程无需再跨 D7/D11/D12 三份文档拼读。
> 协作铁律：本 spec 为设计层口径与改造锚点，**存档 schema 由主程按 save-system.js 风格自行定稿**，本文只点依赖、不替主程设计字段类型。

---

## 0. 一页速览（主程先读这段）

| 项 | 结论 |
|---|---|
| 核心机制 | 大鱼 = 单局级全局稀有事件，命中后**跨局驻留**某钓点，钓上/放弃/到期三种方式解除 |
| 废弃物 | `SIZE_DIST_BY_DENSITY`（密度→体型反向概率表）+ 稀疏档保底，**整段删除** |
| 落地文件 | `fish-group-system.js`（roll+留存复活）、`fishing-scene.js`（场次递减+引导+解除回写）、`save-system.js`（新增 persistentBigFish 节点，不 bump version）、`bait-effects.js`（设计层口径，本期**无字段改动**，见 §6 技术债） |
| 真实锚点 | `init()`（fish-group-system）、`_startReeling()` L1139、`_initPlayingState()` L1167、`_handleReturnVillage()` L622、`_showEscapeConfirm()` esc-yes L644，回村出口统一收口 `SceneManager.switchToInstant('village', {spawnAt:{x:21,y:16}})` |
| **不存在的锚点** | 全仓**无 `HOOK_JUDGED` 事件常量**（D5/D7 是函数内透传 `this.biteLevel`，非 EventBus 事件）；大鱼咬钩加成必须挂在 roll 阶段，不能去监听一个不存在的事件 |
| 存档 | 沿用 `bdds_save_v1`，`version` **保持 2 不变**，migrate 走"缺哪补哪"兜底 |

---

## 1. 机制总览（合并叙事，主程建立全局认知）

一局钓鱼的大鱼生命周期：

```
进入钓点(init)
  │
  ├─ Step A：查存档 persistentBigFish[spotId]
  │     ├─ 命中留存 → 到期检查
  │     │     ├─ sessionsRemaining<=0 → 解除(EXPIRED) + 事后飘字 + 不注入，继续走 Step B 无大鱼
  │     │     └─ 未到期 → injectBigFish() 复活上局大鱼（同 groupSlot/体型/称号）+ skipBigFishRoll=true
  │     └─ 无留存 → 进 Step B
  │
  ├─ Step B：仅当无留存时，roll 新大鱼
  │     ├─ roll P_bigfish（12%）未命中 → 本局无大鱼，常规三鱼群照旧
  │     └─ 命中 → 选群(按鱼数加权) → 群内指定1条标 BIG + roll 体型档 → 写入留存(state=活跃)
  │
  ├─ 常规层：三鱼群数量/位置/个体照旧 roll（大鱼只占其中1条槽位）
  │
  ▼
钓鱼会话（D5 咬钩 → 搏斗）
  │     └─ 若本杆派的是大鱼：BigBiteChance 加成生效（见 §5）；搏斗段 biteLevel 可透传 black/heavy
  │
  ├─ 钓上大鱼 → 解除(CAUGHT) + 清留存
  ▼
离场/回村（_handleReturnVillage L622 或 _showEscapeConfirm L644）
  │
  └─ 场次结算钩子：未钓上则 sessionsRemaining-- ，回写存档（见 §4）
```

**双层 roll 是工程核心**：常规层（三鱼群）每局重 roll，大鱼层查存档复活。两层并存，互不污染。

---

## 2. 废弃旧逻辑（D11 第一刀）

### 2.1 删除清单（`fish-group-system.js`）
- ❌ `SIZE_DIST_BY_DENSITY` 常量（sparse/medium/dense 三档反向概率表）
- ❌ `_rollFishSize()` 中按密度反向 roll 体型的分支
- ❌ 稀疏档"整组 roll 出 0 large 强制第一条改 large"保底逻辑
- ❌ hover 浮窗常驻第 3 行"体型暗示（⚠/⚠⚠/★）"

> ⚠ 核仓确认：`init()` 当前仍是 D3 旧逻辑（实例化后 `_rollFishSize`+`SIZE_DIST_BY_DENSITY`+稀疏档保底），D11 全局 roll 从未落地。本期是**首次落地**，不是改 bug。

### 2.2 hover 浮窗两行重构（与大鱼解耦）
- 第 1 行：🐟 鱼群密度（稀疏 / 适中 / 密集）← 纯数量映射，不再承诺体型
- 第 2 行：📊 上钩节奏（偶尔有口 / 时常有口 / 频繁咬钩）
- 删除原第 3 行体型暗示；大鱼**不在常驻 hover 暴露**

---

## 3. 大鱼 roll 与体型（D11 双层 roll 流程）

### 3.1 init() 改造（`fish-group-system.js`）—— 两步骨架
```
init(ctx):
  this._rollRegularGroups()         // 常规层：三鱼群数量/位置/个体（照旧，删体型反向roll）
  const spotId = ctx.spotId         // 当前钓点（如 'shuishe'）
  const persisted = Save.get('persistentBigFish')?.[spotId]
  if (persisted && persisted.state === 'active') {
     if (persisted.sessionsRemaining <= 0) {
        this._expireBigFish(spotId)            // → §4.3 EXPIRED
        // 不注入，本局无大鱼
     } else {
        this._injectBigFish(persisted)          // 复活：钉入 persisted.groupSlot
        this.skipBigFishRoll = true
     }
  }
  if (!this.skipBigFishRoll && !this._hasActiveBigFish(spotId)) {
     this._rollNewBigFish(spotId)               // → §3.2
  }
```

### 3.2 `_rollNewBigFish(spotId)`（Step1/2/3）
- **Step1** roll `P_bigfish = 0.12`（初值，约每 8 局 1 次；不命中直接 return，本局无大鱼）
- **Step2** 三群选 1：**按鱼数量加权**随机（鱼多的群更可能藏大鱼）
  - ⚠ 例外：D12 R5 之外的常规 roll 走加权；但**留存复活**时锁死 `groupSlot=center`（见 D12 决策，复活大鱼固定中群，与新 roll 选群不同路径）
- **Step3** 群内指定 1 条标 `isBig=true` + roll 体型档：
  | 体型档 | 概率 | rarity 拔高 |
  |---|---|---|
  | large | 70% | rarity≥4 |
  | huge | 25% | rarity≥4 |
  | legendary | 5% | rarity=5 |
  - rarity 拔高的作用：喂给 D5 BiteLevelDispatcher 大概率出 heavy 档（"大货"信号绑定到这条鱼体量，符合 B3 路线）
- 命中后立即 `_writeBigFishToSave(spotId, entry)`（state=active, 注入称号/sessionsTotal/sessionsRemaining，见 §4）

### 3.3 大鱼线索（L1/L2/L3 三层分工 —— 老板升级为强视觉明示）
> ⚠ 注意：这里采用老板**最新**裁决（2026-06-03 11:25，强视觉明示），覆盖更早的"弱线索"版本。
- **L1 明示层**：大鱼水下剪影直接画得比同群其他鱼**明显更大**，肉眼可见（100% 准，看到 = 真有）。博弈点从"猜哪群有大鱼"变为"搏大鱼 vs 稳钓常规鱼"的抉择题。
- **L2 氛围烘托层**：水面偶发更大涟漪/气泡（情绪渲染，不承担告知职责）
- **L3 暧昧水情词**：hover 第 3 行**非常驻闪现**（flavor 风味文案，不是常驻信息）
- ⚠ **R1 红线**：驻留期氛围**恒定**，禁止任何 `sessionsRemaining==1` 的到期预警变体（水面扰动减弱/hover 弱线索变体**全部砍掉**）。到期只做事后告知（§4.3）。

---

## 4. 跨局留存与三终态解除（D12 核心）

### 4.1 存档依赖（只点依赖，schema 由主程定）
- 新增顶层节点 `save.persistentBigFish`，结构为 `{ [spotId]: <entry> }`
- `DEFAULT_SAVE` 增加 `persistentBigFish: {}`；`migrate()` 追加"缺则补 `{}`"兜底块
- **`version` 保持 2 不变**（沿用 save-system.js "缺哪补哪"风格，零破坏性向后兼容）
- 单 `bdds_save_v1` key 全局共享 → 村庄/钓鱼场景天然跨场景读写同一存档

**entry 建议承载字段（主程可按 save-system 风格增删/改名）**：
`spotId / bigFishId(唯一实例ID) / fishSpecies / rarity / sizeTier(large|huge|legendary) / groupSlot(复活锁 center) / sessionsTotal / sessionsRemaining / state(active|caught|abandoned|expired) / title(称号) / injectedAt / encounterCount / failCount(纯展示零数值影响) / lastSeenDate`

### 4.2 场次递减（D12 R5 实质修订：进场即算一场）
- **"一场"定义**：玩家进入该钓点场景**即算一场**（不管钓没钓、抛没抛竿）。取消所有"未抛竿不计"豁免。
- **递减时机**：从原 FISHING_END 改为**离场/回村时结算** —— 挂在回村出口调用前。
- **唯一收口**：两处调用 `SceneManager.switchToInstant('village', {spawnAt:{x:21,y:16}})`
  - `_handleReturnVillage()` **L622**（任务完成直接回）
  - `_showEscapeConfirm()` esc-yes `.onclick` **L644**（确认回村）
- **实施**：在这两处 `switchToInstant` 调用**前**插入递减钩子 `_consumeBigFishSession()`：
  ```
  _consumeBigFishSession():
    if (this._sessionConsumed) return        // 防重复递减
    const spotId = this.spotId
    const e = Save.get('persistentBigFish')?.[spotId]
    if (e && e.state==='active') {
       e.sessionsRemaining -= 1
       Save.set(...); Save.commit()
    }
    this._sessionConsumed = true
  ```
- 仅需运行时态 `this._sessionConsumed`（**不进存档**），进场时置 false。
- ✅ **R5 已老板拍板（2026-06-03）：零豁免，进场即算一场**——老板原话"按我设定来，不管钓没钓，只要回村就算一次"。即便进场后立刻回村（看一眼剪影/装备引导触发后回村准备）也照样递减。设计意图：保留"你犹豫/准备就会失去机会"的紧张稀缺感。**主程实施时不开任何豁免旁路（取消 §8 的 `_sessionExempt` 预留方案）**。

### 4.3 三终态解除模型
| 终态 | 触发 | 处理 |
|---|---|---|
| **CAUGHT** 钓上 | 搏斗胜利（`_onFishCaught` 命中 isBig） | 清留存（state=caught/删 entry），可触发专属出水演出 |
| **ABANDONED** 主动放弃 | 玩家点击放弃入口 | 清留存，**不记败绩**，体面文案「你放它回了潭底，江湖再见」 |
| **EXPIRED** 到期游走 | init() 检测 `sessionsRemaining<=0` | 系统自动解除，**事后**飘字「那条大鱼似乎离开了这片水域」（非预警），不注入本局 |
- `sessionsTotal = randInt(3,5)`（D12 R3，每条大鱼注入时**独立 roll**，制造急脾气/耐磨差异）
- 不设硬上限（D12 老板裁决：靠 EXPIRED 自动游走自然消化，多钓点可各自有大鱼）

### 4.4 村庄软提示（D12 R2，文案定死）
- 触发：**≥2 个钓点同时驻留 active 大鱼**
- 说话人：林师傅
- 文案（**不可改**，"大货"是钓鱼黑话）：**「听说好几处出现大货，你还不快点去？」**
- 与 R1 不冲突：R2 是泛氛围催促，不泄露任何单条鱼剩余场数。

---

## 5. 大鱼咬钩加成（D12 / 加成阶梯）

### 5.1 设计口径（加成只动"咬不咬钩"，不动搏斗难度 = 非 P2W）
- 仅作用于纯 (b)：**大鱼已在场时，派大鱼来吃饵的概率 `BigBiteChance`**；**不动** (a) `P_bigfish` 出现率（保护 12% 稀缺锚点）。
- 加算后封顶（线性加算 → min cap）：
  | 鱼饵 | 加成 | BigBiteChance |
  |---|---|---|
  | basic_bait 普通饵 | +0% | 20%（base） |
  | advanced_bait 中级饵 | +12% | 32% |
  | legendary_bait 高级饵 | +22% | **42%（本期实际封顶）** |
  | special_bait 特制饵（预留） | +30% | 50%（cap） |
- 封顶逻辑硬编码 `BigBiteChance = min(20% + Δ, 50%)`，防 buff 叠加击穿。
- **R4 修订**：`special_bait` 本期**不上架、不可购买**，后续版本由每日任务奖励领取。本期实际封顶 = 高级饵 42%。守"不可购买 = 非 P2W"底线。

### 5.2 落点（重要：无 HOOK_JUDGED 事件可挂）
- ⚠ 全仓**无 `HOOK_JUDGED` 事件常量**。加成不能去监听事件。
- 加成必须挂在**派鱼 roll 阶段**：当本钓点有 active 大鱼，且本杆要决定"派常规鱼 or 派大鱼"时，用 `BigBiteChance`（受当前装备的鱼饵加成修正）做这次派鱼判定。
- 因果闭环：回村买高级饵 → 让驻留大鱼更愿上钩（而非更好打），形成 R2 软提示的补给动机。

---

## 6. D13 装备引导（咬钩后触发，时机重定锚）

### 6.1 触发时机（已重定锚 —— 咬钩后，非进场时）
- **不在进场/看到剪影时**提示（避免一进场就泼冷水、破坏"抉择题"博弈）。
- 触发点定锚在**咬钩判定后、进入搏斗初始化时**：`_startReeling()` **L1139** → `_initPlayingState()` **L1167** 链路上，当本杆确认是 isBig 大鱼且玩家当前钓竿压不住其 rarity 时，给一次性引导提示。
- 文案（能力门槛前置，体面不羞辱）：**「你现在的钓竿还压不住它，去找林师傅升级装备再来」**
- 提示只读、不阻断（玩家仍可硬搏，搏斗难度不因提示改变）。

### 6.2 钓竿×rarity 兼容判断（复用现有矩阵）
- 沿用 PHASE 15 钓竿兼容矩阵：入门竿 rarity≤2 / 竹制竿 rarity≤3 / 碳素竿全部。
- 大鱼 rarity 拔高（large/huge≥4，legendary=5）→ 入门/竹制竿玩家命中大鱼时触发 D13 引导。

---

## 7. 技术债登记（本期与 D13 一起落地需登记）

| # | 技术债 | 说明 | 建议偿还节点 |
|---|---|---|---|
| TD-1 | `isBigFish` 字段桥接用 `rarity>=4` 近似 | 当前无独立"是否大鱼"语义字段，用 rarity 阈值近似；与 legendary 体型档边界可能错配 | 下个迭代加显式 `isBig` flag |
| TD-2 | `bait-effects.js` 加成口径与代码模型不一致 | 真实模型是 `rarityBonus/rarityShift/sizeMul`，**无"咬钩率+%"字段**；本 spec 的 +12%/+22%/42% 是**设计层口径**，需主程新增 `bigBiteBonus` 字段桥接或在 roll 层做映射 | 本期随 §5 落地时一并桥接 |
| TD-3 | `special_bait` 三处全无 | items.js/shop-ui.js/bait-effects.js 均无该饵；本期"不上架"= 本来就没有，仅在加成表预留口径 | 后续每日任务版本补 |
| TD-4 | `_sessionConsumed` 为运行时态 | 不进存档，若进场后异常崩溃未走回村出口，该场不递减（容忍：偏向玩家） | 可接受，无需偿还 |
| TD-5 | 留存复活 `groupSlot` 锁 center，与新 roll 按鱼数加权选群路径不一致 | 两条选群路径并存（复活锁 center / 新 roll 加权），属设计取舍非 bug | 记录备查 |

---

## 8. 老板拍板记录（2026-06-03 全部定稿）

| 项 | 老板裁决 | 实施口径 |
|---|---|---|
| **R5 边界豁免** | ✅ **方案 B：零豁免**（老板原话"不管钓没钓，只要回村就算一次"） | 主程**不实现** `_sessionExempt` 旁路；进场即将 `_sessionConsumed=false`，回村出口（L622/L644）无条件调 `_consumeBigFishSession()`，零分支零豁免。设计意图：保留"你犹豫/准备就会失去机会"的紧张稀缺感。 |
| **拉力危险态环境化**（req5） | ✅ 通过（详见 req5 spec §7） | 与本 spec 无直接耦合，登记备查 |

> 本 spec 至此**全部决策点拍板**，无遗留 TBD，主程可直接落地。

---

## 9. 实施红线（不动清单）
- rise=15/fall=40、黄金区 40~85、断线 0.3s 缓冲、HP 下降机制、InputManager 键盘映射 —— 全部不动
- D5 三档反馈链路、放大镜甲路线、D7 biteLevel 透传机制 —— 全部不动（大鱼只是喂 rarity + 新增 black/heavy 透传值）
- 状态机骨架（Idle/Aiming/Casting/Waiting/BiteWindow/Reeling/Playing/Caught/Failed）不动
- 存档 version 保持 2，不 bump

---

## 10. 落地文件 × 改造点速查表（主程编码索引）

| 文件 | 改造点 | 关联章节 |
|---|---|---|
| `fish-group-system.js` | 删 SIZE_DIST_BY_DENSITY；init() 双层 roll；`_rollNewBigFish` / `_injectBigFish` / `_expireBigFish` / `_hasActiveBigFish` | §2 §3 §4.3 |
| `fishing-scene.js` | L622/L644 回村出口前插 `_consumeBigFishSession`；进场置 `_sessionConsumed=false`；`_onFishCaught` 大鱼 CAUGHT 解除；放弃入口 ABANDONED；L1139/L1167 链路插 D13 引导；hover 浮窗两行重构；L1 剪影放大 | §3.3 §4.2 §4.3 §6 |
| `save-system.js` | DEFAULT_SAVE + migrate 兜底 `persistentBigFish: {}`，version 不变 | §4.1 |
| `bait-effects.js` | 桥接 BigBiteChance 加成口径（TD-2） | §5 §7 |
| 村庄/林师傅对话 | R2 软提示「听说好几处出现大货，你还不快点去？」触发逻辑 | §4.4 |
