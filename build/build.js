const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const { name, version } = require('../package.json');
const buildDate = (new Date()).toISOString();
const banner = `// ${name} v${version} built on ${buildDate}`;

const distDir = path.resolve(__dirname, '..', 'dist');

async function build() {
  fs.mkdirSync(distDir, { recursive: true });

  // Build worker as standalone bundle
  const workerResult = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '..', 'src/worker.js')],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2022',
  });
  const workerCode = workerResult.outputFiles[0].text;

  // Plugin to inline worker code as blob URL
  const inlineWorkerPlugin = {
    name: 'inline-worker',
    setup(build) {
      build.onResolve({ filter: /\.\/worker\.js$/ }, args => ({
        path: args.path,
        namespace: 'inline-worker',
      }));
      build.onLoad({ filter: /.*/, namespace: 'inline-worker' }, () => ({
        contents: `
          const workerCode = ${JSON.stringify(workerCode)};
          const blob = new Blob([workerCode], { type: 'application/javascript' });
          export const workerUrl = URL.createObjectURL(blob);
        `,
        loader: 'js',
      }));
    },
  };

  // Browser IIFE build (with inlined worker)
  const browserResult = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '..', 'src/confetti.js')],
    bundle: true,
    format: 'iife',
    globalName: '__confetti',
    write: false,
    target: 'es2022',
    plugins: [inlineWorkerPlugin],
  });

  const browserCode = browserResult.outputFiles[0].text;
  const browserWrapped = `${banner}\n${browserCode}\nwindow.confetti = __confetti.default;\nwindow.confetti.create = __confetti.default.create;\nwindow.confetti.shapeFromPath = __confetti.default.shapeFromPath;\nwindow.confetti.shapeFromText = __confetti.default.shapeFromText;\n`;
  fs.writeFileSync(path.join(distDir, 'confetti.browser.js'), browserWrapped);

  // ESM build (with inlined worker)
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '..', 'src/confetti.js')],
    bundle: true,
    format: 'esm',
    outfile: path.join(distDir, 'confetti.module.mjs'),
    banner: { js: banner },
    target: 'es2022',
    plugins: [inlineWorkerPlugin],
  });
}

build().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
