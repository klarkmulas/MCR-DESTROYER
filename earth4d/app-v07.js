
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const host=$('#globeHost');
let scene,camera,renderer,clock,world,earth,nightLayer,clouds,atmosphere,marker,starField;
let drag=false,lastX=0,lastY=0,autoRotate=true,targetRotation=null;
let scaleMode='calendar';
let destination={day:30,month:9,year:1200,era:'AD',ma:66,ga:4.54};
let selected={name:'Milano',lat:45.4642,lon:9.19};
const presentYear=2026;
const DAY_URL='https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const NIGHT_URL='https://unpkg.com/three-globe/example/img/earth-night.jpg';

function fmtCalendar(){
 const y=Math.abs(destination.year);
 return destination.day.toString().padStart(2,'0')+' · '+destination.month.toString().padStart(2,'0')+' · '+y+' '+(destination.year<0?'a.C.':'d.C.');
}
function targetLabel(){
 if(scaleMode==='calendar')return fmtCalendar();
 if(scaleMode==='ma')return destination.ma.toLocaleString('it-IT')+' milioni di anni fa';
 return destination.ga.toLocaleString('it-IT',{maximumFractionDigits:2})+' miliardi di anni fa';
}
function modeName(){
 if(scaleMode==='calendar')return 'Storia umana';
 if(scaleMode==='ma'){
   if(destination.ma<.05)return 'Quaternario';
   if(destination.ma<66)return 'Cenozoico';
   if(destination.ma<252)return 'Mesozoico';
   return 'Paleozoico / supercontinenti';
 }
 if(destination.ga<4.6)return 'Terra primordiale';
 if(destination.ga<13.7)return 'Prima della Terra';
 return 'Origine dell’Universo';
}
function confidence(){
 if(scaleMode==='calendar'){
   if(destination.year>=1900)return {color:'#66ff90',text:'Immagine terrestre moderna + tempo storico'};
   return {color:'#ffc24f',text:'Ricostruzione storica territoriale'};
 }
 if(scaleMode==='ma')return {color:'#ffc24f',text:'Ricostruzione paleogeografica schematica'};
 return {color:'#c9a5ff',text:destination.ga<=4.6?'Visualizzazione scientifica della Terra giovane':'Visualizzazione cosmologica'};
}
function updateUI(){
 $('#hudPlace').textContent=scaleMode==='ga'&&destination.ga>4.6?'Sistema Solare non ancora formato':selected.name;
 $('#hudCoords').textContent=selected.lat.toFixed(4)+'° N · '+selected.lon.toFixed(4)+'° E';
 $('#hudTime').textContent=targetLabel();
 $('#hudMode').textContent=modeName();
 $('#destinationReadout').textContent=scaleMode==='calendar'?(Math.abs(destination.year)+' '+(destination.year<0?'BC':'AD')):scaleMode==='ma'?(destination.ma+' Ma'):(destination.ga+' Ga');
 $('#selectedPlace').textContent=selected.name;
 $('#placeInput').value=selected.name;
 const c=confidence();$('#confidenceDot').style.background=c.color;$('#confidenceDot').style.boxShadow='0 0 9px '+c.color;$('#confidenceText').textContent=c.text;
}
function setScale(mode){
 scaleMode=mode;
 $$('.scaleTab').forEach(b=>b.classList.toggle('active',b.dataset.scale===mode));
 $('#calendarControls').classList.toggle('hidden',mode!=='calendar');
 $('#maControls').classList.toggle('hidden',mode!=='ma');
 $('#gaControls').classList.toggle('hidden',mode!=='ga');
 updateUI();applyEpochVisuals();
}
$$('.scaleTab').forEach(b=>b.onclick=()=>setScale(b.dataset.scale));
['day','month','year','era'].forEach(id=>$('#'+id).addEventListener('input',()=>{
 destination.day=Math.max(1,Math.min(31,+$('#day').value||1));
 destination.month=Math.max(1,Math.min(12,+$('#month').value||1));
 const y=Math.max(1,+$('#year').value||1);destination.year=$('#era').value==='BC'?-y:y;updateUI();applyEpochVisuals();
}));
$('#ma').addEventListener('input',()=>{destination.ma=Math.max(0,Math.min(4540,+$('#ma').value||0));updateUI();applyEpochVisuals()});
$('#ga').addEventListener('input',()=>{destination.ga=Math.max(4.54,Math.min(13.8,+$('#ga').value||4.54));updateUI();applyEpochVisuals()});

