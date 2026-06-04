// ════════════════════════════════════════════════════════════════════
// 鱼精灵加载器（PHASE 21-1 D14 hotfix-u，2026-06-04）
// ════════════════════════════════════════════════════════════════════
// 目的：把 assets/fish/{id}.png 懒加载 + 缓存，并提供"按 species 中文名取图"的便捷查找。
//
// 设计原则：
//   1. 懒加载：第一次 getSpriteBySpecies('奇力鱼') 才发请求；之后命中内存缓存
//   2. 失败 fallback：图加载失败/未加载完成 → 返回 null，由调用方画几何/emoji 兜底
//      （不阻塞渲染、不抛错、不打断游戏循环）
//   3. 状态明确：getSpriteState() 可查 'pending'/'loaded'/'failed'，方便调试
//   4. 与现有数据 0 耦合：仅依赖 fish-pool.js 的 species → id 映射（已 import）
//
// 使用：
//   import { getFishSpriteBySpecies, getFishSpriteById } from './render/fish-sprite-loader.js';
//   const img = getFishSpriteBySpecies('奇力鱼');
//   if (img && img.complete && img.naturalWidth > 0) {
//     ctx.drawImage(img, x - w/2, y - h/2, w, h);
//   } else {
//     // fallback: 画几何或 emoji
//   }
//
// 落盘约定：每张图 512×512，正侧面，鱼头朝右，透明背景。
// ════════════════════════════════════════════════════════════════════

import { SHUISHE_FISH_POOL } from '../data/fish-pool.js';

// species(中文) → id(英文 snake_case) 反查表
const SPECIES_TO_ID = {};
for (const f of SHUISHE_FISH_POOL) {
  SPECIES_TO_ID[f.species] = f.id;
}

// id → HTMLImageElement 内存缓存
const _cache = new Map();
// id → 加载状态 'pending' | 'loaded' | 'failed'
const _state = new Map();

const SPRITE_BASE = 'assets/fish/';
const SPRITE_EXT = '.png';

/**
 * 按 fish id 获取图（懒加载）。若加载失败/还在加载中，返回该 Image 对象（caller 可看 .complete & .naturalWidth）。
 * 若 id 不在鱼池中，返回 null。
 */
export function getFishSpriteById(id) {
  if (!id) return null;
  if (_cache.has(id)) return _cache.get(id);

  const img = new Image();
  _cache.set(id, img);
  _state.set(id, 'pending');

  img.addEventListener('load', () => {
    if (img.naturalWidth > 0) {
      _state.set(id, 'loaded');
    } else {
      _state.set(id, 'failed');
    }
  });
  img.addEventListener('error', () => {
    _state.set(id, 'failed');
    // 仅在 dev 模式提示一次，不刷屏
    if (!img._warned) {
      console.warn('[fish-sprite-loader] 加载失败:', SPRITE_BASE + id + SPRITE_EXT);
      img._warned = true;
    }
  });
  img.src = SPRITE_BASE + id + SPRITE_EXT;
  return img;
}

/**
 * 按 species(中文鱼名) 获取图。等价于先反查 id 再调用 getFishSpriteById。
 */
export function getFishSpriteBySpecies(species) {
  if (!species) return null;
  const id = SPECIES_TO_ID[species];
  if (!id) return null;
  return getFishSpriteById(id);
}

/**
 * 检查一张图是否已可绘制（加载完成且像素 > 0）。封装常用判定。
 */
export function isFishSpriteReady(img) {
  return !!(img && img.complete && img.naturalWidth > 0);
}

/**
 * 获取加载状态（调试/GM 命令用）
 */
export function getFishSpriteState(idOrSpecies) {
  const id = SPECIES_TO_ID[idOrSpecies] || idOrSpecies;
  return _state.get(id) || 'not-requested';
}

/**
 * 预加载全部 10 张鱼图（可选，进入村庄/钓鱼场景前调用，提升首次战斗体验）
 */
export function preloadAllFishSprites() {
  for (const f of SHUISHE_FISH_POOL) {
    getFishSpriteById(f.id);
  }
}

// 全局调试入口（与项目其他 window.* 调试钩子风格一致）
if (typeof window !== 'undefined') {
  window.__fishSprite = {
    getById: getFishSpriteById,
    getBySpecies: getFishSpriteBySpecies,
    state: getFishSpriteState,
    preload: preloadAllFishSprites,
    cache: _cache,
  };
}
