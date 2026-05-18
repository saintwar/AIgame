// Phase A/D 黄昏氛围 + 四阶段昼夜渲染模块

import { PALETTE } from './palette.js';
import { getDayNightPhase, getDayNightPhaseName, getDarkness } from './day-night.js';

// ============================================================
// 辅助：根据阶段获取对应配色
// ============================================================
function _getMountainColors(phase) {
  const name = getDayNightPhaseName(phase);
  switch (name) {
    case 'dawn':
      return [PALETTE.DAWN_MOUNTAIN_FAR, PALETTE.DAWN_MOUNTAIN_MID, PALETTE.DAWN_MOUNTAIN_NEAR];
    case 'day':
      return [PALETTE.DAY_MOUNTAIN_FAR, PALETTE.DAY_MOUNTAIN_MID, PALETTE.DAY_MOUNTAIN_NEAR];
    case 'dusk':
      return [PALETTE.MOUNTAIN_FAR, PALETTE.MOUNTAIN_MID, PALETTE.MOUNTAIN_NEAR];
    case 'night':
      return [PALETTE.NIGHT_MOUNTAIN_FAR, PALETTE.NIGHT_MOUNTAIN_MID, PALETTE.NIGHT_MOUNTAIN_NEAR];
    default:
      return [PALETTE.MOUNTAIN_FAR, PALETTE.MOUNTAIN_MID, PALETTE.MOUNTAIN_NEAR];
  }
}

function _getShadowColor(phase) {
  const name = getDayNightPhaseName(phase);
  switch (name) {
    case 'dawn':  return PALETTE.DAWN_SHADOW;
    case 'day':   return PALETTE.DAY_SHADOW;
    case 'dusk':  return PALETTE.SHADOW;
    case 'night': return PALETTE.NIGHT_SHADOW;
    default:      return PALETTE.SHADOW;
  }
}

function _getGoldRimColor(phase) {
  const name = getDayNightPhaseName(phase);
  switch (name) {
    case 'dawn':  return PALETTE.DAWN_GOLD_RIM;
    case 'day':   return PALETTE.DAY_GOLD_RIM;
    case 'dusk':  return PALETTE.GOLD_RIM;
    case 'night': return PALETTE.NIGHT_GOLD_RIM;
    default:      return PALETTE.GOLD_RIM;
  }
}

// ========== 1. 黄昏天空渐变（静态版，仅用于开场淡入） ==========
export function drawDuskSky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0,   PALETTE.SKY_TOP);
  g.addColorStop(0.5, PALETTE.SKY_MID);
  g.addColorStop(1,   PALETTE.SKY_HORIZON);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 360);
  // 夕阳
  ctx.fillStyle = PALETTE.SUN;
  ctx.beginPath();
  ctx.arc(1050, 280, 40, 0, Math.PI * 2);
  ctx.fill();
  // 夕阳光晕
  const halo = ctx.createRadialGradient(1050, 280, 40, 1050, 280, 100);
  halo.addColorStop(0, 'rgba(255,123,71,0.4)');
  halo.addColorStop(1, 'rgba(255,123,71,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(900, 180, 300, 200);
}

// ========== 2. 草地噪点 tile（offscreen 缓存）==========
let _grassTileCache = null;
export function getGrassTile() {
  if (_grassTileCache) return _grassTileCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = PALETTE.GRASS;
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = PALETTE.GRASS_DARK;
  const seed = [[8,12],[24,8],[40,20],[52,32],[12,44],[28,56],[44,48],[56,16],[20,28],[36,40]];
  seed.forEach(([sx, sy]) => x.fillRect(sx, sy, 1, 2));
  x.fillStyle = PALETTE.GRASS_LIGHT;
  [[16, 24], [40, 12], [48, 52], [8, 36]].forEach(([sx, sy]) => x.fillRect(sx, sy, 1, 1));
  _grassTileCache = c;
  return c;
}