$$('.presets button').forEach(b=>b.onclick=()=>{
 const p=b.dataset.preset;
 if(p==='1200'){setScale('calendar');destination={...destination,day:30,month:9,year:1200};$('#year').value=1200;$('#era').value='AD'}
 if(p==='2026'){setScale('calendar');destination={...destination,day:30,month:9,year:2026};$('#year').value=2026;$('#era').value='AD'}
 if(p==='20k'){setScale('ma');destination.ma=.02;$('#ma').value=.02}
 if(p==='66m'){setScale('ma');destination.ma=66;$('#ma').value=66}
 if(p==='250m'){setScale('ma');destination.ma=250;$('#ma').value=250}
 if(p==='4540m'){setScale('ga');destination.ga=4.54;$('#ga').value=4.54}
 if(p==='bigbang'){setScale('ga');destination.ga=13.8;$('#ga').value=13.8}
 updateUI();applyEpochVisuals();
});

function init(){
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(44,host.clientWidth/host.clientHeight,.01,100);
 camera.position.set(0,0,5.4);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(host.clientWidth,host.clientHeight);
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 if(THREE.SRGBColorSpace)renderer.outputColorSpace=THREE.SRGBColorSpace;
 host.appendChild(renderer.domElement);
 clock=new THREE.Clock();
 createStars();createWorld();createLights();bindGlobeInput();animate();
}
function createStars(){
 const geo=new THREE.BufferGeometry(),count=2500,pos=new Float32Array(count*3),sizes=new Float32Array(count);
 for(let i=0;i<count;i++){const r=18+Math.random()*42,th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);pos[i*3]=r*Math.sin(ph)*Math.cos(th);pos[i*3+1]=r*Math.cos(ph);pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);sizes[i]=Math.random()}
 geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
 const mat=new THREE.PointsMaterial({color:0xd9edff,size:.045,sizeAttenuation:true,transparent:true,opacity:.85});
 starField=new THREE.Points(geo,mat);scene.add(starField);
}
function proceduralEarthTexture(){
 const c=document.createElement('canvas');c.width=2048;c.height=1024;const x=c.getContext('2d');
 const g=x.createLinearGradient(0,0,0,1024);g.addColorStop(0,'#204f7a');g.addColorStop(.5,'#17456f');g.addColorStop(1,'#123854');x.fillStyle=g;x.fillRect(0,0,2048,1024);
 x.fillStyle='#56794b';
 const blobs=[[340,350,240,170],[600,500,120,260],[1050,340,260,160],[1320,510,210,170],[1660,570,120,100]];
 blobs.forEach(([cx,cy,rx,ry])=>{x.beginPath();for(let a=0;a<=Math.PI*2+.1;a+=.15){const rr=1+.16*Math.sin(a*5)+.09*Math.sin(a*11);const px=cx+Math.cos(a)*rx*rr,py=cy+Math.sin(a)*ry*rr;a===0?x.moveTo(px,py):x.lineTo(px,py)}x.closePath();x.fill()});
 const t=new THREE.CanvasTexture(c);if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;return t;
}
function createWorld(){
 world=new THREE.Group();scene.add(world);
 const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
 const fallback=proceduralEarthTexture();
 const mat=new THREE.MeshPhongMaterial({map:fallback,specular:new THREE.Color(0x253b4c),shininess:9});
 earth=new THREE.Mesh(new THREE.SphereGeometry(1.55,96,64),mat);world.add(earth);
 loader.load(DAY_URL,t=>{if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;earth.material.map=t;earth.material.needsUpdate=true},undefined,()=>{});
 nightLayer=new THREE.Mesh(new THREE.SphereGeometry(1.553,96,64),new THREE.MeshBasicMaterial({map:null,transparent:true,opacity:.0,blending:THREE.AdditiveBlending,depthWrite:false}));
 world.add(nightLayer);
 loader.load(NIGHT_URL,t=>{if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;nightLayer.material.map=t;nightLayer.material.needsUpdate=true},undefined,()=>{});
 clouds=new THREE.Mesh(new THREE.SphereGeometry(1.575,96,64),new THREE.MeshPhongMaterial({map:createCloudTexture(),transparent:true,opacity:.42,depthWrite:false}));
 world.add(clouds);
 atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.67,96,64),new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,vertexShader:'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vN;void main(){float i=pow(0.72-dot(vN,vec3(0.0,0.0,1.0)),3.0);gl_FragColor=vec4(0.18,0.55,1.0,1.0)*i;}'}));world.add(atmosphere);
 createMarker();
}
function createCloudTexture(){
 const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d');x.clearRect(0,0,1024,512);
 for(let i=0;i<850;i++){const px=Math.random()*1024,py=Math.random()*512,r=6+Math.random()*40,a=.015+Math.random()*.045;const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,255,255,'+a+')');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2)}
 return new THREE.CanvasTexture(c);
}
function createLights(){scene.add(new THREE.AmbientLight(0x314050,.42));const sun=new THREE.DirectionalLight(0xfff2d0,3.4);sun.position.set(5,2.2,4);scene.add(sun);const rim=new THREE.DirectionalLight(0x4a8bd8,1.2);rim.position.set(-4,-1,-3);scene.add(rim)}
function latLonVector(lat,lon,r=1.59){const phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta))}
function createMarker(){
 const g=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.045,.008,12,40),new THREE.MeshBasicMaterial({color:0x7ff7ff,transparent:true,opacity:.95}));ring.rotation.x=Math.PI/2;g.add(ring);
 const dot=new THREE.Mesh(new THREE.SphereGeometry(.018,16,12),new THREE.MeshBasicMaterial({color:0xffffff}));g.add(dot);marker=g;world.add(marker);updateMarker();
}
function updateMarker(){
 if(!marker)return;const p=latLonVector(selected.lat,selected.lon);marker.position.copy(p);marker.lookAt(p.clone().multiplyScalar(2));marker.visible=!(scaleMode==='ga'&&destination.ga>4.6);
}
function focusLocation(){
 autoRotate=false;const lat=selected.lat*Math.PI/180,lon=selected.lon*Math.PI/180;
 targetRotation={x:-lat*.88,y:(lon*Math.PI/180)+Math.PI/2};updateMarker();
}
function bindGlobeInput(){
 const c=renderer.domElement;
 c.addEventListener('pointerdown',e=>{drag=true;autoRotate=false;lastX=e.clientX;lastY=e.clientY;c.setPointerCapture?.(e.pointerId)});
 c.addEventListener('pointermove',e=>{if(!drag)return;world.rotation.y+=(e.clientX-lastX)*.005;world.rotation.x+=(e.clientY-lastY)*.004;world.rotation.x=Math.max(-1.35,Math.min(1.35,world.rotation.x));lastX=e.clientX;lastY=e.clientY});
 c.addEventListener('pointerup',()=>drag=false);
 c.addEventListener('wheel',e=>{e.preventDefault();camera.position.z=Math.max(3.0,Math.min(8.5,camera.position.z+e.deltaY*.003))},{passive:false});
}
$('#resetCamera').onclick=()=>{autoRotate=true;targetRotation=null;camera.position.z=5.4;world.rotation.x=.1};

