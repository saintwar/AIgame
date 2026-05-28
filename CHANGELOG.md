# CHANGELOG

所有重要的版本更新记录。

---

## [Unreleased] · 部署脚本固化 + ES module / 美术资源缓存粘滞修复

> **背景**：今日上午完成村庄美术升级（手绘 BG + 4 建筑 + 5 NPC + 程序化喷泉/树移除）后，部署到腾讯云 CloudBase Hosting，浏览器仍看到旧版（像素方块 BG、emoji 树、蓝圆喷泉）。逐层排查后定位为 **ES module 子模块 + 美术资源的浏览器缓存粘滞**：`index.html` 的 no-cache meta 只对 HTML 本身生效，对 `<script type="module">` 间接 `import` 的子模块、以及 JS 字符串字面量里的 PNG/JPG 路径均无效——浏览器复用 disk cache 的旧版本。本次工作把"一键部署 + 全量 cache busting"固化成脚本，根治此问题。

### 新增：`scripts/deploy.sh`（一键部署 + 自动 bump 版本号）

- 部署模式（命令行参数）：
  - `bash scripts/deploy.sh`（默认 = `all`）：云函数 + 静态托管
  - `bash scripts/deploy.sh hosting`：仅静态托管
  - `bash scripts/deploy.sh fn`：仅云函数
- 主流程：
  1. **rsync 到临时目录**（`mktemp -d`），排除 `.git/ .codebuddy/ scripts/ docs/ cloudfunctions/ cloudbaserc.json` 等不应进入静态托管的内容。
  2. **bump 版本号**：`STAMP="$(date +%Y%m%d%H%M%S)"`，对临时目录全量扫描并改写。
  3. `tcb hosting deploy` 临时目录到环境 `saintwar-ai-d5g58v9z1a8b3afe9`。
  4. 清理临时目录。
- 前置依赖检查：`tcb` / `rsync` / `python3`，缺失即报红退出。
- 对项目用户偏好的尊重：脚本顶部注释明确说明"此脚本本身是发布动作，AI 助手代为运行前必须先获得用户明确同意"。
- 约束（红线）：脚本只在**临时目录**做改写，**绝不动工程源码**。

### bump 版本号的扫描与改写规则

- **扫描范围**：临时目录下所有 `.html` / `.css` / `.js` / `.mjs`。
- **命中扩展名白名单**（命中即加/换 `?v=STAMP`）：
  - 代码：`.js .mjs .css`
  - 字体：`.woff .woff2 .ttf .otf .eot`
  - 图片：`.png .jpg .jpeg .webp .gif .svg .ico .bmp`
  - 媒体：`.mp3 .wav .ogg .mp4 .webm`
  - 数据：`.json`
- **改写位置**（4 类）：
  1. HTML 属性 `src="..."` / `href="..."`（双引号或单引号）
  2. CSS `url(...)`（含可选引号；HTML 内联 `<style>` 也覆盖）
  3. JS 字符串字面量里的本地资源路径（限定起始：`./` `../` `/` `assets/` `js/` `css/` `font/` `music/` `images/` `image/`），不含换行、不含 `${`（避开模板字符串表达式）
  4. JS `import 'xxx'` / `import xxx from 'yyy'` / `import('zzz')`
- **URL 处理策略**（`bump_url`）：
  - 外链 / `data:` / `blob:` / `mailto:` / `#fragment` / `javascript:` → 不动
  - 已带 `?v=xxx` → 替换为新 STAMP
  - 已带其他 query → 不动（避免破坏既有参数）
  - 命中扩展名白名单且无 query → 追加 `?v=STAMP`
  - 不命中 → 不动
- **注释保护**（关键，避免误改文档示例）：在做 `re.sub` 前先用解析器把源串切成「注释段 / 非注释段」，**只对非注释段做替换**：
  - HTML：`<!-- -->`
  - CSS：`/* */`
  - JS：`//` 单行 + `/* */` 块注释（不剥字符串——本就要替换字符串里的 URL）
- **dry-run 验证**：今日实际跑通一次干跑，结果 = HTML 1 文件 +240 字节、JS 28 文件 +1700 字节、CSS 0 文件；HTML 注释里的 `?v=20260524` / `?v=Date.now()` 字面量、JS 注释里 `美术稿：assets/...jpg` 等示例字面量**全部保留未动**，验证注释保护正确。

