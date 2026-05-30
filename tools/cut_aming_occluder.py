#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 21-C — aming_house occluder 切图
输入: assets/images/buildings/aming_house.png        (225x229 RGBA)
输出:
  1) assets/images/buildings/aming_house_occ.png      (225x229, 上层精灵)
  2) deliverables/phase21c/aming_house_compare.png    (三联对比图)
关键: alpha 严格 0/255 二值，无渐变；保持像素风。
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = "/data/workspace/AIgame"
SRC      = os.path.join(ROOT, "assets/images/buildings/aming_house.png")
OCC_OUT  = os.path.join(ROOT, "assets/images/buildings/aming_house_occ.png")
BG_SRC   = os.path.join(ROOT, "assets/images/scenes/village-riverside-bg.jpg")
CMP_OUT  = os.path.join(ROOT, "deliverables/phase21c/aming_house_compare.png")

# ── 屏幕坐标参考（来自 PHASE-21-C-buildings-bbox.md）
SCREEN_TOPLEFT = (16, 347)
BASE_Y_SCREEN  = 510            # Y-sort baseY
# 建议视觉切割线: baseY - 30  →  屏幕 y=480  →  PNG 内部 y = 480-347 = 133
# 我会先扫描像素，再在 [120,150] 之间找一条 “行平均alpha 跳变最大” 的天然分割线

def scan_alpha_profile(im):
    """返回每行 alpha>0 像素数（即不透明像素覆盖宽度）"""
    px = im.load()
    W, H = im.size
    rows = []
    for y in range(H):
        c = 0
        for x in range(W):
            if px[x, y][3] > 0:
                c += 1
        rows.append(c)
    return rows

def pick_cut_line(rows, lo=120, hi=150):
    """在窗口 [lo,hi] 内找连续两行 alpha 覆盖宽度差最大的位置 = 屋檐/墙体过渡"""
    best_y, best_d = lo, -1
    for y in range(lo, min(hi, len(rows)-1)):
        d = abs(rows[y+1] - rows[y])
        if d > best_d:
            best_d = d
            best_y = y
    return best_y, best_d

def make_occluder(src_path, cut_y, out_path):
    """切割线以上保留，以下 alpha=0；alpha 严格 0/255 二值。"""
    im = Image.open(src_path).convert("RGBA")
    W, H = im.size
    px = im.load()
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out_px = out.load()
    kept = 0
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if y < cut_y and a > 0:
                # 二值化：原本只要不全透明，就视为不透明
                out_px[x, y] = (r, g, b, 255)
                kept += 1
            # else 保持 (0,0,0,0)
    out.save(out_path, "PNG")
    return kept

# ── 棋盘格背景（显示透明）
def checkerboard(size, tile=8, c1=(200,200,200), c2=(160,160,160)):
    W, H = size
    bg = Image.new("RGB", (W, H), c1)
    d = ImageDraw.Draw(bg)
    for y in range(0, H, tile):
        for x in range(0, W, tile):
            if ((x//tile) + (y//tile)) & 1:
                d.rectangle([x, y, x+tile-1, y+tile-1], fill=c2)
    return bg

def composite_on_checker(rgba):
    bg = checkerboard(rgba.size).convert("RGBA")
    bg.alpha_composite(rgba)
    return bg.convert("RGB")

def label(img, text):
    """在图上方贴一个白底标签条"""
    W, H = img.size
    bar_h = 22
    out = Image.new("RGB", (W, H + bar_h), (245, 245, 245))
    out.paste(img, (0, bar_h))
    d = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
    except Exception:
        font = ImageFont.load_default()
    d.text((6, 4), text, fill=(20, 20, 20), font=font)
    return out

def main():
    os.makedirs(os.path.dirname(OCC_OUT), exist_ok=True)
    os.makedirs(os.path.dirname(CMP_OUT), exist_ok=True)

    src = Image.open(SRC).convert("RGBA")
    rows = scan_alpha_profile(src)

    # 推荐窗口: PNG 内部 y∈[120,150]（对应屏幕 y∈[467,497]，正好 baseY-43 ~ baseY-13）
    cut_y, jump = pick_cut_line(rows, lo=120, hi=150)
    print(f"[scan] alpha cover rows[{120}:{150}] = {rows[120:150]}")
    print(f"[cut]  chosen PNG-internal y = {cut_y} (Δalpha-cover={jump})")
    print(f"[cut]  对应屏幕 y = {347 + cut_y}, 距 baseY(510) = {510 - (347+cut_y)}px")

    kept = make_occluder(SRC, cut_y, OCC_OUT)
    print(f"[out]  {OCC_OUT}  kept_pixels={kept}")

    # ── 三联对比图
    occ = Image.open(OCC_OUT).convert("RGBA")
    panel_a = label(composite_on_checker(src), "A. 原图 aming_house.png (225x229)")
    panel_b = label(composite_on_checker(occ),
                    f"B. occluder aming_house_occ.png  cut@y={cut_y}(PNG)/y={347+cut_y}(screen)")

    # C: 套回底图 (16,347) 位置预览
    bg_full = Image.open(BG_SRC).convert("RGBA")
    # 裁一块以阿明家为中心的预览区域：(16-30, 347-20) ~ (241+30, 576+30)
    x0, y0 = max(0, 16-30), max(0, 347-20)
    x1, y1 = min(bg_full.width, 241+30), min(bg_full.height, 576+30)
    bg_crop = bg_full.crop((x0, y0, x1, y1)).copy()
    # 贴上 occluder（在裁切坐标里 = (16-x0, 347-y0)）
    paste_xy = (16 - x0, 347 - y0)
    bg_crop.alpha_composite(occ, dest=paste_xy)
    # 画 baseY 红线 + 切割线参考线
    d = ImageDraw.Draw(bg_crop)
    d.line([(0, 510 - y0), (bg_crop.width, 510 - y0)], fill=(255, 60, 60, 255), width=1)
    d.line([(0, 347 + cut_y - y0), (bg_crop.width, 347 + cut_y - y0)],
           fill=(60, 200, 255, 255), width=1)
    # 模拟玩家 sprite (64x64) 站在屋前 baseY 下方，看是否被压
    px_player_x = 90 - x0
    px_player_y = 540 - y0
    d.rectangle([px_player_x-16, px_player_y-32, px_player_x+16, px_player_y+32],
                outline=(255, 220, 0, 255), width=2)
    d.text((px_player_x-22, px_player_y-46), "player", fill=(255, 220, 0, 255))
    panel_c = label(bg_crop.convert("RGB"),
                    "C. 套回 village-riverside-bg.jpg @(16,347)  红=baseY510 蓝=cutLine 黄=玩家64x64示例")

    # 拼接：A B 横排 + C 下方
    top_w = panel_a.width + panel_b.width + 10
    top_h = max(panel_a.height, panel_b.height)
    bot_w = panel_c.width
    final_w = max(top_w, bot_w) + 20
    final_h = top_h + panel_c.height + 30
    canvas = Image.new("RGB", (final_w, final_h), (255, 255, 255))
    canvas.paste(panel_a, (10, 10))
    canvas.paste(panel_b, (10 + panel_a.width + 10, 10))
    canvas.paste(panel_c, (10, top_h + 20))
    canvas.save(CMP_OUT, "PNG")
    print(f"[cmp]  {CMP_OUT}  ({final_w}x{final_h})")

if __name__ == "__main__":
    main()
