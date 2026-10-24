(() => {
"use strict";
const WORKLET = `
class VoiceFX extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [
    {name:'pitch',defaultValue:1,minValue:0.25,maxValue:4},
    {name:'ringFreq',defaultValue:0,minValue:0,maxValue:2000},
    {name:'ringMix',defaultValue:0,minValue:0,maxValue:1},
    {name:'vibRate',defaultValue:0,minValue:0,maxValue:20},
    {name:'vibDepth',defaultValue:0,minValue:0,maxValue:1},
    {name:'bits',defaultValue:16,minValue:1,maxValue:16},
    {name:'down',defaultValue:1,minValue:1,maxValue:40}];}
  constructor(){super();this.N=2048;this.buf=new Float32Array(this.N);this.w=0;this.ph=0;
    this.win=Math.floor(sampleRate*0.04);this.rp=0;this.vp=0;this.hold=0;this.hc=0;}
  process(ins,outs,p){const i=ins[0]&&ins[0][0],o=outs[0][0];if(!o)return true;
    const N=this.N,W=this.win,b=this.buf,sr=sampleRate;
    for(let n=0;n<o.length;n++){const x=i?i[n]:0;b[this.w]=x;
      let pitch=p.pitch.length>1?p.pitch[n]:p.pitch[0];
      const vd=p.vibDepth[0];if(vd>0){this.vp+=p.vibRate[0]/sr;if(this.vp>1)this.vp-=1;pitch*=Math.pow(2,vd*Math.sin(2*Math.PI*this.vp)/12*2);}
      let y;
      if(Math.abs(pitch-1)<1e-3&&vd===0){y=x;}else{
        // two read heads sweeping a delay window, crossfaded (low-latency granular shifter)
        this.rp+= (1-pitch); if(this.rp<0)this.rp+=W; if(this.rp>=W)this.rp-=W;
        const d1=this.rp, d2=(this.rp+W/2)%W;
        const g1=Math.sin(Math.PI*d1/W), g2=Math.sin(Math.PI*d2/W);
        y=this.tap(d1)*g1*g1+this.tap(d2)*g2*g2;}
      const rm=p.ringMix[0];if(rm>0){this.ph+=p.ringFreq[0]/sr;if(this.ph>1)this.ph-=1;y=y*(1-rm)+y*Math.sin(2*Math.PI*this.ph)*rm*1.6;}
      const bits=p.bits[0],dn=p.down[0];
      if(bits<16||dn>1){if(this.hc<=0){const q=Math.pow(2,bits-1);this.hold=Math.round(y*q)/q;this.hc=dn;}this.hc--;y=this.hold;}
      o[n]=y;this.w=(this.w+1)%N;}
    for(let c=1;c<outs[0].length;c++)outs[0][c].set(o);
    return true;}
  tap(d){const N=this.N;let r=this.w-d-1;while(r<0)r+=N;const i0=Math.floor(r),f=r-i0;const a=this.buf[i0%N],b=this.buf[(i0+1)%N];return a+(b-a)*f;}
}
registerProcessor('voice-fx',VoiceFX);
class Gate extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'thresh',defaultValue:-42,minValue:-80,maxValue:0}];}
  constructor(){super();this.env=0;this.g=0;this.hold=0;this.sr=sampleRate;
    this.att=1-Math.exp(-1/(0.005*sampleRate));this.rel=1-Math.exp(-1/(0.12*sampleRate));
    this.envA=1-Math.exp(-1/(0.002*sampleRate));this.envR=1-Math.exp(-1/(0.05*sampleRate));this.holdN=Math.floor(0.15*sampleRate);}
  process(ins,outs,p){const i=ins[0]&&ins[0][0],o=outs[0][0];if(!o)return true;
    const th=Math.pow(10,p.thresh[0]/20),thClose=th*0.7;
    for(let n=0;n<o.length;n++){const x=i?i[n]:0,a=Math.abs(x);
      this.env+=(a-this.env)*(a>this.env?this.envA:this.envR);
      if(this.env>th)this.hold=this.holdN;else if(this.env<thClose&&this.hold>0)this.hold--;
      const tgt=this.hold>0?1:0;this.g+=(tgt-this.g)*(tgt>this.g?this.att:this.rel);
      o[n]=x*this.g;}
    for(let c=1;c<outs[0].length;c++)outs[0][c].set(o);return true;}
}
registerProcessor('gate',Gate);`;
const PRESETS = {
  clean:  {e:"🙂",n:"Clean",  pitch:0,dist:0,wet:100},
  robot:  {e:"🤖",n:"Robot",  pitch:0,dist:10,wet:100,ringFreq:55,ringMix:1},
  monster:{e:"👹",n:"Monster",pitch:-7,dist:8,wet:100,lp:2500},
  chip:   {e:"🐿️",n:"Chipmunk",pitch:8,dist:0,wet:100},
  alien:  {e:"👽",n:"Alien",  pitch:3,dist:5,wet:100,ringFreq:420,ringMix:.6,vibRate:7,vibDepth:.5},
  radio:  {e:"📻",n:"Radio",  pitch:0,dist:45,wet:100,bp:1800,bpQ:1.4},
  demon:  {e:"😈",n:"Demon",  pitch:-10,dist:65,wet:100,lp:3000},
  cave:   {e:"🦇",n:"Echo cave",pitch:-2,dist:0,wet:100,delay:.28,fb:.5,rev:1},
  layer0: {e:"🧠",n:"Layer Zero AI",pitch:-3,dist:20,wet:100,ringFreq:90,ringMix:.7,bits:5,down:4,delay:.09,fb:.25},
};
const $=id=>document.getElementById(id);
const fmt=s=>{s=Math.max(0,s);const m=Math.floor(s/60);return m+":"+(s%60).toFixed(1).padStart(4,"0");};
const workletURL=URL.createObjectURL(new Blob([WORKLET],{type:"application/javascript"}));

// ---------- effect chain (shared by live + offline render) ----------
function curve(amt){const k=amt*1.5,n=1025,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i*2/(n-1)-1;c[i]=k?((1+k)*x/(1+k*Math.abs(x))):x;}return c;}
function impulse(c,sec){const len=Math.floor(c.sampleRate*sec),b=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}return b;}
function makeChain(c){
  const ch={c};
  ch.input=c.createGain();
  ch.fx=new AudioWorkletNode(c,"voice-fx",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
  ch.shaper=c.createWaveShaper();ch.shaper.oversample="2x";ch.filt=c.createBiquadFilter();
  ch.delay=c.createDelay(1);ch.fb=c.createGain();ch.delayWet=c.createGain();
  ch.conv=c.createConvolver();ch.conv.buffer=impulse(c,1.8);ch.convWet=c.createGain();
  ch.dry=c.createGain();ch.wet=c.createGain();ch.out=c.createGain();
  ch.comp=c.createDynamicsCompressor();Object.assign(ch.comp,{});ch.comp.threshold.value=-20;ch.comp.knee.value=6;ch.comp.ratio.value=8;ch.comp.attack.value=.003;ch.comp.release.value=.15;
  ch.input.connect(ch.fx);ch.input.connect(ch.dry);
  ch.fx.connect(ch.shaper);ch.shaper.connect(ch.filt);ch.filt.connect(ch.wet);
  ch.filt.connect(ch.delay);ch.delay.connect(ch.fb);ch.fb.connect(ch.delay);ch.delay.connect(ch.delayWet);ch.delayWet.connect(ch.wet);
  ch.filt.connect(ch.conv);ch.conv.connect(ch.convWet);ch.convWet.connect(ch.wet);
  ch.wet.connect(ch.out);ch.dry.connect(ch.out);ch.out.connect(ch.comp);ch.output=ch.comp;
  return ch;
}
function applyChain(ch,st){
  const p=PRESETS[st.preset]||PRESETS.clean,P=ch.fx.parameters,t=ch.c.currentTime;
  P.get("pitch").setValueAtTime(Math.pow(2,st.pitch/12),t);
  P.get("ringFreq").setValueAtTime(p.ringFreq||0,t);P.get("ringMix").setValueAtTime(p.ringMix||0,t);
  P.get("vibRate").setValueAtTime(p.vibRate||0,t);P.get("vibDepth").setValueAtTime(p.vibDepth||0,t);
  P.get("bits").setValueAtTime(p.bits||16,t);P.get("down").setValueAtTime(p.down||1,t);
  ch.shaper.curve=curve(st.dist);
  if(p.bp){ch.filt.type="bandpass";ch.filt.frequency.value=p.bp;ch.filt.Q.value=p.bpQ;}
  else if(p.lp){ch.filt.type="lowpass";ch.filt.frequency.value=p.lp;ch.filt.Q.value=.7;}
  else{ch.filt.type="allpass";ch.filt.frequency.value=1000;}
  ch.delay.delayTime.value=p.delay||.2;ch.fb.gain.value=p.fb||0;ch.delayWet.gain.value=p.delay?.6:0;
  ch.convWet.gain.value=p.rev?.7:0;
  const w=st.wet/100;ch.wet.gain.setValueAtTime(w,t);ch.dry.gain.setValueAtTime(1-w,t);
  ch.out.gain.value=p.bp?.8:1;
}
async function renderFx(buf,st){
  const oc=new OfflineAudioContext(1,buf.length,buf.sampleRate);
  await oc.audioWorklet.addModule(workletURL);
  const ch=makeChain(oc);applyChain(ch,st);ch.output.connect(oc.destination);
  const s=oc.createBufferSource();s.buffer=buf;s.connect(ch.input);s.start();
  return oc.startRendering();
}

// ---------- buffers / wav / mp3 ----------
let ctx;
function getCtx(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:"interactive"});return ctx;}
const newBuf=(len,sr)=>new AudioBuffer({numberOfChannels:1,length:Math.max(1,len),sampleRate:sr});
function mono(b){if(b.numberOfChannels===1)return b;const o=newBuf(b.length,b.sampleRate),d=o.getChannelData(0);for(let c=0;c<b.numberOfChannels;c++){const s=b.getChannelData(c);for(let i=0;i<d.length;i++)d[i]+=s[i]/b.numberOfChannels;}return o;}
function cloneBuf(b){const o=newBuf(b.length,b.sampleRate);o.copyToChannel(b.getChannelData(0).slice(),0);return o;}
function toWav(b){const d=b.getChannelData(0),n=d.length,ab=new ArrayBuffer(44+n*2),v=new DataView(ab);
  const W=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  W(0,"RIFF");v.setUint32(4,36+n*2,true);W(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,b.sampleRate,true);v.setUint32(28,b.sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);W(36,"data");v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){const x=Math.max(-1,Math.min(1,d[i]));v.setInt16(44+i*2,x<0?x*0x8000:x*0x7fff,true);}
  return new Blob([ab],{type:"audio/wav"});}
