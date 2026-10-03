import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loopbackRequest, privateUSPreview } from '../server/markets/us/private-preview.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portFlag = process.argv.indexOf('--port');
const hostFlag = process.argv.indexOf('--host');
const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT) || 4173;
const privateUS = process.argv.includes('--us-private');
const liveUS = process.argv.includes('--us-live');
if(liveUS && privateUS)throw Error('Choose one US data mode.');
const liveHandler=liveUS?(await import('../api/v1/us/[endpoint].js')).default:null;
if (privateUS && hostFlag >= 0 && process.argv[hostFlag + 1] !== '127.0.0.1')
  throw Error('私人美股驗證僅能綁定 127.0.0.1。');
const host = privateUS || liveUS ? '127.0.0.1' : hostFlag >= 0 ? process.argv[hostFlag + 1] : '0.0.0.0';
const privateAPI = privateUS ? privateUSPreview({ snapshotPath: process.env.US_PRIVATE_INPUT }) : null;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    if(liveHandler && pathname.startsWith('/api/v1/us/')){
      const url=new URL(request.url,`http://127.0.0.1:${port}`);
      request.query={...Object.fromEntries(url.searchParams),endpoint:pathname.split('/').at(-1)};
      response.status=code=>{response.statusCode=code;return response;};
      await liveHandler(request,response);return;
    }
    if (privateAPI && pathname.startsWith('/api/v1/us/')) {
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!loopbackRequest(request) || request.method !== 'GET') {
        response.writeHead(403); response.end(JSON.stringify({ ok: false, error: { message: '僅限本機私人驗證。' } })); return;
      }
      try {
        const url = new URL(request.url, `http://127.0.0.1:${port}`);
        const data = await privateAPI(pathname.split('/').at(-1), Object.fromEntries(url.searchParams));
        if (data === null) throw Object.assign(Error('不支援此私人 API。'), { status: 404 });
        response.writeHead(200); response.end(JSON.stringify({ ok: true, data }));
      } catch (error) {
        const status = Number(error.status) || Number(error.code) || 502;
        if (status === 429) response.setHeader('Retry-After', String(Math.max(1, Number(error.retryAfter) || 60)));
        response.writeHead(status >= 400 && status <= 599 ? status : 502);
        response.end(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }));
      }
      return;
    }
    const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    const rel = relative(root, file);
    if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("Outside site root");
    if (rel.split(sep).some(part => part.startsWith('.'))) throw new Error("Private file");
    if (!(await stat(file)).isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    const body = await readFile(file);
    response.end((privateUS || liveUS) && file === resolve(root, 'index.html')
      ? body.toString().replace('<head>', `<head><script>window.OX_US_DATA_API_BASE=location.origin+'/api';</script>`)
      : body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, host, () => console.log(`OX preview: http://127.0.0.1:${port}/`));
