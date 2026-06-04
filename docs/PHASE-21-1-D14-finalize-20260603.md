# PHASE 21-1 D14 收尾交付 · 团队同步（2026-06-03）

> 提交：`fd7bba9`（feat: PHASE 21-1 D14 hotfix-l~t）
> 主入口：`index.html` → `js/main.js?v=20260603f`
> 线上：<https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/>
> 状态：✅ 已上线 / 已验收 / D14 阶段完结

---

## 0. TL;DR

- **D14 鱼群行为系统**（commit `9037645`）+ **hotfix-l~t 共 9 轮微调**全部合并上线。
- 完成 4 件大事：① 鱼池单一数据源 + 钓竿/鱼池解耦 + q003 门禁；② HP 战斗模型从"每帧扣血"改为"3 秒 tick"；③ 扣血四件套反馈（震动+飘字+音效+粒子）；④ 全部 10 条鱼**平均净扣血 ≥ +0.5/秒**，再无"打不死的鱼"。
- UI 收尾：拉力条隐藏数字与填充格、加 "请控制在安全区内" 文案、安全区内免疫 escape、放大镜下方"重新抛竿"按钮。
- 下一步：可进入 D15 或返回 spec 拍板下一项决策。

---

## 1. 架构级重构（hotfix-n）

### 1.1 鱼池单一数据源
- **删除** `js/FISH_POOL.js`（旧渲染色板表）
- **唯一** `js/data/fish-pool.js → SHUISHE_FISH_POOL`，每条鱼新增 `color` 字段（迁移自旧表）

### 1.2 钓竿 ↔ 鱼池 解耦
| 旧设计 | 新设计 |
|---|---|
| 钓竿 `rarityUnlock` 决定能钓哪些鱼 | 钓竿不再过滤鱼池 |
| ★1 竿只能钓 ★1~★2 | 任何竿都能上任何鱼（中钩概率不变） |
| — | 钓竿能力体现在 `damageMul`（★1=1.0 / ★3=1.5 / ★5=2.5）和 `bigFishBonus` 体长加权 |

`rarityUnlock` 字段 @deprecated 保留兜底（防外部引用断裂），`rollFishWithRod` 不再使用。

### 1.3 ★4/★5 门禁改为任务驱动
- 旧：钓竿等级过滤
- 新：`q003` 任务状态过滤（`getAvailableFish()` 检查 `window.questSystem.getStatus('q003')`）
- q003 未完成 → 鱼池仅返回 `rarity ≤ 3`；完成 → 全鱼池开放

### 1.4 HP 战斗模型重构
| 旧 | 新 |
|---|---|
| `fishHP -= hpDrain * dt`（每帧细粒度扣血） | `safeTickTimer += dt; if (timer >= 3) { fishHP -= hpPerTick * rod.damageMul; timer = 0 }` |
| 玩家难感知"我在打鱼" | 3 秒一跳，配合反馈四件套，玩家明确感知"这一击打中了" |

`hpDrain` 字段 @deprecated 保留兜底。

---

## 2. 扣血反馈四件套（hotfix-o）

每次安全区 tick 扣血瞬间触发：

| 反馈 | 说明 |
|---|---|
| **A. 鱼震动** | 鱼精灵 ±4px 随机偏移，持续 200ms |
| **B. 飘字** | 红色 `-N`（N=本次扣血量×damageMul），上飘 0.8s 后淡出 |
| **D. 音效** | `playFishHit` —— 180Hz square（中钝击感）+ 520Hz triangle（高频金属感）混合 |
| **E. 粒子** | 6 个 `#FFD700` 金色小方块从鱼位置向四周扩散 |

（C 槽位是预留的屏幕震动，最终决定不加避免眩晕）

---

## 3. 回血系统差异化与平衡（hotfix-o → hotfix-t）

### 3.1 设计原则
- `hpRecoverPerSecond` 按鱼个体配置（写在 `SHUISHE_FISH_POOL` 每条记录里）
- 废弃全局 `cfg.fishHPRecoverPerSecond = 8`
- 回血上限 `fishHPMaxRecoverRatio = 1.0`（满血）
- **底线**：所有鱼平均净扣 ≥ +0.5/秒，保证"全程安全区不离开"也必能击败（不再出现因 recover > drain 而永远拉不动的鱼）

### 3.2 最终数值表

平均净扣/秒 = `hpPerTick / 3 − hpRecoverPerSecond`

