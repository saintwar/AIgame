/**
 * StaminaHUD — 体力 HUD 组件（PHASE 18 仗3 hotfix）
 * ────────────────────────────────────────────────────────
 * 抽离自 fishing-scene._renderHUD 的"体力木牌"段，独立成可复用组件，
 *   供村庄场景 + 钓鱼场景共用（钓鱼仍然走自己的 _drawWoodPlaque/_drawPixelIcon
 *   保持原样不动；村庄走这个独立组件）。
 *
 * 风格：木牌 + 像素心形（与钓鱼一致）
 * 数据源：window.StaminaSystem（每帧拉值，无副作用 getter）
 * 三态：
 *   ratio >= 20% → 米白 #FFF4D6
 *   ratio <  20% → 暖橙 #FFA500 + 0.5↔1.0 闪烁（200ms 周期）
 *   cur === 0    → 灰阶（saturate(0)）+ opacity 0.4
 *
 * 用法：
 *   const hud = new StaminaHUD({ x: 210, y: 20, w: 150, h: 44 });
 *   hud.render(ctx);  // 每帧调用；不需要 update
 *   hud.dispose();    // 场景退出时调用（当前无副作用，预留）
 */

export class StaminaHUD {
  /**
   * @param {Object} opts
   * @param {number} opts.x       左上角 X
   * @param {number} opts.y       左上角 Y
   * @param {number} opts.w       木牌宽
   * @param {number} opts.h       木牌高
   */
  constructor(opts = {}) {
    this.x = opts.x ?? 20;
    this.y = opts.y ?? 20;
    this.w = opts.w ?? 150;
    this.h = opts.h ?? 44;
  }

  /** 预留 update 接口（与 CoinHUD 对齐），目前每帧从 StaminaSystem 拉值，无内部状态 */
  update(_dt) {
    // no-op
  }

  render(ctx) {
    const SS = (typeof window !== 'undefined') ? window.StaminaSystem : null;
    if (!SS || typeof SS.getCurrent !== 'function') return;

    const cur = SS.getCurrent();
    const max = SS.getMax();
    const ratio = max > 0 ? cur / max : 0;

    ctx.save();
    // 三态滤镜（与 fishing-scene 完全一致）
    let textFill = '#FFF4D6';
    if (cur === 0) {
      ctx.filter = 'saturate(0)';
      ctx.globalAlpha = 0.4;
    } else if (ratio < 0.2) {
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 200;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * Math.PI * 2);
      textFill = '#FFA500';
    }

    this._drawWoodPlaque(ctx, this.x, this.y, this.w, this.h);
    // PHASE 18 仗4 收尾【村庄 HUD v3 修复】：像素心形 → ❤️ emoji
    //   原因：用户连续 2 次反馈"红心被遮挡/看不到"，定位是 8x8 像素心形（s=2 → 16px）
    //   在某些 DPR/缩放/字体抗锯齿下视觉权重过弱、肉眼难辨。改用 ❤️ emoji 与金币 💰
    //   同样的渲染路径（fillText + textBaseline=middle），保证图标一定可见且两个 HUD
    //   图标风格统一（emoji 系）。
    //   位置：x+8 与金币 💰 完全对齐；文字起始 x+38 与金币数字对齐。
    ctx.font = '20px "TencentSansW7", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = (cur === 0 || (ratio < 0.2)) ? textFill : '#FFFFFF';
    ctx.fillText('❤️', Math.floor(this.x + 8), Math.floor(this.y + this.h / 2));
    this._drawPixelText(ctx, `${cur}/${max}`, this.x + 38, this.y + this.h / 2, 22, textFill, '#5C3A1E');
    ctx.restore();
  }

  dispose() {
    // no-op（预留）
  }

  // ─── 内部绘制（克隆自 fishing-scene._drawWoodPlaque/_drawPixelIcon('heart')/_drawPixelText）──
  // 故意不抽公共 utils — 钓鱼场景那三个方法挂在 this 上调用了 this.ctx，
  // 改造它们等于动 fishing-scene 渲染链；hotfix 阶段最小改动 = 局部克隆。

  _drawWoodPlaque(ctx, x, y, w, h) {
    // 深棕外描边（2px）
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    // 棕色主体
    ctx.fillStyle = '#8B6F47';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, Math.ceil(h) - 4);
    // 顶 1px 高光
    ctx.fillStyle = '#A88860';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, 1);
    // 底 1px 阴影
    ctx.fillStyle = '#6B4A2A';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + Math.ceil(h) - 3, Math.ceil(w) - 4, 1);
  }

  _drawPixelText(ctx, text, x, y, size, fill, stroke) {
    ctx.font = `bold ${size}px "TencentSansW7", sans-serif`;
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 2;
      ctx.strokeText(text, Math.floor(x), Math.floor(y));
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, Math.floor(x), Math.floor(y));
    ctx.textBaseline = 'alphabetic';
  }

  /** 8x8 像素心形（克隆 fishing-scene._drawPixelIcon('heart')） */
  _drawPixelHeart(ctx, x, y, s) {
    s = s || 2;
    const px = (col, row, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x + col * s), Math.floor(y + row * s), w * s, h * s);
    };
    // 描边
    px(1, 1, 2, 1, '#1A1A2E'); px(5, 1, 2, 1, '#1A1A2E');
    px(0, 2, 1, 2, '#1A1A2E'); px(3, 2, 2, 1, '#1A1A2E'); px(7, 2, 1, 2, '#1A1A2E');
    px(0, 4, 1, 1, '#1A1A2E'); px(7, 4, 1, 1, '#1A1A2E');
    px(1, 5, 1, 1, '#1A1A2E'); px(6, 5, 1, 1, '#1A1A2E');
    px(2, 6, 1, 1, '#1A1A2E'); px(5, 6, 1, 1, '#1A1A2E');
    px(3, 7, 2, 1, '#1A1A2E');
    // 红色主体
    px(1, 2, 2, 1, '#E63946'); px(5, 2, 2, 1, '#E63946');
    px(1, 3, 6, 1, '#E63946');
    px(1, 4, 6, 1, '#E63946');
    px(2, 5, 4, 1, '#E63946');
    px(3, 6, 2, 1, '#E63946');
    // 高光
    px(1, 2, 1, 1, '#FFFFFF'); px(2, 3, 1, 1, '#FFFFFF');
  }
}

export default StaminaHUD;
