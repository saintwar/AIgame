/**
 * drawTitleBg — 像素吉卜力风日月潭黄昏背景（离屏 Canvas 预渲染缓存）
 * 仅在登录页/开始页使用，进入游戏后不调用。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w   画布宽
 * @param {number} h   画布高
 */

let _cache = null;
let _cacheW = 0;
let _cacheH = 0;

function _buildCache(w, h) {
  const oc = document.createElement('canvas');
  oc.width = w;
  oc.height = h;
  const c = oc.getContext('2d');
  c.imageSmoothingEnabled = false;

  // ═══════════════════════════════════════
  // 层 1：天空（上半屏 ~50%）像素阶梯渐变
  // ═══════════════════════════════════════
  const skyH = Math.floor(h * 0.52);
  const skyBands = [
    { color: '#FFB088', h: Math.floor(skyH * 0.30) },   // 暖橙
    { color: '#FF9E6E', h: Math.floor(skyH * 0.20) },   // 过渡
    { color: '#FF8E5C', h: Math.floor(skyH * 0.25) },   // 柔粉
    { color: '#FFC87A', h: Math.floor(skyH * 0.15) },   // 过渡
    { color: '#FFD89E', h: 0 },                           // 金黄（填满剩余）
  ];
  // 修正最后一段填满
  skyBands[4].h = skyH - skyBands[0].h - skyBands[1].h - skyBands[2].h - skyBands[3].h;

  let sy = 0;
  for (const band of skyBands) {
    c.fillStyle = band.color;
    c.fillRect(0, sy, w, band.h);
    sy += band.h;
  }

  // 像素云朵
  function drawCloud(cx, cy, scale) {
    // 白色主体
    c.fillStyle = '#FFFFFF';
    const pts = [
      // 中心团
      [0,0],[1,0],[2,0],[3,0],
      [0,-1],[1,-1],[2,-1],[3,-1],
      [0,-2],[1,-2],[2,-2],
      // 左翼
      [-1,-1],[-2,0],[-3,0],
      [-1,0],
      // 右翼
      [4,-1],[5,0],[6,0],
      [4,0],
      // 底部
      [-2,1],[-1,1],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],
    ];
    for (const [dx, dy] of pts) {
      c.fillRect(cx + dx * scale, cy + dy * scale, scale, scale);
    }
    // 暖粉描边（外轮廓）
    c.fillStyle = '#FFCBA4';
    const outline = [
      [-3,-1],[-2,-1],[-1,-2],[0,-3],[1,-3],[2,-3],[3,-2],[4,-2],[5,-1],[6,-1],
      [7,0],[-3,1],[-2,2],[-1,2],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,1],[7,1],
    ];
    for (const [dx, dy] of outline) {
      c.fillRect(cx + dx * scale, cy + dy * scale, scale, scale);
    }
  }

  drawCloud(Math.floor(w * 0.18), Math.floor(h * 0.10), 3);
  drawCloud(Math.floor(w * 0.55), Math.floor(h * 0.06), 2);
  drawCloud(Math.floor(w * 0.78), Math.floor(h * 0.14), 3);
  drawCloud(Math.floor(w * 0.38), Math.floor(h * 0.20), 2);

  // ═══════════════════════════════════════
  // 层 2：远山（中部 ~15%）像素锯齿山脉
  // ═══════════════════════════════════════
  const mtBase = skyH;
  const mtH = Math.floor(h * 0.15);

  // 远山（最浅紫）
  c.fillStyle = '#8C7BA6';
  _drawMountain(c, 0, mtBase + mtH * 0.3, w, mtH * 0.7, 4, 42);

  // 中山
  c.fillStyle = '#6B5C8C';
  _drawMountain(c, 0, mtBase + mtH * 0.4, w, mtH * 0.6, 3, 53);

  // 近山（深紫）
  c.fillStyle = '#4A3F6B';
  _drawMountain(c, 0, mtBase + mtH * 0.55, w, mtH * 0.45, 2, 64);

  // ═══════════════════════════════════════
  // 层 3：日月潭湖面（下半屏 ~30%）
  // ═══════════════════════════════════════
  const lakeY = mtBase + mtH;
  const lakeH = h - lakeY - Math.floor(h * 0.05);

  // 湖面横条纹渐变
  const lakeBands = [
    { color: '#FF8E5C', h: Math.floor(lakeH * 0.06) },  // 地平线倒映橙
    { color: '#3A6FA0', h: Math.floor(lakeH * 0.10) },  // 过渡
    { color: '#2E5C8A', h: Math.floor(lakeH * 0.35) },  // 深湖蓝
    { color: '#3A7099', h: Math.floor(lakeH * 0.25) },  // 过渡
    { color: '#4A8FC2', h: 0 },                           // 浅湖蓝
  ];
  lakeBands[4].h = lakeH - lakeBands[0].h - lakeBands[1].h - lakeBands[2].h - lakeBands[3].h;

  let ly = lakeY;
  for (const band of lakeBands) {
    c.fillStyle = band.color;
    c.fillRect(0, ly, w, band.h);
    ly += band.h;
  }

  // 拉鲁岛剪影（中央偏左）
  const islandX = Math.floor(w * 0.38);
  const islandY = lakeY + Math.floor(lakeH * 0.02);
  c.fillStyle = '#5A8B5A';
  // 岛体
  c.fillRect(islandX, islandY, 20, 5);
  c.fillRect(islandX + 2, islandY - 3, 16, 3);
  c.fillRect(islandX + 5, islandY - 5, 10, 2);
  // 小树
  c.fillStyle = '#4A7B4A';
  c.fillRect(islandX + 8, islandY - 8, 4, 3);
  c.fillRect(islandX + 9, islandY - 10, 2, 2);

  // 像素波纹（白色单像素点散布）
  c.fillStyle = '#FFFFFF';
  const rng = _seededRand(123);
  for (let i = 0; i < 40; i++) {
    const rx = Math.floor(rng() * w);
    const ry = lakeY + Math.floor(rng() * lakeH);
    c.fillRect(rx, ry, 1, 1);
  }

  // ═══════════════════════════════════════
  // 层 4：近景剪影（底部 ~5%）
  // ═══════════════════════════════════════
  const fgBase = h - Math.floor(h * 0.05);
  c.fillStyle = '#1A1A2E';

  // 钓鱼栈桥（右侧）
  const pierX = Math.floor(w * 0.72);
  // 木桩
  c.fillRect(pierX, fgBase - 28, 4, 28);
  c.fillRect(pierX + 60, fgBase - 28, 4, 28);
  // 横板
  c.fillRect(pierX - 4, fgBase - 28, 72, 4);
  c.fillRect(pierX - 2, fgBase - 20, 68, 3);
  // 栏杆
  c.fillRect(pierX + 55, fgBase - 40, 3, 12);
  c.fillRect(pierX + 52, fgBase - 40, 9, 2);

  // 像素树剪影（左侧）
  const treeX = Math.floor(w * 0.12);
  // 树干
  c.fillRect(treeX + 4, fgBase - 30, 5, 30);
  // 树冠
  c.fillRect(treeX - 4, fgBase - 42, 20, 12);
  c.fillRect(treeX - 2, fgBase - 50, 16, 8);
  c.fillRect(treeX + 1, fgBase - 54, 10, 4);

  // 底部填充
  c.fillRect(0, fgBase, w, h - fgBase);

  // ═══════════════════════════════════════
  // 可选氛围：星星 + 飞鸟
  // ═══════════════════════════════════════
  // 星星（天空上方）
  c.fillStyle = '#FFFFFF';
  const starPositions = [
    [Math.floor(w * 0.08), Math.floor(h * 0.04)],
    [Math.floor(w * 0.62), Math.floor(h * 0.03)],
    [Math.floor(w * 0.90), Math.floor(h * 0.07)],
  ];
  for (const [sx, sy2] of starPositions) {
    c.fillRect(sx, sy2, 1, 1);
  }

  // 飞鸟 V 形（天空右侧）
  c.fillStyle = '#2A1A3E';
  const birdX = Math.floor(w * 0.70);
  const birdY = Math.floor(h * 0.12);
  c.fillRect(birdX, birdY, 1, 1);
  c.fillRect(birdX - 1, birdY + 1, 1, 1);
  c.fillRect(birdX + 1, birdY + 1, 1, 1);

  return oc;
}

