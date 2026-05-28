// Phase B 4 座建筑差异化绘制（四阶段昼夜适配）

import { PALETTE } from './palette.js';
import { getDayNightPhase, getDayNightPhaseName, getDarkness } from './day-night.js';

// ============================================================
// 辅助函数：田字格木窗
// ============================================================
export function drawGridWindow(ctx, x, y) {
  const w = 24, h = 16;

  // 木框
  ctx.fillStyle = PALETTE.WOOD_DARK;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

  // 玻璃（深蓝）
  ctx.fillStyle = PALETTE.WATER_DEEP;
  ctx.fillRect(x, y, w, h);

  // 玻璃反光（左上角）
  ctx.fillStyle = 'rgba(200,230,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
  ctx.fill();

  // 十字格
  ctx.strokeStyle = PALETTE.WOOD_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
}

// ============================================================
// 辅助函数：红灯笼
// ============================================================
export function drawLantern(ctx, x, y) {
  // 挂绳（金色）
  ctx.strokeStyle = '#C8A850';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 4);
  ctx.stroke();

  // 灯笼体（椭圆）
  ctx.fillStyle = PALETTE.LANTERN_RED;
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 灯笼高光
  ctx.fillStyle = 'rgba(255,100,100,0.5)';
  ctx.beginPath();
  ctx.ellipse(x - 2, y + 8, 2, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 内发光
  const glowGrad = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 8);
  glowGrad.addColorStop(0, 'rgba(255,200,100,0.6)');
  glowGrad.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x, y + 10, 8, 0, Math.PI * 2);
  ctx.fill();

  // 流苏
  ctx.strokeStyle = '#C8A850';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 18);
  ctx.lineTo(x - 2, y + 22);
  ctx.moveTo(x, y + 18);
  ctx.lineTo(x, y + 24);
  ctx.moveTo(x + 2, y + 18);
  ctx.lineTo(x + 2, y + 22);
  ctx.stroke();
}

// ============================================================
// 建筑 1：村长家 — 威严传统
// ============================================================
export function drawChiefHouse(ctx, x, y) {
  const P = PALETTE;

  // ===== 双坡红瓦顶 =====
  // 主体屋顶（左坡）
  ctx.fillStyle = P.ROOF_RED;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 20);
  ctx.lineTo(x + 64, y - 16);
  ctx.lineTo(x + 136, y + 20);
  ctx.lineTo(x + 132, y + 28);
  ctx.lineTo(x + 64, y - 4);
  ctx.lineTo(x - 4, y + 28);
  ctx.closePath();
  ctx.fill();

  // 暗面（右侧）
  ctx.fillStyle = '#7A2A2A';
  ctx.beginPath();
  ctx.moveTo(x + 64, y - 16);
  ctx.lineTo(x + 136, y + 20);
  ctx.lineTo(x + 132, y + 28);
  ctx.lineTo(x + 64, y - 4);
  ctx.closePath();
  ctx.fill();

  // 瓦片横纹理（4 道）
  ctx.strokeStyle = 'rgba(90,30,30,0.4)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const ty = y - 10 + i * 10;
    ctx.beginPath();
    ctx.moveTo(x + 8 + i * 8, ty);
    ctx.lineTo(x + 120 - i * 8, ty);
    ctx.stroke();
  }

  // ===== 屋脊兽（3 个） =====
  ctx.fillStyle = '#5C3A1A';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + 32 + i * 24, y - 20, 4, 8);
  }

  // ===== 墙体（米白） =====
  ctx.fillStyle = P.WALL_CREAM;
  ctx.fillRect(x + 4, y + 28, 120, 72);

  // 墙体木板纹理
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 36 + i * 12);
    ctx.lineTo(x + 124, y + 36 + i * 12);
    ctx.stroke();
  }

  // ===== 木框架立柱 =====
  ctx.fillStyle = P.WOOD_DARK;
  ctx.fillRect(x + 4, y + 28, 6, 72);    // 左立柱
  ctx.fillRect(x + 110, y + 28, 6, 72);  // 右立柱
  ctx.fillRect(x + 56, y + 28, 4, 72);   // 中左立柱
  ctx.fillRect(x + 62, y + 28, 4, 72);   // 中右立柱
  ctx.fillRect(x + 4, y + 28, 120, 4);   // 上横梁
  ctx.fillRect(x + 4, y + 96, 120, 4);   // 下横梁

  // ===== 田字格木窗 ×2 =====
  drawGridWindow(ctx, x + 16, y + 36);
  drawGridWindow(ctx, x + 80, y + 36);

  // ===== 大门（24×32） =====
  const doorX = x + 52, doorY = y + 64;
  // 门框
  ctx.fillStyle = '#5C3A1A';
  ctx.fillRect(doorX - 2, doorY - 2, 28, 36);
  // 门板
  ctx.fillStyle = '#3D2B1F';
  ctx.fillRect(doorX, doorY, 24, 32);
  // 门板中线
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(doorX + 12, doorY + 4);
  ctx.lineTo(doorX + 12, doorY + 28);
  ctx.stroke();
  // 门钉（2 颗金色）
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(doorX + 8, doorY + 10, 3, 3);
  ctx.fillRect(doorX + 8, doorY + 20, 3, 3);

  // ===== "村"字红匾 =====
  ctx.fillStyle = '#8B2A2A';
  ctx.fillRect(x + 40, y + 30, 40, 12);
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 10px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('村', x + 60, y + 36);

  // ===== 门口红灯笼一对 =====
  drawLantern(ctx, x + 36, y + 52);
  drawLantern(ctx, x + 92, y + 52);
}

