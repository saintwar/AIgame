#!/usr/bin/env python3
"""
分析精灵图：自动检测 1024x1024 PNG 中的帧排列
用法：python3 tools/analyze_sprite_sheet.py assets/character/amin/amin-walk-sheet-v2.png
"""
import sys
from PIL import Image

def analyze_sheet(path):
    img = Image.open(path)
    print(f"图片: {path}")
    print(f"尺寸: {img.size}, 模式: {img.mode}")
    
    if img.mode != 'RGBA':
        print("警告: 不是 RGBA 模式，可能无法正确检测透明通道")
        if img.mode == 'RGB':
            img = img.convert('RGBA')
    
    pixels = img.load()
    w, h = img.size
    
    # 找出所有非透明像素的行和列
    rows_with_content = set()
    cols_with_content = set()
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a > 10:  # alpha > 10 视为有内容
                rows_with_content.add(y)
                cols_with_content.add(x)
    
    if not rows_with_content or not cols_with_content:
        print("错误: 未找到非透明内容")
        return
    
    min_row = min(rows_with_content)
    max_row = max(rows_with_content)
    min_col = min(cols_with_content)
    max_col = max(cols_with_content)
    
    print(f"\n内容边界:")
    print(f"  行: {min_row} ~ {max_row} (高度: {max_row - min_row + 1})")
    print(f"  列: {min_col} ~ {max_col} (宽度: {max_col - min_col + 1})")
    
    # 尝试检测帧的分隔（找全透明的行/列）
    empty_rows = []
    empty_cols = []
    
    for y in range(min_row, max_row + 1):
        row_empty = True
        for x in range(min_col, max_col + 1):
            r, g, b, a = pixels[x, y]
            if a > 10:
                row_empty = False
                break
        if row_empty:
            empty_rows.append(y)
    
    for x in range(min_col, max_col + 1):
        col_empty = True
        for y in range(min_row, max_row + 1):
            r, g, b, a = pixels[x, y]
            if a > 10:
                col_empty = False
                break
        if col_empty:
            empty_cols.append(x)
    
    print(f"\n全透明行: {len(empty_rows)} 条")
    print(f"全透明列: {len(empty_cols)} 条")
    
    # 尝试推断网格
    # 找行分组（连续的_non-empty_行）
    row_groups = []
    current_group = []
    for y in range(min_row, max_row + 1):
        row_empty = y in empty_rows
        if not row_empty:
            current_group.append(y)
        else:
            if current_group:
                row_groups.append(current_group)
                current_group = []
    if current_group:
        row_groups.append(current_group)
    
    # 找列分组
    col_groups = []
    current_group = []
    for x in range(min_col, max_col + 1):
        col_empty = x in empty_cols
        if not col_empty:
            current_group.append(x)
        else:
            if current_group:
                col_groups.append(current_group)
                current_group = []
    if current_group:
        col_groups.append(current_group)
    
    print(f"\n推断的帧网格:")
    print(f"  行数 (方向数): {len(row_groups)}")
    print(f"  列数 (每方向帧数): {len(col_groups)}")
    print(f"  总帧数: {len(row_groups) * len(col_groups)}")
    
    # 计算每帧的大致尺寸
    if row_groups and col_groups:
        frame_h = max([g[-1] - g[0] + 1 for g in row_groups])
        frame_w = max([g[-1] - g[0] + 1 for g in col_groups])
        print(f"  每帧大致尺寸: {frame_w}x{frame_h}")
        
        # 输出每帧的边界坐标
        print(f"\n帧边界 (row, col) -> (src_x, src_y, src_w, src_h):")
        for ri, rg in enumerate(row_groups):
            for ci, cg in enumerate(col_groups):
                src_x = cg[0]
                src_y = rg[0]
                src_w = cg[-1] - cg[0] + 1
                src_h = rg[-1] - rg[0] + 1
                print(f"  ({ri}, {ci}): ({src_x}, {src_y}, {src_w}, {src_h})")
    
    return {
        'rows': len(row_groups),
        'cols': len(col_groups),
        'frame_w': frame_w if row_groups and col_groups else None,
        'frame_h': frame_h if row_groups and col_groups else None,
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python3 analyze_sprite_sheet.py <png_path>")
        sys.exit(1)
    
    for path in sys.argv[1:]:
        analyze_sheet(path)
        print("\n" + "="*60 + "\n")
