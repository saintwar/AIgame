# PHASE 21-C — 4 个可交互建筑 PNG 实际像素 vs 锚点 bbox 对照表

> 给主美做 Y-sort occluder 切图基准，所有数据均与 `js/render/buildings-art.js`
> 里的 `REGISTRY` 元数据 1:1 一致。村庄 canvas 尺寸 1280×720，左上角 (0,0)。

## 1. 整页对照表（主美明早开工直接抄这张）

| key | PNG 文件 | 自然像素 (W×H) | 渲染像素 (W×H) | 瓦片锚点 (x, y) | anchor 偏移 (dx, dy) | **实际左上角** | **实际右下角** | **屏幕占用区域** |
|---|---|---|---|---|---|---|---|---|
| `chief_house`   | `assets/images/buildings/chief_house.png`         | 220×212 | 220×212 | (256, 256) | (-46,  -84) | **(210, 172)** | (430, 384) | 210 ≤ x ≤ 430，172 ≤ y ≤ 384 |
| `fishing_shop`  | `assets/images/buildings/fishing_tackle_shop.png` | 279×212 | 279×212 | (832, 256) | (-139, -84) | **(693, 172)** | (972, 384) | 693 ≤ x ≤ 972，172 ≤ y ≤ 384 |
| `aming_house`   | `assets/images/buildings/aming_house.png`         | 225×229 | 225×229 | (64,  448) | (-48,  -101)| **(16,  347)** | (241, 576) | 16  ≤ x ≤ 241，347 ≤ y ≤ 576 |
| `seven_eleven`  | `assets/images/buildings/711.png`                 | 245×204 | 245×204 | (960, 448) | (-58,  -76) | **(902, 372)** | (1147,576) | 902 ≤ x ≤ 1147，372 ≤ y ≤ 576 |

## 2. 字段含义速查

| 字段 | 解释 |
|---|---|
| **瓦片锚点 (x, y)** | `village-scene.js` 调用 `BuildingsArt.draw(key, ctx, x, y)` 传进来的 x/y，即"建筑物理占地左上角"。物理占地 2×1 瓦片 = 128×64 像素。 |
| **anchor 偏移 (dx, dy)** | PNG 视觉左上角相对瓦片左上角的偏移；负值 = 向左/上溢出（视觉超过物理瓦片，不影响碰撞）。详见 `buildings-art.js` 第 30-34 行注释。 |
| **实际左上角** | `(瓦片 x + dx, 瓦片 y + dy)`，**这个就是主美做合成图时贴 PNG 的位置**。 |
| **屏幕占用区域** | PNG 在 1280×720 canvas 上覆盖的实际像素范围。 |

## 3. 可视化（ASCII 草图）

```
canvas 1280×720 左上角 (0,0)
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│      ┌──────────┐                       ┌────────────┐          │  ← y=172
│      │chief_    │                       │fishing_    │          │
│      │house     │                       │shop        │          │
│      │220×212   │                       │279×212     │          │
│      │          │                       │            │          │
│      └──────────┘                       └────────────┘          │  ← y=384
│   x=210     x=430                    x=693          x=972       │
│                                                                 │
│                                                                 │
│   ┌───────────┐                              ┌─────────────┐    │  ← y=347/372
│   │aming_     │                              │seven_eleven │    │
│   │house      │                              │711          │    │
│   │225×229    │                              │245×204      │    │
│   │           │                              │             │    │
│   └───────────┘                              └─────────────┘    │  ← y=576
│ x=16     x=241                            x=902         x=1147  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                                  (1280, 720)
```

## 4. occluder 切图设计建议

### 4.1 Y-sort baseY 推荐值

每个建筑应该至少切出**屋顶/上半部**作为 occluder（上层精灵），玩家走到建筑物正下方/后方时被压在 occluder 下层制造遮挡感。

| key | 推荐 occluder baseY | 含义 |
|---|---|---|
| chief_house  | y = 320 | 屋顶下方 1/3 处。玩家 sprite y < 320 时被屋顶压在下面 |
| fishing_shop | y = 320 | 同上 |
| aming_house  | y = 510 | 屋顶下方 1/3 处。玩家走到房屋后方时被屋顶压住 |
| seven_eleven | y = 510 | 同上 |

> 判定方向（俯视 2D 经典 Y-sort）：
> - 屏幕 y 越小 = 越靠"后"，y 越大 = 越靠"前"
> - **`sprite.py < baseY` 时画 occluder**（玩家在建筑后方/上半身位置 → 被屋顶压住）
> - `sprite.py >= baseY` 时不画（玩家在建筑前方/脚下 → 正常叠在 building 之上）
> 
> baseY 是切图工具/导出元数据里要标的，不是图本身的视觉切割线。
> 视觉切割线建议比 baseY **再低 20-40 像素**（让屋檐有遮挡纵深感）。

### 4.2 切图导出元数据建议格式

```json
{
  "occluders": [
    {
      "key": "chief_house_occ",
      "src": "assets/images/buildings/chief_house_occ.png",
      "anchor": { "x": 210, "y": 172 },
      "baseY": 320
    },
    ...
  ]
}
```

我这边按这个格式做加载器即可。

## 5. 玩家 sprite 参考

- 玩家 sprite 显示尺寸：64×64（像素）
- 当前坐标系：玩家 `x, y` = 中心点像素坐标
- Y-sort 判定建议：`if (player.y < occluder.baseY) draw_occluder_above_player`

## 6. 数据来源

| 文件 | 字段 |
|---|---|
| `js/render/buildings-art.js` 第 36-62 行 | REGISTRY 元数据（src / render / anchor） |
| `js/village-scene.js` 第 2165-2174 行附近 | 4 个建筑的瓦片锚点 (chiefX/chiefY 等) |
| `assets/images/scenes/village-riverside-bg.jpg` | 1280×720 村庄底图（occluder 合成基准） |

---

> 生成时间：2026-05-30 03:40  
> 产出：Vincent (CodeBuddy)  
> 用途：PHASE 21-C 主美 occluder 切图基准
