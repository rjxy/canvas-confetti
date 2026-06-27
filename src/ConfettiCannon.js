/**
 * ConfettiCannon 类
 * 封装单个纸屑发射器的完整生命周期：
 * - 创建/管理 canvas 和 Worker
 * - 处理发射(fire)、重置(reset)、窗口 resize
 * - 支持 Worker 离屏渲染，不支持时自动回退到主线程
 */
import { Animation } from './animator.js';
import { Particle } from './Particle.js';
import { bitmapMapper } from './bitmap-mapper.js';
import { prop, onlyPositiveInt, colorsToRgb, randomInt, getOrigin } from './utils.js';
import { workerUrl } from './worker.js';

// 兼容浏览器主线程和 Worker 环境的全局对象引用
const global = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};

// Promise 工厂，传入 Animation 等模块作为 Promise 构造的统一入口
const promise = (func) => new Promise(func);

// 将 canvas 尺寸设置为整个视口（用于库自动创建的全屏 canvas）
const setCanvasWindowSize = (canvas) => {
  canvas.width = document.documentElement.clientWidth;
  canvas.height = document.documentElement.clientHeight;
};

// 将 canvas 尺寸设置为其 DOM 元素的实际布局尺寸（用于用户提供的自定义 canvas）
const setCanvasRectSize = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
};

// 创建一个全屏覆盖的 canvas 元素，fixed 定位 + pointer-events:none 使其不影响页面交互
const getCanvas = (zIndex) => {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0px';
  canvas.style.left = '0px';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = zIndex;
  return canvas;
};

export class ConfettiCannon {
  #isLibCanvas;          // 是否由库自动管理 canvas 生命周期（创建/销毁）
  #canvas;               // 目标 canvas 元素
  #allowResize;          // 是否监听窗口 resize 并自动调整 canvas 尺寸
  #hasResizeEventRegistered = false;
  #globalDisableForReducedMotion;  // 全局减少动画偏好开关
  #shouldUseWorker;      // 是否使用 Worker 离屏渲染
  #worker;               // Worker 实例（或 null 表示回退到主线程）
  #resizer;              // canvas 尺寸策略函数（setCanvasWindowSize 或 setCanvasRectSize）
  #initialized;          // 是否已完成初始化（Worker 的 transferControlToOffscreen 只能执行一次）
  #preferLessMotion;     // 用户系统是否启用了"减少动画"偏好
  #animationObj = null;  // 当前活跃的 Animation 实例

  /**
   * @param {HTMLCanvasElement|null} canvas - 目标 canvas，传 null 则由库自动创建全屏 canvas
   * @param {Object} globalOpts - 全局配置
   * @param {boolean} globalOpts.resize - 是否监听 resize 自动调整尺寸
   * @param {boolean} globalOpts.useWorker - 是否使用 Worker 离屏渲染
   * @param {boolean} globalOpts.disableForReducedMotion - 是否尊重系统减少动画偏好
   */
  constructor(canvas, globalOpts) {
    this.#isLibCanvas = !canvas;
    this.#canvas = canvas;
    this.#allowResize = !!prop(globalOpts || {}, 'resize');
    this.#globalDisableForReducedMotion = prop(globalOpts, 'disableForReducedMotion', Boolean);
    this.#shouldUseWorker = !!prop(globalOpts || {}, 'useWorker');
    this.#worker = this.#shouldUseWorker ? this.#createWorker() : null;
    // 根据 canvas 来源选择尺寸策略：自建用视口尺寸，用户提供用元素尺寸
    this.#resizer = this.#isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
    // 避免同一 canvas 被多次 transferControlToOffscreen（不可逆操作）
    this.#initialized = (canvas && this.#worker) ? !!canvas.__confetti_initialized : false;
    this.#preferLessMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion)').matches;
  }

