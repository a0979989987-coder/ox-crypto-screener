import { withDeadline } from './resource-deadline.js';
const failed = new Set();
const loaded = new Map();
let attempt = 0;
const transient = error => error?.name === 'TimeoutError' ||
  error?.name === 'TypeError' && /fetch|dynamically imported module|importing a module script|load.*module|module.*load/i.test(error.message);
function freshURL(url) {
  const retry = new URL(url);
  retry.searchParams.set('oxImportRetry', `${Date.now()}-${++attempt}`);
  return retry.href;
}
// Bound stalled imports too. Each manual retry must escape the rejected entry
// from the previous automatic retry, not repeatedly import oxImportRetry=1.
export async function loadToolModule(url,{current=()=>true,importer=url=>import(url),pause=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=15000}={}){
  url=String(url);
  if(loaded.has(url))return loaded.get(url);
  for(let retry=0;retry<2;retry++){
    if(!current())throw new DOMException('已切換工具','AbortError');
    const target=failed.has(url)?freshURL(url):url;
    try{const module=await withDeadline(()=>importer(target),timeoutMs,'工具下載逾時');loaded.set(url,module);failed.delete(url);return module;}
    catch(error){
      if(!transient(error)||!current())throw error;
      failed.add(url);
      if(retry)throw error;
      await pause(250);
    }
  }
}
