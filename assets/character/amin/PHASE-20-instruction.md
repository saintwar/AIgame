# PHASE 20 - 阿明四方向行走动画接入指令书

> **交付状态**：✅ 美术已就绪，主程接入即可
> **预计工时**：1.5 ~ 2 小时
> **执行者**：CodeBuddy（由主程对接）
> **验收人**：Nina(PM) → 老板

---

## 一、交付物清单（已就位）

| 文件 | 路径 | 用途 |
|------|------|------|
| 雪碧图 | `assets/character/amin/amin-walk-sheet-v3.png` | 800×446，4行×6列=24帧 |
| 帧索引JSON | `assets/character/amin/amin-frame-spec-v3.json` | 每帧精确 src_x/y/w/h |

---

## 二、核心规格（来自主策划+主美会诊）

### 行 → 方向映射
| Row | 方向 | 帧数 |
|-----|------|------|
| 0 | down（朝下/正面） | 6 |
| 1 | up（朝上/背面） | 6 |
| 2 | left（朝左走，原生帧，**不用镜像**） | 6 |
| 3 | right（朝右走） | 6 |

### 动画参数
- **frameInterval**：100ms / 帧
- **单循环时长**：600ms（6帧 × 100ms）
- **walkSpeed**：80px/s（沿用现有值，不改）
- **idle行为**：停止移动时定格当前方向第 0 帧（不做呼吸微动）
- **方向切换**：保留当前 frameIdx，**不重置**（保证走路视觉连贯）
- **斜向输入**：后按优先（沿用现有规则）

### 渲染画布
- 统一画布 **96×112 px**
- 脚底锚点 **(48, 110)** —— 角色 player.x/y 对应锚点位置
- 各帧 src_w/src_h 不一（54~77 × 99~102），需在画布内**水平居中 + 脚底对齐**

---

## 三、实施步骤

### Step 1：资源加载
```js
// 在场景 preload 阶段加载
const aminSheet = new Image();
aminSheet.src = 'assets/character/amin/amin-walk-sheet-v3.png';

const aminSpec = await fetch('assets/character/amin/amin-frame-spec-v3.json')
  .then(r => r.json());

// 构建快查表：frameMap[direction][col] = {src_x, src_y, src_w, src_h}
const frameMap = { down: [], up: [], left: [], right: [] };
aminSpec.frames.forEach(f => { frameMap[f.direction][f.col] = f; });
```

### Step 2：状态机扩展
```js
// 在 player 对象上扩展
player.anim = {
  dir: 'down',        // 当前朝向
  frameIdx: 0,        // 当前帧（0~5）
  lastTick: 0,        // 上次切帧时间
  moving: false       // 是否在移动
};
```

### Step 3：每帧 update（在主循环中）
```js
function updateAminAnim(now, dt) {
  // 1. 根据输入更新朝向（优先级：dy > dx 或按需，沿用现有规则）
  const { dx, dy } = input;  // 当前帧位移
  player.anim.moving = (dx !== 0 || dy !== 0);

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) player.anim.dir = 'right';
    else if (dx < 0) player.anim.dir = 'left';
  } else {
    if (dy > 0) player.anim.dir = 'down';
    else if (dy < 0) player.anim.dir = 'up';
  }

  // 2. 推进帧索引（仅移动时）
  if (player.anim.moving) {
    if (now - player.anim.lastTick >= 100) {
      player.anim.frameIdx = (player.anim.frameIdx + 1) % 6;
      player.anim.lastTick = now;
    }
  } else {
    // idle：定格第 0 帧
    player.anim.frameIdx = 0;
  }
}
```

### Step 4：渲染（替换原 emoji/单图绘制）
```js
function renderAmin(ctx) {
  const f = frameMap[player.anim.dir][player.anim.frameIdx];
  if (!f) return;  // 兜底

  const CANVAS_W = 96, CANVAS_H = 112;
  const ANCHOR_X = 48, ANCHOR_Y = 110;

  // 画布左上角的世界坐标（以脚底锚点为基准）
  const canvasX = player.x - ANCHOR_X;
  const canvasY = player.y - ANCHOR_Y;

  // 帧在画布内的偏移：水平居中 + 脚底对齐画布底
  const offsetX = (CANVAS_W - f.src_w) / 2;
  const offsetY = CANVAS_H - f.src_h;  // 帧底部贴齐画布底

  ctx.drawImage(
    aminSheet,
    f.src_x, f.src_y, f.src_w, f.src_h,           // src
    Math.round(canvasX + offsetX),                 // dest x（取整防抖）
    Math.round(canvasY + offsetY),                 // dest y
    f.src_w, f.src_h                               // dest size（1:1，不缩放）
  );
}
```

### Step 5：黑底处理（必须）
**雪碧图是纯黑背景，渲染时需做以下任一处理**：
- **方案A（推荐）**：CodeBuddy 在加载图片后用 Canvas 抠掉黑底转 alpha
  ```js
  function blackToAlpha(img) {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    const data = c.getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < data.data.length; i += 4) {
      const lum = (data.data[i] + data.data[i+1] + data.data[i+2]) / 3;
      if (lum < 30) data.data[i+3] = 0;  // 黑底→透明
    }
    c.putImageData(data, 0, 0);
    return cv;
  }
  // 加载完成后：aminSheet = blackToAlpha(原图)
  ```
- **方案B**：用 `globalCompositeOperation = 'screen'` 渲染时滤掉（不推荐，会改变颜色）

---

## 四、严格约束（红线）

1. ❌ **不动**村庄场景碰撞、A* 寻路、NPC、对话系统、任务链
2. ❌ **不动**钓鱼场景（FishingScene）任何逻辑
3. ❌ **不改** walkSpeed=80px/s
4. ❌ **不引入**新依赖库
5. ✅ 仅替换村庄场景中的阿明绘制函数（原本可能是 emoji 或单图）
6. ✅ 钓鱼场景中如果阿明也用了行走帧，同步生效（如不需要走路，保持 idle 第0帧定格朝下）

---

## 五、验收清单（DoD）

- [ ] 阿明四方向行走流畅，每方向 6 帧循环可见
- [ ] 朝左走时身体面向左（**原生帧，不是镜像**）
- [ ] 停下时定格当前朝向第 0 帧，无抖动
- [ ] 切换方向时走路连贯（frameIdx 不重置）
- [ ] 黑底已抠掉，角色边缘干净无黑框
- [ ] 脚底锚点稳定，跨帧不抖动（54~77px宽度差不影响视觉）
- [ ] 钓鱼场景进入/退出后阿明显示正常
- [ ] FPS 不下降（drawImage 每帧 1 次，几乎零开销）

---

## 六、回退方案

```bash
git stash push -m "PHASE-20-amin-walk-failed"
```
回到 PHASE 19 干净状态，Nina 复盘后重出指令书。

---

## 七、Nina 监控点

- **预计耗时超 2h** → 喊停，让 CodeBuddy 输出当前进度
- **黑底抠图失败/边缘有黑框** → 主美兜底处理图片（重导出带alpha PNG）
- **脚底抖动** → 优先怀疑 offsetY 算法，强制取整或调整锚点
