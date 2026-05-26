// 任务系统模块

import Save from './save-system.js';
import { QUESTS } from './data/quests.js';
import AudioSystem from './audio-system.js';

class QuestSystem {
  constructor() {
    this._listeners = [];
  }

  /**
   * 注册事件监听
   */
  on(event, fn) { this._listeners.push({ event, fn }); }
  _emit(event, data) { this._listeners.filter(l => l.event === event).forEach(l => l.fn(data)); }

  /**
   * 接取任务
   */
  static accept(questId) { return QuestSystem._inst.accept(questId); }
  accept(questId) {
    const tpl = QUESTS[questId];
    if (!tpl) return console.warn('未知任务:', questId);

    // 检查前置
    if (tpl.prerequisite) {
      const pre = Save.get(`quests.${tpl.prerequisite}`);
      if (!pre || pre.status !== 'completed') {
        console.warn(`[Quest] ${questId} 需要先完成 ${tpl.prerequisite}`);
        return;
      }
    }

    const cur = Save.get(`quests.${questId}`);
    if (cur && cur.status !== 'not_started') return;

    // 初始化进度（兼容 q001 数字型 / q002 对象型）
    const initialProgress = typeof tpl.initialProgress === 'function'
      ? tpl.initialProgress()
      : 0;

    const newQuest = {
      id: questId,
      status: 'active',
      progress: initialProgress,
      acceptedAt: Date.now()
    };

    // q001 老格式兼容
    if (!tpl.initialProgress) {
      newQuest.progress = { count: 0, need: tpl.target.need };
    }

    Save.set(`quests.${questId}`, newQuest);
    Save.commit();
    console.log('✨ 接到任务:', tpl.name || tpl.title);
    this._showFloatText(`✨ 新任务：${tpl.name || tpl.title}`);
    AudioSystem.playQuestAccept();
  }

  /**
   * 卖鱼时更新任务进度（q003 onFishSold 钩子）
   */
  static onFishSold(soldData) { return QuestSystem._inst.onFishSold(soldData); }
  onFishSold(soldData) {
    const allQuests = Save.get('quests') || {};
    Object.entries(allQuests).forEach(([questId, q]) => {
      if (q.status !== 'active') return;
      const def = QUESTS[questId];
      if (!def || !def.onFishSold) return;

      const result = def.onFishSold(q.progress, soldData);
      if (result.updated) {
        q.progress = result.progress;
        Save.set(`quests.${questId}`, q);
        this._emit('quest_progress', { questId, progress: q.progress });
        if (def.isComplete(q.progress)) {
          q.status = 'ready_to_turnin';
          Save.set(`quests.${questId}`, q);
          this._emit('quest_ready', { questId });
        }
      }
    });
    Save.commit();
  }

  /**
   * 任务进度更新（钓鱼时调用）
   */
  static updateProgress(questId, fishSpecies) { return QuestSystem._inst.updateProgress(questId, fishSpecies); }
  updateProgress(questId, fishSpecies) {
    const q = Save.get(`quests.${questId}`);
    if (!q || q.status !== 'active') return;

    // q001 逻辑
    if (questId === 'q001_first_fish') {
      const tpl = QUESTS[questId];
      if (!tpl || !tpl.target || tpl.target.fish !== fishSpecies) return;
      // 确保 progress 是对象
      if (typeof q.progress !== 'object' || q.progress === null || Array.isArray(q.progress)) {
        q.progress = { count: 0, need: tpl.target.need };
      }
      q.progress.count = Math.min((q.progress.count || 0) + 1, q.progress.need || tpl.target.need);
      Save.set(`quests.${questId}`, q);
      Save.commit();
      console.log(`🎯 q001 进度：${q.progress.count}/${q.progress.need}`);
      return;
    }

    // q002 逻辑
    const tpl = QUESTS[questId];
    if (tpl && tpl.onFishCaught) {
      const result = tpl.onFishCaught(q.progress, fishSpecies);
      if (result.updated) {
        q.progress = result.progress;
        Save.set(`quests.${questId}`, q);
        Save.commit();
        console.log(`🎯 ${questId} 进度更新：${JSON.stringify(q.progress)}`);
      }
    }

    // q003: 检查是否完成
    if (questId === 'q003' && q.status === 'active') {
      const tpl3 = QUESTS.q003;
      if (tpl3 && tpl3.isComplete(q.progress)) {
        q.status = 'ready_to_turnin';
        Save.set(`quests.${questId}`, q);
        Save.commit();
        this._emit('quest_ready', { questId });
      }
    }
  }

  /**
   * 检查是否可完成
   */
  static canComplete(questId) { return QuestSystem._inst.canComplete(questId); }
  canComplete(questId) {
    const q = Save.get(`quests.${questId}`);
    if (!q) return false;

    // q001 逻辑
    if (questId === 'q001_first_fish') {
      if (q.status !== 'active') return false;
      const count = q.progress?.count || 0;
      return count >= 3;
    }

    // q002/q003 通用逻辑：active 或 ready_to_turnin 均视为可完成
    const tpl = QUESTS[questId];
    if (tpl && tpl.isComplete) {
      return (q.status === 'active' || q.status === 'ready_to_turnin') && tpl.isComplete(q.progress);
    }

    return false;
  }

