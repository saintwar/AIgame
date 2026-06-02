# PHASE 21-1 D7「水下博弈心流衔接」实施指令书 v1.0

> **签发**：2026-06-02，Nina（PM）整理主策划 D7 设计稿 + 工程核资产后产出
> **链路**：老板需求（跳过D6直开D7）→ 主策划设计稿（`PHASE-21-1-D7-design.md` v1.0，老板拍A）→ 本指令书 → CodeBuddy 执行
> **传递**：git push main，commit `[knot]` 前缀
> **基线**：D5 v2.1（commit `4c75da4` + 放大镜 `150c621`），handoff = `docs/PHASE-21-1-D5-handoff.md` v2.2
> **设计依据**：`docs/PHASE-21-1-D7-design.md` v1.0

---

## 0. 命题（不可改）

D7 **不是建博弈骨架**——张力 rise/fall 博弈早在 PHASE 13/15 实现并在线上跑，整杆已能跑通。D7 唯一 P0 = **把 D5 的 `biteLevel` 透传进博弈起始逻辑，形成"虚张声势→反差结果"的情绪呼应**。其余皆 P1 调参，本仗不做。

---

## 1. ⚠️ 核资产修正（覆盖主策划设计稿的事件假设，CodeBuddy 必读）

主策划设计稿 §上游写了一个交接事件 `HOOK_JUDGED` + 字段串（`judgement/initialTension/hpModifier/fishPullCoef/fishGroupRef/isLuckyBail`）。**经 Nina grep 全仓核实，这个事件不存在**（同 D5 放大镜的 `CAST_LANDED` 同类情况）。真实情况：

| 主策划稿假设 | 工程真实情况（grep 实证）|
|---|---|
| D5 抛 `HOOK_JUDGED` 事件携带字段 | **无此事件**。提竿成功直接 `_startReeling()`（L1112）→ `_initPlayingState()`（L1114），无事件总线 |
| `biteLevel` 来自事件字段 | `biteLevel` 是 **scene 实例字段** `this.biteLevel`（L210 声明 / L1056 由 `BiteLevelDispatcher.resolve(rarity)` 赋值，值 `'light'/'medium'/'heavy'`）|
| 需新建透传通路 | **不需要**。`this.biteLevel` 在进入 Playing 时仍然存活，`_initPlayingState` 内可直接读 `this.biteLevel` |

**结论**：D7 P0 不需要任何事件总线/新通路，只需在 `_initPlayingState` 里读已存在的 `this.biteLevel` 调初始张力。这是个干净单点改造。

---

## 2. 开工前核资产（CodeBuddy 必跑，任意一条不符停手报 Nina）

```bash
cd /data/workspace/AIgame
# 1. biteLevel 实例字段 + 来源
grep -n "this.biteLevel = BiteLevelDispatcher.resolve" js/fishing-scene.js   # 期望 ~L1056
grep -n "this.biteLevel = null" js/fishing-scene.js                          # 期望 ~L210
# 2. 提竿成功入口链
grep -n "_startReeling()" js/fishing-scene.js                                # 期望 ~L1112
grep -n "_initPlayingState()" js/fishing-scene.js                            # 期望 ~L1112/1114 定义
# 3. 初始张力硬编码点（本仗改造核心）
grep -n "this.tension = 60;" js/fishing-scene.js                             # 期望 _initPlayingState 内 ~L1123
# 4. 确认 HOOK_JUDGED 不存在（验证 §1 修正）
grep -rn "HOOK_JUDGED" js/                                                    # 期望：无任何输出
# 5. 张力配置
grep -n "playing:" js/fishing-scene.js                                       # 期望 ~L60 CONFIG.playing
```

全过 → 开工。任意不符（尤其 #4 若有输出说明事件已被新建，需重新对齐）→ 停手报 Nina。

---

## 3. P0 唯一改造：biteLevel → 初始张力"第一印象"

### 3.1 改造点
`_initPlayingState()`（L1114）内现有硬编码 `this.tension = 60;`（L1123）。改为按 `this.biteLevel` 给初始张力一个**小幅偏移**，制造"虚张声势→反差结果"的第一印象。

