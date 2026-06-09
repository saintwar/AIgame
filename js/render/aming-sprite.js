// 阿明八方向行走动画（PHASE-21 D15 八方向支持）
// 雪碧图：assets/character/amin/amin-walk-sheet-v2.png（5行×6列=30帧，PNG 自带透明背景）
// 切帧坐标：amin-frame-spec-v3.json（八方向映射 + 翻转配置）
//
// 布局（5行）：
//   Row 0: down(0-3) + down-left(4-5)
//   Row 1: up(0-2) + left(3-5)
//   Row 2: left(0-2) + up-left(3-5)
//   Row 3: up(0-5) 完整背面
//   Row 4: down(0-2) 补充帧（col 3-5 未使用）
//
// 八方向通过翻转实现右侧：
//   down-right → 翻转 down-left
//   right      → 翻转 left
//   up-right   → 翻转 up-left
//
// 动画帧循环：少于 6 帧的方向通过循环补齐（如 down-left 只有 2 帧 → [4,5,4,5,4,5]）

const SHEET_URL = 'assets/character/amin/amin-walk-sheet-v2.png?v=20260609';
const SPEC_URL  = 'assets/character/amin/amin-frame-spec-v3.json';

const FRAME_INTERVAL_MS = 100;

// 八方向列表（按游戏逻辑顺序）
const DIR_8 = ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right'];

// 每个方向的帧序列（从 spec.directions[dir].cols 读取，循环补齐到 6 帧）
let _stepSequences = null;

// 需要翻转的方向 → 源方向
let _flipMap = null;

// idle 用哪一帧：每个方向用该方向序列的第 0 帧
let _idleFrame = null;

// 模块私有状态
let _spec     = null;
let _frameMap = null;  // { down: [frameObj, ...], left: [...], ... }
let _image    = null;
let _ready    = false;
let _loading  = false;
let _failed   = false;

// 动画状态
let _animFrameIdx = 0;
let _animLastTick = 0;
let _animCurrentDir = null;  // 当前方向（用于检测方向切换时重置帧）

/**
 * 从 spec 构建帧映射和动画序列
 */