async function decode(blob){return mono(await getCtx().decodeAudioData(await blob.arrayBuffer()));}
let lameP;
function loadLame(){return lameP||(lameP=new Promise((res,rej)=>{const s=document.createElement("script");s.src="/voicebox/vendor/lame.min.js";s.onload=()=>res(window.lamejs);s.onerror=rej;document.head.append(s);}));}
async function toMp3(b){
  const lame=await loadLame();let sr=b.sampleRate;
  if(![32000,44100,48000].includes(sr)){const oc=new OfflineAudioContext(1,Math.ceil(b.duration*44100),44100);const s=oc.createBufferSource();s.buffer=b;s.connect(oc.destination);s.start();b=await oc.startRendering();sr=44100;}
  const enc=new lame.Mp3Encoder(1,sr,128),d=b.getChannelData(0),out=[],I=new Int16Array(1152);
  for(let i=0;i<d.length;i+=1152){const n=Math.min(1152,d.length-i),blk=n===1152?I:new Int16Array(n);
    for(let j=0;j<n;j++){const x=Math.max(-1,Math.min(1,d[i+j]));blk[j]=x<0?x*0x8000:x*0x7fff;}
    const m=enc.encodeBuffer(blk);if(m.length)out.push(new Uint8Array(m));}
  const f=enc.flush();if(f.length)out.push(new Uint8Array(f));
  return new Blob(out,{type:"audio/mpeg"});}