### 3.2 设计意图（主策划定，主程实现）
- 咬钩**猛抖（heavy）**→ 玩家预期是大物 → 初始张力略高（起手更紧张）；若实际是杂鱼，behavior=none/HP低，博弈两秒结束 → **"雷声大雨点小"的反差**
- 咬钩**轻抖（light）**→ 玩家预期杂鱼 → 初始张力略低；若实际是大物（越档扰动让轻档也可能出好货），behavior=surge/mythic → **"扮猪吃老虎"的惊喜**
- **中档（medium）**→ 维持原 60 基线

### 3.3 建议实现（主程可按工程判断调整，数值入 CONFIG 便于 P1 调）
```
// CONFIG.playing 增补（建议）
biteInitialTension: { light: 52, medium: 60, heavy: 70 }

// _initPlayingState 内，把 this.tension = 60 改为：
const _bt = (CONFIG.playing.biteInitialTension && CONFIG.playing.biteInitialTension[this.biteLevel]) || 60;
this.tension = _bt;
```
- **红线**：偏移幅度必须温和（建议 ±8~10 内），不得让 heavy 起手就逼近红区（85）导致"还没开始博弈就快断线"——这破坏手感
- **红线**：`this.biteLevel` 可能为 null（异常路径/GM 跳转），必须有 `|| 60` 兜底

### 3.4 越档呼应（P0 依附项，随 3.3 一并落地）
biteLevel 透传后，"虚张声势→反差"的呼应**靠现有系统自然形成**（heavy 起手紧 + 实际杂鱼快速结束 = 反差），**不需要额外加越档判定逻辑**。主程只需确保初始张力偏移落地，反差由 biteLevel（咬钩信号）与 behavior/HP（真实鱼）的客观差异自然产生。

---

## 4. 明确不做（守设计稿 §2）

- ❌ 不接方向键 QTE（`_updateReeling`）进主链路 —— 原地封存，留 D10+
- ❌ 不建 SUPER_DASH —— 守 D10
- ❌ 不为"5 性格"做任何博弈层接入 —— 伪命题，behavior 已承载
- ❌ 不删除任何沉睡代码
- ❌ 不动 behavior 张力曲线 / 体型基线 / 张力数值标定 —— 全是 P1，实战 50 场再调

---

## 5. 实施落点

- 改动文件：**仅 `js/fishing-scene.js`**（CONFIG.playing 增补 1 个字段 + `_initPlayingState` 改 1 行）
- 无新建文件，无新模块，无事件总线
- main.js bump `?v=20260602p`（接上次 `20260602o`）
- 改动极小，单 PR 即可

---

## 6. DoD（验收清单，Nina 接力验）

1. §2 五条 grep 自检 5/5 通过（尤其 #4 `HOOK_JUDGED` 无输出）✅
2. heavy 档咬钩 → 进博弈初始张力 > 60（起手更紧）；light 档 < 60；medium = 60 ✅
3. heavy 起手张力不逼近红区（不出现"刚进博弈就快断线"）✅
4. `this.biteLevel` 为 null 时初始张力兜底 60，不报错 ✅
5. 越档场景体感反差成立：猛抖出杂鱼=快速收尾 / 轻抖出大物=意外硬仗 ✅
6. behavior（none/surge/erratic/mythic）博弈差异、QTE 封存、体型基线全部保持 v2.1 行为不变 ✅
7. 整杆链路（观察→抛竿→三拍咬钩→提竿→博弈→上岸）跑通无回归 ✅

---

## 7. commit / PR 约定

- commit 前缀 `[d5]` 或 `[d7]`，main.js bump `?v=20260602p`
- PR 附：heavy/medium/light 三档咬钩进博弈的初始张力对比 + §2 grep 截图
- 完成 push main，Nina 接力验收
- P1 待办（不在本仗）：biteInitialTension 三档数值 / behavior 张力曲线 / 体型基线，纳入实战 50 场统一收口
