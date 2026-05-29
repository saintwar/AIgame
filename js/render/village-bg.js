/**
 * drawVillageBg — 水社村场景地形底图
 *
 * PHASE 18+：用美术成品图替代原程序化瓦片地形
 *   - 美术稿：assets/images/scenes/village-riverside-bg.jpg（1280×720，与游戏分辨率 1:1）
 *   - 直接 1:1 贴图（不缩放、不裁剪）
 *   - 图片首次访问时异步加载，loading 期间用素色兜底（草绿渐变 → 与 BG 整体色调接近）
 *   - 加载完成后写入 _img 缓存，后续帧直接 drawImage，零开销
 *
 * 设计红线（与 village-scene.js 解耦）：
 *   - 仅负责"贴底图"，不负责任何游戏逻辑（碰撞 / 可走 / 建筑位置全在 village-scene 内）
 *   - 不依赖 tile 数据
 *   - 接口签名与 title-bg 类似但不挂动画特效（村庄场景已有自身的 NPC / 玩家 / digging
 *     overlay 在动，再叠 ripple/bird/sunray 会与日夜系统冲突）
 *
 * 失败降级：
 *   - 加载失败 → _failed=true，后续每帧走 fallback 素色，不报错、不重试
 *
 * 接口：
 *   drawVillageBg(ctx, w, h)
 *   通常 w=1280, h=720（与 GAME_CONFIG 一致），由调用方传入以保持灵活
 *
 * 注意：本模块是 IIFE 挂 window，与 village-scene.js（ES module）解耦。
 *      之所以不用 ES module，是因为 village-scene.js 已经 import 了一堆 render/ 模块，
 *      再加一个就要改 import 列表；用 window 全局暴露更轻量，也与现有 PlayerProfile /
 *      TitleSystem 等"挂 window"风格一致。
 */
(function() {
  'use strict';

  const SRC = 'assets/images/scenes/village-riverside-bg.jpg';

  let _img = null;       // HTMLImageElement，加载完成后赋值
  let _loading = false;  // 是否正在加载
  let _failed = false;   // 加载失败标志（避免反复重试）

  function _ensureLoaded() {
    if (_img || _loading || _failed) return;
    _loading = true;
    const img = new Image();
    img.onload = () => {
      _img = img;
      _loading = false;
      console.log('[village-bg] 底图加载完成:', SRC, `${img.width}x${img.height}`);
    };
    img.onerror = () => {
      _failed = true;
      _loading = false;
      console.warn('[village-bg] 底图加载失败:', SRC);
    };
    img.src = SRC;
  }

  /**
   * loading / 失败兜底：用与 BG 整体色调接近的草绿渐变，避免黑屏或刺眼白底
   * 上半部偏深绿（树影区）→ 下半部偏蓝绿（水域区）
   */
  function _drawFallback(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.00, '#3a5a3e');  // 深林绿
    grad.addColorStop(0.45, '#7fa860');  // 草地绿
    grad.addColorStop(0.65, '#a3c97f');  // 浅草
    grad.addColorStop(0.75, '#6fa5b8');  // 岸边水
    grad.addColorStop(1.00, '#3d7a92');  // 深水
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * 主接口：绘制村庄底图
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w   画布宽（默认按 1280 调用）
   * @param {number} h   画布高（默认按 720 调用）
   */
  function drawVillageBg(ctx, w, h) {
    _ensureLoaded();

    if (_img) {
      // 1:1 贴图（图片本身就是 1280×720）
      // 启用平滑（手绘风格，缩放/边缘略糊好过马赛克）
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(_img, 0, 0, w, h);
      ctx.imageSmoothingEnabled = prev;
    } else {
      _drawFallback(ctx, w, h);
    }
  }

  // 暴露
  window.VillageBg = {
    draw: drawVillageBg,
    // 调试用：查询当前加载状态
    isReady: () => !!_img,
    isFailed: () => _failed,
  };

  // 20260530：模块加载时主动预拉 BG 图（轻量优化）
  //   原行为：第一次 draw() 调用时才 _ensureLoaded → 首帧大概率拿不到 BG
  //   现行为：脚本加载就 fire，渲染前就有时间下载 → 首帧拿到 BG 概率提升
  //   小改动，无副作用，纯粹让首帧更稳。
  _ensureLoaded();
})();
