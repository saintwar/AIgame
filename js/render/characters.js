// Phase C 角色程序化精修绘制（32×48）

import { PALETTE } from './palette.js';
import { drawAmingFromSheet, isAmingSheetReady } from './aming-sprite.js';

// ============================================================
// 通用辅助函数
// ============================================================

// 像素描点（保持像素完美）
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w, h);
}

// 走路呼吸偏移：每 250ms 切换一帧，3 帧循环（用于 fallback 像素绘制）
function getWalkOffset(time, isMoving) {
  if (!isMoving) return { legY: 0, armX: 0 };
  const frame = Math.floor(time / 250) % 3;
  if (frame === 0) return { legY: -1, armX: 1 };   // 左脚前
  if (frame === 1) return { legY: 0, armX: 0 };    // 中性
  return { legY: 1, armX: -1 };                     // 右脚前
}

// ============================================================
// 角色 1：阿明 — 主角红帽少年
// PHASE-20：优先使用 amin-walk-sheet-v3.png（24帧雪碧图）
// 雪碧图未就绪时 fallback 到原像素绘制（与项目其它 NPC 同样的兜底惯例）
// ============================================================
export function drawAming(ctx, x, y, dir = 'down', time = 0, isMoving = false) {
  // 优先走雪碧图
  if (isAmingSheetReady()) {
    if (drawAmingFromSheet(ctx, x, y, dir, isMoving, time)) return;
  }

  // ---- Fallback：原 32×48 像素小人 ----
  const off = getWalkOffset(time, isMoving);

  // === 头部 16px (y:0-15) ===
  // 红帽
  px(ctx, x+8, y+0, 16, 4, PALETTE.HAT_AMING);
  px(ctx, x+6, y+4, 20, 2, PALETTE.HAT_AMING);
  // 帽檐高光（黄昏侧光）
  px(ctx, x+24, y+4, 2, 2, PALETTE.GOLD_RIM);
  // 黑发（帽下露一圈）
  px(ctx, x+8, y+6, 16, 2, PALETTE.HAIR_BLACK);
  // 脸
  px(ctx, x+10, y+8, 12, 7, PALETTE.SKIN_TONE);
  // 脸侧阴影
  px(ctx, x+10, y+8, 1, 7, PALETTE.SKIN_DARK);
  // 眼睛 + 嘴（朝向决定）
  if (dir === 'down') {
    px(ctx, x+12, y+11, 1, 1, PALETTE.HAIR_BLACK);
    px(ctx, x+19, y+11, 1, 1, PALETTE.HAIR_BLACK);
    px(ctx, x+15, y+13, 2, 1, '#8B4513');  // 嘴
  } else if (dir === 'up') {
    // 背朝玩家，看不到脸部细节
  } else {
    const ex = dir === 'left' ? 12 : 19;
    px(ctx, x+ex, y+11, 1, 1, PALETTE.HAIR_BLACK);
  }

  // === 身体 20px (y:16-35) 黄T ===
  px(ctx, x+8, y+16, 16, 14, PALETTE.CLOTH_AMING);
  // T恤阴影描边
  px(ctx, x+8, y+16, 1, 14, '#C8A876');
  // 短袖
  px(ctx, x+6 + off.armX, y+18, 4, 8, PALETTE.CLOTH_AMING);
  px(ctx, x+22 - off.armX, y+18, 4, 8, PALETTE.CLOTH_AMING);
  // 露出的手
  px(ctx, x+6 + off.armX, y+26, 4, 4, PALETTE.SKIN_TONE);
  px(ctx, x+22 - off.armX, y+26, 4, 4, PALETTE.SKIN_TONE);

  // 钓竿（背在身后，斜插）
  if (dir !== 'up') {
    ctx.strokeStyle = PALETTE.WOOD_GRAIN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x+24, y+14);
    ctx.lineTo(x+30, y+34);
    ctx.stroke();
    px(ctx, x+30, y+34, 1, 1, '#FFD700');  // 鱼线小坠
  }

  // === 腿 12px (y:36-47) 蓝裤 ===
  px(ctx, x+10, y+36 + off.legY, 5, 10, PALETTE.PANTS_AMING);
  px(ctx, x+17, y+36 - off.legY, 5, 10, PALETTE.PANTS_AMING);
  // 白鞋
  px(ctx, x+10, y+45 + off.legY, 5, 3, '#FFFFFF');
  px(ctx, x+17, y+45 - off.legY, 5, 3, '#FFFFFF');
}

