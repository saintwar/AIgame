# PHASE 21-1 D5 P0「放大镜」实施指令书 v1.0

> **签发**：2026-06-02，Nina（PM）整理主策划设计 + 工程核资产后产出
> **链路**：老板需求 → 主策划设计（Q1-Q5 + 时序）→ 老板拍板（S2 保留 / S3 砍掉）→ 本指令书 → CodeBuddy 执行
> **传递**：git push main，commit `[knot]` 前缀
> **基线**：D5 v2.1（commit `4c75da4`），handoff = `docs/PHASE-21-1-D5-handoff.md`

---

## 0. 老板拍板的最终设计（不可改）

1. **出现时机**：浮漂**落水后 150ms**（不是鱼咬钩后；整个 Waiting 等待期放大镜常驻）
2. **消失时机**：玩家**提竿瞬间立即消失**（无论中鱼 / 早提 / 超时，立即移除，不等淡出动画）
3. **尺寸**：圆形 **180px × 180px**
4. **放大**：中心聚焦浮漂，**4 倍**
5. **位置**：浮漂**左侧或右侧**（动态取反侧，见 §3）
6. **S2 等待期微动效**：保留 ✅
7. **S3 咬钩 PUNCH**：**砍掉** ❌（老板凌晨已定稿咬钩反馈 shake+沉水音+heavy cameraShake，不再叠加放大镜 punch）

---

## 1. 开工前核资产（CodeBuddy 必跑，任意一条不符立刻停手报 Nina）

⚠️ **重要修正**：主策划设计稿假设有 `CAST_LANDED` 事件总线——**经 Nina grep 核实，项目里没有这个事件**。真实落水时机见下。CodeBuddy 开工前用以下 grep 验证接入点未漂移：

```bash
cd /data/workspace/AIgame
# 1. 落水 commit 点（抛物线完成 → commit bobX/bobY → transition Waiting）应在 _updateCasting 内
grep -n "this.bobX = this.castTo.x" js/fishing-scene.js          # 期望 ~L885
grep -n "fsm.transition('Waiting', 'cast complete')" js/fishing-scene.js  # 期望 ~L897 / L910
# 2. 浮漂坐标字段 + D5 偏移出口
grep -n "this.d5 ? this.d5.getBobOffset()" js/fishing-scene.js   # 期望 ~L2126 / L2197
# 3. BiteWindow 退出统一出口
grep -n "onBiteWindowExit" js/fishing-scene.js                   # 期望 ~L1087/1096/1105
# 4. D5 反馈层置顶渲染挂载点
grep -n "BiteWindow 反馈层" js/fishing-scene.js                   # 期望 ~L1575
# 5. 放大镜模块不存在（确认从零新建，不复用已删 v1）
ls js/render/d5/magnifier-v2-renderer.js 2>&1                    # 期望：No such file
```

全过 → 开工。任意不符（行号大幅漂移 / 字段改名）→ 停手报 Nina。

---

## 2. 真实接入点（基于 Nina 核实，覆盖主策划假设）

| 主策划设计稿写的 | 工程真实情况 | 实施依据 |
|---|---|---|
| 出现挂 `CAST_LANDED` 事件 + 150ms | **无此事件**。落水真实点 = `_updateCasting` 内抛物线完成 commit `bobX/bobY`（L885-886）后 `transition('Waiting')`（L897/L910） | 放大镜出现锚点 = **进入 Waiting 那一刻 + 150ms** |
| 浮漂屏幕坐标 | `this.bobX / this.bobY`（落水后即水面固定坐标），抖动/沉水偏移走 `this.d5.getBobOffset()` 返回 `{dx, dy, hidden}` | 镜中心 = `bobX + d5.dx, bobY + d5.dy` |
| 提竿即焚 `onLineUp` 钩子 | 无 `onLineUp`。BiteWindow 退出统一走 `d5.onBiteWindowExit()`（L1087/1096/1105）；提竿成功走 `_startReeling`（L1112） | 消失锚点见 §4 |

---

## 3. 放大镜状态机（落水出现 → Waiting → shake → sink → 提竿消失）

