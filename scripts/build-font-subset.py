#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PHASE 16-7-PERF：字体子集化构建脚本（一次性使用）
============================================================
背景：
  TencentSans-W7.ttf 全量 8.1MB，部署到 GitHub Pages 后国内用户首屏字体
  下载需 5~10 秒，体验拉胯。本脚本扫描项目里实际使用的所有字符，调用
  fontTools.pyftsubset 生成 woff2 子集字体，目标体积 <600KB。

策略：
  1) 扫描 js/*.js + index.html + *.html，提取所有 Unicode 字符
  2) 自动追加 ASCII 可打印字符（数字/英文/标点）+ 常用中文标点 + 全角符号
  3) 调用 pyftsubset 生成 woff2，保留 GSUB/GPOS/GDEF（连字、字距）
  4) 输出体积对比

运行：
  python3 scripts/build-font-subset.py

依赖：
  pip install --user fonttools brotli
  pyftsubset 默认在 ~/Library/Python/3.9/bin/，脚本里自动找

⚠️ PHASE 16-9 注意：
  仓库里已删除 font/TencentSans-W7.ttf（8.1MB）以减小仓库体积。
  本脚本若要重新生成 woff2 子集，需先把源 ttf 放回 font/ 目录再运行。
  源字体可从腾讯字体官方 / 内部资产库重新获取。
"""
import os
import re
import sys
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONT_SRC = ROOT / "font" / "TencentSans-W7.ttf"
FONT_OUT_WOFF2 = ROOT / "font" / "TencentSans-W7.woff2"

# 扫描的文件
# HOTFIX：原本只扫一层 js/*.js + *.html，导致 js/data/ js/ui/ js/render/ 子目录
# 全部漏扫（dialogues.js / npcs.js / leaderboard-panel.js 等几百个汉字进不了子集，
# 浏览器对缺字回退到系统衬线 → 同句话出现两种字体）。
# 改为递归 ** 通配 + 兜底 css/，确保不再漏字。
SCAN_GLOBS = [
    "js/**/*.js",
    "**/*.html",
    "css/**/*.css",
]

# 兜底字符集：即使代码里没出现，也强制保留
# - ASCII 可打印（U+0020-007E）：数字、英文、半角标点
# - 中文常用标点（U+3000-303F、U+FF00-FFEF）
# - 一些游戏可能动态生成的常用符号
EXTRA_CHARS = set()
for cp in range(0x0020, 0x007F):  # ASCII
    EXTRA_CHARS.add(chr(cp))
for cp in range(0x3000, 0x3040):  # 中文标点 、。「」『』〈〉…
    EXTRA_CHARS.add(chr(cp))
for cp in range(0xFF00, 0xFFF0):  # 全角符号 ！？（）：；
    EXTRA_CHARS.add(chr(cp))
# 常用游戏特殊字符（emoji 不在 TencentSans 里、跳过）
EXTRA_CHARS.update("★☆♥♡♪♫✓✗✕✖✦✨⚠⚡⚪⚫●○◆◇■□▲△▼▽←→↑↓⬆⬇⬅➡—–·•")
# 一些通用数字 / 小数点 / 货币
EXTRA_CHARS.update("0123456789.,/:%¥$￥")


def collect_chars():
    """扫描所有源文件，收集出现过的字符"""
    chars = set()
    file_count = 0
    for pattern in SCAN_GLOBS:
        for f in ROOT.glob(pattern):
            try:
                txt = f.read_text(encoding="utf-8")
            except Exception as e:
                print(f"  跳过 {f.name}: {e}", file=sys.stderr)
                continue
            chars.update(txt)
            file_count += 1
    return chars, file_count


