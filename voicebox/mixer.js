// Voice Box Mix maker: multi-track timeline of My clips + spooky sounds, rendered offline on-device.
(() => {
"use strict";
const VB=window.VB,SFX=window.VBSFX,SR=44100,$=id=>document.getElementById(id),root=$("mx");
const FX={none:{n:"No effect"},reverb:{n:"🏚️ Reverb",st:{preset:"clean",pitch:0,dist:0,wet:100,p:{rev:1}},tail:2.5},
  echo:{n:"🔁 Echo",st:{preset:"clean",pitch:0,dist:0,wet:100,p:{delay:.35,fb:.45}},tail:2.5}};
for(const[k,p]of Object.entries(VB.PRESETS))if(k!=="clean")FX[k]={n:p.e+" "+p.n,st:{preset:k,pitch:p.pitch,dist:p.dist,wet:100},tail:p.delay||p.rev?2:0};
let M,pps=40,raw={},proc={},mixCache=null,play=null,sel=null;
const uid=()=>Math.random().toString(36).slice(2,9);
const tDur=t=>t.loop?t.len:Math.max(.05,t.out-t.in);
const total=()=>Math.max(0,...M.tracks.map(t=>t.start+tDur(t)));
const audible=t=>{const solo=M.tracks.some(x=>x.solo);return !t.missing&&(solo?t.solo&&!t.mute:!t.mute);};
const srcKey=s=>s.type+":"+(s.key||s.id);
async function getRaw(src){const k=srcKey(src);if(!raw[k]){
  if(src.type==="sfx")raw[k]=SFX.buffer(src.key);else{const c=await VB.getClip(src.id);if(!c)throw new Error("missing");raw[k]=await VB.decode(c.audio);}}return raw[k];}
async function getProc(t){const k=JSON.stringify([srcKey(t.src),t.in,t.out,t.fx,t.loop]);if(proc[k])return proc[k];
  const r=await getRaw(t.src),sr=r.sampleRate,a=Math.floor(t.in*sr),b=Math.max(a+1,Math.min(r.length,Math.floor(t.out*sr))),f=FX[t.fx]||FX.none;
  const tail=f.st&&!t.loop?Math.floor((f.tail||0)*sr):0;let seg=VB.newBuf(b-a+tail,sr);seg.copyToChannel(r.getChannelData(0).subarray(a,b),0);
  if(f.st)seg=await VB.renderFx(seg,f.st);return proc[k]={buf:seg,loopLen:(b-a)/sr};}
async function renderMix(){const key=JSON.stringify(M.tracks);if(mixCache&&mixCache.key===key)return mixCache.buf;
  const len=Math.max(1,Math.ceil((total()+.05)*SR));const oc=new OfflineAudioContext(1,len,SR);
  const lim=oc.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=6;lim.ratio.value=12;lim.attack.value=.003;lim.release.value=.2;lim.connect(oc.destination);
  for(const t of M.tracks){if(!audible(t))continue;let p;try{p=await getProc(t);}catch(e){t.missing=true;continue;}
    const s=oc.createBufferSource(),g=oc.createGain();s.buffer=p.buf;g.gain.value=t.vol/100;s.connect(g);g.connect(lim);
    if(t.loop){s.loop=true;s.loopStart=0;s.loopEnd=p.loopLen;s.start(t.start);s.stop(t.start+t.len);}else s.start(t.start);}
  const buf=await oc.startRendering();const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.max(-1,Math.min(1,d[i]));
  mixCache={key,buf};return buf;}
// ---------- UI ----------
root.innerHTML=`<div class="mtop"><button id="mxClose" aria-label="Close">✕</button><input id="mxName" maxlength="40"><button id="mxSave" class="hot">💾 Save</button></div>
<div class="mbar"><button id="mxPlay" class="big">▶ Play</button><button id="mxZo" aria-label="Zoom out">−</button><button id="mxZi" aria-label="Zoom in">+</button><span id="mxTime">0:00</span></div>
<div class="tlw" id="mxTlw"><div class="tl" id="mxTl"><div class="ruler" id="mxRuler"></div><div id="mxLanes"></div><div class="ph" id="mxPh"></div></div></div>
<p class="hint" id="mxEmpty">Add sounds below, then drag the blocks left/right to place them. Tap ⚙ for volume, effect, trim & loop.</p>
<div class="mrow"><button id="mxAddClip">＋ 🎙 My clip</button><button id="mxAddSfx">＋ 🎃 Spooky sound</button></div>
<div class="mrow"><button id="mxRender" class="hot">🎬 Save mix to My clips</button></div>
<div class="mrow three"><button id="mxMp3">⬇ MP3</button><button id="mxWav">⬇ WAV</button><button id="mxProj">📂 Mixes</button></div>
<div class="sheet" id="mxSheet" hidden><div class="sbox" id="mxSbox"></div></div>`;
const css=document.createElement("style");css.textContent=`
#mx{position:fixed;inset:0;z-index:60;background:radial-gradient(circle at 50% -20%,#2a0f3d,#050505 60%);overflow:auto;padding:max(10px,env(safe-area-inset-top)) 12px 30px;color:#f6f1e4}
#mx button{background:#111;border:2px solid #6b2fb3;color:#f6f1e4;border-radius:12px;padding:12px 8px;font-weight:800;font-size:14px;min-height:48px}
#mx button.hot,#mx .big{border-color:#ff7a18;color:#ffb366}
#mx .mtop,#mx .mbar{display:flex;gap:6px;align-items:center;margin-bottom:8px}
#mxName{flex:1;min-width:0;background:#111;border:2px solid #333;color:#ff9a3c;border-radius:10px;padding:11px;font-size:16px;font-weight:800}
#mx .mbar .big{flex:1}#mxZo,#mxZi{width:52px}#mxTime{font:700 14px monospace;color:#c8c0b0;min-width:54px;text-align:right}
.tlw{overflow-x:auto;overflow-y:hidden;border:2px solid #3a1f55;border-radius:12px;background:#0b0610;-webkit-overflow-scrolling:touch}
.tl{position:relative;min-width:100%}.ruler{height:20px;position:relative;border-bottom:1px solid #3a1f55}
.ruler i{position:absolute;top:0;height:20px;border-left:1px solid #3a1f55;font:10px monospace;color:#8a7f9a;padding-left:2px;font-style:normal}
.ln{border-bottom:1px solid #241634}.lh{position:sticky;left:0;display:flex;gap:4px;align-items:center;padding:4px 6px;width:min(calc(100vw - 40px),420px)}
.lh b{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mx .lh button{min-height:38px;padding:4px 10px;font-size:13px;border-color:#333}
#mx .lh button.on{border-color:#ff7a18;background:#3a1a00;color:#ffb366}#mx .lh button.solo.on{border-color:#4ae04a;background:#0f2a0f;color:#8f8}
.lb{position:relative;height:58px}.blk{position:absolute;top:3px;height:52px;border-radius:9px;background:#3a1a55;border:2px solid #a45cff;touch-action:none;overflow:hidden;cursor:grab}
.blk.sfx{background:#3a1a00;border-color:#ff7a18}.blk.off{opacity:.35}.blk.drag{box-shadow:0 0 14px #ff7a18}.blk canvas{position:absolute;inset:0;width:100%;height:100%}
.blk span{position:absolute;left:5px;top:2px;font-size:11px;font-weight:800;text-shadow:0 0 3px #000;white-space:nowrap}
.ph{position:absolute;top:0;bottom:0;width:2px;background:#ff3b3b;left:0;pointer-events:none;display:none}
#mx .mrow{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}#mx .mrow:has(> :only-child){grid-template-columns:1fr}#mx .mrow.three{grid-template-columns:1fr 1fr 1fr}
.sheet[hidden]{display:none}
.sheet{position:fixed;inset:0;background:#000a;display:flex;align-items:flex-end;z-index:70}.sbox{background:#140a1e;border-top:3px solid #ff7a18;border-radius:18px 18px 0 0;width:100%;max-height:82vh;overflow:auto;padding:14px 14px 24px}
.sbox h3{margin:0 0 10px;color:#ff9a3c}.sbox .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.sbox .grid button span{display:block;font-size:22px}
.sbox label{display:block;margin:10px 0 2px;font-size:13px;color:#c8c0b0;font-weight:700}.sbox input[type=range]{width:100%}.sbox select{width:100%;font-size:16px;padding:10px;background:#111;color:#f6f1e4;border:2px solid #6b2fb3;border-radius:10px}
.sbox .list button{display:block;width:100%;text-align:left;margin-bottom:6px}.sbox .rowb{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:14px}`;
document.head.append(css);
const fmt=s=>Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0");
function changed(){mixCache=null;draw();}
function draw(){const T=Math.max(total()+4,20),W=Math.max(T*pps,$("mxTlw").clientWidth);$("mxTl").style.width=W+"px";
  const step=pps>=60?1:pps>=25?2:pps>=12?5:10;let r="";for(let s=0;s<T;s+=step)r+=`<i style="left:${s*pps}px">${fmt(s)}</i>`;$("mxRuler").innerHTML=r;
  $("mxEmpty").hidden=M.tracks.length>0;const L=$("mxLanes");L.innerHTML="";
  M.tracks.forEach(t=>{const ln=document.createElement("div");ln.className="ln";
    ln.innerHTML=`<div class="lh"><b>${t.missing?"⚠ ":""}${esc(t.name)}${t.loop?" ⟳":""}${t.fx!=="none"?" · "+FX[t.fx].n:""}</b><button class="mute ${t.mute?"on":""}">M</button><button class="solo ${t.solo?"on":""}">S</button><button class="set">⚙</button></div><div class="lb"><div class="blk ${t.src.type} ${audible(t)?"":"off"}"><canvas></canvas><span></span></div></div>`;
    ln.querySelector(".mute").onclick=()=>{t.mute=!t.mute;changed();};ln.querySelector(".solo").onclick=()=>{t.solo=!t.solo;changed();};ln.querySelector(".set").onclick=()=>trackSheet(t);
    const b=ln.querySelector(".blk");b.style.left=t.start*pps+"px";b.style.width=Math.max(8,tDur(t)*pps)+"px";b.querySelector("span").textContent=fmt(t.start);dragify(b,t);thumb(b.querySelector("canvas"),t);
    L.append(ln);});}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function thumb(cv,t){let r;try{r=await getRaw(t.src);}catch(e){return;}const w=Math.min(2000,Math.max(8,Math.round(tDur(t)*pps))),h=48;cv.width=w;cv.height=h;
  const g=cv.getContext("2d"),d=r.getChannelData(0),sr=r.sampleRate,a=t.in*sr,seg=Math.max(1,(t.out-t.in)*sr),per=tDur(t)*sr/w;g.fillStyle=t.src.type==="sfx"?"#ffb366":"#d2a8ff";
  for(let x=0;x<w;x++){let m=0;const s0=x*per;for(let j=0;j<per;j+=Math.max(1,per/32)){const i=Math.floor(a+((s0+j)%seg));m=Math.max(m,Math.abs(d[i]||0));}const y=m*h*.48;g.fillRect(x,h/2-y,1,y*2+1);}}
function dragify(b,t){let x0,s0,id=null;
  b.onpointerdown=e=>{id=e.pointerId;b.setPointerCapture(id);x0=e.clientX;s0=t.start;b.classList.add("drag");};
  b.onpointermove=e=>{if(e.pointerId!==id)return;t.start=Math.max(0,Math.round((s0+(e.clientX-x0)/pps)*20)/20);b.style.left=t.start*pps+"px";b.querySelector("span").textContent=fmt(t.start)+"."+Math.round(t.start%1*10);};
  b.onpointerup=b.onpointercancel=e=>{if(e.pointerId!==id)return;id=null;b.classList.remove("drag");if(t.start!==s0)changed();};}
function sheet(html){$("mxSbox").innerHTML=html;$("mxSheet").hidden=false;return $("mxSbox");}
const closeSheet=()=>{$("mxSheet").hidden=true;};
$("mxSheet").onclick=e=>{if(e.target.id==="mxSheet")closeSheet();};
async function addTrack(src,name){stopPlay();let r;try{r=await getRaw(src);}catch(e){VB.toast("Couldn't load that clip");return;}const d=r.length/r.sampleRate;
  const loop=src.type==="sfx"&&!!SFX.list[src.key].loop;
  const t={id:uid(),src,name,start:sel!=null?sel:0,in:0,out:d,vol:src.type==="sfx"?70:100,mute:false,solo:false,fx:"none",loop,len:loop?Math.max(10,Math.ceil(total())||10):d};
  M.tracks.push(t);closeSheet();changed();VB.toast("Added "+name);return t;}
function sfxSheet(){const s=sheet(`<h3>🎃 Add a spooky sound</h3><p class="hint">⟳ sounds loop as background ambience.</p><div class="grid">${Object.entries(SFX.list).map(([k,x])=>`<button data-k="${k}"><span>${x.e}</span>${x.n}${x.loop?" ⟳":""}</button>`).join("")}</div><div class="rowb"><button id="shX">Close</button></div>`);
  s.querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>addTrack({type:"sfx",key:b.dataset.k},SFX.list[b.dataset.k].e+" "+SFX.list[b.dataset.k].n));$("shX").onclick=closeSheet;}
async function clipSheet(){const list=(await VB.allClips()).sort((a,b)=>b.created-a.created);
  const s=sheet(`<h3>🎙 Add from My clips</h3><div class="list">${list.length?list.map(c=>`<button data-id="${c.id}">${esc(c.name)} <small>(${fmt(c.dur||0)})</small></button>`).join(""):'<p class="hint">No clips yet — record one first.</p>'}</div><div class="rowb"><button id="shX">Close</button></div>`);
  s.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>addTrack({type:"clip",id:b.dataset.id},list.find(c=>c.id===b.dataset.id).name));$("shX").onclick=closeSheet;}
