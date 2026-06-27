// 阿明行走动画（村庄场景专用）
// 2026-06-28：替换为新雪碧图 amin_new.png + amin_new.json（SpriteAnimTool 导出格式）
//   - 仅影响【村庄场景】阿明（本模块只被 characters.js drawAming → village-scene 使用）
//   - 钓鱼场景阿明走独立的 aming-fish-sprite.js，不受影响
//
// 新素材规格：
//   图片 amin_new.png 1008×1008，每帧 84×168，PNG 自带透明背景
//   4 方向：down / up / left / right（right = left 水平翻转，由 JSON flipH 标记）
//   动画：idle_<dir>（单帧站立）+ walk_<dir>（6 帧行走）
//   JSON 用 animationsFlat 数组直接给出每个动画 key 的帧名序列 / fps / flipH
//
// 村庄场景传入的是【8 方向】（含对角线 up-left 等），本模块映射到 4 方向：
//   up                       → up
//   down                     → down
//   left / up-left / down-left   → left
//   right / up-right / down-right → right

const SHEET_URL = 'assets/character/amin/amin_new.png?v=20260628b';
const SPEC_URL  = 'assets/character/amin/amin_new.json?v=20260628b';

// 显示缩放：素材帧 84×168（1008×1008 雪碧图），缩到 42×84 与旧版屏幕尺寸一致
const DISPLAY_SCALE = 0.5;

// 脚底锚点偏移（沿用旧惯例，保证脚底落在 player 逻辑中心）
const LEGACY_FOOT_OFFSET_X = 16;
const LEGACY_FOOT_OFFSET_Y = 48;

// 模块私有状态
let _spec    = null;
let _frames  = null;  // { frame_X: {x, y, w, h}, ... }
let _anims   = null;  // { walk_down: {frames:[{x,y,w,h},...], fps, flipH}, idle_down: {...}, ... }
let _image   = null;
let _ready   = false;
let _loading = false;
let _failed  = false;

// 动画状态
let _frameIdx   = 0;
let _lastTick   = 0;
let _currentKey = null;  // 当前动画 key（方向/状态切换时重置帧）

/**
 * 8 方向 → 4 方向映射（对角线优先取水平朝向，侧视读图更自然）
 */
function _to4dir(dir) {
  switch (dir) {
    case 'up':
      return 'up';
    case 'down':
      return 'down';
    case 'left':
    case 'up-left':
    case 'down-left':
      return 'left';
    case 'right':
    case 'up-right':
    case 'down-right':
      return 'right';
    default:
      return 'down';
  }
}

/**
 * 从 JSON 构建帧表 + 动画表
 */
function _build(spec) {
  // 1. 帧表：frameName → {x,y,w,h}
  _frames = {};
  if (spec.frames) {
    for (const name in spec.frames) {
      const fr = spec.frames[name] && spec.frames[name].frame;
      if (fr) {
        _frames[name] = { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
      }
    }
  }

  // 2. 动画表：优先用 animationsFlat（key + frames + fps + flipH）
  _anims = {};
  if (Array.isArray(spec.animationsFlat)) {
    spec.animationsFlat.forEach(a => {
      if (!a || !a.key) return;
      const frames = (a.frames || [])
        .map(n => _frames[n])
        .filter(Boolean);
      _anims[a.key] = {
        frames,
        fps: a.fps || 8,
        flipH: !!a.flipH,
      };
    });
  }
}

/**
 * 触发预加载（懒加载 + 单次）
 */
export function preloadAmingSheet() {
  if (_ready || _loading || _failed) return;
  _loading = true;

  fetch(SPEC_URL)
    .then(r => {
      if (!r.ok) throw new Error('spec fetch failed: ' + r.status);
      return r.json();
    })
    .then(spec => {
      _spec = spec;
      _build(spec);

      const img = new Image();
      img.onload = () => {
        _image   = img;
        _ready   = true;
        _loading = false;
        console.log('[aming-sprite] amin_new ready (1008x1008, 4-dir)');
      };
      img.onerror = () => {
        _failed  = true;
        _loading = false;
        console.error('[aming-sprite] sheet load failed:', SHEET_URL);
      };
      img.src = SHEET_URL;
    })
    .catch(err => {
      _failed  = true;
      _loading = false;
      console.error('[aming-sprite] spec load failed:', err);
    });
}

export function isAmingSheetReady() {
  return _ready;
}

/**
 * 渲染主入口
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px - 原 sprite 左上角 X（characters.js 传入 player.px - 16）
 * @param {number} py - 原 sprite 左上角 Y（characters.js 传入 player.py - 32）
 * @param {string} direction - 8 方向字符串
 * @param {boolean} isMoving
 * @param {number} nowMs - 当前时刻（毫秒）
 * @returns {boolean} 是否成功绘制（false 时由调用方 fallback）
 */
export function drawAmingFromSheet(ctx, px, py, direction, isMoving, nowMs) {
  if (!_ready || !_anims || !_image) return false;

  const d4  = _to4dir(direction || 'down');
  const key = (isMoving ? 'walk_' : 'idle_') + d4;
  const anim = _anims[key] || _anims['idle_down'] || _anims['walk_down'];
  if (!anim || !anim.frames.length) return false;

  // 动画切换时重置帧索引
  if (_currentKey !== key) {
    _frameIdx   = 0;
    _currentKey = key;
    _lastTick   = nowMs;
  }

  // 推进帧（walk 与 idle 统一按各自 fps 循环；停下时 idle 也会播待机动作）
  const interval = 1000 / (anim.fps || 8);
  if (nowMs - _lastTick >= interval) {
    _frameIdx = (_frameIdx + 1) % anim.frames.length;
    _lastTick = nowMs;
  }

  const f = anim.frames[_frameIdx] || anim.frames[0];
  if (!f) return false;

  // 脚底世界坐标（底部中心对齐 player 逻辑中心）
  const footX = px + LEGACY_FOOT_OFFSET_X;
  const footY = py + LEGACY_FOOT_OFFSET_Y;

  const destW = f.w * DISPLAY_SCALE;
  const destH = f.h * DISPLAY_SCALE;
  const drawX = Math.round(footX - destW / 2);
  const drawY = Math.round(footY - destH);

  ctx.save();

  // 像素清晰：关闭插值
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  if (anim.flipH) {
    // 以脚底中心为轴水平翻转
    ctx.translate(footX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-footX, 0);
  }

  ctx.drawImage(
    _image,
    f.x, f.y, f.w, f.h,
    drawX, drawY, destW, destH,
  );

  ctx.imageSmoothingEnabled = prevSmoothing;
  ctx.restore();

  return true;
}

// ── 调试接口（保留以兼容旧引用，可选）──
export function _debugSetFrameIdx(idx) {
  _frameIdx = idx;
}

export function _debugGetState() {
  return { frameIdx: _frameIdx, key: _currentKey, ready: _ready };
}
