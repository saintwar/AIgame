/**
 * GM 命令系统 v1.0
 * 模块化注册架构，支持任务、物品、玩家、系统四类调试命令
 *
 * 使用方式（浏览器控制台）：
 *   GM.run('quest complete q001_first_fish')
 *   GM.run('item add fish:鲤鱼 5')
 *   GM.run('player money 999')
 *   GM.help()              // 列出所有命令
 *   GM.help('quest')      // 列出 quest 类命令
 */

import Save from './save-system.js';
import { QUESTS } from './data/quests.js';
import AudioSystem from './audio-system.js';

// ============================================================
// GM 命令结果类型
// ============================================================
const ResultType = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARN: 'warn'
};

function makeResult(type, message, data = null) {
  const styled = {
    type,
    message,
    data,
    timestamp: Date.now()
  };
  const styles = {
    success: 'color:#4CAF50;font-weight:bold',
    error: 'color:#f44336;font-weight:bold',
    info: 'color:#2196F3',
    warn: 'color:#ff9800;font-weight:bold'
  };
  console.log(`%c[GM] ${message}`, styles[type] || '', data || '');
  return styled;
}

// ============================================================
// 参数解析器
// ============================================================
class ArgParser {
  /**
   * 解析 "key=value key2=value2 ..." 格式
   * 也支持纯位置参数按顺序映射到 schema
   */
  static parse(rawArgs, schema) {
    const positional = [];
    const named = {};
    const rest = [];

    for (const token of rawArgs) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        const key = token.slice(0, eqIdx).trim();
        const value = token.slice(eqIdx + 1).trim();
        named[key] = this._cast(value);
      } else {
        positional.push(token);
      }
    }

    // 按 schema 顺序填充位置参数
    const params = {};
    schema.forEach((field, i) => {
      if (i < positional.length) {
        params[field.name] = this._cast(positional[i]);
      } else if (field.default !== undefined) {
        params[field.name] = field.default;
      }
    });

    // 验证必填
    for (const field of schema) {
      if (field.required && params[field.name] === undefined) {
        return { error: `缺少必填参数: ${field.name}` };
      }
    }

    return { params, named: { ...params, ...named } };
  }

  static _cast(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }
}

// ============================================================
// GM 命令基类
// ============================================================
class GMCommand {
  constructor({ name, category, description, usage, schema = [], aliases = [] }) {
    this.name = name;
    this.category = category;    // 'quest' | 'item' | 'player' | 'system'
    this.description = description;
    this.usage = usage;           // e.g. 'quest complete <questId>'
    this.schema = schema;        // [{ name, type, required, default }]
    this.aliases = aliases;
  }

  /** 子类实现具体逻辑 */
  execute(args) { return makeResult(ResultType.ERROR, '未实现'); }
}

