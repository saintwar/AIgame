# D5 鱼咬钩反馈视觉规范 v1.1 → v1.2 修订变更清单

> **修订日期**：2026-06-01
> **修订人**：主美（拍板）+ Nina（接力 patch）
> **核心变更**：D5 资产**全程序化路线**确立（9 项程序化 + 1 项复用 + 3 项 v3.0 已有 = **0 张 AI 生图**）
> **作用范围**：本变更清单覆盖 §0.3 / §2 / §4.4 / §5 / §6 / §8 / §9 / §10，其余章节（§0.1/§0.2 色板、§1 三档差异化、§3 关键交互、§7 漏提演出）**保持不变**。

---

## §0.3 历史更正（新增 v1.2 条目）

### v1.2 修订（2026-06-01，全程序化路线）

**触发**：老板对方案 P 拍板——D5 全 13 项资产中可程序化的 9 项**全部走程序化**，不再申请任何 AI 生图 Token。

**v1.1 误判更正**：v1.1 §8 资产清单将 ④⑤⑥⑧⑨⑩⑪ 共 7 项归为「AI 生图」是工程视角的误判，忽略了三项硬约束：

1. **像素硬边底线**：D5 与双轴搏斗 / v3.0 浮漂同框，AI 生图的反锯齿 / 半透明边缘破坏整工程像素硬边一致性，需手工像素清边，反而比程序化贵。
2. **色板合规**：12 色调色板（v3.0 9 色 + D5 3 色）必须严格命中，AI 生图色彩漂移率高，每张需 Photoshop 索引化重映射，工序长。
3. **与 v3.0 同框统一**：浮漂、PERFECT 字、放大镜染色都挂在 `fishing-scene.js` 同一 Canvas 上下文，程序化绘制天然继承 `ctx.scale(0.8)` 外层缩放与整数像素对齐，AI 生图需额外考虑 DPR 与缩放采样污染。

**结论**：除「鱼影远景」复用既有 sprite 外，其余可绘制资产**全部程序化**。**0 张 AI 生图、0 token 消耗**。

**经验沉淀**（追加到 v1.1 工程教训）：
> 像素游戏的小尺寸视觉资产（≤32×32、几何规整、色板 ≤16 色），程序化绘制的边际成本通常低于 AI 生图——后者在像素硬边、色板合规、缩放对齐三项硬约束下需要重度后处理。规范评估生图前，必须先评估「能否 30 行代码画出来」。

---

## §2 放大镜染色规范（重写 §2.1 §2.2）

> **v1.1 原文**：定义「染色基色 `#C8412B` / `#E8553D` + α 曲线」（隐含 PNG 蒙版）
> **v1.2 改为**：运行时 Canvas 程序化绘制契约。**不出 PNG**。

### §2.1 猛档边框泛红（onBiteStart 一次性）

**绘制契约**：

```
模块：fishing/fx/MagnifierTintRenderer.js  （或并入 fishing-scene.js 渲染管线）
入口：drawMagnifierTint(ctx, rect, opts)
触发：onBiteStart(强度=猛)
```

| 参数 | 值 |
|---|---|
| 蒙版色 | `#C8412B`（v3.0 通用警示红） |
| 蒙版形状 | 放大镜环形边框（外圈 4px 宽，内描边对齐圆环外缘整数像素） |
| 合成模式 | `ctx.globalCompositeOperation = 'multiply'`（染色而非覆盖，保留下层浮漂细节） |
| 绘制方式 | `ctx.fillRect`（环形拆 4 段矩形：上/下/左/右，**禁止用 arc**——破坏像素硬边） |
| α 关键帧 | t=0 → 0%、t=80ms → 70%（急亮）、t=580ms → 0%（500ms 急退） |
| 缓动 | 80ms 段：linear；500ms 段：easeOutQuad |
| 整数对齐 | 所有 fillRect 坐标 `Math.floor()` 后再绘制 |
| 复位 | 动画结束后 `globalCompositeOperation = 'source-over'` 还原 |

**实现伪代码**（主程参考，不强制）：

```js
const k = [{t:0,a:0},{t:80,a:0.70},{t:580,a:0}];
ctx.save();
ctx.globalCompositeOperation = 'multiply';
ctx.globalAlpha = lerpKeyframes(elapsed, k);
ctx.fillStyle = '#C8412B';
drawRingRects(ctx, rect, 4); // 4 段矩形拼环
ctx.restore();
```

### §2.2 LATE 警示泛红（持续呼吸至提竿）

