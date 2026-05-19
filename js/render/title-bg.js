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

// Bayer 4x4 矩阵（0-15 归一化到 0/16 ~ 15/16）
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

/**
 * 对一个离屏 canvas 区域施加 Bayer 4x4 dither
 * 在 colorA ↔ colorB 之间按 threshold 混合
 * @param {CanvasRenderingContext2D} c
 * @param {number} x0  区域左上 x
 * @param {number} y0  区域左上 y
 * @param {number} rw  区域宽
 * @param {number} rh  区域高
 * @param {number[]} colorA  [r,g,b] 色 A
 * @param {number[]} colorB  [r,g,b] 色 B
 * @param {number} t         混合比例 0~1（0=A, 1=B）
 */
function _ditherRect(c, x0, y0, rw, rh, colorA, colorB, t) {
  const id = c.getImageData(x0, y0, rw, rh);
  const d = id.data;
  const [aR, aG, aB] = colorA;
  const [bR, bG, bB] = colorB;
  // 插值色
  const iR = aR + (bR - aR) * t;
  const iG = aG + (bG - aG) * t;
  const iB = aB + (bB - aB) * t;

  for (let y = 0; y < rh; y++) {
    const bRow = BAYER4[y & 3];
    for (let x = 0; x < rw; x++) {
      const threshold = bRow[x & 3] / 16; // 0 ~ 0.9375
      const idx = (y * rw + x) * 4;
      const useB = t > threshold;
      d[idx]     = useB ? bR : aR;
      d[idx + 1] = useB ? bG : aG;
      d[idx + 2] = useB ? bB : aB;
      // alpha 不变
    }
  }
  c.putImageData(id, x0, y0);
}

function _buildCache(w, h) {
  const oc = document.createElement('canvas');
  oc.width = w;
  oc.height = h;
  const c = oc.getContext('2d');
  c.imageSmoothingEnabled = false;

  // ═══════════════════════════════════════
  // 层 1：天空（上半屏 ~50%）像素阶梯渐变 + Bayer dither
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

  // 解析颜色为 [r,g,b]
  const skyRGB = [
    [255, 176, 136],  // #FFB088
    [255, 158, 110],  // #FF9E6E
    [255, 142, 92],   // #FF8E5C
    [255, 200, 122],  // #FFC87A
    [255, 216, 158],  // #FFD89E
  ];

  // 先用最上方颜色填满天空区域，再逐段 dither
  c.fillStyle = '#FFB088';
  c.fillRect(0, 0, w, skyH);

  let sy = 0;
  for (let i = 0; i < skyBands.length; i++) {
    const band = skyBands[i];
    if (band.h <= 0) continue;
    // 每个色带内部：从上一色到当前色做 dither 渐变
    const prevRGB = i === 0 ? skyRGB[0] : skyRGB[i - 1];
    const curRGB = skyRGB[i];
    // 将色带分为若干 dither 子段（每段 ~8px 高）
    const subSegH = 8;
    const segs = Math.max(1, Math.ceil(band.h / subSegH));
    let segY = sy;
    for (let s = 0; s < segs; s++) {
      const thisH = s === segs - 1 ? (sy + band.h - segY) : subSegH;
      const t = (s + 1) / segs;
      _ditherRect(c, 0, segY, w, thisH, prevRGB, curRGB, t);
      segY += thisH;
    }
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
  // 层 3：日月潭湖面（下半屏 ~30%）暖紫蓝 + 夕阳反光
  // ═══════════════════════════════════════
  const lakeY = mtBase + mtH;
  const lakeH = h - lakeY - Math.floor(h * 0.05);

  // 湖面横条纹渐变（暖紫蓝色系）
  const lakeBands = [
    { color: '#FF8E5C', h: Math.floor(lakeH * 0.05) },  // 地平线倒映橙
    { color: '#6A7BA0', h: Math.floor(lakeH * 0.10) },  // 过渡（偏暖）
    { color: '#5A6B95', h: Math.floor(lakeH * 0.35) },  // 暖紫蓝（主色）
    { color: '#5E7598', h: Math.floor(lakeH * 0.25) },  // 过渡
    { color: '#4E6488', h: 0 },                           // 深紫蓝
  ];
  lakeBands[4].h = lakeH - lakeBands[0].h - lakeBands[1].h - lakeBands[2].h - lakeBands[3].h;

  const lakeRGB = [
    [255, 142, 92],   // #FF8E5C 倒映橙
    [106, 123, 160],  // #6A7BA0 过渡
    [90,  107, 149],  // #5A6B95 暖紫蓝
    [94,  117, 152],  // #5E7598 过渡
    [78,  100, 136],  // #4E6488 深紫蓝
  ];

  // 先用第一色填满
  c.fillStyle = '#FF8E5C';
  c.fillRect(0, lakeY, w, lakeH);

  // 逐段 dither 渐变
  let ly = lakeY;
  for (let i = 0; i < lakeBands.length; i++) {
    const band = lakeBands[i];
    if (band.h <= 0) continue;
    const prevRGB = i === 0 ? lakeRGB[0] : lakeRGB[i - 1];
    const curRGB = lakeRGB[i];
    const subSegH = 8;
    const segs = Math.max(1, Math.ceil(band.h / subSegH));
    let segY = ly;
    for (let s = 0; s < segs; s++) {
      const thisH = s === segs - 1 ? (ly + band.h - segY) : subSegH;
      const t = (s + 1) / segs;
      _ditherRect(c, 0, segY, w, thisH, prevRGB, curRGB, t);
      segY += thisH;
    }
    ly += band.h;
  }

  // ── 夕阳横向反光带（湖面上半部分） ──
  const reflZoneH = Math.floor(lakeH * 0.35);
  const reflBaseY = lakeY;
  const rngRefl = _seededRand(777);
  for (let ry = 0; ry < reflZoneH; ry++) {
    // 越靠近地平线越亮
    const fadeT = 1 - ry / reflZoneH;
    const alpha = Math.floor(fadeT * fadeT * 100); // 0~100 → 实际用 rgba
    if (alpha < 10) continue;
    // 每隔 4-8 像素画一条反光带
    const gap = 4 + Math.floor(rngRefl() * 5);
    if (ry % gap !== 0) continue;
    // 反光带宽度随机 2-4px
    const bandH = 2 + Math.floor(rngRefl() * 3);
    c.fillStyle = `rgba(244, 162, 97, ${alpha / 255})`; // #F4A261 半透明
    // 反光带不是全宽，中间亮两侧暗
    const reflW = Math.floor(w * (0.4 + rngRefl() * 0.3));
    const reflX = Math.floor(w * (0.15 + rngRefl() * 0.25));
    c.fillRect(reflX, reflBaseY + ry, reflW, Math.min(bandH, reflZoneH - ry));
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
    const ry2 = lakeY + Math.floor(rng() * lakeH);
    c.fillRect(rx, ry2, 1, 1);
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
