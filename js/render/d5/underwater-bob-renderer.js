// PHASE 21-1 D5「鱼咬钩反馈系统」· 水下浮漂剪影
//
// 用途：sink 阶段浮漂沉到水线下后，原 _drawPixelBob 不再画，由本模块画水下剪影
//
// 设计：
//   - 深蓝/墨蓝椭圆剪影模拟"水下看到的浮漂模糊轮廓"
//   - sinkProgress (0→1) 控制：剪影透明度（越深越透）+ 大小（越深越小，模拟透视）
//   - 不画外环、不画细节，保持像素硬边
//
// 调用：drawUnderwaterBob(ctx, x, y, sinkProgress)
//   - x, y: 浮漂当前屏幕中心（水线下）
//   - sinkProgress: 0=刚下水(完全可见剪影)，1=最深(几乎透明)

export function drawUnderwaterBob(ctx, x, y, sinkProgress) {
  const p = Math.max(0, Math.min(1, sinkProgress));
  // 透明度：0.55 → 0.15
  const alpha = 0.55 - p * 0.40;
  // 椭圆半轴：随深度收缩（透视感）
  const rx = 9 - p * 3;   // 9 → 6
  const ry = 14 - p * 6;  // 14 → 8

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#1A2A3A'; // 墨蓝
  ctx.beginPath();
  ctx.ellipse(Math.floor(x), Math.floor(y), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // 中心暗点：模拟红头透过水的残留色斑
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = '#5A1F2A';
  ctx.fillRect(Math.floor(x) - 2, Math.floor(y) - Math.floor(ry * 0.4), 4, 3);
  ctx.restore();
}