**绘制契约**：

| 参数 | 值 |
|---|---|
| 蒙版色 | `#E8553D`（D5 扩展橙红，与猛档 `#C8412B` 区分） |
| 蒙版形状 | 同 §2.1（4px 环形边框，4 段 fillRect） |
| 合成模式 | `globalCompositeOperation = 'multiply'` |
| α 曲线 | 2Hz 呼吸：`α = 0.30 + 0.40 * (sin(2π·t/500) * 0.5 + 0.5)`，区间 [30%, 70%] |
| 起止 | LATE 状态进入即开始，提竿（onLineUp）或鱼脱钩立即停止 |
| 配套 | 浮漂下方 8×8 像素 ⚠ 标（**也走程序化**，由 `_drawPixelWarn(cx,cy)` 用 5 个 fillRect 拼出，归入 §6 同套像素绘制管线） |

> **8×8 ⚠ 标 ASCII 源数据**（用于 _drawPixelWarn 逐像素绘制，色 `#E8553D`，描边 `#1A1A2E`）：
> ```
> . . . X X . . .
> . . X Y Y X . .
> . . X Y Y X . .
> . X Y Y Y Y X .
> . X Y . Y Y X .   （中部空心 = 警示符竖线）
> X Y Y Y Y Y Y X
> X Y Y . Y Y Y X   （底点空心 = 警示符圆点）
> X X X X X X X X
> ```
> X=描边、Y=填充、.=透明

---

## §4.4 「可惜……」文案（重写）

> **v1.1 原文**：12px、`#C8B89A` 低饱和米灰、不加金光不加震动（隐含字模渲染或 PNG）
> **v1.2 改为**：运行时 `Canvas.fillText` 程序化绘制契约。**不出 PNG**。

**绘制契约**：

```
模块：挂在现有 fishing-scene.js 文本渲染管线 / 新建 fishing/fx/MissTextRenderer.js（主程拍板）
入口：drawMissText(ctx, x, y, t)
触发：漏提（onLateMiss）
```

| 参数 | 值 |
|---|---|
| 文案 | `可惜……`（含中文省略号 U+2026 ×2） |
| 字体 fallback | `'Fusion Pixel 12px','Cubic 11','Press Start 2P','Microsoft YaHei',sans-serif` |
| 字号 | `12px`（不缩放，与 ctx.scale(0.8) 协同后视觉≈9.6px） |
| 颜色 | `#C8B89A`（复用 WHT_DK，与 v1.1 修订一致） |
| 描边 | `lineWidth=2`、`strokeStyle='#1A1A2E'`（OUT 通用描边色）、先 stroke 后 fill |
| textAlign | `'center'` |
| textBaseline | `'middle'` |
| 位置 | 放大镜中心下方 +18px（整数对齐：`x=Math.floor(rect.cx)`、`y=Math.floor(rect.cy+18)`） |
| α 关键帧 | t=0 → 0%、t=120ms → 100%（淡入）、t=600ms → 100%（停留）、t=800ms → 0%（淡出） |
| 缓动 | 淡入/淡出均 easeOutQuad |
| 不做 | 不加金光、不加震动、不加缩放、不加位移 |

---

## §5 PERFECT 三档（重写 §5.1 §5.2 §5.3）

> **v1.1 原文**：14px/16px/20px + 单/双/三层金光 + 猛档放射光（隐含 AI 生图）
> **v1.2 改为**：Canvas 文字 + 多层 shadow 描边叠加 + 放射光线 fillRect。**不出 PNG**。
> **核心约束**：与 v3.0 浮漂同 Canvas、整数像素对齐、色板合规、字体 fallback 兜底。

### §5.0 三档共用绘制契约（v1.2 新增）

```
模块：fishing/fx/PerfectTextRenderer.js
入口：drawPerfectText(ctx, x, y, tier, t)   // tier ∈ {'light','medium','heavy'}
触发：成功提竿且时机命中 PERFECT 窗口
```

**字体 fallback 链（三档统一）**：

```js
const FONT_STACK = `'Fusion Pixel 12px','Zpix','Cubic 11',
                    'Press Start 2P','Microsoft YaHei',
                    sans-serif`;
ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
```

**整数像素对齐保证（三档统一）**：
- `x = Math.floor(rect.cx)`、`y = Math.floor(rect.cy + yOffset)`
- 所有 shadowOffset、放射光线坐标在传入前先 `Math.round()`
- `ctx.translate(0.5, 0.5)` **禁用**（像素游戏用整数对齐，不用半像素子像素）

