/**
 * ConfettiCannon 类
 * 封装单个纸屑发射器的完整生命周期：
 * - 创建/管理 canvas 和 Worker
 * - 处理发射(fire)、重置(reset)、窗口 resize
 * - 支持 Worker 离屏渲染，不支持时自动回退到主线程
 */
import { animate } from './animator.js';
import { randomPhysics } from './Particle.js';
import { bitmapMapper } from './bitmap-mapper.js';
import { prop, onlyPositiveInt, colorsToRgb, randomInt, getOrigin } from './utils.js';

const global = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};

const promise = (func) => new Promise(func);

const setCanvasWindowSize = (canvas) => {
  canvas.width = document.documentElement.clientWidth;
  canvas.height = document.documentElement.clientHeight;
};

const setCanvasRectSize = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
};

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
  constructor(canvas, globalOpts) {
    this._isLibCanvas = !canvas;
    this._canvas = canvas;
    this._allowResize = !!prop(globalOpts || {}, 'resize');
    this._hasResizeEventRegistered = false;
    this._globalDisableForReducedMotion = prop(globalOpts, 'disableForReducedMotion', Boolean);
    this._shouldUseWorker = !!prop(globalOpts || {}, 'useWorker');
    this._worker = this._shouldUseWorker ? this._createWorker() : null;
    this._resizer = this._isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
    this._initialized = (canvas && this._worker) ? !!canvas.__confetti_initialized : false;
    this._preferLessMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion)').matches;
    this._animationObj = null;
  }

  _createWorker() {
    try {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this._decorateWorker(worker);
      return worker;
    } catch (e) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('Could not load worker', e);
      }
      return null;
    }
  }

  _decorateWorker(worker) {
    let prom = null;
    const resolves = {};

    worker.fire = (options, size, done) => {
      if (prom) {
        worker.postMessage({ options: options || {} });
        return prom;
      }

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
        resolves[id] = () => workerDone({ data: { callback: id } });
      });
      return prom;
    };

    worker.reset = () => {
      worker.postMessage({ reset: true });
      for (const id in resolves) {
        resolves[id]();
        delete resolves[id];
      }
    };

    worker.init = (canvas) => {
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ canvas: offscreen }, [offscreen]);
    };
  }

  _fireLocal(options, size, done) {
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

    const startX = this._canvas.width * origin.x;
    const startY = this._canvas.height * origin.y;
    const fettis = [];
    let temp = particleCount;

    while (temp--) {
      fettis.push(randomPhysics({
        x: startX, y: startY, angle, spread, startVelocity,
        color: colors[temp % colors.length],
        shape: shapes[randomInt(0, shapes.length)],
        ticks, decay, gravity, drift, scalar, flat
      }));
    }

    if (this._animationObj) {
      return this._animationObj.addFettis(fettis);
    }

    this._animationObj = animate(this._canvas, fettis, this._resizer, size, done, false, null, promise);
    return this._animationObj.promise;
  }

  fire(options) {
    const disableForReducedMotion = this._globalDisableForReducedMotion || prop(options, 'disableForReducedMotion', Boolean);
    const zIndex = prop(options, 'zIndex', Number);

    if (disableForReducedMotion && this._preferLessMotion) {
      return promise((resolve) => resolve());
    }

    if (this._isLibCanvas && this._animationObj) {
      this._canvas = this._animationObj.canvas;
    } else if (this._isLibCanvas && !this._canvas) {
      this._canvas = getCanvas(zIndex);
      document.body.appendChild(this._canvas);
    }

    if (this._allowResize && !this._initialized) {
      this._resizer(this._canvas);
    }

    const size = { width: this._canvas.width, height: this._canvas.height };

    if (this._worker && !this._initialized) {
      this._worker.init(this._canvas);
    }

    this._initialized = true;
    if (this._worker) {
      this._canvas.__confetti_initialized = true;
    }

    const onResize = () => {
      if (this._worker) {
        const obj = {
          getBoundingClientRect: () => !this._isLibCanvas ? this._canvas.getBoundingClientRect() : undefined
        };
        this._resizer(obj);
        this._worker.postMessage({ resize: { width: obj.width, height: obj.height } });
        return;
      }
      size.width = size.height = null;
    };

    const done = () => {
      this._animationObj = null;
      if (this._allowResize) {
        this._hasResizeEventRegistered = false;
        global.removeEventListener('resize', onResize);
      }
      if (this._isLibCanvas && this._canvas) {
        if (document.body.contains(this._canvas)) {
          document.body.removeChild(this._canvas);
        }
        this._canvas = null;
        this._initialized = false;
      }
    };

    if (this._allowResize && !this._hasResizeEventRegistered) {
      this._hasResizeEventRegistered = true;
      global.addEventListener('resize', onResize, false);
    }

    if (this._worker) {
      return this._worker.fire(options, size, done);
    }

    return this._fireLocal(options, size, done);
  }

  reset() {
    if (this._worker) this._worker.reset();
    if (this._animationObj) this._animationObj.reset();
  }
}
