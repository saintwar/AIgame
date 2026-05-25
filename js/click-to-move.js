/**
 * PHASE 16-4.8 仗1：村庄场景鼠标点击寻路（A* MVP）
 * ─────────────────────────────────────────────────────────
 *
 * 设计：
 *   "鼠标是观察与确认的手，键盘是行动与节奏的手"
 *   双轨并行 — WASD 完整保留，鼠标作为"看哪点哪"的叠加层。
 *
 * 移动模型：方案 A2 —— 像素级平滑推进（与 WASD 同源同速）
 *   - A* 在网格上算出整格序列 [[tx1,ty1],...]，保证不穿墙不走斜向
 *   - 每帧朝当前航点中心 (tx*64+32, ty*64+24) 推进 player.speed (3 px/帧)
 *   - 到达航点中心 → 切下一个航点
 *   - direction 按 dx/dy 自动设置，与 WASD 视觉一致
 *   - 终点对齐：最后一格强制 px=tx*64+32 / py=ty*64+24，避免半格漂移
 *
 * 接入点（方案 B1，4 处 hook，由 village-scene.js 主动调用）：
 *   1. init() 末尾   → ClickToMove.attach(villageScene)
 *   2. destroy() 内  → ClickToMove.detach()
 *   3. _update(dt)   → ClickToMove.update(dt)
 *   4. _render() 末  → ClickToMove.renderOverlay(ctx)
 *
 * 全局依赖（启动顺序：click-to-move.js → main.js）：
 *   - window.SceneManager    场景守卫（仅 village 场景响应）
 *   - window.GAME_CONFIG     TILE_SIZE / MAP_COLS / MAP_ROWS
 *   （A* 寻路自带 60 行实现，零外部依赖）
 *
 * 不动的现有逻辑（约束 1/4/5/6）：
 *   - 完整保留 WASD（村庄场景 _bindInput 内的 keys.up/down/left/right）
 *   - 不动钓鱼/对话/UI 任何状态机
 *   - 不动建筑物/水域碰撞数据（仅只读调用 villageScene._canMoveTo）
 */
