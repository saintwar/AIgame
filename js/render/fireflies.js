// Phase C 萤火虫粒子系统

class Firefly {
  constructor(canvasW, canvasH) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.reset();
    this.life = Math.random();  // 初始随机生命，错开闪烁
  }
  reset() {
    this.x = Math.random() * this.canvasW;
    // 萤火虫主要在草地/树丛区域：y = 200-560
    this.y = 200 + Math.random() * 360;
    this.baseY = this.y;
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 0.3 + Math.random() * 0.5;
    this.life = 0;
    this.lifeSpeed = 0.005 + Math.random() * 0.008;
    this.driftRange = 30 + Math.random() * 20;
  }
  update(dt) {
    this.life += this.lifeSpeed * dt;
    if (this.life >= 1) this.reset();
    this.phase += 0.02 * dt;
    this.x += Math.cos(this.phase) * this.speed;
    this.y = this.baseY + Math.sin(this.phase * 1.3) * this.driftRange * 0.3;
    if (this.x < 0) this.x = this.canvasW;
    if (this.x > this.canvasW) this.x = 0;
  }
  draw(ctx, brightness) {
    // 萤火虫呼吸：sin 周期影响 alpha
    const breath = (Math.sin(this.life * Math.PI * 2 * 3) + 1) / 2;
    const alpha = breath * 0.9 * brightness;
    if (alpha < 0.05) return;

    // 核心
    ctx.fillStyle = `rgba(255, 255, 150, ${alpha})`;
    ctx.fillRect(this.x | 0, this.y | 0, 2, 2);

    // 光晕（径向渐变）
    const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 8);
    glow.addColorStop(0, `rgba(255, 255, 100, ${alpha * 0.5})`);
    glow.addColorStop(1, 'rgba(255, 255, 100, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(this.x - 8, this.y - 8, 16, 16);
  }
}

// 全局萤火虫池（懒初始化）
let _fireflies = null;
let _lastTime = 0;

export function drawFireflies(ctx, time, brightness = 1) {
  if (!_fireflies) {
    _fireflies = [];
    for (let i = 0; i < 18; i++) {
      _fireflies.push(new Firefly(1280, 720));
    }
    _lastTime = time;
  }
  const dt = Math.min((time - _lastTime) / 16.67, 3);  // 限制 dt 防卡顿
  _lastTime = time;

  _fireflies.forEach(f => {
    f.update(dt);
    f.draw(ctx, brightness);
  });
}