def find_pyftsubset():
    """定位 pyftsubset 可执行路径"""
    # PATH 里有就用 PATH
    p = shutil.which("pyftsubset")
    if p:
        return p
    # macOS pip --user 默认装到 ~/Library/Python/X.Y/bin/
    candidates = [
        Path.home() / "Library" / "Python" / "3.9" / "bin" / "pyftsubset",
        Path.home() / "Library" / "Python" / "3.10" / "bin" / "pyftsubset",
        Path.home() / "Library" / "Python" / "3.11" / "bin" / "pyftsubset",
        Path.home() / ".local" / "bin" / "pyftsubset",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


def main():
    if not FONT_SRC.exists():
        print(f"ERROR: 找不到字体源文件 {FONT_SRC}", file=sys.stderr)
        sys.exit(1)

    pyftsubset = find_pyftsubset()
    if not pyftsubset:
        print("ERROR: 找不到 pyftsubset，请先 pip install --user fonttools brotli", file=sys.stderr)
        sys.exit(1)

    print(f"[1/4] 扫描项目源文件...")
    used_chars, fc = collect_chars()
    print(f"      扫描了 {fc} 个文件，发现 {len(used_chars)} 个唯一字符")

    # 合并兜底
    all_chars = used_chars | EXTRA_CHARS
    print(f"      加上兜底字符集后共 {len(all_chars)} 个字符")

    # 过滤掉控制字符（\x00-\x1F），但保留换行/制表符其实也无意义
    all_chars = {c for c in all_chars if ord(c) >= 0x20}
    # 字体不需要包含的：高位 emoji（fontTools 处理不了的也会自动跳过）
    # 输出 unicode list 文件供 pyftsubset 读取
    text_arg = "".join(sorted(all_chars))

    src_size = FONT_SRC.stat().st_size

    print(f"[2/4] 调用 pyftsubset 生成 woff2 子集...")
    print(f"      源文件：{FONT_SRC.name}  ({src_size/1024/1024:.2f} MB)")

    # pyftsubset 参数说明：
    #   --text=<unicode 字符串>      只保留这些字符的字形
    #   --flavor=woff2              输出 woff2 格式
    #   --layout-features='*'       保留所有 OpenType 布局特性（连字/字距）
    #   --no-hinting                去除 hinting（小幅减小体积，对中文几乎无影响）
    #   --desubroutinize            CFF 字体去子例程（这里是 TTF，无影响）
    #   --notdef-glyph              保留 .notdef glyph（缺字时显示豆腐而非崩溃）
    #   --notdef-outline            .notdef 保留轮廓
    #   --recalc-bounds             重算字形边界框
    #   --recalc-timestamp          重写时间戳（reproducible build）
    cmd = [
        pyftsubset,
        str(FONT_SRC),
        f"--text={text_arg}",
        f"--output-file={FONT_OUT_WOFF2}",
        "--flavor=woff2",
        "--layout-features=*",
        "--notdef-glyph",
        "--notdef-outline",
        "--recalc-bounds",
        "--recalc-timestamp",
        "--drop-tables+=DSIG",  # 删数字签名表（无用且占空间）
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: pyftsubset 失败:\n{e.stderr}", file=sys.stderr)
        sys.exit(1)

    if not FONT_OUT_WOFF2.exists():
        print("ERROR: woff2 文件没生成", file=sys.stderr)
        sys.exit(1)

    out_size = FONT_OUT_WOFF2.stat().st_size

    print(f"[3/4] 完成！")
    print(f"      输出：{FONT_OUT_WOFF2.name}  ({out_size/1024:.1f} KB)")
    print()
    print(f"[4/4] 体积对比")
    print(f"      原 ttf：    {src_size/1024/1024:>7.2f} MB")
    print(f"      新 woff2：  {out_size/1024/1024:>7.2f} MB  ({out_size/1024:.0f} KB)")
    print(f"      压缩比：    {src_size/out_size:>7.2f}x  (节省 {(1-out_size/src_size)*100:.1f}%)")
    print()
    print("下一步：修改 index.html @font-face 引用 woff2，并 commit + push")


if __name__ == "__main__":
    main()
