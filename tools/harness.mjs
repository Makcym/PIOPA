// Serves the extension so its pages open in an ordinary browser tab with the mock
// portal behind them — for looking at the interface, the screenshots and the video:
//
//   node tools/harness.mjs            → http://127.0.0.1:8787/popup.html?lang=ru
//
// popup.html / options.html get tools/mock-data.js and tools/shim.js in front of their
// own scripts, and background.js after core.js, so the service worker's listeners run
// in the same page. The files on disk are not changed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname)));
  // the service worker alone, for the video stage: mock, shim, core, background
  if (url.pathname === '/__worker.html') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    res.end('<!doctype html><meta charset="utf-8"><script src="/tools/mock-data.js"></script><script src="/tools/shim.js"></script><script src="/core.js"></script><script src="/background.js"></script>');
    return;
  }
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  let body = fs.readFileSync(file);
  if (/^\/(popup|options)\.html$/.test(url.pathname)) {
    body = body.toString('utf8')
      .replace('<head>', '<head>\n  <script src="/tools/mock-data.js"></script>\n  <script src="/tools/shim.js"></script>')
      .replace('<script src="core.js"></script>', '<script src="core.js"></script>\n  <script src="background.js"></script>');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/popup.html?lang=ru`));