  /**
   * 完成任务
   */
  static complete(questId) { return QuestSystem._inst.complete(questId); }
  complete(questId) {
    const tpl = QUESTS[questId];
    const q = Save.get(`quests.${questId}`);
    if (!q || (q.status !== 'active' && q.status !== 'ready_to_turnin')) return;
    if (!this.canComplete(questId)) return console.warn('任务未达成');

    q.status = 'completed';
    q.completedAt = Date.now();
    Save.set(`quests.${questId}`, q);

    // 发奖励
    if (tpl.reward) {
      // 金币奖励 — 统一走 inventory.coin（HUD 唯一数据源）。
      // 兼容历史 reward.money 字段：自动归并到 coin，不再写废弃 player.money。
      const coinReward = (tpl.reward.coin || 0) + (tpl.reward.money || 0);
      if (coinReward > 0) {
        if (window.inventory) {
          window.inventory.addCoin(coinReward);
        } else {
          const coin = (Save.get('player.coin') || 0) + coinReward;
          Save.set('player.coin', coin);
        }
      }
      // PHASE 16-6 仗3 补丁：q001 reward.bait 派发（历史遗留 bug —— 数据层声明了
      //   `bait: 5` 但派发逻辑从未实现）。统一映射到 inventory 的 basic_bait 堆叠物。
      //   严控范围：仅在此处加分支，不动其它 reward 派发逻辑。
      if (tpl.reward.bait && tpl.reward.bait > 0) {
        if (window.inventory) {
          window.inventory.add('basic_bait', tpl.reward.bait);
        } else {
          const inv = Save.get('player.inventory') || {};
          inv.basic_bait = (inv.basic_bait || 0) + tpl.reward.bait;
          Save.set('player.inventory', inv);
        }
      }
      // 物品奖励 — 优先走 inventory，向下兼容
      if (tpl.reward.items) {
        if (window.inventory) {
          tpl.reward.items.forEach(item => {
            window.inventory.add(item.id, item.count);
          });
        } else {
          tpl.reward.items.forEach(item => {
            const inv = Save.get('player.inventory') || {};
            inv[item.id] = (inv[item.id] || 0) + item.count;
            Save.set('player.inventory', inv);
          });
        }
      }
    }

    if (tpl.onCompleteFlag) Save.set(`flags.${tpl.onCompleteFlag}`, true);
    Save.commit();

    this._emit('quest_completed', { questId, reward: tpl.reward });

    console.log('✅ 任务完成:', tpl.name || tpl.title, '奖励：', tpl.reward);
    this._showFloatText(`✅ 任务完成 +${(tpl.reward.coin || 0) + (tpl.reward.money || 0)} 铜币`);
    AudioSystem.playQuestComplete();
  }

  /**
   * 获取任务状态
   */
  static getStatus(questId) { return QuestSystem._inst.getStatus(questId); }
  getStatus(questId) {
    const tpl = QUESTS[questId];
    // 有前置任务时，若前置未完成则视为未接取（不显示头顶标记）
    if (tpl && tpl.prerequisite) {
      const preQ = Save.get(`quests.${tpl.prerequisite}`);
      if (!preQ || preQ.status !== 'completed') return 'not_started';
    }

    const q = Save.get(`quests.${questId}`);
    if (!q) return 'not_started';
    if (q.status === 'completed') return 'completed';
    if (q.status === 'active') {
      if (this.canComplete(questId)) return 'available_to_complete';
      return 'active';
    }
    return 'not_started';
  }

  /**
   * 获取任务数据
   */
  static getQuest(questId) { return QuestSystem._inst.getQuest(questId); }
  getQuest(questId) {
    return Save.get(`quests.${questId}`) || null;
  }

  /**
   * 获取所有进行中任务
   */
  static getActiveQuests() { return QuestSystem._inst.getActiveQuests(); }
  getActiveQuests() {
    const all = Save.get('quests') || {};
    return Object.values(all).filter(q => q.status === 'active');
  }

  /**
   * 获取任务进度文本
   */
  static getProgressText(questId) { return QuestSystem._inst.getProgressText(questId); }
  getProgressText(questId) {
    const tpl = QUESTS[questId];
    const q = this.getQuest(questId);
    if (!q || q.status !== 'active') return '';

    if (questId === 'q001_first_fish') {
      const count = q.progress?.count || 0;
      return `🎯 奇力鱼 ${count}/3`;
    }

    if (tpl && tpl.getProgressText) {
      return tpl.getProgressText(q.progress);
    }

    return '';
  }

  _showFloatText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `
      position: absolute;
      top: 30%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 56px;
      color: #FFD700;
      font-family: 'TencentSans', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Heiti SC', sans-serif;
      text-shadow: 0 0 8px #000, 0 0 16px #000;
      pointer-events: none;
      z-index: 1000;
      animation: floatFade 2.4s ease-out forwards;
    `;
    document.getElementById('game-root')?.appendChild(div);

    if (!document.getElementById('quest-float-style')) {
      const style = document.createElement('style');
      style.id = 'quest-float-style';
      style.textContent = `
        @keyframes floatFade {
          0%   { opacity: 0; transform: translate(-50%, 30%) scale(0.6); }
          20%  { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
          35%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
          85%  { opacity: 1; transform: translate(-50%, -60%) scale(1.0); }
          100% { opacity: 0; transform: translate(-50%, -90%) scale(1.0); }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => div.remove(), 2400);
  }
}

const instance = new QuestSystem();
QuestSystem._inst = instance;
export default instance;
