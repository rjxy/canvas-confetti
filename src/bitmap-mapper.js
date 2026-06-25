/**
 * Bitmap 缓存映射器
 * 将 ImageBitmap 转换为 OffscreenCanvas 并缓存，避免重复创建带来的性能开销
 * 当浏览器支持直接绘制 bitmap 时跳过转换
 */
const global = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};

const canDrawBitmap = (() => {
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
})();

const map = new Map();

export const bitmapMapper = {
  transform(bitmap) {
    if (canDrawBitmap) return bitmap;
    if (map.has(bitmap)) return map.get(bitmap);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    map.set(bitmap, canvas);
    return canvas;
  },
  clear() {
    map.clear();
  }
};
