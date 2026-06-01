// PHASE 21-1 D5「鱼咬钩反馈系统」· 猛档水花（复用 ParticleSystem）
//
// 权威源：art-spec v1.2 §8.1 ④（抛物线 N=12 粒子，重力+初速 8 帧 ≈ 667ms）
// 调用：emitHeavySplash(particles, x, y)
//
// 复用 ParticleSystem.emit(x, y, count, color, config)：
//   - fishing-scene.js:121 已存在；签名: (x, y, count, color, {speed, upward, decay, size, gravity})
//   - 红线：不新建粒子系统、不改 ParticleSystem 类
//
// 调色（impl-spec §9 末尾）：水花蓝 #A8D8E8 不在 12 色调色板，环境 fx 豁免
// （主美如复审反对，改为 D5_COLORS.GLOW 即一行）

export function emitHeavySplash(particles, x, y) {
  if (!particles || typeof particles.emit !== 'function') return;

  // 主水花 12 粒：高速 + 上抛 + 较强重力（"水"的质感）
  particles.emit(x, y, 12, '#A8D8E8', {
    speed:   180,
    upward:  true,
    decay:   0.04,
    size:    4,
    gravity: 360,
  });

  // 第二批 4 粒大水珠（白色高光）：稍慢，叠出层次
  particles.emit(x, y, 4, '#FFFFFF', {
    speed:   120,
    upward:  true,
    decay:   0.05,
    size:    3,
    gravity: 320,
  });
}