async function trackSheet(t){stopPlay();let r;try{r=await getRaw(t.src);}catch(e){r=null;}const D=r?r.length/r.sampleRate:t.out;
  const s=sheet(`<h3>⚙ ${esc(t.name)}</h3>
  <label>Volume <b id="tvV">${t.vol}%</b></label><input id="tv" type="range" min="0" max="150" value="${t.vol}">
  <label>Effect</label><select id="tfx">${Object.entries(FX).map(([k,f])=>`<option value="${k}" ${k===t.fx?"selected":""}>${f.n}</option>`).join("")}</select>
  <label>Trim start <b id="tiV">${t.in.toFixed(1)}s</b></label><input id="ti" type="range" min="0" max="${D}" step="0.05" value="${t.in}">
  <label>Trim end <b id="toV">${t.out.toFixed(1)}s</b></label><input id="to" type="range" min="0" max="${D}" step="0.05" value="${t.out}">
  <label><input id="tl" type="checkbox" ${t.loop?"checked":""} style="width:22px;height:22px;vertical-align:middle"> Loop it (ambience)</label>
  <label>Loop length <b id="tlV">${t.len.toFixed(0)}s</b></label><input id="tll" type="range" min="1" max="180" step="1" value="${Math.round(t.len)}" ${t.loop?"":"disabled"}>
  <label>Starts at <b id="tsV">${t.start.toFixed(2)}s</b> — drag the block to move</label>
  <div class="rowb"><button id="tDup">⧉ Copy</button><button id="tDel" style="border-color:#ff3b3b;color:#ff8080">🗑 Remove</button><button id="tOk" class="hot">Done</button></div>`);
  const upd=()=>{t.vol=+$("tv").value;t.fx=$("tfx").value;let a=+$("ti").value,b=+$("to").value;if(b-a<.05){if(document.activeElement===$("ti"))a=Math.max(0,b-.05);else b=Math.min(D,a+.05);$("ti").value=a;$("to").value=b;}
    t.in=a;t.out=b;t.loop=$("tl").checked;$("tll").disabled=!t.loop;t.len=t.loop?+$("tll").value:t.out-t.in;
    $("tvV").textContent=t.vol+"%";$("tiV").textContent=a.toFixed(1)+"s";$("toV").textContent=b.toFixed(1)+"s";$("tlV").textContent=(+$("tll").value)+"s";changed();};
  s.querySelectorAll("input,select").forEach(i=>i.addEventListener("input",upd));s.querySelectorAll("input[type=checkbox],select").forEach(i=>i.addEventListener("change",upd));
  $("tOk").onclick=closeSheet;$("tDel").onclick=()=>{M.tracks=M.tracks.filter(x=>x!==t);closeSheet();changed();};
  $("tDup").onclick=()=>{const c={...t,id:uid(),start:t.start+tDur(t),mute:false,solo:false};M.tracks.splice(M.tracks.indexOf(t)+1,0,c);closeSheet();changed();};}
