// ============================================================
// AmingFishSprite — PHASE 21-C 钓鱼场景阿明 sprite 接入
// ------------------------------------------------------------
// 资产：
//   assets/character/amin/amin-fish-back-6f.png       （sheet：576×160 单行 6 帧）
//   assets/character/amin/amin-fish-back-6f-spec.json （切帧规格 + 锚点 + pole_tip）
//
// 6 帧序列：站立 → 举竿 → 蓄力 → 甩出 → 收手 → 站立持竿
//   每帧 96×160（origin canvas）；脚底锚点 (48, 158)
//   loop_mode = once_then_hold；hold_frame_index = 5
//
// 与项目现有 aming-sprite.js 范式一致：
//   - preloadAmingFishSheet()       触发加载（懒加载 + 单次）
//   - isAmingFishSheetReady()       是否就绪
//   - drawAmingFishFrame(...)       按帧渲染到 (footX, footY) 脚底锚点
//   - getAmingFishPoleTip(idx)      取该帧竿尖坐标（canvas 内坐标），可能为 null
//
// 设计约束（由 spec.notes 锁定）：
//   - 「原生背面帧，接入时不需做 scale(-1) 翻转」→ 不要套 ctx.scale(-1, 1)
//   - 「按主体 bbox 高度 966px → 150px」→ sheet 已按 0.1553 缩放，1:1 渲染
//     即可，不需要再 SCALE
//   - imageSmoothingEnabled = false 维持像素风
//
// 红线（来自 PHASE 21-C 指令书 §3）：
//   - 不动 spec 字段（src 是 [x,y,w,h] 数组形式，不是 src_x/src_y/...）
//   - 加载失败 → 调用方检测 isReady() === false 走原程序绘制兜底
// ============================================================

const SHEET_URL = 'assets/character/amin/amin-fish-back-6f.png';
const SPEC_URL  = 'assets/character/amin/amin-fish-back-6f-spec.json';

const FRAMES_PER_SHEET = 6;
const HOLD_FRAME_INDEX = 5;

// 模块私有状态
let _spec    = null;
let _image   = null;
let _ready   = false;
let _loading = false;
let _failed  = false;

/**
 * 触发预加载（懒加载 + 单次）。
 * 钓鱼场景 constructor 调一次即可（多次调用幂等）。
 */
export function preloadAmingFishSheet() {
  if (_ready || _loading || _failed) return;
  _loading = true;

  // 1) 加载 spec.json
  fetch(SPEC_URL)
    .then(r => r.json())
    .then(spec => {
      // 字段健全性校验
      if (!spec || !Array.isArray(spec.frames) || spec.frames.length < FRAMES_PER_SHEET) {
        console.warn('[aming-fish-sprite] spec 缺失关键字段，回退原绘制', spec);
        _failed = true;
        _loading = false;
        return;
      }
      // 校验每帧的 src 字段是 [x,y,w,h] 数组
      for (let i = 0; i < FRAMES_PER_SHEET; i++) {
        const f = spec.frames[i];
        if (!f || !Array.isArray(f.src) || f.src.length !== 4) {
          console.warn('[aming-fish-sprite] frame[' + i + '].src 字段缺失或格式错误', f);
          _failed = true;
          _loading = false;
          return;
        }
      }
      _spec = spec;

      // 2) spec 校验通过后再加载 sheet 图片
      const img = new Image();
      img.onload = () => {
        _image = img;
        _ready = true;
        _loading = false;
        console.log(
          '[aming-fish-sprite] sheet 加载完成:',
          SHEET_URL,
          img.naturalWidth + 'x' + img.naturalHeight,
          '6 frames, anchor (' + (spec.canvas?.anchor_x ?? '?') + ',' +
          (spec.canvas?.anchor_y ?? '?') + ')'
        );
      };
      img.onerror = () => {
        console.warn('[aming-fish-sprite] sheet 加载失败，回退原绘制:', SHEET_URL);
        _failed = true;
        _loading = false;
      };
      img.src = SHEET_URL;
    })
    .catch(err => {
      console.warn('[aming-fish-sprite] spec 加载失败，回退原绘制:', err);
      _failed = true;
      _loading = false;
    });
}

/**
 * sprite 是否就绪。未就绪时调用方应回退原程序绘制。
 */
export function isAmingFishSheetReady() {
  return _ready && !!_image && !!_spec;
}

/**
 * 渲染指定帧到 (footX, footY) 脚底位置（带 floatOffset 上下浮动）。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} footX        脚底中央世界 x（fishing-scene.this.characterX）
 * @param {number} footY        脚底中央世界 y（fishing-scene.this.characterY）
 * @param {number} frameIdx     帧索引 0~5（自动 clamp）
 * @param {number} [floatOffset=0]  浮台漂浮偏移（fishing-scene 已有平台漂浮）
 */
export function drawAmingFishFrame(ctx, footX, footY, frameIdx, floatOffset = 0) {
  if (!_ready || !_image || !_spec) return;

  // clamp 帧索引到 [0, 5]
  const idx = Math.min(FRAMES_PER_SHEET - 1, Math.max(0, Math.floor(frameIdx)));
  const frame = _spec.frames[idx];
  if (!frame || !Array.isArray(frame.src) || frame.src.length !== 4) return;

  const [sx, sy, sw, sh] = frame.src;
  const ax = _spec.canvas?.anchor_x ?? 48;
  const ay = _spec.canvas?.anchor_y ?? 158;

  // 像素吸附 + sprite 不翻转（spec.notes 注明"原生背面帧"）
  const dx = Math.round(footX - ax);
  const dy = Math.round(footY + floatOffset - ay);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_image, sx, sy, sw, sh, dx, dy, sw, sh);
  ctx.restore();
}

/**
 * 取该帧竿尖坐标（canvas 内坐标，相对于 sheet 切片左上角）。
 *
 * spec 仅帧 2/3 提供 pole_tip_estimate，其余为 null。
 * 调用方需自行处理 null（建议 fallback 到帧 3 的值，因为帧 3 是甩出最高点）。
 *
 * @param {number} frameIdx
 * @returns {[number, number] | null}  [px, py]（canvas 内）或 null
 */
export function getAmingFishPoleTip(frameIdx) {
  if (!_ready || !_spec) return null;
  const idx = Math.min(FRAMES_PER_SHEET - 1, Math.max(0, Math.floor(frameIdx)));
  const frame = _spec.frames[idx];
  if (!frame) return null;
  const tip = frame.pole_tip_estimate;
  if (!Array.isArray(tip) || tip.length !== 2) return null;
  return [tip[0], tip[1]];
}

/**
 * 取 hold 帧索引（loop_mode=once_then_hold，sprite 序列结束停在该帧）。
 */
export function getAmingFishHoldFrame() {
  if (_spec && typeof _spec.hold_frame_index === 'number') return _spec.hold_frame_index;
  return HOLD_FRAME_INDEX;
}

/**
 * 取每帧时长（ms），用于 Casting 期 castFrameTimer 推进节奏。
 */
export function getAmingFishFrameIntervalMs() {
  return _spec?.frame_interval_ms ?? 120;
}
