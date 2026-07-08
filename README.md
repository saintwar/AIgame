# 🎣 《宝岛钓手：少年阿明的传说》

> **水社村钓鱼物语** — 一款基于 HTML5 Canvas 的像素风钓鱼 RPG，1280×720 HD，零后端依赖即可单机游玩，云端排行榜可选接入。

| 入口 | 链接 |
|---|---|
| 线上正式版 | https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/ |
| 本地开发 | `python3 -m http.server 8000` → http://localhost:8000/ |
| 早期原型 Demo | `fishing_prototype.html`（仅钓鱼 FSM 验证） |

---

## 📖 故事背景

少年阿明生活在日据时期遗留下来的水社村（台湾南投县鱼池乡）。母亲秀兰、村长阿土伯、钓具店林师傅、7-11 店员小芳……每个人都有自己的故事。你的任务是帮阿明从一根竹竿开始，钓遍日月潭的奇鱼异兽。

**主线任务链**（`js/data/quests.js`）：

| ID | 名称 | 发布人 | 目标 | 奖励 |
|---|---|---|---|---|
| q001 | 潭边的早晨 | 阿土伯 | 钓 3 条奇力鱼 | 100 金 + 5 蚯蚓 |
| q002 | 潭中百味 | 小芳 | 集齐 5 种不同鱼 | 200 金 + 3 高级鱼饵 |
| q003 | 林师傅的考验 | 林师傅 | 卖鱼赚 300 金 + 钓到翘嘴鲌 | 竹制钓竿 |

---

## 🕹️ 玩法

### 核心循环

```
村庄（社交/经济） ──走到钓点──▶ 钓鱼场景（战斗/收集）
       ▲                              │
       └──── 卖鱼 / 休整 / 接任务 ──────┘
```

### 钓鱼 FSM（`js/fishing-scene.js`）

8 状态机：`Idle → Aiming → Casting → Waiting → BiteWindow → Playing → Reeling → Caught/Failed`

- **Aiming**：鼠标长按蓄力（0-33% 弱 / 34-66% 中 / 67-95% 强 / 96-100% 断线）
- **BiteWindow**：浮漂"轻/中/猛"三档抖动 + 放大镜提示，限时内提竿
- **Playing**：鱼血量（HP）+ 玩家拉力条（Tension）双向博弈
  - 安全区（绿色）持续 3s → 扣 1 滴鱼 HP
  - 持按 Space 累计拉力；过力（>85）绷断，跑鱼
  - 放松（!Space）回张力 + 鱼回血
- **Combo**：连续 tick 安全区触发连击（×1.0 → ×1.5 封顶）

### 操作

| 场景 | 操作 |
|---|---|
| 村庄 | 鼠标点击地面（寻路）/ 点击 NPC（对话）/ 走近触发点（钓鱼/挖蚯蚓） |
| 钓鱼 | 鼠标长按蓄力抛竿 / 空格 / Space 拉线 / 点击判定提竿 |
| 全局 | `B` 图鉴 / `I` 背包 / `H` 回家 / `V` 个人主页 / `Ctrl+G` GM 指令 |
| 调试 | `Ctrl+G` → `GM.run("quest list")` / `GM.run("fish give qiliyu 5")` |

---

## 🐟 鱼池（`js/data/fish-pool.js`）

10 种鱼按 5 星稀有度分级。鱼池门禁：
- **q001 进行中** → 锁池为奇力鱼（100% 抽中，新手保护）
- **q003 未完成** → 屏蔽 ★4/★5 鱼
- **其他** → 全鱼池开放

| 稀有度 | 鱼种 | 售价 | 行为模式 | 击败时间（裸竿） |
|---|---|---|---|---|
| ★1 | 奇力鱼 / 罗非鱼 | 5-8 | none | ~18s |
| ★2 | 草鱼 / 曲腰鱼 | 15-20 | none / surge | ~50s |
| ★3 | 翘嘴鲌 / 鲈鱼 | 30-40 | surge / erratic | ~100s |
| ★4 | 鲤鱼 / 总统鱼 | 60-500 | surge / erratic | ~180s（q003 后） |
| ★5 | 日月潭鱼王 / 潭神使者 | 3000-5000 | mythic | ~400s（q003 后） |

每种鱼在 `assets/fish/<id>.png` 都有手绘水墨风 PNG（512×512，`<fish-sprite-loader.js>` 懒加载）。

---

## 🏗️ 技术栈

