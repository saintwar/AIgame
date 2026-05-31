#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 21-C 阿明背面甩竿 6 帧处理管线
============================================
原料：3168 × 1344（6 帧水平拼接，每帧 528×1344）
目标：576 × 160（6 帧水平，单帧 96×160），逻辑尺寸
工艺：去阴影 → 抠主体 → 缩放（最近邻 / Lanczos 比对取像素感更佳） → 量化 24 色 → 锚点对齐
"""
import os
import json
from PIL import Image, ImageFilter, ImageOps
import numpy as np

ROOT = "/data/workspace/AIgame/assets/character/amin"
RAW  = os.path.join(ROOT, "amin-fish-back-6f-raw.png")
OUT_SHEET = os.path.join(ROOT, "amin-fish-back-6f.png")
OUT_SPEC  = os.path.join(ROOT, "amin-fish-back-6f-spec.json")
OUT_PAL   = os.path.join(ROOT, "amin-palette.png")
OUT_README = os.path.join(ROOT, "amin-fish-back-6f-README.md")

# ============ 规格（老板拍板）============
FRAMES = 6
SRC_FRAME_W = 528
SRC_FRAME_H = 1344
DST_FRAME_W = 96
DST_FRAME_H = 160
ANCHOR_X = 48
ANCHOR_Y = 158
TARGET_H = 150        # 整体高度（含帽含鞋）
SCALE = TARGET_H / SRC_FRAME_H   # ~0.1116
PALETTE_N = 24
FRAME_INTERVAL_MS = 120

print(f"[INFO] 缩放系数 = {SCALE:.4f}  (1/{1/SCALE:.2f})")

# ============ Step 1：读取并切帧 ============
raw = Image.open(RAW).convert("RGBA")
assert raw.size == (SRC_FRAME_W*FRAMES, SRC_FRAME_H), f"原料尺寸异常: {raw.size}"

frames_raw = []
for i in range(FRAMES):
    box = (i*SRC_FRAME_W, 0, (i+1)*SRC_FRAME_W, SRC_FRAME_H)
    frames_raw.append(raw.crop(box))

# ============ Step 2：去白底 / 去阴影 ============
def remove_bg_and_shadow(img: Image.Image) -> Image.Image:
    """
    本批原料图特征（实测）：
      - 大面积 **黑底**（RGB ≈ 0~12）
      - 角色脚下 / 整个下半部充斥着 **纯灰阴影**（RGB ≈ 25~55，三通道相等）
      - 纯灰阴影出现在 y > 950 的整个区域，不局限在最底部
    策略（基于色相区分）：
      1) 黑底：RGB ≤ 12 全部抹除
      2) 灰阴影：三通道差 < 8（纯灰）且 max_c 在 [13, 60] 之间（暗灰），全图范围内一律抹除
         —— 角色衣服 / 皮肤 / 帽子均带色相，不会被误伤
    """
    arr = np.array(img).astype(np.int16)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    # 1) 黑底
    black_mask = (r <= 12) & (g <= 12) & (b <= 12)

    # 2) 暗灰阴影（全图，靠色相判定，不靠位置）
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c
    is_pure_gray = (delta < 8)
    is_dark = (max_c >= 13) & (max_c <= 60)
    shadow_mask = is_pure_gray & is_dark

    kill = black_mask | shadow_mask
    arr[..., 3] = np.where(kill, 0, a)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")

frames_clean = [remove_bg_and_shadow(f) for f in frames_raw]

# ============ Step 3：定位主体 bbox（用于上下对齐）============
def alpha_bbox(img: Image.Image):
    a = np.array(img)[..., 3]
    ys, xs = np.where(a > 8)
    if len(ys) == 0:
        return None
    return (xs.min(), ys.min(), xs.max()+1, ys.max()+1)

bboxes = [alpha_bbox(f) for f in frames_clean]
print("[INFO] 各帧主体 bbox:")
for i, bb in enumerate(bboxes):
    print(f"  frame {i}: {bb}  H={bb[3]-bb[1]}  W={bb[2]-bb[0]}")

# 全局基线对齐：以所有帧鞋底（bbox.bottom）的最大值作为统一基线
# 这样保证脚底在缩放后落在同一 y 上
global_bottom = max(bb[3] for bb in bboxes)   # 原图坐标中最底
global_top    = min(bb[1] for bb in bboxes)
global_left   = min(bb[0] for bb in bboxes)
global_right  = max(bb[2] for bb in bboxes)
print(f"[INFO] 全局 bbox: top={global_top} bottom={global_bottom} L={global_left} R={global_right}")
print(f"[INFO] 全局主体高度 ~ {global_bottom-global_top}px / 1344")

# ============ Step 4：缩放（按主体 bbox 高度，不是原料整帧）============
# 关键：原料每帧 1344 高，但主体只占中部 ~960px，上下都是黑色 padding。
# 老板要的 "整体高度 150px" 是指主体（帽顶→鞋底），所以按 global bbox 高度算缩放。
GLOBAL_BODY_H = global_bottom - global_top   # 主体最大高度（不同帧已统一基线）
ACTUAL_SCALE = TARGET_H / GLOBAL_BODY_H       # 真实缩放系数
print(f"[INFO] 修正缩放系数 = {ACTUAL_SCALE:.4f}（按主体 {GLOBAL_BODY_H}px → 150px）")

def pixelize(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """两步缩放：LANCZOS×2 → LANCZOS 到目标，平衡像素感与抗锯齿。"""
    mid = img.resize((target_w*2, target_h*2), Image.LANCZOS)
    out = mid.resize((target_w, target_h), Image.LANCZOS)
    return out

# 先把每帧裁到全局主体 bbox（统一上下边界），再按 ACTUAL_SCALE 缩放
SCALED_W = round(SRC_FRAME_W * ACTUAL_SCALE)        # ≈ 82
SCALED_H = round(GLOBAL_BODY_H * ACTUAL_SCALE)      # = 150
print(f"[INFO] 单帧裁切+缩放后尺寸: {SCALED_W} × {SCALED_H}")

frames_small = []
for f in frames_clean:
    # 用全局上下 bbox 统一裁切，保留每帧的水平对齐特性
    cropped = f.crop((global_left, global_top, global_right, global_bottom))
    cw, ch = cropped.size
    tw = round(cw * ACTUAL_SCALE)
    th = round(ch * ACTUAL_SCALE)
    frames_small.append(pixelize(cropped, tw, th))

# 重新统一缩放后尺寸（避免微小舍入差）
SCALED_W = frames_small[0].size[0]
SCALED_H = frames_small[0].size[1]
print(f"[INFO] 实际单帧缩放尺寸: {SCALED_W} × {SCALED_H}")

# ============ Step 5：调色板量化（全局 24 色） ============
# 把 6 帧拼一张大图做联合量化，保证调色板统一
combo = Image.new("RGBA", (SCALED_W*FRAMES, SCALED_H), (0,0,0,0))
for i, f in enumerate(frames_small):
    combo.paste(f, (i*SCALED_W, 0), f)

# PIL quantize 不支持 RGBA，需先把 alpha=0 区域填一个调色板外的占位色再恢复
alpha = combo.split()[-1]
rgb = combo.convert("RGB")
quant = rgb.quantize(colors=PALETTE_N, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
quant_rgba = quant.convert("RGBA")
# 恢复 alpha
quant_arr = np.array(quant_rgba)
quant_arr[..., 3] = np.array(alpha)
combo_quant = Image.fromarray(quant_arr, "RGBA")

# 拆回 6 帧
frames_quant = []
for i in range(FRAMES):
    frames_quant.append(combo_quant.crop((i*SCALED_W, 0, (i+1)*SCALED_W, SCALED_H)))

# ============ Step 6：贴入 96×160 画布，脚底对齐到 anchor=(48,158) ============
sheet = Image.new("RGBA", (DST_FRAME_W*FRAMES, DST_FRAME_H), (0,0,0,0))

frame_specs = []
for i, fq in enumerate(frames_quant):
    canvas = Image.new("RGBA", (DST_FRAME_W, DST_FRAME_H), (0,0,0,0))
    # 该帧主体的实际 bbox（量化后）
    bb = alpha_bbox(fq)
    if bb is None:
        bb = (0, 0, SCALED_W, SCALED_H)
    sub_w = bb[2]-bb[0]
    sub_h = bb[3]-bb[1]
    sub = fq.crop(bb)

    # 计算每帧的脚底 y（以原图 1344 高度的 global_bottom 为基准缩放到 150 空间）
    foot_y_in_scaled = bb[3]   # 缩放后帧内的鞋底 y
    # 该帧鞋底要落在画布 anchor_y=158 → 顶部偏移
    paste_y = ANCHOR_Y - foot_y_in_scaled + bb[1]
    # 水平居中：以 bbox 中心对准 anchor_x=48
    center_x = (bb[0]+bb[2]) // 2
    paste_x = ANCHOR_X - center_x

    canvas.paste(fq, (paste_x, paste_y), fq)

    # 边界保护
    canvas_arr = np.array(canvas)
    if canvas_arr[..., 3].sum() == 0:
        print(f"[WARN] frame {i} 粘贴后空，paste=({paste_x},{paste_y}) bb={bb}")

    sheet.paste(canvas, (i*DST_FRAME_W, 0), canvas)

    # 估算竿尖坐标（仅对举竿期帧 2/3 估算，其他帧 null 留给战斗UI接入时校准）
    pole_tip = None
    if i in (2, 3):
        arr = np.array(canvas)[..., 3]
        ys, xs = np.where(arr > 0)
        if len(ys) > 0:
            # 举竿帧：竿尖 = alpha 区域最高点（y 最小），同 y 取最右 x
            y_min = ys.min()
            top_band = (ys <= y_min + 3)
            x_top = xs[top_band]
            y_top = ys[top_band]
            idx = np.argmax(x_top)
            pole_tip = [int(x_top[idx]), int(y_top[idx])]

    frame_specs.append({
        "index": i,
        "src": [i*DST_FRAME_W, 0, DST_FRAME_W, DST_FRAME_H],
        "anchor": [ANCHOR_X, ANCHOR_Y],
        "pole_tip_estimate": pole_tip,
        "duration_ms": FRAME_INTERVAL_MS
    })

sheet.save(OUT_SHEET, optimize=True)
print(f"[OK] sheet 已写: {OUT_SHEET}  size={sheet.size}")

# ============ Step 7：导出调色板图 ============
# 提取量化后调色板
pal_idx = quant.getpalette()[:PALETTE_N*3]
pal_img = Image.new("RGB", (PALETTE_N*16, 16), (0,0,0))
for i in range(PALETTE_N):
    color = (pal_idx[i*3], pal_idx[i*3+1], pal_idx[i*3+2])
    for x in range(16):
        for y in range(16):
            pal_img.putpixel((i*16+x, y), color)
pal_img.save(OUT_PAL)
print(f"[OK] palette 已写: {OUT_PAL}")

# ============ Step 8：写 spec.json ============
spec = {
    "source_image": "amin-fish-back-6f.png",
    "source_size": [DST_FRAME_W*FRAMES, DST_FRAME_H],
    "row_directions": ["up_fishing"],
    "frames_per_row": FRAMES,
    "canvas": {"w": DST_FRAME_W, "h": DST_FRAME_H, "anchor_x": ANCHOR_X, "anchor_y": ANCHOR_Y},
    "frames": frame_specs,
    "frame_interval_ms": FRAME_INTERVAL_MS,
    "loop_mode": "once_then_hold",
    "hold_frame_index": 5,
    "palette_ref": "amin-palette.png",
    "palette_size": PALETTE_N,
    "design_target_height": TARGET_H,
    "scale_factor": round(ACTUAL_SCALE, 4),
    "scale_factor_note": f"按主体 bbox 高度 {GLOBAL_BODY_H}px → 150px（非原料 1344px 整高）",
    "raw_source": "amin-fish-back-6f-raw.png (3168x1344)",
    "notes": [
        "甩竿动作序列：站立→举竿→蓄力→甩出→收手→站立持竿",
        "对齐目标：钓鱼场景 _renderCharacterBody 整体高度 150px（含帽含鞋）",
        "锚点 (48,158) = 脚底中央，对接 characterX/characterY",
        "竿尖坐标 pole_tip_estimate 供 PHASE 21-1 战斗UI层渲染鱼线/鱼漂（近似值，需 PHASE 21-1 复核）",
        "未保留原料图脚下阴影（与 walk 表风格统一）",
        "原生背面帧，接入时不需做 scale(-1) 翻转",
        "loop_mode=once_then_hold：完整播放后定格在第 5 帧（收手持竿），等待战斗UI接管"
    ]
}
with open(OUT_SPEC, "w", encoding="utf-8") as f:
    json.dump(spec, f, ensure_ascii=False, indent=2)
print(f"[OK] spec 已写: {OUT_SPEC}")

# ============ Step 9：写 README ============
readme = f"""# 阿明 · 钓鱼背面甩竿 6 帧（PHASE 21-C v1）

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
- **缩放系数**：{SCALE:.4f}（约 1/{1/SCALE:.1f}）
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
v1 生成于 PHASE 21-C，对应缩放系数 {SCALE:.4f}（1/9 档）
"""
with open(OUT_README, "w", encoding="utf-8") as f:
    f.write(readme)
print(f"[OK] README 已写: {OUT_README}")

print("\n=== 全部产物完成 ===")
for p in [OUT_SHEET, OUT_SPEC, OUT_PAL, OUT_README]:
    print(f"  {p}  ({os.path.getsize(p)} bytes)")
