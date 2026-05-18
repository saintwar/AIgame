// Phase C/D 湖面倒影渲染（四阶段昼夜适配）

import { getDayNightPhase, getDayNightPhaseName, getDarkness } from './day-night.js';
import { PALETTE } from './palette.js';

export function drawLakeReflections(ctx, time) {
  const lakeTop = 576;
  const phase = getDayNightPhase(time);
  const name = getDayNightPhaseName(phase);

  ctx.save();

  // ── 远山倒影 ──
  let mountainColor, mountainAlpha;
  switch (name) {
    case 'day':
      mountainColor = '#4A7A4A'; mountainAlpha = 0.15;
      break;
    case 'dawn':
      mountainColor = '#5A4A6A'; mountainAlpha = 0.15;
      break;
    case 'night':
      mountainColor = '#1A1840'; mountainAlpha = 0.2;
      break;
    case 'dusk':
    default:
      mountainColor = '#5A4D7A'; mountainAlpha = 0.2;
      break;
  }
  ctx.globalAlpha = mountainAlpha;
  ctx.fillStyle = mountainColor;
  ctx.beginPath();
  ctx.moveTo(0, lakeTop);
  ctx.lineTo(0, lakeTop + 30);
  ctx.lineTo(1280, lakeTop + 25);
  ctx.lineTo(1280, lakeTop);
  ctx.closePath();
  ctx.fill();

  // ── 栈桥倒影 ──
  ctx.globalAlpha = name === 'night' ? 0.2 : 0.4;
  const dockX = 9 * 64;
  for (let i = 0; i < 24; i++) {
    const wave = Math.sin((time / 600) + i * 0.3) * 1.5;
    ctx.fillStyle = '#5C4A3A';
    ctx.fillRect(dockX + i * 8 + wave, lakeTop, 6, 12);
  }

  // ── 水面光影条带 ──
  ctx.globalAlpha = 1;

  if (name === 'dusk') {
    // 黄昏暖光横向倒影（夕阳在水中拉长）
    const sunReflectX = 1050;
    const stripWidth = 200;
    for (let y = lakeTop; y < lakeTop + 100; y += 3) {
      const offset = Math.sin((y * 0.1) + (time / 800)) * 8;
      const alpha = (1 - (y - lakeTop) / 100) * 0.4;
      ctx.fillStyle = `rgba(255, 165, 100, ${alpha})`;
      ctx.fillRect(sunReflectX - stripWidth / 2 + offset, y, stripWidth, 1);
    }
  } else if (name === 'dawn') {
    // 黎明暖粉倒影（朝阳水中拉长）
    const sunReflectX = 200;
    const stripWidth = 160;
    for (let y = lakeTop; y < lakeTop + 80; y += 3) {
      const offset = Math.sin((y * 0.1) + (time / 800)) * 6;
      const alpha = (1 - (y - lakeTop) / 80) * 0.35;
      ctx.fillStyle = `rgba(255, 180, 140, ${alpha})`;
      ctx.fillRect(sunReflectX - stripWidth / 2 + offset, y, stripWidth, 1);
    }
  } else if (name === 'day') {
    // 白天白色高光条带
    const reflectX = 900;  // 太阳位置
    const stripWidth = 120;
    for (let y = lakeTop; y < lakeTop + 60; y += 3) {
      const offset = Math.sin((y * 0.12) + (time / 700)) * 4;
      const alpha = (1 - (y - lakeTop) / 60) * 0.25;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(reflectX - stripWidth / 2 + offset, y, stripWidth, 1);
    }
  } else {
    // 夜晚月光倒影
    const moonReflectX = 180;
    const stripWidth = 80;
    for (let y = lakeTop; y < lakeTop + 80; y += 3) {
      const offset = Math.sin((y * 0.1) + (time / 900)) * 4;
      const alpha = (1 - (y - lakeTop) / 80) * 0.2;
      ctx.fillStyle = `rgba(200, 200, 180, ${alpha})`;
      ctx.fillRect(moonReflectX - stripWidth / 2 + offset, y, stripWidth, 1);
    }
  }

  ctx.restore();
}
