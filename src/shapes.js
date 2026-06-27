/**
 * 自定义形状模块 —— 让纸屑不再只是方块和圆形
 *
 * 提供两种方式创建自定义纸屑形状：
 *   1. shapeFromPath  —— 用 SVG path 字符串定义矢量形状（心形、星形、闪电等）
 *   2. shapeFromText  —— 用文本/emoji 光栅化为位图形状（🎉、🔥、文字等）
 *
 * 两者返回的对象都可以直接传入 confetti({ shapes: [...] }) 使用。
 */

/**
 * 环境检测：Path2D 和 DOMMatrix 是绘制 SVG path 的前提，几乎所有现代浏览器都支持，IE 不支持。
 *
 * Path2D API:
 *   - 允许通过 SVG path 字符串（如 "M0 0 L10 10 L0 10 Z"）构造可复用的 2D 路径对象
 *   - 构造后可直接传给 CanvasRenderingContext2D 的 fill(path) / stroke(path) 方法进行绘制
 *   - 相比传统的 ctx.beginPath() + ctx.moveTo/lineTo 逐步绘制，Path2D 支持缓存与复用，性能更优
 *
 * DOMMatrix API:
 *   - 表示 2D/3D 仿射变换矩阵，可执行 translate / rotate / scale 等几何变换
 *   - 在本项目中用于对 Path2D 进行缩放变换（通过 path.addPath(srcPath, matrix) 应用矩阵）
 *   - 使得 SVG path 可以按任意尺寸绘制而无需手动计算每个坐标点
 */
const canUsePaths = typeof Path2D === 'function' && typeof DOMMatrix === 'function';

/**
 * shapeFromPath —— 将 SVG path 字符串转为纸屑形状对象
 *
 * ═══════════════════════════════════════════════════════════════
 * 用法示例：
 *
 *   // 示例 1：心形（Material Icons 的心形路径）
 *   // 这个 path 数据来自任何 SVG 图标库，如 Material Icons、Font Awesome 等
 *   const heart = shapeFromPath({
 *     path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5' +
 *           'C2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09' +
 *           'C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5' +
 *           'c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
 *   });
 *   // 返回: { type: 'path', path: '...', matrix: [自动计算的6元素变换矩阵] }
 *
 *   // 示例 2：五角星（手动提供 matrix 跳过自动扫描，性能更好）
 *   const star = shapeFromPath({
 *     path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86' +
 *           'L12 18.77 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z',
 *     matrix: [0.4, 0, 0, 0.4, -4.8, -4.8]
 *   });
 *
 *   // 示例 3：闪电（简单路径直接传字符串）
 *   const bolt = shapeFromPath('M7 2v11h3v9l7-12h-4l4-8z');
 *
 * ═══════════════════════════════════════════════════════════════
 *
 * @param {string|Object} pathData
 *   - 字符串：直接作为 SVG path 的 d 属性值
 *   - 对象：{ path: string, matrix?: number[6] }
 *     - path: SVG path 的 d 属性值
 *     - matrix: 可选的 2D 仿射变换矩阵 [a, b, c, d, e, f]
 *              对应 CSS transform: matrix(a, b, c, d, e, f)
 *              即 [scaleX, skewY, skewX, scaleY, translateX, translateY]
 *              如果不提供，会自动通过像素扫描计算（较慢）
 *
 * @returns {{ type: 'path', path: string, matrix: number[] }}
 *   type: 标识为路径形状，渲染时使用 Path2D + ctx.fill()
 *   path: 原始 SVG path 字符串
 *   matrix: 6 元素变换矩阵，用于将路径缩放到标准粒子尺寸（~10x10）并居中
 */
