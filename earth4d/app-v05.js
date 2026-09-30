
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

const CITIES=[
{name:'Milano',lat:45.4642,lon:9.1900,start:-500,size:18},
{name:'Roma',lat:41.9028,lon:12.4964,start:-800,size:21},
{name:'Firenze',lat:43.7696,lon:11.2558,start:-100,size:14},
{name:'Venezia',lat:45.4408,lon:12.3155,start:500,size:13},
{name:'Napoli',lat:40.8518,lon:14.2681,start:-600,size:17},
{name:'Torino',lat:45.0703,lon:7.6869,start:-50,size:14},
{name:'Bologna',lat:44.4949,lon:11.3426,start:-500,size:13},
{name:'Genova',lat:44.4056,lon:8.9463,start:-500,size:14},
{name:'Palermo',lat:38.1157,lon:13.3615,start:-700,size:15},
{name:'Sassari',lat:40.7259,lon:8.5557,start:1100,size:9}
];

const ROUTES={
roman:[
[[45.4642,9.19],[44.4949,11.3426],[43.7696,11.2558],[41.9028,12.4964]],
[[45.0703,7.6869],[45.4642,9.19],[44.4056,8.9463]],
[[41.9028,12.4964],[40.8518,14.2681]],
[[41.9028,12.4964],[42.45,13.4],[43.2,13.7],[44.4949,11.3426]]
],
rail:[
[[45.0703,7.6869],[45.4642,9.19],[45.4408,12.3155]],
[[45.4642,9.19],[44.4949,11.3426],[43.7696,11.2558],[41.9028,12.4964],[40.8518,14.2681]],
[[44.4056,8.9463],[45.4642,9.19]]
],
highway:[
[[45.0703,7.6869],[45.4642,9.19],[44.4949,11.3426],[43.7696,11.2558],[41.9028,12.4964],[40.8518,14.2681]],
[[44.4056,8.9463],[45.4642,9.19],[45.4408,12.3155]]
]
};

let selected={name:'Milano',lat:45.4642,lon:9.19};
let simulatedDate={day:1,month:1,year:1200};
let lastDeparted=null;
let viewMode='satellite';
let keys={};
let streetReady=false;
let scene,camera,renderer,clock,streetAnim=0,yaw=0,pitch=0,drag=false,lastX=0,lastY=0;
let sceneObjects=[],sceneTextures=[];

const map=L.map('map',{
 zoomControl:false,attributionControl:true,minZoom:5,maxZoom:19,
 maxBounds:[[35.0,5.0],[48.6,20.6]],maxBoundsViscosity:.8
}).setView([45.4642,9.19],12);

