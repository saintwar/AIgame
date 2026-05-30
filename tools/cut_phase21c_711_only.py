#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 21-C 微调 — 仅重切 seven_eleven (711)，cut_y(PNG) 116 → 136 (+20)
直采老板视觉判断，绕过窗口扫描算法 (新位置 cut_y_screen=508，距 baseY=510 仅 -2px)。
其余 3 栋 (aming_house / chief_house / fishing_shop) 完全不动，仅用作总览图复用。

红线:
  - alpha 严格 0/255 二值 (无渐变)
  - 画布尺寸 = 原 PNG 同尺寸 (245x204)
  - 仅动 711_occ.png + 711 三联图 + 4 栋总览图
"""
import os, time, statistics
from PIL import Image, ImageDraw, ImageFont

ROOT = "/data/workspace/AIgame"
BG_SRC  = os.path.join(ROOT, "assets/images/scenes/village-riverside-bg.jpg")
OUT_DIR = os.path.join(ROOT, "deliverables/phase21c")

# 4 栋 (aming/chief/fishing 仅复用 occ 用于总览图，不重切)
BUILDINGS = [
    ("aming_house",  "assets/images/buildings/aming_house.png",         (16, 347),   510, "assets/images/buildings/aming_house_occ.png",       None),
    ("chief_house",  "assets/images/buildings/chief_house.png",         (210, 172),  320, "assets/images/buildings/chief_house_occ.png",       None),
    ("fishing_shop", "assets/images/buildings/fishing_tackle_shop.png", (693, 172),  320, "assets/images/buildings/fishing_tackle_shop_occ.png",None),
    ("seven_eleven", "assets/images/buildings/711.png",                 (902, 372),  510, "assets/images/buildings/711_occ.png",               "seven_eleven_compare.png"),
]

# === 711 老板钦定切线 ===
FORCED_CUT_Y_711 = 136   # PNG 内部 y, screen y = 372+136 = 508, 距 baseY=510 -2px

def luma(r, g, b):  # ITU-R BT.601
    return 0.299 * r + 0.587 * g + 0.114 * b

def make_occluder(src_path, cut_y, out_path, hi_th=140):
    """与已验收 cut_phase21c_batch.py 完全一致的切割口径:
       y < cut_y-1     : 原 alpha 保留 (含原图抗锯齿)
       y in [cut_y-1, cut_y]: 下沿两行, luma>hi_th 强制 alpha=0 (清高光毛边),
                              否则强制 alpha=255 (硬边, 不引入新渐变)
       y > cut_y       : 全透明
    """
    im = Image.open(src_path).convert("RGBA")
    W, H = im.size
    px = im.load()
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    op = out.load()

    bottom_rows = (cut_y - 1, cut_y)
    kept = 0
    bottom_lumas = []
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if y < cut_y - 1:
                op[x, y] = (r, g, b, a)
                if a > 0: kept += 1
            elif y in bottom_rows:
                if a == 0: continue
                L = luma(r, g, b)
                if L > hi_th:
                    pass  # 高光清零
                else:
                    op[x, y] = (r, g, b, 255); kept += 1
                    bottom_lumas.append(L)
            # y > cut_y -> 透明
    out.save(out_path, "PNG")
    if bottom_lumas:
        return kept, (statistics.mean(bottom_lumas), max(bottom_lumas), len(bottom_lumas))
    return kept, (0.0, 0.0, 0)

def selfcheck_bottom(occ_path):
    im = Image.open(occ_path).convert("RGBA")
    W, H = im.size
    px = im.load()
    last_y = -1
    for y in range(H-1, -1, -1):
        if any(px[x,y][3] > 0 for x in range(W)):
            last_y = y; break
    if last_y < 1: return last_y, 0.0, 0.0, 0
    vals = []
    for y in (last_y - 1, last_y):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 0: vals.append(luma(r, g, b))
    if not vals: return last_y, 0.0, 0.0, 0
    return last_y, statistics.mean(vals), max(vals), len(vals)

def alpha_binary_check(occ_path):
    """红线复核: alpha 必须严格 0/255 二值"""
    im = Image.open(occ_path).convert("RGBA")
    px = im.load()
    W, H = im.size
    bad = 0
    for y in range(H):
        for x in range(W):
            a = px[x,y][3]
            if a not in (0, 255): bad += 1
    return bad

# ── 三联图 ──
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

def get_font(sz=13):
    for fp in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(fp): return ImageFont.truetype(fp, sz)
    return ImageFont.load_default()

def label(img, text, h=22, fs=13):
    W, H = img.size
    out = Image.new("RGB", (W, H + h), (245,245,245))
    out.paste(img, (0, h))
    ImageDraw.Draw(out).text((6, 4), text, fill=(20,20,20), font=get_font(fs))
    return out

def build_compare(key, src_path, occ_path, top_xy, baseY, cut_y, stats, compare_name):
    src = Image.open(src_path).convert("RGBA")
    occ = Image.open(occ_path).convert("RGBA")
    W, H = src.size
    tx, ty = top_xy
    panel_a = label(composite_on_checker(src), f"A. 原图 {os.path.basename(src_path)} ({W}x{H})")
    panel_b = label(composite_on_checker(occ),
                    f"B. occluder cut@y={cut_y}(PNG)/y={ty+cut_y}(screen) [FORCED +20]  下沿 avg={stats[0]:.1f} max={stats[1]:.1f}")
    bg = Image.open(BG_SRC).convert("RGBA")
    pad = 30
    x0 = max(0, tx - pad); y0 = max(0, ty - 20)
    x1 = min(bg.width,  tx + W + pad); y1 = min(bg.height, baseY + 50)
    bg_crop = bg.crop((x0, y0, x1, y1)).copy()
    bg_crop.alpha_composite(occ, dest=(tx - x0, ty - y0))
    d = ImageDraw.Draw(bg_crop)
    d.line([(0, baseY - y0), (bg_crop.width, baseY - y0)], fill=(255,60,60,255), width=1)
    d.line([(0, ty + cut_y - y0), (bg_crop.width, ty + cut_y - y0)], fill=(60,200,255,255), width=1)
    player_cx = tx + W // 2; player_cy = baseY + 20
    d.rectangle([player_cx-16-x0, player_cy-32-y0, player_cx+16-x0, player_cy+32-y0],
                outline=(255,220,0,255), width=2)
    d.text((player_cx-22-x0, player_cy-46-y0), "player", fill=(255,220,0,255), font=get_font(12))
    panel_c = label(bg_crop.convert("RGB"),
                    f"C. 套回 bg @({tx},{ty})  红=baseY{baseY} 蓝=cutLine(screen={ty+cut_y}) 黄=player64x64  距baseY={baseY-(ty+cut_y)}px")
    top_w = panel_a.width + panel_b.width + 10
    top_h = max(panel_a.height, panel_b.height)
    final_w = max(top_w, panel_c.width) + 20
    final_h = top_h + panel_c.height + 30
    canvas = Image.new("RGB", (final_w, final_h), (255,255,255))
    canvas.paste(panel_a, (10, 10))
    canvas.paste(panel_b, (10 + panel_a.width + 10, 10))
    canvas.paste(panel_c, (10, top_h + 20))
    out_path = os.path.join(OUT_DIR, compare_name)
    canvas.save(out_path, "PNG")
    return out_path, (final_w, final_h)

# ── 总览图 ──
def occ_cut_y_from_png(occ_path):
    im = Image.open(occ_path).convert("RGBA")
    W, H = im.size; px = im.load()
    for y in range(H-1, -1, -1):
        if any(px[x,y][3] > 0 for x in range(W)): return y
    return -1

def build_overview(reports, out_path):
    bg = Image.open(BG_SRC).convert("RGBA").copy()
    d = ImageDraw.Draw(bg)
    f_lbl = get_font(13); f_tag = get_font(12)
    for r in reports:
        occ = Image.open(r["occ_path"]).convert("RGBA")
        tx, ty = r["top_xy"]
        bg.alpha_composite(occ, dest=(tx, ty))
        baseY = r["baseY"]
        x_left  = max(0, tx - 8); x_right = min(bg.width, tx + occ.width + 8)
        d.line([(x_left, baseY), (x_right, baseY)], fill=(255,60,60,230), width=1)
        player_cx = tx + occ.width // 2; player_cy = baseY + 20
        d.rectangle([player_cx-16, player_cy-32, player_cx+16, player_cy+32],
                    outline=(255,220,0,255), width=2)
        cut_screen = ty + r["cut_y"]
        tag = f"{r['key']}  baseY={baseY}  cut_y(screen)={cut_screen}"
        tw, th = d.textbbox((0,0), tag, font=f_tag)[2:]
        tag_x = max(2, min(bg.width - tw - 4, tx))
        tag_y = min(bg.height - th - 2, baseY + 60)
        d.rectangle([tag_x-2, tag_y-2, tag_x+tw+2, tag_y+th+2], fill=(0,0,0,180))
        d.text((tag_x, tag_y), tag, fill=(255,255,255,255), font=f_tag)
    title = "PHASE 21-C  Y-sort Occluder Overview  [711 cut_y FORCED +20: 116->136]"
    tw, th = d.textbbox((0,0), title, font=f_lbl)[2:]
    d.rectangle([0, 0, bg.width, th + 8], fill=(0,0,0,200))
    d.text((10, 4), title, fill=(255,255,255,255), font=f_lbl)
    legend = "RED=baseY  YELLOW=player(64x64)  occluder=top half PNG (alpha 0/255 binary)"
    lw, lh = d.textbbox((0,0), legend, font=f_tag)[2:]
    d.rectangle([0, bg.height - lh - 8, lw + 14, bg.height], fill=(0,0,0,200))
    d.text((6, bg.height - lh - 4), legend, fill=(255,255,255,255), font=f_tag)
    bg.convert("RGB").save(out_path, "PNG")
    return out_path

def main():
    t_total_start = time.time()
    print("="*78)
    print("PHASE 21-C 微调 — 仅 711 cut_y 116 -> 136 (+20px, 老板钦定)")
    print("="*78)

    reports = []
    for key, rel, top_xy, baseY, occ_rel, compare_name in BUILDINGS:
        src_path = os.path.join(ROOT, rel)
        occ_path = os.path.join(ROOT, occ_rel)
        ty = top_xy[1]
        if key == "seven_eleven":
            t0 = time.time()
            cut_y = FORCED_CUT_Y_711
            print(f"\n[711] 强制 cut_y(PNG)={cut_y}  cut_y(screen)={ty+cut_y}  距 baseY={baseY-(ty+cut_y)}px")
            kept, bstats = make_occluder(src_path, cut_y, occ_path, hi_th=140)
            elapsed = time.time() - t0
            last_y, b_mean, b_max, b_n = selfcheck_bottom(occ_path)
            bad_alpha = alpha_binary_check(occ_path)
            ok_avg = b_mean < 90
            ok_max = b_max < 150
            print(f"  ✂  写出 {occ_path}  kept_px={kept}  耗时={elapsed:.2f}s")
            print(f"  ✅ 自检 last_y={last_y} (期望=136)  下沿亮度 avg={b_mean:.2f} (<90 {'OK' if ok_avg else 'WARN'})  max={b_max:.2f} (<150 {'OK' if ok_max else 'WARN'})  n={b_n}")
            print(f"  🔒 红线 alpha 二值复核: 非 0/255 像素数 = {bad_alpha} ({'OK' if bad_alpha==0 else 'FAIL'})")
            cmp_path, cmp_size = build_compare(key, src_path, occ_path, top_xy, baseY, cut_y,
                                               (b_mean, b_max, b_n), compare_name)
            print(f"  🖼  三联图 {cmp_path}  {cmp_size[0]}x{cmp_size[1]}")
            reports.append({"key": key, "src_path": src_path, "occ_path": occ_path,
                            "top_xy": top_xy, "baseY": baseY, "cut_y": cut_y,
                            "bottom_mean": b_mean, "bottom_max": b_max,
                            "elapsed_s": elapsed, "bad_alpha": bad_alpha})
        else:
            cy = occ_cut_y_from_png(occ_path)
            reports.append({"key": key, "src_path": src_path, "occ_path": occ_path,
                            "top_xy": top_xy, "baseY": baseY, "cut_y": cy,
                            "bottom_mean": 0.0, "bottom_max": 0.0,
                            "elapsed_s": 0.0, "bad_alpha": 0})
            print(f"[{key}] 复用 (cut_y(PNG)={cy}, cut_y(screen)={ty+cy})")

    overview_path = os.path.join(OUT_DIR, "all_4buildings_overview.png")
    build_overview(reports, overview_path)
    print(f"\n🧭 总览图 {overview_path}")

    total = time.time() - t_total_start
    print("\n" + "="*78)
    print("📋 战报 (To: PM Nina)  — 仅 seven_eleven 重切")
    print("="*78)
    print(f"{'key':<14}{'cut_y(PNG)':>11}{'cut_y(screen)':>15}{'baseY':>7}{'dist_baseY':>11}{'avg':>9}{'max':>9}{'sec':>8}")
    for r in reports:
        cs = r['top_xy'][1] + r['cut_y']
        print(f"{r['key']:<14}{r['cut_y']:>11}{cs:>15}{r['baseY']:>7}{r['baseY']-cs:>11}{r['bottom_mean']:>9.2f}{r['bottom_max']:>9.2f}{r['elapsed_s']:>8.2f}")
    print(f"\n总耗时: {total:.2f}s")

if __name__ == "__main__":
    main()
