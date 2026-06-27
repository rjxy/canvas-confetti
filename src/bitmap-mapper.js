/**
 * Bitmap 缓存映射器
 * 将 ImageBitmap 转换为 OffscreenCanvas 并缓存，避免重复创建带来的性能开销
 * 当浏览器支持直接绘制 bitmap 时跳过转换
 */
const global = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};

class BitmapMapper {
  #map = new Map();
  #canDrawBitmap;

  constructor() {
    this.#canDrawBitmap = this.#detectBitmapSupport();
  }

  #detectBitmapSupport() {
    if (!global.OffscreenCanvas) return false;
    try {
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext('2d');
      ctx.fillRect(0, 0, 1, 1);
      const bitmap = canvas.transferToImageBitmap();
      ctx.createPattern(bitmap, 'no-repeat');
    } catch (e) {
      return false;
    }
    return true;
  }

  transform(bitmap) {
    if (this.#canDrawBitmap) return bitmap;
    if (this.#map.has(bitmap)) return this.#map.get(bitmap);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    this.#map.set(bitmap, canvas);
    return canvas;
  }

  clear() {
    this.#map.clear();
  }
}

export const bitmapMapper = new BitmapMapper();
