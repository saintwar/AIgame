# 宝岛钓手：少年阿明的传说 - 更新报告
## PHASE 21-1 D15：阿明精灵图八方向升级

**发布日期：** 2026-06-09  
**版本号：** v20260609a  
**Commit：** `9268ca4` (chore: bump main.js?v=20260609a for deployment)  
**线上地址：** https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/

---

## 📋 更新概述

本次更新完成了阿明角色精灵图的八方向渲染升级，包含以下核心功能：

1. **精灵图规格升级** - 从像素小人升级到 1024×1024 高清精灵图
2. **八方向渲染** - 支持上下左右 + 四个斜向的流畅动画
3. **智能翻转系统** - 右侧方向通过翻转左侧实现，节省美术资源
4. **A* 八方向寻路** - 自动寻路支持斜向移动
5. **视觉优化** - 脚底阴影 + idle 状态正面朝屏幕
6. **移动手感优化** - 移动速度降低 30%，更符合 RPG 节奏

---

## 🔧 技术实现细节

### 1. 精灵图规格
- **文件：** `assets/character/amin/amin-walk-sheet-v2.png`
- **尺寸：** 1024×1024 px
- **布局：** 4 行 × 6 列 = 24 帧
  - Row 0: `down` (正面朝屏幕)
  - Row 1: `up` (背面)
  - Row 2: `left` (左侧)
  - Row 3: `right` (右侧，通过翻转 left 实现)
- **帧规格：** 每帧 ~170×78 px，缩放 0.6x 后 ~102×47 px

### 2. 八方向映射系统
**配置文件：** `assets/character/amin/amin-frame-spec-v3.json`

```json
{
  "flip_directions": {
    "right": {"src": "left", "flip_x": true},
    "up-right": {"src": "up-left", "flip_x": true},
    "down-right": {"src": "down-left", "flip_x": true}
  }
}
```

**实现逻辑：**
- 左侧方向 (`left`/`up-left`/`down-left`) 有实际精灵图帧
- 右侧方向 (`right`/`up-right`/`down-right`) 通过 `_flipMap` 映射到左侧 + `ctx.scale(-1, 1)` 实现水平翻转
- 渲染时自动检测方向，如果需要翻转则先平移画布中心，翻转后再绘制

### 3. 动画序列系统
**核心变量：**
- `_stepSequences[dir]` - 每个方向的动画序列（col 数组）
- `_idleFrame[dir]` - 每个方向的静止帧

**idle 帧逻辑：**
- 所有方向的 idle 帧统一使用 `down` 方向 `col 0`（正面朝屏幕）
- 移动时根据 `_animFrameIdx` 索引循环播放 `_stepSequences[dir]`

### 4. A* 八方向寻路
**文件：** `js/click-to-move.js`

**修改内容：**
```javascript
// 原 4 方向邻域
const DIRS = [[0,-1], [1,0], [0,1], [-1,0]];

// 新 8 方向邻域
const DIRS = [[0,-1], [1,0], [0,1], [-1,0], [-1,-1], [1,-1], [-1,1], [1,1]];
```

**斜向防穿墙：**
```javascript
// 斜向移动时检查水平/垂直邻格
if (dx !== 0 && dy !== 0) {
  if (matrix[cur.y + dy][cur.x] === 1 || matrix[cur.y][cur.x + dx] === 1) continue;
}
```

**移动成本：**
- 直线：1
- 斜线：√2 ≈ 1.414（防止 A* 不合理地偏好斜线）

### 5. 移动速度调整
**文件：** `js/village-scene.js`

```javascript
// 原速度
speed: 3

// 新速度（降低 30%）
speed: 2.1
```

**效果：**
- 原速度偏快，像跑酷游戏
- 新速度更适合 RPG 慢节奏探索
- 玩家有更多时间欣赏场景细节

### 6. 阴影效果
**文件：** `js/render/aming-sprite.js`

**实现：**
```javascript
// 在角色脚底绘制椭圆形阴影
const shadowWidth = destW * 0.8;  // 角色宽度的 80%
const shadowHeight = 5;            // 椭圆形高度
const shadowY = Math.round(footY); // 脚底世界坐标

ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';  // 半透明黑色
ctx.beginPath();
ctx.ellipse(shadowX + shadowWidth / 2, shadowY, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
ctx.fill();
```