function _buildFrameMapV3(spec) {
  const frameMap = {};
  DIR_8.forEach(dir => { frameMap[dir] = []; });
  
  // 1. 填充基础方向（spec.directions 中定义的）
  if (spec.frames) {
    spec.frames.forEach(f => {
      const dir = f.direction;
      if (frameMap[dir] === undefined) frameMap[dir] = [];
      // 找到正确的插入位置（按 col 排序）
      const col = f.col;
      let inserted = false;
      for (let i = 0; i < frameMap[dir].length; i++) {
        if (frameMap[dir][i].col > col) {
          frameMap[dir].splice(i, 0, f);
          inserted = true;
          break;
        }
      }
      if (!inserted) frameMap[dir].push(f);
    });
  }
  
  // 2. 构建 stepSequences（循环补齐到 6 帧）
  _stepSequences = {};
  if (spec.directions) {
    DIR_8.forEach(dir => {
      const dirSpec = spec.directions[dir];
      if (!dirSpec) return;
      const cols = dirSpec.cols;
      // 循环补齐到 6 帧
      const seq = [];
      for (let i = 0; i < 6; i++) {
        seq.push(cols[i % cols.length]);
      }
      _stepSequences[dir] = seq;
    });
  }
  
  // 3. 构建翻转映射 + 为翻转方向创建代理帧列表
  _flipMap = {};
  if (spec.flip_directions) {
    Object.keys(spec.flip_directions).forEach(targetDir => {
      const flipSpec = spec.flip_directions[targetDir];
      _flipMap[targetDir] = {
        srcDir: flipSpec.src,
        flipX: flipSpec.flip_x !== false,
      };
      // 为翻转方向创建代理：共享源方向的帧数据
      // 渲染时会根据 _flipMap 判断是否需要翻转
      if (frameMap[flipSpec.src]) {
        frameMap[targetDir] = frameMap[flipSpec.src];
      }
    });
  }
  
  // 4. 为翻转方向复制 _stepSequences（否则动画序列不存在）
  if (spec.flip_directions) {
    Object.keys(spec.flip_directions).forEach(targetDir => {
      const srcDir = spec.flip_directions[targetDir].src;
      if (_stepSequences[srcDir]) {
        _stepSequences[targetDir] = _stepSequences[srcDir];
      }
    });
  }
  
  // 5. idle 帧（所有方向统一用 down 方向 col 0 = 正面朝屏幕）
  _idleFrame = {};
  const downSeq = _stepSequences['down'];
  const downIdleCol = (downSeq && downSeq.length > 0) ? downSeq[0] : 0;
  DIR_8.forEach(dir => {
    _idleFrame[dir] = downIdleCol;
  });
  
  return frameMap;
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
      _frameMap = _buildFrameMapV3(spec);
      
      const img = new Image();
      img.onload = () => {
        _image   = img;
        _ready   = true;
        _loading = false;
        console.log('[aming-sprite] v3 ready (1024x1024, 8-dir)');
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
 * 渲染主入口
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px - 原 sprite 左上角 X（player.px）
 * @param {number} py - 原 sprite 左上角 Y（player.py）
 * @param {string} direction - 'down' | 'down-left' | 'left' | 'up-left' | 'up' | 'up-right' | 'right' | 'down-right'
 * @param {boolean} isMoving
 * @param {number} nowMs - 当前时刻（毫秒）
 */
export function drawAmingFromSheet(ctx, px, py, direction, isMoving, nowMs) {
  if (!_ready || !_frameMap) return false;

  // 检查方向是否有效
  let dir = direction || 'down';
  if (!_frameMap[dir]) dir = 'down';
  
  // 获取帧序列
  const seq = _stepSequences ? _stepSequences[dir] : null;
  if (!seq) return false;
  const seqLen = seq.length;  // 应该是 6
  
  // 方向切换时重置帧索引
  if (_animCurrentDir !== dir) {
    _animFrameIdx = 0;
    _animCurrentDir = dir;
  }
  
  // 推进帧索引
  if (isMoving) {
    if (nowMs - _animLastTick >= FRAME_INTERVAL_MS) {
      _animFrameIdx = (_animFrameIdx + 1) % seqLen;
      _animLastTick = nowMs;
    }
  } else {
    _animFrameIdx = 0;
    _animLastTick = nowMs;
  }
  
  // 获取当前帧的 col
  const col = isMoving ? seq[_animFrameIdx] : (_idleFrame ? _idleFrame[dir] : 0);
  
  // 检查是否需要翻转
  const flip = _flipMap ? _flipMap[dir] : null;
  const needFlip = flip && flip.flipX;
  
  let f = null;
  
  if (!isMoving) {
    // idle 状态：所有方向统一用 down 方向 col 0（正面朝屏幕）
    const downFrameList = _frameMap['down'];
    if (downFrameList && downFrameList.length > 0) {
      f = downFrameList[0];  // down 方向 col 0 的帧
    }
  } else {
    // 移动状态：根据是否翻转决定帧列表
    const sourceDir = needFlip ? flip.srcDir : dir;
    const frameList = _frameMap[sourceDir];
    if (!frameList || frameList.length === 0) return false;
    
    // 找到对应 col 的帧数据
    for (let i = 0; i < frameList.length; i++) {
      if (frameList[i].col === col) {
        f = frameList[i];
        break;
      }
    }
    if (!f) f = frameList[0];
  }
  
  if (!f) return false;
  
  // SCALE：根据 canvas 尺寸计算
  const cv = _spec.canvas || { w: 130, h: 195, anchor_x: 65, anchor_y: 190 };
  const SCALE = 0.40;  // 同之前的比例
  
  const CANVAS_W  = cv.w * SCALE;
  const CANVAS_H  = cv.h * SCALE;
  const ANCHOR_X  = cv.anchor_x * SCALE;
  const ANCHOR_Y  = cv.anchor_y * SCALE;
  
  // 脚底世界坐标（与原像素小人脚底一致）
  const LEGACY_FOOT_OFFSET_X = 16;
  const LEGACY_FOOT_OFFSET_Y = 48;  // 恢复原始偏移
  const footX = px + LEGACY_FOOT_OFFSET_X;
  const footY = py + LEGACY_FOOT_OFFSET_Y;
  
  const canvasX = footX - ANCHOR_X;
  const canvasY = footY - ANCHOR_Y;
  
  const destW = f.src_w * SCALE;
  const destH = f.src_h * SCALE;
  const offsetX = (CANVAS_W - destW) / 2;
  const offsetY = CANVAS_H - destH - 2;  // 整体上移 2px，避免脚底被裁剪
  
  ctx.save();
  
  // 绘制阴影（在角色之前绘制，角色会覆盖在阴影上）
  const shadowWidth = destW * 0.8;  // 阴影宽度为角色宽度的 80%
  const shadowHeight = 5;  // 阴影高度（椭圆形）
  const shadowX = Math.round(canvasX + offsetX + (destW - shadowWidth) / 2);
  const shadowY = Math.round(footY);  // 脚底世界坐标
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';  // 半透明黑色
  ctx.beginPath();
  ctx.ellipse(shadowX + shadowWidth / 2, shadowY, shadowWidth / 2, shadowHeight / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  
  if (needFlip) {
    // 翻转渲染：以画布中心为轴翻转
    const centerX = Math.round(canvasX + offsetX + destW / 2);
    ctx.translate(centerX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-centerX, 0);
  }
  
  ctx.drawImage(
    _image,
    f.src_x, f.src_y, f.src_w, f.src_h,
    Math.round(canvasX + offsetX),
    Math.round(canvasY + offsetY),
    Math.round(destW),
    Math.round(destH),
  );
  
  ctx.restore();
  
  return true;
}

// 调试接口
export function _debugSetFrameIdx(idx) {
  _animFrameIdx = idx % 6;
}

export function _debugGetState() {
  return { frameIdx: _animFrameIdx, dir: _animCurrentDir, ready: _ready };
}
