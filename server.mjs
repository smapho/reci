import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/receipts.js';
const files = { '/': ['index.html','text/html'], '/index.html':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/styles.css':['styles.css','text/css'] };
http.createServer(async (req,res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
  try {
    const path = new URL(req.url,'http://localhost').pathname;
    if (path === '/api/receipts') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4200000) return res.status(413).json({error:'画像が大きすぎます。'}); }
      try { req.body = body ? JSON.parse(body) : undefined; } catch { return res.status(400).json({error:'JSONが不正です。'}); }
      return await handler(req,res);
    }
    if (!files[path]) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type',files[path][1]+'; charset=utf-8'); res.end(await readFile(new URL(files[path][0],import.meta.url)));
  } catch { res.status(500).json({error:'サーバーエラー'}); }
}).listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>console.log(`http://localhost:${process.env.PORT || 3000}`));
