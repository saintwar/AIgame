// Phase C 昼夜系统：完整四阶段循环（黎明破晓 → 日正当中 → 黄昏降临 → 漫天星光）

/**
 * 时间相位（0~1 循环）：
 *   0.00 ~ 0.25  黎明破晓（粉橙→蓝天渐亮，3 分钟）
 *   0.25 ~ 0.50  日正当中（明亮蓝天，3 分钟）
 *   0.50 ~ 0.75  黄昏降临（蓝→橙→紫渐暗，3 分钟）
 *   0.75 ~ 1.00  漫天星光（深紫蓝夜空，3 分钟）
 *
 * 2026-06-01e：完整循环延长到 12 分钟（720s），4 阶段平均各 3 分钟。
 * 默认场景从 phase=0（黎明）开始。
 * 调试：按 F4 加速 10 倍循环。
 */
let _phaseOffset = 0;
let _phaseSpeedMult = 1;
const CYCLE_MS = 720000;  // 12 分钟完整循环（4 阶段 × 3 分钟）

export function getDayNightPhase(time) {
  return ((time + _phaseOffset) * _phaseSpeedMult % CYCLE_MS) / CYCLE_MS;
}

export function setDayNightPhaseSpeed(mult) {
  _phaseSpeedMult = mult;
}

// 调试用：强制跳转相位（供 F5 等快捷键调用）
export function setDayNightPhaseOffset(offset) {
  _phaseOffset = offset;
}

// ============================================================
// 时间阶段名称（供外部查询当前阶段）
// ============================================================
export function getDayNightPhaseName(phase) {
  // 2026-06-01e：四阶段平均切分（每段 0.25）
  if (phase < 0.25) return 'dawn';
  if (phase < 0.50) return 'day';
  if (phase < 0.75) return 'dusk';
  return 'night';
}

// ============================================================
// 插值工具
// ============================================================
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return Math.max(0, Math.min(1, t)); }
function lerpColor(c1, c2, t) {
  return c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
}
function rgb(arr) { return `rgb(${arr[0]},${arr[1]},${arr[2]})`; }

// ============================================================
// 四阶段天空色板
// ============================================================
// 黎明：粉橙→浅蓝
const DAWN_TOP    = [255, 180, 140];  // 粉橙
const DAWN_MID    = [255, 210, 170];  // 暖粉
const DAWN_HOR    = [255, 165, 120];  // 地平线暖橙

// 白天：明亮蓝天
const DAY_TOP     = [100, 180, 240];  // 天蓝
const DAY_MID     = [140, 200, 250];  // 浅蓝
const DAY_HOR     = [200, 225, 245];  // 近地平线浅蓝白

// 黄昏：橙→紫
const DUSK_TOP    = [255, 176, 122];  // FFB07A
const DUSK_MID    = [232, 149, 107];  // E8956B
const DUSK_HOR    = [123, 111, 168];  // 7B6FA8

// 夜晚：深紫蓝（提亮一档，避免压抑）
const NIGHT_TOP   = [40,  35,  85];
const NIGHT_MID   = [60,  50, 110];
const NIGHT_HOR   = [85,  75, 135];

// ============================================================
// 根据 phase 计算天空渐变三色 + 归一化混合参数 t
// ============================================================
function _getSkyColors(phase) {
  // 2026-06-01e：四阶段平均切分（0.25 / 0.50 / 0.75 / 1.00）
  let top, mid, hor;

  if (phase < 0.25) {
    // 黎明破晓：DAWN → DAY 渐亮（前半段还带粉橙暗调，后半段过渡到蓝天）
    const t = phase / 0.25;  // 0→1
    top = lerpColor(DAWN_TOP, DAY_TOP, t * 0.6);
    mid = lerpColor(DAWN_MID, DAY_MID, t * 0.7);
    hor = lerpColor(DAWN_HOR, DAY_HOR, t * 0.8);
  } else if (phase < 0.50) {
    // 日正当中：纯白天蓝天
    top = DAY_TOP;
    mid = DAY_MID;
    hor = DAY_HOR;
  } else if (phase < 0.75) {
    // 黄昏降临：DAY → DUSK
    const t = (phase - 0.50) / 0.25;  // 0→1
    top = lerpColor(DAY_TOP, DUSK_TOP, t);
    mid = lerpColor(DAY_MID, DUSK_MID, t);
    hor = lerpColor(DAY_HOR, DUSK_HOR, t);
  } else {
    // 漫天星光：DUSK → NIGHT
    const t = (phase - 0.75) / 0.25;  // 0→1
    top = lerpColor(DUSK_TOP, NIGHT_TOP, t);
    mid = lerpColor(DUSK_MID, NIGHT_MID, t);
    hor = lerpColor(DUSK_HOR, NIGHT_HOR, t);
  }

  return { top, mid, hor };
}