  // 创建 Worker，失败时静默回退到主线程渲染
  #createWorker() {
    try {
      const worker = new Worker(workerUrl);
      this.#decorateWorker(worker);
      return worker;
    } catch (e) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('Could not load worker', e);
      }
      return null;
    }
  }

  /**
   * 为 Worker 添加 fire/reset/init 方法，封装 postMessage 通信协议
   * 核心设计：用随机 ID 作为回调标识，实现 Promise 风格的异步调用
   * 当已有动画运行时（prom 不为 null），新 fire 只发送 options 追加粒子，复用同一 Promise
   */
  #decorateWorker(worker) {
    // prom: 当前动画的 Promise，非 null 表示动画进行中
    let prom = null;
    // resolves: 按 ID 存储的手动 resolve 回调，用于 reset 时立即结束所有等待中的 Promise
    const resolves = {};

    worker.fire = (options, size, done) => {
      // 动画已在运行：只追加粒子，不创建新 Promise
      if (prom) {
        worker.postMessage({ options: options || {} });
        return prom;
      }

      // 首次发射：创建 Promise，监听 Worker 回传的 callback ID 来 resolve
      const id = Math.random().toString(36).slice(2);
      prom = promise((resolve) => {
        const workerDone = (msg) => {
          if (msg.data.callback !== id) return;
          delete resolves[id];
          worker.removeEventListener('message', workerDone);
          prom = null;
          bitmapMapper.clear();
          done();
          resolve();
        };
        worker.addEventListener('message', workerDone);
        worker.postMessage({ options: options || {}, callback: id });
        // 存储手动触发函数，供 reset 时强制结束
        resolves[id] = () => workerDone({ data: { callback: id } });
      });
      return prom;
    };

    // reset: 通知 Worker 停止动画，并立即 resolve 所有等待中的 Promise
    worker.reset = () => {
      worker.postMessage({ reset: true });
      for (const id in resolves) {
        resolves[id]();
        delete resolves[id];
      }
    };

    // init: 将 canvas 控制权转移给 Worker（transferControlToOffscreen 不可逆）
    worker.init = (canvas) => {
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ canvas: offscreen }, [offscreen]);
    };
  }

  /**
   * 主线程本地发射：解析配置 → 生成粒子数组 → 启动/追加动画
   * 如果已有动画运行中则追加粒子（addFettis），否则创建新动画循环
   */
  #fireLocal(options, size, done) {
    const particleCount = prop(options, 'particleCount', onlyPositiveInt);
    const angle = prop(options, 'angle', Number);
    const spread = prop(options, 'spread', Number);
    const startVelocity = prop(options, 'startVelocity', Number);
    const decay = prop(options, 'decay', Number);
    const gravity = prop(options, 'gravity', Number);
    const drift = prop(options, 'drift', Number);
    const colors = prop(options, 'colors', colorsToRgb);
    const ticks = prop(options, 'ticks', Number);
    const shapes = prop(options, 'shapes');
    const scalar = prop(options, 'scalar');
    const flat = !!prop(options, 'flat');
    const origin = getOrigin(options);

    const startX = this.#canvas.width * origin.x;
    const startY = this.#canvas.height * origin.y;
    const particles = [];
    let temp = particleCount;

    while (temp--) {
      particles.push(new Particle({
        x: startX, y: startY, angle, spread, startVelocity,
        color: colors[temp % colors.length],
        shape: shapes[randomInt(0, shapes.length)],
        ticks, decay, gravity, drift, scalar, flat
      }));
    }

    if (this.#animationObj) {
      return this.#animationObj.addFettis(particles);
    }

    this.#animationObj = new Animation(this.#canvas, particles, this.#resizer, size, done, false, null, promise);
    return this.#animationObj.promise;
  }

  /**
   * 公开的发射入口，协调整个发射流程：
   * 1. 检查 reduced-motion 偏好 → 2. 确保 canvas 存在 → 3. 初始化尺寸
   * 4. 注册 resize 监听 → 5. 委派给 Worker 或本地渲染
   */
  fire(options) {
    const disableForReducedMotion = this.#globalDisableForReducedMotion || prop(options, 'disableForReducedMotion', Boolean);
    const zIndex = prop(options, 'zIndex', Number);

    // 尊重用户系统级减少动画偏好，直接返回 resolved Promise
    if (disableForReducedMotion && this.#preferLessMotion) {
      return promise((resolve) => resolve());
    }

    // canvas 生命周期管理：复用当前动画的 canvas，或创建新的全屏 canvas
    if (this.#isLibCanvas && this.#animationObj) {
      this.#canvas = this.#animationObj.canvas;
    } else if (this.#isLibCanvas && !this.#canvas) {
      this.#canvas = getCanvas(zIndex);
      document.body.appendChild(this.#canvas);
    }

    if (this.#allowResize && !this.#initialized) {
      this.#resizer(this.#canvas);
    }

    const size = { width: this.#canvas.width, height: this.#canvas.height };

    // Worker 首次使用时将 canvas 控制权转移（不可逆，只能执行一次）
    if (this.#worker && !this.#initialized) {
      this.#worker.init(this.#canvas);
    }

    this.#initialized = true;
    if (this.#worker) {
      this.#canvas.__confetti_initialized = true;
    }

    // resize 回调：Worker 模式下通过 postMessage 同步新尺寸，本地模式下置空触发下帧重新测量
    const onResize = () => {
      if (this.#worker) {
        const obj = {
          getBoundingClientRect: () => !this.#isLibCanvas ? this.#canvas.getBoundingClientRect() : undefined
        };
        this.#resizer(obj);
        this.#worker.postMessage({ resize: { width: obj.width, height: obj.height } });
        return;
      }
      size.width = size.height = null;
    };

    // 动画结束回调：清理 resize 监听、移除自建 canvas、重置状态
    const done = () => {
      this.#animationObj = null;
      if (this.#allowResize) {
        this.#hasResizeEventRegistered = false;
        global.removeEventListener('resize', onResize);
      }
      if (this.#isLibCanvas && this.#canvas) {
        if (document.body.contains(this.#canvas)) {
          document.body.removeChild(this.#canvas);
        }
        this.#canvas = null;
        this.#initialized = false;
      }
    };

    if (this.#allowResize && !this.#hasResizeEventRegistered) {
      this.#hasResizeEventRegistered = true;
      global.addEventListener('resize', onResize, false);
    }

    if (this.#worker) {
      return this.#worker.fire(options, size, done);
    }

    return this.#fireLocal(options, size, done);
  }

  reset() {
    if (this.#worker) this.#worker.reset();
    if (this.#animationObj) this.#animationObj.reset();
  }
}
