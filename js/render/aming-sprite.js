// 阿明四方向行走动画（PHASE-20）
// 雪碧图：assets/character/amin/amin-walk-sheet-v3.png（4行×6列=24帧）
// 切帧坐标：amin-frame-spec-v3.json（绝不硬编码，全部从 JSON 读）
// 黑底抠 alpha 阈值 lum<30；锚点 (48,110)；frameInterval=100ms；idle=第0帧

const SHEET_URL = 'assets/character/amin/amin-walk-sheet-v3.png';
const SPEC_URL  = 'assets/character/amin/amin-frame-spec-v3.json';

const FRAME_INTERVAL_MS = 100;
const FRAMES_PER_DIR    = 6;
const BLACK_LUM_THRESHOLD = 30;

// PHASE-20.2 修复"侧向行走时回头"
// 原画 left/right 行的 col=0 与 col=3 实际是正面 3/4 视角（转身瞬间），
// 直接接入步态循环会产生"走两步突然回头"。
// down/up 6 帧都是有效步态，全用；left/right 只用 col=1,2,4,5 这 4 个真侧身帧。
// 仅改"帧索引→col"的映射，不动 spec、雪碧图、frameInterval、walkSpeed。
const STEP_SEQUENCE = {
  down:  [0, 1, 2, 3, 4, 5],
  up:    [0, 1, 2, 3, 4, 5],
  left:  [1, 2, 4, 5],
  right: [1, 2, 4, 5],
};
// 各方向 idle 用哪一 col（必须是"侧身"或"正面静止"帧）
const IDLE_COL = {
  down: 0, up: 0, left: 1, right: 1,
};

// 模块私有状态（不污染 player/存档）
let _spec     = null;            // JSON 原始数据
let _frameMap = null;            // { down:[6], up:[6], left:[6], right:[6] }
let _canvas   = null;            // 抠完黑底的离屏 canvas（替代原图）
let _ready    = false;
let _loading  = false;
let _failed   = false;

// 动画状态（dir 切换不重置 frameIdx；idle 立即归 0）
const _anim = {
  frameIdx: 0,
  lastTick: 0,
};

/**
 * 把图片黑底转成 alpha：lum < 30 的像素 α=0
 * 一次性预处理到离屏 canvas，后续 drawImage 零开销
 */
function _blackToAlpha(img) {
  const cv = document.createElement('canvas');
  cv.width  = img.width;
  cv.height = img.height;
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, cv.width, cv.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
    if (lum < BLACK_LUM_THRESHOLD) px[i + 3] = 0;
  }
  c.putImageData(data, 0, 0);
  return cv;
}

/**
 * 由 spec.frames 构建 frameMap[dir][col]={src_x,src_y,src_w,src_h}
 */
function _buildFrameMap(spec) {
  const map = { down: [], up: [], left: [], right: [] };
  spec.frames.forEach(f => {
    if (!map[f.direction]) return;
    map[f.direction][f.col] = f;
  });
  // 完整性校验
  for (const dir of Object.keys(map)) {
    for (let i = 0; i < FRAMES_PER_DIR; i++) {
      if (!map[dir][i]) {
        console.warn('[aming-sprite] frame missing:', dir, i);
        return null;
      }
    }
  }
  return map;
}

/**
 * 触发预加载（懒加载 + 单次）。村庄场景 constructor 调一次即可。
 */
export function preloadAmingSheet() {
  if (_ready || _loading || _failed) return;
  _loading = true;

  // 1. 加载 JSON
  fetch(SPEC_URL)
    .then(r => {
      if (!r.ok) throw new Error('spec fetch failed: ' + r.status);
      return r.json();
    })
    .then(spec => {
      _spec = spec;
      const map = _buildFrameMap(spec);
      if (!map) throw new Error('frame map incomplete');
      _frameMap = map;

      // 2. 加载雪碧图
      const img = new Image();
      img.onload = () => {
        try {
          _canvas  = _blackToAlpha(img);
          _ready   = true;
          _loading = false;
          console.log('[aming-sprite] ready');
        } catch (e) {
          _failed = true;
          _loading = false;
          console.error('[aming-sprite] blackToAlpha failed:', e);
        }
      };
      img.onerror = () => {
        _failed = true;
        _loading = false;
        console.error('[aming-sprite] sheet load failed:', SHEET_URL);
      };
      img.src = SHEET_URL;
    })
    .catch(err => {
      _failed = true;
      _loading = false;
      console.error('[aming-sprite] spec load failed:', err);
    });
}

