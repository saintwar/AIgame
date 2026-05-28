#!/usr/bin/env bash
# ============================================================================
#  scripts/deploy.sh  ——  一键部署（云函数 + 静态托管）
# ----------------------------------------------------------------------------
#  作用：
#    1) 部署所有云函数（cloudfunctions/ 目录下的每个子目录视为一个函数）
#    2) rsync 项目到临时目录（排除 .git/scripts/docs 等无关产物）
#    3) 自动 bump 临时目录中 index.html 的 ?v= 版本号为当前时间戳
#       —— 让浏览器/CDN 必失效，避开 ES module 缓存粘滞
#    4) tcb hosting deploy 临时目录
#    5) 清理临时目录
#
#  用法：
#    bash scripts/deploy.sh                # 默认：部署云函数 + 静态托管
#    bash scripts/deploy.sh hosting        # 仅部署静态托管
#    bash scripts/deploy.sh fn             # 仅部署云函数
#    bash scripts/deploy.sh all            # 同默认
#
#  约束（来自项目用户偏好）：
#    任何对外发布动作（本脚本本身就是发布动作）必须先获得用户明确同意
#    才能由 AI 助手代为执行。本脚本是把"部署执行步骤"固化下来，方便用户
#    自己跑或经同意后由助手运行。
# ============================================================================

set -euo pipefail

# ----------------------------------------------------------------------------
# 配置
# ----------------------------------------------------------------------------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_ID="saintwar-ai-d5g58v9z1a8b3afe9"
STAMP="$(date +%Y%m%d%H%M%S)"

# 颜色
C_RESET=$'\033[0m'
C_BLUE=$'\033[34m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_RED=$'\033[31m'

log()   { echo "${C_BLUE}==>${C_RESET} $*"; }
ok()    { echo "${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}⚠${C_RESET} $*"; }
err()   { echo "${C_RED}✗${C_RESET} $*" >&2; }

# 解析参数
MODE="${1:-all}"
case "$MODE" in
  all|fn|hosting) ;;
  *) err "未知模式: $MODE （可选: all / fn / hosting）"; exit 1 ;;
esac

# ----------------------------------------------------------------------------
# 前置检查
# ----------------------------------------------------------------------------
log "工程路径：$PROJECT_DIR"
log "环境 ID  ：$ENV_ID"
log "本次 STAMP：$STAMP"
log "部署模式 ：$MODE"

if ! command -v tcb >/dev/null 2>&1; then
  err "未找到 tcb CLI，请先安装：npm i -g @cloudbase/cli"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  err "未找到 rsync"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  err "未找到 python3（用于 bump 版本号）"
  exit 1
fi

