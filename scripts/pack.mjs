import archiver from 'archiver';
import { copyFileSync, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const publicDir = join(root, 'public');

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * Copies the guest SDK out of `node_modules` into `public/`, where Vite ships it verbatim.
 *
 * The file is not committed: it is whatever version of `@fastrp/phone-app-sdk` is installed, so
 * bumping the dependency is the whole upgrade. It has to be a file in the package rather than a
 * CDN URL because apps are served with `script-src 'self'` — an external script tag is blocked by
 * the browser and the app silently never connects.
 */
function syncSdk() {
  const require = createRequire(import.meta.url);
  let source;
  try {
    source = require.resolve('@fastrp/phone-app-sdk/child.umd.js');
  } catch {
    fail('@fastrp/phone-app-sdk is not installed. Run `bun install` first.');
  }
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(source, join(publicDir, 'fastapp-sdk.js'));
  console.log('  public/fastapp-sdk.js  <-  @fastrp/phone-app-sdk');
}

if (process.argv.includes('--sync-sdk')) {
  syncSdk();
  process.exit(0);
}

/**
 * Builds the zip the portal accepts.
 *
 * There is no manifest any more. A package used to carry `app.json` with a name, a hand-written
 * semver, an icon path, permissions and domains — all of which are facts about the app record
 * rather than about a build, and none of which a developer should have to keep in sync with a
 * form. The portal owns them, and the server numbers releases itself.
 *
 * What is left is what the scanner actually requires of the bytes.
 */
if (!existsSync(dist)) {
  fail('dist/ is missing. Run `bun run build` first.');
}

if (!existsSync(join(dist, 'index.html'))) {
  fail('index.html is not in dist/. It is the entry document the phone opens.');
}

// The one check the server does not repeat. A package without the SDK passes the scan, publishes,
// and then silently never connects to the phone — so catching it here is the only thing standing
// between a developer and a very confusing afternoon.
if (!existsSync(join(dist, 'fastapp-sdk.js'))) {
  fail('fastapp-sdk.js is not in dist/. Run `bun run sync-sdk` and build again — see index.html.');
}

const outPath = join(root, 'app.zip');
const output = createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const kb = Math.round(archive.pointer() / 1024);
  console.log(`\n  ${outPath.replace(root, '.')}  (${kb} KB)`);
  console.log('  Upload it from the developer portal.\n');
});

archive.on('warning', (error) => fail(error.message));
archive.on('error', (error) => fail(error.message));

archive.pipe(output);
// dist/ at the archive root — index.html has to be the first thing you see when the zip opens.
archive.directory(dist, false);
archive.finalize();
