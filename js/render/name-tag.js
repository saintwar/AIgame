/**
 * drawNameTag — 角色头顶姓名标签
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} centerX  角色水平中心（x + 16）
 * @param {number} topY     标签底部 y（角色头顶 y - 8）
 * @param {string} name     要显示的姓名
 */
export function drawNameTag(ctx, centerX, topY, name) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const font = '14px "Cubic 11", "Noto Sans TC", monospace';
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const padX = 6;
  const padY = 3;
  const textW = ctx.measureText(name).width;
  const boxW = textW + padX * 2;
  const boxH = 14 + padY * 2;    // 14px 字号 + 上下内边距
  const boxX = centerX - boxW / 2;
  const boxY = topY - boxH;       // topY 是标签底部

  // 半透明黑底
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 4);
    ctx.fill();
  } else {
    ctx.fillRect(boxX, boxY, boxW, boxH);
  }

  // 白色文字
  ctx.fillStyle = '#FFFFFF';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, centerX, boxY + boxH / 2);

  ctx.restore();
}
