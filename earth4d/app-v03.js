
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const ERAS=[
{p:0,year:-10000,title:'Italia preistorica',kind:'scientific',desc:'Territorio molto meno urbanizzato, con comunità umane disperse e paesaggi dominati da ambienti naturali.',urban:.04,roads:0,rail:0,modern:0},
{p:85,year:-500,title:'Popoli dell’Italia antica',kind:'history',desc:'Etruschi, popolazioni italiche e colonie greche occupano aree diverse della penisola.',urban:.12,roads:.08,rail:0,modern:0},
{p:185,year:117,title:'Italia romana',kind:'history',desc:'La rete urbana e viaria romana struttura fortemente la penisola.',urban:.24,roads:1,rail:0,modern:0},
{p:360,year:1200,title:'Comuni e città medievali',kind:'history',desc:'Città murate, comuni, repubbliche e poteri territoriali formano una penisola molto frammentata.',urban:.31,roads:.24,rail:0,modern:0},
{p:500,year:1500,title:'Rinascimento',kind:'history',desc:'Numerosi centri italiani crescono come poli politici, commerciali e culturali.',urban:.39,roads:.3,rail:0,modern:0},
{p:650,year:1861,title:'Unificazione italiana',kind:'history',desc:'La penisola entra nella fase dello Stato unitario, mentre iniziano grandi trasformazioni infrastrutturali.',urban:.5,roads:.35,rail:.28,modern:.04},
{p:730,year:1910,title:'Italia industriale',kind:'history',desc:'Ferrovie, porti e poli industriali accelerano la crescita di molte città.',urban:.59,roads:.38,rail:.62,modern:.08},
{p:805,year:1950,title:'Dopoguerra',kind:'history',desc:'Ricostruzione e urbanizzazione preparano la forte espansione metropolitana del secondo Novecento.',urban:.68,roads:.46,rail:.75,modern:.28},
{p:900,year:2000,title:'Italia contemporanea',kind:'current',desc:'Aree metropolitane, autostrade e reti moderne definiscono gran parte del territorio abitato.',urban:.9,roads:.42,rail:.9,modern:.88},
{p:945,year:2026,title:'Italia oggi',kind:'current',desc:'La base cartografica è moderna; i layer temporali mostrano come cambia la simulazione.',urban:1,roads:.4,rail:1,modern:1},
{p:980,year:2050,title:'Scenario Italia 2050',kind:'future',desc:'Scenario dimostrativo: crescita urbana e infrastrutture sono simulazioni, non previsioni certe.',urban:1.08,roads:.35,rail:1.05,modern:1.12},
{p:1000,year:2100,title:'Scenario Italia 2100',kind:'future',desc:'Scenario visuale esplorativo. I risultati futuri dipendono dalle ipotesi che verranno selezionate.',urban:1.13,roads:.3,rail:1.1,modern:1.2}
];
const CITIES=[
{name:'Milano',lat:45.4642,lon:9.19,start:-500,base:16},{name:'Roma',lat:41.9028,lon:12.4964,start:-800,base:19},{name:'Firenze',lat:43.7696,lon:11.2558,start:-100,base:13},{name:'Venezia',lat:45.4408,lon:12.3155,start:500,base:11},{name:'Napoli',lat:40.8518,lon:14.2681,start:-600,base:15},{name:'Torino',lat:45.0703,lon:7.6869,start:-50,base:12},{name:'Bologna',lat:44.4949,lon:11.3426,start:-500,base:11},{name:'Genova',lat:44.4056,lon:8.9463,start:-500,base:12},{name:'Palermo',lat:38.1157,lon:13.3615,start:-700,base:13},{name:'Sassari',lat:40.7259,lon:8.5557,start:1100,base:8}
];
const ROMAN=[
[[45.464,9.19],[44.4949,11.3426],[43.7696,11.2558],[41.9028,12.4964]],
[[45.0703,7.6869],[45.4642,9.19],[44.4056,8.9463]],
[[41.9028,12.4964],[40.8518,14.2681],[40.63,15.8],[40.2,16.6]],
[[41.9028,12.4964],[42.4,13.3],[43.3,13.7],[44.5,11.34]]
];
const MEDIEVAL=[
[[45.4642,9.19],[45.4408,12.3155]],[[45.4642,9.19],[44.4949,11.3426],[43.7696,11.2558]],
[[44.4056,8.9463],[43.7696,11.2558],[41.9028,12.4964]],[[40.8518,14.2681],[41.9028,12.4964]]
];
const RAIL=[
[[45.0703,7.6869],[45.4642,9.19],[45.4408,12.3155]],[[45.4642,9.19],[44.4949,11.3426],[43.7696,11.2558],[41.9028,12.4964],[40.8518,14.2681]],
[[44.4056,8.9463],[45.4642,9.19]],[[38.1157,13.3615],[37.5,14.0],[37.5,15.1]]
];
const HIGHWAYS=[
[[45.0703,7.6869],[45.4642,9.19],[44.4949,11.3426],[43.7696,11.2558],[41.9028,12.4964],[40.8518,14.2681]],
[[44.4056,8.9463],[45.4642,9.19],[45.4408,12.3155]]
];
const map=L.map('map',{zoomControl:true,minZoom:5,maxZoom:18,maxBounds:[[35.0,5.0],[48.5,20.5]],maxBoundsViscosity:.8}).setView([42.7,12.5],6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
const sim=L.layerGroup().addTo(map), lines=L.layerGroup().addTo(map), cityLayer=L.layerGroup().addTo(map);
let selected={name:'Milano',lat:45.4642,lon:9.19}, position=360, speed=1, playing=false, playFrame=0, lastTs=0, streetBuilt=false;
function fmtYear(y){if(y<0)return Math.abs(Math.round(y)).toLocaleString('it-IT')+' a.C.';return Math.round(y).toLocaleString('it-IT')+' d.C.'}
function interpolate(p){
 let a=ERAS[0],b=ERAS[ERAS.length-1];for(let k=0;k<ERAS.length-1;k++){if(p>=ERAS[k].p&&p<=ERAS[k+1].p){a=ERAS[k];b=ERAS[k+1];break}}
 const t=a===b?0:(p-a.p)/(b.p-a.p), mix=(x,y)=>x+(y-x)*t;
 return {a,b,t,year:mix(a.year,b.year),urban:mix(a.urban,b.urban),roads:mix(a.roads,b.roads),rail:mix(a.rail,b.rail),modern:mix(a.modern,b.modern)}
}
function eraAt(p){let best=ERAS[0];for(const e of ERAS)if(Math.abs(e.p-p)<Math.abs(best.p-p))best=e;return best}
function bell(year,start,end,fade=350){if(year<start-fade||year>end+fade)return 0;if(year<start)return (year-(start-fade))/fade;if(year>end)return 1-(year-end)/fade;return 1}
function polySet(group,arr,style,opacity){if(opacity<=.01)return;arr.forEach(points=>L.polyline(points,{...style,opacity}).addTo(group))}
function render(){
 const s=interpolate(position), e=eraAt(position), year=s.year;
 $('#eraTitle').textContent=e.title;$('#eraYear').textContent=fmtYear(year);$('#eraDesc').textContent=e.desc;$('#eraRead').textContent=fmtYear(year)+' · '+e.title;$('#slider').value=position;
 const badge=$('#badge');badge.textContent=e.kind==='future'?'SCENARIO FUTURO':e.kind==='current'?'MAPPA ATTUALE + SIMULAZIONE':'RICOSTRUZIONE TEMPORALE';badge.className='badge '+(e.kind==='future'?'future':e.kind==='history'?'history':'');
 $('#selected').textContent='📍 '+selected.name;
 $('#urbanStat').textContent=Math.round(s.urban*100)+'%';$('#roadStat').textContent=Math.round(Math.max(s.roads,s.modern)*100)+'%';$('#railStat').textContent=Math.round(s.rail*100)+'%';
 $('#warning').textContent=e.kind==='future'?'Il futuro è simulato: non viene presentato come previsione.':'I layer storici della v0.3 sono un prototipo visuale: non rappresentano ancora una ricostruzione cartografica validata edificio per edificio.';
 const tint=$('#eraTint');let c='rgba(137,92,45,'+(Math.max(0,.18-s.modern*.15))+')';if(year<0)c='rgba(84,102,58,.13)';if(e.kind==='future')c='rgba(95,75,180,.11)';tint.style.background=c;
 lines.clearLayers();cityLayer.clearLayers();sim.clearLayers();
 polySet(lines,ROMAN,{color:'#e7bd7b',weight:3,dashArray:'8 7'},bell(year,-500,650,500)*s.roads);
 polySet(lines,MEDIEVAL,{color:'#d6a865',weight:2.5,dashArray:'4 6'},bell(year,800,1650,300)*.75);
 polySet(lines,RAIL,{color:'#d9e2ec',weight:2,dashArray:'2 5'},Math.min(1,s.rail));
 polySet(lines,HIGHWAYS,{color:'#76bbd3',weight:3},Math.max(0,s.modern-.15));
 CITIES.forEach(c=>{
   if(year<c.start-250)return;
   const age=Math.max(0,Math.min(1,(year-c.start+250)/700));
   const r=Math.max(2,c.base*(.23+.77*s.urban)*(.35+.65*age));
   const color=e.kind==='future'?'#c8a7ff':year<1700?'#ffd08a':'#8ef4cf';
   const m=L.circleMarker([c.lat,c.lon],{radius:r,color,weight:1.4,fillColor:color,fillOpacity:.12+.26*Math.min(1,s.urban)}).addTo(cityLayer);
   m.bindTooltip(c.name,{permanent:map.getZoom()>=7,direction:'top',className:'cityLabel'});
   m.on('click',()=>{selected={name:c.name,lat:c.lat,lon:c.lon};map.flyTo([c.lat,c.lon],12,{duration:.7});render()});
 });
 if(year>1050&&year<1650&&selected.name==='Milano'){
   L.circle([45.4642,9.19],{radius:1750,color:'#ffd08a',weight:3,dashArray:'7 5',fillColor:'#e0b36b',fillOpacity:.06}).addTo(sim);
 }
}
map.on('zoomend',render);
$('#slider').addEventListener('input',e=>{position=+e.target.value;render()});
$('#prev').onclick=()=>{let idx=ERAS.findIndex(e=>e.p>=position-1);idx=Math.max(0,idx-1);position=ERAS[idx].p;render()};
$('#next').onclick=()=>{let idx=ERAS.findIndex(e=>e.p>position+1);if(idx<0)idx=ERAS.length-1;position=ERAS[idx].p;render()};
function play(ts){if(!playing)return;if(!lastTs)lastTs=ts;let dt=(ts-lastTs)/1000;lastTs=ts;position+=dt*18*speed;if(position>=1000){position=1000;playing=false;$('#play').textContent='▶';render();return}render();playFrame=requestAnimationFrame(play)}
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Ⅱ':'▶';lastTs=0;if(playing)playFrame=requestAnimationFrame(play);else cancelAnimationFrame(playFrame)};
$$('.speed button').forEach(b=>b.onclick=()=>{speed=+b.dataset.s;$$('.speed button').forEach(x=>x.classList.toggle('on',x===b))});
$('#today').onclick=()=>{position=945;render();map.flyTo([42.7,12.5],6,{duration:.6})};
$('#info').onclick=()=>$('#drawer').classList.add('open');$('#close').onclick=()=>$('#drawer').classList.remove('open');
$('#search').onsubmit=async ev=>{ev.preventDefault();let q=$('#q').value.trim(),box=$('#results');if(!q)return;box.classList.remove('hidden');box.innerHTML='<button>Ricerca in Italia…</button>';try{let url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=it&countrycodes=it&q='+encodeURIComponent(q);let data=await(await fetch(url)).json();box.innerHTML='';if(!data.length)box.innerHTML='<button>Nessun luogo trovato in Italia</button>';data.forEach(x=>{let b=document.createElement('button');b.innerHTML='<b>'+x.display_name.split(',')[0]+'</b><small>'+x.display_name+'</small>';b.onclick=()=>{selected={name:x.display_name.split(',')[0],lat:+x.lat,lon:+x.lon};box.classList.add('hidden');map.flyTo([selected.lat,selected.lon],12,{duration:.7});render()};box.appendChild(b)})}catch{box.innerHTML='<button>Ricerca temporaneamente non disponibile</button>'}};
$('#mapMode').onclick=()=>map.flyTo([42.7,12.5],6,{duration:.6});$('#cityMode').onclick=()=>map.flyTo([selected.lat,selected.lon],12,{duration:.6});
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
let scene,camera,renderer,clock,yaw=0,pitch=0,keys={},drag=false,lastX=0,lastY=0,streetAnim=0,objects=[];
function loadThree(){return new Promise((resolve,reject)=>{if(window.THREE)return resolve();let s=document.createElement('script');s.src=THREE_URL;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
function mat(color,rough=.85){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:.05})}
function addBox(x,y,z,w,h,d,color){let m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y+h/2,z);scene.add(m);objects.push(m);return m}
function clearStreet(){objects.forEach(o=>scene.remove(o));objects=[]}
function buildStreet(){
 clearStreet();const y=interpolate(position).year,e=eraAt(position);
 scene.background=new THREE.Color(e.kind==='future'?0x0b1024:y<500?0x9eb0a4:y<1700?0x8b99a0:0xaeb9c3);
 scene.fog=new THREE.Fog(scene.background.getHex(),35,120);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),mat(y<1900?0x605447:0x35383b));ground.rotation.x=-Math.PI/2;scene.add(ground);objects.push(ground);
 const road=new THREE.Mesh(new THREE.PlaneGeometry(y<1900?8:11,210),mat(y<1900?0x796b59:0x27292c));road.rotation.x=-Math.PI/2;road.position.y=.012;scene.add(road);objects.push(road);
 for(let side of [-1,1])for(let n=-9;n<=9;n++){
   const z=n*10, dist=y<1500?6.2:y<1950?7.5:9.5, x=side*dist;
   let h,w,d,col;
   if(y<500){h=4.5+(n%3+3)%3;w=6.5;d=7;col=[0xc9b78e,0xb9a77f,0xd0c09d][Math.abs(n)%3]}
   else if(y<1600){h=7+(Math.abs(n)%4);w=7;d=8;col=[0x8d6f54,0xa78463,0x735d49,0xb29a77][Math.abs(n)%4]}
   else if(y<1900){h=9+(Math.abs(n)%4);w=7.4;d=8;col=[0xc2ad8e,0xd2c0a4,0x9f8d78][Math.abs(n)%3]}
   else if(y<2035){h=12+(Math.abs(n)%5)*2;w=8;d=9;col=[0x9fa7ab,0xc1b8a9,0x8f969b][Math.abs(n)%3]}
   else{h=18+(Math.abs(n)%6)*3;w=8.5;d=9;col=[0x55677d,0x7482a1,0x536f72][Math.abs(n)%3]}
   const b=addBox(x,0,z,w,h,d,col);
   if(y<1700){let roof=new THREE.Mesh(new THREE.ConeGeometry(w*.72,2.1,4),mat(0x623e2d));roof.rotation.y=Math.PI/4;roof.position.set(x,h+1,z);scene.add(roof);objects.push(roof)}
   for(let f=2;f<h-1;f+=3){for(let xx of [-1.7,1.7]){let win=addBox(x+side*(-w/2-.03),f,z+xx,.08,1.2,1.0,y<1800?0x4b3a27:0xbadfff);}}
 }
 if(y>1850){for(let z=-90;z<90;z+=18){let pole=addBox(-5.3,0,z,.18,5,.18,0x333333);addBox(-5.3,5,z,1.5,.18,.18,0x333333)}}
 if(y<1700){for(let z=-80;z<80;z+=22){addBox(-4.6,0,z,.15,3.5,.15,0x4a3524);let lamp=new THREE.PointLight(0xffb45c,1.4,13);lamp.position.set(-4.6,3.4,z);scene.add(lamp);objects.push(lamp)}}
 camera.position.set(0,1.7,28);yaw=0;pitch=0;
 $('#streetTitle').textContent=selected.name+' · '+fmtYear(y);$('#streetSub').textContent=e.kind==='future'?'Scenario 3D — non previsione':'Ricostruzione 3D procedurale — prototipo non fotografico';
}
function initThree(){
 const host=$('#threeHost');scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,250);renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=false;host.innerHTML='';host.appendChild(renderer.domElement);clock=new THREE.Clock();
 scene.add(new THREE.HemisphereLight(0xddeeff,0x3b2e24,2.4));let sun=new THREE.DirectionalLight(0xffffff,2.4);sun.position.set(20,35,10);scene.add(sun);
 const c=renderer.domElement;c.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;c.setPointerCapture?.(e.pointerId)});c.addEventListener('pointermove',e=>{if(!drag)return;yaw-=(e.clientX-lastX)*.004;pitch-=(e.clientY-lastY)*.003;pitch=Math.max(-1.25,Math.min(1.25,pitch));lastX=e.clientX;lastY=e.clientY});c.addEventListener('pointerup',()=>drag=false);
 addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);buildStreet();animateStreet()
}
function animateStreet(){
 if(!renderer)return;let dt=Math.min(.04,clock.getDelta()),f=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0),st=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),spd=5.5;
 let forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));camera.position.addScaledVector(forward,f*spd*dt);camera.position.addScaledVector(right,st*spd*dt);camera.position.x=Math.max(-4.2,Math.min(4.2,camera.position.x));camera.position.z=Math.max(-98,Math.min(98,camera.position.z));camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;renderer.render(scene,camera);streetAnim=requestAnimationFrame(animateStreet)
}
$$('.mobilePad button').forEach(b=>{let k=b.dataset.k;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true});['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>keys[k]=false))});
async function enterStreet(){try{await loadThree();$('#street').classList.add('active');if(!streetBuilt){initThree();streetBuilt=true}else buildStreet()}catch{$('#streetSub').textContent='Il motore 3D non è riuscito a caricarsi su questo dispositivo.'}}
$('#streetBtn').onclick=enterStreet;$('#closeStreet').onclick=()=>$('#street').classList.remove('active');
addEventListener('resize',()=>{map.invalidateSize();if(renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}});
const marks=$('#milestones');ERAS.forEach(e=>{let s=document.createElement('span');s.style.left=e.p/10+'%';s.textContent=e.year<0?Math.abs(e.year/1000)+'k a.C.':e.year;s.title=e.title;marks.appendChild(s)});
position=360;render();