/**
 * 归一化暗度值：0=完全明亮（白天），1=完全黑暗（深夜）
 * 用于 overlay、萤火虫、窗光等辅助函数
 */
export function getDarkness(phase) {
  // 2026-06-01e：四阶段（黎明 0~0.25 / 白天 0.25~0.50 / 黄昏 0.50~0.75 / 夜晚 0.75~1.00）
  if (phase < 0.15) {
    // 黎明前段：较暗（0.40 → 0.05）
    return lerp(0.40, 0.05, phase / 0.15);
  } else if (phase < 0.25) {
    // 黎明后段：从微暗到全亮（0.05 → 0）
    return lerp(0.05, 0, (phase - 0.15) / 0.10);
  } else if (phase < 0.45) {
    // 白天全亮
    return 0;
  } else if (phase < 0.50) {
    // 白天末段微微变暗（0 → 0.05）
    return lerp(0, 0.05, (phase - 0.45) / 0.05);
  } else if (phase < 0.75) {
    // 黄昏渐暗（0.05 → 0.50）
    return lerp(0.05, 0.50, (phase - 0.50) / 0.25);
  } else if (phase < 0.90) {
    // 夜晚前段（继续变暗到最深 0.70）
    return lerp(0.50, 0.70, (phase - 0.75) / 0.15);
  } else if (phase < 1.00) {
    // 夜晚后段（最深→黎明前微微亮 0.70 → 0.30）
    return lerp(0.70, 0.30, (phase - 0.90) / 0.10);
  }
  return 0;
}