// ---------- IndexedDB clip store ----------
let dbP;
function db(){return dbP||(dbP=new Promise((res,rej)=>{const r=indexedDB.open("voicebox",1);r.onupgradeneeded=()=>r.result.createObjectStore("clips",{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));}
async function tx(mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction("clips",mode),s=t.objectStore("clips");const r=fn(s);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error);});}
const putClip=c=>tx("readwrite",s=>s.put(c));
const getClip=id=>tx("readonly",s=>s.get(id));
const delClip=id=>tx("readwrite",s=>s.delete(id));
const allClips=()=>tx("readonly",s=>s.getAll());
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});

// ---------- live engine ----------
let gate,hp,inGain,preAn,chain,analyser,master,dryDest,wetDest,src,stream,recs=null,on=false,rafId,hs,howlT=0,duckUntil=0,lastPk=-200;
let cur=localStorage.getItem("vb_preset")||"robot",mode="rec";
const st=()=>({preset:cur,pitch:+$("sPitch").value,dist:+$("sDist").value,wet:+$("sWet").value});
const sensDb=()=>-70+(100-+$("sSens").value)*0.5;
const vol=()=>0.6*(+$("sVol").value/100);
async function build(){
  const c=getCtx();await c.audioWorklet.addModule(workletURL);
  gate=new AudioWorkletNode(c,"gate",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
  hp=c.createBiquadFilter();hp.type="highpass";hp.frequency.value=100;
  inGain=c.createGain();inGain.gain.value=.8;preAn=c.createAnalyser();preAn.fftSize=512;
  chain=makeChain(c);analyser=c.createAnalyser();analyser.fftSize=2048;
  master=c.createGain();master.gain.value=0;routeOut();
  dryDest=c.createMediaStreamDestination();wetDest=c.createMediaStreamDestination();
  hp.connect(inGain);inGain.connect(preAn);inGain.connect(gate);gate.connect(chain.input);gate.connect(dryDest);
  chain.output.connect(analyser);chain.output.connect(wetDest);chain.output.connect(master);
}
function apply(){if(!chain)return;applyChain(chain,st());gate.parameters.get("thresh").value=sensDb();hp.frequency.value=$("nf").checked?100:20;
  if(on&&mode==="live"&&ctx.currentTime>duckUntil)master.gain.setTargetAtTime(vol(),ctx.currentTime,.05);}
async function start(){
  if(on)return;on=true;setMic();
  try{
    if(!chain)await build();await ctx.resume();apply();
    const nf=$("nf").checked;
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:mode==="live"?!$("lowlat").checked:false,noiseSuppression:nf,autoGainControl:false,latency:0,channelCount:1}});
    if(!on){stream.getTracks().forEach(t=>t.stop());return;}
    src=ctx.createMediaStreamSource(stream);src.connect(hp);
    if(sinkId&&ctxSink()&&ctx.sinkId!==sinkId)ctx.setSinkId(sinkId).catch(()=>{});refreshOutputs();
    master.gain.cancelScheduledValues(0);master.gain.value=0;
    if(mode==="live"){master.gain.setTargetAtTime(vol(),ctx.currentTime,.05);howlT=0;}
    else startRec();
    const lat=((ctx.baseLatency||0)+(ctx.outputLatency||0))*1000;
    status(mode==="live"?`Live · ~${lat?Math.round(lat)+" ms":"low"} delay`:"● Recording… tap to stop");
    loop();
  }catch(e){on=false;setMic();status("Mic blocked: "+(e.message||e.name)+". Allow the microphone and try again.",1);}
}
function stop(){
  if(!on)return;on=false;if(master)master.gain.value=0;
  if(recs)stopRec();
  if(src){try{src.disconnect();}catch(e){}src=null;}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  cancelAnimationFrame(rafId);$("lvl").style.width="0";setMic();
  if(mode==="live")status("Stopped");
}
function mimeType(){return["audio/webm;codecs=opus","audio/webm","audio/ogg","audio/mp4"].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||"";}
function startRec(){const mt=mimeType(),o=mt?{mimeType:mt}:{};
  recs={t0:Date.now(),settings:st(),dry:new MediaRecorder(dryDest.stream,o),wet:new MediaRecorder(wetDest.stream,o),dc:[],wc:[]};
  recs.dry.ondataavailable=e=>e.data.size&&recs&&recs.dc.push(e.data);recs.wet.ondataavailable=e=>e.data.size&&recs&&recs.wc.push(e.data);
  recs.dry.start(250);recs.wet.start(250);setMic();}
