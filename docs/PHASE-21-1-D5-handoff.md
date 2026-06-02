# PHASE 21-1 D5「鱼咬钩反馈系统」当前状态交接 / Handoff

**移交日期**：2026-06-02（凌晨亲改）
**移交人**：项目负责人（与 Nina 协作团队）
**接手准备**：本文档作为后续工作（手感细调 / 测试 / 平衡）的唯一权威起点

---

## 0. TL;DR

D5 已**全面重构**到 v2.2。鱼咬钩流程：「**抖动 → 沉水 → 提竿**」三拍 + **P0 放大镜浮层**（落水自动出现、提竿即焚）。配合程序合成音效、水下剪影、像素 4× 放大镜。**手感由负责人亲自定稿，不再回退 v2.0**。

**版本演进**：
- v2.0（初版）→ v2.1（2026-06-02 凌晨重构）→ **v2.2（2026-06-02 下午追加 P0 放大镜，按 docs/PHASE-21-1-D5-magnifier-impl-spec.md v1.0）**

---

## 1. 与 v2.0 (原 impl-spec / art-spec / decisions) 的核心差异

| 维度 | v2.0 原设计 | v2.1 当前实际 |
|---|---|---|
| 鱼咬钩前奏 | 浮漂三次下沉 + 程序合成 `playBite()` | **彻底删除**，鱼咬钩瞬间直接进入 BiteWindow |
| BiteWindow 视觉 | 全屏红色半透明闪烁 + 180px 大叹号 + 提示语 | **彻底删除**，反馈完全由 D5 系统承担 |
| BiteWindow 分段 | 单一时间轴 perfect / good / late | **两段**：`shake`（提竿=早提 Failed） + `sink`（perfect/good/late） |
| sink 段时长 | 无此概念 | 比初始设计 **×2**：light 1.4s / medium 1.2s / heavy 1.0s |
| 浮漂沉水视觉 | 无 | 沉水位移 0→32px，过 14px 后切换为**墨蓝椭圆剪影**（`underwater-bob-renderer.js`） |
| 鱼线 | 终点固定在水面浮漂位置 | **跟随浮漂下沉**到水下剪影位置，竿尖→水下连贯抛物线 |
| 放大镜染色蒙版 | A3 决策：multiply 矩形拼环 | **彻底删除**（用户判断 "和我要的放大镜完全不是一个东西"），等用户主导重做 |
| 抖动音 | 无 | 新增 `playBobShakeTick`，按 BiteShakeFrame 12fps 边沿打点 |
| 沉水音 | 无 | 新增 `playBobSink`，"咕咚……"大→小（中频，已提亮） |

---

## 2. 当前 BiteWindow 完整流程

```
鱼咬钩 _startBite()
   │
   ├─ 直接 fsm.transition('BiteWindow')
   ├─ BiteLevelDispatcher.resolve(rarity) 抽档（B3+越档扰动，未动）
   └─ d5.onBiteStart(level)
        │
        ├─ heavy 档：cameraShake 60ms
        └─ 进入 shake zone
              │
   [0 ── shake 段（0.3-0.5s）──]
   ▲ 视觉：浮漂在水面三档抖动（BiteShakeFrame 12fps，逐字 art-spec v1.2）
   ▲ 音效：每帧 dy>0 → playBobShakeTick(level, |dy|/12)
   ▲ 提竿：→ Failed 'early'（FAILED_MESSAGES.early 友好文案，回 Idle 重抛）
              │
   [shakeEnd → onSinkStart()]
   ▲ 水花 emitHeavySplash（全档触发，强化"鱼咬定"）
   ▲ 沉水音 playBobSink(sinkDur) 起拍
              │
   [shakeEnd ── perfect ── good ── late ── total]
   ▲ 视觉：getBobOffset 返回 dy 渐增 0→32px
   ▲ dy >= 14px → hidden=true，原 _drawPixelBob 跳过
   ▲ D5 render 用 drawUnderwaterBob 画墨蓝椭圆剪影（透明度+大小随 sinkProgress 收）
   ▲ 鱼线终点跟着 dy 走
   ▲ 提竿：perfect/good/late → reeling
              │
   [total → timeout]
   ▲ d5.onLateMiss → 「可惜……」字 + 500ms 加速涟漪
   ▲ Failed 'timeout'
```

