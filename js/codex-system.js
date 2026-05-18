import { FISH_CODEX } from './data/fish-codex.js';

export class CodexSystem {
  constructor(player, saveSystem) {
    this.player = player;
    this.save = saveSystem;
    this.player.codex = this.player.codex || {};  // { 奇力鱼: { unlocked:true, firstAt, count, maxSize }, ... }
    this.listeners = [];
  }

  // 钓到鱼时调用
  onFishCaught({ species, size }) {
    if (!FISH_CODEX[species]) return { newUnlock: false };
    const entry = this.player.codex[species];
    const newUnlock = !entry;

    if (newUnlock) {
      this.player.codex[species] = {
        unlocked: true,
        firstAt: Date.now(),
        count: 1,
        maxSize: size || 0
      };
      this._emit('fish_unlocked', { species });
    } else {
      entry.count = (entry.count || 0) + 1;
      if (size && size > (entry.maxSize || 0)) {
        entry.maxSize = size;
      }
    }
    this.save.commit();
    return { newUnlock };
  }

  isUnlocked(species) {
    return !!(this.player.codex[species] && this.player.codex[species].unlocked);
  }

  getEntry(species) {
    return this.player.codex[species] || null;
  }

  getAllSpecies() {
    return Object.keys(FISH_CODEX);
  }

  getUnlockedCount() {
    return Object.values(this.player.codex).filter(e => e?.unlocked).length;
  }

  getTotalCount() {
    return Object.keys(FISH_CODEX).length;
  }

  on(event, fn) { this.listeners.push({ event, fn }); }
  _emit(event, data) { this.listeners.filter(l => l.event === event).forEach(l => l.fn(data)); }
}
