// PHASE 21-1 D5「鱼咬钩反馈系统」· 四叶草 7×7 微光（保底信号）
//
// 权威源：art-spec v1.2 §6.1（ASCII 图）+ §6.2（6 帧关键帧）
// 调用：drawCloverGlow(ctx, x, y, t)
//   - t: 自触发起的毫秒数（≥ 0），总时长 500ms
//
// 颜色：G=主色绿 #7AC862 / H=高光 #F4E4BC / .=透明
// 注意：H 像素不带外发光（art-spec §6.2 红线）；位置 ±2px 随机由调用方负责

import { D5_COLORS } from './d5-palette.js';

// 7×7 像素图（art-spec §6.1）
const CLOVER = [
  ['.','.','G','G','G','.','.'],
  ['.','G','G','H','G','G','.'],
  ['G','G','H','H','H','G','G'],
  ['G','H','H','H','H','H','G'],
  ['G','G','H','H','H','G','G'],
  ['.','G','G','H','G','G','.'],
  ['.','.','G','G','G','.','.'],
];

// 6 帧关键帧（art-spec §6.2）
const KF = [
  { t: 0,   scale: 0.4,  alpha: 0,   blur: 0, dy: 0  },
  { t: 80,  scale: 1.20, alpha: 1,   blur: 4, dy: 0  },
  { t: 160, scale: 1.0,  alpha: 1,   blur: 4, dy: 0  },
  { t: 280, scale: 1.0,  alpha: 1,   blur: 3, dy: 0  },
  { t: 400, scale: 1.0,  alpha: 0.6, blur: 2, dy: -2 },
  { t: 500, scale: 0.9,  alpha: 0,   blur: 0, dy: -4 },
];

export function drawCloverGlow(ctx, x, y, t) {
  if (t < 0 || t > 500) return;
  const k = lerpKF(t);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, k.alpha));
  ctx.translate(Math.floor(x), Math.floor(y + k.dy));
  ctx.scale(k.scale, k.scale);
  ctx.translate(-3, -3); // 7×7 居中（中心 (3,3)）

  for (let j = 0; j < 7; j++) {
    for (let i = 0; i < 7; i++) {
      const ch = CLOVER[j][i];
      if (ch === '.') continue;
      if (ch === 'G') {
        ctx.shadowColor = D5_COLORS.PERFECT_HI; // #FFEEB0
        ctx.shadowBlur  = k.blur;
        ctx.fillStyle   = D5_COLORS.CLOVER;     // #7AC862
      } else {
        // 'H' 高光：不带外发光（art-spec §6.2 红线）
        ctx.shadowBlur  = 0;
        ctx.shadowColor = 'transparent';
        ctx.fillStyle   = D5_COLORS.CLOVER_HI;  // #F4E4BC
      }
      ctx.fillRect(i, j, 1, 1);
    }
  }

  ctx.restore();
}

function lerpKF(t) {
  for (let i = 1; i < KF.length; i++) {
    if (t <= KF[i].t) {
      const a = KF[i - 1], b = KF[i];
      const r = (t - a.t) / (b.t - a.t);
      return {
        scale: a.scale + (b.scale - a.scale) * r,
        alpha: a.alpha + (b.alpha - a.alpha) * r,
        blur:  a.blur  + (b.blur  - a.blur ) * r,
        dy:    a.dy    + (b.dy    - a.dy   ) * r,
      };
    }
  }
  return KF[KF.length - 1];
}