---

## 3. 三档参数（v2.1.1）

| 档 | shake | sink 总 | 总窗口 | sink 内 perfect/good/late |
|---|---|---|---|---|
| light  | 0.5s | 1.4s | **1.9s** | 0.8 / 0.4 / 0.2s |
| medium | 0.4s | 1.2s | **1.6s** | 0.6 / 0.4 / 0.2s |
| heavy  | 0.3s | 1.0s | **1.3s** | 0.5 / 0.3 / 0.2s |

**档位分配规则未动**：`BiteLevelDispatcher.resolve(rarity)`
- 主映射：rarity 1-2★ → light / 3★ → medium / 4-5★ → heavy
- 越档扰动 70/25/5（B3 决策，未动）

---

## 4. 现存代码地图（D5 v2.2）

```
js/render/d5/
├── d5-palette.js              （12 色调色板 + 字体栈，未动）
├── bite-shake-frame.js        （三档抖动帧表，art-spec v1.2 逐字落码，未动）
├── perfect-text-renderer.js   （PERFECT 字，时长 1200/1400/1600ms）
├── miss-text-renderer.js      （「可惜……」字）
├── clover-glow-renderer.js    （四叶草微光，未动）
├── splash-particle-fx.js      （水花粒子封装，未动）
├── underwater-bob-renderer.js （NEW v2.1：水下剪影）
├── magnifier-v2-renderer.js   （NEW v2.2 P0：圆形放大镜，独立模块）
└── d5-bite-feedback.js        （总控，持有 magnifier 实例统一调度）

js/fishing-scene.js
├── CONFIG.biteWindow.windows  （v2.1.1 两段结构）
├── CONFIG.waiting             （biteSink 三件套已删，仅留 fishSpawnDelay）
├── FAILED_MESSAGES.early      （新增）
├── _startBite()               （彻底改写，无下沉）
├── _updateWaitingBite()       （空函数）
├── _updateBiteWindow()        （四段判定：shake/perfect/good/late）
├── _renderBiteAlert()         （已删除，仅留注释墓碑）
└── _renderRodAndBob()         （鱼线终点叠加 d5.getBobOffset）

js/audio-system.js
├── playBobShakeTick(level, intensity)  （NEW）
├── playBobSink(duration)               （NEW，已提亮到中频）
└── playBite()                          （旧版方法保留但无人调用）
```

**已删除文件**：`js/render/d5/magnifier-tint-renderer.js`

---

## 5. 调参点速查（给后续负责人）

| 想调什么 | 改哪 | 当前值 |
|---|---|---|
| shake / sink 时长比例 | `fishing-scene.js` `CONFIG.biteWindow.windows` | 见 §3 |
| 沉到多深 / 何时切剪影 | `d5-bite-feedback.js` `getBobOffset` | `SINK_MAX_DY=32` / `SINK_HIDE_DY=14` |
| 水下剪影颜色 / 大小 / 透明度 | `underwater-bob-renderer.js` | 墨蓝 `#1A2A3A`，椭圆 9~6 × 14~8，alpha 0.55→0.15 |
| 抖动音基频 | `audio-system.js` `playBobShakeTick` | light 220 / medium 160 / heavy 110 Hz |
| 抖动音音量缩放 | `d5-bite-feedback.js` `_updateShakeAudio` | `Math.min(1, dyAbs/12)` |
| 沉水音音色 | `audio-system.js` `playBobSink` | 主层 360→120Hz，尾层 lowpass 1800→500Hz |
| 早提文案 | `fishing-scene.js` L73 `FAILED_MESSAGES.early` | "太早啦！等浮漂沉下去再提~" 等 |
| heavy 镜头微震时长 | `d5-bite-feedback.js` `onBiteStart` | 60ms |
| BiteLevel 档位分配 | `d5-bite-feedback.js` `_mainTierByRarity / _PERTURB` | 主映射 + 70/25/5 越档 |
| **放大镜尺寸/倍率** | `magnifier-v2-renderer.js` 顶部常量 | `MAGNIFIER_SIZE=200 / R=100 / ZOOM=4 / OFFSET=125` |
| **放大镜出现/消失时长** | 同上 | `MAGNIFIER_DELAY=150ms / FADE_IN_MS=70 / FADE_OUT_MS=180` |
| **镜内浮漂 dy 视觉系数** | 同上 | `MAGNIFIER_DY_SCALE=0.5`（主画面 dy 在镜内显示时打折）|
| **等待期微浮 + 涟漪** | 同上 | `IDLE_BOB_AMP_PX=1 / PERIOD=2s` ；涟漪间隔 4~8s，DUR 900ms |
| **中鱼镜内浮漂自抖** | 同上 | `BITE_SHAKE_MS=240 / AMP=4px`（仅镜内浮漂，镜框不抖）|

