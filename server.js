require('dotenv').config();

const fs   = require('fs');
const http = require('http');
const path = require('path');
const port = 3000;

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.glb':  'model/gltf-binary',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

console.log('RMBG key loaded:', process.env.RMBG_API_KEY ? 'YES' : 'NO — check your .env file');

http.createServer((req, res) => {

  // ── /config endpoint — returns the key to the frontend ───
  // Never logged, never in any HTML file, only sent when the
  // page explicitly requests it.
  if (req.url === '/config') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      // Prevent the browser from caching the key
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({
      rmbgApiKey: process.env.RMBG_API_KEY || '',
    }));
    return;
  }

  // ── Static file serving ───────────────────────────────────
  let urlPath = req.url.split('?')[0]; // strip query strings
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const ext = path.extname(filePath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const content = fs.readFileSync(filePath, ext === '.html' ? 'utf8' : null);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(content);

}).listen(port, () => {
  console.log(`Running at http://localhost:${port}`);
});