// ============================================================
// 角色 2：秀兰阿姨
// ============================================================
export function drawXiulan(ctx, x, y, dir = 'down', time = 0) {
  // 头：盘发髻 + 发簪
  px(ctx, x+10, y+0, 12, 6, PALETTE.HAIR_BLACK);
  px(ctx, x+14, y-2, 4, 3, PALETTE.HAIR_BLACK);  // 发髻
  px(ctx, x+15, y-1, 1, 1, '#FFD700');           // 发簪
  // 脸
  px(ctx, x+10, y+6, 12, 9, PALETTE.SKIN_TONE);
  px(ctx, x+12, y+10, 1, 1, PALETTE.HAIR_BLACK);
  px(ctx, x+19, y+10, 1, 1, PALETTE.HAIR_BLACK);
  px(ctx, x+15, y+13, 2, 1, '#A04030');

  // 花布衫（粉红 + 碎花点）
  px(ctx, x+8, y+15, 16, 16, PALETTE.CLOTH_XIULAN);
  px(ctx, x+11, y+18, 1, 1, '#FFFFFF');
  px(ctx, x+18, y+20, 1, 1, '#FFFFFF');
  px(ctx, x+13, y+25, 1, 1, '#FFFFFF');
  px(ctx, x+20, y+27, 1, 1, '#FFFFFF');
  // 袖子
  px(ctx, x+5, y+18, 4, 10, PALETTE.CLOTH_XIULAN);
  px(ctx, x+23, y+18, 4, 10, PALETTE.CLOTH_XIULAN);
  // 手 + 竹篮
  px(ctx, x+5, y+28, 4, 3, PALETTE.SKIN_TONE);
  px(ctx, x+1, y+30, 8, 6, '#A89870');  // 竹篮
  px(ctx, x+2, y+31, 6, 1, '#5C4A3A');

  // 长裙（深色）
  px(ctx, x+9, y+31, 14, 14, '#3D2B1F');
  px(ctx, x+11, y+45, 4, 3, PALETTE.HAIR_BLACK);  // 鞋
  px(ctx, x+17, y+45, 4, 3, PALETTE.HAIR_BLACK);
}

// ============================================================
// 角色 3：村长阿土伯
// ============================================================
export function drawVillageChief(ctx, x, y, dir = 'down', time = 0) {
  // 斗笠
  px(ctx, x+6, y+4, 20, 2, PALETTE.HAT_VILLAGE);
  px(ctx, x+10, y+0, 12, 4, PALETTE.HAT_VILLAGE);
  px(ctx, x+11, y+1, 10, 1, '#A88A56');  // 斗笠暗纹
  // 白发
  px(ctx, x+10, y+6, 12, 2, PALETTE.HAIR_WHITE);
  // 脸
  px(ctx, x+10, y+8, 12, 7, PALETTE.SKIN_DARK);
  px(ctx, x+12, y+11, 1, 1, PALETTE.HAIR_BLACK);
  px(ctx, x+19, y+11, 1, 1, PALETTE.HAIR_BLACK);
  // 白胡子
  px(ctx, x+13, y+14, 6, 2, PALETTE.HAIR_WHITE);

  // 唐装（深褐）
  px(ctx, x+8, y+16, 16, 18, PALETTE.CLOTH_VILLAGE);
  // 中线（对襟）
  px(ctx, x+15, y+16, 2, 18, '#3D2B1F');
  // 盘扣
  px(ctx, x+15, y+20, 2, 1, '#FFD700');
  px(ctx, x+15, y+25, 2, 1, '#FFD700');
  px(ctx, x+15, y+30, 2, 1, '#FFD700');
  // 袖子
  px(ctx, x+5, y+18, 4, 12, PALETTE.CLOTH_VILLAGE);
  px(ctx, x+23, y+18, 4, 12, PALETTE.CLOTH_VILLAGE);
  // 手
  px(ctx, x+5, y+30, 4, 3, PALETTE.SKIN_DARK);

  // 拐杖（左手持）
  ctx.strokeStyle = '#6B4A2A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x+3, y+30);
  ctx.lineTo(x+3, y+47);
  ctx.stroke();
  px(ctx, x+2, y+30, 3, 2, '#3D2B1F');  // 拐杖头

  // 黑布鞋裤
  px(ctx, x+10, y+34, 5, 11, '#2B1810');
  px(ctx, x+17, y+34, 5, 11, '#2B1810');
  px(ctx, x+10, y+44, 5, 3, PALETTE.HAIR_BLACK);
  px(ctx, x+17, y+44, 5, 3, PALETTE.HAIR_BLACK);
}

