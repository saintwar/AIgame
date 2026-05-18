// Phase C 昼夜系统：完整四阶段循环（黎明→白天→黄昏→夜晚）

/**
 * 时间相位（0~1 循环）：
 *   0.00 ~ 0.15  黎明（粉橙→浅蓝渐亮）
 *   0.15 ~ 0.50  白天（明亮蓝天）
 *   0.50 ~ 0.70  黄昏（橙→紫渐暗）
 *   0.70 ~ 1.00  夜晚（深紫蓝→黎明前夕微亮）
 *
 * 默认场景从 phase=0（黎明）开始，每 120s 完整循环一次
 * 调试：按 F4 加速 10 倍循环
 */
let _phaseOffset = 0;
let _phaseSpeedMult = 1;
const CYCLE_MS = 120000;  // 120秒完整循环（比原来60秒慢一倍，更有沉浸感）

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
  if (phase < 0.15) return 'dawn';
  if (phase < 0.50) return 'day';
  if (phase < 0.70) return 'dusk';
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

// 夜晚：深紫蓝
const NIGHT_TOP   = [25,  20,  60];
const NIGHT_MID   = [40,  30,  80];
const NIGHT_HOR   = [60,  50, 100];

// ============================================================
// 根据 phase 计算天空渐变三色 + 归一化混合参数 t
// ============================================================
function _getSkyColors(phase) {
  let top, mid, hor;

  if (phase < 0.15) {
    // 黎明：DAWN → DAY 渐亮
    const t = phase / 0.15;  // 0→1
    top = lerpColor(DAWN_TOP, DAY_TOP, t * 0.3);  // 黎明前半段天空还很暗
    mid = lerpColor(DAWN_MID, DAY_MID, t * 0.4);
    hor = lerpColor(DAWN_HOR, DAY_HOR, t * 0.5);
  } else if (phase < 0.50) {
    // 白天
    top = DAY_TOP;
    mid = DAY_MID;
    hor = DAY_HOR;
  } else if (phase < 0.70) {
    // 黄昏：DAY → DUSK
    const t = (phase - 0.50) / 0.20;  // 0→1
    top = lerpColor(DAY_TOP, DUSK_TOP, t);
    mid = lerpColor(DAY_MID, DUSK_MID, t);
    hor = lerpColor(DAY_HOR, DUSK_HOR, t);
  } else {
    // 夜晚：DUSK → NIGHT → 黎明前夕微亮
    const t = (phase - 0.70) / 0.30;  // 0→1
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
  if (phase < 0.10) {
    // 黎明初期较暗
    return 0.35 * (1 - phase / 0.10) + 0.05;
  } else if (phase < 0.15) {
    // 黎明后期快速变亮
    return lerp(0.05, 0, (phase - 0.10) / 0.05);
  } else if (phase < 0.45) {
    // 白天完全明亮
    return 0;
  } else if (phase < 0.50) {
    // 白天末期微微变暗
    return lerp(0, 0.05, (phase - 0.45) / 0.05);
  } else if (phase < 0.70) {
    // 黄昏渐暗
    return lerp(0.05, 0.5, (phase - 0.50) / 0.20);
  } else if (phase < 0.85) {
    // 夜晚前半段（继续变暗）
    return lerp(0.5, 0.9, (phase - 0.70) / 0.15);
  } else if (phase < 1.00) {
    // 夜晚后半段（最深→黎明前微微亮）
    return lerp(0.9, 0.35, (phase - 0.85) / 0.15);
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

  // ── 朝阳（黎明时从左下方升起） ──
  if (phase < 0.20) {
    const dawnT = phase / 0.20;  // 0→1
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

  // ── 夕阳（黄昏时向右下方沉落） ──
  if (phase >= 0.45 && phase < 0.75) {
    const duskT = (phase - 0.45) / 0.30;  // 0→1
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

  // ── 白天太阳（小而亮，高悬） ──
  if (phase >= 0.15 && phase < 0.55) {
    let sunAlpha = 1;
    if (phase < 0.20) sunAlpha = (phase - 0.15) / 0.05;
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

  // ── 白天云朵 ──
  if (phase >= 0.10 && phase < 0.60) {
    let cloudAlpha = 1;
    if (phase < 0.15) cloudAlpha = (phase - 0.10) / 0.05;
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
  const phase = getDayNightPhase(time);
  const darkness = getDarkness(phase);

  if (phase < 0.15) {
    // 黎明：暖粉滤镜，从暗到亮
    const t = phase / 0.15;
    const alpha = 0.15 * (1 - t);
    ctx.fillStyle = `rgba(255, 200, 160, ${Math.max(0, alpha)})`;
  } else if (phase < 0.50) {
    // 白天：几乎无滤镜
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  } else if (phase < 0.70) {
    // 黄昏：暖橙滤镜渐强
    const t = (phase - 0.50) / 0.20;
    const alpha = 0.12 * t;
    ctx.fillStyle = `rgba(255, 165, 107, ${alpha})`;
  } else {
    // 夜晚：冷蓝滤镜
    const alpha = 0.10 + darkness * 0.35;
    ctx.fillStyle = `rgba(20, 25, 60, ${Math.min(0.45, alpha)})`;
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