---

## 6. 已删除 / 待重建的功能（**不要回滚**）

| 功能 | 状态 | 备注 |
|---|---|---|
| v2.0 三次下沉 biteSink 前奏 | ❌ 删除 | 决定不再使用 |
| v2.0 `AudioSystem.playBite()` 程序合成 | ⚠️ 方法保留但无人调用 | 完全被 v2.1 音效替代 |
| `_renderBiteAlert()` 全屏红屏 + 大叹号 | ❌ 删除 | 完全交给 D5 抖动+沉水反馈 |
| 放大镜染色蒙版（A3 决策，v1） | ❌ 删除 | v2 已重做，见 §6.1 |
| `magnifier-tint-renderer.js` 模块（v1） | ❌ 删除文件 | 由 `magnifier-v2-renderer.js` 取代 |
| `onLateZoneEnter()` / `onLineUp()` 事件钩子 | ✅ 保留为 no-op | 给未来呼吸特效用 |

### 6.1 v2.2 P0 放大镜（2026-06-02 下午新增）

| 项 | 实现 |
|---|---|
| 模块 | `js/render/d5/magnifier-v2-renderer.js` export `D5Magnifier` class |
| 持有方 | `D5BiteFeedback.magnifier`（D5 系统统一调度 update/render） |
| 出现时机 | 进入 Waiting + 150ms 淡入（边沿检测自驱，无需挂事件总线） |
| 消失时机 | 离开 Waiting/BiteWindow 任意路径 → easeInQuad 往正下方滑出 ~一个直径（FADE_OUT_MS=180ms） |
| 尺寸 | 圆形 200×200（R=100） |
| 放大倍率 | 4× 最近邻整数放大（imageSmoothingEnabled=false） |
| 位置策略 | 浮漂在左半屏 → 镜放右；右 → 左；整圆 clamp 在画布内（pad=4） |
| 镜内浮漂 | 像素栅格与 fishing-scene._drawPixelBob 同源 9 色独立重画；shake 段读 d5.getBobOffset().dy ×ZOOM ×0.5（DY_SCALE）；sink 段复用 underwater-bob-renderer 的剪影画法 ×ZOOM |
| 镜内浮漂自抖 | 进入 BiteWindow 边沿触发 240ms 内随机 ±4px 偏移（**仅作用于镜内浮漂，镜框稳定不动**） |
| 等待期微动 | Waiting 期镜内浮漂 ±1px / 2s 周期正弦微浮（IDLE_BOB_AMP_PX=1） |
| 偶发涟漪 | Waiting 期 4~8s 一圈（仅 1 圈活跃），DUR_MS=900 |
| 镜片装饰 | 圆形玻璃边框（金边 #FFE4B5 + 内描 #8B6914）+ 左上 45° 弧形高光 + 内暗角 |
| Z-order | 浮漂/水下剪影 → 涟漪 → **放大镜浮层** → PERFECT/可惜字（最上） |
| reset 兜底 | `_resetToIdle/_resetToWaiting` 显式调 `magnifier.hide()` |
| 不实施 | S3 PUNCH（咬钩瞬间金光/震屏/叮音）—— spec §3 红线，与 D5 主咬钩反馈不重叠 |

---

## 7. 后续工作建议（按优先级）