- **渲染**：原生 HTML5 Canvas 2D，1280×720 锁画幅，pixelated 缩放
- **模块**：ES Module（`<script type="module">` + `defer`），82 个 JS 文件
- **后端（可选）**：腾讯云 CloudBase（数据库 NoSQL + 云函数）
  - 排行榜（`archiveLeaderboard`，每日 15:00 北京时归档）
  - 玩家档案 + 昵称系统
- **数据**：纯静态 JSON / JS 常量表，无运行时数据库依赖
- **字体**：TencentSans-W7 子集化 woff2（235KB，覆盖全项目 ~1300 汉字）
- **资源**：纯静态资源，11 张鱼 PNG + 5 张 NPC 精灵图 + 阿明帧动画 21 帧

---

## 📂 项目结构

```
宝岛钓手：少年阿明的传说/
├── index.html                    # 入口 HTML（含 splash loader + 全部 <script> 引用）
├── fishing_prototype.html        # 早期钓鱼原型（独立运行）
├── README.md                     # 本文件
├── CHANGELOG.md                  # 553 行版本变更日志（Keep a Changelog 风格）
├── PHASE-21-instruction.md       # PHASE 21 指令书（屋顶斜檐 + Y-sort）
├── cloudbaserc.json              # 腾讯云 CloudBase 配置
│
├── js/
│   ├── main.js                   # 入口：场景注册 + 系统初始化
│   ├── village-scene.js          # 村庄场景（NPC/寻路/对话/任务/挖蚯蚓）
│   ├── fishing-scene.js          # 钓鱼场景（8 状态机 + 战斗反馈 + 战斗系统）
│   ├── scene-manager.js          # 场景切换 + transition overlay
│   ├── save-system.js            # localStorage 存档（兼容老版本）
│   ├── input-manager.js          # 全局输入管理
│   ├── click-to-move.js          # 鼠标点击 A* 寻路（手写 60 行）
│   ├── cloudbase.js              # CloudBase SDK 适配层
│   ├── leaderboard-system.js     # 排行榜数据层（fire-and-forget 提交）
│   ├── profile-system.js         # 玩家档案 + 昵称
│   ├── title-system.js           # 称号系统
│   ├── inventory-system.js       # 鱼篓 + 物品
│   ├── equipment-system.js       # 钓竿装备
│   ├── codex-system.js           # 鱼图鉴
│   ├── quest-system.js           # 任务系统
│   ├── dialogue-system.js        # 对话系统
│   ├── stamina-system.js         # 体力系统
│   ├── fish-storage.js           # 鱼篓堆叠（双轨同步）
│   ├── audio-system.js           # 音频管理
│   ├── audio-manager.js          # 音频播放
│   ├── gm-commands.js            # GM 指令（调试用）
│   ├── gm-ui.js                  # GM 面板 UI
│   ├── digging-system.js         # 挖蚯蚓小游戏
│   │
│   ├── data/                     # 数据表（业务配置）
│   │   ├── fish-pool.js          #   鱼池（10 种鱼 + q001/q003 门禁）
│   │   ├── fish-codex.js         #   鱼图鉴元数据
│   │   ├── fish-behavior.js      #   鱼行为模式（surge/erratic/mythic）
│   │   ├── bait-effects.js       #   鱼饵效果
│   │   ├── items.js              #   物品表
│   │   ├── npcs.js               #   NPC 数据（4 个）
│   │   ├── dialogues.js          #   对话脚本
│   │   └── quests.js             #   任务数据
│   │
│   ├── systems/                  # 子系统
│   │   ├── cast-aim-system.js    #   抛投瞄准
│   │   ├── fish-group-system.js  #   鱼群管理
│   │   ├── fish-group-hover-ui.js
│   │   └── water-splash-fx.js    #   水花特效
│   │
│   ├── services/
│   │   └── obstacle-service.js   # 像素级碰撞服务（PHASE 21）
│   │
│   ├── render/                   # 渲染层
│   │   ├── village-bg.js         #   村庄美术底图
│   │   ├── fishing-bg.js         #   钓鱼场景底图
│   │   ├── aming-sprite.js       #   阿明帧动画（村庄）
│   │   ├── aming-fish-sprite.js  #   阿明帧动画（钓鱼）
│   │   ├── characters.js         #   通用角色渲染
│   │   ├── npc-sprite-renderer.js#   NPC 精灵图共享渲染器
│   │   ├── npc-xiulan.js / -atubo.js / -linshifu.js / -xiaofang.js
│   │   ├── buildings.js          #   建筑程序化绘制（兜底）
│   │   ├── buildings-art.js      #   建筑美术贴图元数据（PHASE 21）
│   │   ├── ship-sprite.js        #   渔船
│   │   ├── fish-sprite-loader.js #   鱼 PNG 懒加载
│   │   ├── title-bg.js           #   标题画面
│   │   ├── atmosphere.js         #   大气层（阳光/云）
│   │   ├── day-night.js          #   昼夜循环
│   │   ├── dusk-effects.js       #   黄昏效果
│   │   ├── reflections.js        #   水面反射
│   │   ├── fireflies.js          #   萤火虫
│   │   ├── farmland.js / flowerbed.js
│   │   ├── name-tag.js           #   NPC 头顶名字框
│   │   ├── palette.js            #   调色板
│   │   └── d5/                   #   D5 鱼咬钩反馈子模块（magnifier 等）
│   │
│   └── ui/                       # UI 面板（DOM）
│       ├── splash-loader.js      #   启动 Loading 条
│       ├── nickname-dialog.js    #   昵称弹窗
│       ├── profile-panel.js      #   个人主页（V 键）
│       ├── leaderboard-panel.js  #   排行榜（顶部按钮）
│       ├── codex-ui.js           #   鱼图鉴（B 键）
│       ├── inventory-ui.js       #   背包（I 键）
│       ├── shop-ui.js            #   商店
│       ├── bait-hud.js           #   鱼饵切换 HUD
│       ├── stamina-hud.js        #   体力 HUD（已废，Canvas 接管）
│       ├── coin-hud.js           #   金币 HUD
│       ├── rest-panel.js         #   秀兰阿姨休整 1 小时 CD
│       └── float-text.js         #   飘字（"+1" / "新的一天"）
│
├── css/                          # 4 个 CSS（splash/main/profile/bait）
├── font/                         # TencentSans-W7.woff2（235KB 子集）
├── assets/
│   ├── character/amin/           # 阿明帧动画 21 帧 + JSON
│   ├── character/NPC/            # 4 NPC 共享精灵图
│   ├── fish/                     # 10 种鱼 PNG
│   ├── images/                   # 村庄/建筑/村庄背景等
│   ├── data/                     # 运行时数据 JSON（obstacles-shuishe.json 等）
│   ├── animations/               # 其他精灵图
│   ├── maps/                     # 地图数据
│   ├── ui/                       # UI 资源
│   ├── music/                    # 3 首 BGM
│   └── title-cover.jpg           # 启动封面
│
├── cloudfunctions/
│   └── archiveLeaderboard/       # 每日 15:00 BJT 归档排行榜
│
├── scripts/                      # 工具脚本
│   ├── deploy.sh                 #   一键部署（云函数 + 静态托管 + ?v= bump）
│   ├── build-font-subset.py      #   字体子集化（8.1MB → 235KB）
│   ├── dump-village-collision.py #   村庄碰撞数据导出
│   └── dump-bg-grid-overlay.py   #   调试用网格覆盖
│
├── tools/                        # 美术工具
│   ├── split_fish_sheet.py       #   鱼雪碧图切割
│   ├── analyze_sprite_sheet*.py  #   精灵图分析
│   ├── cut_*.py                  #   阿明/Phase 21 资源裁切
│   ├── process_amin_fish_back.py
│   ├── draw-obstacles.html       #   PHASE 21 障碍物绘制
│   ├── validate-collision.html   #   PHASE 21 碰撞验证
│   └── view_sprite.html          #   精灵图查看
│
└── docs/                         # 26 份项目文档
    ├── PHASE-21-1-D*.md          #   PHASE 21-1 各日日报
    ├── PHASE-21-1-req5-battle-ux-spec.md
    ├── ART_SPEC.md               #   美术规范
    ├── BACKLOG.md                #   待办 / 问题跟踪
    ├── UPDATE-REPORT-20260609.md
    ├── daily-report-2026-06-01.md
    ├── village-collision-spec.md
    └── village-collision-map.png / village-bg-overlay.png
```

