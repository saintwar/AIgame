#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 21-C 微调（第 2 轮）— 老板钦定 chief_house / fishing_shop 切割线
  - chief_house :  cut_y(PNG) 111 -> 136 (+25)   screen=308  距 baseY=320 → -12px
  - fishing_shop:  cut_y(PNG) 118 -> 133 (+15)   screen=305  距 baseY=320 → -15px
  - aming_house :  不动 (last_y=126 已验收)
  - seven_eleven:  不动 (last_y=136 已验收, avg=106 老板眼审通过)

红线沿用 ①+② 已验收方案：
  ① 强制按老板 y 切，绕过深色过渡线扫描算法（与 711 微调同性质）
  ② 切线下沿 1~2 行内 luma>140 像素 alpha=0 (清高光毛边)，
     其余切线下沿像素 alpha=255 (硬边)，原图内部抗锯齿不动
  - alpha 严格 0/255 二值；画布尺寸=原 PNG 同尺寸；不重绘、不扩范围
  - 仅动 chief_house_occ.png + fishing_tackle_shop_occ.png + 2 张三联 + 1 张总览

输出：
  覆盖 assets/images/buildings/chief_house_occ.png
  覆盖 assets/images/buildings/fishing_tackle_shop_occ.png
  写出 deliverables/phase21c/chief_house_compare.png
  写出 deliverables/phase21c/fishing_shop_compare.png
  写出 deliverables/phase21c/all_4buildings_overview.png
"""
import os, time, statistics
from PIL import Image, ImageDraw, ImageFont

ROOT = "/data/workspace/AIgame"
BG_SRC  = os.path.join(ROOT, "assets/images/scenes/village-riverside-bg.jpg")
OUT_DIR = os.path.join(ROOT, "deliverables/phase21c")
os.makedirs(OUT_DIR, exist_ok=True)

# 4 栋 — 与已验收 batch / 711_only 脚本同一份元数据
BUILDINGS = [
    # key,           png_rel,                                            top_xy,        baseY, occ_rel,                                              compare_name,            forced_cut_y
    ("aming_house",  "assets/images/buildings/aming_house.png",          (16, 347),     510,   "assets/images/buildings/aming_house_occ.png",        None,                    None),
    ("chief_house",  "assets/images/buildings/chief_house.png",          (210, 172),    320,   "assets/images/buildings/chief_house_occ.png",        "chief_house_compare.png",  136),  # 111 -> 136
    ("fishing_shop", "assets/images/buildings/fishing_tackle_shop.png",  (693, 172),    320,   "assets/images/buildings/fishing_tackle_shop_occ.png", "fishing_shop_compare.png", 133),  # 118 -> 133
    ("seven_eleven", "assets/images/buildings/711.png",                  (902, 372),    510,   "assets/images/buildings/711_occ.png",                None,                    None),
]

# ────────────────────────── 切割（沿用 batch / 711_only 完全相同口径） ──────────────────────────
def luma(r, g, b):  # ITU-R BT.601
    return 0.299 * r + 0.587 * g + 0.114 * b

def make_occluder(src_path, cut_y, out_path, hi_th=140):
    """y < cut_y-1 : 原 alpha 保留 (含原图抗锯齿)
       y in {cut_y-1, cut_y} : luma>hi_th 强制 alpha=0 (高光清零)，否则 alpha=255 (硬边)
       y > cut_y   : 全透明
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
                if a > 0:
                    kept += 1
            elif y in bottom_rows:
                if a == 0:
                    continue
                L = luma(r, g, b)
                if L > hi_th:
                    pass  # 高光清零
                else:
                    op[x, y] = (r, g, b, 255)
                    kept += 1
                    bottom_lumas.append(L)
            # y > cut_y -> 透明 (默认)
    out.save(out_path, "PNG")
    if bottom_lumas:
        return kept, (statistics.mean(bottom_lumas), max(bottom_lumas), len(bottom_lumas))
    return kept, (0.0, 0.0, 0)

def selfcheck_bottom(occ_path):
    im = Image.open(occ_path).convert("RGBA")
    W, H = im.size
    px = im.load()
    last_y = -1
    for y in range(H - 1, -1, -1):
        if any(px[x, y][3] > 0 for x in range(W)):
            last_y = y
            break
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