// ---------- playback ----------
function stopPlay(){if(play){try{play.s.stop();}catch(e){}cancelAnimationFrame(play.raf);play=null;}$("mxPlay").textContent="▶ Play";$("mxPh").style.display="none";}
async function doPlay(){if(play){stopPlay();return;}if(!M.tracks.length){VB.toast("Add a sound first");return;}
  $("mxPlay").textContent="⏳ Mixing…";const buf=await renderMix();const c=VB.getCtx();await c.resume();
  const s=c.createBufferSource();s.buffer=buf;s.connect(c.destination);const from=Math.min(sel||0,buf.duration-.01);s.start(0,from);const t0=c.currentTime-from;
  play={s,raf:0};$("mxPlay").textContent="■ Stop";const ph=$("mxPh");ph.style.display="block";
  const tick=()=>{if(!play)return;const p=c.currentTime-t0;ph.style.left=p*pps+"px";$("mxTime").textContent=fmt(p);play.raf=requestAnimationFrame(tick);};tick();
  s.onended=()=>{if(play&&play.s===s)stopPlay();};}
$("mxRuler").onclick=e=>{const r=$("mxTl").getBoundingClientRect();sel=Math.max(0,(e.clientX-r.left)/pps);$("mxTime").textContent=fmt(sel);const ph=$("mxPh");ph.style.left=sel*pps+"px";ph.style.display="block";};
// ---------- projects ----------
async function store(mode,fn){const d=await VB.db();return new Promise((res,rej)=>{const t=d.transaction("mixes",mode),s=t.objectStore("mixes"),r=fn(s);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error);});}
const strip=t=>{const{missing,...x}=t;return x;};
async function saveProj(){M.name=$("mxName").value.trim()||"Spooky mix";M.updated=Date.now();await store("readwrite",s=>s.put({...M,tracks:M.tracks.map(strip)}));VB.toast("Mix saved ✓");}
function fresh(){M={id:"m"+Date.now(),name:"Spooky mix "+new Date().toLocaleDateString([],{month:"short",day:"numeric"}),created:Date.now(),tracks:[]};mixCache=null;sel=null;}
async function projSheet(){const list=((await store("readonly",s=>s.getAll()))||[]).sort((a,b)=>b.updated-a.updated);
  const s=sheet(`<h3>📂 Saved mixes</h3><div class="list">${list.map(m=>`<div style="display:flex;gap:6px"><button data-id="${m.id}" style="flex:1">${esc(m.name)} <small>(${m.tracks.length} tracks)</small></button><button data-del="${m.id}" aria-label="Delete" style="border-color:#ff3b3b">🗑</button></div>`).join("")||'<p class="hint">No saved mixes yet.</p>'}</div><div class="rowb"><button id="shNew" class="hot">＋ New mix</button><button id="shX">Close</button></div>`);
  s.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{stopPlay();M=structuredClone(list.find(m=>m.id===b.dataset.id));mixCache=null;$("mxName").value=M.name;closeSheet();draw();});
  s.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this mix? (Clips are kept.)"))return;await store("readwrite",x=>x.delete(b.dataset.del));projSheet();});
  $("shNew").onclick=()=>{stopPlay();fresh();$("mxName").value=M.name;closeSheet();draw();};$("shX").onclick=closeSheet;}