L.tileLayer(
 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
 {maxZoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics and GIS User Community'}
).addTo(map);

const historical=L.layerGroup().addTo(map);
const routeLayer=L.layerGroup().addTo(map);
const urbanLayer=L.layerGroup().addTo(map);

function displayYear(y){
 if(y<0)return Math.abs(Math.round(y)).toLocaleString('it-IT')+' a.C.';
 return Math.round(y).toLocaleString('it-IT')+' d.C.';
}
function eraName(y){
 if(y<-3000)return 'Paesaggio preistorico';
 if(y<0)return 'Italia antica';
 if(y<500)return 'Età romana';
 if(y<1100)return 'Alto Medioevo';
 if(y<1450)return 'Medioevo';
 if(y<1650)return 'Rinascimento';
 if(y<1850)return 'Età moderna';
 if(y<1920)return 'Prima industrializzazione';
 if(y<1960)return 'Italia del dopoguerra';
 if(y<2000)return 'Italia contemporanea';
 if(y<=2026)return 'Presente';
 return 'Scenario futuro';
}
function urbanFactor(y){
 if(y<-3000)return .015;
 if(y<0)return .08+(y+3000)/3000*.08;
 if(y<500)return .16+(y/500)*.08;
 if(y<1200)return .24+(y-500)/700*.12;
 if(y<1600)return .36+(y-1200)/400*.12;
 if(y<1861)return .48+(y-1600)/261*.08;
 if(y<1910)return .56+(y-1861)/49*.09;
 if(y<1950)return .65+(y-1910)/40*.08;
 if(y<2000)return .73+(y-1950)/50*.20;
 if(y<=2026)return .93+(y-2000)/26*.07;
 return Math.min(1.14,1+(y-2026)/74*.14);
}
function seasonTone(month){
 if([12,1,2].includes(month))return {sky:0xaab8c5,ground:0x5f6759,leaf:0x56664f};
 if([3,4,5].includes(month))return {sky:0x9ec4dd,ground:0x64745d,leaf:0x557b4b};
 if([6,7,8].includes(month))return {sky:0x78acd2,ground:0x706c4c,leaf:0x466e3b};
 return {sky:0x91a7ba,ground:0x6f624f,leaf:0x716238};
}

function updateReadouts(){
 const d=simulatedDate;
 const era=d.year<0?'BC':'AD';
 const abs=Math.abs(d.year);
 $('#destReadout').textContent=String(d.day).padStart(2,'0')+' '+String(d.month).padStart(2,'0')+' '+String(abs).padStart(4,'0')+' '+era;
 $('#hudDate').textContent=String(d.day).padStart(2,'0')+' · '+String(d.month).padStart(2,'0')+' · '+displayYear(d.year);
 $('#hudEra').textContent=eraName(d.year);
 const n=new Date();
 const pEra=n.getFullYear()<0?'BC':'AD';
 $('#presentReadout').textContent=String(n.getDate()).padStart(2,'0')+' '+String(n.getMonth()+1).padStart(2,'0')+' '+String(Math.abs(n.getFullYear())).padStart(4,'0')+' '+pEra;
 if(lastDeparted){
   const l=lastDeparted;
   $('#lastReadout').textContent=String(l.day).padStart(2,'0')+' '+String(l.month).padStart(2,'0')+' '+String(Math.abs(l.year)).padStart(4,'0')+' '+(l.year<0?'BC':'AD');
 }
 $('#hudPlace').textContent=selected.name;
 $('#hudCoords').textContent=selected.lat.toFixed(4)+' · '+selected.lon.toFixed(4);
 $('#selectedPlace').textContent=selected.name;
 $('#placeInput').value=selected.name;
}

function dateFromControls(){
 const day=Math.max(1,Math.min(31,+$('#day').value||1));
 const month=Math.max(1,Math.min(12,+$('#month').value||1));
 const raw=Math.max(1,Math.min(12000,+$('#year').value||1));
 return {day,month,year:$('#era').value==='BC'?-raw:raw};
}
function syncControls(){
 $('#day').value=simulatedDate.day;
 $('#month').value=simulatedDate.month;
 $('#year').value=Math.max(1,Math.abs(Math.round(simulatedDate.year)));
 $('#era').value=simulatedDate.year<0?'BC':'AD';
 updateReadouts();
}
['day','month','year','era'].forEach(id=>{
 $('#'+id).addEventListener('input',()=>{
   simulatedDate=dateFromControls();
   updateReadouts();
   renderAerialEvolution();
 });
});

function renderAerialEvolution(){
 const y=simulatedDate.year;
 const uf=urbanFactor(y);
 historical.clearLayers();routeLayer.clearLayers();urbanLayer.clearLayers();

 let tint='rgba(115,91,55,.05)';
 if(y<-3000)tint='rgba(65,101,62,.20)';
 else if(y<0)tint='rgba(91,101,65,.13)';
 else if(y<1700)tint='rgba(126,93,53,.13)';
 else if(y<1950)tint='rgba(107,94,76,.09)';
 else if(y>2026)tint='rgba(65,82,150,.08)';
 $('#historicalTint').style.background=tint;

 // Aerial evolution mask: in older eras vegetation/farmland overlays progressively cover modern urban footprints.
 const eraseModern=Math.max(0,Math.min(1,(1950-y)/1400));
 CITIES.forEach(c=>{
   if(y<c.start-350)return;
   const age=Math.max(.15,Math.min(1,(y-c.start+350)/1000));
   const radiusKm=Math.max(.8,c.size*(.15+.85*uf)*age);
   L.circle([c.lat,c.lon],{
     radius:radiusKm*1000,color:y<1800?'#bca46e':'#9cc7c4',weight:1,
     fillColor:y<1700?'#667454':'#405c5a',
     fillOpacity:y<1800?.12+.18*eraseModern:.06
   }).addTo(urbanLayer);
 });
 if(y<1800){
   // broad rural overlays over metropolitan zones to visually suppress some present-day satellite complexity
   [[45.46,9.19,18],[41.90,12.50,20],[40.85,14.27,15],[45.07,7.69,14],[44.49,11.34,12],[43.77,11.26,12]].forEach(([lat,lon,r])=>{
     L.circle([lat,lon],{radius:r*1000,stroke:false,fillColor:y<0?'#4c664a':'#6b7555',fillOpacity:.08+.12*eraseModern}).addTo(historical);
   });
 }
 if(y<-2000){
   L.rectangle([[35.0,5.0],[48.6,20.6]],{stroke:false,fillColor:'#456342',fillOpacity:.07}).addTo(historical);
 }

 const romanOpacity=y>=-300&&y<=700?Math.min(1,.35+Math.abs(200-Math.max(-300,Math.min(700,y)))/900):0;
 if(romanOpacity>0)ROUTES.roman.forEach(p=>L.polyline(p,{color:'#e3bf83',weight:2.4,opacity:romanOpacity,dashArray:'7 6'}).addTo(routeLayer));
 const railOpacity=Math.max(0,Math.min(1,(y-1850)/80));
 if(railOpacity>0)ROUTES.rail.forEach(p=>L.polyline(p,{color:'#dfe9ef',weight:1.7,opacity:railOpacity,dashArray:'2 5'}).addTo(routeLayer));
 const highwayOpacity=Math.max(0,Math.min(1,(y-1950)/50));
 if(highwayOpacity>0)ROUTES.highway.forEach(p=>L.polyline(p,{color:'#7ad4ff',weight:2.6,opacity:highwayOpacity*.75}).addTo(routeLayer));

 if(selected.name==='Milano'&&y>1050&&y<1650){
   L.circle([45.4642,9.19],{radius:1750,color:'#ffd591',weight:3,dashArray:'7 5',fillColor:'#c89a5a',fillOpacity:.07}).addTo(routeLayer);
 }
}

$('#placeForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const q=$('#placeInput').value.trim(),box=$('#placeResults');
 if(!q)return;
 box.classList.remove('hidden');box.innerHTML='<button>Ricerca in corso…</button>';
 try{
   const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=it&countrycodes=it&q='+encodeURIComponent(q);
   const data=await(await fetch(url)).json();
   box.innerHTML='';
   if(!data.length){box.innerHTML='<button>Nessun luogo trovato in Italia</button>';return}
   data.forEach(x=>{
     const b=document.createElement('button');
     b.innerHTML='<b>'+x.display_name.split(',')[0]+'</b><small>'+x.display_name+'</small>';
     b.onclick=()=>{
       selected={name:x.display_name.split(',')[0],lat:+x.lat,lon:+x.lon};
       box.classList.add('hidden');updateReadouts();
       map.flyTo([selected.lat,selected.lon],13,{duration:1.2});
       if(viewMode==='street'&&streetReady)buildStreet();
     };
     box.appendChild(b);
   });
 }catch{box.innerHTML='<button>Ricerca non disponibile</button>'}
});

