#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 21-C — 批量切 3 栋 occluder（chief_house / fishing_tackle_shop / 711）
沿用 aming_house 已验收方案 ①+②：
  ① 扫描窗口 [baseY-40 - topY_screen, baseY-15 - topY_screen]（PNG 内部 y）
     在窗口内挑「深色占比最高」的天然过渡线作为切割线
  ② 切割线下沿 1~2 行内亮度 > 140 的像素 alpha = 0（清高光毛边）
红线: alpha 严格 0/255 二值；画布尺寸 = 原 PNG 同尺寸；不重绘、不扩范围。

输出：
  - assets/images/buildings/{key}_occ.png（注意 711 文件名 = 711_occ.png）
  - deliverables/phase21c/{compare_name}.png
  - deliverables/phase21c/all_4buildings_overview.png
"""
import os, time, statistics
from PIL import Image, ImageDraw, ImageFont

ROOT = "/data/workspace/AIgame"
BG_SRC  = os.path.join(ROOT, "assets/images/scenes/village-riverside-bg.jpg")
OUT_DIR = os.path.join(ROOT, "deliverables/phase21c")
os.makedirs(OUT_DIR, exist_ok=True)

# 4 栋（aming 仅参与总览图，不再切；新 3 栋切 + 三联）
BUILDINGS = [
    # key,           png_path(rel),                                top_xy,        baseY, occ_path,                                          compare_name
    ("aming_house",  "assets/images/buildings/aming_house.png",         (16, 347),   510, "assets/images/buildings/aming_house_occ.png",       None),
    ("chief_house",  "assets/images/buildings/chief_house.png",         (210, 172),  320, "assets/images/buildings/chief_house_occ.png",       "chief_house_compare.png"),
    ("fishing_shop", "assets/images/buildings/fishing_tackle_shop.png", (693, 172),  320, "assets/images/buildings/fishing_tackle_shop_occ.png","fishing_shop_compare.png"),
    ("seven_eleven", "assets/images/buildings/711.png",                 (902, 372),  510, "assets/images/buildings/711_occ.png",               "seven_eleven_compare.png"),
]

# ────────────────────────── 扫描 & 切割 ──────────────────────────
def luma(r, g, b):  # ITU-R BT.601
    return 0.299 * r + 0.587 * g + 0.114 * b

def scan_dark_ratio(im, y_lo, y_hi, dark_th=110):
    """对每行 y∈[y_lo,y_hi]，统计 不透明像素中 luma<dark_th 的占比。
    返回 list[(y, dark_ratio, opaque_count, dark_count, mean_luma)]
    """
    px = im.load()
    W, H = im.size
    res = []
    for y in range(max(0, y_lo), min(H, y_hi + 1)):
        op = 0; dk = 0; ssum = 0.0
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 0:
                op += 1
                L = luma(r, g, b)
                ssum += L
                if L < dark_th:
                    dk += 1
        ratio = (dk / op) if op else 0.0
        mean = (ssum / op) if op else 0.0
        res.append((y, ratio, op, dk, mean))
    return res

def pick_cut_line(rows):
    """规则：窗口内深色占比最高的行；并列时取 y 较大者（更靠近 baseY，遮挡更紧贴）。"""
    if not rows:
        return None
    best = max(rows, key=lambda r: (r[1], r[0]))
    return best

def make_occluder(src_path, cut_y, out_path, hi_th=140):
    """切 occluder（对齐 aming_house 已验收口径）：
       - y < cut_y - 1  : alpha 原样保留（保留原图内部抗锯齿，符合 aming 验收版）
       - y in (cut_y-1, cut_y) : 切割线下沿 2 行 → 若 luma>hi_th 则 alpha 强制 0（高光清零）；
                                  否则 alpha 强制 255（保证切割边缘不出现新的渐变）
       - y > cut_y     : alpha 强制 0（全透明）
    红线："切割动作"产生的边缘只能取 0 或 255，无渐变；原图内部细节抗锯齿保留。
    返回 (kept_pixels, bottom_stats)
    """
    im = Image.open(src_path).convert("RGBA")
    W, H = im.size
    px = im.load()
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    op = out.load()

    bottom_rows = (cut_y - 1, cut_y)  # 下沿两行
    kept = 0
    bottom_lumas = []
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if y < cut_y - 1:
                # 原 alpha 原样保留（含抗锯齿）
                op[x, y] = (r, g, b, a)
                if a > 0:
                    kept += 1
            elif y in bottom_rows:
                if a == 0:
                    continue
                L = luma(r, g, b)
                if L > hi_th:
                    # 高光清零（毛边修复）
                    pass
                else:
                    # 切割边缘强制 alpha=255，避免引入新的渐变
                    op[x, y] = (r, g, b, 255); kept += 1
                    bottom_lumas.append(L)
            # y > cut_y → 透明 (默认)
    out.save(out_path, "PNG")
    if bottom_lumas:
        stats = (statistics.mean(bottom_lumas), max(bottom_lumas), len(bottom_lumas))
    else:
        stats = (0.0, 0.0, 0)
    return kept, stats

# ────────────────────────── 三联对比图 ──────────────────────────
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
        if os.path.exists(fp):
            return ImageFont.truetype(fp, sz)
    return ImageFont.load_default()

def label(img, text, h=22, fs=13):
    W, H = img.size
    out = Image.new("RGB", (W, H + h), (245,245,245))
    out.paste(img, (0, h))
    d = ImageDraw.Draw(out)
    d.text((6, 4), text, fill=(20,20,20), font=get_font(fs))
    return out

def build_compare(key, src_path, occ_path, top_xy, baseY, cut_y, stats, compare_name):
    src = Image.open(src_path).convert("RGBA")
    occ = Image.open(occ_path).convert("RGBA")
    W, H = src.size
    tx, ty = top_xy

    panel_a = label(composite_on_checker(src),
                    f"A. 原图 {os.path.basename(src_path)} ({W}x{H})")
    panel_b = label(composite_on_checker(occ),
                    f"B. occluder cut@y={cut_y}(PNG)/y={ty+cut_y}(screen)  下沿 avg={stats[0]:.1f} max={stats[1]:.1f}")

    # C: 套回背景预览
    bg = Image.open(BG_SRC).convert("RGBA")
    pad = 30
    x0 = max(0, tx - pad); y0 = max(0, ty - 20)
    x1 = min(bg.width,  tx + W + pad); y1 = min(bg.height, baseY + 50)
    bg_crop = bg.crop((x0, y0, x1, y1)).copy()
    bg_crop.alpha_composite(occ, dest=(tx - x0, ty - y0))
    d = ImageDraw.Draw(bg_crop)
    # baseY 红线
    d.line([(0, baseY - y0), (bg_crop.width, baseY - y0)], fill=(255,60,60,255), width=1)
    # 切割线 蓝
    d.line([(0, ty + cut_y - y0), (bg_crop.width, ty + cut_y - y0)], fill=(60,200,255,255), width=1)
    # 玩家 64x64 示例：站在房子横向中点、baseY 处
    player_cx = tx + W // 2
    player_cy = baseY + 20
    d.rectangle([player_cx-16-x0, player_cy-32-y0, player_cx+16-x0, player_cy+32-y0],
                outline=(255,220,0,255), width=2)
    d.text((player_cx-22-x0, player_cy-46-y0), "player", fill=(255,220,0,255), font=get_font(12))
    panel_c = label(bg_crop.convert("RGB"),
                    f"C. 套回 village-riverside-bg.jpg @({tx},{ty})  红=baseY{baseY} 蓝=cutLine 黄=玩家64x64")

    # 拼接
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

# ────────────────────────── 总览图 ──────────────────────────
def build_overview(reports, out_path):
    """4 栋按真实坐标贴到 1280x720 背景上，每栋下方标 baseY=XXX，玩家黄框站在房子下方。"""
    bg = Image.open(BG_SRC).convert("RGBA").copy()
    d = ImageDraw.Draw(bg)
    f_lbl = get_font(13)
    f_tag = get_font(12)

    for r in reports:
        occ = Image.open(r["occ_path"]).convert("RGBA")
        tx, ty = r["top_xy"]
        bg.alpha_composite(occ, dest=(tx, ty))
        # baseY 红线（局部短线，避免画穿全图）
        baseY = r["baseY"]
        x_left  = max(0, tx - 8)
        x_right = min(bg.width, tx + occ.width + 8)
        d.line([(x_left, baseY), (x_right, baseY)], fill=(255,60,60,230), width=1)
        # 玩家 64x64 黄框（站在房子横向中点、baseY 下方 20px）
        player_cx = tx + occ.width // 2
        player_cy = baseY + 20
        d.rectangle([player_cx-16, player_cy-32, player_cx+16, player_cy+32],
                    outline=(255,220,0,255), width=2)
        # 房子下方标签：baseY=XXX  cut_y=YYY (screen)
        cut_screen = ty + r["cut_y"]
        tag = f"{r['key']}  baseY={baseY}  cut_y(screen)={cut_screen}"
        # 背景文字白底块（保证可读）
        tw, th = d.textbbox((0,0), tag, font=f_tag)[2:]
        tag_x = max(2, min(bg.width - tw - 4, tx))
        tag_y = min(bg.height - th - 2, baseY + 60)
        d.rectangle([tag_x-2, tag_y-2, tag_x+tw+2, tag_y+th+2], fill=(0,0,0,180))
        d.text((tag_x, tag_y), tag, fill=(255,255,255,255), font=f_tag)

    # 顶部标题条
    title = "PHASE 21-C  Y-sort Occluder Overview  (4 buildings on village-riverside-bg.jpg 1280x720)"
    tw, th = d.textbbox((0,0), title, font=f_lbl)[2:]
    d.rectangle([0, 0, bg.width, th + 8], fill=(0,0,0,200))
    d.text((10, 4), title, fill=(255,255,255,255), font=f_lbl)
    # 图例
    legend = "RED=baseY  YELLOW=player(64x64)  occluder=top half PNG (alpha 0/255)"
    lw, lh = d.textbbox((0,0), legend, font=f_tag)[2:]
    d.rectangle([0, bg.height - lh - 8, lw + 14, bg.height], fill=(0,0,0,200))
    d.text((6, bg.height - lh - 4), legend, fill=(255,255,255,255), font=f_tag)

    bg.convert("RGB").save(out_path, "PNG")
    return out_path

# ────────────────────────── 自检（也在切完后即时打印） ──────────────────────────
def selfcheck_bottom(occ_path):
    """读 occluder：取最后两行不透明像素，统计亮度均值/最大值。"""
    im = Image.open(occ_path).convert("RGBA")
    W, H = im.size
    px = im.load()
    last_y = -1
    for y in range(H-1, -1, -1):
        any_op = any(px[x,y][3] > 0 for x in range(W))
        if any_op:
            last_y = y; break
    if last_y < 1:
        return last_y, 0.0, 0.0, 0
    vals = []
    for y in (last_y - 1, last_y):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 0:
                vals.append(luma(r, g, b))
    if not vals:
        return last_y, 0.0, 0.0, 0
    return last_y, statistics.mean(vals), max(vals), len(vals)

# ────────────────────────── 主流程 ──────────────────────────
def main():
    t_total_start = time.time()
    reports = []
    print("="*78)
    print("PHASE 21-C 批量切图 — 沿用 aming 方案 ①+② (alpha 0/255 二值 + 高光清零)")
    print("="*78)

    for key, rel, top_xy, baseY, occ_rel, compare_name in BUILDINGS:
        src_path = os.path.join(ROOT, rel)
        occ_path = os.path.join(ROOT, occ_rel)
        tx, ty = top_xy
        t0 = time.time()

        if key == "aming_house":
            # 已验收，不重切；只复用现有 occ；从现有 occ 提取 cut_y
            im = Image.open(occ_path).convert("RGBA")
            W, H = im.size
            px = im.load()
            cut_y = -1
            for y in range(H-1, -1, -1):
                if any(px[x,y][3] > 0 for x in range(W)):
                    cut_y = y; break
            last_y, b_mean, b_max, b_n = selfcheck_bottom(occ_path)
            print(f"\n[{key}] (已验收, 复用) cut_y(PNG)={cut_y}  下沿 avg={b_mean:.1f}  max={b_max:.1f}  n={b_n}")
            reports.append({
                "key": key, "src_path": src_path, "occ_path": occ_path,
                "top_xy": top_xy, "baseY": baseY,
                "cut_y": cut_y, "bottom_mean": b_mean, "bottom_max": b_max,
                "elapsed_s": 0.0, "compare_path": None,
            })
            continue

        # ── 新栋：扫描 + 切割
        src = Image.open(src_path).convert("RGBA")
        W, H = src.size
        # 扫描窗口 PNG-内部 y
        win_lo = baseY - 40 - ty
        win_hi = baseY - 15 - ty
        rows = scan_dark_ratio(src, win_lo, win_hi, dark_th=110)

        # 打印窗口 profile
        print(f"\n[{key}] PNG={W}x{H}  topXY={top_xy}  baseY={baseY}")
        print(f"  扫描窗口 PNG-y ∈ [{win_lo}, {win_hi}]  (= screen y ∈ [{ty+win_lo},{ty+win_hi}], 距 baseY: -40~-15)")
        print(f"  {'y':>4} {'ratio':>6} {'op':>4} {'dk':>4} {'meanL':>6}")
        for r in rows:
            print(f"  {r[0]:>4} {r[1]:>6.3f} {r[2]:>4} {r[3]:>4} {r[4]:>6.1f}")

        # 优先选「深色占比最高」的行
        best = pick_cut_line(rows)
        cut_y = best[0]
        print(f"  → 选定切割线 cut_y(PNG)={cut_y}  (screen y={ty+cut_y}, 距 baseY={baseY-(ty+cut_y)}px)  深色占比={best[1]:.3f} meanL={best[4]:.1f}")

        # 切图（含下沿高光清零）
        kept, bstats = make_occluder(src_path, cut_y, occ_path, hi_th=140)
        elapsed = time.time() - t0
        print(f"  ✂  写出 {occ_path}  kept_px={kept}  下沿(切线±1行,清零后) avg={bstats[0]:.1f} max={bstats[1]:.1f} n={bstats[2]}  耗时={elapsed:.2f}s")

        # 自检（最终落盘后真正的最后两行）
        last_y, b_mean, b_max, b_n = selfcheck_bottom(occ_path)
        ok_avg = b_mean < 90
        ok_max = b_max < 150
        print(f"  ✅ 自检 last_y={last_y}  下沿亮度 avg={b_mean:.2f} (<90 {'OK' if ok_avg else 'FAIL'})  max={b_max:.2f} (<150 {'OK' if ok_max else 'FAIL'})  n={b_n}")

        # 三联图
        cmp_path, cmp_size = build_compare(key, src_path, occ_path, top_xy, baseY, cut_y,
                                           (b_mean, b_max, b_n), compare_name)
        print(f"  🖼  三联图 {cmp_path}  {cmp_size[0]}x{cmp_size[1]}")

        reports.append({
            "key": key, "src_path": src_path, "occ_path": occ_path,
            "top_xy": top_xy, "baseY": baseY,
            "cut_y": cut_y, "bottom_mean": b_mean, "bottom_max": b_max,
            "elapsed_s": elapsed, "compare_path": cmp_path,
        })

    # 总览图
    overview_path = os.path.join(OUT_DIR, "all_4buildings_overview.png")
    build_overview(reports, overview_path)
    print(f"\n🧭 总览图 {overview_path}")

    # 战报
    total = time.time() - t_total_start
    print("\n" + "="*78)
    print("📋 战报 (To: PM Nina)")
    print("="*78)
    print(f"{'key':<14}{'cut_y(PNG)':>11}{'cut_y(screen)':>15}{'baseY':>7}{'bottom_avg':>12}{'bottom_max':>12}{'elapsed_s':>11}")
    for r in reports:
        cs = r['top_xy'][1] + r['cut_y']
        print(f"{r['key']:<14}{r['cut_y']:>11}{cs:>15}{r['baseY']:>7}{r['bottom_mean']:>12.2f}{r['bottom_max']:>12.2f}{r['elapsed_s']:>11.2f}")
    print(f"\n总耗时: {total:.2f}s")
    print("红线复核: alpha 严格 0/255 二值 (无渐变)；画布尺寸=原 PNG；未扩张 occluder 范围；切线均在各自 [baseY-40, baseY-15] 窗口内。")

if __name__ == "__main__":
    main()