async function toClip(){if(!M.tracks.length){VB.toast("Add a sound first");return;}stopPlay();VB.toast("Rendering mix…");const buf=await renderMix(),w=VB.toWav(buf),id="c"+Date.now();
  M.name=$("mxName").value.trim()||M.name;await VB.putClip({id,name:"🎛 "+M.name,created:Date.now(),dur:buf.duration,settings:{preset:"clean",pitch:0,dist:0,wet:100},dry:w,audio:w,orig:w});
  raw={...raw};await VB.renderList(id);VB.toast("Saved to My clips ✓");window.__mxLastClip=id;}
async function exp(kind){if(!M.tracks.length){VB.toast("Add a sound first");return;}stopPlay();const buf=await renderMix();await VB.exportBuf(buf,$("mxName").value||"spooky-mix",kind);}
$("mxPlay").onclick=doPlay;$("mxZi").onclick=()=>{pps=Math.min(160,pps*1.5);draw();};$("mxZo").onclick=()=>{pps=Math.max(6,pps/1.5);draw();};
$("mxAddSfx").onclick=sfxSheet;$("mxAddClip").onclick=clipSheet;$("mxSave").onclick=saveProj;$("mxProj").onclick=projSheet;$("mxRender").onclick=toClip;$("mxMp3").onclick=()=>exp("mp3");$("mxWav").onclick=()=>exp("wav");
$("mxClose").onclick=()=>{stopPlay();closeSheet();root.hidden=true;document.body.style.overflow="";};
function open(){VB.stopMain();VB.stopSfx();if(!M){fresh();}$("mxName").value=M.name;root.hidden=false;document.body.style.overflow="hidden";draw();}
$("openMix").onclick=open;
window.__mx={get M(){return M;},addTrack,renderMix,open,saveProj,toClip,draw,store};
})();