function setView(mode){
 viewMode=mode;
 const street=mode==='street';
 $('#map').style.display=street?'none':'block';
 $('#historicalTint').style.display=street?'none':'block';
 $('#threeHost').style.display=street?'block':'none';
 $('#satBtn').classList.toggle('active',!street);
 $('#streetBtn').classList.toggle('active',street);
 $('#viewToggle').textContent=street?'GUIDA':'SATELLITE';
 if(street){
   loadThree().then(()=>{
     if(!streetReady){initThree();streetReady=true}else buildStreet();
   });
 }else{
   setTimeout(()=>map.invalidateSize(),30);
   map.flyTo([selected.lat,selected.lon],Math.max(12,map.getZoom()),{duration:.7});
 }
}
$('#satBtn').onclick=()=>setView('satellite');
$('#streetBtn').onclick=()=>setView('street');
$('#viewToggle').onclick=()=>setView(viewMode==='street'?'satellite':'street');

$('#todayBtn').onclick=()=>{
 lastDeparted={...simulatedDate};
 const n=new Date();
 simulatedDate={day:n.getDate(),month:n.getMonth()+1,year:n.getFullYear()};
 syncControls();renderAerialEvolution();setView('satellite');
};

$('#sourcesBtn').onclick=()=>$('#sourcesDrawer').classList.add('open');
$('#closeSources').onclick=()=>$('#sourcesDrawer').classList.remove('open');

