// ============================================================
// FishGroupHoverUI — PHASE 21-1 v3.0 W1 D2 + D3
// ------------------------------------------------------------
// 在三鱼群上叠加鼠标 hover 检测 + 信息浮窗，让玩家"猎人式观察"
// 密度差异和大鱼存在暗示。
//
// D2：hover 命中 + 0.5s 延迟 + 140×64 浮窗 + 边缘翻转 + 三行内容（密度图 + ⚠ 占位）
// D3：第三行体型暗示从写死 ⚠ 升级为按"群内最大体型"动态显示：
//        small  → ⚠   红 #FF6B6B
//        medium → ⚠⚠  黄 #FFD93D
//        large  → ★   绿 #6BCB77
//     最大体型判定顺序：large > medium > small（任一 large 存在即返回 large）
//
// 行为规则（来自 Nina §4 §5）：
//   - 鼠标进入鱼群 wanderArea bbox → 立即金色描边高亮（呼吸 0.6~1.0）
//   - 同一鱼群停留 ≥ 500ms → 弹出 140×64 信息浮窗
//   - 鼠标移出 / 切换鱼群 → 立即重置（高亮消失，浮窗消失，计时归零）
//   - 浮窗位置：鼠标右下 +12，溢出 canvas 时翻到左/上侧
//
// 单位约定：与 D1 一致
//   - update(dt) 内部 dt 单位毫秒（fishing-scene._update 挂载点 *1000 转换）
//
// 红线（来自 Nina §0）：
//   - 不修改 fish-group-system.js 任何字段（仅只读访问 fishGroups 与 fishes[].size）
//   - 不动 v2.0 锁定（HookTimingJudge / BattleStateSystem / rise / fall）
//   - 不动 assets/ui/battle/ / obstacles / village
//   - D2 浮窗金边/140×64/边缘翻转逻辑保持不变
// ============================================================

// PHASE 21-1 D3：体型暗示视觉表（与 fish-group-system.js 的 size 字段值对齐）
const SIZE_HINT = {
  small:  { text: '⚠',  color: '#FF6B6B' },
  medium: { text: '⚠⚠', color: '#FFD93D' },
  large:  { text: '★',  color: '#6BCB77' },
};

/**
 * 取该鱼群内"最大体型"代表（large > medium > small）。
 * 用于 hover 浮窗第三行体型暗示，呼应 D3 反向概率表的"密度低暗藏大鱼"叙事。
 */
function _getMaxSize(fishes) {
  if (!fishes || fishes.length === 0) return 'small';
  if (fishes.some(f => f.size === 'large'))  return 'large';
  if (fishes.some(f => f.size === 'medium')) return 'medium';
  return 'small';
}

export class FishGroupHoverUI {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.fishGroupSystem = null;

    // 鼠标位置（canvas 内坐标系，已做 DPR/CSS 缩放修正）
    this.mouseX = -1;
    this.mouseY = -1;

    // hover 状态
    this.hoveredGroupId = null;     // 当前悬停鱼群 id（null = 无）
    this.hoverStartTime = 0;        // 进入当前鱼群的时间戳（performance.now）
    this.popupVisible = false;      // 浮窗是否已亮（hover ≥ HOVER_DELAY_MS）
    this.HOVER_DELAY_MS = 500;      // PRD 锁定 0.5s 延迟

