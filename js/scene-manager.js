/**
 * 场景管理器 - 单例模式，管理游戏场景切换与事件广播
 */

/**
 * @typedef {object} sceneObj
 * @property {function(object?): void} [init]
 * @property {function(): void} [start]
 * @property {function(): void} [pause]
 * @property {function(): void} [resume]
 * @property {function(): void} [destroy]
 */

class SceneManager {
  constructor() {
    /** @type {Map<string, sceneObj>} */
    this.scenes = new Map();
    /** @type {string | null} */
    this.currentScene = null;
    /** @type {Map<string, Function[]>} */
    this.listeners = new Map();
  }

  /**
   * 注册场景
   * @param {string} name - 场景名称
   * @param {sceneObj} sceneObj - 场景对象
   */
  register(name, sceneObj) {
    this.scenes.set(name, sceneObj);
  }

  /**
   * 切换场景：fadeOut → pause/destroy → 切换 div → init/start → fadeIn
   * @param {string} name - 场景名称
   * @param {object} [params] - 传递给新场景的参数
   */
  async switchTo(name, params = {}) {
    const targetScene = this.scenes.get(name);
    if (!targetScene) {
      console.error(`SceneManager: 场景 "${name}" 未注册`);
      return;
    }

    // 1. fadeOut (300ms, ease-in-out)
    await this._fadeOut();

    // 2. 旧场景 pause + destroy
    if (this.currentScene) {
      const oldScene = this.scenes.get(this.currentScene);
      if (oldScene) {
        if (typeof oldScene.pause === 'function') oldScene.pause();
        if (typeof oldScene.destroy === 'function') oldScene.destroy();
      }
      const oldDiv = document.getElementById(`${this.currentScene}-scene`);
      if (oldDiv) oldDiv.style.display = 'none';
    }

    // 3. 切换 div 显隐
    const newDiv = document.getElementById(`${name}-scene`);
    if (newDiv) newDiv.style.display = 'block';

    this.currentScene = name;

    // 4. 新场景 init(params) + start
    if (typeof targetScene.init === 'function') targetScene.init(params);
    if (typeof targetScene.start === 'function') targetScene.start();

    // 5. fadeIn (300ms, ease-in-out)
    await this._fadeIn();
  }

  /**
   * 快速切换场景：无淡入淡出动画
   * @param {string} name - 场景名称
   * @param {object} [params] - 传递给新场景的参数
   */
  switchToInstant(name, params = {}) {
    const targetScene = this.scenes.get(name);
    if (!targetScene) {
      console.error(`SceneManager: 场景 "${name}" 未注册`);
      return;
    }

    // 旧场景 pause + destroy
    if (this.currentScene) {
      const oldScene = this.scenes.get(this.currentScene);
      if (oldScene) {
        if (typeof oldScene.pause === 'function') oldScene.pause();
        if (typeof oldScene.destroy === 'function') oldScene.destroy();
      }
      const oldDiv = document.getElementById(`${this.currentScene}-scene`);
      if (oldDiv) oldDiv.style.display = 'none';
    }

    // 切换 div 显隐
    const newDiv = document.getElementById(`${name}-scene`);
    if (newDiv) newDiv.style.display = 'block';

    this.currentScene = name;

    // 新场景 init(params) + start
    if (typeof targetScene.init === 'function') targetScene.init(params);
    if (typeof targetScene.start === 'function') targetScene.start();
  }

  /**
   * 触发事件
   * @param {string} event - 事件名
   * @param {*} [data] - 事件数据
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`SceneManager emit error [${event}]:`, e);
      }
    });
  }

  /**
   * 监听事件
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * 取消监听
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    const callbacks = this.listeners.get(event) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  /** @returns {Promise<void>} */
  _fadeOut() {
    return new Promise(resolve => {
      const overlay = document.getElementById('transition-overlay');
      if (overlay) {
        overlay.style.transition = 'opacity 300ms cubic-bezier(0.4, 0.0, 0.2, 1)';
        overlay.style.opacity = '1';
      }
      setTimeout(resolve, 300);
    });
  }

  /** @returns {Promise<void>} */
  _fadeIn() {
    return new Promise(resolve => {
      const overlay = document.getElementById('transition-overlay');
      if (overlay) {
        overlay.style.transition = 'opacity 300ms cubic-bezier(0.4, 0.0, 0.2, 1)';
        overlay.style.opacity = '0';
      }
      setTimeout(resolve, 300);
    });
  }
}

const sceneManager = new SceneManager();
export default sceneManager;