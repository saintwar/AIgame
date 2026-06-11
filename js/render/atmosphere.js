// 大气效果模块：斜射阳光（God rays）+ 多层云彩
// 风格：柔和、低饱和度、与手绘背景融合
// 需在 day-night.js 之后加载（依赖 getDayNightPhase 等）

import { getDayNightPhase, getDayNightPhaseName, getDarkness } from './day-night.js';

// ============================================================
// 1. 柔和斜射阳光（God rays）
//    用径向渐变 + 多层叠加，避免硬边三角形
// ============================================================
export function drawSunbeams(ctx, time) {
  const phase = getDayNightPhase(time);
  const name = getDayNightPhaseName(phase);
  const cw = ctx.canvas ? ctx.canvas.width || 1280 : 1280;
  const ch = ctx.canvas ? ctx.canvas.height || 720 : 720;

  // ── 白天：从右上角透过云层的柔和光柱 ──
  if (name === 'day') {
    const dayProgress = (phase - 0.25) / 0.25;
    const noonFactor = 1 - Math.abs(dayProgress - 0.5) * 2;
    const intensity = noonFactor * 0.15; // 柔和，不抢眼
    if (intensity <= 0.02) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen'; // 叠加模式，更柔和

    // 光柱起点（画幅外部右上方，超出屏幕边缘）
    const sx = 1350 + dayProgress * 100;
    const sy = -150 + dayProgress * 30;

    // 用径向渐变画 5 条光柱
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      const angle = (Math.PI * 0.52) - 0.35 + t * 0.7; // ~99°~153°，更宽地指向左下
      const sway = Math.sin(time / 6000 + i * 1.3) * 0.02;
      const len = ch * 2.2;

      const ex = sx + Math.cos(angle + sway) * len;
      const ey = sy + Math.sin(angle + sway) * len;

      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      const a = intensity * (0.5 - Math.abs(t - 0.5) * 0.5);
      grad.addColorStop(0, `rgba(255, 248, 220, ${a})`);
      grad.addColorStop(0.5, `rgba(255, 245, 200, ${a * 0.6})`);
      grad.addColorStop(1, `rgba(255, 240, 180, 0)`);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 40 + Math.sin(time / 5000 + i) * 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    ctx.restore();
    return;
  }

  // ── 黎明/黄昏：金色 God rays ──
  if (name !== 'dawn' && name !== 'dusk') return;

  const duskIntensity = name === 'dawn'
    ? Math.min(1, phase / 0.15)
    : Math.min(1, (0.75 - phase) / 0.15);
  if (duskIntensity <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const sx = 1380;
  const sy = name === 'dawn' ? -120 : -140;

  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const angle = (Math.PI * 0.52) - 0.35 + t * 0.7;
    const sway = Math.sin(time / 5000 + i * 1.1) * 0.025;
    const len = ch * 2.0;

    const ex = sx + Math.cos(angle + sway) * len;
    const ey = sy + Math.sin(angle + sway) * len;

    const a = duskIntensity * (0.45 - Math.abs(t - 0.5) * 0.4);
    const grad = ctx.createLinearGradient(sx, sy, ex, ey);
    if (name === 'dawn') {
      grad.addColorStop(0, `rgba(255, 200, 100, ${a})`);
      grad.addColorStop(0.4, `rgba(255, 180, 80, ${a * 0.7})`);
      grad.addColorStop(1, `rgba(255, 160, 60, 0)`);
    } else {
      grad.addColorStop(0, `rgba(255, 160, 60, ${a})`);
      grad.addColorStop(0.4, `rgba(240, 120, 40, ${a * 0.6})`);
      grad.addColorStop(1, `rgba(220, 80, 30, 0)`);
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 55 + Math.sin(time / 4000 + i) * 15;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================
// 2. 多层云彩（柔和、低饱和、与时间融合）
// ============================================================

// 柔和云朵：用椭圆组合 + 低饱和度颜色 + 柔和边缘
function _drawSoftCloud(ctx, cx, cy, scale, baseAlpha, tint, time) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale * 0.52);

  const breathe = 1 + Math.sin(time / 8000) * 0.02; // 微呼吸
  ctx.scale(breathe, breathe);

  // 主云体（多层椭圆，柔和边缘）
  const r = tint ? 30 : 28;
  const g = tint ? 210 : 225;
  const b = tint ? 180 : 242;
  const mainColor = `rgb(${r}, ${g}, ${b})`;
  const shadowColor = tint ? `rgba(200, 150, 100, ${baseAlpha * 0.3})` : `rgba(180, 200, 220, ${baseAlpha * 0.3})`;

  // 阴影层（底部偏暗）
  ctx.globalAlpha = baseAlpha * 0.4;
  ctx.fillStyle = shadowColor;
  ctx.beginPath();
  ctx.ellipse(5, 12, 32, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(30, 8, 26, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(58, 10, 30, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(28, 18, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // 主云体（亮色）
  ctx.globalAlpha = baseAlpha * 0.55;
  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2);
  ctx.ellipse(28, -8, 24, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(56, -4, 30, 20, 0, 0, Math.PI * 2);
  ctx.ellipse(24, 8, 22, 15, 0, 0, Math.PI * 2);
  ctx.ellipse(52, 6, 25, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(80, -2, 22, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // 高光层（顶部白色）
  ctx.globalAlpha = baseAlpha * 0.35;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(8, -6, 20, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(35, -12, 18, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(60, -8, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawAtmosphereClouds(ctx, time) {
  const phase = getDayNightPhase(time);
  const name = getDayNightPhaseName(phase);
  if (name === 'night') return;

  const cw = ctx.canvas ? ctx.canvas.width || 1280 : 1280;

  // 云彩整体透明度：白天最高，黎明/黄昏渐显
  let cloudAlpha = 0.7;
  if (name === 'dawn') {
    cloudAlpha = Math.min(0.7, (phase / 0.25) * 0.7);
  } else if (name === 'dusk') {
    cloudAlpha = Math.min(0.7, ((0.75 - phase) / 0.25) * 0.7);
  }
  if (cloudAlpha <= 0.01) return;

  const isWarm = (name === 'dusk');
  const tint = isWarm ? true : null;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // 远层云（4 朵，小，慢速）
  {
    const speed = 0.06;
    const off = (time * speed) % (cw + 500);
    const clouds = [
      { x: off - 250, y: 40, s: 0.9, a: cloudAlpha * 0.4 },
      { x: off + 400, y: 65, s: 0.75, a: cloudAlpha * 0.35 },
      { x: off + 900, y: 30, s: 1.0, a: cloudAlpha * 0.38 },
      { x: off + 1350, y: 50, s: 0.85, a: cloudAlpha * 0.36 },
    ];
    clouds.forEach(c => {
      const wx = ((c.x % (cw + 500)) + (cw + 500)) % (cw + 500) - 250;
      _drawSoftCloud(ctx, wx, c.y, c.s, c.a, tint, time);
    });
  }

  // 近层云（3 朵，大，中速）
  {
    const speed = 0.15;
    const off = (time * speed) % (cw + 400);
    const clouds = [
      { x: off - 180, y: 75, s: 1.4, a: cloudAlpha * 0.5 },
      { x: off + 550, y: 55, s: 1.2, a: cloudAlpha * 0.45 },
      { x: off + 1100, y: 68, s: 1.3, a: cloudAlpha * 0.48 },
    ];
    clouds.forEach(c => {
      const wx = ((c.x % (cw + 400)) + (cw + 400)) % (cw + 400) - 180;
      _drawSoftCloud(ctx, wx, c.y, c.s, c.a, tint, time);
    });
  }

  ctx.restore();
}