(function () {
  'use strict';

  // 模块状态：单例（村庄场景只有一个，destroy/init 之间清零）
  let scene = null;             // attach 时记下 villageScene 引用
  let canvas = null;
  let path = [];                // A* 算出的航点序列 [[tx,ty],...]，包含起点
  let pathIndex = 0;            // 当前正在朝向的航点 index（path[pathIndex]）
  let onArriveCallback = null;  // 抵达终点后触发（NPC 对话 / 钓鱼提示）
  let isWalking = false;
  let hoverGridX = -1, hoverGridY = -1;
  let lastClickTime = 0;
  let clickFeedback = null;     // { gx, gy, startTime } | null
  let listeners = null;         // { onClick, onMove, onLeave } 用于 detach

  const T = 64;                  // tile size（与 GAME_CONFIG.TILE_SIZE 一致）
  const COLS = 20, ROWS = 11;
  const CLICK_DEBOUNCE_MS = 50;
  const FEEDBACK_DURATION_MS = 200;

  // ────────────────────────────────────────────────────────
  // 工具函数
  // ────────────────────────────────────────────────────────

  /**
   * 当前是否应该响应鼠标点击 / 显示 hover？
   * 7 信号忙碌守卫（任一为 true 即"忙"）：
   *   - 不在村庄场景
   *   - 村庄场景未 init 完成
   *   - 开场旁白 / 标题 / 淡入中
   *   - 教程卡片显示中
   *   - 对话进行中
   *   - 任务面板 / 背包 / 图鉴 / 钓具店 任一打开
   * 钓鱼场景由"不在村庄"自然兜住，不需要单独判断。
   */
  function isSceneInteractive() {
    if (!scene || !canvas) return false;
    if (!window.SceneManager || window.SceneManager.currentScene !== 'village') return false;
    if (scene.introState) return false;             // narration / title / fadein
    if (scene.tutorialCardActive) return false;
    // 对话状态：villageScene 内部 import 了 dialogueSystem，没上 window，
    // 但村庄场景对话期间会通过 _update 锁定 player 移动，且 dialogueSystem 在
    // 村庄场景 _update 头部就 return 了。我们这里通过两个间接信号判定：
    //   ① scene.questPanelOpen
    //   ② 任意 UI 面板 visible
    // 对话本身的判定借用 window.dialogueSystem 若已暴露则用之，否则降级
    if (window.dialogueSystem && typeof window.dialogueSystem.isActive === 'function'
        && window.dialogueSystem.isActive()) return false;
    if (scene.questPanelOpen) return false;
    if (scene.inventoryUI && scene.inventoryUI.visible) return false;
    if (scene.codexUI && scene.codexUI.visible) return false;
    if (scene.shopUI && scene.shopUI.visible) return false;
    // PHASE 17 仗2：秀兰民宿面板打开时也阻塞寻路
    if (scene.restPanel && scene.restPanel.visible) return false;
    return true;
  }

  /**
   * 屏幕坐标 → 网格坐标
   * canvas CSS 尺寸（rect.width/height）通常被 transform: scale 缩放，
   * 而 canvas.width/height 是逻辑像素 1280×720，必须做比例换算（DPR 已在 villageScene 处理过）
   */
  function screenToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (clientX - rect.left) * scaleX;
    const cy = (clientY - rect.top) * scaleY;
    return {
      gx: Math.floor(cx / T),
      gy: Math.floor(cy / T)
    };
  }

  /**
   * 复用现有碰撞接口
   */
  function isWalkable(gx, gy) {
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return false;
    return scene._canMoveTo(gx, gy);
  }

  /**
   * 构建 pathfinding matrix（0 可走 / 1 不可走）
   * 每次寻路前重新构建——220 格量级，O(n) 不会卡。
   * NPC 站位也算障碍（避免寻路终点穿过 NPC 身体；玩家自己想走 NPC 旁
   * 时由"目标格不可走 → 找最近 4 邻可走格"逻辑兜住）。
   */
  function buildMatrix() {
    const m = [];
    for (let y = 0; y < ROWS; y++) {
      const row = new Array(COLS);
      for (let x = 0; x < COLS; x++) {
        row[x] = isWalkable(x, y) ? 0 : 1;
      }
      m.push(row);
    }
    // 把 NPC 标为障碍（避免寻路从 NPC 身上经过）
    if (scene.npcs) {
      for (const npc of scene.npcs) {
        const nx = Math.floor(npc.px / T);
        const ny = Math.floor((npc.py + 24) / T);
        if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
          m[ny][nx] = 1;
        }
      }
    }
    return m;
  }

  /**
   * 4 邻 + 8 邻搜索最近可走格（先 4 邻、再 8 邻；matrix 已带 NPC 障碍）
   */
  function findNearestWalkable(matrix, gx, gy) {
    const dirs4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const dirs8 = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [dx, dy] of dirs4) {
      const nx = gx + dx, ny = gy + dy;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && matrix[ny][nx] === 0) {
        return [nx, ny];
      }
    }
    for (const [dx, dy] of dirs8) {
      const nx = gx + dx, ny = gy + dy;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && matrix[ny][nx] === 0) {
        return [nx, ny];
      }
    }
    return null;
  }

  /**
   * 玩家像素位置 → 当前所在格（与 villageScene._update 末尾的算法一致）
   */
  function playerGrid() {
    const p = scene.player;
    return {
      gx: Math.floor(p.px / T),
      gy: Math.floor((p.py + 24) / T)
    };
  }

  /**
   * 内嵌 A* 寻路（PHASE 16-4.8 仗1-HOTFIX2）
   * ─────────────────────────────────────────
   * 历史：原本想用 pathfinding.js@0.4.18，结果该 npm 包没发布 UMD bundle，
   *      改走 jsdelivr-gh 的 release dist 又发现 bundle 自身坏（browserify 0.x
   *      产物，运行时 "Cannot read properties of undefined (reading '4')"）。
   * 决策：209 格的网格根本不需要第三方寻路库，60 行手写 A* 性能秒过、
   *      零依赖、永不抖动。这是教科书 A* 第一章：4 邻、曼哈顿启发、
   *      open list 用线性扫描（209 格量级 O(n) 开销 < 0.1ms）。
   *
   * 输入：matrix（0 可走 / 1 不可走，[y][x] 索引）, 起点 (sx,sy), 终点 (ex,ey)
   * 输出：[[x,y], ...] 完整路径含起点和终点；找不到时返回 null
   * 不允许斜向（约束 5）。
   */
  function findPathAStar(matrix, sx, sy, ex, ey) {
    const W = matrix[0].length;
    const H = matrix.length;
    const inBounds = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
    if (!inBounds(sx, sy) || !inBounds(ex, ey)) return null;
    if (matrix[sy][sx] === 1 || matrix[ey][ex] === 1) return null;

    // 节点池：键 = y*W+x；值 = { f, g, h, px, py, closed, opened }
    const key = (x, y) => y * W + x;
    const nodes = new Map();
    const startKey = key(sx, sy);
    nodes.set(startKey, { x: sx, y: sy, g: 0, h: Math.abs(sx - ex) + Math.abs(sy - ey), f: 0, parent: -1, closed: false });
    nodes.get(startKey).f = nodes.get(startKey).h;

    // open list：用数组 + 线性扫最小 f（小图量级足够；不引入二叉堆是为了零依赖、可读）
    const open = [startKey];

    const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 上右下左

    while (open.length > 0) {
      // 取 f 最小的节点
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (nodes.get(open[i]).f < nodes.get(open[bestIdx]).f) bestIdx = i;
      }
      const curKey = open.splice(bestIdx, 1)[0];
      const cur = nodes.get(curKey);
      cur.closed = true;

      // 抵达终点 → 回溯
      if (cur.x === ex && cur.y === ey) {
        const path = [];
        let k = curKey;
        while (k !== -1) {
          const n = nodes.get(k);
          path.push([n.x, n.y]);
          k = n.parent;
        }
        return path.reverse();
      }

      // 扩展 4 邻
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!inBounds(nx, ny) || matrix[ny][nx] === 1) continue;
        const nKey = key(nx, ny);
        const ng = cur.g + 1;
        const existing = nodes.get(nKey);
        if (existing && existing.closed) continue;
        if (!existing) {
          const h = Math.abs(nx - ex) + Math.abs(ny - ey);
          nodes.set(nKey, { x: nx, y: ny, g: ng, h, f: ng + h, parent: curKey, closed: false });
          open.push(nKey);
        } else if (ng < existing.g) {
          existing.g = ng;
          existing.f = ng + existing.h;
          existing.parent = curKey;
          if (open.indexOf(nKey) < 0) open.push(nKey);
        }
      }
    }
    return null; // open 耗尽仍未到终点 → 不可达
  }

  // ────────────────────────────────────────────────────────
  // 寻路核心
  // ────────────────────────────────────────────────────────

  function moveTo(targetGX, targetGY, onArrive) {
    cancelPath();

    const { gx: sgx, gy: sgy } = playerGrid();
    if (sgx === targetGX && sgy === targetGY) {
      // 已在目标格 → 直接触发回调（点 NPC 时玩家已贴脸的情况）
      if (typeof onArrive === 'function') onArrive();
      return;
    }

    const matrix = buildMatrix();
    let endX = targetGX, endY = targetGY;

    // 目标格不可走 → 找最近 4/8 邻可走格
    if (matrix[endY] === undefined || matrix[endY][endX] === 1) {
      const nearest = findNearestWalkable(matrix, targetGX, targetGY);
      if (!nearest) {
        showFloatingText('无法到达');
        return;
      }
      [endX, endY] = nearest;
    }

    // 起点必须是可走的（玩家可能站在 NPC 标记的格上——把起点临时设为 0）
    if (matrix[sgy] && matrix[sgy][sgx] === 1) {
      matrix[sgy][sgx] = 0;
    }

    // 内嵌 A*（findPathAStar）：返回 [[x,y],...] 含起点和终点，或 null
    const result = findPathAStar(matrix, sgx, sgy, endX, endY);

    if (!result || result.length === 0) {
      showFloatingText('无法到达');
      return;
    }

    // path 含起点本身；我们让 pathIndex 从 1 开始（朝下一个航点走）
    path = result;
    pathIndex = 1;
    onArriveCallback = onArrive || null;
    isWalking = true;
    showClickFeedback(targetGX, targetGY);
  }

  function cancelPath() {
    path = [];
    pathIndex = 0;
    isWalking = false;
    onArriveCallback = null;
  }

  /**
   * 每帧推进（由 villageScene._update 调用）
   * 模型：朝当前航点中心 (tx*T+32, ty*T+24) 推进 speed 像素，到达后切下一个。
   * 与 WASD 共用 player.px/py/direction，避免双轨视觉割裂。
   *
   * @returns {boolean} 本帧是否由本模块控制了玩家移动
   *   - true：调用方应跳过 WASD 处理（避免 WASD 段 else 分支把 frame=0 重置）
   *   - false：未控制（未寻路 / 已被 WASD 接管 / 已抵达）
   */
  function update(/* dt */) {
    if (!isWalking || !scene) return false;

    // 任一 WASD/方向键被按住 → 立即移交控制权
    const k = scene.keys;
    if (k && (k.up || k.down || k.left || k.right)) {
      cancelPath();
      return false;
    }

    // 场景进入忙碌（被外部弹窗 / 对话打断）→ 取消寻路
    if (!isSceneInteractive()) {
      cancelPath();
      return false;
    }

    if (pathIndex >= path.length) {
      // 抵达终点
      const finalPt = path[path.length - 1];
      if (finalPt) {
        // 终点对齐网格中心，避免半格漂移
        scene.player.px = finalPt[0] * T + 32;
        scene.player.py = finalPt[1] * T + 24;
        scene.player.tx = finalPt[0];
        scene.player.ty = finalPt[1];
      }
      const cb = onArriveCallback;
      cancelPath();
      if (typeof cb === 'function') {
        try { cb(); } catch (e) { console.error('[ClickToMove] onArrive 回调出错:', e); }
      }
      return false;
    }

    const [tgx, tgy] = path[pathIndex];
    const targetPx = tgx * T + 32;
    const targetPy = tgy * T + 24;
    const dx = targetPx - scene.player.px;
    const dy = targetPy - scene.player.py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = scene.player.speed || 3;

    // 朝向（与村庄场景 _update 中 WASD 段同款判定）
    if (Math.abs(dy) > Math.abs(dx)) {
      scene.player.direction = dy < 0 ? 'up' : 'down';
    } else if (dx !== 0) {
      scene.player.direction = dx < 0 ? 'left' : 'right';
    }

    if (dist <= speed) {
      // 一步到位（吸附到航点中心）
      scene.player.px = targetPx;
      scene.player.py = targetPy;
      pathIndex++;
    } else {
      const nx = dx / dist;
      const ny = dy / dist;
      scene.player.px += nx * speed;
      scene.player.py += ny * speed;
    }

    // 同步玩家 tile 坐标（村庄场景 _update 末尾同款语义）
    scene.player.tx = Math.floor(scene.player.px / T);
    scene.player.ty = Math.floor((scene.player.py + 24) / T);

    // 行走帧动画（与 WASD 段同款节流：~0.125s 切一帧）
    scene.animTimer = (scene.animTimer || 0) + (1 / 60);
    if (scene.animTimer >= 0.125) {
      scene.animTimer = 0;
      scene.player.frame = ((scene.player.frame || 0) + 1) % 3;
      // 脚步声（与 WASD 段同款节流：每两帧切换播放）
      scene.footsteps = (scene.footsteps || 0) + 1;
      if (scene.footsteps % 2 === 0 && window.AudioSystem && window.AudioSystem.playFootstep) {
        window.AudioSystem.playFootstep();
      }
    }

    return true;
  }

  // ────────────────────────────────────────────────────────
  // 视觉反馈
  // ────────────────────────────────────────────────────────

  function showClickFeedback(gx, gy) {
    clickFeedback = { gx, gy, startTime: performance.now() };
  }

  function showFloatingText(text) {
    if (scene && typeof scene._showQuestToast === 'function') {
      scene._showQuestToast(text);
    } else {
      console.log('[ClickToMove]', text);
    }
  }

  /**
   * 由 villageScene._render 末尾调用（最上层叠加）
   * 绘制：① hover 格子绿/红边框  ② 点击瞬间黄色波纹（200ms）
   */
  function renderOverlay(ctx) {
    if (!isSceneInteractive()) return;

    // hover 边框
    if (hoverGridX >= 0 && hoverGridX < COLS && hoverGridY >= 0 && hoverGridY < ROWS) {
      const walkable = isWalkable(hoverGridX, hoverGridY);
      // NPC 格视觉特殊处理：show 金色描边（约束：NPC hover 描金边 1px #FFE4B5）
      const isNpc = isNpcAt(hoverGridX, hoverGridY);
      const isFishing = isFishingSpotAt(hoverGridX, hoverGridY);

      ctx.save();
      if (isNpc) {
        // PHASE 16-4.8 仗4：NPC 描金边升级 —— 加 shadowBlur 发光（吉卜力风）
        // 约束 5：仅 hover 时启用；离开 NPC 自动清除（每帧重绘，无残留）
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFE4B5';
        ctx.shadowColor = '#FFD76A';
        ctx.shadowBlur = 8;
        ctx.strokeRect(hoverGridX * T + 1, hoverGridY * T + 1, T - 2, T - 2);
        ctx.shadowBlur = 0;

        // 头顶气泡 "💬 点击对话"（NPC 中心上方）
        ctx.font = '14px "TencentSansW7", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const tipX = hoverGridX * T + T / 2;
        const tipY = hoverGridY * T - 2;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('💬 点击对话', tipX, tipY);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('💬 点击对话', tipX, tipY);
      } else if (isFishing) {
        // PHASE 16-4.8 仗4：钓点 hover 升级 —— 头顶 "🎣 点击前往" 提示
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,224,138,0.9)';
        ctx.shadowColor = '#FFD76A';
        ctx.shadowBlur = 6;
        ctx.strokeRect(hoverGridX * T + 1, hoverGridY * T + 1, T - 2, T - 2);
        ctx.shadowBlur = 0;

        ctx.font = '14px "TencentSansW7", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const tipX = hoverGridX * T + T / 2;
        const tipY = hoverGridY * T - 2;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('🎣 点击前往', tipX, tipY);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('🎣 点击前往', tipX, tipY);
      } else {
        ctx.lineWidth = 2;
        ctx.strokeStyle = walkable
          ? 'rgba(95,174,61,0.6)'
          : 'rgba(220,80,80,0.6)';
        ctx.strokeRect(hoverGridX * T + 1, hoverGridY * T + 1, T - 2, T - 2);
      }
      ctx.restore();
    }

    // 点击波纹（200ms 衰减）
    if (clickFeedback) {
      const elapsed = performance.now() - clickFeedback.startTime;
      if (elapsed < FEEDBACK_DURATION_MS) {
        const alpha = 1 - elapsed / FEEDBACK_DURATION_MS;
        const size = 1 + (elapsed / FEEDBACK_DURATION_MS) * 0.2; // 略微扩大
        ctx.save();
        ctx.fillStyle = `rgba(255,215,106,${alpha * 0.55})`;
        const cx = clickFeedback.gx * T + T / 2;
        const cy = clickFeedback.gy * T + T / 2;
        const w = T * size;
        ctx.fillRect(cx - w / 2, cy - w / 2, w, w);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255,200,40,${alpha})`;
        ctx.strokeRect(cx - w / 2, cy - w / 2, w, w);
        ctx.restore();
      } else {
        clickFeedback = null;
      }
    }
  }

  /**
   * 网格格子上是否有 NPC？
   */
  function isNpcAt(gx, gy) {
    if (!scene || !scene.npcs) return null;
    for (const npc of scene.npcs) {
      const nx = Math.floor(npc.px / T);
      const ny = Math.floor((npc.py + 24) / T);
      if (nx === gx && ny === gy) return npc;
    }
    return null;
  }

  /**
   * 网格格子是否是钓点（栈桥 WOOD 触发钓鱼）
   * 村庄场景的钓鱼触发是站在栈桥 WOOD([8][9..11]) 上按 F，
   * 所以视觉反馈也按"点击栈桥格 = 走过去钓鱼"对待。
   * 同时 FISHING tile（水中圆圈）也归为"钓点 hover 视觉"，但实际不可走 → 寻路会走到栈桥。
   */
  function isFishingSpotAt(gx, gy) {
    if (!scene || !scene.villageMap) return false;
    const tile = scene.villageMap[gy] && scene.villageMap[gy][gx];
    return tile === 3 /* WOOD */ || tile === 9 /* FISHING */;
  }

  // ────────────────────────────────────────────────────────
  // 事件
  // ────────────────────────────────────────────────────────

  function onClick(e) {
    if (e.button !== 0) return;                    // 只响应左键
    if (!isSceneInteractive()) return;

    // 标题画面在 introState 阶段，但 isSceneInteractive 已拦；额外保护：开场按钮区域
    // 由 villageScene 自己的 _clickHandler 处理，本模块不会冲突——两个 click handler
    // 都会触发，但 introState 守卫会让本模块直接 return。

    const now = performance.now();
    if (now - lastClickTime < CLICK_DEBOUNCE_MS) return;
    lastClickTime = now;

    const { gx, gy } = screenToGrid(e.clientX, e.clientY);
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;

    // 优先：点击 NPC 格 → 走过去 + 触发对话
    const npc = isNpcAt(gx, gy);
    if (npc) {
      // 寻路终点是 NPC 格，buildMatrix 已把 NPC 标为障碍 → moveTo 内部会走"目标
      // 不可走 → 4 邻最近可走格"分支，自动走到 NPC 旁 1 格。
      moveTo(gx, gy, () => {
        // 抵达后调用 villageScene 现有 _tryInteract（按距离自动选最近 NPC，等价于 E 键）
        if (typeof scene._tryInteract === 'function') scene._tryInteract();
      });
      return;
    }

    // 点击栈桥（WOOD）/ 钓点（FISHING）→ 走过去；onFishingSpot 会在 _update 自检后变 true
    // 现有按 F 钓鱼提示无需额外触发，玩家走到栈桥后 _renderFishingHint 会自动出现
    moveTo(gx, gy);
  }

  function onMove(e) {
    if (!isSceneInteractive()) {
      hoverGridX = -1;
      hoverGridY = -1;
      return;
    }
    const { gx, gy } = screenToGrid(e.clientX, e.clientY);
    hoverGridX = gx;
    hoverGridY = gy;

    // 鼠标光标：NPC / 钓点 → pointer，可走 → default，不可走 → not-allowed
    if (canvas) {
      if (isNpcAt(gx, gy) || isFishingSpotAt(gx, gy)) {
        canvas.style.cursor = 'pointer';
      } else if (isWalkable(gx, gy)) {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'not-allowed';
      }
    }
  }

  function onLeave() {
    hoverGridX = -1;
    hoverGridY = -1;
    if (canvas) canvas.style.cursor = 'default';
  }

  // ────────────────────────────────────────────────────────
  // 生命周期
  // ────────────────────────────────────────────────────────

  /**
   * 由 villageScene.init() 末尾调用
   */
  function attach(villageScene) {
    if (!villageScene || !villageScene.canvas) {
      console.warn('[ClickToMove] attach 失败：villageScene 未就绪');
      return;
    }
    // 若已 attach 过（场景重启），先 detach 再重绑
    if (scene) detach();

    scene = villageScene;
    canvas = villageScene.canvas;

    listeners = {
      onClick: (e) => onClick(e),
      onMove: (e) => onMove(e),
      onLeave: () => onLeave()
    };
    canvas.addEventListener('click', listeners.onClick);
    canvas.addEventListener('mousemove', listeners.onMove);
    canvas.addEventListener('mouseleave', listeners.onLeave);

    // 重置状态
    cancelPath();
    hoverGridX = -1;
    hoverGridY = -1;
    clickFeedback = null;

    // PHASE 16-4.8 仗1-HOTFIX2：内嵌 A* 后无需 PF 检查
    console.log('[ClickToMove] 已就绪（村庄场景，内嵌 A*）');
  }

  /**
   * 由 villageScene.destroy() 调用
   */
  function detach() {
    if (canvas && listeners) {
      canvas.removeEventListener('click', listeners.onClick);
      canvas.removeEventListener('mousemove', listeners.onMove);
      canvas.removeEventListener('mouseleave', listeners.onLeave);
    }
    listeners = null;
    canvas = null;
    scene = null;
    cancelPath();
    hoverGridX = -1;
    hoverGridY = -1;
    clickFeedback = null;
  }

  // ────────────────────────────────────────────────────────
  // 暴露
  // ────────────────────────────────────────────────────────
  window.ClickToMove = {
    attach,
    detach,
    update,
    renderOverlay,
    cancelPath,
    moveTo,
    isWalking: () => isWalking
  };
})();
