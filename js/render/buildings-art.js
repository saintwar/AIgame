// ============================================================
// 建筑美术贴图统一元数据表（IIFE 挂 window.BuildingsArt）
// ------------------------------------------------------------
// 设计目标（参见 docs/ART_SPEC.md §2 v1.2 契约）：
//   - 解耦"物理占地"（瓦片格子，决定碰撞/寻路/交互）和"视觉占地"（PNG 像素覆盖）
//   - 物理占地由关卡 / village-scene 决定，本模块不管
//   - 视觉占地由每个建筑独立声明：渲染目标尺寸 + 锚点偏移
//   - 主美可按实际素材比例交付（不再强制 144×128），代码按元数据 stretch / 定位
//
// 使用：
//   const painted = window.BuildingsArt.draw('chief_house', ctx, x, y);
//   if (!painted) { /* 回退程序化绘制 */ }
//
// 元数据字段：
//   src       美术 PNG 相对路径
//   render.w  渲染目标宽度（像素，绘制到 canvas 的实际宽）
//   render.h  渲染目标高度（像素）
//   render.anchorX/anchorY  相对"瓦片左上角 (x, y)"的偏移
//             - 0 表示 PNG 左上角对齐瓦片左上角
//             - 负值表示 PNG 向左/上溢出瓦片格子（视觉超出，物理仍守瓦片）
//   tile.cols/rows  物理占地（瓦片数，仅作文档说明用，碰撞实际由场景层定义）
// ============================================================
(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // PHASE Step2 验收阶段：建筑 PNG 1:1 原尺寸渲染（不缩放、不变形）
  // ------------------------------------------------------------
  // 物理占地仍为 2×1 瓦片（128×64），起点 (x, y) = 瓦片左上角。
  // 视觉对位规则：
  //   - 水平：PNG 中心对齐瓦片水平中心 x+64 → anchorX = 64 - w/2
  //   - 垂直：PNG 底边对齐瓦片底边下方 1 格 (y+128) → anchorY = 128 - h
  //   （即视觉建筑\"立\"在瓦片上，屋顶/屋身向上延伸；与原视觉布局一致）
  // 取整：anchorX 在 .5 时向更靠近瓦片中心（右下）取，避免压邻居。
  // ────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────
  // PHASE 21-C：每栋建筑可选挂 occluder 元数据（Y-sort 上层精灵）
  //   - occluder.src：与原 PNG 同尺寸/同坐标的"屋顶/招牌"切片
  //   - occluder.baseY：屏幕坐标系下的判定线
  //     * 当任何动态 sprite（玩家 / NPC）的 y 超过 baseY，认为 sprite 在
  //       建筑下半身位置 → 在 sprite 之上叠绘 occluder 形成"屋顶压头"效果
  //     * sprite y < baseY → 不画 occluder，sprite 自然叠在 building 之上
  //   - 与 building 主图共用 (x, y, anchorX, anchorY) 同位贴图（主美保证）
  // ────────────────────────────────────────────────────────────
  const REGISTRY = {
    chief_house: {
      src: 'assets/images/buildings/chief_house.png',
      tile: { cols: 2, rows: 1 },
      // PNG 220×212；anchorX = 64-110 = -46, anchorY = 128-212 = -84
      render: { w: 220, h: 212, anchorX: -46, anchorY: -84 },
      occluder: {
        src: 'assets/images/buildings/chief_house_occ.png',
        baseY: 320,
      },
    },
    fishing_shop: {
      src: 'assets/images/buildings/fishing_tackle_shop.png',
      tile: { cols: 2, rows: 1 },
      // PNG 279×212；anchorX = 64-139.5 ≈ -139（向右取整）, anchorY = -84
      render: { w: 279, h: 212, anchorX: -139, anchorY: -84 },
      occluder: {
        src: 'assets/images/buildings/fishing_tackle_shop_occ.png',
        baseY: 320,
      },
    },
    seven_eleven: {
      src: 'assets/images/buildings/711.png',
      tile: { cols: 2, rows: 1 },
      // PNG 245×204；anchorX = 64-122.5 ≈ -58（向右取整）, anchorY = 128-204 = -76
      render: { w: 245, h: 204, anchorX: -58, anchorY: -76 },
      occluder: {
        src: 'assets/images/buildings/711_occ.png',
        baseY: 510,
      },
    },
    aming_house: {
      src: 'assets/images/buildings/aming_house.png',
      tile: { cols: 2, rows: 1 },
      // PNG 225×229；anchorX = 64-112.5 ≈ -48（向右取整）, anchorY = 128-229 = -101
      // 装饰（左下花丛、右侧灯笼柱）由 PNG 自带；烟雾粒子由 drawAmingHomeSmoke 叠加
      render: { w: 225, h: 229, anchorX: -48, anchorY: -101 },
      occluder: {
        src: 'assets/images/buildings/aming_house_occ.png',
        baseY: 510,
      },
    },
  };

  // 每个建筑维护独立 Image 状态
  const cache = Object.create(null);
  // PHASE 21-C：occluder 也独立缓存（key → 同 building，但加 ':occ' 后缀）
  const occCache = Object.create(null);

  function ensureLoaded(key) {
    if (cache[key]) return cache[key];
    const meta = REGISTRY[key];
    if (!meta) {
      console.warn('[buildings-art] 未登记的建筑 key:', key);
      cache[key] = { meta: null, img: null, loaded: false, failed: true };
      return cache[key];
    }
    const entry = { meta, img: new Image(), loaded: false, failed: false };
    entry.img.onload = function () {
      entry.loaded = true;
      console.log(
        '[buildings-art] 加载完成:', key, meta.src,
        entry.img.naturalWidth + 'x' + entry.img.naturalHeight,
        '→ 渲染 ' + meta.render.w + 'x' + meta.render.h +
        '（锚点偏移 ' + meta.render.anchorX + ',' + meta.render.anchorY + '）'
      );
    };
    entry.img.onerror = function () {
      entry.failed = true;
      console.warn('[buildings-art] 加载失败，回退程序化绘制:', key, meta.src);
    };
    entry.img.src = meta.src;
    cache[key] = entry;
    return entry;
  }

  // PHASE 21-C：occluder PNG 异步加载（与 building 主图同套机制）
  //   失败不致命：occluder 加载失败 → drawOccluder 静默 noop，玩家照常显示
  //   不会回退（occluder 没有"程序化兜底"概念，主美交付即终稿）
  function ensureOccLoaded(key) {
    if (occCache[key]) return occCache[key];
    const meta = REGISTRY[key];
    if (!meta || !meta.occluder) {
      occCache[key] = { meta: null, img: null, loaded: false, failed: true };
      return occCache[key];
    }
    const entry = { meta: meta.occluder, img: new Image(), loaded: false, failed: false };
    entry.img.onload = function () {
      entry.loaded = true;
      console.log(
        '[buildings-art] occluder 加载完成:', key, meta.occluder.src,
        entry.img.naturalWidth + 'x' + entry.img.naturalHeight,
        '（baseY=' + meta.occluder.baseY + '）'
      );
    };
    entry.img.onerror = function () {
      entry.failed = true;
      console.warn('[buildings-art] occluder 加载失败:', key, meta.occluder.src);
    };
    entry.img.src = meta.occluder.src;
    occCache[key] = entry;
    return entry;
  }

  /**
   * 绘制指定建筑。
   * @param {string} key 建筑标识（REGISTRY 的键）
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x 瓦片左上角 x（与原程序化 draw 函数同义）
   * @param {number} y 瓦片左上角 y
   * @returns {boolean} true=已用美术图绘制；false=需要程序化兜底
   */
  function draw(key, ctx, x, y) {
    const entry = ensureLoaded(key);
    if (!entry || !entry.loaded || entry.failed) return false;
    const { render } = entry.meta;
    ctx.drawImage(
      entry.img,
      x + render.anchorX,
      y + render.anchorY,
      render.w,
      render.h
    );
    return true;
  }

  function isReady(key) {
    const entry = cache[key];
    return !!(entry && entry.loaded && !entry.failed);
  }

  function getMeta(key) {
    return REGISTRY[key] || null;
  }

  // ============================================================
  // PHASE 21-C 新增 API
  // ============================================================

  /**
   * 绘制 occluder（屋顶/招牌切片，与 building 主图同位贴）。
   *   - 共用 building 的 (x + render.anchorX, y + render.anchorY) 与 (w, h)
   *   - 主美保证 occluder PNG 与原 PNG 同尺寸同坐标，故 drawImage 参数完全一致
   * @param {string} key
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x 瓦片左上角 x（与 building draw 同义）
   * @param {number} y 瓦片左上角 y
   * @returns {boolean} true=已画；false=occluder 未就绪/未登记，调用方无需做任何事
   */
  function drawOccluder(key, ctx, x, y) {
    const entry = ensureOccLoaded(key);
    if (!entry || !entry.loaded || entry.failed) return false;
    const meta = REGISTRY[key];
    if (!meta) return false;
    const { render } = meta;
    ctx.drawImage(
      entry.img,
      x + render.anchorX,
      y + render.anchorY,
      render.w,
      render.h
    );
    return true;
  }

  /**
   * 取该建筑的 Y-sort baseY（屏幕坐标）。
   * @param {string} key
   * @returns {number|null} baseY 数值；未登记 occluder 返回 null
   */
  function getBaseY(key) {
    const meta = REGISTRY[key];
    return meta && meta.occluder ? meta.occluder.baseY : null;
  }

  // 预加载所有登记建筑（与 NPC 模块一致，让首帧就尽可能命中）
  Object.keys(REGISTRY).forEach((key) => {
    ensureLoaded(key);
    if (REGISTRY[key].occluder) ensureOccLoaded(key);
  });

  window.BuildingsArt = { draw, isReady, getMeta, drawOccluder, getBaseY };
})();