**出现/消失曲线（三档共用形状，参数不同）**：

| 阶段 | t 区间 | scale | yOffset | α |
|---|---|---|---|---|
| 弹性进入 | 0 → 180ms | 0.6 → 1.15 → 1.0（三段，超调 15%） | 0 | 0 → 100% |
| 停留+上飘 | 180ms → tHold | 1.0 | 0 → -8px（线性） | 100% |
| 淡出 | tHold → tEnd | 1.0 | -8 → -14px | 100% → 0 |

> 弹性进入用 `easeOutBack(overshoot=1.7)` 或手写三段 lerp；上飘用 linear；淡出用 easeInQuad。

### §5.1 PERFECT「稳！」（轻档，单层柔光）

| 参数 | 值 |
|---|---|
| 文案 | `稳！` |
| 字号 | `14px bold` |
| 主色 | `#FFF4D6`（WHT，米白主色） |
| 描边 | `lineWidth=2`、`strokeStyle='#1A1A2E'`、先 stroke 后 fill |
| 金光层 | **单层**：`shadowColor='#FFEEB0'`、`shadowBlur=4`、`shadowOffsetX/Y=0`，描边/填充时 shadow 自动叠加 |
| 时长 | 600ms（弹性 180ms + 停留 270ms + 淡出 150ms） |
| 上飘 | -6px |

### §5.2 PERFECT「妙！」（中档，双层金光）

| 参数 | 值 |
|---|---|
| 文案 | `妙！` |
| 字号 | `16px bold` |
| 主色 | `#FFF4D6`（WHT） |
| 描边 | `lineWidth=2`、`strokeStyle='#1A1A2E'` |
| 金光层 | **双层叠加**：<br>① 内层：`shadowColor='#FFEEB0'`、`shadowBlur=3`<br>② 外层：`shadowColor='#FFD43B'`（YEL）、`shadowBlur=8`<br>**实现**：连续两次 `fillText` 同位置同字，shadow 参数不同 |
| 时长 | 700ms（弹性 180ms + 停留 370ms + 淡出 150ms） |
| 上飘 | -8px |

### §5.3 PERFECT「完美！」（猛档，三层金光 + 4 道放射光）

| 参数 | 值 |
|---|---|
| 文案 | `完美！` |
| 字号 | `20px bold` |
| 主色 | `#FFF4D6`（WHT） |
| 描边 | `lineWidth=2`、`strokeStyle='#1A1A2E'` |
| 金光层 | **三层叠加**：<br>① 最内：`shadowColor='#FFEEB0'`、`shadowBlur=2`<br>② 中层：`shadowColor='#FFD43B'`（YEL）、`shadowBlur=6`<br>③ 最外：`shadowColor='#D4A41A'`（YEL_DK）、`shadowBlur=12`<br>**实现**：三次 `fillText` 同位置叠加 |
| 放射光 | **4 道光线**（见下） |
| 时长 | 800ms（弹性 180ms + 停留 470ms + 淡出 150ms） |
| 上飘 | -10px |

**4 道放射光线几何参数**：

| 参数 | 值 |
|---|---|
| 数量 | 4 道 |
| 角度 | 0°（右）、90°（上）、180°（左）、270°（下）—— 即 +/X 形态、对齐字心 |
| 长度 | 12px（固定，不随字号缩放） |
| 宽度 | 2px（描边层级，最外端 1px） |
| 起点 | 距字心 8px（避开字身） |
| 色 | `#FFEEB0`（高光金）从 100%α 渐变到外端 0%α |
| 实现 | 每道光线 = 1 个 `linearGradient` + `fillRect`（旋转用 `ctx.rotate`，绘制完 `restore`） |
| 时序 | 与字同步出现，停留期持续 100% α，淡出期同步 fade |
| 整数对齐 | rotate 后用 `Math.round` 重新落点（避免子像素糊化） |

**4 道光线绘制伪代码**：

```js
const angles = [0, 90, 180, 270];
ctx.save();
ctx.translate(cx, cy);
for (const deg of angles) {
  ctx.save();
  ctx.rotate(deg * Math.PI / 180);
  const grad = ctx.createLinearGradient(8, 0, 20, 0);
  grad.addColorStop(0, 'rgba(255,238,176,1)');
  grad.addColorStop(1, 'rgba(255,238,176,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(8, -1, 12, 2);
  ctx.restore();
}
ctx.restore();
```

---