/**
 * 画一座像素锯齿山脉
 * @param {number} x  起始 x
 * @param {number} baseY  山脚 y
 * @param {number} totalW  总宽
 * @param {number} maxH  最大高度
 * @param {number} step  台阶像素宽度（2-4）
 * @param {number} seed  随机种子
 */
function _drawMountain(c, x, baseY, totalW, maxH, step, seed) {
  const rng = _seededRand(seed);
  const peaks = Math.floor(totalW / (step * 12));
  for (let px = 0; px < totalW; px += step) {
    // 多峰叠加
    const nx = px / totalW;
    const h1 = Math.sin(nx * Math.PI * peaks) * maxH * 0.5;
    const h2 = Math.sin(nx * Math.PI * (peaks * 0.7 + 1)) * maxH * 0.3;
    const h3 = (rng() - 0.5) * maxH * 0.15;
    const mh = Math.max(0, h1 + h2 + h3);
    c.fillRect(x + px, baseY - Math.floor(mh), step, Math.floor(mh) + (baseY < 720 ? 720 - baseY + Math.floor(mh) : 0));
  }
}

function _seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function drawTitleBg(ctx, w, h) {
  if (!_cache || _cacheW !== w || _cacheH !== h) {
    _cache = _buildCache(w, h);
    _cacheW = w;
    _cacheH = h;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_cache, 0, 0);
}