function makePaleoTexture(age){
 const c=document.createElement('canvas');c.width=2048;c.height=1024;const x=c.getContext('2d');
 x.fillStyle=age>1000?'#243a4b':'#173f63';x.fillRect(0,0,c.width,c.height);
 x.fillStyle=age>1000?'#705843':'#5d7748';
 function blob(cx,cy,rx,ry,phase=0){x.beginPath();for(let a=0;a<=Math.PI*2+.1;a+=.08){const rr=1+.12*Math.sin(a*5+phase)+.07*Math.sin(a*9-phase);const px=cx+Math.cos(a)*rx*rr,py=cy+Math.sin(a)*ry*rr;a===0?x.moveTo(px,py):x.lineTo(px,py)}x.closePath();x.fill()}
 if(age>=180){blob(1000,510,430,250,.4);blob(1440,580,110,90,1.1)}
 else if(age>=60){blob(780,410,260,220,.3);blob(1240,450,300,220,1);blob(1600,600,130,100,.8);blob(600,700,100,150,2)}
 else{blob(640,390,250,190,.2);blob(1120,380,300,190,1.4);blob(1500,580,220,150,2.2);blob(700,700,110,170,1)}
 const t=new THREE.CanvasTexture(c);if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;return t;
}
function makeYoungEarthTexture(){
 const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d');x.fillStyle='#24130e';x.fillRect(0,0,1024,512);
 for(let i=0;i<900;i++){const px=Math.random()*1024,py=Math.random()*512,r=3+Math.random()*28;const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,200,80,'+(.22+Math.random()*.35)+')');g.addColorStop(.4,'rgba(220,70,20,.22)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2)}
 const t=new THREE.CanvasTexture(c);if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;return t;
}
let epochTexture=null;
function applyEpochVisuals(){
 if(!earth)return;
 const c=confidence();$('#confidenceDot').style.background=c.color;$('#confidenceText').textContent=c.text;
 if(epochTexture){epochTexture.dispose?.();epochTexture=null}
 world.visible=true;earth.visible=true;clouds.visible=true;atmosphere.visible=true;nightLayer.visible=true;marker.visible=true;
 earth.material.color.set(0xffffff);earth.material.emissive?.set?.(0x000000);clouds.material.opacity=.4;atmosphere.material.opacity=1;
 if(scaleMode==='calendar'){
   nightLayer.material.opacity=destination.year>=1950?Math.min(.34,(destination.year-1950)/76*.34):0;
   clouds.material.opacity=.4;
   if(destination.year<0){earth.material.color.set(0xd5dfc8)}
   updateMarker();return;
 }
 if(scaleMode==='ma'){
   nightLayer.material.opacity=0;marker.visible=false;
   if(destination.ma<=.05){
     earth.material.color.set(0xe4edf4);
     clouds.material.opacity=.5;
   }else{
     epochTexture=makePaleoTexture(destination.ma);earth.material.map=epochTexture;earth.material.needsUpdate=true;clouds.material.opacity=.28;
   }
   return;
 }
 if(destination.ga<=4.6){
   nightLayer.material.opacity=0;marker.visible=false;clouds.visible=false;epochTexture=makeYoungEarthTexture();earth.material.map=epochTexture;earth.material.needsUpdate=true;atmosphere.material.opacity=.6;return;
 }
 // Before Earth: hide planet and emphasize star field/nebula
 world.visible=false;starField.material.opacity=.95;
}
function restoreDayTexture(){
 const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');loader.load(DAY_URL,t=>{if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;earth.material.map=t;earth.material.needsUpdate=true});
}

