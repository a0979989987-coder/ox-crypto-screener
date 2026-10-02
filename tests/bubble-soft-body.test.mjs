import test from 'node:test';
import assert from 'node:assert/strict';
import {squeeze,recover,deformation} from '../src/markets/crypto/bubbles/soft-body.js';
import {usBubbleRadii} from '../src/markets/us/visuals.js';
test('a contact compresses along the contact normal, conserves area and recovers after release',()=>{
 const n={};squeeze(n,1,0,.12);let d=deformation(n);
 assert(Math.abs(d.angle-Math.PI/2)<1e-9);assert(d.sx>1&&d.sy<1);assert(Math.abs(d.sx*d.sy-1)<1e-10);
 for(let i=0;i<180;i++)recover(n);d=deformation(n);assert(Math.abs(d.sx-1)<.0002);assert(Math.abs(d.sy-1)<.0002);
 const corner={};for(let i=0;i<1000;i++){squeeze(corner,1,1,100);recover(corner,2);}
 d=deformation(corner);assert(d.sx<=Math.exp(.24));assert(d.sy>=Math.exp(-.24));assert(Number.isFinite(d.angle));
});
test('pressure and impulse states stay finite for empty and invalid inputs',()=>{
 const n={};squeeze(n,0,0,1);squeeze(n,1,0,NaN);assert.deepEqual(deformation(n),{angle:0,sx:1,sy:1});recover(n,.2);assert(Object.values(n).every(Number.isFinite));
});
test('US bubble size keeps average traded value ordering while fitting mobile bounds',()=>{
 const r=usBubbleRadii([{liquidity:1e6},{liquidity:1e9}],320,440);assert(r[1]>r[0]);assert(r.every(x=>x>0&&x<160));assert.deepEqual(usBubbleRadii([],320,440),[]);
});
