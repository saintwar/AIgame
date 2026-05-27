/**
 * CoinHUD — 金币 HUD 组件
 * ────────────────────────────────────────────────────────
 * PHASE 18 仗4 收尾【村庄 HUD 样式统一 v2】：
 *   原黑色半透胶囊 + 金字 → 重写为木牌风（与 StaminaHUD 完全一致的
 *   _drawWoodPlaque + _drawPixelText 配色 / 字号 / 像素描边）。
 *   钱袋 💰 emoji 保留（不替换为像素图标 — 与原视觉延续）。
 *   保留：bumpScale 弹跳（金币变化时 1.0→1.4→1.0）、displayCoin 平滑插值。
 *
 * 风格：木牌 #8B6F47 棕底 + 米白 #FFF4D6 字 + 深棕 #5C3A1E 描边
 *        （与 StaminaHUD / 钓鱼场景金币木牌完全统一）
 * 数据源：inventory（构造时传入），监听 'coin_changed' 触发弹跳
 *
 * 用法：
 *   const hud = new CoinHUD(window.inventory);
 *   hud.x = 20; hud.y = 20; hud.w = 180; hud.h = 44;  // 可选自定义
 *   hud.update(dt);
 *   hud.render(ctx);
 */
export class CoinHUD {
  constructor(inventory, opts = {}) {
    this.inventory = inventory;
    this.displayCoin = inventory.getCoin();
    this.bumpScale = 1.0;

    // 与 StaminaHUD 同形参（默认尺寸 180×44，与体力 HUD 高度一致）
    this.x = opts.x ?? 20;
    this.y = opts.y ?? 20;
    this.w = opts.w ?? 180;
    this.h = opts.h ?? 44;

    inventory.on('coin_changed', () => { this.bumpScale = 1.4; });
  }

  update(_dt) {
    // 平滑过渡
    const target = this.inventory.getCoin();
    this.displayCoin += (target - this.displayCoin) * 0.15;
    if (Math.abs(this.displayCoin - target) < 0.5) {
      this.displayCoin = target;
    }
    // 弹跳缩放衰减
    this.bumpScale += (1.0 - this.bumpScale) * 0.12;
  }

  render(ctx) {
    ctx.save();

    // 弹跳：以木牌中心为锚点缩放（避免金币变化时整块"跳走"）
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(this.bumpScale, this.bumpScale);
    ctx.translate(-cx, -cy);

    // 木牌底板（与 StaminaHUD 同源）
    this._drawWoodPlaque(ctx, this.x, this.y, this.w, this.h);

    // 钱袋 emoji 图标（保留 💰），左内边距 10px，与 StaminaHUD 心形对齐
    // 用 16px emoji 字号（实际渲染 ~16-18px），与 StaminaHUD 心形 16x16 视觉等大
    ctx.font = '20px "TencentSansW7", "PingFang SC", "Microsoft YaHei", "Heiti SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('💰', Math.floor(this.x + 8), Math.floor(this.y + this.h / 2));

    // 数字（与 StaminaHUD 同字号 22 / 同填充 #FFF4D6 / 同描边 #5C3A1E）
    this._drawPixelText(
      ctx,
      `${Math.floor(this.displayCoin)}`,
      this.x + 38,
      this.y + this.h / 2,
      22,
      '#FFF4D6',
      '#5C3A1E'
    );

    ctx.restore();
  }

  // ─── 内部绘制（克隆自 StaminaHUD，保持视觉一字不差）──
  _drawWoodPlaque(ctx, x, y, w, h) {
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    ctx.fillStyle = '#8B6F47';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, Math.ceil(h) - 4);
    ctx.fillStyle = '#A88860';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 2, Math.ceil(w) - 4, 1);
    ctx.fillStyle = '#6B4A2A';
    ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + Math.ceil(h) - 3, Math.ceil(w) - 4, 1);
  }

  _drawPixelText(ctx, text, x, y, size, fill, stroke) {
    ctx.font = `bold ${size}px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
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
}