// ============================================================
// 动态天空渲染
// ============================================================
export function drawDynamicSky(ctx, time) {
  const phase = getDayNightPhase(time);
  const colors = _getSkyColors(phase);

  const g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0,   rgb(colors.top));
  g.addColorStop(0.5, rgb(colors.mid));
  g.addColorStop(1,   rgb(colors.hor));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 360);

  // ── 朝阳（黎明阶段 0~0.25 从左下升起） ──
  if (phase < 0.30) {
    const dawnT = phase / 0.30;  // 0→1
    const sunAlpha = dawnT < 0.5 ? dawnT * 2 : 1;
    const sunY = 320 - dawnT * 80;  // 从地平线下升到地平线上
    const sunX = 200;  // 左侧
    if (sunAlpha > 0) {
      ctx.fillStyle = `rgba(255, 180, 120, ${sunAlpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 36, 0, Math.PI * 2);
      ctx.fill();
      // 光晕
      const halo = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 80);
      halo.addColorStop(0, `rgba(255, 200, 150, ${sunAlpha * 0.4})`);
      halo.addColorStop(1, 'rgba(255, 200, 150, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(sunX - 80, sunY - 80, 160, 160);
    }
  }

  // ── 夕阳（黄昏阶段 0.50~0.75 向右下沉） ──
  if (phase >= 0.45 && phase < 0.80) {
    const duskT = (phase - 0.45) / 0.35;  // 0→1
    const sunAlpha = duskT < 0.6 ? 1 : 1 - (duskT - 0.6) / 0.4;
    const sunY = 260 + duskT * 100;  // 向下沉
    const sunX = 1050;  // 右侧
    if (sunAlpha > 0) {
      ctx.fillStyle = `rgba(255, 123, 71, ${sunAlpha})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 40, 0, Math.PI * 2);
      ctx.fill();
      // 光晕
      const halo = ctx.createRadialGradient(sunX, sunY, 30, sunX, sunY, 100);
      halo.addColorStop(0, `rgba(255, 123, 71, ${sunAlpha * 0.4})`);
      halo.addColorStop(1, 'rgba(255, 123, 71, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(sunX - 100, sunY - 100, 200, 200);
    }
  }

  // ── 白天太阳（小而亮，高悬；白天阶段 0.25~0.50） ──
  if (phase >= 0.20 && phase < 0.55) {
    let sunAlpha = 1;
    if (phase < 0.25) sunAlpha = (phase - 0.20) / 0.05;
    if (phase >= 0.50) sunAlpha = 1 - (phase - 0.50) / 0.05;
    if (sunAlpha > 0) {
      ctx.fillStyle = `rgba(255, 240, 200, ${sunAlpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(900, 100, 28, 0, Math.PI * 2);
      ctx.fill();
      // 微光晕
      const halo = ctx.createRadialGradient(900, 100, 15, 900, 100, 60);
      halo.addColorStop(0, `rgba(255, 240, 200, ${sunAlpha * 0.3})`);
      halo.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(840, 40, 120, 120);
    }
  }

  // ── 白天云朵（黎明末~黄昏初） ──
  if (phase >= 0.15 && phase < 0.60) {
    let cloudAlpha = 1;
    if (phase < 0.25) cloudAlpha = (phase - 0.15) / 0.10;
    if (phase >= 0.50) cloudAlpha = 1 - (phase - 0.50) / 0.10;
    if (cloudAlpha > 0) {
      const cloudOffset = (time / 80) % 1400 - 60;
      ctx.fillStyle = `rgba(255, 255, 255, ${cloudAlpha * 0.6})`;
      // 云1
      _drawCloud(ctx, cloudOffset, 60, 1.0);
      // 云2
      _drawCloud(ctx, (cloudOffset + 500) % 1400 - 60, 110, 0.7);
      // 云3
      _drawCloud(ctx, (cloudOffset + 900) % 1400 - 60, 40, 0.5);
    }
  }

  // ── 星星（夜晚显现） ──
  const darkness = getDarkness(phase);
  if (darkness > 0.4) {
    const starAlpha = (darkness - 0.4) / 0.6;  // 0→1
    const stars = [
      [120, 50], [280, 80], [450, 40], [600, 90], [780, 60],
      [920, 100], [1100, 50], [200, 130], [500, 150], [850, 140],
      [1180, 120], [350, 180], [680, 200]
    ];
    stars.forEach(([sx, sy]) => {
      const twinkle = (Math.sin(time / 500 + sx) + 1) / 2 * 0.5 + 0.5;
      ctx.globalAlpha = starAlpha * twinkle;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx, sy, 1, 1);
    });
    ctx.globalAlpha = 1;
  }

  // ── 月亮（夜晚出现，左上） ──
  if (darkness > 0.5) {
    const moonAlpha = (darkness - 0.5) / 0.5;
    ctx.fillStyle = `rgba(240, 240, 200, ${moonAlpha})`;
    ctx.beginPath();
    ctx.arc(180, 100, 24, 0, Math.PI * 2);
    ctx.fill();
    // 月光晕
    const moonGlow = ctx.createRadialGradient(180, 100, 24, 180, 100, 60);
    moonGlow.addColorStop(0, `rgba(240, 240, 200, ${moonAlpha * 0.3})`);
    moonGlow.addColorStop(1, 'rgba(240, 240, 200, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(120, 40, 120, 120);
  }
}

// 简易云朵绘制
function _drawCloud(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.arc(25, -5, 18, 0, Math.PI * 2);
  ctx.arc(50, 0, 22, 0, Math.PI * 2);
  ctx.arc(15, 8, 14, 0, Math.PI * 2);
  ctx.arc(40, 8, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 动态全局滤镜：根据 phase 调整环境光照
 */
export function drawDynamicOverlay(ctx, time) {
  // 2026-06-01e：四阶段对齐（0.25/0.50/0.75）+ 滤镜浓度全部 × 0.5
  const phase = getDayNightPhase(time);
  const darkness = getDarkness(phase);

  if (phase < 0.25) {
    // 黎明破晓：暖粉滤镜，从暗到亮（峰值 0.15 → 0.075）
    const t = phase / 0.25;
    const alpha = 0.075 * (1 - t);
    ctx.fillStyle = `rgba(255, 200, 160, ${Math.max(0, alpha)})`;
  } else if (phase < 0.50) {
    // 日正当中：无滤镜
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  } else if (phase < 0.75) {
    // 黄昏降临：暖橙滤镜渐强（峰值 0.12 → 0.06）
    const t = (phase - 0.50) / 0.25;
    const alpha = 0.06 * t;
    ctx.fillStyle = `rgba(255, 165, 107, ${alpha})`;
  } else {
    // 漫天星光：冷蓝滤镜（基线 0.06 → 0.03，峰值 0.32 → 0.16）
    const alpha = 0.03 + darkness * 0.14;
    ctx.fillStyle = `rgba(20, 25, 60, ${Math.min(0.16, alpha)})`;
  }
  ctx.fillRect(0, 0, 1280, 720);
}

/**
 * 萤火虫亮度系数（夜晚才亮，白天不亮）
 */
export function getFireflyBrightness(time) {
  const phase = getDayNightPhase(time);
  const darkness = getDarkness(phase);
  return Math.max(0, (darkness - 0.2) * 1.5);  // 暗度>0.2 开始亮
}

/**
 * 暖窗光亮度系数（夜晚更亮，白天不亮）
 */
export function getWindowBrightness(time) {
  const phase = getDayNightPhase(time);
  const darkness = getDarkness(phase);
  // 白天窗不发光，暗时发光
  return darkness > 0.2 ? 0.5 + darkness * 0.5 : 0;
}
