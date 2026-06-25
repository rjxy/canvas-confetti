/**
 * 自定义形状模块
 * shapeFromPath: 将 SVG path 字符串转为可用的纸屑形状
 * shapeFromText: 将文本/emoji 渲染为 bitmap 纸屑形状
 */
const canUsePaths = typeof Path2D === 'function' && typeof DOMMatrix === 'function';

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

  const fontSize = 10 * scalar;
  const font = '' + fontSize + 'px ' + fontFamily;

  let canvas = new OffscreenCanvas(fontSize, fontSize);
  let ctx = canvas.getContext('2d');
  ctx.font = font;
  const size = ctx.measureText(text);
  let width = Math.ceil(size.actualBoundingBoxRight + size.actualBoundingBoxLeft);
  let height = Math.ceil(size.actualBoundingBoxAscent + size.actualBoundingBoxDescent);

  const padding = 2;
  const x = size.actualBoundingBoxLeft + padding;
  const y = size.actualBoundingBoxAscent + padding;
  width += padding + padding;
  height += padding + padding;

  canvas = new OffscreenCanvas(width, height);
  ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  const scale = 1 / scalar;
  return {
    type: 'bitmap',
    bitmap: canvas.transferToImageBitmap(),
    matrix: [scale, 0, 0, scale, -width * scale / 2, -height * scale / 2]
  };
};
