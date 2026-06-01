// PHASE 21-1 D5「鱼咬钩反馈系统」· PERFECT 三档字（稳/妙/完美）
//
// 权威源：art-spec v1.2 §5.0 / §5.1 / §5.2 / §5.3
// 调用：drawPerfectText(ctx, x, y, tier, t)
//   - tier: 'light' | 'medium' | 'heavy'
//   - t:    自触发起的毫秒数（≥ 0）
//
// 三段曲线：
//   1) 弹性进入 0~180ms（easeOutBack scale 0.6→1.15→1.0，alpha 0→1）
//   2) 停留+上飘  180~180+holdMs（alpha=1，y 从 0 → -0.8*rise）
//   3) 淡出 ~150ms（y 继续上飘到 -1.4*rise，alpha easeInQuad → 0）
//
// 多层金光：shadowBlur 叠加 1/2/3 层（按档位）+ heavy 额外 4 道放射光

import { D5_COLORS, D5_FONT_STACK } from './d5-palette.js';

// 2026-06-02 调参：原 art-spec 默认 600/700/800ms 玩家眨眼即过，体感×2 给足欣赏时间
// hold 段 ×2（停留更久），totalMs ×2，rise 不变（飘起距离不变，速度更慢更优雅）
const TIERS = {
  light:  {
    text: '稳！', fontSize: 14, holdMs: 540, totalMs: 1200, rise: 6,
    shadows: [['#FFEEB0', 4]],
  },
  medium: {
    text: '妙！', fontSize: 16, holdMs: 740, totalMs: 1400, rise: 8,
    shadows: [['#FFEEB0', 3], ['#FFD43B', 8]],
  },
  heavy:  {
    text: '完美！', fontSize: 20, holdMs: 940, totalMs: 1600, rise: 10,
    shadows: [['#FFEEB0', 2], ['#FFD43B', 6], ['#D4A41A', 12]],
    rays: true,
  },
};

export function drawPerfectText(ctx, x, y, tier, t) {
  const c = TIERS[tier];
  if (!c || t < 0 || t > c.totalMs) return;

  // —— 三段曲线 —— //
  let scale = 1, alpha = 1, yOff = 0;
  if (t < 180) {
    const k = t / 180;
    // easeOutBack：0.6 → ~1.15 → 1.0
    scale = easeOutBack(k) * 0.4 + 0.6;
    alpha = k;
  } else if (t < 180 + c.holdMs) {
    const k = (t - 180) / c.holdMs;
    yOff = -k * c.rise * 0.8;
  } else {
    const k = (t - 180 - c.holdMs) / 150;
    yOff = -c.rise * 0.8 - k * c.rise * 0.6;
    alpha = 1 - easeInQuad(k);
  }

  const cx = Math.floor(x), cy = Math.floor(y + yOff);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.font = `bold ${c.fontSize}px ${D5_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = D5_COLORS.OUT;

  // —— 多层金光叠加 —— //
  for (const [shColor, shBlur] of c.shadows) {
    ctx.shadowColor = shColor;
    ctx.shadowBlur = shBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = D5_COLORS.WHT;
    ctx.fillText(c.text, 0, 0);
  }

  // —— heavy 4 道放射光 —— //
  if (c.rays) drawRays(ctx);
  ctx.restore();
}

// art-spec §5.3：4 道放射光（0/90/180/270°），渐变矩形 12×2
function drawRays(ctx) {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  const angles = [0, 90, 180, 270];
  for (const deg of angles) {
    ctx.save();
    ctx.rotate(deg * Math.PI / 180);
    const grad = ctx.createLinearGradient(8, 0, 20, 0);
    grad.addColorStop(0, 'rgba(255,238,176,1)');
    grad.addColorStop(1, 'rgba(255,238,176,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(8, -1, 12, 2);
    ctx.restore();
  }
}

function easeOutBack(k, s = 1.70158) { k -= 1; return k * k * ((s + 1) * k + s) + 1; }
function easeInQuad(k) { return k * k; }