## §6 四叶草微光（重写 §6.2，§6.1 保留）

### §6.1 7×7 像素图（**保留 v1.1 原 ASCII 源数据**，作为程序化绘制的源数据）

> v1.1 已有 7×7 ASCII 像素图，**v1.2 不变**。这就是 §6.2 程序化绘制的逐像素数据源。
> 主色 `G=#7AC862`、高光 `H=#F4E4BC`（**v1.2 修正**：v1.1 原写 `#F4E4BC` 不在 12 色调色板内，改用 `WHT=#FFF4D6`）、外发光 `#FFEEB0` 4px 30%α。

```
. . G G G . .
. G G H G G .
G G H H H G G
G H H H H H G
G G H H H G G
. G G H G G .
. . G G G . .
```
（G=主色绿、H=高光、.=透明）

> **§0.2 调色板微调**：v1.1 高光金 `#F4E4BC` 已在调色板，但与 WHT 视觉接近，建议**保留 #F4E4BC 仅用于四叶草高光**（标注用途收窄）；或**直接复用 #FFF4D6 WHT**（12 色精简）。**主美决策：保留 #F4E4BC，标注「四叶草专用高光」**，调色板仍 12 色。

### §6.2 程序化绘制契约（v1.2 重写）

```
模块：fishing/fx/CloverGlowRenderer.js
入口：drawCloverGlow(ctx, x, y, t)
触发：保底咬钩触发（onBiteStart 且未中 PERFECT 时也走，仅放大镜内可见）
```

| 参数 | 值 |
|---|---|
| 数据源 | §6.1 7×7 ASCII（硬编码为常量数组） |
| 绘制方式 | 逐像素 `fillRect(x+i, y+j, 1, 1)`（**不用 putpixel/ImageData**，与 v3.0 _drawPixelBob 同管线） |
| 像素位置 | 锚点为四叶草中心 (3,3)；最终落点 `Math.floor(x-3)`、`Math.floor(y-3)` |
| 总帧数 | 6 帧（500ms，12fps），但走 `requestAnimationFrame` 时间驱动而非帧驱动 |

**6 帧 α / 缩放 / 外发光关键帧**：

| 帧 | t (ms) | scale | α | shadowBlur | 说明 |
|---|---|---|---|---|---|
| 1 | 0 | 0.4 | 0 | 0 | 起始 |
| 2 | 80 | 1.20 | 100% | 4 | 弹性超调（最显眼帧） |
| 3 | 160 | 1.0 | 100% | 4 | 回稳 |
| 4 | 280 | 1.0 | 100% | 3 | 停留 |
| 5 | 400 | 1.0 | 60% | 2 | 上飘 -2px、淡出 |
| 6 | 500 | 0.9 | 0 | 0 | 上飘 -4px、消失 |

**外发光实现**：
- `ctx.shadowColor = '#FFEEB0'`、`ctx.shadowBlur = 关键帧值`、`shadowOffsetX/Y = 0`
- 外发光通过 shadow 自动渲染，**不需要额外画一圈像素**
- 外发光仅作用于绿色 G 像素（高光 H 像素 shadow 太亮会糊化，绘制 H 时临时 `shadowBlur = 0`）

**缩放实现**：
- 用 `ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-3, -3)` 包裹绘制
- 缩放后整数像素会被打破，**接受 scale!=1 时的子像素**（仅持续 80ms 弹性帧，视觉不可察）；scale=1 帧严格整数对齐
- 主美决策：弹性帧的子像素糊化是「弹性手感」的来源，不消除

**红线**（v1.1 保留）：
- 无任何文字
- 不上 HUD
- 位置每次 ±2px 浮动避免被识破系统补偿

---

## §8 资产清单（重写）

> **v1.1 13 项 = 8 张实际生图 + 1 复用 + 1 程序化 + 3 v3.0 已有**
> **v1.2 13 项 = 9 程序化 + 1 复用 + 3 v3.0 已有 = 0 张 AI 生图**

