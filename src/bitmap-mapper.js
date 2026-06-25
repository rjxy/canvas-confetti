/**
 * Bitmap 缓存映射器
 * 将 ImageBitmap 转换为 OffscreenCanvas 并缓存，避免重复创建带来的性能开销
 * 当浏览器支持直接绘制 bitmap 时跳过转换
 */
const global = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};

/**
 * 检测浏览器是否支持直接将 ImageBitmap 用于 createPattern
 * 某些环境（如旧版 Worker）中 createPattern(bitmap) 会抛异常
 * 支持时 transform() 直接返回原始 bitmap，不支持时转为 OffscreenCanvas
 */
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

// 缓存 Map：ImageBitmap → OffscreenCanvas，避免每帧重复转换
const map = new Map();

export const bitmapMapper = {
  // 将 ImageBitmap 转为可用于 createPattern 的对象，支持时直接返回，否则缓存转换结果
  transform(bitmap) {
    if (canDrawBitmap) return bitmap;
    if (map.has(bitmap)) return map.get(bitmap);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    map.set(bitmap, canvas);
    return canvas;
  },
  // 动画结束时清空缓存，释放 OffscreenCanvas 内存
  clear() {
    map.clear();
  }
};
