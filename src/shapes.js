/**
 * 自定义形状模块
 * shapeFromPath: 将 SVG path 字符串转为可用的纸屑形状
 * shapeFromText: 将文本/emoji 渲染为 bitmap 纸屑形状
 */
const canUsePaths = typeof Path2D === 'function' && typeof DOMMatrix === 'function';

/**
 * 将 SVG path 字符串转为纸屑形状对象
 * 如果未提供 matrix，会通过像素扫描自动计算路径边界框，然后生成缩放+居中的变换矩阵
 * 自动计算代价较高（遍历 1000x1000 像素点），建议提前计算好 matrix 并缓存
 * @param {string|Object} pathData - SVG path 字符串，或 { path, matrix? } 对象
 * @returns {{ type: 'path', path: string, matrix: number[] }} 形状描述对象
 */
export const shapeFromPath = (pathData) => {
  if (!canUsePaths) {
    throw new Error('path confetti are not supported in this browser');
  }

  let path, matrix;
  if (typeof pathData === 'string') {
    path = pathData;
  } else {
    path = pathData.path;
    matrix = pathData.matrix;
  }

  const path2d = new Path2D(path);

  if (!matrix) {
    // 通过 isPointInPath 逐像素扫描确定路径的实际边界框
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const maxSize = 1000;
    let minX = maxSize, minY = maxSize, maxX = 0, maxY = 0;

    for (let x = 0; x < maxSize; x += 2) {
      for (let y = 0; y < maxSize; y += 2) {
        if (tempCtx.isPointInPath(path2d, x, y, 'nonzero')) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // 计算缩放因子：将路径缩放到 10x10 的标准尺寸内，再平移使中心对齐原点
    const width = maxX - minX;
    const height = maxY - minY;
    const maxDesiredSize = 10;
    const scale = Math.min(maxDesiredSize / width, maxDesiredSize / height);

    matrix = [
      scale, 0, 0, scale,
      -Math.round((width / 2) + minX) * scale,
      -Math.round((height / 2) + minY) * scale
    ];
  }

  return { type: 'path', path, matrix };
};

/**
 * 将文本（通常是 emoji）光栅化为 bitmap 形状
 * 流程：测量文本尺寸 → 创建精确大小的 OffscreenCanvas → 绘制文本 → 转为 ImageBitmap
 * @param {string|Object} textData - 文本字符串，或 { text, scalar?, color?, fontFamily? }
 * @returns {{ type: 'bitmap', bitmap: ImageBitmap, matrix: number[] }} 形状描述对象
 */
export const shapeFromText = (textData) => {
  let text, scalar = 1, color = '#000000',
    fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", "Twemoji Mozilla", "system emoji", sans-serif';

  if (typeof textData === 'string') {
    text = textData;
  } else {
    text = textData.text;
    scalar = 'scalar' in textData ? textData.scalar : scalar;
    fontFamily = 'fontFamily' in textData ? textData.fontFamily : fontFamily;
    color = 'color' in textData ? textData.color : color;
  }

  // 字体大小 = 基准 10px * scalar，确保 emoji 在高 scalar 时不模糊
  const fontSize = 10 * scalar;
  const font = '' + fontSize + 'px ' + fontFamily;

  // 第一次创建临时 canvas 仅用于 measureText 获取精确边界
  let canvas = new OffscreenCanvas(fontSize, fontSize);
  let ctx = canvas.getContext('2d');
  ctx.font = font;
  const size = ctx.measureText(text);
  let width = Math.ceil(size.actualBoundingBoxRight + size.actualBoundingBoxLeft);
  let height = Math.ceil(size.actualBoundingBoxAscent + size.actualBoundingBoxDescent);

  // padding 防止文本边缘被裁剪（某些 emoji 的实际渲染会超出测量边界）
  const padding = 2;
  const x = size.actualBoundingBoxLeft + padding;
  const y = size.actualBoundingBoxAscent + padding;
  width += padding + padding;
  height += padding + padding;

  // 第二次创建精确尺寸的 canvas 并绘制文本，然后转为 ImageBitmap
  canvas = new OffscreenCanvas(width, height);
  ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  // matrix 将 bitmap 缩放回标准尺寸并居中对齐原点
  const scale = 1 / scalar;
  return {
    type: 'bitmap',
    bitmap: canvas.transferToImageBitmap(),
    matrix: [scale, 0, 0, scale, -width * scale / 2, -height * scale / 2]
  };
};
