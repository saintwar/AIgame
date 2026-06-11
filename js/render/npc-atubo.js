/**
 * NpcAtubo — 村长阿土伯 NPC 精灵图模块
 *
 * PHASE 21-1 D15+：改用 4NPC.png 精灵图（4 行 × 8 帧待机动画）
 *   - 精灵图：assets/character/NPC/4NPC.png（1024×1024 RGBA）
 *   - 配置：  assets/character/NPC/npc-frame-spec.json
 *   - 渲染器：js/render/npc-sprite-renderer.js（共享模块）
 *
 * 历史：原静态图 npcs/atubo.png (64×80) → 升级为 8 帧待机动画
 *
 * 接口（与旧接口完全一致，调用方零修改）：
 *   window.NpcAtubo.draw(ctx, x, y, dir, time)
 */
(function() {
  'use strict';

  /**
   * 主接口：绘制村长阿土伯（调用共享渲染器）
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x   npc.px（瓦片左上 x，像素）
   * @param {number} y   npc.py（瓦片左上 y，像素）
   * @param {string} dir 朝向（保留兼容）
   * @param {number} time 时间戳（毫秒，用于动画帧计算）
   */
  function _drawFallback(ctx, x, y) {
    // 阿土伯兜底：驼黄上衣 + 草帽
    ctx.save();
    // 身体
    ctx.fillStyle = '#9A9590';
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 30, 10, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头
    ctx.fillStyle = '#C9A876';
    ctx.beginPath();
    ctx.arc(x + 16, y + 10, 6, 0, Math.PI * 2);
    ctx.fill();
    // 草帽
    ctx.fillStyle = '#D4A843';
    ctx.fillRect(x + 8, y + 2, 16, 3);
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 4, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAtubo(ctx, x, y, dir, time) {
    if (window.NpcSpriteRenderer && window.NpcSpriteRenderer.isReady &&
        (window.NpcSpriteRenderer.isReady() || window.NpcSpriteRenderer.isFailed && window.NpcSpriteRenderer.isFailed())) {
      window.NpcSpriteRenderer.draw(ctx, 'atubo', x, y, time);
    } else {
      _drawFallback(ctx, x, y);
    }
  }

  // 暴露（接口与旧版完全一致）
  window.NpcAtubo = {
    draw: drawAtubo,
    isReady: () => window.NpcSpriteRenderer && window.NpcSpriteRenderer.isReady(),
    isFailed: () => window.NpcSpriteRenderer && window.NpcSpriteRenderer.isFailed(),
  };
})();
