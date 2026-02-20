import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const PORT = process.env.PORT || 3000;
const DIST = join(process.cwd(), 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

async function tryFile(filePath) {
  try {
    const s = await stat(filePath);
    if (s.isFile()) {
      const content = await readFile(filePath);
      return content;
    }
  } catch {}
  return null;
}

const server = createServer(async (req, res) => {
  let url = new URL(req.url, `http://${req.headers.host}`).pathname;

  // Try exact file
  let filePath = join(DIST, url);
  let content = await tryFile(filePath);

  // Try with index.html for directories
  if (!content) {
    content = await tryFile(join(filePath, 'index.html'));
    if (content) filePath = join(filePath, 'index.html');
  }

  // Try with .html extension
  if (!content) {
    content = await tryFile(filePath + '.html');
    if (content) filePath = filePath + '.html';
  }

  if (content) {
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } else {
    // 404 - redirect to /es/
    res.writeHead(302, { Location: '/es/' });
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
