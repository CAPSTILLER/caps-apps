(() => {
"use strict";
// ---------- AudioWorklet: granular pitch shift + ring mod (w/ vibrato) + bitcrusher ----------
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
registerProcessor('voice-fx',VoiceFX);`;

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
let ctx,node,src,stream,dry,wet,shaper,filt,delay,fb,delayWet,conv,convWet,analyser,out,recDest,rec,chunks=[];
let cur="robot",mode="live",on=false,rafId;

function curve(amt){const k=amt*1.5,n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i*2/n-1;c[i]=k?((1+k)*x/(1+k*Math.abs(x))):x;}return c;}
function impulse(sec){const len=ctx.sampleRate*sec,b=ctx.createBuffer(2,len,ctx.sampleRate);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}return b;}

async function build(){
  ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:"interactive"});
  const url=URL.createObjectURL(new Blob([WORKLET],{type:"application/javascript"}));
  await ctx.audioWorklet.addModule(url);
  node=new AudioWorkletNode(ctx,"voice-fx",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
  shaper=ctx.createWaveShaper();shaper.oversample="2x";
  filt=ctx.createBiquadFilter();
  delay=ctx.createDelay(1);fb=ctx.createGain();delayWet=ctx.createGain();
  conv=ctx.createConvolver();conv.buffer=impulse(1.8);convWet=ctx.createGain();
  dry=ctx.createGain();wet=ctx.createGain();out=ctx.createGain();
  analyser=ctx.createAnalyser();analyser.fftSize=1024;
  recDest=ctx.createMediaStreamDestination();
  node.connect(shaper);shaper.connect(filt);filt.connect(wet);
  filt.connect(delay);delay.connect(fb);fb.connect(delay);delay.connect(delayWet);delayWet.connect(wet);
  filt.connect(conv);conv.connect(convWet);convWet.connect(wet);
  wet.connect(out);dry.connect(out);out.connect(analyser);out.connect(recDest);
}
function apply(){
  if(!ctx)return;const p=PRESETS[cur],t=ctx.currentTime,P=node.parameters;
  P.get("pitch").setTargetAtTime(Math.pow(2,+$("sPitch").value/12),t,.02);
  P.get("ringFreq").value=p.ringFreq||0;P.get("ringMix").value=p.ringMix||0;
  P.get("vibRate").value=p.vibRate||0;P.get("vibDepth").value=p.vibDepth||0;
  P.get("bits").value=p.bits||16;P.get("down").value=p.down||1;
  shaper.curve=curve(+$("sDist").value);
  if(p.bp){filt.type="bandpass";filt.frequency.value=p.bp;filt.Q.value=p.bpQ;}
  else if(p.lp){filt.type="lowpass";filt.frequency.value=p.lp;filt.Q.value=.7;}
  else{filt.type="allpass";filt.frequency.value=1000;}
  delay.delayTime.value=p.delay||.2;fb.gain.value=p.fb||0;delayWet.gain.value=p.delay?.6:0;
  convWet.gain.value=p.rev?.7:0;
  const w=+$("sWet").value/100;wet.gain.setTargetAtTime(w,t,.02);dry.gain.setTargetAtTime(1-w,t,.02);
  out.gain.value=p.bp?.8:1;
}
function setPreset(k){cur=k;const p=PRESETS[k];$("sPitch").value=p.pitch;$("sDist").value=p.dist;$("sWet").value=p.wet;
  document.querySelectorAll("#presets button").forEach(b=>b.classList.toggle("on",b.dataset.k===k));sync();}
function sync(){$("vPitch").textContent=(+$("sPitch").value>0?"+":"")+$("sPitch").value;$("vDist").textContent=$("sDist").value;$("vWet").textContent=$("sWet").value;apply();}

async function start(){
  if(on)return;on=true;$("mic").classList.add("live");$("mic").textContent=mode==="live"?"LIVE…":"REC…";
  try{
    if(!ctx)await build();await ctx.resume();apply();
    if(!stream)stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,latency:0,channelCount:1}});
    src=ctx.createMediaStreamSource(stream);src.connect(node);src.connect(dry);
    try{out.disconnect(ctx.destination);}catch(e){}
    if(mode==="live")out.connect(ctx.destination);
    else{chunks=[];const mt=["audio/webm;codecs=opus","audio/webm","audio/ogg","audio/mp4"].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||"";
      rec=new MediaRecorder(recDest.stream,mt?{mimeType:mt}:{});rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);rec.onstop=showClip;rec.start(250);}
    const lat=((ctx.baseLatency||0)+(ctx.outputLatency||0))*1000;
    $("status").textContent=mode==="live"?`Live · ~${lat?Math.round(lat)+" ms":"low"} latency`:"Recording with effect…";
    loop();
  }catch(e){stop();$("status").textContent="Mic blocked: "+(e.message||e.name)+". Allow the microphone and try again.";}
}
function stop(){
  if(!on)return;on=false;$("mic").classList.remove("live");$("mic").textContent="TAP TO TALK";
  if(src){try{src.disconnect();}catch(e){}src=null;}
  if(rec&&rec.state!=="inactive")rec.stop();
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  cancelAnimationFrame(rafId);$("lvl").style.width="0";
  if(mode==="live")$("status").textContent="Stopped · tap or hold to talk";
}
function showClip(){
  const type=(chunks[0]&&chunks[0].type)||"audio/webm",blob=new Blob(chunks,{type}),url=URL.createObjectURL(blob);
  const ext=type.includes("mp4")?"m4a":type.includes("ogg")?"ogg":"webm",name=`voicebox-${cur}-${Date.now()}.${ext}`;
  const c=$("clip");c.hidden=false;c.innerHTML="";
  const a=document.createElement("audio");a.controls=true;a.src=url;c.append(a);
  const row=document.createElement("div");row.className="row";
  const dl=document.createElement("a");dl.href=url;dl.download=name;dl.textContent="⬇ Download";row.append(dl);
  const file=new File([blob],name,{type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){const sb=document.createElement("button");sb.textContent="↗ Share";
    sb.onclick=()=>navigator.share({files:[file],title:"Voice Box"}).catch(()=>{});row.append(sb);}
  c.append(row);$("status").textContent="Clip ready · play, download or share";a.play().catch(()=>{});
}
function loop(){
  const cv=$("viz"),g=cv.getContext("2d"),d=new Float32Array(analyser.fftSize);
  const draw=()=>{analyser.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;const rms=Math.sqrt(s/d.length);
    $("lvl").style.width=Math.min(100,rms*400)+"%";
    g.fillStyle="#050505";g.fillRect(0,0,cv.width,cv.height);g.strokeStyle=on?"#f0c43a":"#2a6ad6";g.lineWidth=3;g.beginPath();
    for(let i=0;i<d.length;i++){const x=i/d.length*cv.width,y=cv.height/2+d[i]*cv.height*1.2;i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
    if(on)rafId=requestAnimationFrame(draw);};draw();
}
// ---------- UI ----------
for(const[k,p]of Object.entries(PRESETS)){const b=document.createElement("button");b.dataset.k=k;b.innerHTML=`<span>${p.e}</span>${p.n}`;b.onclick=()=>setPreset(k);$("presets").append(b);}
["sPitch","sDist","sWet"].forEach(id=>$(id).addEventListener("input",sync));
function setMode(m){if(on)stop();mode=m;$("mLive").classList.toggle("on",m==="live");$("mRec").classList.toggle("on",m==="rec");
  $("status").textContent=m==="live"?"Tap for on/off · hold to push-to-talk":"Tap to record, tap again to hear it";}
$("mLive").onclick=()=>setMode("live");$("mRec").onclick=()=>setMode("rec");
// tap = toggle; hold (>350ms) = push-to-talk
let downAt=0,wasOn=false;
const mic=$("mic");
mic.addEventListener("pointerdown",e=>{e.preventDefault();downAt=Date.now();wasOn=on;if(!on)start();});
mic.addEventListener("pointerup",()=>{const held=Date.now()-downAt>350;if(wasOn)stop();else if(held)stop();});
mic.addEventListener("contextmenu",e=>e.preventDefault());
setPreset("robot");
window.__vb={get ctx(){return ctx},get on(){return on}};
})();
