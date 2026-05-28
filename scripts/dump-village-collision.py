#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
村庄场景空气墙（碰撞）可视化导出。
1:1 复刻 js/village-scene.js::_generateMap() 的 fillRect 顺序，输出 PNG：
  - 可走 tile 半透明绿色填充
  - 不可走 tile（"空气墙"）红色实心
  - 特殊 tile 用专色：WOOD=棕、DEEP=深蓝、FISHING=青、TREE=深绿、ROOF=橙、WALL=黄
  - 网格线 + 行列编号 + 图例 + 4 栋建筑 anchor 框 + NPC 位置点
依赖：Pillow (PIL)。运行：python3 scripts/dump-village-collision.py
输出：docs/village-collision-map.png
"""
from PIL import Image, ImageDraw, ImageFont
import os

# ── 与 js/main.js GAME_CONFIG 保持一致 ─────────────────────────
COLS = 40
ROWS = 22
T = 32  # tile size in px

# ── TILE 枚举与可走集合（与 js/village-scene.js 顶部一致） ─────
TILE = dict(GRASS=0, DIRT=1, STONE=2, WOOD=3, SHALLOW=4,
            DEEP=5, ROOF=6, WALL=7, TREE=8, FISHING=9)
NAME = {v: k for k, v in TILE.items()}
WALKABLE = {TILE['GRASS'], TILE['DIRT'], TILE['STONE'], TILE['WOOD']}

# ── 可视化配色 ─────────────────────────────────────────────
COLOR = {
    TILE['GRASS']:   (146, 196, 110),   # 浅绿
    TILE['DIRT']:    (180, 150, 100),   # 土黄
    TILE['STONE']:   (180, 180, 180),   # 灰
    TILE['WOOD']:    (139,  90,  60),   # 棕（栈桥）
    TILE['SHALLOW']: (122, 184, 196),   # 浅水
    TILE['DEEP']:    ( 43,  79, 107),   # 深蓝
    TILE['ROOF']:    (220, 130,  60),   # 橙（屋顶）
    TILE['WALL']:    (244, 228, 193),   # 米黄（墙）
    TILE['TREE']:    ( 30,  90,  40),   # 深绿
    TILE['FISHING']: (122, 184, 196),   # 青
}

def fill_rect(grid, tile, x0, y0, x1, y1):
    """闭区间矩形填充（与 JS fillRect 一致）"""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= y < ROWS and 0 <= x < COLS:
                grid[y][x] = tile

def generate_map():
    """1:1 复刻 _generateMap()，含填充顺序（后写覆盖前写）"""
    g = [[TILE['GRASS']] * COLS for _ in range(ROWS)]

    # 边界树
    fill_rect(g, TILE['TREE'], 0, 0, COLS - 1, 1)
    fill_rect(g, TILE['TREE'], 0, ROWS - 2, COLS - 1, ROWS - 1)
    fill_rect(g, TILE['TREE'], 0, 0, 1, ROWS - 1)
    fill_rect(g, TILE['TREE'], COLS - 2, 0, COLS - 1, ROWS - 1)

    # 深水
    fill_rect(g, TILE['DEEP'], 2, 18, COLS - 3, 21)
    # 栈桥
    fill_rect(g, TILE['WOOD'], 18, 16, 23, 17)
    # 钓点
    fill_rect(g, TILE['FISHING'], 18, 18, 23, 19)

    # 屋顶
    fill_rect(g, TILE['ROOF'], 8, 2, 11, 5)
    fill_rect(g, TILE['ROOF'], 26, 2, 29, 5)
    fill_rect(g, TILE['ROOF'], 2, 8, 5, 11)
    fill_rect(g, TILE['ROOF'], 30, 8, 33, 11)

    # 墙身（与 js/village-scene.js::_generateMap() 一致）
    fill_rect(g, TILE['WALL'], 8, 10, 11, 11)
    fill_rect(g, TILE['WALL'], 28, 10, 29, 11)
    fill_rect(g, TILE['WALL'], 30, 16, 33, 17)

    # 广场石砖
    fill_rect(g, TILE['STONE'], 16, 4, 19, 7)

    # 水平干道（仅 GRASS → DIRT）
    for y in range(10, 12):
        for x in range(6, 30):
            if g[y][x] == TILE['GRASS']:
                g[y][x] = TILE['DIRT']
    # 纵向干道
    for y in range(4, 18):
        for x in range(16, 18):
            if g[y][x] == TILE['GRASS']:
                g[y][x] = TILE['DIRT']

    # 散树
    fill_rect(g, TILE['TREE'], 4, 2, 5, 3)
    fill_rect(g, TILE['TREE'], 34, 2, 35, 3)
    fill_rect(g, TILE['TREE'], 2, 16, 3, 17)
    fill_rect(g, TILE['TREE'], 4, 16, 5, 17)
    fill_rect(g, TILE['TREE'], 34, 16, 35, 17)
    fill_rect(g, TILE['TREE'], 36, 16, 37, 17)
    return g

# ── 标注用：4 栋建筑（左上角 drawX, drawY, 名字） ─────────────
BUILDINGS = [
    (4 * 64,  (1 + 3) * 64, '村长家'),
    (13 * 64, (1 + 3) * 64, '钓具店'),
    (1 * 64,  (4 + 3) * 64, '阿明家'),
    (15 * 64, (4 + 3) * 64, '7-11'),
]
# ── 标注用：NPC 位置（cx, cy, name）── 与 js/data/npcs.js 一致 ─
NPCS = [
    (352, 416, '秀兰阿姨'),
    (608, 160, '阿土伯'),
    (736, 352, '林师傅'),
    (864, 512, '小芳'),
]

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

def render(grid, out_path):
    margin_left = 36   # 留给行号
    margin_top = 36    # 留给列号
    legend_h = 220     # 底部图例

    W = COLS * T + margin_left + 16
    H = ROWS * T + margin_top + legend_h

    img = Image.new('RGB', (W, H), (250, 250, 250))
    d = ImageDraw.Draw(img, 'RGBA')

    f_small = get_font(11)
    f_med = get_font(13)
    f_big = get_font(16)

    # 列号（顶部）
    for x in range(COLS):
        tx = margin_left + x * T + T // 2
        d.text((tx, 4), str(x), fill=(60, 60, 60), font=f_small, anchor='mt')
    # 行号（左侧）
    for y in range(ROWS):
        ty = margin_top + y * T + T // 2
        d.text((4, ty), str(y), fill=(60, 60, 60), font=f_small, anchor='lm')

    # 绘 tile
    for y in range(ROWS):
        for x in range(COLS):
            t = grid[y][x]
            px = margin_left + x * T
            py = margin_top + y * T
            base = COLOR[t]
            d.rectangle([px, py, px + T - 1, py + T - 1], fill=base)
            # 不可走 tile 叠红色半透明（≠ WALKABLE）
            if t not in WALKABLE:
                d.rectangle([px, py, px + T - 1, py + T - 1], fill=(220, 40, 40, 120))

    # 网格线
    for y in range(ROWS + 1):
        gy = margin_top + y * T
        d.line([(margin_left, gy), (margin_left + COLS * T, gy)], fill=(60, 60, 60, 80), width=1)
    for x in range(COLS + 1):
        gx = margin_left + x * T
        d.line([(gx, margin_top), (gx, margin_top + ROWS * T)], fill=(60, 60, 60, 80), width=1)

    # 4 栋建筑外框（青色）
    for bx, by, name in BUILDINGS:
        # 物理 2×1 瓦片 = 128×64，但 BUILDINGS 用旧 64px 大格 → 实际占 4×2 个 T=32 tile
        w_px, h_px = 128, 64
        x0 = margin_left + bx
        y0 = margin_top + by
        d.rectangle([x0, y0, x0 + w_px, y0 + h_px], outline=(0, 180, 220), width=2)
        d.text((x0 + 4, y0 + 4), f'{name}\n({bx},{by})', fill=(0, 100, 140), font=f_small)

    # NPC 位置点
    for cx, cy, name in NPCS:
        x = margin_left + cx
        y = margin_top + cy
        r = 6
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 230, 0), outline=(120, 80, 0), width=2)
        d.text((x + r + 2, y - 6), f'{name}\n({cx},{cy})', fill=(80, 50, 0), font=f_small)

    # 图例
    ly = margin_top + ROWS * T + 16
    d.text((margin_left, ly), '空气墙图（红色叠加 = 不可走）', fill=(0, 0, 0), font=f_big)
    ly += 26
    legend_items = [
        ('GRASS 草地', COLOR[TILE['GRASS']], True),
        ('DIRT 泥土路', COLOR[TILE['DIRT']], True),
        ('STONE 石砖广场', COLOR[TILE['STONE']], True),
        ('WOOD 栈桥', COLOR[TILE['WOOD']], True),
        ('DEEP 深水', COLOR[TILE['DEEP']], False),
        ('FISHING 钓点', COLOR[TILE['FISHING']], False),
        ('TREE 树', COLOR[TILE['TREE']], False),
        ('ROOF 屋顶', COLOR[TILE['ROOF']], False),
        ('WALL 墙身', COLOR[TILE['WALL']], False),
    ]
    cell = 24
    cur_x = margin_left
    cur_y = ly
    for label, color, walkable in legend_items:
        d.rectangle([cur_x, cur_y, cur_x + cell, cur_y + cell], fill=color, outline=(40, 40, 40))
        if not walkable:
            d.rectangle([cur_x, cur_y, cur_x + cell, cur_y + cell], fill=(220, 40, 40, 120))
        d.text((cur_x + cell + 6, cur_y + cell // 2), label, fill=(0, 0, 0), font=f_med, anchor='lm')
        cur_x += cell + 6 + 130
        if cur_x > W - 160:
            cur_x = margin_left
            cur_y += cell + 6

    # 元信息
    cur_y += cell + 16
    d.text((margin_left, cur_y),
           f'COLS={COLS} ROWS={ROWS} T={T}px  |  画布 {COLS*T}×{ROWS*T} = 1280×704px  |  WALKABLE = GRASS/DIRT/STONE/WOOD',
           fill=(0, 0, 0), font=f_med)
    cur_y += 22
    d.text((margin_left, cur_y),
           '青色框 = 4 栋建筑 BUILDINGS 物理矩形 (128×64)；黄点 = NPC sprite 中心 (cx,cy)',
           fill=(0, 0, 0), font=f_med)

    img.save(out_path)
    print(f'OK → {out_path}  ({W}×{H})')

if __name__ == '__main__':
    grid = generate_map()
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'docs')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.normpath(os.path.join(out_dir, 'village-collision-map.png'))
    render(grid, out)
