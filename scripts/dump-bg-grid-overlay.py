#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
village-bg 叠加图：把 BG 美术图 + 32px 网格 + 行列号 + 当前 villageMap 不可走 tile 红色叠加
输出到 docs/village-bg-overlay.png，方便人工核对"美术上的实体 vs 当前碰撞数据"是否对齐。

依赖：Pillow。
运行：python3 scripts/dump-bg-grid-overlay.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

# 与游戏一致
COLS = 40
ROWS = 22
T = 32

TILE = dict(GRASS=0, DIRT=1, STONE=2, WOOD=3, SHALLOW=4,
            DEEP=5, ROOF=6, WALL=7, TREE=8, FISHING=9)
WALKABLE = {TILE['GRASS'], TILE['DIRT'], TILE['STONE'], TILE['WOOD']}

def fill_rect(grid, tile, x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= y < ROWS and 0 <= x < COLS:
                grid[y][x] = tile

def generate_map():
    """1:1 复刻 js/village-scene.js::_generateMap()"""
    g = [[TILE['GRASS']] * COLS for _ in range(ROWS)]

    fill_rect(g, TILE['TREE'], 0, 0, COLS - 1, 1)
    fill_rect(g, TILE['TREE'], 0, ROWS - 2, COLS - 1, ROWS - 1)
    fill_rect(g, TILE['TREE'], 0, 0, 1, ROWS - 1)
    fill_rect(g, TILE['TREE'], COLS - 2, 0, COLS - 1, ROWS - 1)

    fill_rect(g, TILE['DEEP'], 2, 18, COLS - 3, 21)
    fill_rect(g, TILE['WOOD'], 18, 16, 23, 17)
    fill_rect(g, TILE['FISHING'], 18, 18, 23, 19)

    fill_rect(g, TILE['ROOF'], 8, 2, 11, 5)
    fill_rect(g, TILE['ROOF'], 26, 2, 29, 5)
    fill_rect(g, TILE['ROOF'], 2, 8, 5, 11)
    fill_rect(g, TILE['ROOF'], 30, 8, 33, 11)

    fill_rect(g, TILE['WALL'], 8, 10, 11, 11)
    fill_rect(g, TILE['WALL'], 28, 10, 29, 11)
    fill_rect(g, TILE['WALL'], 30, 16, 33, 17)

    fill_rect(g, TILE['STONE'], 16, 4, 19, 7)

    for y in range(10, 12):
        for x in range(6, 30):
            if g[y][x] == TILE['GRASS']:
                g[y][x] = TILE['DIRT']
    for y in range(4, 18):
        for x in range(16, 18):
            if g[y][x] == TILE['GRASS']:
                g[y][x] = TILE['DIRT']

    fill_rect(g, TILE['TREE'], 4, 2, 5, 3)
    fill_rect(g, TILE['TREE'], 34, 2, 35, 3)
    fill_rect(g, TILE['TREE'], 2, 16, 3, 17)
    fill_rect(g, TILE['TREE'], 4, 16, 5, 17)
    fill_rect(g, TILE['TREE'], 34, 16, 35, 17)
    fill_rect(g, TILE['TREE'], 36, 16, 37, 17)
    return g

def get_font(size):
    candidates = [
        '/System/Library/Fonts/PingFang.ttc',
        '/System/Library/Fonts/STHeiti Medium.ttc',
        '/Library/Fonts/Arial Unicode.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def render(grid, bg_path, out_path):
    margin_left = 40
    margin_top = 40
    legend_h = 110

    bg = Image.open(bg_path).convert('RGBA')
    bg_w, bg_h = bg.size  # 1280×720

    W = bg_w + margin_left + 16
    H = bg_h + margin_top + legend_h
    canvas = Image.new('RGBA', (W, H), (250, 250, 250, 255))
    canvas.paste(bg, (margin_left, margin_top))

    overlay = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    f_small = get_font(11)
    f_med = get_font(13)
    f_big = get_font(16)

    # 列号 / 行号
    for x in range(COLS):
        tx = margin_left + x * T + T // 2
        d.text((tx, 6), str(x), fill=(20, 20, 20, 255), font=f_small, anchor='mt')
    for y in range(ROWS):
        ty = margin_top + y * T + T // 2
        d.text((6, ty), str(y), fill=(20, 20, 20, 255), font=f_small, anchor='lm')

    # 不可走 tile 半透明红叠加（重点：让人能看到当前碰撞 vs 美术）
    # WALL/ROOF/TREE/DEEP/FISHING/SHALLOW
    color_map = {
        TILE['TREE']:    (30, 100, 40, 90),    # 深绿
        TILE['ROOF']:    (220, 130, 60, 90),   # 橙
        TILE['WALL']:    (255, 60, 60, 130),   # 红（最显眼）
        TILE['DEEP']:    (50, 80, 140, 60),    # 深蓝（轻）
        TILE['FISHING']: (130, 200, 220, 90),  # 青
        TILE['SHALLOW']: (130, 200, 220, 60),
    }
    for y in range(ROWS):
        for x in range(COLS):
            t = grid[y][x]
            if t in WALKABLE:
                continue
            if t not in color_map:
                continue
            px = margin_left + x * T
            py = margin_top + y * T
            d.rectangle([px, py, px + T - 1, py + T - 1], fill=color_map[t])

    # 网格线（细、半透明）
    for y in range(ROWS + 1):
        gy = margin_top + y * T
        d.line([(margin_left, gy), (margin_left + COLS * T, gy)], fill=(0, 0, 0, 70), width=1)
    for x in range(COLS + 1):
        gx = margin_left + x * T
        d.line([(gx, margin_top), (gx, margin_top + ROWS * T)], fill=(0, 0, 0, 70), width=1)
    # BG 多出的 16px 区（底部 y=704..720）画一条提示线
    extra_y = margin_top + ROWS * T
    d.line([(margin_left, extra_y), (margin_left + COLS * T, extra_y)],
           fill=(255, 200, 0, 200), width=2)
    d.text((margin_left + COLS * T + 4, extra_y - 6),
           '↓ BG 多 16px（不参与碰撞）',
           fill=(180, 100, 0, 255), font=f_small, anchor='lm')

    canvas = Image.alpha_composite(canvas, overlay)

    # 图例
    d2 = ImageDraw.Draw(canvas)
    ly = margin_top + bg_h + 16
    d2.text((margin_left, ly), '空气墙叠加图（红=WALL, 橙=ROOF, 绿=TREE, 蓝=DEEP, 青=FISHING）',
            fill=(0, 0, 0, 255), font=f_big)
    ly += 24
    items = [
        ('WALL 墙身', (255, 60, 60)),
        ('ROOF 屋顶', (220, 130, 60)),
        ('TREE 树/边界', (30, 100, 40)),
        ('DEEP 深水', (50, 80, 140)),
        ('FISHING 钓点', (130, 200, 220)),
    ]
    cur_x = margin_left
    cell = 22
    for label, color in items:
        d2.rectangle([cur_x, ly, cur_x + cell, ly + cell], fill=color, outline=(40, 40, 40))
        d2.text((cur_x + cell + 6, ly + cell // 2), label, fill=(0, 0, 0, 255), font=f_med, anchor='lm')
        cur_x += cell + 6 + 110

    ly += cell + 12
    d2.text((margin_left, ly),
            f'BG={bg_w}×{bg_h}px  网格=COLS×ROWS×T={COLS}×{ROWS}×{T}px={COLS*T}×{ROWS*T}  WALKABLE=GRASS/DIRT/STONE/WOOD',
            fill=(0, 0, 0, 255), font=f_med)

    canvas.convert('RGB').save(out_path, quality=92)
    print(f'OK → {out_path}  ({W}×{H})')

if __name__ == '__main__':
    here = os.path.dirname(__file__)
    bg = os.path.normpath(os.path.join(here, '..', 'assets', 'images', 'scenes', 'village-riverside-bg.jpg'))
    out_dir = os.path.normpath(os.path.join(here, '..', 'docs'))
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'village-bg-overlay.png')
    grid = generate_map()
    render(grid, bg, out)
