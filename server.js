// 台风实时监控站 · 本地服务
// 代理浙江省水利厅台风路径官方API（解决浏览器跨域），并提供静态页面
// 启动: node server.js  → http://localhost:8737
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8737;
const API_BASE = 'https://typhoon.slt.zj.gov.cn/Api';
const CACHE_TTL = 5 * 60 * 1000; // 官方数据约每小时更新，5分钟缓存足够礼貌

let cache = { at: 0, data: null };

async function fetchJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function getActiveTyphoons() {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_TTL) return { ...cache.data, cached: true };
  try {
    const year = new Date().getFullYear();
    let list = await fetchJSON(`${API_BASE}/TyphoonList/${year}`);
    let active = (list || []).filter(t => t.isactive === '1');
    // 跨年初期当年列表可能为空，回看上一年
    if (!active.length && new Date().getMonth() === 0) {
      const prev = await fetchJSON(`${API_BASE}/TyphoonList/${year - 1}`).catch(() => []);
      active = (prev || []).filter(t => t.isactive === '1');
    }
    const typhoons = [];
    for (const t of active) {
      const info = await fetchJSON(`${API_BASE}/TyphoonInfo/${t.tfid}`).catch(() => null);
      if (info) typhoons.push(info);
    }
    cache = { at: now, data: { fetchedAt: new Date().toISOString(), typhoons, stale: false } };
    return cache.data;
  } catch (err) {
    if (cache.data) return { ...cache.data, stale: true, error: String(err.message || err) };
    return { fetchedAt: new Date().toISOString(), typhoons: [], stale: true, error: String(err.message || err) };
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/api/active') {
      const data = await getActiveTyphoons();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
      return;
    }
    const file = url === '/' ? 'index.html' : url.slice(1);
    const fp = path.join(__dirname, path.normalize(file));
    if (!fp.startsWith(__dirname) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}).listen(PORT, () => console.log(`台风监控站运行中 → http://localhost:${PORT}`));
