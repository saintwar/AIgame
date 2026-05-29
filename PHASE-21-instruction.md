# PHASE 21 — 屋顶斜檐可走 + Y-sort 遮挡（A 方案 · 最终版）

> 决策：老板拍板 A 方案。总工时 3d。本指令书为 CodeBuddy 唯一执行依据。
> 范围：水社村地图 `shuishe`。其他地图沿用旧逻辑，本期不动。

---

## 0. 严格红线（违反即回退）

1. **不许动 `walkable` 网格生成逻辑**：寻路依然走原 walkable，本期只新增 `blockRect` 物理碰撞 + `sortAnchorY` 渲染排序两层数据。
2. **不许重画任何素材**：屋顶斜檐"看起来能走"是美术既成事实，本期只通过数据 + 渲染让它**真的能走**。
3. **不许动 A* 寻路 / NPC 巡逻 / 玩家移动核心代码**：碰撞接入只在 `MovementSystem.tryMove()` 末端加一道 `blockRect` 拦截。
4. **不许改 `obstacles-shuishe.json` 的 schema 字段名**：本期定义即长期合约，后续地图沿用。
5. **不许在运行时动态生成 sortAnchorY**：必须策划/数据预填，运行时只读。

---

## 1. 总目标 & DoD（7 项验收）

A 方案 = **屋檐可走 + Y-sort 遮挡**：玩家走到屋檐下方时被屋顶部分遮挡（伪 2.5D），且斜檐区域物理可通行。

### 总验收 DoD（全部通过才算 PHASE 21 关闭）

| # | 验收项 | 判定方式 |
|---|--------|----------|
| 1 | `obstacles-shuishe.json` 4 个建筑全字段齐全，schema 校验通过 | 跑 `validate-collision.html` 无红字报错 |
| 2 | 玩家可从屋檐下方走过，**不会被旧 walkable 阻挡** | 实机走位，覆盖阿明家/秀兰家屋檐 |
| 3 | 玩家进入 `blockRect` 区域被正确拦截（建筑墙体不可穿） | 撞墙测试 4 个建筑 |
| 4 | 玩家 y < 建筑 sortAnchorY 时被屋顶遮挡，y ≥ 时显示在屋顶之上 | 录屏走入走出 |
| 5 | 树/菜地/栅栏的 Y-sort 与玩家正确穿插 | 实机绕树一圈无穿帮 |
| 6 | 帧率不掉（≥ 原版 -2 fps 以内） | Profiler 对比 |
| 7 | 关闭 `obstacles-shuishe.json` 加载（feature flag）后，行为完全回退到 PHASE 20 | 一键开关验证 |

---

## 2. 子 PHASE 拆分

### PHASE 21-A：数据补全（1.5d）

**目标**：产出完整的 `obstacles-shuishe.json`，覆盖 4 个建筑 + 所有树/菜地/栅栏。

#### 交付物
- `assets/data/obstacles-shuishe.json`（基于本指令书附带的 template 扩充）
- 一份《字段填写说明》写在 json 顶部注释区（template 已含）

#### 实施步骤
1. 拉取 template（本包附带 `obstacles-shuishe-template.json`），放到 `assets/data/`。
2. 4 个建筑（阿明家/秀兰家/钓具店/7-11）已预填，**核对 `blockRect` 是否与现有 128×64 物理矩形一致**，不一致以现有物理数据为准。
3. 树/菜地/栅栏：打开 `validate-collision.html`，对照游戏截图逐个框选，填入数组。
   - 每个 obstacle 必须填齐：`id / type / rect / blockRect / sortAnchorY / occluder`
   - `sortAnchorY` 经验值：建筑取屋檐底沿 y；树取树干根部 y；栅栏取栅栏底边 y。
4. 保存后用 `validate-collision.html` 全量校验，无红字报错即过关。

#### 验收清单
- [ ] 文件存在且 JSON 合法
- [ ] 4 个建筑字段全齐
- [ ] 所有 obstacle `id` 唯一
- [ ] `blockRect` ⊆ `rect`（物理框不大于视觉框）
- [ ] `sortAnchorY` 在 `rect.y` 与 `rect.y + rect.h` 之间
- [ ] `version` 字段为 `"21.0"`

#### 回退
直接删除 `assets/data/obstacles-shuishe.json`，21-B/21-C 的加载代码会走 fallback 逻辑（视为无数据，回到 PHASE 20 行为）。

---

### PHASE 21-B：碰撞接入（0.5d）

**目标**：把 `blockRect` 接入移动系统，拦截非法穿墙；**不动 walkable，不动 A***。

#### 交付物
- `src/systems/ObstacleService.ts`（新增）：加载 + 查询 obstacles
- `src/systems/MovementSystem.ts`（修改）：在 `tryMove` 末端加 `blockRect` 拦截
- Feature flag：`config.useObstacleJson = true`

#### 实施步骤
1. 新建 `ObstacleService`：
   - 启动时读 `obstacles-shuishe.json`，构建 `Map<id, Obstacle>` + 空间分桶（64px 网格，加速查询）
   - 提供 `queryBlockAt(x, y): Obstacle | null`
   - 加载失败/flag 关闭时，所有查询返回 `null`（即不生效）
2. 修改 `MovementSystem.tryMove(entity, dx, dy)`：
   ```
   原逻辑：walkable 检查 → 通过则移动
   新逻辑：walkable 检查 → 通过 → ObstacleService.queryBlockAt(newX, newY) → 命中则拒绝
   ```