// ========== 3. 湖面横向波纹条带（动态化：白天偏蓝，黄昏偏暖） ==========
export function drawLakeWaves(ctx, time) {
  const phase = getDayNightPhase(time);
  const name = getDayNightPhaseName(phase);

  // 基础波纹颜色
  let waveR = 122, waveG = 184, waveB = 196;
  if (name === 'day') {
    waveR = 140; waveG = 200; waveB = 220;  // 白天偏亮蓝
  } else if (name === 'night') {
    waveR = 60; waveG = 80; waveB = 120;    // 夜晚偏暗蓝
  }

  const animPhase = (time / 1000) % 4;
  for (let y = 576; y < 720; y += 4) {
    const offset = Math.sin((y * 0.05) + animPhase) * 2;
    const alpha = ((y - 576) / 144) * 0.3 + 0.1;
    ctx.fillStyle = `rgba(${waveR}, ${waveG}, ${waveB}, ${alpha})`;
    ctx.fillRect(offset, y, 1280, 2);
  }

  // 高光点：黄昏暖光 / 白天白光 / 夜晚冷光
  let hlR = 255, hlG = 228, hlB = 181, hlAlpha = 0.7;
  if (name === 'day') {
    hlR = 255; hlG = 255; hlB = 255; hlAlpha = 0.5;
  } else if (name === 'night') {
    hlR = 150; hlG = 160; hlB = 200; hlAlpha = 0.3;
  } else if (name === 'dawn') {
    hlR = 255; hlG = 210; hlB = 180; hlAlpha = 0.5;
  }
  ctx.fillStyle = `rgba(${hlR}, ${hlG}, ${hlB}, ${hlAlpha})`;
  for (let i = 0; i < 8; i++) {
    const hx = (i * 160 + (time / 30) % 160) % 1280;
    const hy = 600 + (i % 3) * 30;
    ctx.fillRect(hx, hy, 2, 1);
  }
}

// ========== 4. 建筑投影（动态化：白天短直，黄昏/夜晚长斜） ==========
export function drawBuildingShadow(ctx, x, y, w, h) {
  const phase = getDayNightPhase(performance.now());
  const name = getDayNightPhaseName(phase);

  ctx.fillStyle = _getShadowColor(phase);

  // 投影方向和长度：白天→短直下方，黄昏→45°斜向左下，夜晚→更长更淡
  let skewX, extendY;
  switch (name) {
    case 'day':
      skewX = 0; extendY = 0.2;
      break;
    case 'dawn':
      skewX = h * 0.2; extendY = 0.3;  // 朝阳从左→投影偏右
      break;
    case 'dusk':
      skewX = -h * 0.5; extendY = 0.4;  // 夕阳从右→投影偏左
      break;
    case 'night':
      skewX = -h * 0.3; extendY = 0.3;  // 月光微投影
      break;
    default:
      skewX = -h * 0.5; extendY = 0.4;
  }

  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + skewX, y + h + h * extendY);
  ctx.lineTo(x + w + skewX, y + h + h * extendY);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

