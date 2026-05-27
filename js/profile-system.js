/**
 * 玩家档案系统
 * 负责：昵称读取 / 保存 / 双写（localStorage + CloudBase）
 * PHASE 16-2 → PHASE 16-2.1 扩展 titleStats（历史最佳 + 称号）
 *
 * 设计原则：
 *   - 本地为快、云端为准：开局先用 localStorage 闪开界面，云端拉到后覆盖
 *   - 失败必降级：云端写入失败 → 本地写入仍算成功，主线不卡
 *   - IIFE，挂 window.PlayerProfile，与 main.js (ES module) 解耦
 *
 * 数据契约（player_profile 集合）：
 *   {
 *     _openid: string,
 *     nickname: string,
 *     createdAt: number,
 *     updatedAt: number,
 *     // PHASE 16-2.1 新增：历史最佳（titleStats 子集，单位 kg / ISO 字符串）
 *     titleStats?: {
 *       currentTitleId: string,
 *       bestSingleFishWeight: number,    // 单位 kg
 *       bestSingleFishName: string,
 *       bestSingleFishDate: string|null, // ISO 8601
 *       totalCaughtWeight: number        // 单位 kg
 *     }
 *   }
 *   （_openid 是 CloudBase 自动注入字段，无需手动写）
 *
 * 写入时机（方案 C 折中）：
 *   - saveNickname() 时顺手把当前本地 titleStats 全量带写云端
 *   - 钓鱼回调链路不改动；接受"换设备后历史最佳数据滞后到下次填昵称才同步"
 *
 * 读取时机（load）：
 *   - 若云端 titleStats 存在 → 与本地 Save.player.titleStats 按"取大不取小"合并回本地
 *   - 失败降级：云端无数据 / 网络异常 → 维持本地，不影响游戏
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'bdds_player_profile_v1';
  const COLLECTION = 'player_profile';

  // titleStats 字段元信息：决定云/本合并时的策略
  //   - 'max'：数值字段，取 max(本地, 云端)
  //   - 'maxWithPair'：bestSingleFishWeight 决胜，配套字段（name/date）跟随胜者
  //   - 'cloud'：字符串类（currentTitleId），云端为准（称号"只升不降"由 title-system 保证）
  const TITLE_STATS_FIELDS = [
    'currentTitleId',
    'bestSingleFishWeight',
    'bestSingleFishName',
    'bestSingleFishDate',
    'totalCaughtWeight',
  ];

  window.PlayerProfile = {
    nickname: null,
    openid: null,
    createdAt: null,
    cloudSynced: false,

    /**
     * 加载档案：localStorage 优先，云端兜底覆盖
     * @returns {Promise<this>}
     */
    async load() {
      // 1. 先读 localStorage（同步快速）
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data && typeof data === 'object') {
            this.nickname = data.nickname || null;
            this.createdAt = data.createdAt || null;
            this.cloudSynced = !!data.cloudSynced;
            console.log('[Profile] 本地档案已加载:', this.nickname);
          }
        }
      } catch (e) {
        console.warn('[Profile] 本地档案解析失败:', e && e.message);
      }

      // 2. 等 CloudBase 就绪（最多 5 秒兜底）
      if (!window.CloudBase || (!window.CloudBase.ready && !window.CloudBase.error)) {
        await new Promise((resolve) => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          window.addEventListener('cloudbase:ready', finish, { once: true });
          window.addEventListener('cloudbase:error', finish, { once: true });
          setTimeout(finish, 5000);
        });
      }

      this.openid = (window.CloudBase && window.CloudBase.openid) || null;

      // 3. 云端有档案 → 同步覆盖（云端为准）
      //    PHASE 16-2 紧急补丁：dbPingOk 为 false 表示控制台匿名登录未开启或鉴权失效，
      //    此时 db 调用一定会抛 ACCESS_TOKEN_DISABLED，直接跳过避免噪音日志。
      const cbReady = window.CloudBase && window.CloudBase.ready && window.CloudBase.db && this.openid;
      const cbPingOk = window.CloudBase && window.CloudBase.dbPingOk;
      if (cbReady && cbPingOk) {
        try {
          const db = window.CloudBase.db;
          const res = await db.collection(COLLECTION)
            .where({ _openid: this.openid })
            .get();

          if (res && res.data && res.data.length > 0) {
            const cloud = res.data[0];
            if (cloud.nickname) {
              this.nickname = cloud.nickname;
              this.createdAt = cloud.createdAt || this.createdAt;
              this.cloudSynced = true;
              this._saveLocal();
              console.log('[Profile] 云端档案已同步:', this.nickname);
            }

            // PHASE 16-2.1：云端 titleStats 存在 → 按"取大不取小"合并回本地 Save
            //   设计原则：云端为权威源，但数值字段取 max，避免本地比云端新时反被降级。
            //   失败/无 Save 模块 时静默跳过，不影响游戏。
            if (cloud.titleStats && typeof cloud.titleStats === 'object') {
              try {
                this._mergeTitleStatsToLocal(cloud.titleStats);
              } catch (e) {
                console.warn('[Profile] titleStats 合并失败（不影响游戏）:', e && e.message);
              }
            }
          } else {
            console.log('[Profile] 云端无档案（待首次保存）');

            // PHASE 16-2 补丁：本地有昵称但云端空 → 自动补写云端
            if (this.hasNickname()) {
              console.log('[Profile] 检测到本地昵称未同步，自动补写云端...');
              try {
                await this._saveToCloud();
                console.log('[Profile] 自动同步成功:', this.nickname);
              } catch (e) {
                console.warn('[Profile] 自动同步失败（不影响游戏）:', e && e.message);
              }
            }
          }
        } catch (e) {
          // 失败降级：用本地，不影响主线
          console.warn('[Profile] 云端读取失败（降级用本地）:', e && e.message);
        }
      }

      return this;
    },

    /**
     * 保存昵称（双写：本地立刻 + 云端尽力）
     * @param {string} nickname
     * @returns {Promise<this>}
     */
    async saveNickname(nickname) {
      // 1. 校验
      const trimmed = (nickname || '').trim();
      if (!trimmed) throw new Error('昵称不能为空');
      if (trimmed.length > 12) throw new Error('昵称最多 12 个字');

      // 2. 本地立刻写（PHASE 16-2 紧急修复：不再预设 cloudSynced，
      //    必须等云端写入真正成功才能置 true，避免 ACCESS_TOKEN_DISABLED 被静默吞掉）
      this.nickname = trimmed;
      if (!this.createdAt) this.createdAt = Date.now();
      this.cloudSynced = false; // 默认未同步，仅在云端真正成功才置 true
      this._saveLocal();

      // 3. 云端尝试写
      //    PHASE 16-2 紧急补丁：仅当 dbPingOk 为 true 才尝试云端，避免明知会失败仍调用
      const cbReady = window.CloudBase && window.CloudBase.ready && window.CloudBase.db && this.openid;
      const cbPingOk = window.CloudBase && window.CloudBase.dbPingOk;
      if (cbReady && cbPingOk) {
        try {
          await this._saveToCloud();
          // _saveToCloud 内已设 cloudSynced = true 并 _saveLocal()
          console.log('[Profile] ✅ 云端已保存:', trimmed);
        } catch (e) {
          this.cloudSynced = false; // 失败明确置 false
          const code = (e && e.code) || (e && e.message) || String(e);
          console.error('[Profile] ❌ 云端保存失败:', code);
          if (e && e.code === 'ACCESS_TOKEN_DISABLED') {
            console.warn(
              '[Profile] ACCESS_TOKEN_DISABLED：请到 CloudBase 控制台 → 身份认证 → 登录设置 → 开启"匿名登录"'
            );
          }
          this._saveLocal(); // 持久化最终（失败）状态
          // 不重新 throw，保留本地保存结果
        }
      } else {
        console.warn('[Profile] CloudBase 未就绪，仅本地保存');
        this.cloudSynced = false;
        this._saveLocal();
      }

      return this;
    },

    /**
     * 是否已有有效昵称
     * @returns {boolean}
     */
    hasNickname() {
      return !!(this.nickname && this.nickname.trim());
    },

    /**
     * 将当前 nickname 写入云端（query → update / add）
     * 由 saveNickname 与 load（自动补写）共用
     * PHASE 16-2.1：顺手把本地 titleStats 全量带写（方案 C 折中，不动钓鱼回调）
     * @private
     */
    async _saveToCloud() {
      if (!window.CloudBase || !window.CloudBase.ready || !window.CloudBase.db || !this.openid) {
        throw new Error('CloudBase 未就绪');
      }
      const db = window.CloudBase.db;

      // 顺手带写：从本地 Save 读 titleStats（不存在则不带，避免覆盖云端已有数据）
      const localTitleStats = this._readLocalTitleStats();

      const res = await db.collection(COLLECTION)
        .where({ _openid: this.openid })
        .get();

      if (res && res.data && res.data.length > 0) {
        // 已存在 → 更新
        const updatePayload = {
          nickname: this.nickname,
          updatedAt: Date.now(),
        };
        if (localTitleStats) updatePayload.titleStats = localTitleStats;
        await db.collection(COLLECTION).doc(res.data[0]._id).update(updatePayload);
      } else {
        // 新建（_openid 由 CloudBase 自动注入）
        const addPayload = {
          nickname: this.nickname,
          createdAt: this.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        if (localTitleStats) addPayload.titleStats = localTitleStats;
        await db.collection(COLLECTION).add(addPayload);
      }

      this.cloudSynced = true;
      this._saveLocal();
    },

    /**
     * 从本地 Save 读取 titleStats（5 字段全量）
     * 老存档或 Save 模块未就绪 → 返回 null（外层据此决定是否带字段写云端）
     * @private
     * @returns {object|null}
     */
    _readLocalTitleStats() {
      if (!window.Save || typeof window.Save.get !== 'function') return null;
      const stats = window.Save.get('player.titleStats');
      if (!stats || typeof stats !== 'object') return null;
      // 全量字段化（确保云端拿到的是固定 schema，缺失字段补默认值）
      return {
        currentTitleId: typeof stats.currentTitleId === 'string' ? stats.currentTitleId : 'newbie',
        bestSingleFishWeight: typeof stats.bestSingleFishWeight === 'number' ? stats.bestSingleFishWeight : 0,
        bestSingleFishName: typeof stats.bestSingleFishName === 'string' ? stats.bestSingleFishName : '',
        bestSingleFishDate: typeof stats.bestSingleFishDate === 'string' ? stats.bestSingleFishDate : null,
        totalCaughtWeight: typeof stats.totalCaughtWeight === 'number' ? stats.totalCaughtWeight : 0,
      };
    },

    /**
     * 将云端 titleStats 按"取大不取小"合并回本地 Save
     * 合并规则：
     *   - bestSingleFishWeight：取 max；配套字段 bestSingleFishName/bestSingleFishDate 跟随胜者
     *   - totalCaughtWeight：取 max（防止云端数据陈旧把本地累计干没）
     *   - currentTitleId：取索引更大的（"只升不降"，与 title-system 语义一致）
     * 写回后立即 commit() 持久化到 localStorage。
     * @private
     * @param {object} cloudStats
     */
    _mergeTitleStatsToLocal(cloudStats) {
      if (!window.Save || typeof window.Save.get !== 'function' || typeof window.Save.set !== 'function') {
        console.warn('[Profile] Save 模块未就绪，跳过 titleStats 合并');
        return;
      }

      // 读本地（缺失 → 空对象，由 _readLocalTitleStats 规范化）
      const local = this._readLocalTitleStats() || {
        currentTitleId: 'newbie',
        bestSingleFishWeight: 0,
        bestSingleFishName: '',
        bestSingleFishDate: null,
        totalCaughtWeight: 0,
      };

      // 1) bestSingleFishWeight + 配套字段（取胜者整组）
      const cloudBest = typeof cloudStats.bestSingleFishWeight === 'number' ? cloudStats.bestSingleFishWeight : 0;
      const localBest = local.bestSingleFishWeight || 0;
      let merged;
      if (cloudBest > localBest) {
        merged = {
          currentTitleId: local.currentTitleId,
          bestSingleFishWeight: cloudBest,
          bestSingleFishName: typeof cloudStats.bestSingleFishName === 'string' ? cloudStats.bestSingleFishName : local.bestSingleFishName,
          bestSingleFishDate: typeof cloudStats.bestSingleFishDate === 'string' ? cloudStats.bestSingleFishDate : local.bestSingleFishDate,
          totalCaughtWeight: local.totalCaughtWeight,
        };
      } else {
        merged = { ...local };
      }

      // 2) totalCaughtWeight 取 max
      const cloudTotal = typeof cloudStats.totalCaughtWeight === 'number' ? cloudStats.totalCaughtWeight : 0;
      merged.totalCaughtWeight = Math.max(merged.totalCaughtWeight || 0, cloudTotal);

      // 3) currentTitleId 取"索引更大"（依赖 title-system 的 TITLES 序）
      //    若 title-system 未加载或找不到 → 维持本地（安全降级）
      const cloudTitleId = typeof cloudStats.currentTitleId === 'string' ? cloudStats.currentTitleId : null;
      if (cloudTitleId && cloudTitleId !== merged.currentTitleId) {
        const TS = window.TitleSystem;
        if (TS && Array.isArray(TS.TITLES)) {
          const li = TS.TITLES.findIndex(t => t.id === merged.currentTitleId);
          const ci = TS.TITLES.findIndex(t => t.id === cloudTitleId);
          if (ci > li) merged.currentTitleId = cloudTitleId;
        }
        // title-system 不可用：保持本地，不冒险升降
      }

      // 写回 Save 并持久化
      window.Save.set('player.titleStats', merged);
      if (typeof window.Save.commit === 'function') window.Save.commit();
      console.log('[Profile] titleStats 已合并自云端:', merged);
    },

    _saveLocal() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          nickname: this.nickname,
          createdAt: this.createdAt,
          cloudSynced: this.cloudSynced,
        }));
      } catch (e) {
        console.warn('[Profile] 本地保存失败:', e && e.message);
      }
    },
  };
})();