// ============================================================
// 建筑 2：钓具店 — 粗犷渔家
// ============================================================
export function drawFishingShop(ctx, x, y) {
  const P = PALETTE;

  // ===== 单坡铁皮顶 =====
  ctx.fillStyle = P.ROOF_METAL;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 16);
  ctx.lineTo(x + 132, y - 8);
  ctx.lineTo(x + 136, y + 4);
  ctx.lineTo(x, y + 28);
  ctx.closePath();
  ctx.fill();

  // 波纹竖线（5 道）
  ctx.strokeStyle = 'rgba(80,90,100,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const sx = x + 10 + i * 24;
    ctx.beginPath();
    ctx.moveTo(sx, y + 18);
    ctx.lineTo(sx + 8, y - 4);
    ctx.stroke();
  }

  // ===== 横纹木板墙 =====
  ctx.fillStyle = P.WOOD_PLANK;
  ctx.fillRect(x + 4, y + 28, 120, 72);

  // 木板横线（5 道）
  ctx.strokeStyle = P.WOOD_GRAIN;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 40 + i * 12);
    ctx.lineTo(x + 118, y + 40 + i * 12);
    ctx.stroke();
  }

  // 木框
  ctx.fillStyle = P.WOOD_DARK;
  ctx.fillRect(x + 4, y + 28, 6, 72);
  ctx.fillRect(x + 110, y + 28, 6, 72);
  ctx.fillRect(x + 4, y + 28, 120, 4);

  // ===== 鱼形木招牌 =====
  ctx.fillStyle = '#5C3A1A';
  ctx.fillRect(x + 30, y + 18, 60, 20);
  ctx.font = 'bold 12px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
  ctx.fillStyle = '#F4E4C1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐟钓具', x + 60, y + 30);

  // ===== 门口挂渔网 =====
  ctx.strokeStyle = 'rgba(168,152,112,0.5)';
  ctx.lineWidth = 0.5;
  // 菱形网格 5×4
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const nx = x + 8 + col * 12;
      const ny = y + 36 + row * 10;
      // 菱形
      ctx.beginPath();
      ctx.moveTo(nx, ny + 5);
      ctx.lineTo(nx + 6, ny);
      ctx.lineTo(nx + 12, ny + 5);
      ctx.lineTo(nx + 6, ny + 10);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // ===== 大门（28×36） =====
  const doorX = x + 50, doorY = y + 64;
  ctx.fillStyle = '#5C3A1A';
  ctx.fillRect(doorX - 2, doorY - 2, 32, 40);
  ctx.fillStyle = '#3D2B1F';
  ctx.fillRect(doorX, doorY, 28, 36);
  // 门把手
  ctx.fillStyle = '#888';
  ctx.beginPath();
  ctx.arc(doorX + 22, doorY + 18, 2, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
// 建筑 3：阿明家 — 温馨小巧
// ============================================================
export function drawAmingHome(ctx, x, y, time) {
  const P = PALETTE;

  // ===== 小红瓦坡顶 =====
  ctx.fillStyle = '#A83C3C';
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 22);
  ctx.lineTo(x + 64, y - 8);
  ctx.lineTo(x + 132, y + 22);
  ctx.lineTo(x + 128, y + 30);
  ctx.lineTo(x + 64, y);
  ctx.lineTo(x, y + 30);
  ctx.closePath();
  ctx.fill();

  // 瓦片纹理
  ctx.strokeStyle = 'rgba(80,30,30,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 8 + i * 6, y + 8 + i * 8);
    ctx.lineTo(x + 120 - i * 6, y + 8 + i * 8);
    ctx.stroke();
  }

  // ===== 烟囱 =====
  ctx.fillStyle = '#A89478';
  ctx.fillRect(x + 100, y - 8, 12, 20);
  ctx.fillStyle = '#8A7A68';
  ctx.fillRect(x + 98, y - 12, 16, 6);

  // ===== 烟雾粒子（3 个圆向上飘动） =====
  drawAmingHomeSmoke(ctx, x, y, time);

  // ===== 米白墙体 =====
  ctx.fillStyle = '#F4E4C1';
  ctx.fillRect(x + 4, y + 30, 120, 70);

  // 木框
  ctx.fillStyle = P.WOOD_DARK;
  ctx.fillRect(x + 4, y + 30, 6, 70);
  ctx.fillRect(x + 110, y + 30, 6, 70);
  ctx.fillRect(x + 4, y + 30, 120, 4);

  // ===== 窗户 + 木质窗台 + 小花盆 =====
  drawGridWindow(ctx, x + 16, y + 38);

  // 木质窗台
  ctx.fillStyle = '#8B6F47';
  ctx.fillRect(x + 12, y + 54, 32, 4);

  // 小花盆
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x + 14, y + 58, 10, 6);
  ctx.fillStyle = '#4A7C3F';
  ctx.fillRect(x + 15, y + 54, 3, 5);
  ctx.fillRect(x + 20, y + 52, 3, 7);
  // 粉色小花
  ctx.fillStyle = '#FFB6C1';
  ctx.fillRect(x + 16, y + 51, 2, 2);

  // ===== 二楼圆形阁楼窗（亮黄光） =====
  ctx.fillStyle = '#3D2B1F';
  ctx.beginPath();
  ctx.arc(x + 60, y + 44, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFE4B5';
  ctx.beginPath();
  ctx.arc(x + 60, y + 44, 8, 0, Math.PI * 2);
  ctx.fill();
  // 圆形窗格
  ctx.strokeStyle = '#3D2B1F';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + 60, y + 44, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 52, y + 44);
  ctx.lineTo(x + 68, y + 44);
  ctx.stroke();

  // ===== 微敞大门（内透暖光，夜晚/黄昏更亮） =====
  const doorX = x + 52, doorY = y + 62;
  ctx.fillStyle = '#3D2B1F';
  ctx.fillRect(doorX, doorY, 20, 30);
  // 门缝内透暖光（夜晚更亮）
  const darkness = getDarkness(getDayNightPhase(performance.now()));
  const doorLightAlpha = darkness > 0.15 ? 0.4 + darkness * 0.5 : 0.15;
  ctx.fillStyle = `rgba(255,200,100,${doorLightAlpha})`;
  ctx.fillRect(doorX + 2, doorY + 2, 2, 26);
  // 门把手
  ctx.fillStyle = '#C8A850';
  ctx.beginPath();
  ctx.arc(doorX + 16, doorY + 15, 2, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------
// 阿明家烟囱烟雾粒子（独立导出，供美术化后叠加调用）
// 锚点：烟囱口位于 (x+106, y-12)（与程序化版屋顶烟囱出口对齐；
// 美术 PNG 烟囱口约在 (x+99, y-13)，7px 偏差视觉容差内可复用）
// ------------------------------------------------------------
export function drawAmingHomeSmoke(ctx, x, y, time) {
  const t = time / 100;
  for (let i = 0; i < 3; i++) {
    const phase = (t + i * 10) % 30;
    const sx = x + 106 + Math.sin(t / 5 + i) * 4;
    const sy = y - 12 - phase * 0.8;
    const alpha = Math.max(0, 1 - phase / 30);
    const size = 3 + i * 1.5;

    ctx.fillStyle = `rgba(200,190,180,${alpha * 0.5})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// 建筑 4：7-12 — 现代跳脱
// ============================================================
export function draw711Store(ctx, x, y, time) {
  const P = PALETTE;

  // ===== 白色平顶 + 灰色屋檐 =====
  ctx.fillStyle = '#E8E8E8';
  ctx.fillRect(x - 2, y + 18, 132, 12);
  ctx.fillStyle = '#888';
  ctx.fillRect(x - 2, y + 30, 132, 4);

  // ===== 红/白/绿三色横条招牌 =====
  const stripeH = 6;
  ctx.fillStyle = '#C8302C';
  ctx.fillRect(x + 4, y + 20, 120, stripeH);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x + 4, y + 20 + stripeH, 120, stripeH);
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(x + 4, y + 20 + stripeH * 2, 120, stripeH);

  // ===== "7" "11" Logo（带闪烁 + 描边） =====
  const flashAlpha = 0.7 + 0.3 * Math.sin(time / 300);
  ctx.font = 'bold 16px "TencentSansW7","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 7 — 橙色字 + 深棕描边
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3D2B1F';
  ctx.strokeText('7', x + 40, y + 27);
  ctx.fillStyle = `rgba(255,140,0,${flashAlpha})`;
  ctx.fillText('7', x + 40, y + 27);

  // 11 — 绿色字 + 深棕描边
  ctx.strokeText('11', x + 84, y + 27);
  ctx.fillStyle = `rgba(76,175,80,${flashAlpha})`;
  ctx.fillText('11', x + 84, y + 27);

  // ===== 白色墙体 =====
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(x + 4, y + 34, 120, 66);

  // ===== 玻璃幕墙（4 列 2 行） =====
  const glassW = 22, glassH = 18;
  ctx.fillStyle = P.GLASS_BLUE;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const gx = x + 12 + col * 26;
      const gy = y + 40 + row * 22;
      ctx.fillRect(gx, gy, glassW, glassH);
    }
  }

  // 玻璃框线
  ctx.strokeStyle = '#AAA';
  ctx.lineWidth = 1;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const gx = x + 12 + col * 26;
      const gy = y + 40 + row * 22;
      ctx.strokeRect(gx, gy, glassW, glassH);
    }
  }

  // 玻璃反光（白天白光反射，黄昏暖光反射）
  const bldgPhase = getDayNightPhase(performance.now());
  const bldgName = getDayNightPhaseName(bldgPhase);
  if (bldgName === 'dusk') {
    ctx.fillStyle = 'rgba(255,180,120,0.3)';
  } else if (bldgName === 'dawn') {
    ctx.fillStyle = 'rgba(255,200,160,0.2)';
  } else if (bldgName === 'day') {
    ctx.fillStyle = 'rgba(200,230,255,0.2)';
  } else {
    ctx.fillStyle = 'rgba(100,120,180,0.15)';
  }
  ctx.fillRect(x + 12, y + 40, glassW, glassH);

  // ===== 自动门（中间 24×40） =====
  ctx.fillStyle = '#888';
  ctx.fillRect(x + 50, y + 60, 28, 40);
  // 门缝（2px）
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 63, y + 60, 2, 40);
}