---

## 🚀 本地开发

```bash
# 1. 启动 HTTP 服务（项目根目录）
python3 -m http.server 8000

# 2. 浏览器打开
open http://localhost:8000/

# 3. 可选：GM 指令测试
#    Ctrl+G 打开 GM 面板，或在 console：
GM.run("quest list")          # 列出所有任务
GM.run("quest complete q001") # 强制完成 q001
GM.run("fish give qiliyu 5")  # 给 5 条奇力鱼
GM.run("coin add 1000")       # 加 1000 金
```

**注意**：CloudBase 排行榜需要环境变量，**未配置时游戏仍可玩**（排行榜走 fire-and-forget，失败不阻塞游戏）。

---

## ☁️ 部署

### 线上环境

- **环境 ID**：`saintwar-ai-d5g58v9z1a8b3afe9`
- **静态托管**：CloudBase Hosting，CDN 全球加速
- **云函数**：`archiveLeaderboard`（Nodejs16.13，256MB）
- **域名**：saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com

### 一键部署

```bash
bash scripts/deploy.sh           # 部署云函数 + 静态托管
bash scripts/deploy.sh hosting   # 仅静态托管
bash scripts/deploy.sh fn        # 仅云函数
```

### ⚠️ 部署铁律（务必遵守）

1. **CDN 缓存**：CloudBase Hosting 默认给 `.js`/`.css`/`.png` 配 365 天节点缓存。**已通过控制台调成 5 分钟（max-age=300）**。如发现新代码上线后用户报"老版"，第一步 `curl -sI <URL> | grep cache-control`。
2. **V8 ES module map 缓存**：浏览器对同一个 URL 的 ES module 不会因为文件内容变化重新执行。**改 `js/main.js` 或它的子模块后，必须同步 bump `index.html` 里 `main.js?v=` 版本号**（如 `20260604a` → `20260604b`）。
3. **单文件上传**：整目录上传（`tcb hosting deploy`）经常超时，用 IDE 集成的 TCB `uploadFiles` 工具单文件最稳。

