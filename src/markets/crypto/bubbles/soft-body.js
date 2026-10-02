const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// A bounded, area-preserving deformation tensor. The contact normal shortens
// the bubble; its tangent expands, then a damped spring restores the circle.
export function squeeze(node,nx,ny,pressure){
 if(!Number.isFinite(pressure)||pressure<=0)return;
 const length=Math.hypot(nx,ny);if(!length)return;nx/=length;ny/=length;
 const p=clamp(pressure,0,.15);
 node.strainX=(node.strainX||0)+p*(ny*ny-nx*nx);
 node.strainY=(node.strainY||0)-p*2*nx*ny;
 const magnitude=Math.hypot(node.strainX,node.strainY),limit=.24;
 if(magnitude>limit){node.strainX*=limit/magnitude;node.strainY*=limit/magnitude;}
}
export function recover(node,dt=1){
 dt=clamp(dt,0,2);
 for(const [key,velocity] of [['strainX','strainVX'],['strainY','strainVY']]){
  let x=node[key]||0,v=node[velocity]||0;
  v+=( -x*.085-v*.24)*dt;x+=v*dt;
  if(Math.abs(x)+Math.abs(v)<.0001)x=v=0;
  node[key]=x;node[velocity]=v;
 }
}
export function deformation(node){
 const amount=Math.min(.24,Math.hypot(node.strainX||0,node.strainY||0));
 return {angle:amount?Math.atan2(node.strainY||0,node.strainX||0)/2:0,sx:Math.exp(amount),sy:Math.exp(-amount)};
}