# ----------------------------------------------------------------------------
# 1) 部署云函数
# ----------------------------------------------------------------------------
deploy_functions() {
  log "部署云函数…"
  if [[ ! -d "$PROJECT_DIR/cloudfunctions" ]]; then
    warn "未找到 cloudfunctions/ 目录，跳过云函数部署"
    return
  fi

  cd "$PROJECT_DIR"
  local fn_count=0
  for fn_dir in cloudfunctions/*/; do
    [[ -d "$fn_dir" ]] || continue
    local fn_name
    fn_name="$(basename "$fn_dir")"
    log "  · 部署函数：$fn_name"
    tcb fn deploy "$fn_name" --force 2>&1 | tail -5
    fn_count=$((fn_count + 1))
  done
  ok "云函数部署完成（共 $fn_count 个）"
}

# ----------------------------------------------------------------------------
# 2) 部署静态托管（含临时目录 + 自动 bump 版本号）
# ----------------------------------------------------------------------------
deploy_hosting() {
  log "准备静态托管部署…"

  local deploy_dir
  deploy_dir="$(mktemp -d -t cbdeploy)"
  log "  · 临时目录：$deploy_dir"

  # rsync 拷贝（排除无关产物）
  rsync -a \
    --exclude='.git/' \
    --exclude='.codebuddy/' \
    --exclude='.DS_Store' \
    --exclude='node_modules/' \
    --exclude='scripts/' \
    --exclude='docs/' \
    --exclude='cloudfunctions/' \
    --exclude='cloudbaserc.json' \
    --exclude='.gitignore' \
    "$PROJECT_DIR/" "$deploy_dir/"

  # 自动 bump 版本号 ?v=stamp
  #   - 扫描 deploy_dir 下所有 .html / .js / .css
  #   - 处理：HTML 属性 src/href、CSS url()、JS import/from、JS 中字符串字面量里的本地资源路径
  #   - 命中扩展名（.js/.css/.woff2/.woff/.ttf/.png/.jpg/.jpeg/.webp/.gif/.svg/.mp3/.mp4/.json）
  #     的本地路径都会被加/换成 ?v=stamp
  #   - 注释里的字面量不会动（CSS /* */ + JS // + JS /* */ 都跳过）
  log "  · bump 版本号 → ?v=$STAMP（HTML / CSS / JS 全量扫描）"
  python3 - "$deploy_dir" "$STAMP" <<'PY'
import re, sys, pathlib

root = pathlib.Path(sys.argv[1])
stamp = sys.argv[2]

# 哪些扩展名要打 stamp
EXT_RE = re.compile(
    r'\.(?:js|mjs|css|woff2?|ttf|otf|eot|'
    r'png|jpe?g|webp|gif|svg|ico|bmp|'
    r'mp3|wav|ogg|mp4|webm|'
    r'json)$',
    re.IGNORECASE,
)

def bump_url(url: str) -> str:
    """url 串本身做处理"""
    if not url:
        return url
    # 去掉锚点（虽然资源 URL 一般没有，但稳妥起见）
    base = url
    if base.startswith(('http://', 'https://', '//', 'data:', 'blob:', 'mailto:', '#', 'javascript:')):
        return url
    # 已带 ?v=xxx → 替换
    if '?v=' in base:
        return re.sub(r'\?v=[^&"\'\s)]*', f'?v={stamp}', url)
    # 已带其他 query → 不动（避免破坏既有参数）
    if '?' in base:
        return url
    # 走扩展名白名单
    # 注意 url 可能以 #fragment 或空白结尾，做下保护
    m = re.match(r'^([^#\s]+?)(#.*)?$', url)
    if not m:
        return url
    pure, frag = m.group(1), m.group(2) or ''
    if EXT_RE.search(pure):
        return f'{pure}?v={stamp}{frag}'
    return url


# ---- 注释剥离工具 ----
# 思路：先把所有注释替换成等长的空白占位（保留长度，方便 re.sub 在原文上替换后位置不变），
#       但实际上更稳的做法是分段处理：用一个解析器吐出 (是否注释, 文本) 段，
#       只在"非注释段"上做替换。
def strip_for_replace(src: str, lang: str):
    """
    返回 segments: [(is_code: bool, text: str), ...]
    is_code=True 表示是非注释/非字符串外的可替换片段，但为简化我们只切出"注释 vs 其他"。
    我们不剥字符串——因为我们恰好想替换字符串里的 URL。
    lang ∈ {'html', 'css', 'js'}
    """
    segs = []
    i = 0
    n = len(src)
    if lang == 'html':
        # HTML 注释：<!-- ... -->
        while i < n:
            j = src.find('<!--', i)
            if j == -1:
                segs.append((True, src[i:]))
                break
            if j > i:
                segs.append((True, src[i:j]))
            k = src.find('-->', j + 4)
            if k == -1:
                segs.append((False, src[j:]))
                break
            segs.append((False, src[j:k+3]))
            i = k + 3
    elif lang == 'css':
        # CSS 注释：/* ... */
        while i < n:
            j = src.find('/*', i)
            if j == -1:
                segs.append((True, src[i:]))
                break
            if j > i:
                segs.append((True, src[i:j]))
            k = src.find('*/', j + 2)
            if k == -1:
                segs.append((False, src[j:]))
                break
            segs.append((False, src[j:k+2]))
            i = k + 2
    elif lang == 'js':
        # JS：// 单行注释 + /* */ 块注释（不剥字符串）
        while i < n:
            ch = src[i]
            two = src[i:i+2]
            if two == '//':
                k = src.find('\n', i)
                if k == -1: k = n
                segs.append((False, src[i:k]))
                i = k
            elif two == '/*':
                k = src.find('*/', i + 2)
                if k == -1:
                    segs.append((False, src[i:]))
                    i = n
                else:
                    segs.append((False, src[i:k+2]))
                    i = k + 2
            else:
                # 累积到下一处注释起点
                j1 = src.find('//', i)
                j2 = src.find('/*', i)
                cands = [x for x in (j1, j2) if x != -1]
                if not cands:
                    segs.append((True, src[i:]))
                    i = n
                else:
                    j = min(cands)
                    if j > i:
                        segs.append((True, src[i:j]))
                    i = j
    else:
        segs.append((True, src))
    return segs


# ---- HTML 替换 ----
RE_HTML_ATTR = re.compile(r'\b(src|href)=(["\'])([^"\']+)\2')
RE_CSS_URL   = re.compile(r'url\(\s*(["\']?)([^)"\']+)\1\s*\)')

def transform_html(src: str) -> str:
    out = []
    for is_code, text in strip_for_replace(src, 'html'):
        if not is_code:
            out.append(text)
            continue
        text = RE_HTML_ATTR.sub(
            lambda m: f'{m.group(1)}={m.group(2)}{bump_url(m.group(3))}{m.group(2)}',
            text,
        )
        # 兼容内联 <style> 中的 url()
        text = RE_CSS_URL.sub(
            lambda m: f'url({m.group(1)}{bump_url(m.group(2))}{m.group(1)})',
            text,
        )
        out.append(text)
    return ''.join(out)


# ---- CSS 替换 ----
def transform_css(src: str) -> str:
    out = []
    for is_code, text in strip_for_replace(src, 'css'):
        if not is_code:
            out.append(text)
            continue
        text = RE_CSS_URL.sub(
            lambda m: f'url({m.group(1)}{bump_url(m.group(2))}{m.group(1)})',
            text,
        )
        out.append(text)
    return ''.join(out)


# ---- JS 替换 ----
# 命中"看起来像本地资源路径"的字符串字面量。
# 严格条件：
#   - 单/双/反引号包裹
#   - 不含换行
#   - 内容里不出现 ${（避免误改模板字符串里的表达式）
#   - 内容是相对路径或以 / 开头的本地路径（不是 http(s)://、data:、blob: 等）
#   - 扩展名命中白名单
RE_JS_STR_LITERAL = re.compile(
    r'''(?P<q>["'`])(?P<url>(?:\.\.?/|/|assets/|js/|css/|font/|music/|images?/)[^"'`\n${]*?\.[A-Za-z0-9]+)(?P=q)''',
)

# 也兼容 import 'xxx' / from 'xxx' / import('xxx')
RE_JS_IMPORT = re.compile(
    r'''(?P<kw>\bimport\b\s*(?:[^;'"`(]*?\s*from\s*)?|\bimport\s*\(\s*)(?P<q>["'`])(?P<url>[^"'`\n]+?)(?P=q)''',
)

def transform_js(src: str) -> str:
    out = []
    for is_code, text in strip_for_replace(src, 'js'):
        if not is_code:
            out.append(text)
            continue

        # 1) 普通字符串字面量里的本地资源路径
        def _repl_str(m):
            q = m.group('q')
            url = m.group('url')
            new_url = bump_url(url)
            return f'{q}{new_url}{q}'
        text = RE_JS_STR_LITERAL.sub(_repl_str, text)

        # 2) import / from（更宽松——任何字面量路径，命中扩展名才会真改）
        def _repl_imp(m):
            kw = m.group('kw')
            q = m.group('q')
            url = m.group('url')
            new_url = bump_url(url)
            return f'{kw}{q}{new_url}{q}'
        text = RE_JS_IMPORT.sub(_repl_imp, text)

        out.append(text)
    return ''.join(out)


# ---- 遍历 ----
total_files = 0
total_diff  = 0
per_kind = {'html': [0, 0], 'css': [0, 0], 'js': [0, 0]}

for path in root.rglob('*'):
    if not path.is_file():
        continue
    suf = path.suffix.lower()
    if suf == '.html':
        kind = 'html'
        fn = transform_html
    elif suf == '.css':
        kind = 'css'
        fn = transform_css
    elif suf in ('.js', '.mjs'):
        kind = 'js'
        fn = transform_js
    else:
        continue
    try:
        src = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    new = fn(src)
    if new != src:
        path.write_text(new, encoding='utf-8')
        diff = len(new) - len(src)
        total_files += 1
        total_diff  += diff
        per_kind[kind][0] += 1
        per_kind[kind][1] += diff

print(f'    done. files-changed={total_files}, byte-diff={total_diff:+d}')
for k, (cnt, d) in per_kind.items():
    print(f'      · {k:4s}: {cnt} file(s), {d:+d} bytes')
PY

  # 部署
  log "  · tcb hosting deploy …"
  cd "$deploy_dir"
  tcb hosting deploy . -e "$ENV_ID"

  # 清理
  log "  · 清理临时目录"
  rm -rf "$deploy_dir"

  ok "静态托管部署完成"
}

# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
case "$MODE" in
  all)
    deploy_functions
    deploy_hosting
    ;;
  fn)
    deploy_functions
    ;;
  hosting)
    deploy_hosting
    ;;
esac

echo
ok "全部完成。"
echo "    线上地址：https://${ENV_ID}-1300128993.tcloudbaseapp.com"
echo "    版本戳  ：?v=$STAMP"
echo "    （CDN 通常 1~3 分钟内刷新；如立刻不可见可用无痕模式或 Cmd+Shift+R）"
