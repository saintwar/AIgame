# PHASE 21-1 D5+D7 移交简报（2026-06-02）

**收件**：Nina（D6 联动 / D8 排行榜实施）
**抄送**：项目组
**发件**：项目负责人
**线上版本**：`main.js?v=20260603b`（commit `fef9062`，已发布到 saintwar-ai-d5g58v9z1a8b3afe9）

---

## 1. 本批次落地清单

### D5 v2.x — 鱼咬钩反馈系统
- ✅ **v2.0**：删 biteSink 三段下沉、删全屏红屏大叹号、删放大镜染色
- ✅ **v2.1**：BiteWindow 重构为 shake + sink 两段，水下浮漂剪影 + 抖动 tok 音效 + 沉水"咕咚"扫频
- ✅ **v2.2 P0**：圆形 200×200 放大镜（4× 最近邻放大）
  - 镜内浮漂同步 D5 抖动/沉水偏移
  - 咬钩瞬间镜内浮漂自抖 240ms（镜框稳定）
  - 离开 Waiting/BiteWindow 触发下滑消失动画 180ms
- ✅ **v2.0.4**：镜底改为从 `scene._bgCacheCanvas` copy 真背景层（无鱼线/鱼影/浮漂）
- ✅ **v2.0.5（本次）**：镜底背景同样 4× 最近邻放大，源区域 50×50 → 目标 200×200，水面波纹/远山/水草整体放大，与镜内浮漂同倍率

### D7 — 博弈初始张力透传
- ✅ biteLevel → 博弈初始张力：`light: 52 / medium: 60 / heavy: 70`
- ✅ 按拍板 B 方案保留"越档悬念"
- ✅ 提竿后 800ms 延迟过渡到水下博弈（防切早）

### 美术 / 场景
- ✅ `assets/images/buildings/ship.png`（248×114）替换程序化浮台
- ✅ 阿明站位下移 40px、涟漪上移 50px，浮台不动
- ✅ NPC 脚下椭圆阴影（阿明无阴影、其他 NPC 阴影不上下浮动）

---

## 2. 关键架构变更（D6/D8 需注意）

### 2.1 离屏背景 cache `_bgCacheCanvas`
- 位置：`js/fishing-scene.js`，在 `_renderBackground` 之后立即 `_bgCacheCtx.drawImage(this.canvas, 0, 0)`
- 用途：D5 放大镜镜底取真背景像素
- **D6/D8 注意**：如果新增任何"叠在背景层之上"的元素（鱼影/水草/特效），无需特殊处理；如果新增的元素本应纳入背景层（例如远景渔船），需放在 `_renderBackground` 内才能进 cache

### 2.2 D5Magnifier 边沿检测自驱
- 不接事件总线，靠 `_wasInActiveState` / `_wasInBiteWindow` 自动检测 FSM 进出
- **D6/D8 注意**：如果引入新状态（如 D8 排行榜模态），D5 进入/退出 Waiting 的边沿仍正确，无需协调

### 2.3 ship-sprite 懒加载范式
- `js/render/ship-sprite.js`：`preload() / isReady() / draw()` 三件套
- **D6/D8 借鉴**：新增贴图建议沿用同样的懒加载模式，避免阻塞首屏

---

## 3. 文件改动清单

```
M  index.html                                  (main.js?v= → 20260603b)
M  js/fishing-scene.js                         (+ _bgCacheCanvas / ship sprite / 提竿延迟 / D7 透传)
M  js/render/d5/magnifier-v2-renderer.js       (v2.0.5 镜底 4× 放大)
A  assets/images/buildings/ship.png            (新增 248×114)
A  js/render/ship-sprite.js                    (新增懒加载)
```

---

## 4. 验收自检清单（D6/D8 开工前先跑）

```bash
# 1) 确认线上版本号
curl -s https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/index.html | grep "main.js?v="
# 应输出：?v=20260603b 或更新

# 2) 确认 cache 配置正确（.js 应 max-age=300 以内）
curl -sI https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/js/fishing-scene.js | grep cache-control

# 3) 确认 D5 v2.0.5 已上线
curl -s "https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/js/render/d5/magnifier-v2-renderer.js?nocache=$RANDOM" | grep "v2.0.5"

# 4) 确认 _bgCacheCanvas 架构存在
curl -s "https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/js/fishing-scene.js?nocache=$RANDOM" | grep "_bgCacheCanvas"

# 5) 确认 D7 张力档位
curl -s "https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/js/fishing-scene.js?nocache=$RANDOM" | grep "biteInitialTension"
```

---

## 5. 用户体验要点（玩法验收）

1. 落水后 150ms → 放大镜淡入（200×200 圆形，反侧自动避让浮漂）
2. 等待期：镜内浮漂 ±1px 微浮 + 每 4-8s 一圈涟漪
3. 咬钩瞬间：镜内浮漂自抖 240ms（镜框稳定不抖）
4. shake 期：镜内 = 主浮漂 ×4 + 抖动 dy ×0.5（视觉柔和）
5. sink 期：镜内 = 水下剪影 ×4（沉水进度透传）
6. **新**：镜底背景与主画面水面像素一致但 4× 放大 —— 水面波纹/远山/水草全部放大，与浮漂同倍率，整体像素感统一
7. 提竿后 800ms 延迟过渡 → 进入水下博弈
8. 博弈初始张力按 biteLevel 区分（light 起手 52 / medium 60 / heavy 70）

---

## 6. 红线 / 已知约束（不可破坏）

- D5 放大镜**不持有独立浮漂状态**，全部从 `scene.bobX/Y + d5.getBobOffset()` 取
- D5 放大镜**不画鱼线/鱼影/水草**，避免 200px 窗口信息过载
- 主画面浮漂逻辑**零改动**
- `_bgCacheCanvas` 只在 `_renderBackground` 之后 copy 一次/帧，**不要**在循环里反复 copy
- D7 提竿延迟 800ms 期间，`_updateBiteWindow` 顶部守护 `if (this._pendingReelTimer) return` 不可去掉

---

## 7. 下一步建议

- D6 联动建议复用 `_bgCacheCanvas` 实现"水底视角放大镜"或"望远镜"等同类视觉
- D8 排行榜可直接调用现有 ship-sprite 范式做贴图加载

如有问题随时同步。

— 项目负责人，2026-06-02 16:40