// ============================================================
// 角色 4：林师傅
// ============================================================
export function drawLin(ctx, x, y, dir = 'down', time = 0) {
  // 头巾（横绑）
  px(ctx, x+8, y+4, 16, 3, '#C84030');
  px(ctx, x+22, y+5, 4, 4, '#C84030');  // 巾尾
  // 棕发
  px(ctx, x+10, y+0, 12, 4, '#5C3A1A');
  // 脸（古铜色）
  px(ctx, x+10, y+7, 12, 8, PALETTE.SKIN_DARK);
  px(ctx, x+12, y+10, 1, 1, PALETTE.HAIR_BLACK);
  px(ctx, x+19, y+10, 1, 1, PALETTE.HAIR_BLACK);
  // 络腮胡
  px(ctx, x+10, y+13, 1, 2, '#3D2B1F');
  px(ctx, x+21, y+13, 1, 2, '#3D2B1F');
  px(ctx, x+14, y+14, 4, 1, '#3D2B1F');

  // 背心（无袖）
  px(ctx, x+9, y+15, 14, 16, PALETTE.CLOTH_LIN);
  px(ctx, x+9, y+15, 1, 16, '#5C4A2A');  // 阴影
  // 露出的手臂
  px(ctx, x+5, y+16, 4, 12, PALETTE.SKIN_DARK);
  px(ctx, x+23, y+16, 4, 12, PALETTE.SKIN_DARK);
  px(ctx, x+5, y+26, 4, 4, PALETTE.SKIN_DARK);
  px(ctx, x+23, y+26, 4, 4, PALETTE.SKIN_DARK);

  // 腰间鱼护
  px(ctx, x+22, y+28, 5, 6, '#8B6F47');
  px(ctx, x+23, y+29, 3, 1, '#5C4A2A');

  // 长裤
  px(ctx, x+10, y+31, 5, 11, '#3D2B1F');
  px(ctx, x+17, y+31, 5, 11, '#3D2B1F');
  // 雨鞋（橡胶黄）
  px(ctx, x+9, y+41, 7, 6, '#D4A030');
  px(ctx, x+16, y+41, 7, 6, '#D4A030');
  px(ctx, x+9, y+41, 7, 1, '#A87820');
  px(ctx, x+16, y+41, 7, 1, '#A87820');
}

// ============================================================
// 角色 5：小芳
// ============================================================
export function drawXiaofang(ctx, x, y, dir = 'down', time = 0) {
  // 双马尾
  px(ctx, x+4, y+4, 4, 10, PALETTE.HAIR_BLACK);
  px(ctx, x+24, y+4, 4, 10, PALETTE.HAIR_BLACK);
  // 红发圈
  px(ctx, x+4, y+4, 4, 1, '#C84030');
  px(ctx, x+24, y+4, 4, 1, '#C84030');
  // 头顶
  px(ctx, x+10, y+0, 12, 6, PALETTE.HAIR_BLACK);
  // 刘海
  px(ctx, x+10, y+6, 12, 2, PALETTE.HAIR_BLACK);
  // 脸
  px(ctx, x+10, y+8, 12, 7, PALETTE.SKIN_TONE);
  px(ctx, x+12, y+11, 1, 1, PALETTE.HAIR_BLACK);
  px(ctx, x+19, y+11, 1, 1, PALETTE.HAIR_BLACK);
  px(ctx, x+15, y+13, 2, 1, '#FF6B6B');  // 红嘴
  // 腮红
  px(ctx, x+11, y+12, 1, 1, 'rgba(255,150,150,0.6)');
  px(ctx, x+20, y+12, 1, 1, 'rgba(255,150,150,0.6)');

  // 白T恤
  px(ctx, x+8, y+15, 16, 10, '#FFFFFF');
  px(ctx, x+8, y+15, 1, 10, '#DDDDDD');
  // 牛仔背带（蓝色 X 形交叉）
  px(ctx, x+11, y+15, 2, 10, PALETTE.CLOTH_BAND);
  px(ctx, x+19, y+15, 2, 10, PALETTE.CLOTH_BAND);
  // 袖子
  px(ctx, x+5, y+17, 4, 8, '#FFFFFF');
  px(ctx, x+23, y+17, 4, 8, '#FFFFFF');
  // 手 + 花束
  px(ctx, x+5, y+25, 4, 3, PALETTE.SKIN_TONE);
  px(ctx, x+2, y+22, 6, 6, '#5C8A4C');  // 叶子
  px(ctx, x+3, y+22, 1, 1, '#FF69B4');  // 花
  px(ctx, x+5, y+23, 1, 1, '#FFD700');
  px(ctx, x+6, y+22, 1, 1, '#FF69B4');

  // 短裙（牛仔蓝）
  px(ctx, x+9, y+25, 14, 8, PALETTE.CLOTH_BAND);
  px(ctx, x+9, y+32, 14, 1, '#5C8AA8');
  // 腿（白嫩）
  px(ctx, x+11, y+33, 4, 10, PALETTE.SKIN_TONE);
  px(ctx, x+17, y+33, 4, 10, PALETTE.SKIN_TONE);
  // 小白鞋
  px(ctx, x+10, y+43, 6, 4, '#FFFFFF');
  px(ctx, x+16, y+43, 6, 4, '#FFFFFF');
}
