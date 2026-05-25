# CHANGELOG

所有重要的版本更新记录。

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