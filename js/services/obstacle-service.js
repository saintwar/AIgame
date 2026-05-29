/**
 * ObstacleService — 像素级障碍碰撞服务（PHASE 21-B）
 * ----------------------------------------------------------------
 * 数据来源：assets/data/obstacles-shuishe.json
 * 字段消费：每个 obstacle 用 blockRect（无则回退 rect）作为物理矩形
 * 设计原则：
 *   - 加载前 / 加载失败 / ENABLED=false → isBlocked 永远返回 false（即不生效，回退 PHASE 20）
 *   - 64px 网格分桶加速 isBlocked 查询（每帧调用 2 次，O(桶内候选数) ≈ O(1)）
 *   - 不动 walkable / A* / NPC，仅在 village-scene 移动判定末端叠加
 *   - 调试可视化：window.DEBUG_OBSTACLES = true 时，绘制所有 blockRect
 *
 * 暴露：window.ObstacleService
 * 接口：
 *   ObstacleService.init()                  // 异步加载，幂等
 *   ObstacleService.isReady()               // bool
 *   ObstacleService.isBlocked(px,py,half)   // 玩家中心 (px,py) 半径 half 的方框是否撞 blockRect
 *   ObstacleService.getAll()                // 调试用，全部 blockRect 列表
 *   ObstacleService.drawDebug(ctx, ox, oy)  // 调试可视化（红色半透明）
 */
(function (global) {
  'use strict';

  const ENABLED = true;                                          // 总开关；false 则全部查询返回 false
  const DATA_URL = 'assets/data/obstacles-shuishe.json';
  const BUCKET = 64;                                              // 分桶尺寸（像素）

  /** @type {Array<{id:string,type:string,x:number,y:number,w:number,h:number}>} */
  const blocks = [];
  /** key="bx,by" → blockIndex[]  */
  const buckets = new Map();
  let ready = false;
  let loading = null;

  /** 计算 box 覆盖的桶 key 列表 */
  function _bucketKeysForBox(x, y, w, h) {
    const x0 = Math.floor(x / BUCKET);
    const y0 = Math.floor(y / BUCKET);
    const x1 = Math.floor((x + w - 1) / BUCKET);
    const y1 = Math.floor((y + h - 1) / BUCKET);
    const keys = [];
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) keys.push(bx + ',' + by);
    }
    return keys;
  }

  function _addBlock(b) {
    const idx = blocks.length;
    blocks.push(b);
    const keys = _bucketKeysForBox(b.x, b.y, b.w, b.h);
    for (const k of keys) {
      let arr = buckets.get(k);
      if (!arr) { arr = []; buckets.set(k, arr); }
      arr.push(idx);
    }
  }

  /** 把 obstacle 的 blockRect/rect 拍平到一个 block */
  function _flatten(o) {
    if (!o) return null;
    const r = o.blockRect || o.rect;
    if (!r) return null;
    const x = +r.x, y = +r.y, w = +r.w, h = +r.h;
    if (!isFinite(x) || !isFinite(y) || w <= 0 || h <= 0) return null;
    return { id: o.id || '?', type: o.type || '?', x, y, w, h };
  }

  function init() {
    if (loading) return loading;
    if (!ENABLED) {
      ready = true;
      return Promise.resolve(false);
    }
    loading = fetch(DATA_URL, { cache: 'no-cache' })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(data => {
        const groups = ['buildings', 'trees', 'fences', 'crops'];
        let total = 0;
        for (const g of groups) {
          const arr = Array.isArray(data[g]) ? data[g] : [];
          for (const o of arr) {
            const b = _flatten(o);
            if (b) { _addBlock(b); total++; }
          }
        }
        ready = true;
        console.log('[ObstacleService] ✅ 加载完成：' + total + ' 个 blockRect（' +
                    groups.map(g => g + '=' + ((data[g] || []).length)).join(', ') + '）');
        return true;
      })
      .catch(err => {
        console.warn('[ObstacleService] ⚠️ 加载失败，已回退到 PHASE 20 行为：', err.message);
        ready = true; // 标 ready 让上层不阻塞；blocks=[] 时 isBlocked 永远 false
        return false;
      });
    return loading;
  }

  function isReady() { return ready; }

  /**
   * 玩家方框 (cx-half .. cx+half, cy-half .. cy+half) 是否与任何 blockRect 重叠
   */
  function isBlocked(cx, cy, half) {
    if (!ENABLED || !ready || blocks.length === 0) return false;
    const h = (typeof half === 'number') ? half : 8;
    const x0 = cx - h, y0 = cy - h, w = h * 2, hh = h * 2;
    const keys = _bucketKeysForBox(x0, y0, w, hh);
    const seen = new Set();
    for (const k of keys) {
      const arr = buckets.get(k);
      if (!arr) continue;
      for (const idx of arr) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        const b = blocks[idx];
        // AABB 重叠
        if (x0 < b.x + b.w && x0 + w > b.x &&
            y0 < b.y + b.h && y0 + hh > b.y) {
          return true;
        }
      }
    }
    return false;
  }

  function getAll() { return blocks.slice(); }

  /**
   * 调试可视化：在 ctx 上以世界坐标 → 屏幕坐标 (offsetX, offsetY) 偏移绘制所有 blockRect
   * 调用方负责传入相机偏移；村庄场景目前没有相机滚动，0,0 即可
   */
  function drawDebug(ctx, ox, oy) {
    if (!global.DEBUG_OBSTACLES) return;
    if (!ready || blocks.length === 0) return;
    ox = ox || 0; oy = oy || 0;
    ctx.save();
    ctx.lineWidth = 1;
    for (const b of blocks) {
      // 类型颜色
      let stroke = '#ff3030', fill = 'rgba(255,48,48,0.18)';
      if (b.type === 'tree')   { stroke = '#33ff66'; fill = 'rgba(51,255,102,0.16)'; }
      else if (b.type === 'fence') { stroke = '#aa6633'; fill = 'rgba(170,102,51,0.18)'; }
      else if (b.type === 'crop')  { stroke = '#ffcc33'; fill = 'rgba(255,204,51,0.18)'; }
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
      ctx.strokeRect(b.x + ox + 0.5, b.y + oy + 0.5, b.w - 1, b.h - 1);
      // id 标签
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.fillText(b.id, b.x + ox + 2, b.y + oy + 10);
    }
    ctx.restore();
  }

  global.ObstacleService = {
    init, isReady, isBlocked, getAll, drawDebug,
    // 暴露常量便于排查
    _ENABLED: ENABLED, _DATA_URL: DATA_URL, _BUCKET: BUCKET
  };
})(window);
