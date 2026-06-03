// 音频系统（Web Audio 程序化生成，零外部资源依赖）

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmGain = null;
    this.sfxGain = null;
    this.bgmVolume = 0.7;
    this.sfxVolume = 0.4;
    this.ambientNodes = [];
    this._pendingBGM = null;   // 因自动播放策略被挂起的 BGM
    this._gestureWaiters = []; // init() 在首次手势前调用时被挂起的 Promise resolve
    this._gestureBound = false;
  }

  /**
   * 同步创建 AudioContext + GainNodes（仅在手势事件回调同步代码中调用，
   * 这样浏览器才会把 ctx 直接置为 'running'，不打 autoplay warning）
   */
  _createCtxSync() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmVolume;
    this.bgmGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.ctx.destination);
  }

  /**
   * 绑定一次性的"首次手势"监听器（pointerdown / keydown）
   * 监听器内同步执行 _createCtxSync，避免 autoplay warning
   */
  _bindFirstGestureOnce() {
    if (this._gestureBound) return;
    this._gestureBound = true;

    const onGesture = () => {
      // 必须在事件回调"同步"代码里就 new AudioContext（不能 await 后再创建）
      this._createCtxSync();
      // 关键：resume() 也必须在同一个手势同步栈内调用，否则浏览器仍会打 warning。
      //   即使 ctx 是新建的，某些浏览器/版本会把 state 初始置为 'suspended'，
      //   必须当场 resume 才能保证不再触发 autoplay 警告。
      if (this.ctx && this.ctx.state === 'suspended') {
        // 不 await，直接发起；resume 是同步地"把请求登记到手势上下文"，
        // 后续 Promise resolve 异步完成即可。
        this.ctx.resume().catch(() => {});
      }
      // 解锁所有等待中的 init() 调用
      const waiters = this._gestureWaiters.slice();
      this._gestureWaiters.length = 0;
      // 异步唤醒，让 init() 的剩余逻辑（pending BGM 等）继续执行
      Promise.resolve().then(() => {
        for (const resolve of waiters) resolve();
      });
      // 一次性
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      window.removeEventListener('touchstart', onGesture, true);
    };
    // capture=true 抢在业务监听器之前，确保 ctx 一定先建好
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    window.addEventListener('touchstart', onGesture, true);
  }

  /**
   * 必须在用户首次交互时调用（浏览器策略）
   *   - 若已在手势回调内调用 → 直接同步创建 ctx，无 warning
   *   - 若在手势前调用（如模块加载阶段误调用）→ 挂起，等首次手势后再创建
   */
  async init() {
    // 在手势事件同步链路上调用：直接 new 即可（state 会是 running）
    if (!this.ctx) {
      // 检测是否处于"用户激活"上下文：navigator.userActivation.isActive（现代浏览器支持）
      // 退化策略：直接尝试同步创建；若浏览器后续把 state 置 suspended，
      // 我们在 _bindFirstGestureOnce 兜底里再 resume。
      const inUserGesture = !!(navigator.userActivation && navigator.userActivation.isActive);
      if (inUserGesture) {
        this._createCtxSync();
      } else {
        // 未在手势中：注册首次手势监听 + 挂起本次 init
        this._bindFirstGestureOnce();
        await new Promise(resolve => this._gestureWaiters.push(resolve));
      }
    }
    // 浏览器自动播放策略：必须在用户手势后 resume
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) { /* 仍未 ready，下次手势会再触发 */ }
    }
    // 恢复后尝试播放之前被阻止的 BGM
    if (this._pendingBGM) {
      const { src, loopStart, loopEnd } = this._pendingBGM;
      this._pendingBGM = null;
      this.playBGM(src, loopStart, loopEnd);
    }
  }

  /**
   * 播放村庄环境音（风声 + 鸟鸣）
   */
  playVillageAmbient() {
    if (!this.ctx) return;
    this.stopAmbient();

    // 风声：粉红噪声 + 低通滤波
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.15;
    }
    const wind = this.ctx.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    wind.connect(filter).connect(this.bgmGain);
    wind.start();
    this.ambientNodes.push(wind);

    // 鸟鸣：每 4-8 秒一次随机 chirp
    const birdLoop = () => {
      if (!this.ambientNodes.includes(wind)) return; // 已停止
      this._chirp();
      setTimeout(birdLoop, 4000 + Math.random() * 4000);
    };
    setTimeout(birdLoop, 2000);
  }

  /**
   * 播放钓鱼场景环境音（水声）
   */
  playFishingAmbient() {
    if (!this.ctx) return;
    this.stopAmbient();

    // 水声：白噪声 + 低通 + 缓慢调制
    const bufferSize = 2 * this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.1;
    const water = this.ctx.createBufferSource();
    water.buffer = buf;
    water.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    water.connect(filter).connect(this.bgmGain);
    water.start();
    this.ambientNodes.push(water);
  }

  stopAmbient() {
    this.ambientNodes.forEach(n => { try { n.stop(); } catch (e) { } });
    this.ambientNodes = [];
  }

  /**
   * 鸟鸣 chirp
   */
  _chirp() {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 1800 + Math.random() * 800;
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, this.ctx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, this.ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.18);
    osc.connect(gain).connect(this.bgmGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  /**
   * UI 音效：通用 beep
   */
  _beep(freq, dur, type = 'square', vol = 0.2) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(gain).connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  // 各种 UI 音效（命名清晰，方便业务调用）
  playDialogTick() { this._beep(800, 0.03, 'square', 0.15); }     // 打字机咔嗒
  playDialogNext() { this._beep(600, 0.08, 'sine', 0.15); }       // 翻页
  playMenuOpen() { this._beep(440, 0.1, 'sine', 0.2); setTimeout(() => this._beep(660, 0.12, 'sine', 0.2), 60); }
  playMenuClose() { this._beep(660, 0.08, 'sine', 0.2); setTimeout(() => this._beep(440, 0.1, 'sine', 0.2), 60); }
  playFootstep() { this._beep(120 + Math.random() * 40, 0.04, 'triangle', 0.08); }
  playCast() { this._beep(200, 0.3, 'sawtooth', 0.15); }    // 抛竿嗖
  playBite() { this._beep(880, 0.06, 'square', 0.3); setTimeout(() => this._beep(1100, 0.08, 'square', 0.3), 80); }

  // ─────────────────────────────────────────────────────────────────
  // D5 v2.1：浮漂抖动 + 沉水音效
  // ─────────────────────────────────────────────────────────────────

  /**
   * 浮漂抖动一击 —— 浮漂被鱼拽动撞水面的低频 "tok" 声
   * 由 D5 BiteFeedback 在 shake 段每帧整数 idx 变化时调用
   * @param {'light'|'medium'|'heavy'} level
   * @param {number} [intensity=1] 0~1，跟随 |dy| 缩放音量
   */
  playBobShakeTick(level = 'light', intensity = 1) {
    if (!this.ctx || this.muted) return;
    // 三档基频：越重越低（更"沉"）
    const baseFreq = level === 'heavy' ? 110 : level === 'medium' ? 160 : 220;
    const dur = 0.05;
    const vol = 0.18 * Math.max(0.3, Math.min(1, intensity));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle'; // 三角波 → 比方波柔和，比正弦有质感
    // 短暂下扫：模拟撞击后的下沉感
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, this.ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(gain).connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  /**
   * 浮漂沉水一声 —— "咕咚……" 大→小渐隐
   * 由 D5 BiteFeedback 在 sink 段开始（onSinkStart）调用一次
   * @param {number} [duration=1.2] 总时长（秒），匹配 sink 段长度
   */
  playBobSink(duration = 1.2) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;

    // 主层：中频 "咕咚" —— 频率从 360Hz 下扫到 120Hz，音量大→小（v2.1.2 提亮）
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, t0);
    osc.frequency.exponentialRampToValueAtTime(120, t0 + duration * 0.6);
    oscGain.gain.setValueAtTime(0, t0);
    oscGain.gain.linearRampToValueAtTime(0.35, t0 + 0.05); // 起音 50ms 拉满
    oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(oscGain).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);

    // 尾层：水下气泡 —— 白噪声经带通，明亮一点的"咕嘟"质感（v2.1.2 提亮）
    const bufLen = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t0);
    filter.frequency.exponentialRampToValueAtTime(500, t0 + duration); // 越往后越闷但不到泥水
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t0);
    noiseGain.gain.linearRampToValueAtTime(0.12, t0 + 0.08);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    noise.connect(filter).connect(noiseGain).connect(this.sfxGain);
    noise.start(t0);
    noise.stop(t0 + duration + 0.05);
  }
  playReelTick() { this._beep(400, 0.02, 'square', 0.2); }      // 收线咔
  // PHASE 21-1 D14 hotfix-o：拉鱼安全区扣血"打击音"（短促重击 + 余韵下滑）
  playFishHit() {
    if (!this.ctx || this.muted) return;
    // 第一击：低频厚实的"咚"
    this._beep(180, 0.05, 'square', 0.32);
    // 余韵：65ms 后高频短促"啪"，模拟肉体被击中的清脆尾音
    setTimeout(() => this._beep(520, 0.04, 'triangle', 0.22), 65);
  }
  playFishCaught() {
    // 上扬 4 音音阶
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._beep(f, 0.18, 'sine', 0.25), i * 100));
  }
  playQuestAccept() {
    const notes = [660, 880, 1320];
    notes.forEach((f, i) => setTimeout(() => this._beep(f, 0.15, 'triangle', 0.2), i * 80));
  }
  playQuestComplete() {
    // 经典完成音（三连音 + 长尾）
    const notes = [523, 659, 784, 1047, 1318];
    notes.forEach((f, i) => setTimeout(() => this._beep(f, i === 4 ? 0.4 : 0.12, 'square', 0.25), i * 100));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.bgmGain) this.bgmGain.gain.value = this.muted ? 0 : this.bgmVolume;
    if (this.sfxGain) this.sfxGain.gain.value = this.muted ? 0 : this.sfxVolume;
    return this.muted;
  }

  // 渔轮收线连续音效：程序化生成机械旋转声
  startReelSound() {
    if (!this.ctx || this.muted) return;
    if (this._reelRunning) return;
    this._reelRunning = true;

    // 间断咔哒声：每 0.5 秒触发一次，模拟机械棘轮声
    const tick = () => {
      if (!this._reelRunning || this.muted) return;
      this._beep(900, 0.04, 'sawtooth', 0.28);
      setTimeout(tick, 500);
    };
    tick();
  }

  stopReelSound() {
    if (!this._reelRunning) return;
    this._reelRunning = false;
    if (this._reelNodes) {
      try { this._reelNodes.src.stop(); } catch (e) { }
      try { this._reelNodes.lfo.stop(); } catch (e) { }
      this._reelNodes = null;
    }
  }

  isMuted() {
    return this.muted;
  }

  /**
   * 播放 MP3 背景音乐（用于播放外部音频文件如 village_bgm.mp3）
   * @param {string} src - 音频文件路径
   * @param {number} [loopStart] - 循环起始位置（秒），不填则播放到结尾
   * @param {number} [loopEnd] - 循环结束位置（秒），不填则从头开始
   */
  async playBGM(src, loopStart = null, loopEnd = null) {
    // HOTFIX：幂等保护——相同 src 已在播放/挂起则直接返回，避免 stopBGM 打断刚发起的 play() Promise
    //   症状：AbortError: play() request was interrupted by a call to pause()
    //   触发链：main.js 启动期 playBGM('login.mp3') 挂起 → 首次手势 init() 取出 _pendingBGM 重放 play()（Promise pending）
    //          → 同时 village-scene 多入口（line 361/710/2019/2042）再次 playBGM → 内部 stopBGM 把上面 pause 掉。
    if (this._bgmCurrentSrc === src && (this._bgmAudio || this._pendingBGM)) {
      return;
    }
    await this.init();
    // init() 内部可能已经把 _pendingBGM 取出重放过 → 标记一致就别再覆盖
    if (this._bgmCurrentSrc === src && this._bgmAudio) {
      return;
    }
    this._pendingBGM = null;   // 避免重复加载
    await this.stopBGM();      // ★ 等待 play() Promise settle 后再 pause，避免 AbortError

    this._bgmCurrentSrc = src;
    this._bgmAudio = new Audio(src);
    this._bgmAudio.volume = this.bgmVolume;
    this._bgmAudio.crossOrigin = 'anonymous';

    if (loopStart !== null && loopEnd !== null) {
      // 段落循环：指定起止位置无限循环
      this._bgmAudio.loop = true;
      this._bgmAudio.addEventListener('timeupdate', () => {
        if (this._bgmAudio.currentTime >= loopEnd) {
          this._bgmAudio.currentTime = loopStart;
        }
      });
    } else {
      // 无段落参数：整首循环播放
      this._bgmAudio.loop = true;
    }

    // 创建 MediaElementSourceNode 接入 Web Audio
    this._bgmSource = this.ctx.createMediaElementSource(this._bgmAudio);
    this._bgmSource.connect(this.bgmGain);
    try {
      // 保存 play() Promise 以便 stopBGM 等待它 settle
      this._bgmPlayPromise = this._bgmAudio.play();
      await this._bgmPlayPromise;
      this._bgmPlayPromise = null;
    } catch (e) {
      this._bgmPlayPromise = null;
      if (e.name === 'AbortError') {
        // 预期内：被后续 stopBGM/切歌打断，不污染控制台
      } else if (e.name === 'NotAllowedError') {
        // 浏览器自动播放策略：先挂起，等用户交互后由 init() 自动重试
        this._pendingBGM = { src, loopStart, loopEnd };
        this._bgmCurrentSrc = null;
      } else {
        console.warn('BGM play failed:', e);
        this._bgmCurrentSrc = null;
      }
    }
  }

  /**
   * 停止当前 BGM
   *   ★ HOTFIX：await play() Promise settle 后再 pause，避免 AbortError
   */
  async stopBGM() {
    this._bgmCurrentSrc = null;
    // 等待上次 play() 完成或失败，再 pause
    if (this._bgmPlayPromise) {
      try { await this._bgmPlayPromise; } catch (_) { /* 上次播放本身失败 → 无需 pause */ }
      this._bgmPlayPromise = null;
    }
    if (this._bgmAudio) {
      try { this._bgmAudio.pause(); } catch (_) { }
      this._bgmAudio = null;
    }
    if (this._bgmSource) {
      try { this._bgmSource.disconnect(); } catch (e) { }
      this._bgmSource = null;
    }
  }
}

export default new AudioSystem();