| 鱼 | 稀有度 | HP | hpPerTick | recover/s | **净扣/秒** | **裸竿击败时间** |
|---|---|---|---|---|---|---|
| 奇力鱼 | ★1 | 30 | 8 | 1.0 | **+1.67** | ~18s |
| 罗非鱼 | ★1 | 25 | 8 | 1.0 | **+1.67** | ~15s |
| 草鱼 | ★2 | 50 | 6 | 0.8 | **+1.20** | ~42s |
| 曲腰鱼 | ★2 | 65 | 6 | 1.0 | **+1.00** | ~65s |
| 翘嘴鲌 | ★3 | 80 | 5 | 0.7 | **+0.97** | ~82s |
| 鲈鱼 | ★3 | 90 | 5 | 0.9 | **+0.77** | ~117s |
| 鲤鱼 | ★4 | 120 | 4 | 0.6 | **+0.73** | ~164s |
| 总统鱼 | ★4 | 130 | 4 | 0.6 | **+0.73** | ~178s |
| 鱼王 | ★5 | 200 | 3 | 0.5 | **+0.50** | ~400s |
| 潭神 | ★5 | 180 | 3 | 0.5 | **+0.50** | ~360s |

> ★5 配合 ★5 钓竿 `damageMul = 2.5×` 实际约 2.5 分钟拉上岸，符合"传说级挑战"定位。

---

## 4. 玩法 UX 收尾（hotfix-l ~ hotfix-s）

### 4.1 安全区免疫 escape（hotfix-q）
`tension ∈ [40, 70]` 时 `_checkEscape()` 直接 `return false`，玩家在黄金区内不会因鱼挣扎随机被甩竿。

### 4.2 拉力条最终样式（hotfix-r/s）
保留：
- 底色框（黑棕像素）
- 半透明绿黄金区（40% ~ 85%）
- ▲ 指针（米白+深棕描边）
- ≥85% 红色闪烁外框 + 全屏红闪 + ⚠ 鱼线拉力极限 ⚠ 木牌

隐藏：
- "鱼线拉力 X/100" 数字行
- 随 tension 增减的彩色填充格（`_drawPixelTensionBar` 传 `ratio=0`）

新增：
- 条下方文字 `"请控制在安全区内"`（12px 米白 + 深棕描边，与条水平居中）

### 4.3 其他
- **放大镜下方"重新抛竿"按钮**（hotfix-l/m）：110×28，米白底+深棕描边
- **放大镜镜内浮漂 dx 修复**（commit `c8fcefc`）：前戏晃动按 `ZOOM = 4` 倍率正确放大，不再出现"镜内不动镜外动"穿帮

---

## 5. 关键文件清单

| 文件 | 改动 |
|---|---|
| `js/data/fish-pool.js` | 鱼池统一 + color 字段 + q003 门禁 + rollFishWithRod 解耦 + 全部数值调整 |
| `js/data/items.js` | 钓竿 `damageMul` 新增（1.0 / 1.5 / 2.5） |
| `js/fishing-scene.js` | `_selectFish` / `_buildCurrentFish` / `_onFishHit` / `_updatePlaying`（3秒 tick）/ `_renderTensionBar` / `_drawPixelTensionBar` / 安全区 escape 免疫 |
| `js/systems/fish-group-system.js` | D14 主系统：BobberApproachFSM + panic/escape/decay 三段曲线（commit `9037645` 已上线） |
| `js/render/d5/magnifier-v2-renderer.js` | 收竿按钮 + dx ZOOM 修复 |
| `js/render/d5/d5-bite-feedback.js` | `isLuckyBail` 短路（笨鱼豁免不触发咬钩反馈） |
| `js/audio-system.js` | `playFishHit`（180Hz square + 520Hz triangle） |
| `js/FISH_POOL.js` | **已删除** |
| `index.html` | `main.js?v=20260530a` → `?v=20260603f`（强制 V8 module 重载） |

---

## 6. 测试入口

无痕窗口打开 <https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/>

推荐验收路径：
1. 新存档进游戏 → 直奔水社码头 → 抛竿 → 验证 D14 鱼群随机布局 + 受惊曲线
2. 进战斗 → 观察 3 秒一跳的扣血（看到 `-N` 红字 + 听到双频音效 + 金粒子飞溅）
3. 把拉力压在 40~70 黄金区不动 → 验证不会 escape + 鱼必死（约 15s 起，鱼王最长 6 分钟）
4. 拉力故意推到 ≥85% → 红闪警告 + ⚠ 木牌
5. 拉力故意降到 <40% → 鱼线松断失败流程
6. 钓到鱼 → 用 ★1 竿 vs ★3 竿对比同一条鱼的击败时间（验证 damageMul 生效）

---

## 7. 下一步

D14 阶段已**完结**。可选方向：
- **D15**：spec 拍板下一项（如鱼图鉴 UI、深水区开放、特殊天气钓法等）
- **返工**：若数值需进一步调整（如 ★5 还是太久），告知目标击败时间即可反推
- **bug fix**：若线上有玩家反馈新 issue，单独 hotfix-u 处理

> 改动稳定，欢迎大家上线体验+提反馈。