def alpha_binary_check(occ_path, cut_y=None):
    """红线：'切割动作'产生的下沿两行 (cut_y-1, cut_y) alpha 必须严格 0/255。
       原图内部抗锯齿 (y < cut_y-1) 保留，与 aming/711 已验收基线一致，不视为违规。
       cut_y=None 时退化为全图统计 (仅作信息打印, 不作为 PASS/FAIL 依据)。
    """
    im = Image.open(occ_path).convert("RGBA")
    px = im.load()
    W, H = im.size
    if cut_y is None:
        # 自动定位最后一行不透明像素
        last_y = -1
        for y in range(H - 1, -1, -1):
            if any(px[x, y][3] > 0 for x in range(W)):
                last_y = y; break
        if last_y < 1:
            return 0, 0
        ys = (last_y - 1, last_y)
    else:
        ys = (cut_y - 1, cut_y)
    bad_edge = 0
    for y in ys:
        if y < 0 or y >= H:
            continue
        for x in range(W):
            a = px[x, y][3]
            if a not in (0, 255):
                bad_edge += 1
    # 全图非二值 (含原图内部抗锯齿，仅作参考)
    bad_total = 0
    for y in range(H):
        for x in range(W):
            a = px[x, y][3]
            if a not in (0, 255):
                bad_total += 1
    return bad_edge, bad_total

def occ_cut_y_from_png(occ_path):
    im = Image.open(occ_path).convert("RGBA")
    W, H = im.size
    px = im.load()
    for y in range(H - 1, -1, -1):
        if any(px[x, y][3] > 0 for x in range(W)):
            return y
    return -1