$('#placeForm').addEventListener('submit',async e=>{
 e.preventDefault();const q=$('#placeInput').value.trim(),box=$('#placeResults');if(!q)return;
 box.classList.remove('hidden');box.innerHTML='<button>Ricerca…</button>';
 try{
  const d=await(await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=it&countrycodes=it&q='+encodeURIComponent(q))).json();
  box.innerHTML='';if(!d.length){box.innerHTML='<button>Nessun luogo trovato</button>';return}
  d.forEach(x=>{const b=document.createElement('button');b.innerHTML='<b>'+x.display_name.split(',')[0]+'</b><small>'+x.display_name+'</small>';b.onclick=()=>{selected={name:x.display_name.split(',')[0],lat:+x.lat,lon:+x.lon};box.classList.add('hidden');updateUI();updateMarker();focusLocation()};box.appendChild(b)})
 }catch{box.innerHTML='<button>Ricerca non disponibile</button>'}
});

function setSpeed(v){$('#mph').textContent=Math.round(v);$('#needle').style.transform='rotate('+(132+Math.min(88,v)/88*276)+'deg)'}
function playWhoosh(){
 try{const AC=window.AudioContext||window.webkitAudioContext,ctx=new AC(),master=ctx.createGain();master.gain.value=.05;master.connect(ctx.destination);const o=ctx.createOscillator(),g=ctx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(34,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(180,ctx.currentTime+3);g.gain.setValueAtTime(.04,ctx.currentTime);g.gain.linearRampToValueAtTime(.3,ctx.currentTime+2.5);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+4.5);o.connect(g);g.connect(master);o.start();o.stop(ctx.currentTime+4.6)}catch{}
}
$('#launch').onclick=()=>{
 const fx=$('#travelFx');fx.classList.add('on');$('.fluxCore').classList.add('active');$('#fluxState').textContent='CHARGING';$('#travelTarget').textContent=(scaleMode==='calendar'?selected.name.toUpperCase()+' · ':'')+targetLabel().toUpperCase();playWhoosh();
 const start=performance.now(),dur=4600;autoRotate=false;
 const tick=now=>{const t=Math.min(1,(now-start)/dur),mph=88*Math.min(1,t/.62);setSpeed(mph);$('#travelSpeed').textContent=Math.round(mph)+' MPH';
   if(t<.62)$('#travelPhase').textContent='ACCELERAZIONE TEMPORALE';
   else if(t<.78){$('#travelPhase').textContent='FLUSSO TEMPORALE ATTIVO';$('#fluxState').textContent='ACTIVE'}
   else if(t<.91){$('#travelPhase').textContent='ATTRAVERSAMENTO';fx.classList.add('flash')}
   else $('#travelPhase').textContent='ARRIVO';
   if(world)world.rotation.y+=.055+t*.08;
   if(t<1)requestAnimationFrame(tick);else{
     fx.classList.remove('on','flash');$('.fluxCore').classList.remove('active');$('#fluxState').textContent='STABLE';setSpeed(0);
     if(scaleMode!=='calendar'||destination.year<1900)restoreDayTexture();
     applyEpochVisuals();if(world.visible)focusLocation();
     $('#eraTitle').textContent=(scaleMode==='calendar'?selected.name.toUpperCase()+' · ':'')+targetLabel().toUpperCase();$('#eraSub').textContent=confidence().text;$('#eraBanner').classList.add('show');setTimeout(()=>$('#eraBanner').classList.remove('show'),2600);
   }
 };requestAnimationFrame(tick);
};

$('#infoBtn').onclick=()=>{
 const c=confidence();$('#infoBody').textContent=scaleMode==='calendar'
 ?'Per le epoche storiche la forma dei continenti resta sostanzialmente quella moderna. L’app riduce gli indicatori di urbanizzazione e le luci artificiali; non presenta immagini satellitari moderne come fotografie del passato.'
 :scaleMode==='ma'
 ?'Per milioni di anni fa viene usata una paleogeografia schematica per rendere visibile la deriva dei continenti. Non è una ricostruzione geologica al chilometro.'
 :'Prima di circa 4,54 miliardi di anni fa la Terra non esisteva ancora: il globo viene quindi rimosso e la scena passa a una visualizzazione cosmologica.';
 $('#infoDrawer').classList.add('open');
};
$('#closeInfo').onclick=()=>$('#infoDrawer').classList.remove('open');

function animate(){
 requestAnimationFrame(animate);const dt=Math.min(.04,clock.getDelta());
 if(world?.visible){
   if(autoRotate)world.rotation.y+=dt*.075;
   if(targetRotation){
     world.rotation.x+=((targetRotation.x)-world.rotation.x)*.035;
     world.rotation.y+=((targetRotation.y)-world.rotation.y)*.035;
     if(Math.abs(targetRotation.y-world.rotation.y)<.002)targetRotation=null;
   }
   clouds.rotation.y+=dt*.012;
   marker.rotation.z+=dt*1.2;
 }
 starField.rotation.y+=dt*.0025;
 renderer.render(scene,camera);
}
addEventListener('resize',()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight)});

init();updateUI();setScale('calendar');applyEpochVisuals();
