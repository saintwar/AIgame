/**
 * drawFarmland — 菜苗农田（离屏 Canvas 预渲染缓存）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x   左上角 x
 * @param {number} y   左上角 y
 * @param {number} w   宽度
 * @param {number} h   高度
 */

// 颜色规格
const SOIL       = '#6B4423';   // 棕色田土
const FURROW     = '#4A2F18';   // 深棕田垄
const SPROUT     = '#5FAE3D';   // 亮绿菜苗
const SOIL_LIGHT = '#8B5A2B';   // 浅棕高光

let _cache = null;
let _cacheW = 0;
let _cacheH = 0;

function _buildCache(w, h) {
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const c = offscreen.getContext('2d');
  c.imageSmoothingEnabled = false;

  // 底色：棕色田土
  c.fillStyle = SOIL;
  c.fillRect(0, 0, w, h);

  // 田垄：3 条横向深棕条纹
  const furrowCount = 4;
  const furrowH = 4;
  const spacing = h / (furrowCount + 1);
  for (let i = 1; i <= furrowCount; i++) {
    const fy = Math.floor(i * spacing - furrowH / 2);
    c.fillStyle = FURROW;
    c.fillRect(0, fy, w, furrowH);
  }

  // 浅棕高光点缀
  c.fillStyle = SOIL_LIGHT;
  const seed = 42;
  for (let i = 0; i < 12; i++) {
    const px = ((seed * (i + 1) * 7) % w);
    const py = ((seed * (i + 1) * 13) % h);
    c.fillRect(px, py, 3, 2);
  }

  // 菜苗：规则散布小十字
  c.fillStyle = SPROUT;
  const cols = 5;
  const rows = 3;
  const cellW = w / cols;
  const cellH = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const cx = Math.floor(col * cellW + cellW / 2);
      const cy = Math.floor(r * cellH + cellH / 2);
      // 小十字（2px 宽 4px 高 + 4px 宽 2px 高）
      c.fillRect(cx - 1, cy - 2, 2, 5);   // 竖
      c.fillRect(cx - 2, cy, 5, 2);        // 横
    }
  }

  return offscreen;
}

export function drawFarmland(ctx, x, y, w, h) {
  if (!_cache || _cacheW !== w || _cacheH !== h) {
    _cache = _buildCache(w, h);
    _cacheW = w;
    _cacheH = h;
  }
  ctx.drawImage(_cache, x, y);
}
