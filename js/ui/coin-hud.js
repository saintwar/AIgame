export class CoinHUD {
  constructor(inventory) {
    this.inventory = inventory;
    this.displayCoin = inventory.getCoin();
    this.bumpScale = 1.0;

    inventory.on('coin_changed', () => { this.bumpScale = 1.4; });
  }

  update(dt) {
    // 平滑过渡
    const target = this.inventory.getCoin();
    this.displayCoin += (target - this.displayCoin) * 0.15;
    if (Math.abs(this.displayCoin - target) < 0.5) {
      this.displayCoin = target;
    }
    // 弹跳缩放衰减
    this.bumpScale += (1.0 - this.bumpScale) * 0.12;
  }

  render(ctx) {
    const x = 20, y = 20;
    ctx.save();
    ctx.translate(x + 80, y + 22);
    ctx.scale(this.bumpScale, this.bumpScale);

    // 背景胶囊
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-80, -22, 180, 44);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.strokeRect(-80, -22, 180, 44);

    // 文字
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px "TencentSansW7", sans-serif';
    ctx.fillText(`💰 ${Math.floor(this.displayCoin)}`, -65, 8);
    ctx.restore();
  }
}