### 解决的核心问题：ES module 缓存粘滞

- **现象**：改 `js/village-scene.js` 重新部署，浏览器仍命中旧的 `village-scene.js`（disk cache）。
- **根因**：`index.html` 头部 `no-cache` meta 只能让浏览器拉新 HTML；HTML 里 `<script src="js/main.js?v=...">` 因 query 变化也能拉新 main.js；但 main.js 内部 `import './village-scene.js'` 是**裸 URL**，浏览器看到这个 URL 在 disk cache 里就直接复用，不再发请求。`?v=stamp` 没有传染到子模块。
- **修复方式**：bump 阶段对 JS `import / from / import()` 也加 stamp，同步覆盖到所有 `js/render/*.js` 等子模块。链路：
  ```
  index.html
    └─ <script src="js/main.js?v=STAMP">
        └─ import './village-scene.js?v=STAMP'
            └─ import './render/buildings-art.js?v=STAMP'
                └─ 'assets/images/buildings/aming_house.png?v=STAMP'
  ```
  整条链路任一环节有改动，新 STAMP 都会让浏览器把它当全新 URL 去拉。

### 解决的次要问题：美术资源缓存

- 旧脚本（v0）只 bump `.js / .css / 字体`，明确把 `.png` 排除（注释写"图片由 CDN 缓存策略走"）。
- 实战发现：今日替换的 `village-riverside-bg.png / 4 建筑 PNG / 5 NPC PNG`，URL 完全没变，浏览器命中旧 disk cache 的 PNG 内容，导致看到的还是旧美术。
- 新脚本把图片加入 bump 白名单，且改写 JS 字符串字面量（如 `'assets/images/buildings/aming_house.png'`）。日后改任意美术资源，重新部署即可让用户立刻看到，无需清缓存。

### CloudBase 控制台坑位记录（避免再次踩）

- **静态托管 Hosting** 实际写入的桶：`3ca8-static-saintwar-ai-d5g58v9z1a8b3afe9-1300128993`
- **对象存储 COS** 桶：`7361-saintwar-ai-d5g58v9z1a8b3afe9-...`（与 hosting 无关，可能用于云函数附属/数据库等）
- 验证 hosting 部署是否生效，应使用：
  - `tcb hosting list -e saintwar-ai-d5g58v9z1a8b3afe9` 查文件列表 + LastModified
  - `tcb hosting detail -e saintwar-ai-d5g58v9z1a8b3afe9` 查域名/桶详情
  - **不要**打开 CloudBase 控制台 → 对象存储里的 7361 桶来判断（那是另一个产品）

### `tcb` 二进制的 PATH 注意

- 当前机器 `tcb` 安装路径：`/Users/dengyifei/.workbuddy/binaries/node/versions/20.18.0/bin/tcb`
- 用户 `~/.zshrc / ~/.zprofile` 未配置该路径；非交互 shell（如 AI 助手代跑 shell）默认 PATH 中无此目录。
- 解决：脚本未写死 PATH。代跑时需先 `export PATH="/Users/dengyifei/.workbuddy/binaries/node/versions/20.18.0/bin:$PATH"`。后续若想免维护，可考虑在 `scripts/deploy.sh` 顶部加一条 PATH 兜底，或在 `~/.zshrc` 加一行。

### DoD 验收（2026-05-28 21:01 真跑结果）

| 项 | 结果 |
|---|---|
| `bash scripts/deploy.sh hosting` | ✅ 退出码 0 |
| 本次 STAMP | `20260528210106` |
| bump 改动统计 | 29 文件，+1940 字节（HTML 1 / CSS 0 / JS 28） |
| `tcb hosting deploy` | ✅ 88/88 文件上传成功 |
| 线上 `index.html` → `main.js` URL | ✅ `?v=20260528210106` |
| 线上 `main.js` → 全部 `import` 子模块 | ✅ 全带 stamp |
| 线上 `js/render/buildings-art.js` → 4 个建筑 PNG | ✅ 全带 stamp |
| 线上 `js/render/village-bg.js` → BG JPG | ✅ 带 stamp |
| BG 美术 / 建筑 PNG 实际可拉 | ✅ 200 OK，size 与本地一致 |
| 注释中的旧字面量（`?v=20260524` 等） | ✅ 未被误改 |
| 用户线上 Cmd+R 刷新（非硬刷新） | ✅ 看到手绘水彩 BG 新版（验收通过） |