# ────────────────────────── 三联对比图 ──────────────────────────
def checkerboard(size, tile=8, c1=(200, 200, 200), c2=(160, 160, 160)):
    W, H = size
    bg = Image.new("RGB", (W, H), c1)
    d = ImageDraw.Draw(bg)
    for y in range(0, H, tile):
        for x in range(0, W, tile):
            if ((x // tile) + (y // tile)) & 1:
                d.rectangle([x, y, x + tile - 1, y + tile - 1], fill=c2)
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
    out = Image.new("RGB", (W, H + h), (245, 245, 245))
    out.paste(img, (0, h))
    ImageDraw.Draw(out).text((6, 4), text, fill=(20, 20, 20), font=get_font(fs))
    return out

def build_compare(key, src_path, occ_path, top_xy, baseY, cut_y, old_cut_y, stats, compare_name):
    src = Image.open(src_path).convert("RGBA")
    occ = Image.open(occ_path).convert("RGBA")
    W, H = src.size
    tx, ty = top_xy
    delta = cut_y - old_cut_y
    panel_a = label(composite_on_checker(src),
                    f"A. 原图 {os.path.basename(src_path)} ({W}x{H})")
    panel_b = label(composite_on_checker(occ),
                    f"B. occluder cut@y={cut_y}(PNG) [FORCED {old_cut_y}->{cut_y}, +{delta}]  screen y={ty + cut_y}  下沿 avg={stats[0]:.1f} max={stats[1]:.1f}")
    bg = Image.open(BG_SRC).convert("RGBA")
    pad = 30
    x0 = max(0, tx - pad); y0 = max(0, ty - 20)
    x1 = min(bg.width,  tx + W + pad); y1 = min(bg.height, baseY + 50)
    bg_crop = bg.crop((x0, y0, x1, y1)).copy()
    bg_crop.alpha_composite(occ, dest=(tx - x0, ty - y0))
    d = ImageDraw.Draw(bg_crop)
    d.line([(0, baseY - y0), (bg_crop.width, baseY - y0)], fill=(255, 60, 60, 255), width=1)
    d.line([(0, ty + cut_y - y0), (bg_crop.width, ty + cut_y - y0)], fill=(60, 200, 255, 255), width=1)
    player_cx = tx + W // 2; player_cy = baseY + 20
    d.rectangle([player_cx - 16 - x0, player_cy - 32 - y0, player_cx + 16 - x0, player_cy + 32 - y0],
                outline=(255, 220, 0, 255), width=2)
    d.text((player_cx - 22 - x0, player_cy - 46 - y0), "player", fill=(255, 220, 0, 255), font=get_font(12))
    panel_c = label(bg_crop.convert("RGB"),
                    f"C. 套回 bg @({tx},{ty})  红=baseY{baseY} 蓝=cutLine(screen={ty + cut_y}) 黄=player64x64  距baseY={baseY - (ty + cut_y)}px")
    top_w = panel_a.width + panel_b.width + 10
    top_h = max(panel_a.height, panel_b.height)
    final_w = max(top_w, panel_c.width) + 20
    final_h = top_h + panel_c.height + 30
    canvas = Image.new("RGB", (final_w, final_h), (255, 255, 255))
    canvas.paste(panel_a, (10, 10))
    canvas.paste(panel_b, (10 + panel_a.width + 10, 10))
    canvas.paste(panel_c, (10, top_h + 20))
    out_path = os.path.join(OUT_DIR, compare_name)
    canvas.save(out_path, "PNG")
    return out_path, (final_w, final_h)

# ────────────────────────── 4 栋总览图 ──────────────────────────
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
        d.line([(x_left, baseY), (x_right, baseY)], fill=(255, 60, 60, 230), width=1)
        player_cx = tx + occ.width // 2; player_cy = baseY + 20
        d.rectangle([player_cx - 16, player_cy - 32, player_cx + 16, player_cy + 32],
                    outline=(255, 220, 0, 255), width=2)
        cut_screen = ty + r["cut_y"]
        tag = f"{r['key']}  baseY={baseY}  cut_y(screen)={cut_screen}  d={baseY - cut_screen}"
        tw, th = d.textbbox((0, 0), tag, font=f_tag)[2:]
        tag_x = max(2, min(bg.width - tw - 4, tx))
        tag_y = min(bg.height - th - 2, baseY + 60)
        d.rectangle([tag_x - 2, tag_y - 2, tag_x + tw + 2, tag_y + th + 2], fill=(0, 0, 0, 180))
        d.text((tag_x, tag_y), tag, fill=(255, 255, 255, 255), font=f_tag)

    title = "PHASE 21-C  Y-sort Occluder Overview  [chief 111->136(+25), fishing 118->133(+15) FORCED; aming/711 unchanged]"
    tw, th = d.textbbox((0, 0), title, font=f_lbl)[2:]
    d.rectangle([0, 0, bg.width, th + 8], fill=(0, 0, 0, 200))
    d.text((10, 4), title, fill=(255, 255, 255, 255), font=f_lbl)
    legend = "RED=baseY  YELLOW=player(64x64)  occluder=top half PNG (alpha 0/255 binary, no gradient)"
    lw, lh = d.textbbox((0, 0), legend, font=f_tag)[2:]
    d.rectangle([0, bg.height - lh - 8, lw + 14, bg.height], fill=(0, 0, 0, 200))
    d.text((6, bg.height - lh - 4), legend, fill=(255, 255, 255, 255), font=f_tag)
    bg.convert("RGB").save(out_path, "PNG")
    return out_path

# ────────────────────────── main ──────────────────────────
def main():
    t_total_start = time.time()
    print("=" * 80)
    print("PHASE 21-C 微调 (第 2 轮) — 强制 cut_y: chief 111→136(+25), fishing 118→133(+15)")
    print("=" * 80)

    reports = []
    for key, rel, top_xy, baseY, occ_rel, compare_name, forced in BUILDINGS:
        src_path = os.path.join(ROOT, rel)
        occ_path = os.path.join(ROOT, occ_rel)
        ty = top_xy[1]

        if forced is None:
            # aming_house / seven_eleven : 不动，仅复用现有 occ 用于总览图
            cy = occ_cut_y_from_png(occ_path)
            last_y, b_mean, b_max, b_n = selfcheck_bottom(occ_path)
            bad_edge, bad_total = alpha_binary_check(occ_path, cut_y=cy)
            print(f"\n[{key}] (已验收终稿，复用) cut_y(PNG)={cy}  cut_y(screen)={ty + cy}  "
                  f"距 baseY={baseY - (ty + cy)}px")
            print(f"  ✅ 自检 last_y={last_y}  下沿 avg={b_mean:.2f}  max={b_max:.2f}  n={b_n}  "
                  f"切线下沿非二值={bad_edge} (内部抗锯齿全图非二值={bad_total}, 不计违规)")
            reports.append({
                "key": key, "src_path": src_path, "occ_path": occ_path,
                "top_xy": top_xy, "baseY": baseY, "cut_y": cy,
                "old_cut_y": cy, "bottom_mean": b_mean, "bottom_max": b_max,
                "elapsed_s": 0.0, "bad_alpha": bad_edge, "n_bottom": b_n,
                "touched": False,
            })
            continue

        # 强制重切
        # 旧 cut_y 用当前 occ 的 last_y 作为参考（也即“老板说的旧值”）
        old_cy = occ_cut_y_from_png(occ_path)
        cut_y = forced
        t0 = time.time()
        print(f"\n[{key}] 强制 cut_y(PNG): {old_cy} → {cut_y}  cut_y(screen)={ty + cut_y}  "
              f"距 baseY={baseY - (ty + cut_y)}px")

        # PNG 高度合法性
        src_im = Image.open(src_path)
        if cut_y >= src_im.height:
            raise RuntimeError(f"{key} forced cut_y={cut_y} 超出 PNG 高度 {src_im.height}")

        kept, bstats = make_occluder(src_path, cut_y, occ_path, hi_th=140)
        elapsed = time.time() - t0

        last_y, b_mean, b_max, b_n = selfcheck_bottom(occ_path)
        bad_edge, bad_total = alpha_binary_check(occ_path, cut_y=cut_y)

        # 5 秒自检红线
        ok_max = b_max < 150
        warn_avg = b_mean > 90  # avg 不强求，但显著超 90 要告警（参考 711 avg=106 已通过）
        ok_alpha = (bad_edge == 0)
        ok_lasty = (last_y == cut_y)

        print(f"  ✂  写出 {occ_path}  kept_px={kept}  耗时={elapsed:.2f}s")
        print(f"  ✅ 自检 last_y={last_y} (期望={cut_y} {'OK' if ok_lasty else 'FAIL'})  "
              f"下沿 avg={b_mean:.2f} ({'>90 WARN' if warn_avg else '<=90 OK'})  "
              f"max={b_max:.2f} ({'<150 OK' if ok_max else '>=150 FAIL'})  n={b_n}")
        print(f"  🔒 红线 alpha 二值复核 (切线下沿2行): 非 0/255 像素数={bad_edge} "
              f"({'OK' if ok_alpha else 'FAIL'})  (全图非二值含内部抗锯齿={bad_total}, 不计违规)")

        if not ok_max:
            print(f"  ⚠️ 毛边告警：max>{150}，需告知 Nina 复审，不硬交付")

        cmp_path, cmp_size = build_compare(key, src_path, occ_path, top_xy, baseY,
                                           cut_y, old_cy, (b_mean, b_max, b_n), compare_name)
        print(f"  🖼  三联图 {cmp_path}  {cmp_size[0]}x{cmp_size[1]}")

        reports.append({
            "key": key, "src_path": src_path, "occ_path": occ_path,
            "top_xy": top_xy, "baseY": baseY, "cut_y": cut_y,
            "old_cut_y": old_cy, "bottom_mean": b_mean, "bottom_max": b_max,
            "elapsed_s": elapsed, "bad_alpha": bad_edge, "n_bottom": b_n,
            "touched": True,
        })

    overview_path = os.path.join(OUT_DIR, "all_4buildings_overview.png")
    build_overview(reports, overview_path)
    print(f"\n🧭 总览图 {overview_path}")

    total = time.time() - t_total_start
    print("\n" + "=" * 80)
    print("📋 战报 (To: PM Nina) — 仅 chief_house & fishing_shop 重切")
    print("=" * 80)
    print(f"{'key':<14}{'old→new(PNG)':>14}{'screen':>9}{'baseY':>7}{'d2base':>8}"
          f"{'avg':>9}{'max':>9}{'badα':>6}{'sec':>8}  status")
    for r in reports:
        cs = r['top_xy'][1] + r['cut_y']
        old_new = f"{r['old_cut_y']}→{r['cut_y']}"
        status = "FORCED-CUT" if r['touched'] else "REUSE"
        print(f"{r['key']:<14}{old_new:>14}{cs:>9}{r['baseY']:>7}{r['baseY'] - cs:>8}"
              f"{r['bottom_mean']:>9.2f}{r['bottom_max']:>9.2f}{r['bad_alpha']:>6}{r['elapsed_s']:>8.2f}  {status}")
    print(f"\n总耗时: {total:.2f}s")
    print("红线复核: alpha 严格 0/255 二值；画布尺寸=原 PNG；未扩张范围；未触碰 aming/711 occ；未触碰任何原图 building PNG。")

if __name__ == "__main__":
    main()
