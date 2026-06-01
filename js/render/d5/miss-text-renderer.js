// PHASE 21-1 D5「鱼咬钩反馈系统」· 漏提/失败「可惜……」字
//
// 权威源：art-spec v1.2 §4（漏提演出）+ impl-spec §6
// 调用：drawMissText(ctx, x, y, t)
//   - t: 自触发起的毫秒数（≥ 0）
//
// 关键帧 α：
//   0     → 0%
//   120ms → 100%（easeOutQuad）
//   600ms → 100%（停留）
//   800ms → 0%（easeOutQuad）
// 总时长 800ms

import { D5_COLORS, D5_FONT_STACK } from './d5-palette.js';

export function drawMissText(ctx, x, y, t) {
  if (t < 0 || t > 800) return;

  let a = 0;
  if (t < 120)      a = easeOutQuad(t / 120);
  else if (t < 600) a = 1;
  else              a = 1 - easeOutQuad((t - 600) / 200);

  const cx = Math.floor(x), cy = Math.floor(y);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.font = `12px ${D5_FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  ctx.strokeStyle = D5_COLORS.OUT;
  ctx.strokeText('可惜……', cx, cy);
  ctx.fillStyle = D5_COLORS.WHT_DK;
  ctx.fillText('可惜……', cx, cy);
  ctx.restore();
}

function easeOutQuad(k) { return 1 - (1 - k) * (1 - k); }
