#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
split_fish_sheet.py
====================
把 nano banana 生成的 10 鱼 sprite sheet（白底、5×2 网格）切割成 10 张
带透明背景、自动裁剪居中的独立 PNG，命名对齐 js/data/fish-pool.js 的 id。

工作流：
  1) 读取  assets/fish/_sheet_raw.png  （nano banana 出图后人工放进来的原图）
  2) 按  5×2 网格切成 10 张子图
  3) 对每张子图：白底抠透明（floodfill 法，避免误抠鱼身高光）
  4) 自动裁剪到鱼的实际包围盒
  5) 居中缩放/填充到统一 512×512 透明 PNG
  6) 按  FISH_IDS  顺序输出到  assets/fish/{id}.png

依赖：
  pip install pillow numpy

用法：
  cd 项目根
  python3 tools/split_fish_sheet.py            # 默认使用 assets/fish/_sheet_raw.png
  python3 tools/split_fish_sheet.py 路径.png   # 也可显式指定
"""
import os
import sys
from collections import deque
from PIL import Image
import numpy as np

# ─── 配置 ─────────────────────────────────────────────────────────────
SHEET_GRID = (5, 2)               # 5 列 × 2 行
OUT_SIZE = 512                    # 每张输出 PNG 边长
PADDING_RATIO = 0.08              # 鱼占输出画布比例的留白（8% padding）
WHITE_TOLERANCE = 18              # 白底容差（兼容老逻辑，flood-fill 实际用 BG_MIN_LUMA + BG_MAX_CHROMA）
BG_MIN_LUMA = 175                 # 背景判定：亮度 ≥ 此值（nano banana 输出的灰底约 185~187）
BG_MAX_CHROMA = 12                # 背景判定：max(R,G,B)-min(R,G,B) ≤ 此值（中性色，过滤掉鲜艳鱼鳞）
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SHEET = os.path.join(PROJECT_ROOT, "assets/fish/_sheet_raw.png")
OUT_DIR = os.path.join(PROJECT_ROOT, "assets/fish")

# 与 js/data/fish-pool.js SHUISHE_FISH_POOL 顺序严格对齐（左→右、上→下）
FISH_IDS = [
    # Row 1
    "qiliyu",       # ★1 奇力鱼
    "luofeiyu",     # ★1 罗非鱼
    "caoyu",        # ★2 草鱼
    "quyaoyu",      # ★2 曲腰鱼
    "qiaozuibo",    # ★3 翘嘴鲌
    # Row 2
    "luyu",         # ★3 鲈鱼
    "liyu",         # ★4 鲤鱼
    "zongtongyu",   # ★4 总统鱼
    "riyuetanwang", # ★5 日月潭鱼王
    "tanshen",      # ★5 潭神使者
]

# ─── 工具函数 ─────────────────────────────────────────────────────────
def is_background(pixel, min_luma=BG_MIN_LUMA, max_chroma=BG_MAX_CHROMA):
    """
    判断像素是否属于"图片背景"（nano banana 输出的白/灰过渡纸面）。
    规则：亮度高 + 色彩饱和度低（接近中性灰/白），这样能同时覆盖：
      - 顶部纯白 (255,255,255)
      - 底部灰底 (185,185,185) 左右
      - 噪点 (254,254,254) 等
    且不会误判鱼身鲜艳鳞片（蓝/绿/红/黄等高饱和色）。
    """
    r, g, b = pixel[:3]
    luma = max(r, g, b)               # 用 max 估亮度（白/灰皆 ≥ 175）
    chroma = max(r, g, b) - min(r, g, b)
    return luma >= min_luma and chroma <= max_chroma

# 保留旧函数名做兼容（脚本里若有别处引用）
def is_white(pixel, tol=WHITE_TOLERANCE):
    return is_background(pixel)

def flood_fill_white_to_alpha(img: Image.Image, tol=WHITE_TOLERANCE) -> Image.Image:
    """
    从图像四边的"背景色"像素开始做 BFS flood fill，把"与边缘连通的背景"全置为透明。
    这样可以保留鱼身内部的白色高光/浅灰阴影（它们不与边缘连通）。
    背景判定见 is_background：亮度高且色彩偏中性。
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    visited = np.zeros((h, w), dtype=bool)

    # 把所有四边的背景色像素作为种子
    q = deque()
    def maybe_seed(x, y):
        if 0 <= x < w and 0 <= y < h and not visited[y, x]:
            if is_background(arr[y, x]):
                visited[y, x] = True
                q.append((x, y))

    for x in range(w):
        maybe_seed(x, 0)
        maybe_seed(x, h - 1)
    for y in range(h):
        maybe_seed(0, y)
        maybe_seed(w - 1, y)

    # BFS：把所有"与边缘连通的背景"标记为透明
    while q:
        x, y = q.popleft()
        arr[y, x, 3] = 0  # alpha = 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                if is_background(arr[ny, nx]):
                    visited[ny, nx] = True
                    q.append((nx, ny))

    return Image.fromarray(arr, "RGBA")