// ============================================================
// 任务命令
// ============================================================
class CmdQuestComplete extends GMCommand {
  constructor() {
    super({
      name: 'quest complete',
      category: 'quest',
      description: '完成任务（立即完成，不检查条件）',
      usage: 'quest complete <questId>',
      schema: [{ name: 'questId', required: true }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const q = Save.get(`quests.${named.questId}`);
    if (!q) return makeResult(ResultType.ERROR, `任务不存在: ${named.questId}`);
    if (q.status === 'completed') return makeResult(ResultType.WARN, `任务已处于完成状态: ${named.questId}`);

    q.status = 'completed';
    q.completedAt = Date.now();
    Save.set(`quests.${named.questId}`, q);
    Save.commit();

    // 同时设置 onCompleteFlag（与 QuestSystem.complete 保持一致）
    const tpl = QUESTS[named.questId];
    if (tpl?.onCompleteFlag) Save.set(`flags.${tpl.onCompleteFlag}`, true);
    Save.commit();

    return makeResult(ResultType.SUCCESS, `✅ 任务完成: ${tpl?.name || tpl?.title || named.questId}`, q);
  }
}

class CmdQuestReset extends GMCommand {
  constructor() {
    super({
      name: 'quest reset',
      category: 'quest',
      description: '重置任务状态为未接取（可重新接取）',
      usage: 'quest reset <questId>',
      schema: [{ name: 'questId', required: true }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const tpl = QUESTS[named.questId];
    if (!tpl) return makeResult(ResultType.ERROR, `任务模板不存在: ${named.questId}`);

    const initialProgress = typeof tpl.initialProgress === 'function' ? tpl.initialProgress() : 0;
    const newQuest = {
      id: named.questId,
      status: 'not_started',
      progress: initialProgress,
      acceptedAt: null,
      completedAt: null
    };

    Save.set(`quests.${named.questId}`, newQuest);
    Save.commit();
    return makeResult(ResultType.SUCCESS, `🔄 任务已重置: ${tpl.name || tpl.title || named.questId}`, newQuest);
  }
}

class CmdQuestActivate extends GMCommand {
  constructor() {
    super({
      name: 'quest activate',
      category: 'quest',
      description: '强制激活任务（跳过前置条件检查）',
      usage: 'quest activate <questId>',
      schema: [{ name: 'questId', required: true }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const tpl = QUESTS[named.questId];
    if (!tpl) return makeResult(ResultType.ERROR, `任务模板不存在: ${named.questId}`);

    const initialProgress = typeof tpl.initialProgress === 'function' ? tpl.initialProgress() : 0;
    const newQuest = {
      id: named.questId,
      status: 'active',
      progress: initialProgress,
      acceptedAt: Date.now()
    };

    Save.set(`quests.${named.questId}`, newQuest);
    Save.commit();
    return makeResult(ResultType.SUCCESS, `🎯 任务已激活: ${tpl.name || tpl.title || named.questId}`, newQuest);
  }
}

class CmdQuestSetProgress extends GMCommand {
  constructor() {
    super({
      name: 'quest setprogress',
      category: 'quest',
      description: '直接修改任务进度值（用于快速调试）',
      usage: 'quest setprogress <questId> <count>',
      schema: [
        { name: 'questId', required: true },
        { name: 'count', required: true }
      ]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const q = Save.get(`quests.${named.questId}`);
    if (!q) return makeResult(ResultType.ERROR, `任务不存在: ${named.questId}`);

    const tpl = QUESTS[named.questId];
    if (named.questId === 'q001_first_fish') {
      q.progress = q.progress || { count: 0, need: tpl?.target?.need || 3 };
      q.progress.count = Math.max(0, Math.min(named.count, q.progress.need || 3));
    } else if (tpl && tpl.targetSpecies) {
      // q002 风格：将前 count 个鱼种设为 true
      tpl.targetSpecies.forEach((sp, i) => {
        if (q.progress && typeof q.progress === 'object') {
          if (i < named.count) q.progress[sp] = true;
          else q.progress[sp] = false;
        }
      });
    } else {
      q.progress = named.count;
    }

    Save.set(`quests.${named.questId}`, q);
    Save.commit();
    return makeResult(ResultType.SUCCESS, `📊 进度已更新: ${named.questId} → ${JSON.stringify(q.progress)}`, q);
  }
}

class CmdQuestList extends GMCommand {
  constructor() {
    super({
      name: 'quest list',
      category: 'quest',
      description: '列出所有任务及其当前状态',
      usage: 'quest list',
      schema: []
    });
  }

  execute() {
    const all = Save.get('quests') || {};
    const rows = Object.entries(QUESTS).map(([id, tpl]) => {
      const q = all[id];
      let status = '❌ 未定义';
      let progress = '-';
      if (q) {
        const statusMap = { not_started: '⏳ 未接取', active: '🔄 进行中', completed: '✅ 已完成' };
        status = statusMap[q.status] || `❓ ${q.status}`;
        if (id === 'q001_first_fish' && q.progress?.count !== undefined) {
          progress = `${q.progress.count}/${q.progress.need || 3}`;
        } else if (q.progress && typeof q.progress === 'object') {
          const got = Object.values(q.progress).filter(v => v === true).length;
          progress = `${got}/${Object.keys(q.progress).length}`;
        }
      }
      return { id, name: tpl.name || tpl.title || id, status, progress };
    });

    console.table(rows);
    return makeResult(ResultType.INFO, `📋 共 ${rows.length} 个任务`, rows);
  }
}

// ============================================================
// 物品命令
// ============================================================
class CmdItemAdd extends GMCommand {
  constructor() {
    super({
      name: 'item add',
      category: 'item',
      description: '向背包添加物品',
      usage: 'item add <itemId> [count=1]',
      aliases: ['item give'],
      schema: [
        { name: 'itemId', required: true },
        { name: 'count', default: 1 }
      ]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const inv = Save.get('player.inventory') || {};
    inv[named.itemId] = (inv[named.itemId] || 0) + named.count;
    Save.set('player.inventory', inv);
    Save.commit();

    return makeResult(ResultType.SUCCESS, `🎁 +${named.count} × ${named.itemId}（当前: ${inv[named.itemId]}）`);
  }
}

class CmdItemRemove extends GMCommand {
  constructor() {
    super({
      name: 'item remove',
      category: 'item',
      description: '从背包删除指定数量物品',
      usage: 'item remove <itemId> [count=1]',
      aliases: ['item del'],
      schema: [
        { name: 'itemId', required: true },
        { name: 'count', default: 1 }
      ]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const inv = Save.get('player.inventory') || {};
    const current = inv[named.itemId] || 0;
    const removed = Math.min(current, named.count);
    inv[named.itemId] = current - removed;

    if (inv[named.itemId] <= 0) delete inv[named.itemId];
    Save.set('player.inventory', inv);
    Save.commit();

    return makeResult(ResultType.SUCCESS, `🗑️ -${removed} × ${named.itemId}（剩余: ${inv[named.itemId] || 0}）`);
  }
}

class CmdItemClear extends GMCommand {
  constructor() {
    super({
      name: 'item clear',
      category: 'item',
      description: '清空整个背包',
      usage: 'item clear',
      schema: []
    });
  }

  execute() {
    const old = Save.get('player.inventory') || {};
    Save.set('player.inventory', {});
    Save.commit();
    return makeResult(ResultType.WARN, `🗑️ 背包已清空（原有 ${Object.keys(old).length} 个物品）`, old);
  }
}

class CmdItemList extends GMCommand {
  constructor() {
    super({
      name: 'item list',
      category: 'item',
      description: '列出背包中所有物品',
      usage: 'item list',
      aliases: ['inv'],
      schema: []
    });
  }

  execute() {
    const inv = Save.get('player.inventory') || {};
    const rows = Object.entries(inv)
      .filter(([, v]) => v > 0)
      .map(([id, count]) => ({ itemId: id, count }));

    if (rows.length === 0) {
      return makeResult(ResultType.INFO, '🎒 背包是空的');
    }
    console.table(rows);
    return makeResult(ResultType.INFO, `🎒 共 ${rows.length} 种物品`, rows);
  }
}

class CmdItemUnlock extends GMCommand {
  constructor() {
    super({
      name: 'item unlock',
      category: 'item',
      description: '强制解锁物品获取条件标志',
      usage: 'item unlock <flagKey>',
      schema: [{ name: 'flagKey', required: true }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    Save.set(`flags.${named.flagKey}`, true);
    Save.commit();
    return makeResult(ResultType.SUCCESS, `🔓 已解锁标志: flags.${named.flagKey} = true`);
  }
}

// ============================================================
// 玩家命令
// ============================================================
class CmdPlayerMoney extends GMCommand {
  constructor() {
    super({
      name: 'player money',
      category: 'player',
      description: '设置玩家金币数量',
      usage: 'player money <amount>',
      aliases: ['money'],
      schema: [{ name: 'amount', required: true }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    // PHASE 16-6 经济统一：金币以 player.coin 为唯一数据源（HUD 读这个）。
    //   优先走 inventory.addCoin/setCoin，老路径作为兜底。
    const old = (window.inventory && window.inventory.getCoin())
      ?? (Save.get('player.coin') || 0);
    if (window.inventory) {
      // setCoin 直接置数（差值通过 addCoin 实现以触发事件 + bump 动画）
      window.inventory.addCoin(named.amount - old);
    } else {
      Save.set('player.coin', named.amount);
      Save.commit();
    }
    return makeResult(ResultType.SUCCESS, `💰 金币: ${old} → ${named.amount}`);
  }
}

class CmdPlayerBait extends GMCommand {
  constructor() {
    super({
      name: 'player bait',
      category: 'player',
      description: '设置玩家鱼饵数量',
      usage: 'player bait <count>',
      schema: [{ name: 'count', required: true }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const inv = Save.get('player.inventory') || {};
    const old = inv.bait || 0;
    inv.bait = Math.max(0, named.count);
    Save.set('player.inventory', inv);
    Save.commit();
    return makeResult(ResultType.SUCCESS, `🎣 鱼饵: ${old} → ${inv.bait}`);
  }
}

class CmdPlayerStatus extends GMCommand {
  constructor() {
    super({
      name: 'player status',
      category: 'player',
      description: '显示玩家当前状态信息',
      usage: 'player status',
      aliases: ['status'],
      schema: []
    });
  }

  execute() {
    // PHASE 16-6 经济统一：读 player.coin（HUD 唯一数据源）
    const money = (window.inventory && window.inventory.getCoin())
      ?? (Save.get('player.coin') || 0);
    const inv = Save.get('player.inventory') || {};
    const flags = Save.get('flags') || {};
    const lastScene = Save.get('lastScene') || 'unknown';

    const info = { money, bait: inv.bait || 0, items: Object.keys(inv).filter(k => k !== 'fish'), flagCount: Object.keys(flags).length, lastScene };
    console.table(info);
    return makeResult(ResultType.INFO, '👤 玩家状态', info);
  }
}

// ============================================================
// 系统命令
// ============================================================
class CmdSystemSave extends GMCommand {
  constructor() {
    super({
      name: 'system save',
      category: 'system',
      description: '手动保存当前存档',
      usage: 'system save',
      schema: []
    });
  }

  execute() {
    Save.commit();
    return makeResult(ResultType.SUCCESS, '💾 存档已保存');
  }
}

class CmdSystemReset extends GMCommand {
  constructor() {
    super({
      name: 'system reset',
      category: 'system',
      description: '完全重置存档（慎用！）',
      usage: 'system reset',
      schema: []
    });
  }

  execute() {
    Save.reset();
    return makeResult(ResultType.WARN, '⚠️ 存档已完全重置，页面将刷新...');
  }
}

class CmdSystemReload extends GMCommand {
  constructor() {
    super({
      name: 'system reload',
      category: 'system',
      description: '重新加载存档并刷新页面',
      usage: 'system reload',
      aliases: ['reload'],
      schema: []
    });
  }

  execute() {
    Save.load();
    return makeResult(ResultType.INFO, '🔄 存档已重新加载');
  }
}

class CmdSystemFlag extends GMCommand {
  constructor() {
    super({
      name: 'system flag',
      category: 'system',
      description: '设置或查询游戏标志位',
      usage: 'system flag <key> [value]',
      schema: [
        { name: 'key', required: true },
        { name: 'value', default: true }
      ]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    if (args.length === 1) {
      // 仅查询
      const val = Save.get(`flags.${named.key}`);
      return makeResult(ResultType.INFO, `🔍 flags.${named.key} = ${JSON.stringify(val)}`, val);
    }

    Save.set(`flags.${named.key}`, named.value);
    Save.commit();
    return makeResult(ResultType.SUCCESS, `🔧 flags.${named.key} = ${JSON.stringify(named.value)}`);
  }
}

class CmdSystemFlags extends GMCommand {
  constructor() {
    super({
      name: 'system flags',
      category: 'system',
      description: '列出所有游戏标志位',
      usage: 'system flags',
      aliases: ['flags'],
      schema: []
    });
  }

  execute() {
    const flags = Save.get('flags') || {};
    const rows = Object.entries(flags).map(([k, v]) => ({ key: k, value: JSON.stringify(v) }));
    if (rows.length === 0) {
      return makeResult(ResultType.INFO, '📋 暂无标志位记录');
    }
    console.table(rows);
    return makeResult(ResultType.INFO, `📋 共 ${rows.length} 个标志位`, rows);
  }
}

// ============================================================
// 鱼类命令
// ============================================================
class CmdFishForceCatch extends GMCommand {
  constructor() {
    super({
      name: 'fish forcecatch',
      category: 'fish',
      description: '强制捕获指定鱼类（跳过所有钓鱼过程）',
      usage: 'fish forcecatch <fishId>',
      aliases: ['fish catch'],
      schema: [{ name: 'fishId', required: false }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    // 从 SceneManager 获取当前钓鱼场景
    const scene = window.SceneManager?.currentScene;
    if (!scene || scene.id !== 'fishing') {
      return makeResult(ResultType.ERROR, '当前不在钓鱼场景中，请先切换到钓鱼场景');
    }

    // 内置鱼种池
    const fishPool = [
      { id: 'f1', name: '吴郭鱼', rarity: 1, color: '#8B7D6B', size: [24, 12], price: 15, weight: 0.3 },
      { id: 'f2', name: '草鱼', rarity: 2, color: '#6B8E23', size: [36, 18], price: 45, weight: 0.8 },
      { id: 'f3', name: '奇力鱼', rarity: 3, color: '#4682B4', size: [48, 24], price: 120, weight: 1.5 },
      { id: 'f4', name: '总统鱼', rarity: 4, color: '#9370DB', size: [72, 36], price: 500, weight: 3.0 },
      { id: 'f5', name: '日月潭鱼王', rarity: 5, color: '#FFD700', size: [96, 48], price: 3000, weight: 8.0, legendary: true },
    ];

    const fishId = named.fishId || fishPool[Math.floor(Math.random() * fishPool.length)].id;
    const fish = fishPool.find(f => f.id === fishId) || fishPool[0];

    scene._forceCatchFish(fish);
    return makeResult(ResultType.SUCCESS, `🐟 强制捕获: ${fish.name} (${fish.rarity}★, ${fish.weight}kg, $${fish.price})`, fish);
  }
}

class CmdFishCaughtList extends GMCommand {
  constructor() {
    super({
      name: 'fish list',
      category: 'fish',
      description: '列出玩家渔获历史',
      usage: 'fish list',
      aliases: ['fishlog'],
      schema: []
    });
  }

  execute() {
    const inventory = Save.get('inventory') || {};
    const fishList = inventory.fish || [];

    if (fishList.length === 0) {
      return makeResult(ResultType.INFO, '🐟 暂无渔获记录');
    }

    const rows = fishList.map((f, i) => ({
      '#': i + 1,
      species: f.species || f.id || '?',
      weight: f.weight ? `${f.weight}kg` : '-',
      price: f.price ? `$${f.price}` : '-',
      rarity: f.rarity ? '★'.repeat(f.rarity) : '-',
      time: f.caughtAt ? new Date(f.caughtAt).toLocaleString('zh-CN') : '-'
    }));

    console.table(rows);
    return makeResult(ResultType.INFO, `🐟 共 ${fishList.length} 条渔获记录`, rows);
  }
}

class CmdFishClear extends GMCommand {
  constructor() {
    super({
      name: 'fish clear',
      category: 'fish',
      description: '清空所有渔获记录',
      usage: 'fish clear',
      schema: []
    });
  }

  execute() {
    const old = Save.get('inventory.fish') || [];
    Save.set('inventory.fish', []);
    Save.commit();
    return makeResult(ResultType.WARN, `🗑️ 已清空渔获记录（原有 ${old.length} 条）`, old);
  }
}

class CmdFishCatchAll extends GMCommand {
  constructor() {
    super({
      name: 'fish catchall',
      category: 'fish',
      description: '将所有鱼种各添加一条到渔获记录',
      usage: 'fish catchall',
      schema: []
    });
  }

  execute() {
    const fishPool = [
      { id: 'f1', name: '吴郭鱼', rarity: 1, color: '#8B7D6B', size: [24, 12], price: 15, weight: 0.3 },
      { id: 'f2', name: '草鱼', rarity: 2, color: '#6B8E23', size: [36, 18], price: 45, weight: 0.8 },
      { id: 'f3', name: '奇力鱼', rarity: 3, color: '#4682B4', size: [48, 24], price: 120, weight: 1.5 },
      { id: 'f4', name: '总统鱼', rarity: 4, color: '#9370DB', size: [72, 36], price: 500, weight: 3.0 },
      { id: 'f5', name: '日月潭鱼王', rarity: 5, color: '#FFD700', size: [96, 48], price: 3000, weight: 8.0, legendary: true },
    ];

    const inventory = Save.get('inventory') || { fish: [] };
    const now = Date.now();
    const added = fishPool.map(f => ({
      id: f.id,
      species: f.name,
      rarity: f.rarity,
      weight: f.weight,
      price: f.price,
      caughtAt: now
    }));

    inventory.fish = (inventory.fish || []).concat(added);
    Save.set('inventory', inventory);
    Save.commit();

    return makeResult(ResultType.SUCCESS, `🐟 已添加 ${added.length} 种鱼类各1条`, added);
  }
}

// ============================================================
// 场景命令
// ============================================================
class CmdSceneSwitch extends GMCommand {
  constructor() {
    super({
      name: 'scene switch',
      category: 'scene',
      description: '切换到指定场景',
      usage: 'scene switch <sceneId>',
      aliases: ['scene goto', 'goto'],
      schema: [{ name: 'sceneId', required: true }]
    });
  }

  execute(args) {
    const { error, named } = ArgParser.parse(args, this.schema);
    if (error) return makeResult(ResultType.ERROR, error);

    const sceneId = named.sceneId.toLowerCase();
    const validScenes = ['village', 'fishing'];
    if (!validScenes.includes(sceneId)) {
      return makeResult(ResultType.ERROR, `未知场景: ${sceneId}，可用: ${validScenes.join(', ')}`);
    }

    Save.set('lastScene', sceneId);
    Save.commit();

    if (window.SceneManager) {
      window.SceneManager.switchToInstant(sceneId);
      return makeResult(ResultType.SUCCESS, `🗺️ 正在切换到场景: ${sceneId}`);
    }

    return makeResult(ResultType.ERROR, 'SceneManager 未初始化');
  }
}

class CmdSceneReload extends GMCommand {
  constructor() {
    super({
      name: 'scene reload',
      category: 'scene',
      description: '重新加载当前场景',
      usage: 'scene reload',
      aliases: ['reload-scene'],
      schema: []
    });
  }

  execute() {
    const current = window.SceneManager?.currentScene?.id || Save.get('lastScene') || 'village';
    if (window.SceneManager) {
      window.SceneManager.switchToInstant(current);
      return makeResult(ResultType.SUCCESS, `🔄 场景已重新加载: ${current}`);
    }
    return makeResult(ResultType.ERROR, 'SceneManager 未初始化');
  }
}

class CmdSceneInfo extends GMCommand {
  constructor() {
    super({
      name: 'scene info',
      category: 'scene',
      description: '显示当前场景详细信息',
      usage: 'scene info',
      aliases: ['scene where'],
      schema: []
    });
  }

  execute() {
    const scene = window.SceneManager?.currentScene;
    if (!scene) return makeResult(ResultType.ERROR, '当前无活动场景');

    const info = {
      id: scene.id || 'unknown',
      currentScene: scene.id,
      fsm: scene.fsm?.current || 'N/A',
      player: scene.player ? {
        px: scene.player.px,
        py: scene.player.py,
        direction: scene.player.direction
      } : 'N/A',
      characterX: scene.characterX || 'N/A',
      characterY: scene.characterY || 'N/A',
      time: scene.time ? scene.time.toFixed(2) + 's' : 'N/A',
    };

    console.table(info);
    return makeResult(ResultType.INFO, '🗺️ 当前场景信息', info);
  }
}

// ============================================================
// GM 主控制器
// ============================================================
class GMController {
  constructor() {
    /** @type {Map<string, GMCommand>} */
    this._commands = new Map();
    this._categoryMap = new Map();
    this._aliasMap = new Map();

    this._registerDefaultCommands();
  }

  _registerDefaultCommands() {
    const commands = [
      // 任务
      new CmdQuestComplete(),
      new CmdQuestReset(),
      new CmdQuestActivate(),
      new CmdQuestSetProgress(),
      new CmdQuestList(),
      // 物品
      new CmdItemAdd(),
      new CmdItemRemove(),
      new CmdItemClear(),
      new CmdItemList(),
      new CmdItemUnlock(),
      // 玩家
      new CmdPlayerMoney(),
      new CmdPlayerBait(),
      new CmdPlayerStatus(),
      // 鱼类
      new CmdFishForceCatch(),
      new CmdFishCaughtList(),
      new CmdFishClear(),
      new CmdFishCatchAll(),
      // 场景
      new CmdSceneSwitch(),
      new CmdSceneReload(),
      new CmdSceneInfo(),
      // 系统
      new CmdSystemSave(),
      new CmdSystemReset(),
      new CmdSystemReload(),
      new CmdSystemFlag(),
      new CmdSystemFlags(),
    ];

    commands.forEach(cmd => this.register(cmd));
  }

  /** 注册命令 */
  register(command) {
    this._commands.set(command.name, command);

    // 建立别名映射
    const primaryName = command.name;
    command.aliases?.forEach(alias => {
      this._aliasMap.set(alias, primaryName);
    });

    // 按分类索引
    if (!this._categoryMap.has(command.category)) {
      this._categoryMap.set(command.category, []);
    }
    this._categoryMap.get(command.category).push(command);
  }

  /** 执行 GM 命令字符串 */
  run(input) {
    if (!input || typeof input !== 'string') {
      return makeResult(ResultType.ERROR, '请输入有效命令，例: GM.run("help")');
    }

    const trimmed = input.trim();
    if (!trimmed) return makeResult(ResultType.ERROR, '命令不能为空');

    // 解析：支持 'quest complete q001' 或 'quest.complete q001'
    const parts = trimmed.split(/\s+/);
    let cmdKey = parts[0].toLowerCase();
    const args = parts.slice(1);

    // 处理子命令：'quest.complete' → 'quest complete'
    if (cmdKey.includes('.')) {
      cmdKey = cmdKey.replace('.', ' ');
    }

    // 别名解析
    if (this._aliasMap.has(cmdKey)) {
      cmdKey = this._aliasMap.get(cmdKey);
    }

    // 支持 "quest.complete" 形式
    const spaced = cmdKey.includes('.') ? cmdKey.replace('.', ' ') : cmdKey;

    // 精准匹配
    const cmd = this._commands.get(spaced);
    if (cmd) return cmd.execute(args);

    // 前缀匹配（支持 'quest q001' 展开为 'quest complete q001'）
    const prefixMatch = [...this._commands.keys()].find(k => k.startsWith(spaced + ' '));
    if (prefixMatch) {
      // prefixMatch 如 "quest complete"，需要去掉 cmdKey 和子命令前缀
      const prefixParts = prefixMatch.split(/\s+/);
      const fullArgs = trimmed.split(/\s+/).slice(prefixParts.length);
      return this._commands.get(prefixMatch).execute(fullArgs);
    }

    // 模糊匹配建议
    const suggestions = [...this._commands.keys()]
      .filter(k => k.includes(spaced) || spaced.includes(k.split(' ')[0]))
      .slice(0, 5);

    const msg = suggestions.length > 0
      ? `未知命令: "${trimmed}"，是否指: ${suggestions.join(', ')}`
      : `未知命令: "${trimmed}"，输入 GM.help() 查看所有命令`;

    return makeResult(ResultType.ERROR, msg);
  }

  /** 列出帮助 */
  help(categoryOrCommand) {
    if (!categoryOrCommand) {
      return this._printAllHelp();
    }

    const key = categoryOrCommand.toLowerCase();

    // 分类帮助
    if (this._categoryMap.has(key)) {
      const cmds = this._categoryMap.get(key);
      return this._printCategoryHelp(key, cmds);
    }

    // 单命令帮助
    const cmdName = this._aliasMap.has(key) ? this._aliasMap.get(key) : key;
    const cmd = this._commands.get(cmdName) || [...this._commands.values()].find(c => c.name.includes(key));
    if (cmd) return this._printCommandHelp(cmd);

    return makeResult(ResultType.ERROR, `未找到命令或分类: ${key}`);
  }

  _printAllHelp() {
    const categories = [...this._categoryMap.entries()];
    let output = '\n%c🛠️  GM 命令系统 v1.0 — 命令列表\n';
    output += '━'.repeat(55) + '\n';

    const categoryLabels = {
      quest: '📋 任务',
      item: '🎒 物品',
      player: '👤 玩家',
      fish: '🐟 鱼类',
      scene: '🗺️ 场景',
      system: '⚙️  系统'
    };

    const styles = {
      quest: 'color:#2196F3',
      item: 'color:#FF9800',
      player: 'color:#4CAF50',
      fish: 'color:#00BCD4',
      scene: 'color:#8BC34A',
      system: 'color:#9C27B0'
    };

    categories.forEach(([cat, cmds]) => {
      output += `\n%c${categoryLabels[cat] || cat}\n`;
      output += '─'.repeat(40) + '\n';
      cmds.forEach(c => {
        const aliasStr = c.aliases?.length ? ` (别名: ${c.aliases.join(', ')})` : '';
        output += `%c  ${c.usage.padEnd(42)}%c ${c.description}\n`;
      });
    });

    output += '\n' + '━'.repeat(55) + '\n';
    output += '%c用法示例：\n';
    output += '  GM.run("quest complete q001_first_fish")\n';
    output += '  GM.run("item add fish:鲤鱼 5")\n';
    output += '  GM.run("player money 999")\n';
    output += '  GM.help("quest")    // 查看任务类命令\n';
    output += '  GM.help("item add") // 查看具体命令用法\n';

    console.log(output,
      'color:#FFD700;font-weight:bold',
      ...categories.flatMap(([cat]) => Array(categories.find(([c]) => c === cat)[1].length * 2 + 1).fill(styles[cat] || ''))
    );

    return makeResult(ResultType.INFO, `📖 帮助已输出至控制台，共 ${this._commands.size} 个命令`);
  }

  _printCategoryHelp(category, cmds) {
    console.log(`\n%c📋 ${category.toUpperCase()} 类命令\n${'─'.repeat(40)}`);
    cmds.forEach(c => {
      console.log(`%c  ${c.usage.padEnd(40)} %c${c.description}`,
        'color:#fff;background:#333;padding:2px 6px;border-radius:3px',
        'color:#aaa');
    });
    return makeResult(ResultType.INFO, `📋 ${category} 类共 ${cmds.length} 个命令`);
  }

  _printCommandHelp(cmd) {
    const aliasStr = cmd.aliases?.length ? `\n别名: ${cmd.aliases.join(', ')}` : '';
    const info = `
┌──────────────────────────────────────────┐
│ 🛠️  ${cmd.name.padEnd(40)} │
├──────────────────────────────────────────┤
│ 📖 ${cmd.description}
│ 📌 用法: ${cmd.usage}${aliasStr}
└──────────────────────────────────────────┘`;
    console.log(info);
    return makeResult(ResultType.INFO, `${cmd.name} 命令帮助已输出`);
  }

  /** 导出命令列表（供 UI 调用） */
  listCommands() {
    return [...this._commands.values()].map(c => ({
      name: c.name,
      category: c.category,
      description: c.description,
      usage: c.usage,
      aliases: c.aliases || []
    }));
  }
}

// ============================================================
// 导出单例
// ============================================================
const GM = new GMController();
export default GM;

// 自动挂载到 window（方便控制台直接访问）
if (typeof window !== 'undefined') {
  window.GM = GM;
}