function stopRec(){const r=recs;recs=null;setMic();let n=0;const done=()=>{if(++n===2)saveRecording(r);};
  r.dry.onstop=done;r.wet.onstop=done;r.dry.stop();r.wet.stop();}
async function saveRecording(r){
  try{status("Saving clip…");
    const dry=await decode(new Blob(r.dc,{type:r.dc[0]&&r.dc[0].type})),wet=await decode(new Blob(r.wc,{type:r.wc[0]&&r.wc[0].type}));
    const len=Math.min(dry.length,wet.length);const D=newBuf(len,dry.sampleRate),Wb=newBuf(len,wet.sampleRate);
    D.copyToChannel(dry.getChannelData(0).subarray(0,len),0);Wb.copyToChannel(wet.getChannelData(0).subarray(0,len),0);
    const d=new Date(r.t0),id="c"+r.t0;
    const clip={id,name:`${PRESETS[r.settings.preset].e} ${PRESETS[r.settings.preset].n} ${d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`,created:r.t0,dur:len/D.sampleRate,settings:r.settings,dry:toWav(D),audio:toWav(Wb),orig:toWav(Wb)};
    await putClip(clip);await renderList(id);status("Saved to My clips ✓");
    if(mode==="rec")playClip(id);
  }catch(e){status("Couldn't save clip: "+e.message,1);}
}
function howlCheck(inDb){
  if(!$("guard").checked)return;
  if(!hs)hs=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(hs);
  let pk=-200,sum=0;for(let i=4;i<hs.length;i++){if(hs[i]>pk)pk=hs[i];sum+=hs[i];}
  const avg=sum/(hs.length-4),runaway=pk-avg>45&&pk>-30&&inDb>-12&&pk>=lastPk-1.5;lastPk=pk;
  if(runaway)howlT+=16;else howlT=Math.max(0,howlT-48);
  if(howlT>=1000&&ctx.currentTime>duckUntil){howlT=0;duckUntil=ctx.currentTime+1.5;window.__vbDucks=(window.__vbDucks||0)+1;
    master.gain.cancelScheduledValues(0);master.gain.setTargetAtTime(vol()*0.15,ctx.currentTime,.01);master.gain.setTargetAtTime(vol(),duckUntil,.3);
    status("Squeal! Turned down for a sec — lower Volume or move phone from your mouth",1);
    setTimeout(()=>{if(on&&mode==="live")status("Live");},2500);}
}
function loop(){
  const cv=$("viz"),g=cv.getContext("2d"),d=new Float32Array(analyser.fftSize),q=new Float32Array(preAn.fftSize);
  const draw=()=>{analyser.getFloatTimeDomainData(d);preAn.getFloatTimeDomainData(q);let pk=0;for(const v of q)pk=Math.max(pk,Math.abs(v));
    const db=20*Math.log10(pk+1e-9);$("lvl").style.width=Math.max(0,Math.min(100,(db+80)/0.8))+"%";$("lvl").classList.toggle("open",db>sensDb());
    if(mode==="live"&&on)howlCheck(db);
    g.fillStyle="#050505";g.fillRect(0,0,cv.width,cv.height);g.strokeStyle=recs?"#ff3b3b":"#f0c43a";g.lineWidth=3;g.beginPath();
    for(let i=0;i<d.length;i+=2){const x=i/d.length*cv.width,y=cv.height/2+d[i]*cv.height*1.2;i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
    if(recs&&$("recTime"))$("recTime").textContent=fmt((Date.now()-recs.t0)/1000);
    if(on)rafId=requestAnimationFrame(draw);};draw();
}
function status(t,bad){$("status").textContent=t;$("status").classList.toggle("bad",!!bad);}
function setMic(){const m=$("mic");m.classList.toggle("live",on);m.classList.toggle("rec",!!recs);
  m.innerHTML=mode==="rec"?(recs?'<span>■</span>STOP<small id="recTime">0:00.0</small>':'<span>●</span>RECORD'):(on?'<span>■</span>STOP LIVE':'<span>🎙</span>GO LIVE');
  $("liveRec").hidden=!(mode==="live"&&on);$("liveRec").textContent=recs?"■ Stop recording":"● Record this";$("liveRec").classList.toggle("rec",!!recs);}

// ---------- output device ----------
let outEl=null,outDest=null,sinkId=localStorage.getItem("vb_sink")||"";
const ctxSink=()=>!!(window.AudioContext&&AudioContext.prototype.setSinkId);
const elSink=()=>!!(window.HTMLMediaElement&&HTMLMediaElement.prototype.setSinkId);
function routeOut(){ // AudioContext.setSinkId keeps the low-latency path; <audio> fallback only if a non-default device is chosen
  if(!master)return;try{master.disconnect();}catch(e){}
  if(sinkId&&!ctxSink()&&elSink()){
    if(!outEl){outDest=ctx.createMediaStreamDestination();outEl=new Audio();outEl.autoplay=true;outEl.srcObject=outDest.stream;}
    master.connect(outDest);outEl.setSinkId(sinkId).catch(()=>{});outEl.play().catch(()=>{});
  }else{master.connect(ctx.destination);if(outEl)outEl.pause();}
}
async function setSink(id){sinkId=id;localStorage.setItem("vb_sink",id);
  try{if(ctx&&ctxSink())await ctx.setSinkId(id);}catch(e){status("Couldn't switch output: "+e.message,1);}
  routeOut();refreshOutputs();}
async function refreshOutputs(){
  const lbl=$("outLbl"),sel=$("outSel");let outs=[];
  try{outs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audiooutput");}catch(e){}
  if(sinkId&&outs.length&&!outs.some(d=>d.deviceId===sinkId)){sinkId="";localStorage.removeItem("vb_sink");if(ctx&&ctxSink())ctx.setSinkId("").catch(()=>{});routeOut();}
  const canPick=(ctxSink()||elSink())&&outs.length>1;
  if(!canPick){sel.hidden=true;
    const named=outs.find(d=>d.deviceId==="default"&&d.label)||outs.find(d=>d.label);
    lbl.textContent=named&&outs.length===1&&!/^default$/i.test(named.label)?`Plays on: ${named.label.replace(/^Default - /,"")}`:"Plays on: phone's current output (connect/disconnect earbuds to switch)";
    if(navigator.mediaDevices.selectAudioOutput&&(ctxSink()||elSink())){sel.hidden=false;sel.innerHTML='<option value="">Phone default</option><option value="__pick">Choose a device…</option>';if(sinkId){const o=document.createElement("option");o.value="__x";o.textContent="Chosen device";sel.prepend(o);}sel.value=sinkId?"__x":"";}
    return;}
  sel.hidden=false;sel.innerHTML="";
  for(const d of outs){const o=document.createElement("option");o.value=d.deviceId==="default"?"":d.deviceId;o.textContent=d.label||(d.deviceId==="default"?"Default":"Output "+(sel.length+1));if(d.deviceId!=="default"||!sel.querySelector('option[value=""]'))sel.append(o);}
  if(navigator.mediaDevices.selectAudioOutput){const o=document.createElement("option");o.value="__pick";o.textContent="Other device…";sel.append(o);}
  sel.value=sinkId;const cur=outs.find(d=>(sinkId?d.deviceId===sinkId:d.deviceId==="default"))||outs[0];
  lbl.textContent="Plays on: "+((cur&&cur.label)||"default output").replace(/^Default - /,"");
}
$("outSel").addEventListener("change",async e=>{const v=e.target.value;
  if(v==="__pick"){try{const d=await navigator.mediaDevices.selectAudioOutput();await setSink(d.deviceId);}catch(err){refreshOutputs();}return;}
  if(v!=="__x")setSink(v);});
if(navigator.mediaDevices&&navigator.mediaDevices.addEventListener)navigator.mediaDevices.addEventListener("devicechange",refreshOutputs);
// ---------- main UI ----------
for(const[k,p]of Object.entries(PRESETS)){const b=document.createElement("button");b.dataset.k=k;b.innerHTML=`<span>${p.e}</span>${p.n}`;b.onclick=()=>setPreset(k);$("presets").append(b);}
function setPreset(k){cur=k;localStorage.setItem("vb_preset",k);const p=PRESETS[k];$("sPitch").value=p.pitch;$("sDist").value=p.dist;$("sWet").value=p.wet;
  document.querySelectorAll("#presets button").forEach(b=>b.classList.toggle("on",b.dataset.k===k));sync();}
function sync(){for(const id of["sPitch","sDist","sWet","sSens","sVol"]){const v=$(id).value;$("v"+id.slice(1)).textContent=id==="sPitch"&&v>0?"+"+v:v;}
  localStorage.setItem("vb_sens",$("sSens").value);localStorage.setItem("vb_vol",$("sVol").value);apply();}
["sPitch","sDist","sWet","sSens","sVol"].forEach(id=>$(id).addEventListener("input",sync));
for(const[id,def]of[["nf",1],["lowlat",0],["guard",1],["ptt",0]]){const v=localStorage.getItem("vb_"+id);$(id).checked=v===null?!!def:v==="1";
  $(id).addEventListener("change",()=>{localStorage.setItem("vb_"+id,$(id).checked?"1":"0");if(on&&(id==="nf"||id==="lowlat")){const r=!!recs;stop();if(!r)start();}else apply();});}
$("sSens").value=localStorage.getItem("vb_sens")||"44";$("sVol").value=localStorage.getItem("vb_vol")||"80";
function setMode(m){if(on)stop();mode=m;$("mLive").classList.toggle("on",m==="live");$("mRec").classList.toggle("on",m==="rec");
  document.body.classList.toggle("is-live",m==="live");setMic();
  status(m==="live"?"Live plays through your phone speaker or earbuds. Earbuds = no squeal.":"Tap Record, talk, tap Stop. Clips save below.");}
$("mLive").onclick=()=>setMode("live");$("mRec").onclick=()=>setMode("rec");
$("liveRec").onclick=()=>{if(!on)return;recs?stopRec():startRec();};
let downAt=0,wasOn=false;const mic=$("mic");
mic.addEventListener("pointerdown",e=>{e.preventDefault();downAt=Date.now();wasOn=on;if(!on)start();});
mic.addEventListener("pointerup",()=>{const held=Date.now()-downAt>400;if(wasOn)stop();else if(held||(mode==="live"&&$("ptt").checked))stop();});
mic.addEventListener("contextmenu",e=>e.preventDefault());

// ---------- clips list ----------
let player;
async function playClip(id){const c=await getClip(id);if(!c)return;if(!player)player=new Audio();player.src=URL.createObjectURL(c.audio);player.play().catch(()=>{});}
async function renderList(hi){
  const list=(await allClips()).sort((a,b)=>b.created-a.created),ul=$("clips");ul.innerHTML="";
  $("noClips").hidden=list.length>0;
  for(const c of list){const li=document.createElement("li");if(c.id===hi)li.className="hi";
    li.innerHTML=`<button class="play" aria-label="Play">▶</button><div class="meta"><b></b><small>${new Date(c.created).toLocaleDateString([],{month:"short",day:"numeric"})} · ${fmt(c.dur)}</small></div><button class="edit">Edit</button><button class="more" aria-label="More">⋯</button>`;
    li.querySelector("b").textContent=c.name;
    li.querySelector(".play").onclick=()=>playClip(c.id);
    li.querySelector(".edit").onclick=()=>openEditor(c.id);
    li.querySelector(".more").onclick=async()=>{const a=prompt("Rename clip (or type DELETE to delete it):",c.name);if(a===null)return;
      if(a.trim()==="DELETE"){if(confirm(`Delete "${c.name}" for good?`)){await delClip(c.id);renderList();}}
      else if(a.trim()){c.name=a.trim().slice(0,60);await putClip(c);renderList(c.id);}};
    ul.append(li);}
  if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();$("quota").textContent=`${list.length} clip${list.length===1?"":"s"} · ${(e.usage/1048576).toFixed(1)} MB on this phone`;}
}

// ---------- editor ----------
const E={};let edSrc,edRaf;
async function openEditor(id){
  const c=await getClip(id);if(!c)return;
  E.clip=c;E.work=await decode(c.audio);E.dry=await decode(c.dry);
  if(E.dry.length!==E.work.length){const D=newBuf(E.work.length,E.work.sampleRate);D.copyToChannel(E.dry.getChannelData(0).subarray(0,E.work.length),0);E.dry=D;}
  E.undo=[];E.sel=null;E.ph=0;E.dirty=false;
  $("edName").textContent=c.name;$("ed").hidden=false;document.body.classList.add("noscroll");
  const sel=$("edPreset");sel.innerHTML="";for(const[k,p]of Object.entries(PRESETS)){const o=document.createElement("option");o.value=k;o.textContent=p.e+" "+p.n;sel.append(o);}sel.value=c.settings.preset||"robot";
  edDraw();edInfo();
}
function closeEditor(){if(E.dirty&&!confirm("Discard unsaved edits?"))return;edStop();$("ed").hidden=true;document.body.classList.remove("noscroll");}
const sr=()=>E.work.sampleRate,dur=()=>E.work.duration;
function range(){const s=E.sel;return s?[Math.floor(s[0]*sr()),Math.floor(s[1]*sr())]:[0,E.work.length];}
function push(){E.undo.push([cloneBuf(E.work),cloneBuf(E.dry)]);if(E.undo.length>25)E.undo.shift();E.dirty=true;}
function edDraw(){
  const cv=$("wave"),w=cv.width=cv.clientWidth*devicePixelRatio,h=cv.height=cv.clientHeight*devicePixelRatio,g=cv.getContext("2d"),d=E.work.getChannelData(0),step=d.length/w;
  g.fillStyle="#050505";g.fillRect(0,0,w,h);
  if(E.sel){const a=E.sel[0]/dur()*w,b=E.sel[1]/dur()*w;g.fillStyle="#f0c43a33";g.fillRect(a,0,b-a,h);
    g.fillStyle="#f0c43a";for(const x of[a,b]){g.fillRect(x-2,0,4,h);g.beginPath();g.arc(x,h-14*devicePixelRatio,11*devicePixelRatio,0,7);g.fill();}}
  g.fillStyle="#2a6ad6";
  for(let x=0;x<w;x++){let mn=1,mx=-1;const s=Math.floor(x*step),e=Math.min(d.length,Math.floor((x+1)*step)+1);for(let i=s;i<e;i++){const v=d[i];if(v<mn)mn=v;if(v>mx)mx=v;}
    if(E.sel&&x>=E.sel[0]/dur()*w&&x<=E.sel[1]/dur()*w)g.fillStyle="#f0c43a";else g.fillStyle="#4a8af6";
    g.fillRect(x,(1-mx)*h/2,1,Math.max(1,(mx-mn)*h/2));}
  const px=E.ph/dur()*w;g.fillStyle="#fff";g.fillRect(px-1,0,2,h);
}
function edInfo(){$("edInfo").textContent=E.sel?`Selected ${fmt(E.sel[0])} – ${fmt(E.sel[1])} (${fmt(E.sel[1]-E.sel[0])}) of ${fmt(dur())}`:`Whole clip · ${fmt(dur())} · drag on the wave to select`;
  $("edUndo").disabled=!E.undo.length;$("edSelOnly").textContent=E.sel?"selection":"whole clip";}
(function waveTouch(){const cv=$("wave");let drag=null;
  const tAt=e=>{const r=cv.getBoundingClientRect();return Math.max(0,Math.min(dur(),(e.clientX-r.left)/r.width*dur()));};
  cv.addEventListener("pointerdown",e=>{e.preventDefault();cv.setPointerCapture(e.pointerId);const t=tAt(e),tol=26/cv.clientWidth*dur();
    if(E.sel&&Math.abs(t-E.sel[0])<tol)drag=0;else if(E.sel&&Math.abs(t-E.sel[1])<tol)drag=1;else{E.sel=[t,t];drag=1;E.anchor=t;E.fresh=true;}edDraw();});
  cv.addEventListener("pointermove",e=>{if(drag===null)return;const t=tAt(e);
    if(E.fresh){E.sel=[Math.min(E.anchor,t),Math.max(E.anchor,t)];}else{E.sel[drag]=t;if(E.sel[0]>E.sel[1]){E.sel.reverse();drag=1-drag;}}edDraw();edInfo();});
  const up=()=>{if(drag===null)return;drag=null;E.fresh=false;if(E.sel&&E.sel[1]-E.sel[0]<0.05){E.ph=E.sel[0];E.sel=null;}edDraw();edInfo();};
  cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);})();
