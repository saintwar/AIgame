# CHANGELOG

所有重要的版本更新记录。

---

## [Unreleased] · PHASE 16-6 仗3 UX 补丁 — 店铺键鼠双通道 & 「华灯初上盖店铺」bug 修

> **现状摸排纠错**：老板任务书预测的 `lin-shop.js` / `lin-shop.css` / DOM rotate 90° 等
> 都不存在 —— 项目店铺是**单一 ShopUI 类全 Canvas 渲染**（林师傅+秀兰共用），
> 视觉一致性参照已落地的 `inventory-ui.js` 仗 16-4.8 仗3 鼠标化范式。
>
> "华灯初上"也不是登录页元素泄漏，而是村庄 `_checkDayNightPhase()` 缺少
> "面板打开时跳过"判断（z-index 战争解不掉，跳过才是正解）。

### 新增（鼠标交互 / 与背包/图鉴严格一致）
- ✕ **关闭按钮**（Canvas 画，`(x+w-40, y+10) 30×30`）
  - 默认 `#d4a574` 描边，hover 时 `#ffd700` 描边 + 半透金底 + 文字变金
  - 与 `inventory-ui` ✕ 按钮几何/视觉规范严格一致
  - 视觉替代规范：本项目是 Canvas，DOM 的 `transform: rotate(90deg)` 不可用，用"金色描边变化"等价表达 hover 反馈
- 🖱 **林师傅 buy 模式键鼠双通道**
  - **Tab**（🎣钓具/鱼饵 / 🧺鱼篓升级）：单击切换；hover 时暖橙描边 + 深色底
  - **商品行**：hover 暖橙黄半透 `rgba(244,217,154,0.18)` + 金色描边
  - **单击商品行** = 选中（与 ↑↓ 等价，无业务）
  - **双击商品行** = 立即购买（与 Enter 等价；防误买）
  - 金币显示往左挪 40px 给 ✕ 按钮腾位
- 🖱 **秀兰 sell 模式鼠标交互**
  - 鱼货行 hover 高亮（暖橙黄 + 描边）
  - **单击鱼货行 = 立即单卖**（与键盘 Enter 一致；卖鱼是高频动作，无双击防误，与 sell 工作流匹配）
  - ✕ 关闭按钮同款（视觉与林师傅完全一致）
- 🖱 **林师傅 menu 模式鼠标交互**（buyOnly=false 路径，目前少用但补齐）
  - 单击「1. 🛒 购买装备」行 = 进入 buy 模式

### 修复
- 🐛 **「华灯初上」金光气泡盖在店铺/背包/图鉴上方**
  - `js/village-scene.js _checkDayNightPhase()` 跳过条件扩充：
    新增 `shopUI.visible / inventoryUI.visible / codexUI.visible` 三个 Canvas 面板跳过
    新增 `.profile-panel.show / .leaderboard-overlay.show` 两个 DOM 面板跳过
  - 真因解读：phase toast 是 `position:fixed z-index:300` DOM 飘字，店铺等 Canvas 面板挂在 canvas 元素上（z-index:0），任何 DOM 弹窗都会盖
  - 不动 z-index 是因为 z-index 战争解不掉（Canvas 是单元素），跳过才是正解

### 改动
- `js/ui/shop-ui.js`
  - 新增 hover 字段 `mouseHoveredClose/mouseHoveredTab/mouseHoveredItem/mouseHoveredMenu`
  - 新增 `_resetHover()`（hide/openLin/openXiulan/切 tab 都调用，避免视觉残影）
  - 新增 `_hitTest(mx,my)` 命中盒（与 render 几何严格同步）
  - 新增 `handleMouseMove/handleMouseClick/handleMouseDblClick` 三大入口
  - 新增 `_renderCloseBtn()`，渲染入口提取
  - `_renderBuyTabs/_renderGearList/_renderBagUpgrades/_renderSell/_renderMenu` 全加 hover 视觉
  - 底部提示语补齐键鼠双通道描述
- `js/village-scene.js`
  - `_clickHandler` / `_moveHandler` 在 inventoryUI 之前插 shopUI 派发分支（与键盘 handleKey 优先级一致）
  - 新增 `_dblClickHandler` + canvas dblclick 事件 + `_unbindInput` 同步解绑
  - `_checkDayNightPhase()` 加 5 个面板跳过条件

### 不变（约束）
- 键盘原有快捷键完全保留（1/2/↑↓/Enter/ESC/B/A）
- 业务逻辑零增量（购买/卖鱼/升级仍走既有 `_buyItem/_sellOne/_sellAll/_buyBagUpgrade`）
- 任务链零回归（q001/q002/q003 全部不动）
- 阿土伯 / 小芳 NPC 身份不变

---

## [Unreleased] · PHASE 16-6 仗3 — 林师傅鱼具店扩展 & q001 鱼饵奖励补丁