### ✅ P0 已完成
~~放大镜实施~~ → 2026-06-02 下午按 `docs/PHASE-21-1-D5-magnifier-impl-spec.md` v1.0 实施完成，详见 §6.1

### 🟡 P1 - 平衡 / 数值
2. **三档时间窗实战测试**
   - 跑 50+ 场鱼，统计：early 失败率 / perfect 命中率 / 漏提率
   - 目标：早提率 < 15%，perfect 命中率 30-50%
   - 不达标 → 调 `CONFIG.biteWindow.windows`
3. **音量配比**
   - 当前 sfxGain = 0.4 全局；shake tick 0.18 / sink 主层 0.35
   - 实测如果掩盖 BGM 或被 BGM 掩盖，调比例

### 🟢 P2 - 视觉打磨
4. **水下剪影可优化**
   - 当前是静态椭圆，可加微动（左右随机 ±1px 漂移）
   - 颜色可随场景日夜变化（白天偏蓝、黄昏偏褐）
5. **沉水水花特效**
   - 当前 `emitHeavySplash` 是 heavy 档原专用，全档复用了
   - 可针对 light/medium 做更轻的版本

### 🔵 P3 - 健壮性
6. **死代码清理**
   - `AudioSystem.playBite()` 方法仍在 audio-system.js L210
   - `onLateZoneEnter` / `onLineUp` no-op 是否要彻底删
7. **测试钩子 `window.__D5_TEST`**
   - 当前还在 fishing-scene.js constructor 里
   - 上线前可加 `if (DEBUG)` 包裹

---

## 8. 部署 / 缓存铁律提醒

参考 memory ID 88636153（项目部署铁律）：

- `index.html` 的 `main.js?v=` 已 bump 到 `20260602k`
- 改 JS 文件**必须**同步 bump `main.js?v=`，否则 V8 ES module URL 缓存不重载
- CDN 节点缓存已配为 5 分钟（控制台），不再是 365 天默认值
- 部署后必查：`curl -sI {URL}/js/main.js | grep cache-control` 应为 `max-age=300`
- 美术资源（PNG）单独缓存，必要时在代码内挂 `?v=`（参考 `aming-sprite.js` 处理 v2 sheet 替换）

---

## 9. 相关 spec 文档

### ✅ 有效
- `docs/PHASE-21-1-D5-magnifier-impl-spec.md` v1.0 —— **P0 放大镜实施权威**，已按此实施完成（v2.2）

### ⚠️ 历史参考（v2.0 → v2.1 重构后多数已过时）
- `docs/PHASE-21-1-D5-design.md`
- `docs/PHASE-21-1-D5-impl-spec.md`
- `docs/PHASE-21-1-D5-art-spec.md`
- `docs/PHASE-21-1-D5-art-spec.v1.2-changelog.md`
- `docs/PHASE-21-1-D5-decisions.md`（A3 已废、B3 越档仍有效、C 降级仍有效）

**本 handoff 文档（PHASE-21-1-D5-handoff.md）是 D5 v2.2 状态的唯一权威**；放大镜参数请同时对照 magnifier-impl-spec.md。

---

## 10. 同期附带的非 D5 改动

| 改动 | 文件 | 备注 |
|---|---|---|
| 阿明 walk sheet 替换 | `assets/character/amin/amin-walk-sheet-v2.png` | 用户重画，尺寸 1290×720（spec 期望 1289×720，差 1px 无影响）；`aming-sprite.js` 挂 `?v=20260602h` 强刷浏览器 PNG 缓存 |
| NPC 脚下椭圆阴影 | `js/render/characters.js` 导出 `drawCharacterShadow` + `js/village-scene.js` `_renderNPCs` 接入 | 仅 4 个 NPC（秀兰/阿土伯/林师傅/小芳），椭圆 12×4 `rgba(0,0,0,0.3)`，固定贴地不随 bob 浮动；**阿明本人不画阴影** |

---

_Nina / 团队：拉代码后直接玩，对 sink 段时长 / 音效 / 沉水视觉有任何手感意见，先在群里反馈，不要自行改 `CONFIG.biteWindow.windows` 或音效参数，统一由项目负责人收口。放大镜任务等独立 spec。_
