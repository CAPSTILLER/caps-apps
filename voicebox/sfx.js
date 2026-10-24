// Voice Box spooky sounds: all synthesized in code (no samples, nothing downloaded).
(() => {
"use strict";
const SR=44100;
let seed=1;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const N=s=>new Float32Array(Math.floor(s*SR));
const TAU=Math.PI*2;
function bq(type,f,Q){let b0,b1,b2,a1,a2,x1=0,x2=0,y1=0,y2=0;
  const set=(f,q)=>{const w=TAU*Math.min(f,SR*.45)/SR,c=Math.cos(w),a=Math.sin(w)/(2*q);let n0,n1,n2;
    if(type==="lp"){n0=(1-c)/2;n1=1-c;n2=n0;}else if(type==="hp"){n0=(1+c)/2;n1=-(1+c);n2=n0;}else{n0=a;n1=0;n2=-a;}
    const a0=1+a;b0=n0/a0;b1=n1/a0;b2=n2/a0;a1=-2*c/a0;a2=(1-a)/a0;};
  set(f,Q);const fn=x=>{const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;};fn.set=set;return fn;}
const norm=(d,pk=.9)=>{let m=0;for(const v of d)m=Math.max(m,Math.abs(v));if(m)for(let i=0;i<d.length;i++)d[i]*=pk/m;return d;};
function loopify(d,xf){const n=Math.floor(xf*SR),o=d.slice(0,d.length-n);for(let i=0;i<n;i++){const t=i/n;o[i]=o[i]*t+d[d.length-n+i]*(1-t);}return o;}
function voice(d,t0,dur,f0fn,forms,amp,bright=1){ // glottal pulse train through formant filters
  const fs=forms.map(([f,q])=>bq("bp",f,q));let ph=0;const s=Math.floor(t0*SR),n=Math.floor(dur*SR);
  for(let i=0;i<n&&s+i<d.length;i++){const t=i/n,f=f0fn(t,i/SR);ph+=f/SR;if(ph>1)ph-=1;
    const src=(1-2*ph)*bright+(rnd()*2-1)*.15;let y=0;for(const F of fs)y+=F(src);
    const e=Math.min(1,t*12)*Math.pow(1-t,1.5);d[s+i]+=y*e*amp;}}
const S={};
S.laugh={e:"😈",n:"Evil laugh",gen(){const d=N(2.6);for(let k=0;k<8;k++){const f=150-k*7;
  voice(d,.1+k*.28,.2,(t,s)=>f*(1+.08*Math.sin(TAU*6*s))*(1-.15*t),[[650,6],[1100,8],[2500,10]],1,1);}
  for(let k=0;k<8;k++)voice(d,.1+k*.28,.2,()=>(150-k*7)/2,[[400,4]],.6);return norm(d);}};
S.cackle={e:"🧙",n:"Witch cackle",gen(){const d=N(2.2);for(let k=0;k<14;k++){const f=720-k*18+rnd()*60;
  voice(d,.05+k*.14,.1,(t)=>f*(1+.25*(1-t)),[[1100,8],[2600,10],[3300,12]],1,1.3);}return norm(d);}};
S.ghost={e:"👻",n:"Ghost wail",gen(){const d=N(3.5),nb=bq("bp",600,3);let ph=0,ph2=0;
  for(let i=0;i<d.length;i++){const s=i/SR,t=s/3.5,f=(300+500*Math.sin(Math.PI*t)**1.5)*(1+.03*Math.sin(TAU*5*s));ph+=f/SR;ph2+=f*1.5/SR;
    nb.set(500+1800*Math.sin(Math.PI*t),3);const e=Math.sin(Math.PI*t)**.8;
    d[i]=(Math.sin(TAU*ph)*.6+Math.sin(TAU*ph2)*.15+nb(rnd()*2-1)*1.6)*e;}return norm(d,.85);}};
S.door={e:"🚪",n:"Creaky door",gen(){const d=N(2.6),fs=[bq("bp",480,18),bq("bp",1150,20),bq("bp",2300,22)];let next=0;
  for(let i=0;i<d.length;i++){const s=i/SR,t=s/2.6,rate=15+45*Math.sin(Math.PI*t)**2;let x=0;
    if(i>=next){x=1;next=i+SR/rate*(.85+rnd()*.3);}let y=0;for(const F of fs)y+=F(x);d[i]=y*Math.min(1,t*8)*Math.min(1,(1-t)*6);}return norm(d);}};
S.thunder={e:"⛈️",n:"Thunder",gen(){const d=N(4.5),lp=bq("lp",110,.8),hp=bq("bp",2500,1);let br=0,m=0;
  for(let i=0;i<d.length;i++){const s=i/SR,w=rnd()*2-1;br=(br+w*.02)*.995;m+=((rnd()<.0005?1:0)-m)*.0003;
    const crack=s<.25?hp(w)*Math.exp(-s*14)*3:0;d[i]=crack+lp(br)*14*Math.exp(-s*.9)*(.6+Math.sin(TAU*1.3*s)**2*.6)*Math.min(1,s*20);}return norm(d);}};
S.wind={e:"🌬️",n:"Wind",loop:true,gen(){const d=N(7),b=bq("bp",500,3),b2=bq("bp",1200,6);
  for(let i=0;i<d.length;i++){const s=i/SR,f=500+300*Math.sin(TAU*.13*s)+200*Math.sin(TAU*.31*s+1);b.set(f,3);b2.set(f*2.2,8);
    const w=rnd()*2-1;d[i]=(b(w)*1.5+b2(w)*.8)*(.55+.45*Math.sin(TAU*.17*s)**2);}return norm(loopify(d,1),.7);}};
S.chains={e:"⛓️",n:"Chains",gen(){const d=N(2.2);for(let k=0;k<26;k++){const t0=Math.min(1.9,(rnd()**1.4)*1.9),fr=[2100,3350,5150,6900].map(f=>f*(.85+rnd()*.3)),dec=12+rnd()*30,a=.3+rnd()*.7,s0=Math.floor(t0*SR);
  for(let i=0;i<SR*.3&&s0+i<d.length;i++){const s=i/SR;let y=0;for(let j=0;j<4;j++)y+=Math.sin(TAU*fr[j]*s)/(j+1);d[s0+i]+=y*a*Math.exp(-s*dec);}}return norm(d);}};
S.heart={e:"💓",n:"Heartbeat",loop:true,gen(){const d=N(1.6);for(const[t0,a]of[[0,1],[.26,.7],[.8,1],[1.06,.7]]){const s0=Math.floor(t0*SR);let ph=0;
  for(let i=0;i<SR*.2;i++){const s=i/SR;ph+=(60-25*s/.2)/SR;d[s0+i]+=Math.sin(TAU*ph)*a*Math.exp(-s*22)*Math.min(1,s*300);}}return norm(d);}};
S.howl={e:"🐺",n:"Wolf howl",gen(){const d=N(4);voice(d,.1,3.7,(t,s)=>{const g=t<.25?350+400*(t/.25):t<.7?750:750-300*((t-.7)/.3);return g*(1+.02*t*Math.sin(TAU*5.5*s));},[[800,5],[1300,9]],1,.7);return norm(d);}};
S.cauldron={e:"🧪",n:"Cauldron",loop:true,gen(){const d=N(6),lp=bq("lp",180,.7);for(let i=0;i<d.length;i++)d[i]=lp(rnd()*2-1)*.8;
  for(let k=0;k<70;k++){const s0=Math.floor(rnd()*5.9*SR),f=180+rnd()*450,L=.03+rnd()*.06,a=.2+rnd()*.5;let ph=0;
    for(let i=0;i<L*SR&&s0+i<d.length;i++){const t=i/(L*SR);ph+=f*(1+t*.9)/SR;d[s0+i]+=Math.sin(TAU*ph)*a*Math.sin(Math.PI*t);}}return norm(loopify(d,.5),.75);}};
S.scream={e:"😱",n:"Scream",gen(){const d=N(2);voice(d,0,1.9,(t,s)=>(950+350*Math.sin(Math.PI*t))*(1+.04*Math.sin(TAU*9*s)+.02*(rnd()-.5)),[[1100,5],[2600,8],[3800,10]],1,1.4);
  for(let i=0;i<d.length;i++)d[i]=Math.tanh(d[i]*3);return norm(d,.8);}};
S.organ={e:"🎹",n:"Organ chord",gen(){const d=N(4.5),notes=[146.83,174.61,220,293.66,415.3],H=[[1,1],[2,.6],[3,.35],[4,.3],[8,.15]];
  for(let i=0;i<d.length;i++){const s=i/SR;let y=0;for(const f of notes)for(const[h,a]of H)y+=Math.sin(TAU*f*h*s)*a;
    d[i]=y*Math.min(1,s*6)*Math.min(1,(4.5-s)*1.5)*(1+.06*Math.sin(TAU*5*s));}return norm(d,.8);}};
S.bats={e:"🦇",n:"Bats",gen(){const d=N(2.6),bp=bq("bp",900,1.5);for(let i=0;i<d.length;i++){const s=i/SR;d[i]=bp(rnd()*2-1)*(Math.max(0,Math.sin(TAU*24*s))**2)*Math.sin(Math.PI*s/2.6)*1.5;}
  for(let k=0;k<22;k++){const s0=Math.floor(rnd()*2.4*SR),f=3000+rnd()*3500,L=.02+rnd()*.03;let ph=0;for(let i=0;i<L*SR;i++){const t=i/(L*SR);ph+=f*(1-t*.4)/SR;d[s0+i]+=Math.sin(TAU*ph)*.5*Math.sin(Math.PI*t);}}return norm(d);}};
S.steps={e:"👣",n:"Footsteps",gen(){const d=N(4),lp=bq("lp",300,1),hp=bq("bp",2500,2);for(let k=0;k<6;k++){const s0=Math.floor((.15+k*.62+rnd()*.05)*SR),a=.7+rnd()*.3;
  for(let i=0;i<SR*.2;i++){const s=i/SR,w=rnd()*2-1;d[s0+i]+=(lp(w)*6*Math.exp(-s*30)+hp(w)*.5*Math.exp(-s*60))*a;}}return norm(d);}};
S.theremin={e:"🛸",n:"Theremin",gen(){const d=N(4.5),mel=[[0,440],[.6,523.25],[1.2,466.16],[1.8,392],[2.6,349.23],[3.4,440]];let ph=0,f=440;
  for(let i=0;i<d.length;i++){const s=i/SR;let tgt=mel[0][1];for(const[t,n]of mel)if(s>=t)tgt=n;f+=(tgt-f)*.0006;ph+=f*(1+.012*Math.sin(TAU*6*s))/SR;
    d[i]=(Math.sin(TAU*ph)+.12*Math.sin(TAU*2*ph))*Math.min(1,s*3)*Math.min(1,(4.5-s)*2);}return norm(d,.75);}};
const cache={};
function get(k){if(!cache[k]){seed=k.split("").reduce((a,c)=>a*31+c.charCodeAt(0),7)>>>0;cache[k]=S[k].gen();}return cache[k];}
function buffer(k){const d=get(k),b=new AudioBuffer({numberOfChannels:1,length:d.length,sampleRate:SR});b.copyToChannel(d,0);return b;}
window.VBSFX={list:S,buffer,SR};
})();
