// 音频管理器 - 使用 Web Audio API 生成舒缓村庄背景音乐

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.isPlaying = false;
    this.currentNodes = [];
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 1.0;
    this.musicGain.connect(this.masterGain);

    // 浏览器自动播放策略：首次用户交互后恢复 AudioContext
    if (this.ctx.state === 'suspended') {
      const resume = () => {
        this.ctx.resume();
        document.removeEventListener('click', resume);
        document.removeEventListener('keydown', resume);
      };
      document.addEventListener('click', resume);
      document.addEventListener('keydown', resume);
    }
  }

  // 播放舒缓的村庄背景音乐（使用简单的和弦循环）
  async playVillageBGM() {
    this.init();
    if (this.isPlaying) return;

    this.isPlaying = true;
    
    // 简单的五声音阶和弦进行：C - G - Am - F
    const progression = [
      { notes: [261.63, 329.63, 392.00], duration: 4 },  // C
      { notes: [196.00, 246.94, 293.66], duration: 4 },  // G
      { notes: [220.00, 261.63, 329.63], duration: 4 },  // Am
      { notes: [174.61, 220.00, 261.63], duration: 4 },  // F
    ];

    const playChord = (notes, duration) => {
      return new Promise(resolve => {
        notes.forEach((freq, i) => {
          setTimeout(() => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.5);
            gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + duration - 1);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
            
            osc.connect(gain);
            gain.connect(this.musicGain);
            
            osc.start(this.ctx.currentTime);
            osc.stop(this.ctx.currentTime + duration);
            
            this.currentNodes.push({ osc, gain });
          }, i * 200);
        });
        
        setTimeout(resolve, duration * 1000);
      });
    };

    const loop = async () => {
      if (!this.isPlaying) return;
      
      for (const chord of progression) {
        if (!this.isPlaying) break;
        await playChord(chord.notes, chord.duration);
      }
      
      if (this.isPlaying) {
        setTimeout(loop, 500);
      }
    };

    loop();
  }

  stop() {
    this.isPlaying = false;
    this.currentNodes.forEach(node => {
      try {
        node.osc.stop();
      } catch (e) {}
    });
    this.currentNodes = [];
  }

  setVolume(vol) {
    if (this.masterGain) {
      this.masterGain.gain.value = vol;
    }
  }
}

const audioManager = new AudioManager();
export default audioManager;