详见 [`docs/PHASE-21-1-D14-day2-20260604.md`](docs/PHASE-21-1-D14-day2-20260604.md) § "部署 SOP"。

---

## 🎨 美术 / 调参 入口

- **新加鱼种**：`js/data/fish-pool.js` 加一行 + `assets/fish/<id>.png` 放 512×512 PNG
- **新加 NPC**：`js/data/npcs.js` + `js/render/npc-<id>.js`（参考现有 4 个 NPC 模板）
- **新加任务**：`js/data/quests.js` + `js/data/dialogues.js` + `js/data/npcs.js` 里 `questId` 关联
- **新加对话**：`js/data/dialogues.js`（按 `npc_default` / `<npc>_<event>` 命名）
- **新加地图**：`assets/data/obstacles-shuishe.json` 仿写 + 美术底图 + `scene-manager.js` 注册
- **调战斗手感**：`js/fishing-scene.js` 顶部 `CONFIG` 对象
- **调行为模式**：`js/data/fish-behavior.js`

---

## 📊 进度

- ✅ **PHASE 10** 完整可玩存档
- ✅ **PHASE 12** 登录页 + 启动屏
- ✅ **PHASE 13** 钓鱼场景 HUD + 水体分层
- ✅ **PHASE 16-1~7** CloudBase 接入 + 字体子集化 + Splash Loader
- ✅ **PHASE 17** 体力系统
- ✅ **PHASE 18** 主线任务链（q001/q002/q003）
- ✅ **PHASE 20** 村庄美术重做（手绘 BG + 4 建筑 + 4 NPC）
- ✅ **PHASE 21** 屋顶斜檐 + Y-sort 遮挡 + 像素级碰撞
- ✅ **PHASE 21-1 D5~D14** 鱼咬钩反馈 / 战斗反馈 / 鱼群系统
- 🚧 **PHASE 21-1 D15+**：鱼图鉴 UI 升级 / 深水区 / 特殊天气 / 商店扩展 / 小芳剧情

---

## 📜 许可

- 美术资源（含水社村手绘背景、阿明/NPC 精灵图、鱼 PNG）：项目内部使用
- 字体 `TencentSans-W7` 来自腾讯字体，已子集化仅含项目必需字符
- 代码：本仓库 Git 历史为准，未单独声明许可证

---

## 🤝 贡献 / 反馈

- **Bug 报告 / 任务建议** → 提交 GitHub Issue
- **PHASE 任务规格** → `docs/PHASE-21-1-*.md` 模板
- **数据平衡讨论** → `docs/BACKLOG.md`
- **版本变更** → 更新 `CHANGELOG.md`（Keep a Changelog 风格）

---

*Built with ❤️ by Aidendeng · 2026*
