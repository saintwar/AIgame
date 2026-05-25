/**
 * drawTitleBg — 登录页/开始页背景
 *
 * PHASE 16-7：从"程序化像素吉卜力日月潭黄昏"换为美术成品图。
 *   - 美术稿：assets/title-cover.jpg（吉卜力风湖畔栈桥钓鱼图，约 1080×600）
 *   - 用 cover 模式按目标画布尺寸绘制（保宽高比 + 居中裁剪）
 *   - 图片首次访问时异步加载，loading 期间用素色兜底，避免黑屏
 *   - 加载完成后写入 _img 缓存，后续帧直接 drawImage，零开销
 *
 * PHASE 16-7-FX：在静态封面之上叠加 3 层动画，画面"活起来"但不抢标题
 *   - 湖面水波纹：3~4 条缓慢扩散的椭圆涟漪（白色低 alpha，叠加模式 lighter）
 *   - 天空飞鸟：2 只 V 形剪影从画面右往左缓慢飘过，循环
 *   - 一缕阳光：右上角斜向下的光柱，呼吸式淡入淡出
 *   - 时间源：performance.now() / 1000，调用方零改动
 *
 * 接口签名保持向后兼容：drawTitleBg(ctx, w, h)
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w   画布宽
 * @param {number} h   画布高
 */

const COVER_SRC = 'assets/title-cover.jpg';

let _img = null;       // HTMLImageElement，加载完成后赋值
let _loading = false;  // 是否正在加载
let _failed = false;   // 加载失败标志（避免反复重试）

function _ensureLoaded() {
  if (_img || _loading || _failed) return;
  _loading = true;
  const img = new Image();
  img.onload = () => {
    _img = img;
    _loading = false;
  };
  img.onerror = () => {
    _failed = true;
    _loading = false;
    console.warn('[title-bg] 封面图加载失败：', COVER_SRC);
  };
  img.src = COVER_SRC;
}

/**
 * cover 模式绘制：保宽高比，画布短边贴满，长边居中裁剪
 */
