import { handleUS2, capabilities } from "../../../server/markets/us/service.js";




const DEFAULT_ALLOWED_ORIGINS = [
  "https://a0979989987-coder.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function json(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  return res.end(JSON.stringify(body));
}

function ok(res, data, meta = undefined) {
  return json(res, 200, {
    ok: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

function fail(res, status, code, message, details = undefined) {
  return json(res, status, {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

function getAllowedOrigins() {
  const extra = String(process.env.OX_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra])];
}

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (!origin) {
    return true;
  }

  const allowed = getAllowedOrigins();

  if (!allowed.includes(origin)) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);

  res.setHeader("Vary", "Origin");

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  return true;
}

export default async function handler(req,res) {
 if(!applyCors(req,res))return fail(res,403,'ORIGIN_NOT_ALLOWED','此來源未開通。');
 if(req.method==='OPTIONS'){res.status(204);return res.end();}
 if(req.method!=='GET')return fail(res,405,'METHOD_NOT_ALLOWED','只接受 GET。');
 const endpoint=String(req.query.endpoint||'').toLowerCase();
 try {
  if(endpoint==='health')return ok(res,{service:'ox-us-market-data',mode:'eod',provider:capabilities().source,
   status:capabilities().externalDisplayConfirmed?'eod-configured':'display-unconfirmed',intradayEnabled:false,apiKeyRequired:false});
  const data=await handleUS2(endpoint,req.query);
  if(data===null)return fail(res,410,'US_INTRADAY_DISABLED','盤中資訊已停止，請使用收盤快照。');
  res.setHeader('Cache-Control',endpoint==='directory'?'public, s-maxage=86400':'public, s-maxage=300');
  return ok(res,data,{provider:capabilities().source,mode:'eod',contract:2});
 }catch(error){return fail(res,Number(error.status)||503,error.code||'US_EOD_UNAVAILABLE',error.message);}
}
