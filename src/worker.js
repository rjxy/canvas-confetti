/**
 * Web Worker 入口
 * 在独立线程中运行粒子计算和 OffscreenCanvas 渲染，不阻塞主线程
 * 通过 postMessage 接收配置并在动画结束时回传 callback
 */
import { Animation } from './animator.js';
import { Particle } from './Particle.js';
import { prop, onlyPositiveInt, colorsToRgb, randomInt, getOrigin } from './utils.js';

const setCanvasRectSize = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
};

class ConfettiWorker {
  #canvas = null;
  #size = {};
  #animation = null;

  constructor() {
    self.onmessage = (msg) => this.#handleMessage(msg);
  }

  #handleMessage(msg) {
    if (msg.data.options) {
      this.#fireAndNotify(msg.data.options, msg.data.callback);
    } else if (msg.data.reset) {
      if (this.#animation) this.#animation.reset();
    } else if (msg.data.resize) {
      this.#size.width = msg.data.resize.width;
      this.#size.height = msg.data.resize.height;
    } else if (msg.data.canvas) {
      this.#size.width = msg.data.canvas.width;
      this.#size.height = msg.data.canvas.height;
      this.#canvas = msg.data.canvas;
    }
  }

  #fireAndNotify(options, callback) {
    const particles = this.#createParticles(options);
    const done = () => { this.#animation = null; };

    if (this.#animation) {
      this.#animation.addFettis(particles).then(() => {
        if (callback) postMessage({ callback });
      });
    } else {
      const size = { width: this.#size.width, height: this.#size.height };
      this.#animation = new Animation(
        this.#canvas, particles, setCanvasRectSize, size, done, true, this.#size, (fn) => new Promise(fn)
      );
      this.#animation.promise.then(() => {
        if (callback) postMessage({ callback });
      });
    }
  }

  #createParticles(options) {
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

    return particles;
  }
}

new ConfettiWorker();
