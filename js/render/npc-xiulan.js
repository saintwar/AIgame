/**
 * NpcXiulan — 秀兰阿姨 NPC 美术贴图模块
 *
 * PHASE 18+：用美术成品图替代原程序化绘制（characters.js drawXiulan）
 *   - 美术稿：assets/images/npcs/xiulan.png（64×80 RGBA，符合 ART_SPEC v1.1 标准尺寸）
 *
 * 历史变更：
 *   - v1（首版）：图片为 120×150，按 height=48 等比缩放 → 秀兰偏矮小
 *   - v2 2026-05-28：图片仍为 120×150，扫描包围盒（57×139）反推 → 视觉接受
 *   - v3 2026-05-28（当前）：主美按 ART_SPEC v1.1 重交付为 64×80，
 *       渲染逻辑与阿土伯统一为 1:1 直出，删除一切缩放/包围盒经验常数。
 *
 * 绘制约定（与 ART_SPEC v1.1 §1.2 一致，与 npc-atubo.js 完全相同）：
 *   - 阿明 sprite 占 32×48，从 (px, py) 左上绘制，脚底 = py+48（地面基线）
 *   - NPC 美术图 = 64×80，主美保证脚底贴近 PNG 底边、人物水平居中
 *   - 程序约定：让 PNG 底边对齐 py+48，让 PNG 横向中心对齐 px+16（瓦片中心）
 *       → x_draw = (px + 16) - 64/2 = px - 16
 *       → y_draw = (py + 48) - 80     = py - 32
 *   - 因此 NPC 上半身/装饰会上溢瓦片，碰撞/对话仍以 (npc.px, npc.py) 为基准，不变。
 *
 * 兜底：图片未加载/失败时画极简素色椭圆（粉色系，与秀兰服饰呼应），避免 NPC 完全消失。
 *
 * 接口：
 *   window.NpcXiulan.draw(ctx, x, y, dir, time)
 *   签名与 drawXiulan 完全一致，便于调用方零修改替换。
 */
(function() {
  'use strict';

  const SRC = 'assets/images/npcs/xiulan.png';

  // 阿明 sprite 锚点（地面基线）
  const SPRITE_W = 32;
  const SPRITE_H = 48;
  // 美术图标准尺寸（ART_SPEC v1.1：所有 NPC 统一 64×80）
  const IMG_W = 64;
  const IMG_H = 80;
  // 绘制偏移：PNG 横向中心对齐瓦片中心，PNG 底边对齐地面基线 py+48
  const X_OFFSET = (SPRITE_W - IMG_W) / 2;     // = -16
  const Y_OFFSET = SPRITE_H - IMG_H;           // = -32

  let _img = null;
  let _loading = false;
  let _failed = false;

  function _ensureLoaded() {
    if (_img || _loading || _failed) return;
    _loading = true;
    const img = new Image();
    img.onload = () => {
      _img = img;
      _loading = false;
      console.log('[npc-xiulan] 美术图加载完成:', SRC, `${img.width}x${img.height}`);
    };
    img.onerror = () => {
      _failed = true;
      _loading = false;
      console.warn('[npc-xiulan] 美术图加载失败，将持续走兜底椭圆:', SRC);
    };
    img.src = SRC;
  }

  /**
   * 兜底：极简素色椭圆（仅在图片加载完成前的几毫秒内显示；加载失败时长期显示）
   * 颜色取自 PALETTE.CLOTH_XIULAN 粉色系，避免 NPC 完全消失影响交互识别
   */
  function _drawFallback(ctx, x, y) {
    ctx.save();
    // 椭圆身体（粉色衣裙）
    ctx.fillStyle = '#D88080';
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 30, 12, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头
    ctx.fillStyle = '#F5DCC0';
    ctx.beginPath();
    ctx.arc(x + 16, y + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 主接口：绘制秀兰阿姨
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x   npc.px（瓦片左上 x，像素）
   * @param {number} y   npc.py（瓦片左上 y，像素）
   * @param {string} dir 朝向（保留兼容；当前美术单图无朝向）
   * @param {number} time 时间戳（保留兼容；当前美术静帧不用动画）
   */
  function drawXiulanImage(ctx, x, y, dir, time) {
    _ensureLoaded();

    if (_img) {
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(_img, x + X_OFFSET, y + Y_OFFSET, IMG_W, IMG_H);
      ctx.imageSmoothingEnabled = prev;
    } else {
      _drawFallback(ctx, x, y);
    }
  }

  // 暴露
  window.NpcXiulan = {
    draw: drawXiulanImage,
    isReady: () => !!_img,
    isFailed: () => _failed,
  };
})();