function _drawCover(ctx, img, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let sx, sy, sw, sh;
  if (ir > cr) {
    sh = img.height;
    sw = img.height * cr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / cr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// ═══════════════════════════════════════════════════════
// FX 层：水波纹 / 飞鸟 / 阳光
// ═══════════════════════════════════════════════════════

/**
 * 湖面水波纹：N 条椭圆涟漪在湖面区域缓慢扩散
 * 设计区域：y ∈ [h*0.55, h*0.95]（避开树丛与栈桥右侧太靠下的区域）
 *   - 4 个 ripple，phase 错开 0/0.25/0.5/0.75
 *   - 周期 6s，半径 0→90px，alpha 从 0.35 → 0
 *   - 用 ellipse 画扁圆（横向更长），符合远观水面透视
 */
function _drawRipples(ctx, w, h, t) {
  const period = 6.0;
  const ripples = [
    { cx: 0.30, cy: 0.78, phase: 0.00 },
    { cx: 0.55, cy: 0.86, phase: 0.30 },
    { cx: 0.42, cy: 0.92, phase: 0.55 },
    { cx: 0.65, cy: 0.74, phase: 0.80 },
  ];
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const r of ripples) {
    const local = ((t / period) + r.phase) % 1;       // 0 → 1
    const radius = local * 90;                          // 半径 0 → 90px
    const alpha = (1 - local) * 0.32;                   // alpha 渐隐
    if (alpha < 0.02) continue;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    const cx = w * r.cx;
    const cy = h * r.cy;
    ctx.beginPath();
    // 椭圆（横向 1.0，纵向 0.35）—— 远视水面透视感
    ctx.ellipse(cx, cy, radius, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 飞鸟：2 只 V 形小点从右向左缓慢飘过，循环
 *   - 速度：每只 ~36s 横穿一次（极慢，留白感）
 *   - 高度：天空区上半 y ∈ [h*0.06, h*0.18]
 *   - 翅膀有上下"扇动"：用 sin(t*4) 控制 V 形开合幅度
 */
function _drawBirds(ctx, w, h, t) {
  const birds = [
    { period: 36, phase: 0.00, yRatio: 0.10, scale: 1.0 },
    { period: 42, phase: 0.55, yRatio: 0.16, scale: 0.75 },
  ];
  ctx.save();
  ctx.strokeStyle = 'rgba(60, 70, 90, 0.65)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const b of birds) {
    const local = ((t / b.period) + b.phase) % 1;       // 0 → 1
    // 从屏幕右外（1.1）走到屏幕左外（-0.1）
    const x = w * (1.1 - local * 1.2);
    const y = h * b.yRatio;
    if (x < -20 || x > w + 20) continue;
    // 翅膀扇动：sin 让 V 形上下开合
    const flap = Math.sin(t * 4 + b.phase * 10) * 0.35 + 1; // 0.65 ~ 1.35
    const wing = 8 * b.scale;
    const liftL = 4 * b.scale * flap;
    const liftR = 4 * b.scale * flap;
    ctx.beginPath();
    ctx.moveTo(x - wing, y + liftL);
    ctx.lineTo(x, y - 1);
    ctx.lineTo(x + wing, y + liftR);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 一缕阳光：右上角斜向下射入的光柱，呼吸式淡入淡出
 *   - 起点 (w*0.92, -20)，方向 ↙ 倾角约 70°
 *   - 用 createLinearGradient 沿光柱方向画白→透明
 *   - 整体 alpha 用 sin 呼吸，4s 周期
 *   - 叠加模式 lighter（提亮，不发灰）
 */
function _drawSunRay(ctx, w, h, t) {
  // 呼吸：alpha 在 0.18 ~ 0.42 之间，4s 周期
  const breathe = (Math.sin(t * (Math.PI * 2 / 4)) + 1) / 2; // 0~1
  const baseAlpha = 0.18 + breathe * 0.24;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 旋转坐标系，让光柱方向沿 y 轴正方向
  const originX = w * 0.92;
  const originY = -h * 0.05;
  const angle = (Math.PI / 180) * 24; // 与垂直方向夹 24°（向左下倾）
  const length = h * 1.05;            // 几乎贯穿到底
  const halfWidth = w * 0.10;         // 光柱半宽

  ctx.translate(originX, originY);
  ctx.rotate(angle);

  // 沿光柱中心轴的横向渐变（左右淡出）
  const grad = ctx.createLinearGradient(-halfWidth, 0, halfWidth, 0);
  grad.addColorStop(0.0, 'rgba(255, 246, 210, 0)');
  grad.addColorStop(0.5, `rgba(255, 246, 210, ${baseAlpha.toFixed(3)})`);
  grad.addColorStop(1.0, 'rgba(255, 246, 210, 0)');
  ctx.fillStyle = grad;

  // 沿光柱长度方向叠一层 alpha 渐变（顶亮底淡），避免光柱"实心矩形"感
  // 简化：直接画矩形再用第二个 globalAlpha 折扣（取顶部更亮）
  // 这里采用分段绘制，让长度方向也有衰减
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    // 长度方向衰减：顶部 1.0，底部 0.2
    const lenFade = 1 - t0 * 0.85;
    ctx.globalAlpha = lenFade;
    ctx.fillRect(-halfWidth, length * t0, halfWidth * 2, length * (t1 - t0) + 0.5);
  }

  ctx.restore();
}

export function drawTitleBg(ctx, w, h) {
  _ensureLoaded();

  if (_img) {
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    _drawCover(ctx, _img, w, h);
    ctx.imageSmoothingEnabled = prev;
  } else {
    // 兜底：图片未加载完时素色
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#cfe7e2');
    grad.addColorStop(0.55, '#a9cfc7');
    grad.addColorStop(1, '#7fb0a8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // 时间（连续秒）
  const t = performance.now() / 1000;

  // FX 叠加（无论图是否加载完，都画 → loading 兜底色上也有动画）
  _drawSunRay(ctx, w, h, t);   // 先光柱（lighter 叠加）
  _drawBirds(ctx, w, h, t);    // 再飞鸟（覆盖在天空上）
  _drawRipples(ctx, w, h, t);  // 最后水波纹（湖面区域）
}
