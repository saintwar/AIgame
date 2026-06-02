# Hotfix 简报：钓鱼技巧弹窗时机（2026-06-02-2）

**收件**：Nina + 项目组
**发件**：项目负责人
**线上版本**：`main.js?v=20260603c`（commit `147fed3`，已发布）

---

## 1. 问题

首次钓鱼提竿成功后，「钓鱼技巧」教程弹窗背景仍是**水面视角**（阿明 + 浮台 + 远山），而不是水下博弈视角。新玩家会困惑"为什么教程里没有 HP 条 / 鱼？"

## 2. 根因

`_initPlayingState()` 链路：

```
BiteWindow 提竿 → _scheduleReelingTransition(800ms)
  → _startReeling() → fsm.transition('Playing') → _initPlayingState()
    → _showTensionTutorialIfNeeded()
      → this.paused = true       ← 立刻冻结主循环
      → 弹教程
```

主渲染 `_render()` 的分支：

```js
if (this.fsm.is('Playing')) this._renderPlaying();   // 水下视角
else { ... 水面视角（阿明 / 浮台 / 鱼线） ... }
```

`paused = true` 在 `_initPlayingState` 内同步执行，**主 _loop 还没机会跑到 _render**，于是 canvas 仍是上一帧（BiteWindow 末帧）的水面残影。

第一次尝试用 `requestAnimationFrame` 推两帧也失败 —— RAF callback 与主 `_loop`（也是 RAF 驱动）同队列，可能在 `_loop` 之前连续触发完，paused=true 一样把画面冻在水面残帧。

## 3. 修复

`js/fishing-scene.js` `_initPlayingState()` 末尾：

```diff
- this._showTensionTutorialIfNeeded();
+ if (!window.Save?.get('flags.fishing_tutorial_shown')) {
+   setTimeout(() => this._showTensionTutorialIfNeeded(), 80);
+ }
```

`_showTensionTutorialIfNeeded` 顶部加二次守护：

```js
// 弹时若已不在 Playing（异常路径打断），直接放弃
if (!this.fsm.is('Playing')) return;
```

**为什么 80ms / 为什么 setTimeout：**
- 80ms ≈ 4-5 帧 @60fps，足够 `_loop` 把 `_renderPlaying`（水下视角）真正绘到 canvas
- `setTimeout` 与 RAF 队列分离，确保推迟期间真的有渲染帧跑完
- 80ms 玩家几乎无感（提竿后整段过渡是 800ms）

## 4. 文件改动

```
M  index.html              (main.js?v= → 20260603c)
M  js/fishing-scene.js     (教程改为 setTimeout 80ms + 二次守护)
```

## 5. 验收清单

1. 清存档教程标记：`window.Save.set('flags.fishing_tutorial_shown', false); window.Save.commit()`
2. 进入钓鱼场景，正常钓一次
3. 提竿成功后，看教程弹出时背景应该是**纯水下视角**：水下底图（fishing-down-bg.jpg）/ HP 条 / 张力条 / 红心鱼影
4. 若仍看到阿明 + 浮台 → 即为 bug 回归

线上一键验：
```bash
curl -s "https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/js/fishing-scene.js?nocache=$RANDOM" | grep "setTimeout.*_showTensionTutorialIfNeeded"
# 应输出：setTimeout(() => this._showTensionTutorialIfNeeded(), 80);
```

## 6. 后续注意（D6/D8）

- 任何"立即 paused + 弹模态"的设计模式，都要小心**当前帧渲染是否已完成**
- 推荐统一范式：进入新视角态 → setTimeout(80ms) → paused + 弹窗
- 不要用 requestAnimationFrame 解决此类问题（与主循环 RAF 同队列，不保证渲染发生）

— 项目负责人，2026-06-02 18:50
