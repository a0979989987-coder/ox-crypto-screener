import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

for(const previous of ['home','strength','data','media'])test(`first US entry from ${previous} binds host before reentrant view event`,async()=>{
 const calls=[];
 const document={body:{dataset:{market:'us',view:previous}},addEventListener(){}};
 class USWorkspace {
  constructor(){this.state={view:'radar'};}
  activate(view){this.root={hidden:true};calls.push('activate');this.state.view=view;return Promise.resolve();}
  show(view){this.root.hidden=false;this.state.view=view;calls.push('show');}
 }
 let module;
 const window={switchAppView(view){document.body.dataset.view=view;module.view(view);}};
 const context=vm.createContext({document,window,USWorkspace,US_MODULE_CONFIG:{id:'us',label:'美股',status:'ready'},createUSMarketState:()=>({})});
 const source=(await readFile(new URL('../src/markets/us/index.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export const usModule','const usModule');
 vm.runInContext(source+'\nglobalThis.testModule=usModule;',context);module=context.testModule;
 await module.activate({view:previous});
 assert.deepEqual(calls,['activate','show']);
 assert.equal(document.body.dataset.view,'radar');
});