export function isAmingSheetReady() {
  return _ready;
}

/**
 * 仅供调试/单测用：强制把 frameIdx 推进到指定值
 */
export function _debugSetFrameIdx(idx) {
  _anim.frameIdx = ((idx % FRAMES_PER_DIR) + FRAMES_PER_DIR) % FRAMES_PER_DIR;
}

export function _debugGetState() {
  return { ..._anim, ready: _ready };
}

// 与原像素小人 (32×48 sprite，左上角为 px,py) 的脚底对齐
// 原脚底 = (px + 16, py + 48)；新 sheet 锚点对到此处 = 角色不会"错位/沉地"
const LEGACY_SPRITE_W      = 32;
const LEGACY_SPRITE_H      = 48;
const LEGACY_FOOT_OFFSET_X = LEGACY_SPRITE_W / 2;  // 16
const LEGACY_FOOT_OFFSET_Y = LEGACY_SPRITE_H;      // 48

/**
 * 渲染主入口（接口与原 drawAming 完全一致：px/py 是 sprite 左上角）
 * 内部把脚底锚点 (px+16, py+48) 对齐到 sheet 帧的脚底锚点 (48,110)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px - 原 sprite 左上角 X（player.px）
 * @param {number} py - 原 sprite 左上角 Y（player.py）
 * @param {string} direction - 'down' | 'up' | 'left' | 'right'
 * @param {boolean} isMoving
 * @param {number} nowMs - 当前时刻（毫秒，沿用场景 this.time*1000）
 */
export function drawAmingFromSheet(ctx, px, py, direction, isMoving, nowMs) {
  if (!_ready || !_frameMap) return false;

  const dir = (_frameMap[direction] ? direction : 'down');
  const seq = STEP_SEQUENCE[dir];
  const seqLen = seq.length;

  // 推进帧索引（在该方向的步态序列里循环）
  if (isMoving) {
    if (nowMs - _anim.lastTick >= FRAME_INTERVAL_MS) {
      _anim.frameIdx = (_anim.frameIdx + 1) % seqLen;
      _anim.lastTick = nowMs;
    } else if (_anim.frameIdx >= seqLen) {
      // 方向切换瞬间索引可能越界（如 down 的 4 切到 left 只有 4 帧）
      _anim.frameIdx = _anim.frameIdx % seqLen;
    }
  } else {
    // idle：定格该方向的待机帧；时间戳同步重置，避免下一次起步立刻补跳
    _anim.frameIdx = 0;
    _anim.lastTick = nowMs;
  }

  const col = isMoving ? seq[_anim.frameIdx] : IDLE_COL[dir];
  const f = _frameMap[dir][col];
  if (!f) return false;

  // PHASE-20.1：统一缩放，使阿明视觉高度与其他 NPC（阿土伯/林师傅/秀兰）持平
  // 仅 dest 端缩放：src 不变、JSON 不动、雪碧图不动、碰撞 walkSpeed 不动
  const SCALE = 0.65;

  const cv = _spec.canvas;
  const CANVAS_W  = cv.w        * SCALE;   // 96  * 0.65 = 62.4
  const CANVAS_H  = cv.h        * SCALE;   // 112 * 0.65 = 72.8
  const ANCHOR_X  = cv.anchor_x * SCALE;   // 48  * 0.65 = 31.2
  const ANCHOR_Y  = cv.anchor_y * SCALE;   // 110 * 0.65 = 71.5

  // 脚底世界坐标（与原像素小人脚底一致，保证碰撞/触发不偏移）
  const footX = px + LEGACY_FOOT_OFFSET_X;
  const footY = py + LEGACY_FOOT_OFFSET_Y;

  // 画布左上角的世界坐标 = 脚底锚点 - 锚点偏移（缩放后的锚点）
  const canvasX = footX - ANCHOR_X;
  const canvasY = footY - ANCHOR_Y;

  // 帧在画布内：水平居中 + 脚底贴齐画布底（缩放后的尺寸，防抖关键）
  const destW   = f.src_w * SCALE;
  const destH   = f.src_h * SCALE;
  const offsetX = (CANVAS_W - destW) / 2;
  const offsetY = CANVAS_H - destH;

  ctx.drawImage(
    _canvas,
    f.src_x, f.src_y, f.src_w, f.src_h,        // src 不变
    Math.round(canvasX + offsetX),
    Math.round(canvasY + offsetY),
    Math.round(destW),                          // dest 缩放
    Math.round(destH),
  );

  return true;
}