function splice(b,a,z,keepOnly){const d=b.getChannelData(0),out=keepOnly?d.slice(a,z):new Float32Array(d.length-(z-a));
  if(!keepOnly){out.set(d.subarray(0,a),0);out.set(d.subarray(z),a);}const o=newBuf(out.length,b.sampleRate);o.copyToChannel(out,0);return o;}
function edOp(fn){edStop();push();fn();edDraw();edInfo();}
const OPS={
  trim(){if(!E.sel)return toast("Select a part first");const[a,z]=range();edOp(()=>{E.work=splice(E.work,a,z,1);E.dry=splice(E.dry,a,z,1);E.sel=null;E.ph=0;});},
  cut(){if(!E.sel)return toast("Select a part to cut");const[a,z]=range();if(z-a>=E.work.length-10)return toast("That's the whole clip");
    edOp(()=>{E.work=splice(E.work,a,z);E.dry=splice(E.dry,a,z);E.ph=E.sel[0];E.sel=null;});},
  fadein(){const[a,z]=range();edOp(()=>{const d=E.work.getChannelData(0),n=z-a;for(let i=0;i<n;i++)d[a+i]*=i/n;});},
  fadeout(){const[a,z]=range();edOp(()=>{const d=E.work.getChannelData(0),n=z-a;for(let i=0;i<n;i++)d[a+i]*=1-i/n;});},
  louder(){gain(1.4);},quieter(){gain(0.7);},
  reverse(){const[a,z]=range();edOp(()=>{for(const b of[E.work,E.dry])b.getChannelData(0).subarray(a,z).reverse();});},
  async fx(fromVoice){const[a,z]=range();edStop();toast("Adding effect…");
    const srcB=fromVoice?E.dry:E.work,seg=newBuf(z-a,sr());seg.copyToChannel(srcB.getChannelData(0).subarray(a,z),0);
    const p=PRESETS[$("edPreset").value];const r=await renderFx(seg,{preset:$("edPreset").value,pitch:p.pitch,dist:p.dist,wet:100});
    push();const d=E.work.getChannelData(0),rd=r.getChannelData(0),f=Math.min(256,(z-a)>>2);
    for(let i=0;i<z-a;i++){let m=1;if(E.sel){if(i<f)m=i/f;else if(i>z-a-f)m=(z-a-i)/f;}d[a+i]=d[a+i]*(1-m)+rd[i]*m;}
    edDraw();edInfo();toast((fromVoice?"Re-voiced ":"Added ")+p.n+" ✓");},
};
function gain(g){const[a,z]=range();edOp(()=>{const d=E.work.getChannelData(0);for(let i=a;i<z;i++)d[i]=Math.max(-1,Math.min(1,d[i]*g));});}
function edStop(){if(edSrc){try{edSrc.stop();}catch(e){}edSrc=null;}cancelAnimationFrame(edRaf);$("edPlay").textContent="▶ Play";}
async function edPlay(){if(edSrc){edStop();return;}const c=getCtx();await c.resume();
  const[a,z]=E.sel?E.sel:[E.ph>=dur()-0.05?0:E.ph,dur()];
  edSrc=c.createBufferSource();edSrc.buffer=E.work;edSrc.connect(c.destination);const t0=c.currentTime;edSrc.start(0,a,z-a);$("edPlay").textContent="■ Stop";
  edSrc.onended=()=>{edStop();edDraw();};
  const tick=()=>{E.ph=Math.min(z,a+(c.currentTime-t0));edDraw();if(edSrc)edRaf=requestAnimationFrame(tick);};tick();}