### 影响面 / 红线

- **不动游戏运行时逻辑**：脚本只在临时目录改写资源 URL 后缀，**源码 `js/`、`assets/`、`index.html` 一字不动**。
- **不动云函数代码**：`fn` 模式只调用 `tcb fn deploy`。
- **不动用户存档系统 / 红线参数**：与 `tensionRiseRate / tensionFallRate / 黄金区 30~70 / slackFailGrace 0.5s` 等钓鱼手感参数无任何交集。
- **可回退**：`scripts/deploy.sh` 是新增文件，删除即回到"手动 `tcb hosting deploy`"流程；过往部署的 `?v=stamp` 都是查询参数，对资源内容无副作用。

### 后续可选优化（不是本次范围）

1. 在脚本顶部加 PATH 兜底（自动探测 `~/.workbuddy/binaries/node/*/bin`）。
2. `--dry-run` 选项（只 bump 不上传，方便人工检查改动）。
3. 接入 git pre-push hook：禁止本地未提交时跑 deploy（避免线上和源码不一致）。
4. 同样的 bump 逻辑写一份独立 Python 脚本进 `scripts/`，让 CI/CD（未来若引入）也能复用。

---

## [Unreleased] · 村庄美术升级 + NPC 站位微调 + 碰撞数据排查工具

### 美术资源
- 新增 `assets/images/` 美术资源（村庄 BG / NPC 立绘 / 建筑等）。
- 新增渲染模块：`js/render/village-bg.js`、`buildings-art.js`、`npc-atubo.js`、`npc-linshifu.js`、`npc-xiaofang.js`、`npc-xiulan.js`。
- `js/render/buildings.js` 适配新美术。

### NPC 站位调整（贴合新 BG 美术）
- 秀兰阿姨 (352,352) → (352,**416**)，南移 1 格。
- 林师傅 (864,352) → (**736**,352)，西移 2 格。
- 小芳 (928,512) → (**864**,512)，西移 1 格。
- `js/village-scene.js` 头顶名字标签 `py-8` → `py-18`，避免压住头顶。

### 碰撞数据排查工具（新增 docs / scripts）
- `scripts/dump-village-collision.py`：把 `villageMap` 导成 32px 网格 + 行列号空气墙图（`docs/village-collision-map.png`）。
- `scripts/dump-bg-grid-overlay.py`：把村庄 BG 美术 + 32px 网格 + 当前碰撞数据半透明叠加（`docs/village-bg-overlay.png`），用于肉眼对照"美术实物 vs 碰撞数据"是否对齐。
- 修复 `dump-village-collision.py` 第 72 行 `fill_rect` 多参数 bug，回滚为单段墙身。
- **已知问题（待修）**：叠加图显示当前 villageMap 的 ROOF/WALL 与新 BG 美术整体错位（美术上无房子、却标了空气墙；美术上的 4 块农田未标碰撞），后续需重做 villageMap 贴合美术。

### 其他
- `index.html`、`js/main.js`、`js/click-to-move.js`、`js/digging-system.js`、`js/fishing-scene.js`：随美术资源升级的小幅适配。

### 去除程序化装饰（贴合新 BG 美术）
- `js/village-scene.js`：注释掉 `_render` 中的 `drawFountain(544,160,...)` 和 `_renderDecorations()` 调用；`_renderDecorations()` 方法体清空（保留空方法做兼容）。
- 移除：① 蓝色圆喷泉 + 白色水滴粒子（像素 544,160）、② 码头两侧两棵 🌳 emoji 树（像素 544,544 / 800,544）。
- 原因：新 BG 美术 `village-riverside-bg` 已自带场景装饰，程序化装饰会与 BG 重叠/违和。
- `drawFountain`（`js/render/dusk-effects.js`）和 `drawWoodenDock` 函数本体保留，未来需要可复用。

---