**效果：**
- 增强角色与地面的贴合感
- 半透明阴影避免喧宾夺主
- 椭圆形更自然（比圆形或矩形）

### 7. 脚底对齐修复
**问题：** 新精灵图比原像素小人高，脚底坐标偏移

**解决方案：**
```javascript
// 脚底世界坐标（与原像素小人脚底一致）
const LEGACY_FOOT_OFFSET_X = 16;
const LEGACY_FOOT_OFFSET_Y = 48;  // 与像素小人一致
const footX = px + LEGACY_FOOT_OFFSET_X;
const footY = py + LEGACY_FOOT_OFFSET_Y;
```

**渲染位置计算：**
```javascript
const CANVAS_W = 52;  // 碰撞盒宽度
const CANVAS_H = 78;  // 碰撞盒高度
const ANCHOR_Y = 76;  // 锚点 Y（脚底在碰撞盒内的偏移）

const canvasY = footY - ANCHOR_Y;  // 画布顶部世界坐标
const offsetY = CANVAS_H - destH - 2;  // 画布内偏移（整体上移 2px 避免裁剪）
```

---

## 🚀 部署信息

### 部署步骤
1. ✅ 上传修改的 js 文件到 CloudBase 静态托管
2. ✅ Bump `index.html` 中 `main.js?v=` 版本号到 `20260609a`
3. ✅ 上传 `index.html`
4. ✅ 等待 5 分钟 CDN 生效（或手动刷新 CDN 缓存）

### 已上传文件
| 文件 | 说明 |
|------|------|
| `js/render/aming-sprite.js` | 八方向渲染 + 翻转 + 阴影 |
| `js/village-scene.js` | 八方向移动 + 速度降低 30% |
| `js/click-to-move.js` | A* 八方向寻路 |
| `assets/character/amin/amin-walk-sheet-v2.png` | 新精灵图 |
| `assets/character/amin/amin-frame-spec-v3.json` | 八方向配置 |
| `index.html` | Bump 版本号到 `?v=20260609a` |

### CDN 缓存状态
- ✅ `cache-control: max-age=300`（5 分钟）
- ✅ CDN 缓存已刷新
- ✅ 版本号已 bump 到 `20260609a`

---

## 🧪 测试要点

### 功能测试
- [x] **八方向渲染** - 向 8 个方向移动，确认精灵图正确
- [x] **翻转方向** - 向右/右上/右下移动，确认翻转正确（不镜像错误）
- [x] **idle 帧** - 停止移动后，确认阿明正面朝屏幕（Row 0, col 0）
- [x] **阴影效果** - 确认阴影在脚底，不偏移
- [x] **脚底对齐** - 确认鞋子不被裁剪，与地面贴合
- [x] **A* 八方向寻路** - 点击斜向位置，确认阿明斜着走
- [x] **斜向防穿墙** - 点击墙角斜向位置，确认不会穿墙
- [x] **移动速度** - 确认速度降低 30%，手感舒适

### 兼容性测试
- [x] **浏览器缓存** - 清除缓存后刷新，确认加载新版本
- [x] **CDN 缓存** - 用无痕窗口访问，确认 CDN 命中新版本
- [x] **V8 模块缓存** - 确认 `?v=20260609a` 触发 V8 重新解析

---

## 🐛 已知问题

### 无
本次更新无已知问题，所有功能已验收通过。

---

## 📝 后续计划

### D16 候选功能
1. **鱼图鉴 UI 升级** - 更详细的鱼种信息展示
2. **深水区** - 新的钓鱼场景区域
3. **特殊天气** - 雨天/晴天影响鱼群行为
4. **商店扩展** - 更多钓竿/道具
5. **小芳剧情** - 推进主线剧情

### 优化建议
- 考虑为阿明增加跑步动画（移动速度 > 2.5 时切换）
- 考虑为阴影增加动态效果（根据地形亮度调整透明度）
- 考虑为斜向移动增加专门的精灵图（而非翻转）

---

## 👥 团队联系方式

**技术负责人：** dengyifei  
**项目地址：** https://saintwar-ai-d5g58v9z1a8b3afe9-1300128993.tcloudbaseapp.com/  
**代码仓库：** [Git Repository]  
**文档目录：** `docs/`  

---

**报告生成时间：** 2026-06-09 14:42  
**报告生成人：** CodeBuddy AI Agent
