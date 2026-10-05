// Retry a transient module fetch once without reusing a rejected module-map entry.
export async function loadToolModule(url,{current=()=>true,importer=url=>import(url),pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  try{return await importer(url);}catch(error){
    if(!(error instanceof TypeError)||!/fetch|dynamically imported module|importing a module script|load.*module|module.*load/i.test(error.message)||!current())throw error;
    await pause(250);if(!current())throw error;
    const retry=new URL(url);retry.searchParams.set('oxImportRetry','1');
    return importer(retry.href);
  }
}