3. **不要**把 blockRect 写回 walkable，**不要**让 A* 知道 blockRect（NPC 巡逻路线已经是离线烘焙，不会走进 blockRect）。

#### 验收清单
- [ ] 玩家撞 4 个建筑墙体被正确拦截
- [ ] 玩家可走屋檐下方（walkable=true 且 blockRect 不覆盖该处）
- [ ] NPC 巡逻路线无异常
- [ ] flag 关闭时行为 = PHASE 20

#### 回退
`config.useObstacleJson = false`，一行配置回退。代码层 `ObstacleService` 不会被调用。

---

### PHASE 21-C：Y-sort 渲染（1d）

**目标**：基于 `sortAnchorY` 实现玩家与建筑/树/栅栏的前后遮挡。

#### 交付物
- `src/render/YSortLayer.ts`（新增）：可排序渲染层
- `src/render/Renderer.ts`（修改）：把建筑/树/栅栏/玩家/NPC 全部丢进 YSortLayer
- `occluder` 字段支持：建筑屋顶部分作为独立 sprite 参与排序

#### 实施步骤
1. `YSortLayer` 内部维护一个数组，每帧 `sort by sortAnchorY ASC`，再依次绘制。
2. 玩家/NPC 的 `sortAnchorY = entity.y`（脚底 y）。
3. 建筑的渲染拆为两段：
   - **底座**（墙体下半部分）：永远画在玩家下方，`sortAnchorY = -Infinity` 或单独 base 层
   - **occluder**（屋顶 + 屋檐上半）：参与 Y-sort，`sortAnchorY` 取 json 中的值
4. 树/栅栏直接整体参与 Y-sort。
5. **性能**：每帧 sort 控制在 O(n log n)，n < 200，无压力；如掉帧则改为脏标记 + 插入排序。

#### 验收清单
- [ ] 玩家走到屋檐下方时被屋顶遮挡上半身
- [ ] 玩家走出屋檐后立刻显示在屋顶之上
- [ ] 玩家绕树一圈无穿帮（前后正确切换）
- [ ] 帧率 ≥ 原版 -2 fps
- [ ] 关闭 flag 后回到 PHASE 20 渲染顺序

#### 回退
`config.useObstacleJson = false` 时，YSortLayer 退化为按原图层顺序绘制（建筑整体一张图，无 occluder 拆分）。

---

## 3. 风险表

| # | 风险 | 概率 | 影响 | 应对 |
|---|------|------|------|------|
| R1 | 美术屋檐 sprite 未拆分图层，无法单独提取 occluder | 中 | 高 | 用整张建筑图作 occluder，sortAnchorY 取屋檐底沿；视觉牺牲极小 |
| R2 | sortAnchorY 经验值不准导致穿帮 | 高 | 中 | 用 `validate-collision.html` 黄线可视化逐个调，1 小时内可调完 |
| R3 | blockRect 与 walkable 冲突（walkable=false 但 blockRect 没覆盖到，反之亦然） | 中 | 中 | 21-B 接入后做一轮全图巡检，以 walkable 为准，blockRect 仅做补充拦截 |
| R4 | NPC 巡逻路径穿过 blockRect（理论不会，但保险） | 低 | 中 | 21-B 不让 A* 感知 blockRect，但加一条日志：NPC 撞 blockRect 时输出 warn，便于发现脏数据 |
| R5 | 性能下降（每帧 sort + 查询） | 低 | 中 | 空间分桶 + 脏标记排序；预留性能开关 |
| R6 | 数据填错导致玩家卡死 | 中 | 高 | feature flag 一键回退；validate 工具强校验 blockRect ⊆ rect |

---

## 4. 全量回退方案

任一阶段出问题，按以下顺序回退：

1. **C 出问题** → 关 flag，回到 PHASE 20 渲染；保留 21-A 数据 + 21-B 碰撞。
2. **B 出问题** → 关 flag，整套 obstacle 系统失效；保留 21-A 数据备查。
3. **A 出问题（数据错）** → 删除 `obstacles-shuishe.json`；代码层自动 fallback，等同 PHASE 20。
4. **彻底回退** → `git revert` 21-B/21-C 的 commit，删除 `obstacles-shuishe.json`、`ObstacleService.ts`、`YSortLayer.ts`，恢复 `MovementSystem.ts` / `Renderer.ts` 到 PHASE 20。

每个阶段独立 commit，commit message 前缀：`[PHASE21-A]` / `[PHASE21-B]` / `[PHASE21-C]`，便于精准 revert。

---

## 5. 提交节奏

| 时间点 | 产物 |
|--------|------|
| Day1 上午 | 21-A 数据 50%（4 建筑完成） |
| Day1 下午 | 21-A 数据 100%（树/栅栏/菜地完成 + validate 通过） |
| Day2 上午 | 21-B 完成 + 自测 |
| Day2 下午 ~ Day3 上午 | 21-C 完成 |
| Day3 下午 | 全量 DoD 验收 + 录屏交付 |

---

## 6. CodeBuddy 注意事项

- 所有改动**只影响 `shuishe` 地图**，通过 `mapId === 'shuishe'` 判断后再启用。
- 提交前必跑：`validate-collision.html` 全绿 + 实机走位录屏 30s。
- 任何"我觉得应该顺便改一下"的冲动 = 违反红线，原地停手找主程。

— END —