| # | 资产 | v1.1 工艺 | v1.2 工艺 | 程序化模块 |
|---|---|---|---|---|
| ① | 浮漂轻档抖动 | 程序化（v3.0 _drawPixelBob + 偏移） | **同** | `fishing-scene.js: _drawPixelBob` + `applyShakeOffset(tier='light')` |
| ② | 浮漂中档抖动 | 程序化 | **同** | 同上，tier='medium' |
| ③ | 浮漂猛档抖动 | 程序化 | **同** | 同上，tier='heavy' |
| ④ | 猛档水花 8f | AI 生图 | **改程序化** | `fishing/fx/SplashParticleRenderer.js`（PIL 抛物线粒子，运行时 Canvas，N=12 粒子，重力+初速 8 帧） |
| ⑤ | 放大镜染色 heavy | AI 生图 | **改程序化** | `fishing/fx/MagnifierTintRenderer.js`（§2.1） |
| ⑥ | 放大镜染色 LATE | AI 生图 | **改程序化** | `fishing/fx/MagnifierTintRenderer.js`（§2.2，与 ⑤ 同模块复用） |
| ⑦ | 四叶草微光 6f | AI 生图 | **改程序化** | `fishing/fx/CloverGlowRenderer.js`（§6.2） |
| ⑧ | PERFECT「稳！」 | AI 生图 | **改程序化** | `fishing/fx/PerfectTextRenderer.js`（§5.1，tier='light'） |
| ⑨ | PERFECT「妙！」 | AI 生图 | **改程序化** | 同上，tier='medium' |
| ⑩ | PERFECT「完美！」 | AI 生图 | **改程序化** | 同上，tier='heavy'（含 4 道放射光） |
| ⑪ | 「可惜……」文案 | AI 生图 | **改程序化** | `fishing/fx/MissTextRenderer.js`（§4.4） |
| ⑫ | 鱼影远景 | 复用 | **同** | 复用 `fish_shadow_3layers.png` 远景层 |
| ⑬ | 涟漪/微震 | 程序化 | **同** | 复用现有 1.4s 涟漪参数化 + onBiteStart 60ms 微震 |

**P1 附加**（2 项保留 v1.1 状态，本次 v1.2 不变）。

**统计**：
- 程序化：9 项（① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ 中除 ①②③ 外都是新增程序化，①②③ 已在 v1.1 程序化）
- 修正：① ② ③ ⑬ 共 4 项 v3.0/v1.1 已程序化 + ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ⑪ 共 8 项 v1.2 新增程序化 = **共 12 项程序化**（口径细化）+ ⑫ 复用 1 项 = 13
- **AI 生图：0 张、Token 消耗：0**

**模块命名规范**（主美拍板）：
- 战斗 / 钓鱼场景内的纯绘制模块统一放 `fishing/fx/` 下
- 命名 `<功能>Renderer.js`
- 入口函数统一 `draw<功能>(ctx, ...args, t)`，t 为 elapsed ms
- 时间驱动而非帧驱动（兼容掉帧）

---

## §9 验收 DoD（重写）

> **v1.1**：5 人小测 + Nina 双签
> **v1.2**：**老板验收 + Nina 双签**（不再走美术团队级评审，全部代码验收）

### §9.1 老板 + Nina 双签必过项

1. 三档力度区分：实机录屏 5s，三档连放，老板 + Nina 一致判定档位差异清晰（无主观「看不清楚」反馈）
2. 猛档泛红 vs LATE 呼吸：实机录屏对比，色相区分明显（`#C8412B` vs `#E8553D`）
3. PERFECT 三档识别：「稳！/妙！/完美！」字号 + 金光层数 + 放射光差异，实机录屏一眼可分

### §9.2 老板 + Nina 双签红线

1. 四叶草不被识破为系统提示（无文字、无 HUD、随机偏移生效）
2. 「可惜……」不引起挫败感（米灰低饱和、淡入淡出柔和、无震动无金光）

### §9.3 整工程一致性（v1.2 新增）

1. **像素硬边**：所有 9 项程序化资产截图与 v3.0 浮漂同框，无反锯齿 / 无半透明边缘糊化（除 §6.2 弹性帧已签字豁免）
2. **色板合规**：所有像素色值命中 12 色调色板，截图取色器抽检 5 处 / 资产
3. **整数像素对齐**：所有 fillRect / fillText 坐标 `Math.floor` 后绘制（§5 放射光 rotate 后 `Math.round` 落点）

### §9.4 程序化前置检查（v1.1 保留 + v1.2 扩展）

> v1.1 仅约束 ①②③ 浮漂三档；**v1.2 扩展到全部 9 项程序化资产**。

每项程序化资产 PR 合入前必过：
1. **主程录屏**：本地 dev 环境录屏 ≥3s，覆盖资产完整生命周期
2. **Nina 双签**：录屏发 Nina + 主美双确认
3. **grep 复核**：主程提交前对照本规范第 N 节，确认色值 / 字号 / 关键帧 / 模块路径全部一致
4. **同框测试**：与 v3.0 浮漂、双轴搏斗 UI 同 Canvas 渲染一帧，截图比对像素硬边一致性

