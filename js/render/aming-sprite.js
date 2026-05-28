// 阿明四方向行走动画（PHASE-20.4 比例适配 + 侧向回头修复）
// 雪碧图：assets/character/amin/amin-walk-sheet-v2.png（4行×6列=24帧，PNG 自带透明背景）
// 切帧坐标：amin-frame-spec-v2.json（全部从 JSON 读，不硬编码）
//
// 演进：
//   v2 sheet 共享画布 129×170，锚点 (64,168)；自带透明背景。
//   v2 sheet 的 left/right col=0/3 实际上仍是"正脸过渡帧"（朝向观众，非侧身），
//     必须跳过，与 v3 同样的规律：侧向只用 col=[1,2,4,5] 4 帧步态。
//   1:1 渲染下阿明高度约 170px，远大于其它 NPC（~60px），视觉失衡；
//     PHASE-20.4 把 SCALE 调为 0.40，让阿明 ~68px，略高于成年 NPC 但同档。

const SHEET_URL = 'assets/character/amin/amin-walk-sheet-v2.png';
const SPEC_URL  = 'assets/character/amin/amin-frame-spec-v2.json';

const FRAME_INTERVAL_MS = 100;
const FRAMES_PER_DIR    = 6;

// 跳过 left/right 的 col=0/3 正脸过渡帧，侧向只循环 4 帧侧身步态
const STEP_SEQUENCE = {
  down:  [0, 1, 2, 3, 4, 5],
  up:    [0, 1, 2, 3, 4, 5],
  left:  [1, 2, 4, 5],
  right: [1, 2, 4, 5],
};
// idle 用哪一 col：down/up 用 col=0（正/背面站立），left/right 用 col=1（侧身收脚），避免 idle 正脸
const IDLE_COL = {
  down: 0, up: 0, left: 1, right: 1,
};

// PHASE-20.5：v2 sheet 的第 3 行（src_y≈376）实际为"朝左"姿态，
// 第 4 行（src_y≈555）实际为"朝右"姿态——与 spec 中的 direction 字段含义相反，
// 直接用会导致游戏内侧向移动脸朝反方向。
// 不改动 spec / 资源，渲染入口做一次 left↔right 名义映射即可。
const DIR_REMAP = {
  down:  'down',
  up:    'up',
  left:  'right',
  right: 'left',
};

// 模块私有状态（不污染 player/存档）
let _spec     = null;            // JSON 原始数据
let _frameMap = null;            // { down:[6], up:[6], left:[6], right:[6] }
let _image    = null;            // 直接复用源 Image（v2 自带透明，无需离屏处理）
let _ready    = false;
let _loading  = false;
let _failed   = false;

// 动画状态（dir 切换不重置 frameIdx；idle 立即归 0）
const _anim = {
  frameIdx: 0,
  lastTick: 0,
};

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

      // 2. 加载雪碧图（v2 自带透明，直接用 Image 即可）
      const img = new Image();
      img.onload = () => {
        _image   = img;
        _ready   = true;
        _loading = false;
        console.log('[aming-sprite] ready (v2, scale=0.40)');
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
 * 内部把脚底锚点 (px+16, py+48) 对齐到 sheet 共享画布锚点 (anchor_x, anchor_y)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px - 原 sprite 左上角 X（player.px）
 * @param {number} py - 原 sprite 左上角 Y（player.py）
 * @param {string} direction - 'down' | 'up' | 'left' | 'right'
 * @param {boolean} isMoving
 * @param {number} nowMs - 当前时刻（毫秒，沿用场景 this.time*1000）
 */
export function drawAmingFromSheet(ctx, px, py, direction, isMoving, nowMs) {
  if (!_ready || !_frameMap) return false;

  // 先做 left↔right 名义翻转（见 DIR_REMAP 注释），再走原有取帧逻辑
  const logicalDir = DIR_REMAP[direction] || direction;
  const dir = (_frameMap[logicalDir] ? logicalDir : 'down');
  const seq = STEP_SEQUENCE[dir];
  const seqLen = seq.length;

  // 推进帧索引（在该方向的步态序列里循环）
  if (isMoving) {
    if (nowMs - _anim.lastTick >= FRAME_INTERVAL_MS) {
      _anim.frameIdx = (_anim.frameIdx + 1) % seqLen;
      _anim.lastTick = nowMs;
    } else if (_anim.frameIdx >= seqLen) {
      _anim.frameIdx = _anim.frameIdx % seqLen;
    }
  } else {
    _anim.frameIdx = 0;
    _anim.lastTick = nowMs;
  }

  const col = isMoving ? seq[_anim.frameIdx] : IDLE_COL[dir];
  const f = _frameMap[dir][col];
  if (!f) return false;

  // PHASE-20.4：阿明 sheet 原帧约 130×170，1:1 下显著大于其它 NPC（~60px）。
  // SCALE=0.40 → 阿明高 ~68px，比成年 NPC 略高一档，符合少年身高比例。
  const SCALE = 0.40;

  const cv = _spec.canvas;
  const CANVAS_W  = cv.w        * SCALE;
  const CANVAS_H  = cv.h        * SCALE;
  const ANCHOR_X  = cv.anchor_x * SCALE;
  const ANCHOR_Y  = cv.anchor_y * SCALE;

  // 脚底世界坐标（与原像素小人脚底一致，保证碰撞/触发不偏移）
  const footX = px + LEGACY_FOOT_OFFSET_X;
  const footY = py + LEGACY_FOOT_OFFSET_Y;

  // 画布左上角的世界坐标 = 脚底锚点 - 锚点偏移
  const canvasX = footX - ANCHOR_X;
  const canvasY = footY - ANCHOR_Y;

  // 帧在画布内：水平居中 + 脚底贴齐画布底
  const destW   = f.src_w * SCALE;
  const destH   = f.src_h * SCALE;
  const offsetX = (CANVAS_W - destW) / 2;
  const offsetY = CANVAS_H - destH;

  ctx.drawImage(
    _image,
    f.src_x, f.src_y, f.src_w, f.src_h,
    Math.round(canvasX + offsetX),
    Math.round(canvasY + offsetY),
    Math.round(destW),
    Math.round(destH),
  );

  return true;
}
