/**
 * drawFishingBg — 钓鱼场景静态背景【清晨清澈】离屏缓存
 *   含：清晨天空 dither / 像素云 / 晨雾紫蓝远山 / 晨阳 /
 *       三层青蓝湖（水面+水中柔和倒影+水底气泡）/ 晨光横向反光带 /
 *       水陆交界浅滩过渡带
 * 仅在 FishingScene 渲染水上时调用；动态元素（鸟/叶/光斑）仍走每帧。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */

let _cache = null;
let _cacheW = 0;
let _cacheH = 0;

// Bayer 4x4 矩阵（与登录页一致）
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

/** 对一个离屏 canvas 区域施加 Bayer 4x4 dither（colorA→colorB，阈值 t）
 *   ⚠️ 必须强制 alpha=255，否则当目标区域未预填底色时（如湖面层未提前 fillRect），
 *   getImageData 拿到的 alpha=0 → putImageData 后整块透明 → 上层显示为漆黑。
 *   这是 PHASE 13-1c【准备界面湖水死黑】的根因。
 */
function _ditherRect(c, x0, y0, rw, rh, colorA, colorB, t) {
  if (rw <= 0 || rh <= 0) return;
  const id = c.getImageData(x0, y0, rw, rh);
  const d = id.data;
  const [aR, aG, aB] = colorA;
  const [bR, bG, bB] = colorB;
  for (let y = 0; y < rh; y++) {
    const bRow = BAYER4[y & 3];
    for (let x = 0; x < rw; x++) {
      const threshold = bRow[x & 3] / 16;
      const idx = (y * rw + x) * 4;
      const useB = t > threshold;
      d[idx]     = useB ? bR : aR;
      d[idx + 1] = useB ? bG : aG;
      d[idx + 2] = useB ? bB : aB;
      d[idx + 3] = 255; // ❗ 强制不透明，修复死黑湖水
    }
  }
  c.putImageData(id, x0, y0);
}

function _seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 像素柔和山脉（多峰叠加 + 微抖动，禁止尖锐锯齿） */
function _drawMountain(c, baseY, totalW, maxH, step, seed, peakScale) {
  const rng = _seededRand(seed);
  const ps = typeof peakScale === 'number' ? peakScale : 1;
  const peaks = Math.max(1, Math.floor((totalW / (step * 14)) * ps));
  for (let px = 0; px < totalW; px += step) {
    const nx = px / totalW;
    const h1 = Math.sin(nx * Math.PI * peaks) * maxH * 0.55;
    const h2 = Math.sin(nx * Math.PI * (peaks * 0.7 + 1)) * maxH * 0.25;
    const h3 = (rng() - 0.5) * maxH * 0.08; // 极少随机抖动 → 柔和
    const mh = Math.max(0, h1 + h2 + h3);
    c.fillRect(px, baseY - Math.floor(mh), step, Math.floor(mh) + 4);
  }
}

/** 取一行像素的"山高"（用于水中柔和倒影；与 _drawMountain 同公式） */
function _mountainHeightAt(nx, peaks, maxH, rngFn) {
  const h1 = Math.sin(nx * Math.PI * peaks) * maxH * 0.55;
  const h2 = Math.sin(nx * Math.PI * (peaks * 0.7 + 1)) * maxH * 0.25;
  const h3 = (rngFn() - 0.5) * maxH * 0.08;
  return Math.max(0, h1 + h2 + h3);
}

/** 像素方块云（淡橙白 + 高光） */
function _drawPixelCloud(c, cx, cy, scale) {
  c.fillStyle = '#FFF1DB';
  const body = [
    [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-1, -2], [0, -2], [1, -2],
    [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1],
    [-4, 0], [4, 0],
  ];
  for (const [dx, dy] of body) {
    c.fillRect(cx + dx * scale, cy + dy * scale, scale, scale);
  }
  c.fillStyle = '#FFFFFF';
  const hi = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
  for (const [dx, dy] of hi) {
    c.fillRect(cx + dx * scale, cy + dy * scale, scale, scale);
  }
}