---

## §10 决策溯源（新增 v1.2 条目）

### v1.2 全程序化路线决策溯源

**决策**：D5 全 13 项资产中可绘制的 9 项**全部程序化**，**0 张 AI 生图**。

**论证四支柱**：

1. **数学函数轨迹**：所有 9 项资产的视觉本质都是「几何形状 + 时间函数 + 色板查表」——
   - 浮漂抖动 = `_drawPixelBob(cx+Δx(t), cy+Δy(t))`，Δ 是分段三角波
   - 放大镜染色 = 4 段 fillRect + multiply + α 关键帧
   - 水花粒子 = 抛物线 `y=v₀t-0.5gt²` + N=12 粒子
   - 四叶草 = 7×7 ASCII 数组 + scale/α 关键帧
   - PERFECT 字 = fillText + shadowBlur 多层叠加
   - 放射光 = 4 道 linearGradient × fillRect × rotate
   - 「可惜」= fillText + α 双段曲线
   均可用 ≤80 行代码精确表达。**数学函数 100% 复现，AI 生图无法复现**。

2. **像素硬边底线**：D5 与双轴搏斗 / v3.0 浮漂同 Canvas 渲染。AI 生图的反锯齿 / 抗锯齿采样会在边缘产生半透明像素，与周围硬边像素拼接时形成「软-硬-软」边缘断裂。程序化 fillRect 天然 1px 硬边、零锯齿。

3. **v3.0 工程统一基准**：v1.1 修订已确立 v3.0 9 色调色板为「PHASE 21-1 扩展 12 色」基准，绘制管线（`_drawPixelBob` 等 `_drawPixelXxx` 系列函数）已成既有约定。新资产沿用同管线 = 零学习成本、零集成风险、零额外构建步骤（不需要 sprite atlas 打包、不需要 PNG 加载等待）。

4. **0 token 消耗**：相较 v1.1 「8 张实际生图」预估 ~16k token + 后续每次微调重新生图 + 索引化重映射工序，v1.2 程序化 = 主程一次性写完模块 + 后续参数热更新 = **生图 token 消耗 0、迭代成本趋零**。

**关联决策**（追溯）：
- v1.1 修订（2026-06-01）：浮漂程序化 → v3.0 真实色板 12 色基准 → §6.1 高光金统一
- v1.2 修订（2026-06-01）：基于 v1.1 程序化基准，**外推至全部可绘制资产**

**反向论证**（不程序化的成本）：
- AI 生图后必须人工像素清边 ≥3 轮 / 张 × 8 张 = 24 轮
- 索引化色板重映射 ≥2 轮 / 张 × 8 张 = 16 轮
- 任意参数微调（字号 / 金光层数 / 帧数）需重新生图 + 重清边
- 总工时估算 ≥3 人日，**远高于程序化 ≤1 人日**

**老板拍板时间**：2026-06-01 18:xx
**主美拍板理由**：以上 4 项支柱在工程现状下**全部成立**，无任何反对依据。

---

## 变更外部影响

- **§0.1 / §0.2 调色板**：12 色不变（仅 §6.1 高光金 #F4E4BC 用途收窄标注「四叶草专用」）
- **§1 三档差异化策略**：完全不变
- **§3 关键交互规格**：完全不变
- **§7 漏提演出**（涟漪/鱼影/微震）：完全不变
- **主策划玩法决策**：5 决策点、三档窗口长度等**完全不变**

---

## 移交 Nina

✅ 主美 v1.2 修订清单完成。
➡️ Nina 接力 patch `docs/PHASE-21-1-D5-art-spec.md`（在 v1.1 修订段后追加 v1.2 修订段，按本清单 §0.3 / §2 / §4.4 / §5 / §6 / §8 / §9 / §10 顺序应用）。
➡️ 完成后**直接进入主程指令书阶段**（无需老板再拍板，本路线已老板拍板 + 主美拍板 + Nina 双签即可）。

主程指令书需覆盖：
1. 9 个 `fishing/fx/<Name>Renderer.js` 模块的接口签名与挂载点
2. 时间驱动主循环接入（`requestAnimationFrame` + elapsed 传入）
3. 12 色调色板常量在工程内的统一引入路径
4. 字体 fallback 链的全局注册位置
5. 录屏 + Nina 双签的 PR 模板（§9.4）

---

**v1.2 修订清单完。**