> **决策记录**：原指令书"阿土伯=鱼具店主"经现状摸排发现与项目根本不符
> （阿土伯是 q001"阿爸失踪线索"叙事核心 NPC）。主策划改为方案 B：
> **林师傅承接综合鱼具店**（钓具+鱼饵+鱼篓升级），阿土伯/小芳叙事零回归。
>
> 经济分工最终落定：
> - 秀兰阿姨 = 鱼贩（纯收购鱼）✅ 仗 2 已落
> - **林师傅 = 综合鱼具店（钓具+鱼饵+鱼篓升级）✅ 仗 3 实施**
> - 阿土伯 = 叙事 NPC（q001 阿爸失踪线索）保持不变
> - 小芳 = q002 任务 NPC 保持不变

### 新增
- 🧺 **鱼篓 3 阶升级系统**
  - `js/ui/shop-ui.js` 新增导出常量 `BAG_UPGRADES`（不污染 ITEMS 注册表，因升级是状态变更而非物品）：
    - **lv2 藤编大篓**：12 条 / 10kg ── 500 金
    - **lv3 保鲜冰篓**：20 条 / 20kg ── 2000 金
  - 升级业务：扣金币 → 写 `player.fishStorage.{bagLevel,maxSlots,maxWeight}` → `Save.commit()`（云端 saveAll 自动同步整个 player）
  - 已装鱼/fishBag/fishStorage.items **完全不动**，容量上调后老鱼一条都不少
  - 跨级购买防御：`curLevel !== upgrade.bagLevel-1` 一律拒绝并提示"先升级到 XX"
- 🎣 **林师傅店铺双 tab 扩展（buy 模式）**
  - Tab 1「🎣 钓具/鱼饵」：上架 5 件商品（按价格升序）
    - `basic_bait` 5 金 ★ 新上架（之前 ITEMS 已定义但从未售出）
    - `advanced_bait` 20 金、`legendary_bait` 100 金、`bamboo_rod` 300 金、`carbon_rod` 1500 金
    - 鱼饵行追加"（已有 N）"显示，方便玩家心算
  - Tab 2「🧺 鱼篓升级」：3 行展示，状态徽章 ✅当前使用 / ✅已升级 / 🔒需先升级
  - 数字键 `1/2` 切换 tab；`↑↓` 选择；`Enter/Space` 购买；`ESC/B` 关闭
- 💰 **统一购买飘字**
  - 购买商品/升级 → 金色 `-¥X` 飘字 + 副标题"商品图标 名称"或"🎉 升级到 XX"
  - 与卖鱼 `+¥X` 视觉对称（同一个 `_showCoinFloat`）

### 改动
- `js/ui/shop-ui.js`
  - `linBuyList`：`['bamboo_rod','carbon_rod','advanced_bait','legendary_bait']`
    → `['basic_bait','advanced_bait','legendary_bait','bamboo_rod','carbon_rod']`
  - 新增 `buyTab`/`_currentBuyList()`/`_buyBagUpgrade()`/`_renderBuyTabs()`/`_renderGearList()`/`_renderBagUpgrades()`
  - `openLinShop()` 重置 `buyTab = 'gear'`
  - `_buyItem()` 购买成功改为 `_showCoinFloat('-¥X', ...)`（替代纯文字 toast）

### 修复（顺手补丁，严控范围）
- 🐛 **q001 reward.bait 派发缺失**（历史遗留 bug，仅本仗发现）
  - `js/data/quests.js` q001 自始就声明 `reward: { money:50, bait:5 }`
  - 但 `js/quest-system.js` `complete()` 派发逻辑只识别 `money/coin/items`，bait 字段从未发放
  - 本仗在派发块加 `tpl.reward.bait` 分支，统一调 `inventory.add('basic_bait', n)`
  - 仅修 q001（范围内），不动其它 reward 派发逻辑

### 不变（约束）
- 钓鱼**不消耗鱼饵**——本仗只做"购买入库"，差异化效果留仗 4 统一接入
- q003 入店流程不动（`lin_shop` 对话不变）
- `q001/q002/q003` 任务链零回归
- 阿土伯（村长）NPC 身份不变；秀兰收鱼业务不变

---

## [Unreleased] · PHASE 16-6 仗1 — 鱼篓数据 & 背包"渔获"分类

### 新增
- 🪣 **鱼篓数据结构（双轨并存方案 v1.2）**
  - `player.fishStorage` = `{ items, maxSlots:8, maxWeight:5000, bagLevel:1 }`
    - 默认木竹篓：8 条 / 5000g
  - `player.fishBag` 保持不动（个体精确数据，卖鱼/任务依赖零回归）
  - 新增工具模块 `js/fish-storage.js`：
    - `syncFishStorage(player)`：从 fishBag 全量重算 items（老存档兜底）
    - `addFishToStorage(player, fishData)`：增量累加（同种 +1 / 新种 push）
    - `checkFishStorageCapacity(player, fish)`：入篓预检（条数+重量任一超限即拒）
    - `computeBagWeight(bag)`：fishBag 实时聚合总重