// ========== 5. 建筑侧光描边（动态化：黄昏描金，白天白光，夜晚微暖光） ==========
export function drawGoldRim(ctx, x, y, w, h) {
  const phase = getDayNightPhase(performance.now());
  const rimColor = _getGoldRimColor(phase);

  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
  // 顶部一点点也描
  ctx.beginPath();
  ctx.moveTo(x + w * 0.7, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

// ========== 6. 窗户暖光（夜晚/黄昏亮，白天不亮） ==========
export function drawWindowLight(ctx, x, y) {
  const phase = getDayNightPhase(performance.now());
  const name = getDayNightPhaseName(phase);

  // 白天不画窗光
  if (name === 'day') return;

  const darkness = getDarkness(phase);
  const brightness = darkness > 0.15 ? 0.5 + darkness * 0.5 : 0;

  if (brightness <= 0) return;

  // 主光源
  ctx.fillStyle = `rgba(255, 215, 0, ${0.85 * brightness})`;
  ctx.fillRect(x, y, 6, 6);
  // 光晕
  const glow = ctx.createRadialGradient(x + 3, y + 3, 0, x + 3, y + 3, 12);
  glow.addColorStop(0, `rgba(255, 215, 0, ${0.5 * brightness})`);
  glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 9, y - 9, 24, 24);
}

// ========== 7. 全局黄昏滤镜（保留兼容，现由 drawDynamicOverlay 替代） ==========
export function drawDuskOverlay(ctx) {
  ctx.fillStyle = PALETTE.DUSK_FILTER;
  ctx.fillRect(0, 0, 1280, 720);
}

// ========== 8. 栈桥木纹 ==========
export function drawWoodenDock(ctx, dockX = 9 * 64, dockY = 8 * 64) {
  const w = 192, h = 64;
  ctx.fillStyle = PALETTE.WOOD_PLANK;
  ctx.fillRect(dockX, dockY, w, h);
  for (let i = 0; i < 24; i++) {
    const px = dockX + i * 8;
    ctx.fillStyle = PALETTE.WOOD_GRAIN;
    ctx.fillRect(px + 3, dockY + 4, 1, h - 8);
    ctx.fillStyle = '#2B1810';
    ctx.fillRect(px + 7, dockY, 1, h);
    ctx.fillStyle = PALETTE.WOOD_NAIL;
    ctx.fillRect(px + 2, dockY + 4, 1, 1);
    ctx.fillRect(px + 2, dockY + h - 6, 1, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(dockX, dockY + h, w, 4);
}

// ========== 9. 钓点 3 层脉冲 ==========
export function drawFishingRipple(ctx, cx = 10 * 64 + 32, cy = 9 * 64 + 32, time) {
  const phase = getDayNightPhase(time);
  const name = getDayNightPhaseName(phase);

  // 脉冲颜色随时段变化
  let rippleR = 255, rippleG = 212, rippleB = 168;
  if (name === 'day') { rippleR = 255; rippleG = 255; rippleB = 255; }
  else if (name === 'night') { rippleR = 150; rippleG = 180; rippleB = 220; }

  const animPhase = (time % 1200) / 1200;
  for (let layer = 0; layer < 3; layer++) {
    const offset = (animPhase + layer / 3) % 1;
    const r = 8 + offset * 24;
    const a = (1 - offset) * 0.6;
    ctx.strokeStyle = `rgba(${rippleR}, ${rippleG}, ${rippleB}, ${a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 鱼影闪现（每 3 秒）
  const fishCycle = (time % 3000) / 3000;
  if (fishCycle < 0.16) {
    const fishAlpha = Math.sin(fishCycle * Math.PI / 0.16) * 0.6;
    ctx.fillStyle = `rgba(0, 0, 0, ${fishAlpha})`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.sin(time / 200) * 4, cy, 6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ========== 10. 中央广场喷泉水花 ==========
export function drawFountain(ctx, fx = 544, fy = 160, time) {
  ctx.fillStyle = PALETTE.WATER_LIGHT;
  ctx.beginPath();
  ctx.arc(fx, fy, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#B8E0E8';
  ctx.beginPath();
  ctx.arc(fx, fy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.STONE;
  ctx.fillRect(fx - 3, fy - 8, 6, 16);

  for (let i = 0; i < 8; i++) {
    const lifeMs = 800;
    const t = ((time + i * 100) % lifeMs) / lifeMs;
    const angle = (i / 8) * Math.PI * 2;
    const speed = 16;
    const px = fx + Math.cos(angle) * speed * t * 1.5;
    const py = fy - 8 - speed * t * 2 + speed * t * t * 3;
    const alpha = (1 - t) * 0.9;
    ctx.fillStyle = `rgba(200,230,240,${alpha})`;
    ctx.fillRect(px, py, 2, 2);
  }

  if ((time / 200 | 0) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(fx - 8, fy + 4, 1, 1);
    ctx.fillRect(fx + 6, fy - 6, 1, 1);
  }
}

// ========== 11. 远山剪影（动态化：白天绿色，黄昏紫色，夜晚深紫） ==========
export function drawDistantMountains(ctx) {
  const phase = getDayNightPhase(performance.now());
  const colors = _getMountainColors(phase);
  const name = getDayNightPhaseName(phase);

  // 白天山体更不透明（清晰），夜晚更透明（模糊感）
  const alphas = name === 'day' ? [0.5, 0.7, 0.85] :
                 name === 'night' ? [0.3, 0.4, 0.5] :
                 [0.4, 0.6, 0.8];  // 黎明/黄昏

  const farPeaks = [[0, 300], [200, 260], [400, 280], [600, 250], [800, 275], [1000, 245], [1280, 290]];
  const midPeaks = [[0, 320], [150, 290], [350, 310], [550, 280], [750, 305], [950, 275], [1150, 300], [1280, 320]];
  const nearPeaks = [[0, 330], [100, 310], [280, 325], [480, 300], [680, 318], [880, 295], [1080, 315], [1280, 335]];

  // 远山（最浅）
  ctx.fillStyle = colors[0];
  ctx.globalAlpha = alphas[0];
  ctx.beginPath();
  ctx.moveTo(0, 320);
  _drawPeaks(ctx, farPeaks);
  ctx.lineTo(1280, 360);
  ctx.lineTo(0, 360);
  ctx.closePath();
  ctx.fill();

  // 中山
  ctx.fillStyle = colors[1];
  ctx.globalAlpha = alphas[1];
  ctx.beginPath();
  ctx.moveTo(0, 340);
  _drawPeaks(ctx, midPeaks);
  ctx.lineTo(1280, 360);
  ctx.lineTo(0, 360);
  ctx.closePath();
  ctx.fill();

  // 近山
  ctx.fillStyle = colors[2];
  ctx.globalAlpha = alphas[2];
  ctx.beginPath();
  ctx.moveTo(0, 355);
  _drawPeaks(ctx, nearPeaks);
  ctx.lineTo(1280, 360);
  ctx.lineTo(0, 360);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
}

// 山峰曲线辅助
function _drawPeaks(ctx, peaks) {
  peaks.forEach((p, i) => {
    if (i === 0) {
      ctx.lineTo(p[0], p[1]);
    } else {
      const prev = peaks[i - 1];
      const cp = Math.min(prev[1], p[1]) - 10;
      ctx.quadraticCurveTo((prev[0] + p[0]) / 2, cp, p[0], p[1]);
    }
  });
}