function setSpeed(mph){
 $('#mph').textContent=Math.round(mph);
 $('#needle').style.transform='rotate('+(132+Math.min(88,mph)/88*276)+'deg)';
}
function startEngineAudio(){
 try{
   const AudioCtx=window.AudioContext||window.webkitAudioContext;
   const ctx=new AudioCtx();
   const master=ctx.createGain();master.gain.value=.08;master.connect(ctx.destination);
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='sawtooth';osc.frequency.setValueAtTime(38,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(125,ctx.currentTime+2.7);
   gain.gain.setValueAtTime(.05,ctx.currentTime);gain.gain.linearRampToValueAtTime(.28,ctx.currentTime+2.2);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+4);
   osc.connect(gain);gain.connect(master);osc.start();osc.stop(ctx.currentTime+4.1);
   const noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*1.1,ctx.sampleRate),data=noiseBuffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
   const noise=ctx.createBufferSource(),ng=ctx.createGain();noise.buffer=noiseBuffer;ng.gain.value=.2;noise.connect(ng);ng.connect(master);
   setTimeout(()=>noise.start(),2600);
 }catch{}
}

async function launch(){
 const target=dateFromControls();
 simulatedDate=target;updateReadouts();
 const fx=$('#travelFx'),flux=$('.flux-capacitor');
 fx.classList.add('on');flux.classList.add('active');
 $('#fluxState').textContent='CHARGING';
 startEngineAudio();
 const start=performance.now(),duration=4800;
 const fromYear=lastDeparted?lastDeparted.year:new Date().getFullYear();
 lastDeparted={day:new Date().getDate(),month:new Date().getMonth()+1,year:new Date().getFullYear()};
 $('#travelDestination').textContent=selected.name.toUpperCase()+' · '+displayYear(target.year);
 const loop=now=>{
   let t=Math.min(1,(now-start)/duration);
   let mph=t<.62?88*(t/.62):88;
   setSpeed(mph);$('#travelMph').textContent=Math.round(mph)+' MPH';
   if(t<.62){$('#travelPhase').textContent='ACCELERAZIONE TEMPORALE';$('#fluxState').textContent='CHARGING'}
   else if(t<.76){$('#travelPhase').textContent='88 MPH · FLUSSO ATTIVO';$('#fluxState').textContent='ACTIVE'}
   else if(t<.91){$('#travelPhase').textContent='ATTRAVERSAMENTO TEMPORALE';fx.classList.add('flash-now')}
   else{$('#travelPhase').textContent='ARRIVO TEMPORALE'}
   if(t<1)requestAnimationFrame(loop);
   else{
     renderAerialEvolution();syncControls();
     map.setView([selected.lat,selected.lon],13);
     fx.classList.remove('on','flash-now');flux.classList.remove('active');$('#fluxState').textContent='STABLE';setSpeed(0);
     $('#arrivalMain').textContent=selected.name.toUpperCase()+' · '+displayYear(target.year);
     $('#arrivalTitle').classList.add('show');
     setTimeout(()=>$('#arrivalTitle').classList.remove('show'),2400);
     setTimeout(()=>setView('street'),650);
   }
 };
 requestAnimationFrame(loop);
}
$('#launch').onclick=launch;