def crop_to_alpha_bbox(img: Image.Image) -> Image.Image:
    """按 alpha>0 的像素求紧致包围盒并裁剪"""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return img  # 全透明，直接返回
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    return img.crop((x0, y0, x1, y1))

def fit_to_canvas(img: Image.Image, size=OUT_SIZE, padding_ratio=PADDING_RATIO) -> Image.Image:
    """把裁剪好的小图等比缩放到 size×size 中央，留 padding"""
    inner = int(size * (1 - padding_ratio * 2))
    iw, ih = img.size
    scale = min(inner / iw, inner / ih)
    new_w = max(1, int(iw * scale))
    new_h = max(1, int(ih * scale))
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - new_w) // 2
    oy = (size - new_h) // 2
    canvas.paste(img_resized, (ox, oy), img_resized)
    return canvas

# ─── 主流程 ───────────────────────────────────────────────────────────
def main():
    sheet_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SHEET
    if not os.path.isfile(sheet_path):
        print(f"❌ 找不到原图：{sheet_path}")
        sys.exit(1)

    print(f"📂 读取原图：{sheet_path}")
    sheet = Image.open(sheet_path).convert("RGBA")
    sw, sh = sheet.size
    cols, rows = SHEET_GRID
    cell_w, cell_h = sw // cols, sh // rows
    print(f"   原图尺寸：{sw}×{sh}，网格：{cols}列×{rows}行，每格 {cell_w}×{cell_h}")

    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"📂 输出目录：{OUT_DIR}")
    print()

    for idx, fish_id in enumerate(FISH_IDS):
        col = idx % cols
        row = idx // cols
        # 切格
        x0 = col * cell_w
        y0 = row * cell_h
        cell = sheet.crop((x0, y0, x0 + cell_w, y0 + cell_h))
        # 抠白底
        transparent = flood_fill_white_to_alpha(cell)
        # 裁包围盒
        cropped = crop_to_alpha_bbox(transparent)
        # 居中适配到 512×512
        final = fit_to_canvas(cropped)
        # 保存
        out_path = os.path.join(OUT_DIR, f"{fish_id}.png")
        final.save(out_path, "PNG", optimize=True)
        kb = os.path.getsize(out_path) / 1024
        cw, ch = cropped.size
        print(f"  ✓ [{idx+1:2}/10] {fish_id:14s} 包围盒 {cw}×{ch} → {OUT_SIZE}×{OUT_SIZE} → {out_path} ({kb:.1f} KB)")

    print()
    print(f"✅ 切割完成。共输出 {len(FISH_IDS)} 张 PNG 到 {OUT_DIR}/")
    print(f"   下一步：刷新游戏验收，或检查个别图（如鲈鱼/翘嘴鲌）是否因白色高光被误抠")
    print(f"   若有误抠：调小 WHITE_TOLERANCE（当前 {WHITE_TOLERANCE}）或人工 PS 修补单张图")

if __name__ == "__main__":
    main()
