#!/usr/bin/env python3
"""
改进版精灵图分析：使用内容质心检测行/列分组
用法：python3 tools/analyze_sprite_sheet_v2.py assets/character/amin/amin-walk-sheet-v2.png
"""
import sys
from PIL import Image

def analyze_sheet_v2(path):
    img = Image.open(path)
    print(f"图片: {path}")
    print(f"尺寸: {img.size}, 模式: {img.mode}")
    
    if img.mode != 'RGBA':
        if img.mode == 'RGB':
            img = img.convert('RGBA')
        else:
            img = img.convert('RGBA')
    
    pixels = img.load()
    w, h = img.size
    
    # 计算每行的"内容量"（非透明像素数）
    row_content = []
    for y in range(h):
        cnt = 0
        for x in range(w):
            a = pixels[x, y][3]
            if a > 10:
                cnt += 1
        row_content.append(cnt)
    
    # 计算每列的"内容量"
    col_content = []
    for x in range(w):
        cnt = 0
        for y in range(h):
            a = pixels[x, y][3]
            if a > 10:
                cnt += 1
        col_content.append(cnt)
    
    # 使用阈值检测行分组（内容量 > 最大内容量的 5% 视为有内容）
    max_row_content = max(row_content) if row_content else 0
    row_threshold = max_row_content * 0.05
    
    max_col_content = max(col_content) if col_content else 0
    col_threshold = max_col_content * 0.05
    
    # 找出有内容的连续行分组
    row_groups = []
    current_group = []
    for y, cnt in enumerate(row_content):
        if cnt > row_threshold:
            current_group.append(y)
        else:
            if current_group:
                row_groups.append(current_group)
                current_group = []
    if current_group:
        row_groups.append(current_group)
    
    # 找出有内容的连续列分组
    col_groups = []
    current_group = []
    for x, cnt in enumerate(col_content):
        if cnt > col_threshold:
            current_group.append(x)
        else:
            if current_group:
                col_groups.append(current_group)
                current_group = []
    if current_group:
        col_groups.append(current_group)
    
    print(f"\n检测结果:")
    print(f"  行分组数 (可能的方向数): {len(row_groups)}")
    print(f"  列分组数 (每方向帧数): {len(col_groups)}")
    print(f"  总帧数: {len(row_groups) * len(col_groups)}")
    
    # 输出每行的 Y 范围和平均内容量
    print(f"\n行分组详情:")
    for i, group in enumerate(row_groups):
        y_min, y_max = group[0], group[-1]
        avg_content = sum(row_content[y] for y in group) / len(group)
        print(f"  行 {i}: y={y_min}~{y_max} (高={y_max-y_min+1}), 平均内容量={avg_content:.0f}")
    
    print(f"\n列分组详情:")
    for i, group in enumerate(col_groups):
        x_min, x_max = group[0], group[-1]
        avg_content = sum(col_content[x] for x in group) / len(group)
        print(f"  列 {i}: x={x_min}~{x_max} (宽={x_max-x_min+1}), 平均内容量={avg_content:.0f}")
    
    # 计算每帧的边界坐标
    print(f"\n帧边界坐标 (direction_row, frame_col) -> (src_x, src_y, src_w, src_h):")
    
    frames = []
    for ri, rg in enumerate(row_groups):
        for ci, cg in enumerate(col_groups):
            src_x = cg[0]
            src_y = rg[0]
            src_w = cg[-1] - cg[0] + 1
            src_h = rg[-1] - rg[0] + 1
            frames.append({
                'row': ri,
                'col': ci,
                'src_x': src_x,
                'src_y': src_y,
                'src_w': src_w,
                'src_h': src_h,
            })
            print(f"  ({ri}, {ci}): ({src_x}, {src_y}, {src_w}, {src_h})")
    
    # 计算共享画布尺寸（取最大帧的边界 + 间距）
    all_src_x = [f['src_x'] for f in frames]
    all_src_y = [f['src_y'] for f in frames]
    max_src_x_plus_w = [f['src_x'] + f['src_w'] for f in frames]
    max_src_y_plus_h = [f['src_y'] + f['src_h'] for f in frames]
    
    canvas_w = max(max_src_x_plus_w) - min(all_src_x)
    canvas_h = max(max_src_y_plus_h) - min(all_src_y)
    
    print(f"\n建议的共享画布尺寸: {canvas_w}x{canvas_h}")
    print(f"  画布左边界 (min src_x): {min(all_src_x)}")
    print(f"  画布上边界 (min src_y): {min(all_src_y)}")
    
    return {
        'rows': len(row_groups),
        'cols': len(col_groups),
        'frames': frames,
        'canvas_w': canvas_w,
        'canvas_h': canvas_h,
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python3 analyze_sprite_sheet_v2.py <png_path> [png_path2] ...")
        sys.exit(1)
    
    for path in sys.argv[1:]:
        analyze_sheet_v2(path)
        print("\n" + "="*60 + "\n")