| 阶段 | 触发 | 放大镜行为 |
|---|---|---|
| 待命 | Idle / Aiming / Casting 飞行中 | 不存在 |
| **延迟计时** | 进入 `Waiting`（`transition('Waiting')` 那一刻）| 启动 150ms 计时器 `MAGNIFIER_DELAY=150` |
| **淡入出现** | 进 Waiting + 150ms | 计算浮漂屏幕坐标 → 取反侧落点 → clamp 边缘 → 50~80ms 淡入；4× 最近邻放大，中心锁定浮漂 |
| **S2 等待跟拍** | Waiting 持续（可能数十秒）| 镜内浮漂随波微浮（±1~2px 正弦，周期 1.5~2.5s）+ 水面缓动 + 偶发涟漪（每 4~8s 一圈）。**微动幅度必须显著小于 shake 抖动**（红线，否则混淆提竿判读）|
| **shake 跟拍** | 进 BiteWindow shake 段 | 镜内放大水面抖动浮漂，中心随 `getBobOffset().dx/dy` 跟随 |
| **sink 跟拍** | sink 段（`getBobOffset().hidden=true` 后）| 镜内复用 `underwater-bob-renderer` 画法放大墨蓝椭圆剪影，随 dy 下沉 |
| **立即消失** | 见 §4 | 立即移除（0~50ms 极短淡出或直接移除），不阻塞 reeling/Failed |

> ❌ **不实施 S3 PUNCH**：咬钩瞬间放大镜不做金光/震屏/叮音。老板已定稿的 D5 咬钩反馈（shake 帧 + playBobSink + heavy cameraShake 60ms）独立运作，放大镜只做"忠实放大"，不抢戏。

---

## 4. 消失锚点（必须覆盖所有离开 Waiting/BiteWindow 的路径）

放大镜在 Waiting 就开了，所以消失不能只挂 BiteWindow 退出。**统一规则：只要状态离开 `Waiting` 或 `BiteWindow` 进入任何其他状态，立即移除放大镜**。具体挂载：

- **提竿成功** → `_startReeling()` → `transition('Playing')`（L1112）→ 放大镜消失
- **早提 Failed** → `transition('Failed', 'early')`（L1089）→ 消失
- **超时 Failed** → `transition('Failed', 'timeout')`（L1108）→ 消失
- **兜底**：在 D5 `onBiteWindowExit()`（L1087/1096/1105 统一出口）里调 `magnifier.hide()`；**另在场景 reset（`_resetToIdle`/`_resetToWaiting`）时强制 `magnifier.hide()`**，防止异常路径残留

> 推荐实现：放大镜自身持有可见态，render 时判断 `fsm.is('Waiting') || fsm.is('BiteWindow')` 才画，离开即不画——比挂多个事件钩子更鲁棒。150ms 延迟用进入 Waiting 的时间戳判断。

---

## 5. 放大内容（Q2，主策划定）

- 放大**主画面同一个浮漂**，单一数据源（镜内与主画面永远一致，不另画一套漂状态）
- shake 段：放大抖动浮漂（让玩家"看清"三档抖动幅度差，强化档位辨识）
- sink 段：放大墨蓝椭圆剪影（强化"鱼把漂拖下水"的下沉位移）
- 镜内画**浮漂本体 + 脚下一小段水面线**，**不画**鱼线 / 水波细节（180px 窗口防信息过载）

---

## 6. 位置策略（Q3，主策划定）

- **动态取反侧**：浮漂在屏幕左半屏 → 放大镜放右侧；右半屏 → 放左侧（保证镜不挡漂）
- **边缘 clamp**：放大镜整体必须在画布内，靠边时向内收
- 偏置量 `MAGNIFIER_OFFSET` = 漂半宽 + 镜半径(90) + 留白，实测确保不压漂原位

---

## 7. 像素光学感（Q5，主策划定）

- 镜内浮漂用 **4× 最近邻整数放大**（`ctx.imageSmoothingEnabled=false`，拥抱马赛克，像素风正统）
- 外加 **圆形玻璃边框**（描金边 `#FFE4B5` 或对齐 d5-palette 现有色）+ **一道弧形高光** + **轻微暗角**，让它读作"镜片"
- **圆形裁切**：`ctx.arc` + `ctx.clip()` 限制放大内容只在圆内