async function edSave(asNew){edStop();const c=asNew?{...E.clip,id:"c"+Date.now(),created:Date.now(),name:E.clip.name+" (edit)"}:E.clip;
  c.audio=toWav(E.work);c.dry=toWav(E.dry);c.dur=dur();await putClip(c);E.clip=c;E.dirty=false;$("edName").textContent=c.name;await renderList(c.id);toast(asNew?"Saved as new clip ✓":"Saved ✓");}
async function edExport(kind){edStop();toast(kind==="mp3"?"Making MP3…":"Making WAV…");
  const blob=kind==="mp3"?await toMp3(E.work):toWav(E.work);const name=(E.clip.name.replace(/[^\w\- ]+/g,"").trim().replace(/\s+/g,"-")||"voicebox")+"."+kind;
  window.__vbLastExport=blob;const file=new File([blob],name,{type:blob.type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:"Voice Box"});toast("Shared ✓");return;}catch(e){if(e.name==="AbortError")return;}}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();toast("Downloaded "+name);}
let toastT;function toast(t){$("toast").textContent=t;$("toast").hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>$("toast").hidden=true,2200);}
$("edClose").onclick=closeEditor;$("edPlay").onclick=edPlay;
$("edUndo").onclick=()=>{const u=E.undo.pop();if(!u)return;edStop();[E.work,E.dry]=u;E.sel=null;E.ph=Math.min(E.ph,dur());edDraw();edInfo();};
$("edAll").onclick=()=>{E.sel=null;edDraw();edInfo();};
document.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>OPS[b.dataset.op]());
$("edFx").onclick=()=>OPS.fx(false);$("edRevoice").onclick=()=>OPS.fx(true);
$("edSave").onclick=()=>edSave(false);$("edSaveNew").onclick=()=>edSave(true);
$("edMp3").onclick=()=>edExport("mp3");$("edWav").onclick=()=>edExport("wav");
addEventListener("resize",()=>{if(!$("ed").hidden)edDraw();});

setPreset(PRESETS[cur]?cur:"robot");setMode("rec");renderList();refreshOutputs();
window.__vb={refreshOutputs,get sinkId(){return sinkId},setPreset:k=>setPreset(k),get ctx(){return ctx},get on(){return on},get mode(){return mode},get master(){return master},get hp(){return hp},get E(){return E},allClips,toMp3};
})();