export const shapeFromPath = (pathData) => {
  if (!canUsePaths) {
    throw new Error('path confetti are not supported in this browser');
  }

  // 解析入参的path和matrix
  let path, matrix;
  if (typeof pathData === 'string') {
    path = pathData;
  } else {
    path = pathData.path;
    matrix = pathData.matrix;
  }

  const path2d = new Path2D(path);

  if (!matrix) {
    // ──── 自动计算变换矩阵 ────
    // 原理：SVG path 的坐标空间未知（可能是 0-24、0-100、0-1024...），
    // 需要找出实际占据的边界框，然后缩放到标准尺寸。
    //
    // 方法：用 isPointInPath 在 1000x1000 网格上逐点扫描，找出路径的边界。
    // 步长为 2（每隔一个像素采样），在精度和性能间取平衡。
    // 这意味着最小可检测的路径宽度约为 2px。
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    // 扫描网格的边长，path 坐标必须落在 0~maxSize 范围内才能被检测到
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

    // ──── 构造变换矩阵 ────
    // 目标：将路径缩放到 10x10 以内（标准粒子尺寸），并平移使中心对齐原点 (0,0)
    //
    // 举例：一个长方形路径，坐标范围 x:[5,45] y:[10,30]
    //       width = 45 - 5 = 40, height = 30 - 10 = 20
    //       scale = min(10/40, 10/20) = min(0.25, 0.5) = 0.25
    // 平移数据计算
    // 矩阵变换公式：x' = scale * x + translateX
    // 目标：让路径中心点变换后落在原点，即 0 = scale * centerX + translateX
    // 因此：translateX = -centerX * scale，其中 centerX = round(width/2 + minX)
    // 注意：平移是在缩放之后施加的（矩阵乘法顺序：先 scale 再 translate），
    //       所以 translateX/Y 的值是缩放后坐标空间中的偏移量。
    //
    //       translateX = -round((40/2)+5) * 0.25 = -round(25) * 0.25 = -6.25
    //       translateY = -round((20/2)+10) * 0.25 = -round(20) * 0.25 = -5
    //       最终 matrix = [0.25, 0, 0, 0.25, -6.25, -5]
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
 * shapeFromText —— 将文本（通常是 emoji）光栅化为 bitmap 纸屑形状
 *
 * ═══════════════════════════════════════════════════════════════
 * 用法示例：
 *
 *   // 示例 1：emoji 纸屑（最常用）
 *   const party = shapeFromText({ text: '🎉', scalar: 2 });
 *   const fire  = shapeFromText({ text: '🔥', scalar: 2 });
 *   // 返回: { type: 'bitmap', bitmap: ImageBitmap, matrix: [...] }
 *
 *   // 示例 2：彩色文字（color 对普通文字生效，对 emoji 无效）
 *   const yes = shapeFromText({ text: 'YES!', scalar: 3, color: '#22c55e' });
 *
 *   // 示例 3：指定字体
 *   const logo = shapeFromText({
 *     text: 'A',
 *     scalar: 4,
 *     color: '#6366f1',
 *     fontFamily: 'Georgia, serif'
 *   });
 *
 *   // 示例 4：直接传字符串（使用所有默认值：scalar=1, color=#000）
 *   const simple = shapeFromText('★');
 *
 * ═══════════════════════════════════════════════════════════════
 *
 * 工作原理：
 *   1. 创建临时 OffscreenCanvas 用 measureText 精确测量文本边界
 *   2. 创建第二个精确尺寸的 OffscreenCanvas 绘制文本
 *   3. transferToImageBitmap() 转为 GPU 可用的位图
 *   4. 生成 matrix 将位图缩放回标准粒子尺寸
 *
 * 重要：scalar 参数影响渲染精度！
 *   - scalar=1 时字号 10px，emoji 会模糊
 *   - scalar=2 时字号 20px，适合大多数场景
 *   - scalar=4 时字号 40px，高清但内存开销更大
 *   - confetti() 调用时的 scalar 需与此处匹配，否则大小不一致
 *
 * @param {string|Object} textData
 *   - 字符串：直接作为文本内容，使用默认参数
 *   - 对象：{ text, scalar?, color?, fontFamily? }
 *     - text: 要渲染的文本或 emoji（如 '🎄'、'GO!'）
 *     - scalar: 缩放系数，默认 1。越大越清晰，但占用越多内存
 *     - color: 文本颜色，默认 '#000000'。对 emoji 无效（emoji 自带颜色）
 *     - fontFamily: 字体栈，默认系统 emoji 字体栈
 *
 * @returns {{ type: 'bitmap', bitmap: ImageBitmap, matrix: number[] }}
 *   type: 标识为位图形状，渲染时使用 ctx.drawImage()
 *   bitmap: ImageBitmap 对象，由 OffscreenCanvas.transferToImageBitmap() 生成
 *   matrix: 6 元素变换矩阵，将位图缩放回标准尺寸并居中
 */
export const shapeFromText = (textData) => {
  // ══════════════════════════════════════════════════════════════════════════
  // 整体流程：文字/emoji → 测量尺寸 → 绘制到精确画布 → 转为位图 → 生成变换矩阵
  //
  // 以 { text: '🔥', scalar: 2 } 为例：
  //   字号 = 10 * 2 = 20px
  //   测量得 🔥 占据约 18×20 像素
  //   加 padding 后画布 = 22×24
  //   绘制 emoji 到画布 → 转为 ImageBitmap
  //   生成 matrix = [0.5, 0, 0, 0.5, -5.5, -6] 将位图缩放回标准粒子尺寸并居中
  // ══════════════════════════════════════════════════════════════════════════

  let text, scalar = 1, color = '#000000',
    // 系统 emoji 字体回退链：覆盖 macOS(Apple Color Emoji)、Windows(Segoe UI Emoji)、
    // Linux(Noto Color Emoji)、Android 等平台，确保 emoji 在各系统上都能正确渲染
    fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", "Twemoji Mozilla", "system emoji", sans-serif';

  // ──── 参数解析 ────
  // 支持两种调用方式：
  //   shapeFromText('🔥')           → 纯字符串，使用所有默认值
  //   shapeFromText({ text, ... })  → 对象形式，可自定义 scalar/color/fontFamily
  if (typeof textData === 'string') {
    text = textData;
  } else {
    text = textData.text;
    scalar = 'scalar' in textData ? textData.scalar : scalar;
    fontFamily = 'fontFamily' in textData ? textData.fontFamily : fontFamily;
    color = 'color' in textData ? textData.color : color;
  }

  // ──── 确定字号 ────
  // 基准 10px × scalar = 实际渲染字号
  // scalar 决定位图精度：scalar=1 → 10px（模糊），scalar=2 → 20px（推荐），scalar=4 → 40px（高清）
  // 注意：调用 confetti() 时也需要传相同的 scalar，否则显示大小不一致
  const fontSize = 10 * scalar;
  const font = '' + fontSize + 'px ' + fontFamily;

  // ──── 第一步：测量文本精确尺寸 ────
  // 创建一个临时 OffscreenCanvas，仅用于调用 measureText() 获取文本边界信息
  // 为什么不用 TextMetrics.width？因为 width 只是"前进宽度"（下一个字符的起点），
  // 不反映实际像素占据范围。actualBoundingBox* 才是字形真实的像素边界：
  //   actualBoundingBoxLeft   → 文本基线起点到字形最左像素的距离
  //   actualBoundingBoxRight  → 文本基线起点到字形最右像素的距离
  //   actualBoundingBoxAscent → 基线到字形最高像素的距离
  //   actualBoundingBoxDescent→ 基线到字形最低像素的距离
  // 例如 🔥 在 20px 下可能测得: left=1, right=17, ascent=18, descent=2
  //   → width = 17+1 = 18, height = 18+2 = 20
  let canvas = new OffscreenCanvas(fontSize, fontSize);
  let ctx = canvas.getContext('2d');
  ctx.font = font;
  const size = ctx.measureText(text);
  let width = Math.ceil(size.actualBoundingBoxRight + size.actualBoundingBoxLeft);
  let height = Math.ceil(size.actualBoundingBoxAscent + size.actualBoundingBoxDescent);

  // ──── 加 padding 防止边缘裁剪 ────
  // 某些 emoji（如 🎉、👑）的实际渲染范围会略超出 measureText 报告的边界，
  // 加 2px padding 确保不会被截断
  // x, y 是绘制起点：需要偏移 actualBoundingBoxLeft 和 actualBoundingBoxAscent
  // 使字形刚好落在 padding 之后的区域
  const padding = 2;
  const x = size.actualBoundingBoxLeft + padding;
  const y = size.actualBoundingBoxAscent + padding;
  width += padding + padding;   // 例如 18 + 4 = 22
  height += padding + padding;  // 例如 20 + 4 = 24

  // ──── 第二步：绘制到精确尺寸的画布 ────
  // 重新创建一个与文本尺寸完全匹配的 OffscreenCanvas（不浪费像素）
  // 然后将 emoji 绘制上去。对于 emoji，color 设置无效（emoji 自带颜色）；
  // 对于普通文字如 "COOL"，color 会生效
  canvas = new OffscreenCanvas(width, height);
  ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  // ──── 第三步：转为 ImageBitmap 并生成变换矩阵 ────
  //
  // transferToImageBitmap() 将 canvas 像素数据"剥离"为独立的 ImageBitmap 对象，
  // 好处：可被 ctx.drawImage() 高效重复绘制，不再占用原 canvas 资源
  //
  // 变换矩阵的作用：动画系统中粒子的标准坐标空间约 10×10，但位图实际是 22×24 像素
  // 需要在渲染时缩放 + 平移，使其正确显示在粒子位置上
  //
  // scale = 1/scalar 的原因：
  //   位图像素 = 标准尺寸(10) × scalar(2) = 20px 级别
  //   渲染时需要缩小 scalar 倍回到标准粒子坐标空间
  //   即 scale = 1/2 = 0.5，渲染尺寸 = 22 × 0.5 = 11 ≈ 标准粒子大小
  //
  // 平移 (-width*scale/2, -height*scale/2) 的原因：
  //   drawImage 默认从左上角 (0,0) 绘制，但粒子锚点在中心
  //   平移使位图中心对齐锚点，这样旋转时是绕中心转而不是绕左上角转
  //   例如: translateX = -22 * 0.5 / 2 = -5.5
  //         translateY = -24 * 0.5 / 2 = -6
  //
  // 最终 matrix = [0.5, 0, 0, 0.5, -5.5, -6]
  // 渲染时通过 ctx.setTransform(...matrix) 应用，再 ctx.drawImage(bitmap, 0, 0)
  const scale = 1 / scalar;
  return {
    type: 'bitmap',
    bitmap: canvas.transferToImageBitmap(),
    matrix: [scale, 0, 0, scale, -width * scale / 2, -height * scale / 2]
  };
};