## [Unreleased] · PHASE 15 — 鱼个体差异化（拉力 / 行为 / HP 差异）

### 仗1：鱼种数据扩展（5 → 10）
- `js/data/fish-pool.js` 扩展为 10 种鱼，每个稀有度 2 条，新增字段 `fishPull / hp / hpDrain / behavior`。
- 新增鱼种：草鱼（rarity 2 surge）、鲈鱼（rarity 3 erratic）、总统鱼（rarity 4 erratic）、潭神使者（rarity 5 mythic）。
- `js/data/fish-codex.js` 同步图鉴文案（含潭神使者剧情伏笔："与阿明父亲的失踪有关……"）。

### 仗2：拉力系统接入 fishPull
- `_updatePlaying`：tension 公式追加 `effectivePull * dt`，叠加在 rise=15 / fall=40 之上不替换。
- 红线遵守：`tensionRiseRate / tensionFallRate / 黄金区 30~70 / slackFailGrace 0.5s` 全部不动。

### 仗3：FishBehavior 状态机（`js/data/fish-behavior.js`）
- 4 种行为：`none`（平稳）/ `surge`（calm 2~4s + surge 0.8~1.5s 循环）/ `erratic`（每 0.3~0.8s 随机变向）/ `mythic`（三阶段：试探 → 狂暴含深潜 → 垂死挣扎）。
- 通过 `onEvent` 回调向场景层抛 `surge_incoming / mythic_dive` 事件，UI 层渲染"!"气泡。

### 仗4：HP 系统差异化
- 新增 `fishCurrentHP / fishSpeciesMaxHP`（与原 `fishHP` 平行解耦），仅在黄金区 30~70 内按 `fish.hpDrain` 扣减。
- 原 `fishHP / hpDecayRate` 体系保留（与 escape/exhausted 判定耦合，红线不动）。

### 仗5：视觉预警
- 鱼上方 surge 冲刺预告气泡（红圆 + 黄"!"，0.6s 衰减）。
- 屏幕边框呼吸光：tension≥85 红、≤15 蓝。
- 屏幕中央"危险！"闪烁：tension≥90 触发，0.3s 高频闪。

### 钓竿兼容确认
- 入门竿（rarityUnlock=2）：奇力鱼/罗非鱼/草鱼/曲腰鱼。
- 竹制竿（rarityUnlock=3）：+ 翘嘴鲌/鲈鱼。
- 碳素竿（rarityUnlock=5）：全部可钓。

### DoD 验收
1. ✅ 10 种鱼数据完整 + 4 个新字段
2. ✅ 拉力公式正确接入 fishPull
3. ✅ 4 种行为模式均生效
4. ✅ hpDrain 按鱼种差异化
5. ✅ 视觉预警三件套（线红/蓝、危险文字、surge 预告）
6. ✅ 入门竿钓奇力鱼（fishPull=3）体验与改动前几乎无差异

---

## [Unreleased] · PHASE 16-6 仗4 — 鱼饵差异化效果 + 钓鱼消耗 + HUD 切换器

> **现状摸排纠错**：任务书预测的 `player.baits = { worm/scented/premium }` **不存在** ——
> 项目实际用 `player.inventory[basic_bait/advanced_bait/legendary_bait]` 统一物品系统
> （仗3 林师傅店已就绪入库通道）。任务书预测的 `js/scenes/fishing-scene.js` 路径
> 也对不上（实际为 `js/fishing-scene.js`，无 scenes/ 子目录）。
> Q 键已是钓鱼"取消瞄准"键 → 主策划裁定改用**数字键 1/2/3 直接选档**。
> 钓鱼场景零鼠标监听 → bait-selector 走 **DOM 弹窗**（A 方案，零侵入主循环）。
> "saveAll" 项目中并不存在 → 库存改动靠 `inventory.add/remove` 自动 `Save.commit()` 落 localStorage。

### 新增

- `js/data/bait-effects.js` — `BAIT_EFFECTS` 配置 + `BAIT_ORDER` 切换序
  - `basic_bait`：基线（rarityShift=0, sizeMul=1.0）
  - `advanced_bait`：rarityBonus=0.3（30% 概率提档）+ sizeMul=1.1
  - `legendary_bait`：rarityShift=1（必升档）+ sizeMul=1.25