    // 监听器引用（dispose 解绑用）
    this._onMouseMove = null;
    this._onMouseLeave = null;
  }

  // ──────────────────────────────────────────────
  // 生命周期
  // ──────────────────────────────────────────────

  init({ canvas, ctx, fishGroupSystem }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.fishGroupSystem = fishGroupSystem;

    // 鼠标坐标修正（与项目 click-to-move.js::screenToPixel 同套写法）：
    //   canvas.width/height = 内部分辨率（1280×720）
    //   rect.width/height = 实际显示尺寸（CSS 自适应缩放）
    //   两者 ratio 用于把 clientX/Y 映射回 canvas 内坐标
    this._onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    };

    this._onMouseLeave = () => {
      this.mouseX = -1;
      this.mouseY = -1;
      this.hoveredGroupId = null;
      this.hoverStartTime = 0;
      this.popupVisible = false;
    };

    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  /**
   * 每帧用 performance.now() 推进 hover 状态机。
   * @param {number} dt 距上帧时间（毫秒，与 D1 单位一致；本类不直接使用 dt 做积分，仅保留签名一致）
   */
  update(/* dt */) {
    if (!this.fishGroupSystem || !this.fishGroupSystem.fishGroups) {
      this._resetHover();
      return;
    }

    // 鼠标已离开 canvas（_onMouseLeave 设了 -1）→ 直接重置
    if (this.mouseX < 0 || this.mouseY < 0) {
      this._resetHover();
      return;
    }

    // 命中检测：三鱼群范围互不重叠（PRD 已校验），命中第一个即可 break
    let hit = null;
    for (const g of this.fishGroupSystem.fishGroups) {
      const halfW = g.wanderArea.w / 2;
      const halfH = g.wanderArea.h / 2;
      if (
        this.mouseX >= g.centerX - halfW &&
        this.mouseX <= g.centerX + halfW &&
        this.mouseY >= g.centerY - halfH &&
        this.mouseY <= g.centerY + halfH
      ) {
        hit = g;
        break;
      }
    }

    if (hit) {
      if (this.hoveredGroupId !== hit.id) {
        // 切换到新鱼群（或首次命中）→ 重置计时
        this.hoveredGroupId = hit.id;
        this.hoverStartTime = performance.now();
        this.popupVisible = false;
      } else if (
        !this.popupVisible &&
        performance.now() - this.hoverStartTime >= this.HOVER_DELAY_MS
      ) {
        this.popupVisible = true;
      }
    } else {
      this._resetHover();
    }
  }

  render() {
    const ctx = this.ctx;
    if (!ctx || !this.fishGroupSystem) return;
    if (!this.hoveredGroupId) return;

    // 找当前 hover 的 group
    const g = this.fishGroupSystem.fishGroups.find((x) => x.id === this.hoveredGroupId);
    if (!g) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // PHASE 21-1 D14：删除 wanderArea 金色呼吸描边（_drawHighlight 已移除）
    //   只保留浮窗本体；浮窗自身金边作为 UI 元素层保留
    if (this.popupVisible) {
      this._drawPopup(ctx, g);
    }

    ctx.restore();
  }

  dispose() {
    if (this.canvas) {
      if (this._onMouseMove) this.canvas.removeEventListener('mousemove', this._onMouseMove);
      if (this._onMouseLeave) this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    }
    this._onMouseMove = null;
    this._onMouseLeave = null;
    this.canvas = null;
    this.ctx = null;
    this.fishGroupSystem = null;
    this.hoveredGroupId = null;
    this.hoverStartTime = 0;
    this.popupVisible = false;
    this.mouseX = -1;
    this.mouseY = -1;
  }

  // ──────────────────────────────────────────────
  // 内部渲染工具
  // ──────────────────────────────────────────────

  // PHASE 21-1 D14：_drawHighlight 已删除（删除"鱼群外框金色呼吸描边"）
  //   浮窗本身的 #FFD700 金边作为 UI 元素层保留（见 _drawPopup）

  /**
   * 信息浮窗（140×64）：
   *   位置：鼠标右下 +12px；溢出 canvas 时翻到左/上侧
   *   背景：#1A2438 不透明；描边 #FFD700 1px
   *   三行：label / 密度图 / 体型暗示
   */
  _drawPopup(ctx, g) {
    const POPUP_W = 140;
    const POPUP_H = 64;
    const OFFSET = 12;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // 默认右下；溢出则翻转
    let px = this.mouseX + OFFSET;
    let py = this.mouseY + OFFSET;
    if (px + POPUP_W > cw) px = this.mouseX - OFFSET - POPUP_W;
    if (py + POPUP_H > ch) py = this.mouseY - OFFSET - POPUP_H;
    // 兜底：若翻转后仍越界（极端窗口），clamp 到 canvas 内
    if (px < 0) px = 0;
    if (py < 0) py = 0;

    px = Math.round(px);
    py = Math.round(py);

    // 背景 + 描边
    ctx.fillStyle = '#1A2438';
    ctx.fillRect(px, py, POPUP_W, POPUP_H);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, POPUP_W - 1, POPUP_H - 1);

    // 文字基线 / 字体
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const FONT = '12px "TencentSansW7", "TencentSans", "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.font = FONT;

    const padX = px + 8;
    const lineY1 = py + 8;
    const lineY2 = py + 8 + 16;
    const lineY3 = py + 8 + 16 * 2;

    // 第 1 行：label（PHASE 21-1 D14：鱼群密度 → 资源丰富度）
    ctx.fillStyle = '#B0BEC5';
    ctx.fillText('资源丰富度', padX, lineY1);

    // 第 2 行：5 字符丰富度图（贫瘠 / 一般 / 丰饶）
    const { dots, color } = this._richnessVisual(g.fishCount);
    ctx.fillStyle = color;
    ctx.fillText(dots, padX, lineY2);

    // 第 3 行：体型暗示（按群内最大体型显示 ⚠/⚠⚠/★，与丰富度解耦）
    const hint = SIZE_HINT[_getMaxSize(g.fishes)] || SIZE_HINT.small;
    ctx.fillStyle = hint.color;
    ctx.fillText(hint.text, padX, lineY3);
  }

  /**
   * PHASE 21-1 D14：fishCount → (dots, color) — 资源丰富度（贫瘠 / 一般 / 丰饶）
   *   count<=3 → 贫瘠（●○○○○ 红 #FF6B6B）
   *   count<=6 → 一般（●●●○○ 黄 #FFD93D）  ← 旧 5 档改为 4-6 区间
   *   count>=7 → 丰饶（●●●●● 绿 #6BCB77）
   */
  _richnessVisual(count) {
    if (count <= 3)  return { dots: '●○○○○', color: '#FF6B6B' };
    if (count <= 6)  return { dots: '●●●○○', color: '#FFD93D' };
    /* >=7 */         return { dots: '●●●●●', color: '#6BCB77' };
  }

  _resetHover() {
    this.hoveredGroupId = null;
    this.hoverStartTime = 0;
    this.popupVisible = false;
  }
}
