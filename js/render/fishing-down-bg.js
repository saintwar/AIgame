// ============================================================
// drawFishingDownBg — 钓鱼场景【水下战斗】静态底图
// ------------------------------------------------------------
// 用途：搏斗（Playing）状态下整张全屏铺水下底图，替代原 Layer 0
//      的程序化深水渐变；其他特效层（dither / 焦散 / 光柱 / 波纹 /
//      浮漂泡泡 / 鱼影 / 拉力条等）保持不变叠加在底图之上。
//
// 资产：assets/images/scenes/fishing-down-bg.jpg（1280×720）
//
// 使用方式：
//   import { drawFishingDownBg } from './render/fishing-down-bg.js';
//   drawFishingDownBg(ctx, cw, ch);
//   // 之后正常叠加 dither / 焦散 / 光柱 / 波纹 / 鱼线 / 浮漂等
//
// 与 fishing-bg.js 的差异：
//   - fishing-bg.js     = 水上视角（Idle/Aiming/Casting/Waiting/...）
//   - fishing-down-bg.js = 水下视角（Playing 搏斗期）
//
// 渲染降级：
//   - 图片就绪 → 1:1 全屏 drawImage（含离屏缓存）
//   - 图片未就绪/失败 → 返回 false 让调用方回退原程序化绘制
//
// 像素铁律：imageSmoothingEnabled = false（与项目其他场景一致）
// ============================================================

const _BG_SRC = 'assets/images/scenes/fishing-down-bg.jpg';

let _bgImg = null;
let _bgLoading = false;
let _bgFailed = false;

// 离屏缓存：将 jpg 解码后的位图缓存到一个 canvas，避免每帧 drawImage 走解码慢路径
let _imgCache = null;
let _imgCacheW = 0;
let _imgCacheH = 0;

function _ensureBgImage() {
  if (_bgImg || _bgLoading || _bgFailed) return _bgImg;
  _bgLoading = true;
  const img = new Image();
  img.onload = () => {
    _bgImg = img;
    _bgLoading = false;
    _imgCache = null; // 触发缓存重建
    console.log('[fishing-down-bg] 底图加载完成:', _BG_SRC, `${img.width}x${img.height}`);
  };
  img.onerror = () => {
    _bgFailed = true;
    _bgLoading = false;
    console.warn('[fishing-down-bg] 底图加载失败，回退到程序化深水渐变:', _BG_SRC);
  };
  img.src = _BG_SRC;
  return null;
}

/**
 * 在 (0, 0, w, h) 全屏绘制水下底图。
 * @returns {boolean} true=已绘制底图；false=底图未就绪，调用方应走程序化兜底
 */
export function drawFishingDownBg(ctx, w, h) {
  const img = _ensureBgImage();
  if (!img || !img.complete || img.naturalWidth <= 0) return false;

  if (!_imgCache || _imgCacheW !== w || _imgCacheH !== h) {
    _imgCache = document.createElement('canvas');
    _imgCache.width = w;
    _imgCache.height = h;
    const c = _imgCache.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, 0, 0, w, h);
    _imgCacheW = w;
    _imgCacheH = h;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_imgCache, 0, 0);
  return true;
}

/**
 * 触发预加载（fishing-scene constructor 调一次即可）。
 */
export function preloadFishingDownBg() {
  _ensureBgImage();
}
