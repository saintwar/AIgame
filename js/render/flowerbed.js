/**
 * drawFlowerbed — 像素风花圃（离屏 Canvas 预渲染缓存）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x   左上角 x
 * @param {number} y   左上角 y
 * @param {number} w   宽度
 * @param {number} h   高度
 */

// 颜色规格
const DIRT       = '#8B6F47';   // 泥土底色
const RED_PETAL  = '#E63946';   // 红花瓣
const RED_CENTER = '#FFD166';   // 红花花心
const YEL_PETAL  = '#FFD166';   // 黄花瓣
const YEL_CENTER = '#06A77D';   // 黄花花心
const LEAF       = '#06A77D';   // 绿色叶片

let _cache = null;
let _cacheW = 0;
let _cacheH = 0;

// 确定性伪随机（避免每帧重绘时花朵位置跳动）
function _seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function _buildCache(w, h) {
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const c = offscreen.getContext('2d');
  c.imageSmoothingEnabled = false;

  // 底色：泥土
  c.fillStyle = DIRT;
  c.fillRect(0, 0, w, h);

  // 泥土纹理：随机深色小点
  c.fillStyle = '#7A5E3A';
  const rng = _seededRand(77);
  for (let i = 0; i < 20; i++) {
    c.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 2, 2);
  }

  // 绿色叶片点缀（散布在花朵之间）
  c.fillStyle = LEAF;
  for (let i = 0; i < 8; i++) {
    const lx = Math.floor(rng() * (w - 4));
    const ly = Math.floor(rng() * (h - 4));
    c.fillRect(lx, ly, 3, 2);
    c.fillRect(lx + 1, ly - 1, 1, 2);
  }

  // 红花 3-4 朵
  const redPositions = [
    { x: w * 0.15, y: h * 0.2 },
    { x: w * 0.55, y: h * 0.15 },
    { x: w * 0.8,  y: h * 0.45 },
    { x: w * 0.3,  y: h * 0.7 },
  ];
  for (const pos of redPositions) {
    const fx = Math.floor(pos.x);
    const fy = Math.floor(pos.y);
    // 花瓣（2x2 红色）
    c.fillStyle = RED_PETAL;
    c.fillRect(fx, fy, 2, 2);
    c.fillRect(fx + 3, fy, 2, 2);
    c.fillRect(fx, fy + 3, 2, 2);
    c.fillRect(fx + 3, fy + 3, 2, 2);
    // 花心（2x2 黄色）
    c.fillStyle = RED_CENTER;
    c.fillRect(fx + 2, fy + 1, 1, 2);
    c.fillRect(fx + 1, fy + 2, 2, 1);
  }

  // 黄花 3-4 朵
  const yelPositions = [
    { x: w * 0.35, y: h * 0.35 },
    { x: w * 0.7,  y: h * 0.2 },
    { x: w * 0.2,  y: h * 0.55 },
    { x: w * 0.6,  y: h * 0.75 },
  ];
  for (const pos of yelPositions) {
    const fx = Math.floor(pos.x);
    const fy = Math.floor(pos.y);
    // 花瓣（2x2 黄色）
    c.fillStyle = YEL_PETAL;
    c.fillRect(fx, fy, 2, 2);
    c.fillRect(fx + 3, fy, 2, 2);
    c.fillRect(fx, fy + 3, 2, 2);
    c.fillRect(fx + 3, fy + 3, 2, 2);
    // 花心（2x2 绿色）
    c.fillStyle = YEL_CENTER;
    c.fillRect(fx + 2, fy + 1, 1, 2);
    c.fillRect(fx + 1, fy + 2, 2, 1);
  }

  return offscreen;
}

export function drawFlowerbed(ctx, x, y, w, h) {
  if (!_cache || _cacheW !== w || _cacheH !== h) {
    _cache = _buildCache(w, h);
    _cacheW = w;
    _cacheH = h;
  }
  ctx.drawImage(_cache, x, y);
}