// ---------- Procedural cinematic street scene ----------
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
function loadThree(){
 return new Promise((resolve,reject)=>{
   if(window.THREE)return resolve();
   const s=document.createElement('script');s.src=THREE_URL;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
 });
}
function disposeScene(){
 sceneObjects.forEach(o=>{
   scene?.remove(o);
   o.geometry?.dispose?.();
   if(o.material){
     const mats=Array.isArray(o.material)?o.material:[o.material];
     mats.forEach(m=>m.dispose?.());
   }
 });
 sceneTextures.forEach(t=>t.dispose?.());
 sceneObjects=[];sceneTextures=[];
}
function canvasTexture(kind,base,accent){
 const cv=document.createElement('canvas');cv.width=512;cv.height=512;
 const c=cv.getContext('2d');
 c.fillStyle=base;c.fillRect(0,0,512,512);
 if(kind==='stone'){
   for(let y=0;y<512;y+=42){for(let x=(y/42)%2?22:0;x<512;x+=74){
     c.fillStyle='rgba(255,255,255,'+(Math.random()*.06)+')';c.fillRect(x+2,y+2,68,36);
     c.strokeStyle='rgba(25,20,18,.22)';c.strokeRect(x,y,72,40);
   }}
 }else if(kind==='brick'){
   for(let y=0;y<512;y+=30){for(let x=(y/30)%2?30:0;x<512;x+=62){
     c.fillStyle='rgba(90,38,25,.2)';c.fillRect(x+1,y+1,58,26);c.strokeStyle='rgba(30,20,18,.2)';c.strokeRect(x,y,60,28);
   }}
 }else if(kind==='modern'){
   for(let y=26;y<512;y+=68)for(let x=24;x<512;x+=82){c.fillStyle=accent;c.fillRect(x,y,46,34);c.fillStyle='rgba(255,255,255,.14)';c.fillRect(x+4,y+3,38,5)}
 }else if(kind==='plaster'){
   for(let n=0;n<6000;n++){const a=Math.random()*.045;c.fillStyle='rgba(255,255,255,'+a+')';c.fillRect(Math.random()*512,Math.random()*512,1,1)}
   c.strokeStyle='rgba(70,50,30,.16)';for(let y=80;y<512;y+=96){c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke()}
 }
 const tx=new THREE.CanvasTexture(cv);
 if(THREE.SRGBColorSpace)tx.colorSpace=THREE.SRGBColorSpace;
 tx.wrapS=tx.wrapT=THREE.RepeatWrapping;
 sceneTextures.push(tx);
 return tx;
}
function makeMat(color,texture=null,rough=.88,metal=.02){
 return new THREE.MeshStandardMaterial({color,map:texture,roughness:rough,metalness:metal});
}
function add(obj){scene.add(obj);sceneObjects.push(obj);return obj}
function box(x,y,z,w,h,d,mat){
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y+h/2,z);m.castShadow=true;m.receiveShadow=true;return add(m)
}
function tree(x,z,scale,leafColor){
 const trunk=box(x,0,z,.42*scale,3.1*scale,.42*scale,makeMat(0x4a3424,null,1));
 const crown=new THREE.Mesh(new THREE.SphereGeometry(1.45*scale,12,8),makeMat(leafColor,null,.95));crown.position.set(x,3.7*scale,z);crown.castShadow=true;add(crown)
}
function streetProfile(year){
 if(year<-3000)return {density:.03,road:'dirt',style:'none',h:0,w:16,trees:1};
 if(year<0)return {density:.22,road:'dirt',style:'stone',h:5,w:9,trees:.72};
 if(year<500)return {density:.38,road:'stone',style:'stone',h:7,w:8,trees:.45};
 if(year<1450)return {density:.62,road:'dirt',style:'medieval',h:9,w:6.4,trees:.22};
 if(year<1750)return {density:.72,road:'stone',style:'renaissance',h:11,w:7.2,trees:.18};
 if(year<1900)return {density:.8,road:'stone',style:'plaster',h:13,w:7.8,trees:.16};
 if(year<1960)return {density:.9,road:'asphalt',style:'industrial',h:15,w:9,trees:.18};
 if(year<=2026)return {density:1,road:'asphalt',style:'modern',h:22,w:11,trees:.25};
 return {density:1.08,road:'asphalt',style:'future',h:28,w:12,trees:.42};
}
function roadMaterial(type){
 const base=type==='dirt'?0x655745:type==='stone'?0x77726b:0x24282c;
 const cv=document.createElement('canvas');cv.width=512;cv.height=512;const c=cv.getContext('2d');
 c.fillStyle='#'+base.toString(16).padStart(6,'0');c.fillRect(0,0,512,512);
 for(let n=0;n<4500;n++){const v=Math.floor(30+Math.random()*70);c.fillStyle='rgba('+v+','+v+','+v+','+(Math.random()*.09)+')';c.fillRect(Math.random()*512,Math.random()*512,1+Math.random()*2,1+Math.random()*2)}
 if(type==='stone'){c.strokeStyle='rgba(20,20,20,.22)';for(let y=0;y<512;y+=38){c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke()}}
 const t=new THREE.CanvasTexture(cv);if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,12);sceneTextures.push(t);
 return makeMat(0xffffff,t,.98);
}
function buildStreet(){
 if(!scene)return;
 disposeScene();
 const y=simulatedDate.year,month=simulatedDate.month,prof=streetProfile(y),season=seasonTone(month);

 scene.background=new THREE.Color(season.sky);
 scene.fog=new THREE.FogExp2(season.sky, y<1700?.012:.007);

 // Ground / horizon
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(350,350),makeMat(season.ground,null,1));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;add(ground);
 const roadW=prof.w;
 const road=new THREE.Mesh(new THREE.PlaneGeometry(roadW,300),roadMaterial(prof.road));road.rotation.x=-Math.PI/2;road.position.y=.015;road.receiveShadow=true;add(road);

 if(prof.road==='asphalt'&&y>1960){
   for(let z=-135;z<135;z+=12){
     box(0,.02,z,.13,.025,5.5,makeMat(0xe6dfb3,null,.85));
   }
 }

 // side paths
 if(y>1850){
   [-1,1].forEach(side=>{
     const curb=new THREE.Mesh(new THREE.PlaneGeometry(2.8,300),makeMat(0x666a67,null,.96));curb.rotation.x=-Math.PI/2;curb.position.set(side*(roadW/2+1.4),.02,0);curb.receiveShadow=true;add(curb);
   });
 }

 // Buildings
 if(prof.style!=='none'){
   const count=Math.round(18*prof.density);
   for(let side of [-1,1]){
     for(let n=-count;n<=count;n++){
       if(Math.abs(n)%5===0&&Math.random()>.65)continue;
       const z=n*(y<1500?8.5:y<1900?10.5:12.5)+(n%2)*1.2;
       const width=y<1500?5.8+Math.random()*2.4:y<1900?7+Math.random()*2.8:8.5+Math.random()*3.2;
       const depth=y<1500?8:10;
       const h=prof.h*(.72+Math.random()*.65);
       const x=side*(roadW/2+width/2+(y<1500?.7:2.6));
       let color=0xb89c79,kind='plaster',accent='rgba(160,205,225,.65)';
       if(prof.style==='stone'){color=0xa9987b;kind='stone'}
       if(prof.style==='medieval'){color=[0x8f7459,0xa68462,0x755e49][Math.abs(n)%3];kind=Math.abs(n)%2?'stone':'brick'}
       if(prof.style==='renaissance'){color=[0xcab58f,0xd2c5a5,0xb89778][Math.abs(n)%3];kind='plaster'}
       if(prof.style==='plaster'){color=[0xc8b79a,0xd8c7aa,0xae9e87][Math.abs(n)%3];kind='plaster'}
       if(prof.style==='industrial'){color=[0x9c8f7c,0x8a7464,0xb5a990][Math.abs(n)%3];kind=Math.abs(n)%3===0?'brick':'plaster'}
       if(prof.style==='modern'){color=[0x9fa7aa,0xb7b0a4,0x879095][Math.abs(n)%3];kind='modern'}
       if(prof.style==='future'){color=[0x506678,0x667b8a,0x425a65][Math.abs(n)%3];kind='modern';accent='rgba(130,230,255,.75)'}
       const tex=canvasTexture(kind,'#'+color.toString(16).padStart(6,'0'),accent);
       const b=box(x,0,z,width,h,depth,makeMat(0xffffff,tex,.9,prof.style==='future'?.12:.02));

       if(y<1750){
         const roofMat=makeMat(y<0?0x9a8a70:0x673f2d,null,.94);
         const roof=new THREE.Mesh(new THREE.ConeGeometry(width*.72,2.3,4),roofMat);roof.rotation.y=Math.PI/4;roof.position.set(x,h+1.1,z);roof.castShadow=true;add(roof);
       }
       if(y>2026&&Math.abs(n)%3===0){
         const strip=box(x-side*(width/2+.04),h*.35,z,.08,h*.38,width*.58,makeMat(0x72e8ff,null,.25,.15));strip.material.emissive=new THREE.Color(0x2d8190);strip.material.emissiveIntensity=.8;
       }
     }
   }
 }

 // Trees / landscape
 const treeCount=Math.round(34*prof.trees);
 for(let i=0;i<treeCount;i++){
   const side=i%2?-1:1;
   const z=-135+Math.random()*270;
   const x=side*(roadW/2+5+Math.random()*24);
   tree(x,z,.75+Math.random()*.8,season.leaf);
 }
 if(y<-3000){
   for(let i=0;i<70;i++)tree((Math.random()-.5)*70,(Math.random()-.5)*280,.8+Math.random()*1.4,season.leaf);
 }

 // Street furniture
 if(y>1850){
   for(let side of [-1,1])for(let z=-120;z<120;z+=24){
     const px=side*(roadW/2+3.2);
     box(px,0,z,.16,4.8,.16,makeMat(0x252b2f,null,.75,.3));
     const lamp=new THREE.PointLight(y>2026?0xa8ecff:0xffd7a1,1.5,14);lamp.position.set(px,4.65,z);add(lamp);
   }
 }
 if(y>1960){
   // parked cars as realistic-ish low-poly silhouettes
   for(let z=-105;z<105;z+=34){
     const side=(Math.floor(z/34)%2)?-1:1,px=side*(roadW/2+1.7);
     const car=box(px,.05,z,1.75,1.05,4.1,makeMat([0x343b43,0x6c1e20,0xc0c4c7,0x1d4260][Math.abs(Math.floor(z/34))%4],null,.42,.45));
     const cabin=box(px,.95,z-.25,1.48,.55,1.9,makeMat(0x26353f,null,.2,.25));
   }
 }

 camera.position.set(0,1.62,36);yaw=0;pitch=-.02;
 $('#rainLayer').style.opacity=([11,12,1,2].includes(month)&&selected.lat>44)?.16:0;
}
function initThree(){
 const host=$('#threeHost');
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,420);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(host.clientWidth||innerWidth,host.clientHeight||innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
 if(THREE.SRGBColorSpace)renderer.outputColorSpace=THREE.SRGBColorSpace;
 host.innerHTML='';host.appendChild(renderer.domElement);
 clock=new THREE.Clock();

 scene.add(new THREE.HemisphereLight(0xddeeff,0x514637,1.8));
 const sun=new THREE.DirectionalLight(0xfff0d2,3.2);sun.position.set(32,48,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;scene.add(sun);

 const canvas=renderer.domElement;
 canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId)});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-lastX)*.0035;pitch-=(e.clientY-lastY)*.0028;pitch=Math.max(-.82,Math.min(.55,pitch));lastX=e.clientX;lastY=e.clientY});
 canvas.addEventListener('pointerup',()=>drag=false);
 addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
 addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

 buildStreet();animateStreet();
}
function animateStreet(){
 if(!renderer)return;
 const dt=Math.min(.04,clock.getDelta());
 const f=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0);
 const s=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
 const speed=simulatedDate.year>1960?10:6.5;
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
 const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 camera.position.addScaledVector(forward,f*speed*dt);
 camera.position.addScaledVector(right,s*speed*.52*dt);
 const prof=streetProfile(simulatedDate.year);
 camera.position.x=Math.max(-prof.w*.36,Math.min(prof.w*.36,camera.position.x));
 camera.position.z=Math.max(-138,Math.min(138,camera.position.z));
 camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;
 renderer.render(scene,camera);
 streetAnim=requestAnimationFrame(animateStreet);
}

$$('.mobile-drive button').forEach(b=>{
 const k=b.dataset.k;
 b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});
 ['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false));
});

addEventListener('resize',()=>{
 map.invalidateSize();
 if(renderer){
   const host=$('#threeHost'),w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;
   camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);
 }
});

simulatedDate={day:1,month:1,year:1200};
syncControls();
renderAerialEvolution();
setSpeed(0);
