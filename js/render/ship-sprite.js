// ============================================================
// ShipSprite — 钓鱼场景浮台 → 船图替换
// ------------------------------------------------------------
// 资产：assets/images/buildings/ship.png（248×114 RGBA）
//
// 与 aming-fish-sprite.js 同范式：
//   - preloadShipSprite()    懒加载 + 单次
//   - isShipSpriteReady()    是否就绪
//   - drawShipSprite(ctx, cx, topY) 1:1 渲染，cx=水平中心，topY=PNG 顶边 y
//
// 用法约定（用户拍板 C 方案）：
//   - PNG 原始尺寸 248×114，不缩放
//   - 水平居中在 characterX
//   - PNG 顶边贴 platformY（即原浮台木板顶面 = 阿明脚底）
//
// 红线：
//   - 加载失败 → isReady() === false，调用方走原程序浮台绘制兜底
//   - imageSmoothingEnabled = false 维持像素硬边
// ============================================================

const SHIP_URL = 'assets/images/buildings/ship.png';
const SHIP_W = 248;
const SHIP_H = 114;

let _image   = null;
let _ready   = false;
let _loading = false;
let _failed  = false;

export function preloadShipSprite() {
  if (_ready || _loading || _failed) return;
  _loading = true;
  const img = new Image();
  img.onload = () => {
    _image = img;
    _ready = true;
    _loading = false;
    console.log('[ship-sprite] 加载完成:', SHIP_URL, img.naturalWidth + 'x' + img.naturalHeight);
  };
  img.onerror = () => {
    console.warn('[ship-sprite] 加载失败，回退原程序浮台:', SHIP_URL);
    _failed = true;
    _loading = false;
  };
  img.src = SHIP_URL;
}

export function isShipSpriteReady() {
  return _ready && !!_image;
}

/**
 * 1:1 渲染船图
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx    水平中心 x（= characterX）
 * @param {number} topY  PNG 顶边 y（= platformY + floatOffset）
 */
export function drawShipSprite(ctx, cx, topY) {
  if (!_ready || !_image) return;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_image, Math.round(cx - SHIP_W / 2), Math.round(topY), SHIP_W, SHIP_H);
  ctx.imageSmoothingEnabled = prev;
}

export const SHIP_SPRITE_SIZE = { w: SHIP_W, h: SHIP_H };
