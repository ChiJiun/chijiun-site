#!/usr/bin/env node
// 重新產生 site/vendor/shaders-<版本>.min.js：首頁 hero 背景用的 Shaders（https://shaders.com，MIT）精簡版。
//
// 網站本身沒有 build 步驟，這個檔案是預先打包好、直接提交進 repo 的。只有在要升級 shaders 版本、
// 或 main.js 的 hero shader 用到新元件時才需要重跑：
//
//   node scripts/build-shaders.mjs            # 用下面的 VERSION 與 COMPONENTS
//   node scripts/build-shaders.mjs 4.1.0      # 換版本；記得同步改 main.js 裡 import 的檔名
//
// 跑完之後再執行 python scripts/version-assets.py，讓 main.js 的 import 帶上新的內容雜湊。
//
// 做法：官方的 shaders/js 會把全部約 200 個元件一起打包（約 2.6 MB）。這裡在暫存資料夾安裝套件，
// 用 esbuild 把元件清單換成只含 COMPONENTS 的版本，其餘元件就會被 tree-shake 掉（約 1.3 MB，
// gzip 後約 310 KB）。剩下的大小是渲染核心，無法再縮。不會在 repo 裡留下 node_modules。
// 先打包到暫存資料夾，檢查通過才覆蓋 site/vendor 裡的檔案。
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, copyFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION = process.argv[2] || '4.0.7';
const ESBUILD = '0.28.2';
const COMPONENTS = ['SimplexNoise', 'Circle', 'Dither'];
// 精簡成功時大約 1.3 MB；超過這個數字多半是元件清單沒有被換掉，打包進了全部元件。
const MAX_BYTES = 1_700_000;

if (!/^\d+\.\d+\.\d+$/.test(VERSION)) {
  console.error(`版本要寫成完整的 x.y.z（收到：${VERSION}），檔名與 main.js 的 import 才對得上。`);
  process.exit(1);
}

const vendor = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'vendor');
const tmp = mkdtempSync(join(tmpdir(), 'shaders-build-'));
const slash = (p) => p.split('\\').join('/');
let stopEsbuild = () => {};

try {
  // 沒有 package.json 的話，npm 會往上層找專案根目錄，可能把套件裝到別的地方去。
  writeFileSync(join(tmp, 'package.json'), '{"private":true,"type":"module"}');
  // VERSION 已經用上面的格式檢查過，可以安全地放進指令字串。
  execSync(`npm install --ignore-scripts --no-audit --no-fund shaders@${VERSION} esbuild@${ESBUILD}`, { cwd: tmp, stdio: 'inherit' });
  const { build, stop } = await import(pathToFileURL(join(tmp, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  stopEsbuild = stop;
  const modules = join(tmp, 'node_modules');
  const core = join(modules, 'shaders', 'dist', 'core');
  const files = readdirSync(core);
  // 元件檔名是「元件名-8 碼雜湊.js」。
  const fileFor = (name) => {
    const f = files.find((x) => x.startsWith(`${name}-`) && x.endsWith('.js') && x.length === name.length + 12);
    if (!f) throw new Error(`找不到元件檔：${name}`);
    return slash(join(core, f));
  };

  let swapped = false;
  const slimRegistry = {
    name: 'slim-registry',
    setup(b) {
      b.onResolve({ filter: /core\/registry\.js$/ }, () => ({ path: 'slim-registry', namespace: 'slim' }));
      b.onLoad({ filter: /.*/, namespace: 'slim' }, () => {
        swapped = true;
        return {
          resolveDir: core,
          contents: [
            ...COMPONENTS.map((n, i) => `import * as m${i} from ${JSON.stringify(fileFor(n))};`),
            'const pick = (m, name) => Object.values(m).find((v) => v && v.name === name);',
            `const names = ${JSON.stringify(COMPONENTS)};`,
            `const defs = [${COMPONENTS.map((n, i) => `pick(m${i}, names[${i}])`).join(', ')}];`,
            'defs.forEach((d, i) => { if (!d) throw new Error(`shaders slim build: no definition for ${names[i]}`); });',
            'export const getAllShaders = () => defs.map((definition) => ({ definition }));',
          ].join('\n'),
        };
      });
    },
  };

  const name = `shaders-${VERSION}.min.js`;
  const staged = join(tmp, name);
  await build({
    stdin: { contents: `export { createShader } from 'shaders/js';`, resolveDir: tmp },
    absWorkingDir: tmp, bundle: true, format: 'esm', minify: true, target: 'es2022', legalComments: 'none',
    banner: { js: `/* shaders ${VERSION} (MIT, https://shaders.com) 與它的相依套件，授權全文見 shaders-LICENSE.txt — 只含 ${COMPONENTS.join('、')}；由 scripts/build-shaders.mjs 產生，請勿手改。 */` },
    plugins: [slimRegistry], outfile: staged,
  });

  if (!swapped) throw new Error('元件清單沒有被換掉（shaders 內部的 core/registry.js 路徑可能改了），沒有覆蓋現有檔案。');
  const bytes = statSync(staged).size;
  if (bytes > MAX_BYTES) throw new Error(`產物 ${bytes} bytes，超過 ${MAX_BYTES}，看起來沒有精簡成功，沒有覆蓋現有檔案。`);

  // 實際載入一次：元件定義對不上時，產物會在載入當下 throw，這裡就能擋下來。
  const made = await import(pathToFileURL(staged).href);
  if (typeof made.createShader !== 'function') throw new Error('產物載入後沒有 createShader，沒有覆蓋現有檔案。');

  // 打包進去的每個套件都要附上授權（MIT 要求保留著作權與授權聲明）。shaders 的 dist 已經把
  // typegpu 等相依套件內嵌進去，從打包結果看不出來，所以沿著 dependencies 把整棵相依樹都列出來。
  const manifest = (pkg) => JSON.parse(readFileSync(join(modules, pkg, 'package.json'), 'utf8'));
  const packages = [];
  const walk = (pkg) => {
    if (packages.includes(pkg)) return;
    packages.push(pkg);
    Object.keys(manifest(pkg).dependencies ?? {}).forEach(walk);
  };
  walk('shaders');
  const licenses = packages.map((pkg) => {
    const dir = join(modules, pkg);
    const meta = manifest(pkg);
    const file = readdirSync(dir).find((f) => /^licen[sc]e(\.|$)/i.test(f));
    if (!file) console.warn(`注意：${pkg} 沒有附授權檔，只記下 package.json 標示的授權（${meta.license}）。`);
    const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `(套件沒有附授權檔；package.json 標示的授權：${meta.license})`;
    return `${'='.repeat(72)}\n${meta.name} ${meta.version} — ${meta.license}\n${'='.repeat(72)}\n\n${text}\n`;
  });

  mkdirSync(vendor, { recursive: true });
  copyFileSync(staged, join(vendor, name));
  writeFileSync(join(vendor, 'shaders-LICENSE.txt'), licenses.join('\n'));
  console.log(`已產生 ${slash(join(vendor, name))}（${bytes} bytes；授權檔涵蓋 ${packages.join('、')}）`);
} finally {
  // Windows 上 esbuild 的背景程序還開著時刪不掉它的執行檔，先停掉再刪；真的刪不掉也只是留下暫存資料夾。
  await stopEsbuild();
  try {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (e) {
    console.warn(`暫存資料夾沒有清乾淨，可以手動刪除：${tmp}（${e.code ?? e.message}）`);
  }
}
