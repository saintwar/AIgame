import { ITEMS } from './data/items.js';

export class EquipmentSystem {
  constructor(player, inventory, saveSystem) {
    this.player = player;
    this.inventory = inventory;
    this.save = saveSystem;
    this.player.equipment = this.player.equipment || { rod: 'basic_rod' };
    this.listeners = [];
  }

  getEquippedRod() {
    const rodId = this.player.equipment.rod || 'basic_rod';
    return ITEMS[rodId] || ITEMS['basic_rod'];
  }

  // 装备钓竿（必须背包里有）
  equipRod(rodId) {
    if (!this.inventory.has(rodId)) {
      console.warn(`[Equip] 背包没有 ${rodId}`);
      return false;
    }
    if (!ITEMS[rodId] || ITEMS[rodId].category !== 'rod') return false;
    this.player.equipment.rod = rodId;
    this._emit('rod_changed', { rodId });
    this.save.commit();
    return true;
  }

  on(event, fn) { this.listeners.push({ event, fn }); }
  _emit(event, data) { this.listeners.filter(l => l.event === event).forEach(l => l.fn(data)); }
}