- 🎒 **背包「渔获」分类（首位、默认打开）**
  - 顶部双轨容量条：条数 X/8 + 重量 Yg/5000g
  - 满载（任一轨打满）→ 双轨变红 + 右上角"⚠ 鱼篓已满"提示
  - 接近满（≥85%）→ 黄色警戒色
  - 条目堆叠展示：图标 / 名称 ×count / 均重 / 总重
  - 空状态文案："（鱼篓空空，去日月潭钓几条吧～）"

### 改动
- `js/save-system.js`：默认存档 `version: 1 → 2`，`migrate()` 兜底注入 fishStorage 字段（老档自动 from-fishBag 重算）
- `js/fishing-scene.js` `_onFishCaught()`：入篓前调用 `checkFishStorageCapacity`
  - 满载 → DOM 飘字"🪣 鱼篓已满，请先回村卖鱼"，本次鱼**不入 fishBag、不入 fishStorage**
  - 通过 → fishBag.push（原逻辑保留）+ addFishToStorage 同步堆叠副本
  - 满载**不影响** codex 解锁 / 称号 / q001/q002/q003 进度（避免稀有鱼图鉴丢失）
- `js/main.js` 启动时调用 `syncFishStorage(player)` 一次性兜底老存档
- `js/ui/inventory-ui.js`：tabs 4 → 5（渔获置首），数字键 1-5、tab 宽度 175 → 145、间距 185 → 152
- 鼠标 hit-test 已同步新几何，hover/点击零回归

### 不变（约束）
- `shop-ui` / `quest-system` 完全不动，继续读 `fishBag` 个体数据
- 卖鱼计价仍按个体 `size/rarity/basePrice`（仗 2 才扩展）
- 满载决策弹窗（仗 2 引入）

---

## [v2.0.0] - 2026-05 · 阶段二·水社村

### 新增

- 🏘️ **水社村场景**
  - 20×11 tile 地图，1280×720 HD
  - 4个建筑：村长家、钓具店、阿明家、7-11
  - 广场、码头、钓点区域
  - 程序化地图生成

- 👥 **4个 NPC**
  - 秀兰阿姨（妈妈）：引导玩家
  - 阿土伯村长：任务发布者
  - 林师傅：钓具店老板
  - 小芳：杂货店店员

- 💬 **对话系统**
  - 打字机效果（可调节速度）
  - 翻页 + 跳过功能
  - 已读对话3倍速快进
  - 旁白模式（黑底白字）

- 📋 **任务系统**
  - 第一个任务 `q001_first_fish` "潭边的早晨"
  - 接取 / 进度追踪 / 完成 / 奖励
  - 飘字动画反馈

- 🔄 **场景切换**
  - 村庄 ↔ 钓鱼
  - 200ms 黑场过渡

- 🎬 **开场序列**
  - 4句旁白（日月潭的雾...）
  - 标题卡淡入

- ➡️ **新手引导系统**
  - 动态箭头指向目标
  - 操作提示卡

- 🗺️ **UI 组件**
  - 任务面板（Q键打开）
  - 小地图（圆形 + 投影 + 20%放大）
  - NPC 头顶标记（! ? ✓ 黄色描边）

- 🔊 **程序化音效系统**
  - 村庄环境音：风声 + 鸟鸣
  - 钓鱼环境音：水声
  - UI 音效：脚步声、对话咔嗒、翻页、菜单、任务、钓到鱼
  - 零外部资源依赖

- 🐛 **调试 HUD**
  - 性能面板（FPS 滑动窗口均值）
  - 玩家状态（坐标、方向、速度）
  - 任务状态（进度、目标位置）
  - 存档信息（金钱、标志位）
  - 调试热键（F1/F2/F3）

- 💥 **全局错误兜底**
  - 友好错误页（中文提示）
  - 刷新重试 / 清档重启按钮

### 升级

- 画布：960×600 → 1280×720（720p HD）
- 钓鱼场景：硬编码坐标全部改为相对画布比例（ch*0.x）
- 场景过渡：linear → cubic-bezier ease-in-out
- 鱼竿渲染：跟随人物右手位置 + 浮动同步
- 鱼头朝向：按住空格向右，逃跑向左
- 结算界面：鱼居中显示，提示框居中
- 小地图：矩形 → 圆形 + 投影 + 放大20%

### 文件清单

- **新增** `js/audio-system.js` - 程序化音频系统
- **新增** `js/data/npcs.js` - NPC 定义
- **新增** `js/data/dialogues.js` - 对话脚本
- **新增** `js/data/quests.js` - 任务定义
- **新增** `README_阶段二.md` - 项目说明
- **新增** `CHANGELOG.md` - 版本日志
- **新增** `favicon.ico` - 消除404

---

## [v1.0.0] - 2026-04 · 阶段一·钓鱼核心玩法

### 新增

- 🎮 **8状态机钓鱼系统**
  - Idle → Aiming → Casting → Waiting → BiteWindow → Playing → Reeling → Caught/Failed

- 🐟 **80种鱼数据**
  - 稀有度分级（1-5星）
  - 价格、尺寸、颜色、概率

- 📝 **钓鱼场景独立原型**
  - `fishing_prototype.html` 可独立运行调试

---

*Format inspired by [Keep a Changelog](https://keepachangelog.com/)*