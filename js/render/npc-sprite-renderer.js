/**
 * NpcSpriteRenderer — NPC 精灵图渲染器（共享模块）
 *
 * 从 4NPC.png 精灵图读取对应 NPC 的待机动画帧并渲染。
 * 替代原有的静态 PNG 绘制（npcs/xiulan.png 等单图）。
 *
 * 用法（在每个 npc-xxx.js 中调用）：
 *   window.NpcSpriteRenderer.draw(ctx, 'xiulan', x, y, time);
 *
 * 动画：8 帧循环，每帧 250ms（4 FPS 待机动画）
 */
(function() {
  'use strict';

  const SHEET_SRC = 'assets/character/NPC/4NPC.png';
  const SPEC_SRC = 'assets/character/NPC/npc-frame-spec.json';

  let _sheetImg = null;
  let _spec = null;
  let _ready = false;
  let _failed = false;

  /**
   * 开始加载精灵图和配置（立即执行，不懒加载）
   */
  function _startLoad() {
    if (_ready || _failed) return;

    // 并行加载精灵图和 JSON 配置
    let loaded = 0;
    const total = 2;

    function _checkAllLoaded() {
      loaded++;
      if (loaded >= total) {
        _ready = true;
        console.log('[NpcSpriteRenderer] 全部就绪，NPC 列表:', Object.keys(_spec.npcs).join(', '));
      }
    }

    // 1. 加载精灵图
    const img = new Image();
    img.onload = () => {
      _sheetImg = img;
      console.log('[NpcSpriteRenderer] 精灵图加载完成:', SHEET_SRC, img.width + 'x' + img.height);
      _checkAllLoaded();
    };
    img.onerror = () => {
      _failed = true;
      console.error('[NpcSpriteRenderer] 精灵图加载失败:', SHEET_SRC);
    };
    img.src = SHEET_SRC;

    // 2. 加载配置 JSON
    fetch(SPEC_SRC)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(spec => {
        _spec = spec;
        console.log('[NpcSpriteRenderer] 配置加载完成:', SPEC_SRC);
        _checkAllLoaded();
      })
      .catch(err => {
        _failed = true;
        console.error('[NpcSpriteRenderer] 配置加载失败:', err);
      });
  }

  // 脚本加载后立即开始加载
  _startLoad();

  /**
   * 计算绘制矩形（让锚点对齐 NPC 的 (px+16, py+48)）
   * @param {Object} npcData - NPC 配置数据
   * @param {Object} frame - 当前帧数据
   * @param {number} x - npc.px（瓦片左上 x）
   * @param {number} y - npc.py（瓦片左上 y）
   * @returns {{drawX: number, drawY: number, drawW: number, drawH: number, srcX: number, srcY: number, srcW: number, srcH: number}}
   */
  function _calcDrawRect(npcData, frame, x, y) {
    const srcX = frame.src_x;
    const srcY = npcData.row_y;
    const srcW = frame.src_w;
    const srcH = npcData.row_h;

    // 目标尺寸：高度固定 80px（与原 NPC 图一致），宽度等比
    const DEST_H = 80;
    const scale = DEST_H / srcH;
    const destW = Math.round(srcW * scale);
    const destH = DEST_H;

    // 锚点：水平中心 anchorX=0.5，脚底 anchorY=0.95
    const anchorXRatio = (npcData.anchor_x_ratio !== undefined) ? npcData.anchor_x_ratio : 0.5;
    const anchorYRAtio = (npcData.anchor_y_ratio !== undefined) ? npcData.anchor_y_ratio : 0.95;

    // 锚点对齐到 (px+16, py+48)
    const anchorCanvasX = x + 16;
    const anchorCanvasY = y + 48;

    const drawX = anchorCanvasX - destW * anchorXRatio;
    const drawY = anchorCanvasY - destH * anchorYRAtio;

    return { drawX, drawY, drawW: destW, drawH: destH, srcX, srcY, srcW, srcH };
  }

  /**
   * 主接口：绘制 NPC（带动画）
   * 动画节奏：8 帧动画（每帧 250ms，共 2s）→ 暂停 3s（停在第 0 帧）→ 循环
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} npcType - NPC 类型（'xiulan'/'atubo'/'linshifu'/'xiaofang'）
   * @param {number} x - npc.px（瓦片左上 x）
   * @param {number} y - npc.py（瓦片左上 y）
   * @param {number} time - 时间戳（毫秒），用于动画帧计算
   */
  function drawNpc(ctx, npcType, x, y, time) {
    if (!_ready || !_sheetImg || !_spec) {
      _drawFallback(ctx, npcType, x, y);
      return;
    }

    const npcData = _spec.npcs[npcType];
    if (!npcData || !npcData.frames || npcData.frames.length === 0) {
      _drawFallback(ctx, npcType, x, y);
      return;
    }

    const totalFrames = npcData.frames.length;  // 8
    const frameDuration = 250;                  // 每帧 250ms
    const animDuration = frameDuration * totalFrames; // 2000ms = 2s
    const pauseDuration = 3000;                  // 暂停 3s
    const cycleDuration = animDuration + pauseDuration; // 5s 一个完整周期

    const safeTime = (typeof time === 'number' && !isNaN(time)) ? time : 0;
    // 每个 NPC 类型固定随机偏移，让动画错开（基于类型名 hash）
    let _off = 0;
    for (let i = 0; i < npcType.length; i++) {
      _off = ((_off << 5) - _off + npcType.charCodeAt(i)) | 0;
    }
    const offset = Math.abs(_off) % cycleDuration;
    const cycleTime = (safeTime + offset) % cycleDuration;

    let frameIdx;
    if (cycleTime < animDuration) {
      // 处于播放阶段：正常播 8 帧
      frameIdx = Math.floor(cycleTime / frameDuration);
    } else {
      // 处于暂停阶段：停在第 0 帧（静止待机）
      frameIdx = 0;
    }

    const frame = npcData.frames[frameIdx];
    if (!frame) {
      _drawFallback(ctx, npcType, x, y);
      return;
    }

    const rect = _calcDrawRect(npcData, frame, x, y);

    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      _sheetImg,
      rect.srcX, rect.srcY, rect.srcW, rect.srcH,
      rect.drawX, rect.drawY, rect.drawW, rect.drawH
    );
    ctx.imageSmoothingEnabled = prev;
  }

  /**
   * 兜底：极简色块（按 NPC 类型区分颜色）
   */
  function _drawFallback(ctx, npcType, x, y) {
    const colors = {
      'xiulan':   { body: '#D88080', head: '#F5DCC0' },  // 粉色衣裙
      'atubo':    { body: '#9A9590', head: '#C9A876' },  // 驼黄上衣
      'linshifu': { body: '#4A6E8A', head: '#D9A878' },  // 蓝灰工装
      'xiaofang': { body: '#E8C547', head: '#F5DCC0' },  // 黄色裙装
    };
    const c = colors[npcType] || { body: '#888', head: '#AAA' };

    ctx.save();
    // 身体
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 30, 12, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // 头
    ctx.fillStyle = c.head;
    ctx.beginPath();
    ctx.arc(x + 16, y + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 暴露
  window.NpcSpriteRenderer = {
    draw: drawNpc,
    isReady: () => _ready,
    isFailed: () => _failed,
  };
})();