---

## 8. 兼容契约（Q4，主程必守）

1. **共存不替代**：主画面浮漂/水下剪影/鱼线/PERFECT/可惜字/四叶草**逻辑零改动、照常渲染**。放大镜是额外特写浮层。
2. **单一数据源**：放大镜每帧从现有数据采样（shake 读 `getBobOffset` 偏移、sink 复用 `underwater-bob-renderer` 画法），不持有独立漂状态。
3. **Z-order（从下到上）**：水面/水波 → 主浮漂或水下剪影 → 鱼线 → 四叶草微光 → **放大镜浮层** → **PERFECT/可惜文字层**（文字永远在放大镜之上，不被镜片吃掉）→ cameraShake 不受影响。
4. **空间不重叠**：放大镜偏置到浮漂侧 + clamp，物理上不覆盖浮漂原位。

---

## 9. 实施落点 + 模块

- **新建** `js/render/d5/magnifier-v2-renderer.js`（不复用已删 v1，handoff §7 要求）
- 接入 `fishing-scene.js`：在 D5 反馈层置顶渲染处（~L1575）调放大镜 render；进 Waiting 记时间戳；reset 时强制 hide
- 复用：`underwater-bob-renderer.js` 的剪影画法（sink 段镜内）、`d5-palette.js` 色板
- main.js bump `?v=20260602m`（接 CodeBuddy 上次 `20260602k`，避开已用字母）

---

## 10. 可调参数（先给默认值，纳入 P1 实战 50 场一起收口）

| 参数 | 默认值 | 备注 |
|---|---|---|
| `MAGNIFIER_DELAY` | 150ms | 老板定，统一 150（不按档位区分——老板已明确"遵守这个设计"）|
| `MAGNIFIER_SIZE` | 180px | 老板定 |
| `MAGNIFIER_ZOOM` | 4× | 老板定；sink 剪影 4× 可能偏糊，P1 实测若需在 3~4× 收口再调 |
| `MAGNIFIER_OFFSET` | 漂半宽+90+留白 | 实测不压漂 |
| S2 微浮幅度 | ±1~2px / 周期 1.5~2.5s | 必须 << shake 幅度 |
| 涟漪间隔 | 4~8s 一圈 | 等待期氛围 |
| 淡入 | 50~80ms | 出现柔和 |
| 淡出 | 0~50ms | 提竿即焚，趋近 0 |

---

## 11. DoD（验收清单，Nina 接力验）

1. 抛竿落水后约 150ms，浮漂侧边淡入圆形放大镜，4× 放大浮漂 ✅
2. 等待期镜内浮漂有微浮 + 偶发涟漪，不呆滞、不穿帮，微动幅度明显小于咬钩抖动 ✅
3. 鱼咬钩 shake 段镜内能看清三档抖动差异；sink 段镜内放大水下剪影下沉 ✅
4. 提竿（中鱼/早提/超时任一）放大镜**立即消失**，无残留、无延迟 ✅
5. 放大镜不遮挡浮漂原位、不压住 PERFECT/可惜字（Z-order 正确）✅
6. 主画面浮漂/剪影/鱼线逻辑零改动（对比 v2.1 行为一致）✅
7. 像素 4× 放大马赛克 + 圆形玻璃边框 + 高光，读作"镜片"✅
8. 不出现 S3 咬钩 punch（无额外金光/震屏/叮音）✅
9. 异常路径（reset / GM 跳转 / 切场景）无放大镜残留 ✅

---

## 12. commit / PR 约定

- commit 前缀 `[d5]`，main.js bump `?v=20260602m`
- 单 PR 即可（放大镜是独立浮层模块，改动集中在新文件 + fishing-scene.js 少量接入）
- PR 附：落水出现 / 等待微动 / shake 跟拍 / sink 跟拍 / 提竿即焚 五段录屏 + §1 grep 截图
- 完成 push main，Nina 接力验收，P1 实战 50 场再收口可调参数
