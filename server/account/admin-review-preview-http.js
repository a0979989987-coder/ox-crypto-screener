// Development-only HTTP adapter. No production API imports this module.
import { randomBytes } from 'node:crypto';
import { createReviewService, ReviewError } from './admin-review-preview.js';
export function createPreviewHTTP({db,origin,fixtureIDs,ordinaryCapabilities=[],serviceFactory}) {
  if(process.env.VERCEL || process.env.NODE_ENV==='production') throw Error('Local preview is disabled in production');
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Loopback origin required');
  const sessions=new Map();
  function identity(req) {
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ox-review-fixture='))?.slice(18);
    const session=sessions.get(token); return session?.until>Date.now()?{id:session.id}:null;
  }
  const service=serviceFactory?serviceFactory(db,async req=>identity(req)):createReviewService({db,validateIdentity:async req=>identity(req),ordinaryCapabilities});
  return async function handle(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    try {
      if(req.headers.host!==new URL(origin).host) return send(403,{code:'LOOPBACK_ONLY'});
      if(!['GET','POST'].includes(req.method)) return send(405,{code:'METHOD_NOT_ALLOWED'});
      let body;
      if(req.method==='POST') {
        if(req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!=='application/json') return send(403,{code:'ORIGIN_REQUIRED'});
        let raw=''; for await(const chunk of req){raw+=chunk; if(Buffer.byteLength(raw)>65536) return send(413,{code:'BODY_TOO_LARGE'});}
        try{body=JSON.parse(raw);}catch{return send(400,{code:'INVALID_JSON'});}
      }
      const endpoint=new URL(req.url,origin).pathname.split('/').at(-1);
      if(endpoint==='fixture-session'&&req.method==='POST') {
        if(!body || Object.keys(body).length!==1 || !['admin','member','guest'].includes(body.mode)) return send(400,{code:'INVALID_FIXTURE'});
        const old=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ox-review-fixture='))?.slice(18);sessions.delete(old);
        const token=randomBytes(32).toString('base64url');
        if(body.mode!=='guest') sessions.set(token,{id:body.mode==='admin'?fixtureIDs.admin:fixtureIDs.a,until:Date.now()+3600000});
        // Local HTTP cookie only. Real production sessions use existing Secure OX cookies.
        res.setHeader('Set-Cookie',`ox-review-fixture=${body.mode==='guest'?'':token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${body.mode==='guest'?0:3600}`);
        return send(200,{ok:true,fixture:true,mode:body.mode});
      }
      if(endpoint==='lookup'&&req.method==='POST') {
        if(!body || Array.isArray(body) || typeof body!=='object' || Object.keys(body).length!==1 || !Object.hasOwn(body,'uids')) return send(400,{code:'INVALID_UIDS'});
        return send(200,await service.lookup(req,body.uids));
      }
      if(endpoint==='approve'&&req.method==='POST') return send(200,await service.approve(req,body));
      if(endpoint==='revoke'&&req.method==='POST') return send(200,await service.revoke(req,body));
      if(endpoint==='records'&&req.method==='GET') return send(200,await service.list(req));
      if(endpoint==='effective'&&req.method==='GET') return send(200,await service.effective(req));
      return send(404,{code:'NOT_FOUND'});
    }catch(error){const expected=error instanceof ReviewError||['SIGN_IN_REQUIRED','ADMIN_REQUIRED','REVIEW_UNAVAILABLE'].includes(error.code)||/^(INVALID_|REASON_REQUIRED|DUPLICATE_TARGET|IDEMPOTENCY_|POLICY_CHANGED|APPROVAL_CHANGED)/.test(error.code||'');return send(expected?error.status:503,{code:expected?error.code:'PREVIEW_UNAVAILABLE'});}
  };
}
