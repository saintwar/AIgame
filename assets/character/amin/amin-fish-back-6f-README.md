# 阿明 · 钓鱼背面甩竿 6 帧（PHASE 21-C v1）

## 资产清单
| 文件 | 用途 |
|---|---|
| `amin-fish-back-6f.png` | 处理后 sheet（576 × 160 逻辑尺寸，6 帧水平） |
| `amin-fish-back-6f-spec.json` | 帧规格 / 锚点 / 竿尖估算 / 节奏 |
| `amin-palette.png` | 全局 24 色调色板（24 × 1 个色块条） |
| `amin-fish-back-6f-raw.png` | 原料 AI 出图（3168 × 1344，保留备查） |

## 关键规格（老板拍板）
- **整体高度**：150 px（含帽含鞋），对齐钓鱼场景现有阿明视觉尺寸
- **单帧画布**：96 × 160（上方留 30px 容举竿）
- **锚点**：(48, 158) = 脚底中央，对接 `characterX/characterY`
- **节奏**：6 帧 × 120ms = 720ms 单次播放
- **循环**：`once_then_hold`，停在第 5 帧（收手持竿）
- **缩放系数**：0.1116（约 1/9.0）
- **调色板**：24 色（联合量化，6 帧共享色板）

## 处理管线
1. 切帧：3168×1344 → 6 × (528×1344)
2. 去背 & 去阴影：白底 alpha=0；下方 1/4 区域低饱和灰阴影 alpha=0
3. 双步缩放：LANCZOS×2 → LANCZOS 到 59×150（保留像素感同时减少锯齿）
4. 联合量化：6 帧拼接后 MEDIANCUT 量化为 24 色
5. 画布对齐：脚底 bbox.bottom → 画布 y=158；水平按 bbox 中心居中
6. 估算竿尖：每帧 alpha 区域顶部最右像素（占位值，PHASE 21-1 需复核）

## 与现有代码对接（`js/fishing-scene.js`）
- 调用方仍传 `characterX, characterY`（脚底中央）
- 替换 `_renderCharacterBody` 程序化绘制为：
  ```js
  ctx.drawImage(sheet,
    frame.src[0], frame.src[1], frame.src[2], frame.src[3],
    characterX - 48, characterY - 158, 96, 160);
  ```
- **不要再做 `ctx.scale(-1, 1)`**，本资产是原生背面朝向

## 已知风险 & 需老板/PHASE 21-1 验收的点
- [ ] 竿尖坐标是估算值，需 PHASE 21-1 接战斗 UI 时校准（建议接入后用 read_image 标点回填）
- [ ] AI 出图各帧主体宽窄不一，已用 bbox 中心居中，可能与"脚步原地不动"略有偏差，必要时手工微调每帧 anchor
- [ ] 24 色量化对羽毛/竿身金属色可能压扁，验收若觉得糊可放宽到 32 色重出

## 时间戳
v1 生成于 PHASE 21-C，对应缩放系数 0.1116（1/9 档）