- `js/ui/bait-hud.js` — 钓鱼场景顶部正中常驻 HUD（DOM 弹窗）
  - 3 档鱼饵横排：图标 + 库存 + hover tooltip 显示效果说明
  - 当前装备：吉卜力暖橙描边 + 阴影发光高亮
  - 库存=0：灰显（filter: grayscale）但仍可点击查看 tooltip
  - 全局别名 `window.fishingHUD`，fishing-scene 切换 / 消耗时调 `render()` 刷新
- `css/bait-hud.css` — 吉卜力暖橙风格（#d4a574 描边 + #fef6e4 米黄底 + #5a3e1c 深棕字）

### 修改

- `js/save-system.js` — 新增 `player.equippedBait = 'basic_bait'` 默认 + 老存档迁移兜底
- `js/fishing-scene.js`：
  - **`_selectFish` 末端注入鱼饵效果**（不重构上游 `rollFishWithRod`）：
    - rarityShift / rarityBonus 触发时从 `SHUISHE_FISH_POOL` 按目标档位重抽
    - sizeMul 直接乘 `currentFish.size[0]`（影响 caughtFishSize 基准）
    - 触发飘字"🌸 香饵生效！" / "✨ 极品香饵威力！"
  - **`_onFishCaught` 末端消耗 1 个鱼饵**（成功上钩即扣，含满篓退回；规则：防刷）：
    - 稀有鱼饵显示"消耗 1 高级鱼饵（剩余 N）"
    - 普通蚯蚓不提示（避免噪音）
    - 库存=0 时自动切回 basic_bait + 飘字提示
  - **`_updateIdle` 抛竿前校验**：
    - basic_bait=0 → 阻断抛竿 + "❌ 鱼饵不足！请去林师傅店购买"
    - 稀有鱼饵=0 但 basic_bait>0 → 自动切回 basic_bait 再抛
  - **`_switchBaitByIndex(index)`** 方法：数字键 1/2/3 + HUD 点击共用入口
    - 切换前校验库存（=0 时拒绝 + 飘字）
    - 切换后写 player.equippedBait + commit + HUD render
  - `start()` 挂载 baitHUD，`destroy()` 卸载（生命周期对齐）
- `index.html` — 引入 `css/bait-hud.css?v=20260525`

### 不动（红线遵守）

- 林师傅店 / 秀兰售卖 / 鱼篓系统：零修改
- 鱼种概率表（`SHUISHE_FISH_POOL` / `FISH_POOL`）：零修改，仅在 `_selectFish` 末端做修饰
- 钓鱼判定核心循环（_updatePlaying/_checkEscape/_calculateEscapeChance）：零修改
- 鱼饵保鲜期：未实现（P1 留）
- 钓点关联：未实现（项目仅单一钓鱼场景，按任务书"留 P1"规则跳过）

### DoD 12 项验收

- [x] HUD 顶部正中显示当前鱼饵图标 + 库存（3 档横排，当前装备高亮）
- [x] 点击图标弹出鱼饵选择面板 → **改为 HUD 即面板**（DOM 常驻，鼠标点击直接切档；3 档+效果 tooltip 替代弹窗，更简洁）
- [x] 鱼饵面板显示 3 档 + 效果说明 + 库存（hover tooltip）
- [x] 库存为 0 的鱼饵灰显（grayscale + opacity 0.4）
- [x] 数字键 1/2/3 切换鱼饵（替代任务书 Q 键，避免与"取消瞄准"冲突）
- [x] 选中鱼饵后 HUD 立刻刷新
- [x] 钓上鱼成功后 player.inventory[当前] -= 1
- [x] 当前鱼饵库存为 0 时自动切回 basic_bait
- [x] 高级鱼饵 30% 概率提档（连续测可见"🌸 香饵生效"飘字）
- [x] 传说鱼饵 rarityShift +1（必出更高档）
- [x] 鱼饵生效时飘字"🌸 香饵生效"或"✨ 极品香饵威力"
- [x] CloudBase 同步 → **项目实情：业务数据走 localStorage（Save.commit），equippedBait/inventory 持久化已 OK；老玩家 equippedBait 兜底初始化**

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