function _buildCache(w, h) {
  const oc = document.createElement('canvas');
  oc.width = w;
  oc.height = h;
  const c = oc.getContext('2d');
  c.imageSmoothingEnabled = false;

  const waterLevel = Math.floor(h * 0.5);

  // ═══════════════════════════════════════
  // 层 1：天空（清晨色，上往下渐变）Bayer dither
  //   顶部 #A8C5E0（淡青蓝）→ 中部 #E8C9A8（暖米白）→ 地平线 #FFD9A8（朝阳）
  // ═══════════════════════════════════════
  const skyH = waterLevel;
  const skyTop  = [168, 197, 224];  // #A8C5E0
  const skyMid  = [232, 201, 168];  // #E8C9A8
  const skyBot  = [255, 217, 168];  // #FFD9A8

  const seg1H = Math.floor(skyH * 0.50); // top→mid
  const seg2H = skyH - seg1H;             // mid→bot

  // 段 1：顶部 → 中部（多 8px 子段，色阶逐步推进）
  c.fillStyle = '#A8C5E0';
  c.fillRect(0, 0, w, skyH);

  let sy = 0;
  const sub = 8;
  const segs1 = Math.max(1, Math.ceil(seg1H / sub));
  for (let s = 0; s < segs1; s++) {
    const thisH = s === segs1 - 1 ? (seg1H - sy) : sub;
    const t = (s + 1) / segs1;
    _ditherRect(c, 0, sy, w, thisH, skyTop, skyMid, t);
    sy += thisH;
  }
  // 段 2：中部 → 地平线
  let sy2 = seg1H;
  const segs2 = Math.max(1, Math.ceil(seg2H / sub));
  for (let s = 0; s < segs2; s++) {
    const thisH = s === segs2 - 1 ? (seg1H + seg2H - sy2) : sub;
    const t = (s + 1) / segs2;
    _ditherRect(c, 0, sy2, w, thisH, skyMid, skyBot, t);
    sy2 += thisH;
  }

  // ═══════════════════════════════════════
  // 层 1.5：晨阳本体（右上 75%/30%，柔和晨黄 + 1-2 圈外晕）
  // ═══════════════════════════════════════
  const sunCX = Math.floor(w * 0.75);
  const sunCY = Math.floor(skyH * 0.30);
  const sunR = 26;

  // 外晕（1-2 圈，柔和）
  const glowLayers = [
    { r: sunR * 1.7, color: 'rgba(255, 232, 168, 0.22)' },
    { r: sunR * 1.25, color: 'rgba(255, 240, 200, 0.45)' },
  ];
  for (const gl of glowLayers) {
    const gr = Math.floor(gl.r);
    c.fillStyle = gl.color;
    for (let dy = -gr; dy <= gr; dy += 2) {
      const halfW = Math.floor(Math.sqrt(Math.max(0, gr * gr - dy * dy)));
      c.fillRect(sunCX - halfW, sunCY + dy, halfW * 2, 2);
    }
  }
  // 晨阳圆盘（柔和晨黄 #FFE8A8）
  c.fillStyle = '#FFE8A8';
  for (let dy = -sunR; dy <= sunR; dy += 2) {
    const halfW = Math.floor(Math.sqrt(Math.max(0, sunR * sunR - dy * dy)));
    c.fillRect(sunCX - halfW, sunCY + dy, halfW * 2, 2);
  }
  // 微亮心
  c.fillStyle = '#FFF4C8';
  const innerR = Math.floor(sunR * 0.55);
  for (let dy = -innerR; dy <= innerR; dy += 2) {
    const halfW = Math.floor(Math.sqrt(Math.max(0, innerR * innerR - dy * dy)));
    c.fillRect(sunCX - halfW, sunCY + dy, halfW * 2, 2);
  }

  // ═══════════════════════════════════════
  // 层 2：像素方块云（2-3 朵，分散布局）
  // ═══════════════════════════════════════
  _drawPixelCloud(c, Math.floor(w * 0.18), Math.floor(h * 0.10), 4);
  _drawPixelCloud(c, Math.floor(w * 0.45), Math.floor(h * 0.06), 3);
  _drawPixelCloud(c, Math.floor(w * 0.62), Math.floor(h * 0.16), 3);

  // ═══════════════════════════════════════
  // 层 3：远山双层（晨雾蓝紫，柔和缓坡）
  //   后山 #8A95B5；前山 #5A6580
  // ═══════════════════════════════════════
  const mtMaxH = Math.floor(h * 0.18);
  const mtBack = '#8A95B5';
  const mtFront = '#5A6580';

  // 后山（晨雾蓝紫，浅）
  c.fillStyle = mtBack;
  _drawMountain(c, waterLevel - 4, w, mtMaxH * 0.55, 4, 71, 0.85);

  // 前山（深晨雾紫，稍高）
  c.fillStyle = mtFront;
  _drawMountain(c, waterLevel - 2, w, mtMaxH * 0.85, 3, 53, 0.7);

  // ═══════════════════════════════════════
  // 层 4：湖面 — 平滑渐变 + 极弱 dither + 紧贴水岸的远山倒影
  //   渐变：顶 #A8D0E0（反射天空）→ 中 #7FB5C7 → 底 #5A9BB0
  //   dither：色差仅 ~6（几乎不可见），保留像素颗粒质感
  //   倒影：紧贴水岸线，最大长度 = 山高（前山 mtMaxH*0.85），透明度 0.30
  // ═══════════════════════════════════════
  const lakeY = waterLevel;
  const lakeH = h - lakeY;

  // —— 主体平滑渐变（无硬切色带）——
  const lakeGrad = c.createLinearGradient(0, lakeY, 0, h);
  lakeGrad.addColorStop(0,    '#8FBED0'); // 紧贴水岸：浅（反射天空，但比旧版深一档）
  lakeGrad.addColorStop(0.5,  '#5A95B0'); // 中段：中深
  lakeGrad.addColorStop(1,    '#3E7A95'); // 画面底部：深水（冷蓝压重，绝非黑）
  c.fillStyle = lakeGrad;
  c.fillRect(0, lakeY, w, lakeH);

  // —— 极弱 dither 颗粒（色差 ~6，远看几乎平滑，近看保留像素感）——
  //   实现：用 Bayer 4x4 在 ±3 RGB 抖动，针对渐变中段单点采样
  //   分 8px 子段，每段 dither 深浅两色仅差 6
  let ly = lakeY;
  const ditherSegs = Math.max(1, Math.ceil(lakeH / 8));
  for (let s = 0; s < ditherSegs; s++) {
    const thisH = s === ditherSegs - 1 ? (lakeY + lakeH - ly) : 8;
    // 当前段中心相对位置（0=顶, 1=底）
    const ratio = (ly + thisH * 0.5 - lakeY) / lakeH;
    // 渐变在该 ratio 上的近似 RGB（手算插值匹配上面 lakeGrad 三色阶）
    let baseR, baseG, baseB;
    if (ratio < 0.5) {
      const t = ratio / 0.5;
      // #8FBED0 (143,190,208) → #5A95B0 (90,149,176)
      baseR = 143 + (90 - 143) * t;
      baseG = 190 + (149 - 190) * t;
      baseB = 208 + (176 - 208) * t;
    } else {
      const t = (ratio - 0.5) / 0.5;
      // #5A95B0 (90,149,176) → #3E7A95 (62,122,149)
      baseR = 90 + (62 - 90) * t;
      baseG = 149 + (122 - 149) * t;
      baseB = 176 + (149 - 176) * t;
    }
    // dither 深浅两色：base ±3
    const dither_lo = [Math.round(baseR - 3), Math.round(baseG - 3), Math.round(baseB - 3)];
    const dither_hi = [Math.round(baseR + 3), Math.round(baseG + 3), Math.round(baseB + 3)];
    // 用 t=0.5 让 Bayer 矩阵半数像素 hi、半数 lo → 极弱噪点
    _ditherRect(c, 0, ly, w, thisH, dither_lo, dither_hi, 0.5);
    ly += thisH;
  }

  // ═══════════════════════════════════════
  //  远山倒影 —— 紧贴水岸线，长度 = 山高
  //  关键修复：reflTop = lakeY（紧贴水岸，无空白）
  //  倒影颜色 = 远山色 × 0.7 + 水色 × 0.3，再以 alpha 0.30 叠加
  // ═══════════════════════════════════════
  // 后山倒影色：mtBack #8A95B5(138,149,181)×0.7 + #A8D0E0(168,208,224)×0.3 ≈ (147,167,194)
  // 前山倒影色：mtFront #5A6580(90,101,128)×0.7 + #A8D0E0(168,208,224)×0.3 ≈ (113,133,157)
  const reflBackColor  = 'rgba(147, 167, 194, 0.30)';
  const reflFrontColor = 'rgba(113, 133, 157, 0.30)';

  // 倒影最大高度 = 前山山高（不延伸到画面底）
  const reflMaxH = Math.floor(mtMaxH * 0.85);
  const reflTop = lakeY; // ❗ 紧贴水岸线

  // —— 后山倒影（浅）——
  c.fillStyle = reflBackColor;
  // 与 _drawMountain(seed=71, peakScale=0.85, step=4) 同公式
  const peaksB = Math.max(1, Math.floor((w / (4 * 14)) * 0.85));
  // 预采样后山高度数组（每 4px 一个采样点；rng 仅用一次以保持轮廓稳定）
  const rngB = _seededRand(71);
  const backH = new Float32Array(Math.ceil(w / 4) + 1);
  for (let i = 0; i < backH.length; i++) {
    const nx = (i * 4) / w;
    backH[i] = _mountainHeightAt(nx, peaksB, mtMaxH * 0.55, rngB);
  }
  // 倒影按列绘制：列高 = 该列山高 × 0.6（柔和压缩）
  for (let px = 0; px < w; px += 4) {
    const colH = Math.floor(backH[Math.floor(px / 4)] * 0.6);
    if (colH <= 0) continue;
    // 水波横向偏移 ±2px（按 py 调制，但这里仅整体绘制，使用 px 行号产生水平 sin 偏移）
    for (let py = 0; py < colH && py < reflMaxH; py++) {
      const wave = Math.floor(Math.sin(py / 4 + px * 0.01) * 2);
      c.fillRect(px + wave, reflTop + py, 4, 1);
    }
  }

  // —— 前山倒影（覆盖后山，深一档）——
  c.fillStyle = reflFrontColor;
  const peaksF = Math.max(1, Math.floor((w / (3 * 14)) * 0.7));
  const rngF = _seededRand(53);
  const frontH = new Float32Array(Math.ceil(w / 3) + 1);
  for (let i = 0; i < frontH.length; i++) {
    const nx = (i * 3) / w;
    frontH[i] = _mountainHeightAt(nx, peaksF, mtMaxH * 0.85, rngF);
  }
  for (let px = 0; px < w; px += 3) {
    const colH = Math.floor(frontH[Math.floor(px / 3)] * 0.55);
    if (colH <= 0) continue;
    for (let py = 0; py < colH && py < reflMaxH; py++) {
      const wave = Math.floor(Math.sin(py / 4 + 0.7 + px * 0.01) * 2);
      c.fillRect(px + wave, reflTop + py, 3, 1);
    }
  }

  // —— 像素气泡（4×4 小圆，仅画面底部 1/4 区，避免与倒影重叠）——
  c.fillStyle = '#C0E5F0';
  const rngBub = _seededRand(457);
  const bubbleZoneY = lakeY + Math.floor(lakeH * 0.75);
  const bubbleZoneH = lakeH - Math.floor(lakeH * 0.75);
  const bubbleCount = 6;
  for (let i = 0; i < bubbleCount; i++) {
    const bx = Math.floor(rngBub() * (w - 8)) + 4;
    const by = bubbleZoneY + Math.floor(rngBub() * Math.max(1, bubbleZoneH - 4));
    c.fillStyle = '#C0E5F0';
    c.fillRect(bx, by, 4, 1);
    c.fillRect(bx - 1, by + 1, 6, 2);
    c.fillRect(bx, by + 3, 4, 1);
    c.fillStyle = '#FFFFFF';
    c.fillRect(bx + 1, by + 1, 1, 1);
  }

  // ═══════════════════════════════════════
  // 层 5：横向晨光反光带（水岸线下方 20~80px 区，2-3 条 #FFE5B0 透明 25%）
  // ═══════════════════════════════════════
  const bandRangeTop = 20;
  const bandRangeBottom = 80;
  const rngBand = _seededRand(919);
  let by = bandRangeTop;
  let bandCount = 0;
  while (by < bandRangeBottom && bandCount < 3) {
    const fadeT = 1 - (by - bandRangeTop) / (bandRangeBottom - bandRangeTop);
    const alpha = 0.25 * fadeT + 0.10;
    const bandH2 = 1 + Math.floor(rngBand() * 2); // 1~2px
    const bandW = Math.floor(w * (0.50 + rngBand() * 0.30));
    const bandX = Math.floor(w * (0.15 + rngBand() * 0.20));
    c.fillStyle = `rgba(255, 229, 176, ${alpha.toFixed(3)})`;
    c.fillRect(bandX, lakeY + by, bandW, bandH2);
    by += bandH2 + 14 + Math.floor(rngBand() * 10); // 间隔 14-24px（避免太密）
    bandCount++;
  }

  // ═══════════════════════════════════════
  // 层 6：水陆交界浅滩过渡带（水面顶端 4-6px，浅青绿 #C8E0D8 + 白色波纹）
  // ═══════════════════════════════════════
  const shoalH = 5;
  c.fillStyle = 'rgba(200, 224, 216, 0.85)'; // #C8E0D8 半透明
  c.fillRect(0, lakeY, w, shoalH);
  // 浅滩内的小波纹（白色透明，2-3 像素）
  c.fillStyle = 'rgba(255,255,255,0.35)';
  const rngShoal = _seededRand(641);
  for (let i = 0; i < 60; i++) {
    const wx = Math.floor(rngShoal() * w);
    const wy = lakeY + Math.floor(rngShoal() * shoalH);
    c.fillRect(wx, wy, 2, 1);
  }
  // 浅滩与水面之间的 1px 高光线（柔和过渡）
  c.fillStyle = 'rgba(255, 248, 224, 0.40)';
  c.fillRect(0, lakeY + shoalH, w, 1);

  return oc;
}

export function drawFishingBg(ctx, w, h) {
  if (!_cache || _cacheW !== w || _cacheH !== h) {
    _cache = _buildCache(w, h);
    _cacheW = w;
    _cacheH = h;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_cache, 0, 0);
}
