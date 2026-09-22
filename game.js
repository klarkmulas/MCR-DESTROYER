import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

const $ = (s) => document.querySelector(s);
const ui = {
  loading: $('#loading'), start: $('#start'), resume: $('#resume'), hud: $('#hud'),
  bar: $('#progressBar'), pct: $('#progressText'), damage: $('#damage'), destroyed: $('#destroyed'),
  total: $('#total'), combo: $('#combo'), timer: $('#timer'), message: $('#message'), help: $('#help'),
  mobile: $('#mobileControls')
};

const gameEl = $('#game');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

let renderer, scene, camera, clock, world, player, playerModel, mixer;
let actions = {}, activeAction = null;
let characterRig = null, walkCycle = 0;
let cameraYaw = 0, cameraPitch = -0.16, cameraDistance = 5.2;
let pointerLocked = false, gameStarted = false;
let attackT = 0, attackHitDone = false, attacking = false;
let jumpVelocity = 0, grounded = true;
let lastTime = performance.now();
let roomResetVersion = 0;

const keys = new Set();
const destructibles = [];
const physicsItems = [];
const particles = [];
const obstacles = [];
const initialStates = [];
const monitorTextures = {};
let damageTotal = 0, destroyedCount = 0, combo = 1, comboDeadline = 0;
let countdown = 150, countdownStarted = false;
let messageTimer = 0;
let cameraShake = 0;
let currentMoveSpeed = 0;

// --- Renderer / scene -------------------------------------------------------
init();

async function init(){
  renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  gameEl.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1017);
  scene.fog = new THREE.FogExp2(0x0b1017, .012);

  camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, .05, 100);
  clock = new THREE.Clock();

  world = new CANNON.World({gravity: new CANNON.Vec3(0,-9.82,0)});
  world.allowSleep = true;
  world.defaultContactMaterial.friction = .45;
  world.defaultContactMaterial.restitution = .12;
  const floorBody = new CANNON.Body({mass:0, shape:new CANNON.Plane()});
  floorBody.quaternion.setFromEuler(-Math.PI/2,0,0);
  world.addBody(floorBody);

  buildMaterials();
  buildLighting();
  buildRoom();
  buildPlayerFallback();
  buildAudio();
  bindUI();
  setupMobile();

  ui.total.textContent = destructibles.length;
  fakeLoadProgress();
  await loadCharacter();
  finishLoading();
  animate();
}

function buildMaterials(){
  monitorTextures.intact = makeMonitorTexture(false,false);
  monitorTextures.cracked = makeMonitorTexture(true,false);
  monitorTextures.dead = makeMonitorTexture(false,true);
}

function makeMonitorTexture(cracked=false, dead=false){
  const c=document.createElement('canvas'); c.width=512; c.height=288; const g=c.getContext('2d');
  if(dead){
    const grad=g.createLinearGradient(0,0,512,288); grad.addColorStop(0,'#05080c');grad.addColorStop(1,'#131920');g.fillStyle=grad;g.fillRect(0,0,512,288);
    g.fillStyle='#18232e'; for(let y=20;y<288;y+=22) g.fillRect(0,y,512,1);
  }else{
    g.fillStyle='#061019';g.fillRect(0,0,512,288);
    const cellsX=4,cellsY=3,w=512/cellsX,h=288/cellsY;
    const cols=['#1e6d9e','#1d7d66','#815728','#5f3e8c','#8a3048','#1a566e','#386d33','#404e9a'];
    for(let y=0;y<cellsY;y++) for(let x=0;x<cellsX;x++){
      const i=x+y*cellsX; g.fillStyle=cols[(i*3+Math.floor(Math.random()*cols.length))%cols.length];
      g.fillRect(x*w+2,y*h+2,w-4,h-4);
      g.fillStyle='rgba(255,255,255,.16)';
      for(let k=0;k<6;k++) g.fillRect(x*w+10, y*h+12+k*9, Math.random()*(w-30), 2);
      if((x+y)%3===0){g.fillStyle='#39ff78';g.fillRect(x*w+8,y*h+h-16,w*.55,5)}
      if((x+y)%4===0){g.fillStyle='#ff3c5d';g.fillRect(x*w+w*.62,y*h+h-16,w*.26,5)}
    }
    g.fillStyle='rgba(0,0,0,.36)';g.fillRect(0,0,512,20);
    g.fillStyle='#dff4ff';g.font='bold 12px sans-serif';g.fillText('MCR  //  MULTIVIEW  //  ON AIR',12,14);
  }
  if(cracked){
    g.strokeStyle='rgba(235,247,255,.9)';g.lineWidth=2;
    const cx=280,cy=140;
    for(let a=0;a<14;a++){
      const ang=(a/14)*Math.PI*2 + (a%3)*.09;
      g.beginPath();g.moveTo(cx,cy);
      let px=cx,py=cy;
      for(let s=1;s<5;s++){
        px+=Math.cos(ang)*(18+Math.random()*28);py+=Math.sin(ang)*(12+Math.random()*20);
        g.lineTo(px,py);
      }g.stroke();
    }
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

function buildLighting(){
  scene.add(new THREE.AmbientLight(0xaec9ff,.42));
  scene.add(new THREE.HemisphereLight(0xb3d2ff,0x2b170d,.98));

  const key=new THREE.DirectionalLight(0xe3efff,2.2);
  key.position.set(4.5,10,3.5);
  key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.left=-18;key.shadow.camera.right=18;key.shadow.camera.top=14;key.shadow.camera.bottom=-14;
  scene.add(key);

  for(let i=0;i<7;i++){
    const l=new THREE.SpotLight(0xffddb5,42,10,Math.PI/6,.45,1.35);
    l.position.set(-12+i*4,4.7,0.5+(i%2)*2);
    l.target.position.set(-12+i*4,0,0);
    scene.add(l,l.target);
  }

  const wallGlow=new THREE.RectAreaLight(0x64b7ff,40,13,4.2);
  wallGlow.position.set(0,3.1,-7.35);
  wallGlow.rotation.y=Math.PI;
  scene.add(wallGlow);

  const fillA=new THREE.PointLight(0x5ba8ff,26,24,2);
  fillA.position.set(-2.5,2.7,1.2);
  scene.add(fillA);
  const fillB=new THREE.PointLight(0x66b7ff,24,24,2);
  fillB.position.set(4.8,2.5,-2.6);
  scene.add(fillB);
  const fillC=new THREE.PointLight(0x7fc7ff,22,28,2);
  fillC.position.set(0,2.4,-5.7);
  scene.add(fillC);
}


function box(w,h,d,mat,pos=[0,0,0],cast=true){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(...pos);m.castShadow=cast;m.receiveShadow=true;scene.add(m);return m;
}
function cyl(r1,r2,h,mat,pos=[0,0,0],rot=[0,0,0]){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,16),mat);m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
}

function buildRoom(){
  const floorMat=new THREE.MeshPhysicalMaterial({color:0x20140f,roughness:.28,metalness:.05,clearcoat:.65,clearcoatRoughness:.15});
  const dark=new THREE.MeshStandardMaterial({color:0x11151b,roughness:.5,metalness:.42});
  const black=new THREE.MeshStandardMaterial({color:0x080b10,roughness:.42,metalness:.35});
  const metal=new THREE.MeshStandardMaterial({color:0x3e4650,roughness:.35,metalness:.78});
  const deskMat=new THREE.MeshStandardMaterial({color:0x11161d,roughness:.38,metalness:.38});
  const glass=new THREE.MeshPhysicalMaterial({color:0x9dbfd4,transparent:true,opacity:.16,roughness:.04,metalness:0,transmission:.52,thickness:.1});

  const floor=box(28,.25,18,floorMat,[0,-.13,0],false);floor.receiveShadow=true;
  box(28,.18,18,black,[0,5.15,0],false);
  box(28,5.2,.25,dark,[0,2.5,-8.9]);
  box(.25,5.2,18,dark,[-14,2.5,0]);box(.25,5.2,18,dark,[14,2.5,0]);

  // ceiling grid + light tracks
  for(let x=-12;x<=12;x+=2){ const g=box(.035,.05,17.4,metal,[x,5.02,0],false); }
  for(let z=-7.5;z<=7.5;z+=2){ box(27.4,.05,.035,metal,[0,5.02,z],false); }
  for(let x=-10;x<=10;x+=5){ box(.08,.09,7,metal,[x,4.9,1],false); }

  // glass sides / corridors
  for(let i=0;i<4;i++){
    addGlassPanel(-12.6 + i*2.1,2.2,4.5,1.9,4.1,.08,glass);
    addGlassPanel(12.6 - i*2.1,2.2,4.5,1.9,4.1,.08,glass);
  }
  // columns
  for(const x of [-10.8,10.8]){
    box(1.05,5,1.05,dark,[x,2.5,4.1]); addMcrBadge(x,2.5,4.66,x<0?0:Math.PI);
  }

  // video wall support
  box(15.8,4.35,.38,black,[0,2.85,-8.35]);
  const cols=5,rows=3,sw=2.72,sh=1.38,gap=.11;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const x=(c-(cols-1)/2)*(sw+gap), y=2.15+(rows-1-r)*(sh+gap);
    addMonitor(x,y,-8.05,sw,sh,0,'wall');
  }

  // back technical desk
  addDesk(-4.7,-5.65,4.25,1.15,deskMat,metal,'back-desk-a');
  addDesk(0,-5.65,4.25,1.15,deskMat,metal,'back-desk-b');
  addDesk(4.7,-5.65,4.25,1.15,deskMat,metal,'back-desk-c');
  for(const x of [-5.8,-4.2,-1.2,.8,3.5,5.1]) addDeskMonitor(x,1.35,-5.55,.9,.58);
  for(const x of [-3.3,0,3.2]) addKeyboard(x,.87,-5.25);

  // front desk cluster
  addDesk(-4.1,1.25,6.7,1.55,deskMat,metal,'front-main');
  addDesk(2.25,.35,4.5,1.35,deskMat,metal,'front-right');
  for(const p of [[-6,1.35],[-4.4,1.35],[-2.8,1.35],[-.9,.55],[.6,.45],[2.1,.25]]) addDeskMonitor(p[0],1.45,p[1]-.1,1.03,.68);
  for(const p of [[-5.4,1.1],[-3.6,1.1],[-1.7,1.05],[.6,.15]]) addKeyboard(p[0],.9,p[1]);
  for(const p of [[-5.8,.25],[-3.8,.25],[-1.8,.2],[2.1,-.55]]) addChair(p[0],p[1]);

  // central single workstation
  addDesk(5.25,-2.35,3.1,1.15,deskMat,metal,'center-desk');
  addDeskMonitor(4.7,1.35,-2.25,1.0,.65); addDeskMonitor(5.9,1.35,-2.25,1.0,.65);
  addKeyboard(5.2,.9,-2.02); addChair(5.2,-1.25);

  // rack carts
  addRack(8.1,.0,-3.7); addRack(-7.8,.0,2.9);

  // phones / small gear
  for(const p of [[-4.9,.95],[1.5,.35],[4.3,-5.2],[-1.9,-5.2]]) addPhone(p[0],.9,p[1]);

  // fire extinguisher red prop
  const red=new THREE.MeshStandardMaterial({color:0xa9121d,roughness:.36,metalness:.4});
  cyl(.19,.23,.9,red,[12.4,.48,6.3]);cyl(.13,.13,.25,metal,[12.4,1.02,6.3]);

  // perimeter subtle blue accent lines
  const accent=new THREE.MeshBasicMaterial({color:0x2d79bd,toneMapped:false});
  box(16,.018,.018,accent,[0,.035,-8.05],false);
}

function addMcrBadge(x,y,z,rotY){
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.clearRect(0,0,256,256);g.strokeStyle='#d5dde5';g.lineWidth=7;g.beginPath();g.arc(128,128,85,0,Math.PI*2);g.stroke();g.fillStyle='#e9eef4';g.textAlign='center';g.textBaseline='middle';g.font='bold 52px sans-serif';g.fillText('MCR',128,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false});const p=new THREE.Mesh(new THREE.PlaneGeometry(.8,.8),m);p.position.set(x,y,z);p.rotation.y=rotY;scene.add(p);
}

function addGlassPanel(x,y,z,w,h,d,mat){
  const m=box(w,h,d,mat,[x,y,z]);
  registerDestructible(m,{type:'glass',hp:2,value:1400,breakMode:'remove',radius:1.8});
}

function addDesk(x,z,w,d,deskMat,metal,name){
  const g=new THREE.Group();
  g.position.set(x,0,z);
  scene.add(g);
  const top=new THREE.Mesh(new THREE.BoxGeometry(w,.16,d),deskMat);
  top.position.set(0,.82,0);
  top.castShadow=true;top.receiveShadow=true;
  g.add(top);
  for(const lx of [-w*.43,w*.43]) for(const lz of [-d*.32,d*.32]){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.12,.78,.12),metal);
    leg.position.set(lx,.39,lz);
    leg.castShadow=true;leg.receiveShadow=true;
    g.add(leg);
  }
  registerDestructible(g,{type:'desk',hp:4,value:2600,breakMode:'remove',radius:Math.max(w,d)*.45,name});
  obstacles.push({x,z,w:w*.5+.38,d:d*.5+.38,active:true,owner:g});
}

function addMonitor(x,y,z,w,h,ry=0,kind='desk'){
  const frameMat=new THREE.MeshStandardMaterial({color:0x080a0e,roughness:.32,metalness:.55});
  const group=new THREE.Group();group.position.set(x,y,z);group.rotation.y=ry;scene.add(group);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(w,h,.12),frameMat);frame.castShadow=true;group.add(frame);
  const screenMat=new THREE.MeshBasicMaterial({map:monitorTextures.intact,toneMapped:false});
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(w*.92,h*.86),screenMat);screen.position.z=.066;group.add(screen);
  group.userData.screen=screen;
  if(kind==='desk'){
    const stem=new THREE.Mesh(new THREE.BoxGeometry(.07,.42,.07),frameMat);stem.position.y=-h*.67;group.add(stem);
    const foot=new THREE.Mesh(new THREE.BoxGeometry(.44,.045,.26),frameMat);foot.position.set(0,-h*.88,.06);group.add(foot);
  }
  registerDestructible(group,{type:'monitor',hp:2,value:kind==='wall'?4200:1600,breakMode:'monitor',radius:Math.max(w,h)*.6});
  return group;
}
function addDeskMonitor(x,y,z,w,h){ return addMonitor(x,y,z,w,h,0,'desk'); }

function addChair(x,z){
  const mat=new THREE.MeshStandardMaterial({color:0x0c0f14,roughness:.6,metalness:.22});
  const g=new THREE.Group();scene.add(g);g.position.set(x,.55,z);
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.62,.11,.62),mat);seat.castShadow=true;g.add(seat);
  const back=new THREE.Mesh(new THREE.BoxGeometry(.62,.85,.11),mat);back.position.set(0,.45,.28);back.rotation.x=-.08;back.castShadow=true;g.add(back);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,.6,10),mat);stem.position.y=-.32;g.add(stem);
  const body=addPhysicsBody(g,new CANNON.Box(new CANNON.Vec3(.33,.52,.34)),9,[x,.55,z]);
  registerDestructible(g,{type:'chair',hp:3,value:850,breakMode:'physics',radius:.8,body});
}

function addKeyboard(x,y,z){
  const mat=new THREE.MeshStandardMaterial({color:0x1c2229,roughness:.55,metalness:.15});
  const m=new THREE.Mesh(new THREE.BoxGeometry(.58,.05,.2),mat);m.position.set(x,y,z);m.castShadow=true;scene.add(m);
  const body=addPhysicsBody(m,new CANNON.Box(new CANNON.Vec3(.29,.025,.1)),1.2,[x,y,z]);
  registerDestructible(m,{type:'keyboard',hp:1,value:240,breakMode:'physics',radius:.45,body});
}

function addPhone(x,y,z){
  const mat=new THREE.MeshStandardMaterial({color:0x161b22,roughness:.5,metalness:.25});
  const m=new THREE.Mesh(new THREE.BoxGeometry(.36,.11,.26),mat);m.position.set(x,y,z);m.castShadow=true;scene.add(m);
  const body=addPhysicsBody(m,new CANNON.Box(new CANNON.Vec3(.18,.055,.13)),1.4,[x,y,z]);
  registerDestructible(m,{type:'phone',hp:1,value:360,breakMode:'physics',radius:.35,body});
}

function addRack(x,y,z){
  const mat=new THREE.MeshStandardMaterial({color:0x171c22,roughness:.38,metalness:.72});
  const g=new THREE.Group();g.position.set(x,1,z);scene.add(g);
  const shell=new THREE.Mesh(new THREE.BoxGeometry(1.08,1.82,.82),mat);shell.castShadow=true;g.add(shell);
  for(let i=0;i<6;i++){
    const p=new THREE.Mesh(new THREE.BoxGeometry(.88,.18,.02),new THREE.MeshStandardMaterial({color:i%2?0x111722:0x202937,emissive:i%2?0x06233d:0x001106,emissiveIntensity:.8}));p.position.set(0,.62-i*.25,.421);g.add(p);
  }
  registerDestructible(g,{type:'rack',hp:5,value:5800,breakMode:'remove',radius:1.1});
  obstacles.push({x,z,w:.72,d:.62,active:true,owner:g});
}

function addPhysicsBody(mesh,shape,mass,pos){
  const b=new CANNON.Body({mass,shape,position:new CANNON.Vec3(...pos),linearDamping:.13,angularDamping:.16});b.allowSleep=true;b.sleepSpeedLimit=.15;b.sleepTimeLimit=.7;world.addBody(b);physicsItems.push({mesh,body:b});return b;
}

function registerDestructible(object,opt){
  const d={object,type:opt.type,hp:opt.hp,maxHp:opt.hp,value:opt.value,breakMode:opt.breakMode,radius:opt.radius||1,body:opt.body||null,destroyed:false,originalVisible:true};
  destructibles.push(d);
  object.userData.destructible=d;
  initialStates.push({d,pos:object.position.clone(),quat:object.quaternion.clone(),visible:object.visible,body:opt.body?{pos:opt.body.position.clone(),quat:opt.body.quaternion.clone()}:null});
  return d;
}

// --- Player -----------------------------------------------------------------
function buildPlayerFallback(){
  player=new THREE.Group();player.position.set(0,0,5.6);scene.add(player);
  const suit=new THREE.MeshStandardMaterial({color:0x202b38,roughness:.72});
  const skin=new THREE.MeshStandardMaterial({color:0xc98b69,roughness:.72});
  const shoe=new THREE.MeshStandardMaterial({color:0x090b0f,roughness:.7});
  const body=new THREE.Group();body.name='fallback-human';player.add(body);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.72,6,12),suit);torso.position.y=1.18;torso.castShadow=true;body.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.24,20,16),skin);head.position.y=1.93;head.scale.y=1.1;head.castShadow=true;body.add(head);
  const armGeo=new THREE.CapsuleGeometry(.10,.52,4,9), legGeo=new THREE.CapsuleGeometry(.12,.58,4,9);
  const lArm=new THREE.Mesh(armGeo,suit),rArm=lArm.clone();lArm.position.set(-.43,1.28,0);rArm.position.set(.43,1.28,0);body.add(lArm,rArm);
  const lLeg=new THREE.Mesh(legGeo,suit),rLeg=lLeg.clone();lLeg.position.set(-.17,.47,0);rLeg.position.set(.17,.47,0);body.add(lLeg,rLeg);
  const lf=new THREE.Mesh(new THREE.BoxGeometry(.25,.13,.46),shoe),rf=lf.clone();lf.position.set(-.17,.08,-.09);rf.position.set(.17,.08,-.09);body.add(lf,rf);
  createBat(player,new THREE.Vector3(.46,1.2,-.12),new THREE.Euler(.2,0,-.55));
  player.userData.fallback=body;playerModel=body;
  setupCharacterRig({leftArm:lArm,rightArm:rArm,leftLeg:lLeg,rightLeg:rLeg,leftForeArm:null,rightForeArm:null});
}

function createBat(parent,pos,rot){
  const bat=new THREE.Group();bat.name='BAT';parent.add(bat);bat.position.copy(pos);bat.rotation.copy(rot);
  const wood=new THREE.MeshStandardMaterial({color:0x6b4424,roughness:.38,metalness:.12});
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.045,.07,1.05,14),wood);shaft.position.y=.35;shaft.castShadow=true;bat.add(shaft);
  const grip=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.27,14),new THREE.MeshStandardMaterial({color:0x16191d,roughness:.55}));grip.position.y=-.28;bat.add(grip);
  player.userData.bat=bat;return bat;
}

async function loadCharacter(){
  const loader=new GLTFLoader();
  return new Promise(resolve=>{
    loader.load('https://threejs.org/examples/models/gltf/Soldier.glb',gltf=>{
      const model=gltf.scene;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
      model.scale.setScalar(1.03);player.add(model);
      if(player.userData.fallback) player.userData.fallback.visible=false;
      if(player.userData.bat){ player.remove(player.userData.bat); player.userData.bat=null; }
      playerModel=model;
      mixer=new THREE.AnimationMixer(model);
      for(const clip of gltf.animations){ actions[clip.name.toLowerCase()]=mixer.clipAction(clip); }
      setAction('idle',.01);
      const hand=findBone(model,['RightHand','mixamorigRightHand','Hand_R','hand_r']);
      if(hand){ const bat=createBat(hand,new THREE.Vector3(.02,.12,-.04),new THREE.Euler(Math.PI/2,0,.2)); bat.scale.setScalar(.8); }
      else createBat(player,new THREE.Vector3(.46,1.18,-.12),new THREE.Euler(.2,0,-.55));
      player.userData.upperArm=findBone(model,['RightArm','mixamorigRightArm','UpperArm_R','upperarm_r']);
      setupCharacterRig({
        leftArm: findBone(model,['LeftArm','mixamorigLeftArm','UpperArm_L','upperarm_l']),
        rightArm: findBone(model,['RightArm','mixamorigRightArm','UpperArm_R','upperarm_r']),
        leftForeArm: findBone(model,['LeftForeArm','mixamorigLeftForeArm','LowerArm_L','forearm_l']),
        rightForeArm: findBone(model,['RightForeArm','mixamorigRightForeArm','LowerArm_R','forearm_r']),
        leftLeg: findBone(model,['LeftUpLeg','mixamorigLeftUpLeg','Thigh_L','upleg_l']),
        rightLeg: findBone(model,['RightUpLeg','mixamorigRightUpLeg','Thigh_R','upleg_r'])
      });
      resolve();
    },xhr=>{ if(xhr.total) setLoad(Math.min(92,55+xhr.loaded/xhr.total*35)); },()=>resolve());
  });
}
function findBone(root,names){ let found=null;root.traverse(o=>{if(found)return; if(o.isBone && names.some(n=>o.name.toLowerCase().includes(n.toLowerCase()))) found=o;});return found; }
function setupCharacterRig(parts){
  characterRig = { parts, rest:{} };
  for(const [key,bone] of Object.entries(parts)){
    if(bone) characterRig.rest[key] = bone.rotation.clone();
  }
}
function animateCharacterRig(dt,moving,run){
  if(!characterRig) return;
  const parts = characterRig.parts, rest = characterRig.rest;
  if(moving) walkCycle += dt * (run ? 10.5 : 7.0);
  const swing = moving ? Math.sin(walkCycle) : 0;
  const swingOpp = moving ? Math.sin(walkCycle + Math.PI) : 0;
  const ease = 1 - Math.exp(-10 * dt);
  const legAmp = run ? .95 : .62;
  const armAmp = run ? .72 : .46;
  const foreAmp = run ? .38 : .24;
  const idleBend = .08;

  const setX = (bone,name,target) => {
    if(!bone || !rest[name]) return;
    bone.rotation.x = lerp(bone.rotation.x, rest[name].x + target, ease);
  };
  const setZ = (bone,name,target) => {
    if(!bone || !rest[name]) return;
    bone.rotation.z = lerp(bone.rotation.z, rest[name].z + target, ease);
  };

  setX(parts.leftLeg,'leftLeg', swing * legAmp);
  setX(parts.rightLeg,'rightLeg', swingOpp * legAmp);

  let leftArmTarget = moving ? swingOpp * armAmp : idleBend;
  let rightArmTarget = moving ? swing * armAmp : idleBend;
  let rightForeTarget = moving ? -.15 + Math.max(0, swing) * foreAmp : -.15;

  if(attacking){
    const ap = clamp(attackT / .58, 0, 1);
    const s = Math.sin(ap * Math.PI);
    rightArmTarget = -.25 - s * 1.35;
    rightForeTarget = -.25 - s * .7;
  }

  setX(parts.leftArm,'leftArm', leftArmTarget);
  setX(parts.rightArm,'rightArm', rightArmTarget);
  setX(parts.leftForeArm,'leftForeArm', moving ? -.1 + Math.max(0, swingOpp) * foreAmp : -.1);
  setX(parts.rightForeArm,'rightForeArm', rightForeTarget);

  setZ(parts.leftArm,'leftArm', moving ? -.12 : -.06);
  setZ(parts.rightArm,'rightArm', moving ? .12 : .06);
}
function setAction(name,fade=.15){
  const a=actions[name] || actions[Object.keys(actions).find(k=>k.includes(name))]; if(!a||a===activeAction)return;
  a.reset().fadeIn(fade).play(); if(activeAction)activeAction.fadeOut(fade);activeAction=a;
}

// --- UI / input -------------------------------------------------------------
function bindUI(){
  $('#playBtn').addEventListener('click',startGame);
  $('#resumeBtn').addEventListener('click',()=>renderer.domElement.requestPointerLock?.());
  $('#resetBtn').addEventListener('click',resetRoom);
  $('#closeHelp').addEventListener('click',()=>ui.help.classList.add('hidden'));
  addEventListener('resize',onResize);
  addEventListener('keydown',e=>{
    keys.add(e.code);
    if(e.code==='Space'){e.preventDefault();tryJump()}
    if(e.code==='KeyR') resetRoom();
    if(e.code==='KeyH') ui.help.classList.toggle('hidden');
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  addEventListener('mousedown',e=>{ if(gameStarted && e.button===0 && pointerLocked) attack(); });
  document.addEventListener('pointerlockchange',()=>{
    pointerLocked=document.pointerLockElement===renderer.domElement;
    if(gameStarted && !isTouch) ui.resume.classList.toggle('visible',!pointerLocked);
  });
  addEventListener('mousemove',e=>{
    if(!pointerLocked)return;
    cameraYaw-=e.movementX*.0023;cameraPitch=clamp(cameraPitch-e.movementY*.0017,-.65,.28);
  });
}
function startGame(){
  gameStarted=true;ui.start.classList.remove('visible');ui.hud.classList.remove('hidden');
  if(isTouch){ui.mobile.classList.remove('hidden')} else renderer.domElement.requestPointerLock?.();
}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));}
function finishLoading(){setLoad(100);setTimeout(()=>{ui.loading.classList.remove('visible');ui.start.classList.add('visible')},400)}
function fakeLoadProgress(){let p=4;const id=setInterval(()=>{p=Math.min(54,p+Math.random()*6);setLoad(p);if(p>=54)clearInterval(id)},90)}
function setLoad(n){ui.bar.style.width=`${n}%`;ui.pct.textContent=`${Math.round(n)}%`}

let mobileMove={x:0,y:0};
function setupMobile(){
  if(!isTouch)return;
  const base=$('#joyBase'),knob=$('#joyKnob');let active=false,id=null;
  const update=e=>{const r=base.getBoundingClientRect();const t=[...e.changedTouches].find(t=>t.identifier===id)||e.changedTouches[0];let dx=t.clientX-(r.left+r.width/2),dy=t.clientY-(r.top+r.height/2);const len=Math.hypot(dx,dy),max=42;if(len>max){dx*=max/len;dy*=max/len}mobileMove.x=dx/max;mobileMove.y=dy/max;knob.style.transform=`translate(${dx}px,${dy}px)`};
  base.addEventListener('touchstart',e=>{active=true;id=e.changedTouches[0].identifier;update(e)},{passive:false});
  base.addEventListener('touchmove',e=>{if(active){e.preventDefault();update(e)}},{passive:false});
  base.addEventListener('touchend',()=>{active=false;mobileMove.x=mobileMove.y=0;knob.style.transform='translate(0,0)'});
  $('#attackBtn').addEventListener('touchstart',e=>{e.preventDefault();attack()});
  $('#jumpBtn').addEventListener('touchstart',e=>{e.preventDefault();tryJump()});
  renderer.domElement.addEventListener('touchmove',e=>{
    if(e.touches.length===1 && e.touches[0].clientX>innerWidth*.45){ const t=e.touches[0];const last=renderer.domElement._touchLast||{x:t.clientX,y:t.clientY};cameraYaw-=(t.clientX-last.x)*.005;cameraPitch=clamp(cameraPitch-(t.clientY-last.y)*.004,-.65,.28);renderer.domElement._touchLast={x:t.clientX,y:t.clientY};}
  },{passive:true});
  renderer.domElement.addEventListener('touchend',()=>renderer.domElement._touchLast=null,{passive:true});
}

// --- Gameplay ---------------------------------------------------------------
function tryJump(){if(!gameStarted||!grounded)return;grounded=false;jumpVelocity=5.4;}
function attack(){ if(!gameStarted||attacking)return; attacking=true;attackT=0;attackHitDone=false; if(currentMoveSpeed<.1) orientPlayer(cameraYaw); }
function orientPlayer(yaw){ player.rotation.y=yaw; }

function doHit(){
  const origin=player.position.clone().add(new THREE.Vector3(0,1.15,0));
  const fwd=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),player.rotation.y).normalize();
  let best=null,bestDist=Infinity;
  for(const d of destructibles){
    if(d.destroyed)continue;
    const box3=new THREE.Box3().setFromObject(d.object);const cp=box3.clampPoint(origin,new THREE.Vector3());const dist=cp.distanceTo(origin);if(dist>2.45)continue;
    const dir=cp.clone().sub(origin);const len=dir.length();if(len<.001)continue;dir.normalize();const facing=fwd.dot(dir);if(facing<.15)continue;
    const score=dist-(facing*.7);if(score<bestDist){best=d;bestDist=score}
  }
  if(!best){playSwing();return}
  damageObject(best,fwd);
}

function damageObject(d,fwd){
  d.hp--;cameraShake=.16;countdownStarted=true;
  const now=performance.now();if(now<comboDeadline) combo=Math.min(9,combo+1);else combo=1;comboDeadline=now+1200;showCombo();
  const gain=Math.round(d.value*(d.hp<=0?1:.18)*combo);damageTotal+=gain;ui.damage.textContent='€ '+damageTotal.toLocaleString('it-IT');
  if(d.body){ d.body.wakeUp(); d.body.applyImpulse(new CANNON.Vec3(fwd.x*7,2.8,fwd.z*7),d.body.position); d.body.angularVelocity.set((Math.random()-.5)*7,(Math.random()-.5)*8,(Math.random()-.5)*7); }
  if(d.type==='monitor'){
    if(d.hp===1){d.object.userData.screen.material.map=monitorTextures.cracked;d.object.userData.screen.material.needsUpdate=true;spawnSparks(d.object.getWorldPosition(new THREE.Vector3()));playZap();}
  }
  if(d.type==='glass') playGlass(); else if(d.type!=='monitor') playImpact();
  if(d.hp<=0) destroyObject(d,fwd);
}

function destroyObject(d,fwd){
  d.destroyed=true;destroyedCount++;ui.destroyed.textContent=destroyedCount;
  const p=d.object.getWorldPosition(new THREE.Vector3());
  if(d.type==='monitor'){
    d.object.userData.screen.material.map=monitorTextures.dead;d.object.userData.screen.material.needsUpdate=true;spawnSparks(p);spawnDebris(p,8,0x4f5966,.05);playZap();
  }else if(d.breakMode==='remove'){
    d.object.visible=false;
    spawnDebris(p,d.type==='glass'?16:12,d.type==='glass'?0xbfe8ff:0x2d333a,d.type==='glass'?.035:.08);
    if(d.type==='glass')playGlass(); else playBreak();
  }else{
    d.object.visible=false;
    if(d.body){ d.body.velocity.set(0,0,0); d.body.angularVelocity.set(0,0,0); d.body.position.set(999,-999,999); d.body.sleep(); }
    spawnDebris(p,10,0x2a313b,.06);
    playBreak();
  }
  for(const o of obstacles){if(o.owner===d.object)o.active=false}
  showMessage(`${labelFor(d.type)} distrutto  +€ ${d.value.toLocaleString('it-IT')}`);
  if(destroyedCount===destructibles.length) showMessage('CONTROL ROOM COMPLETAMENTE DEVASTATA');
}
function labelFor(t){return ({monitor:'Monitor',glass:'Vetro',desk:'Banco',chair:'Sedia',keyboard:'Tastiera',phone:'Telefono',rack:'Rack'})[t]||'Oggetto'}
function showCombo(){ui.combo.textContent=`COMBO x${combo}`;ui.combo.classList.add('on');setTimeout(()=>{if(performance.now()>comboDeadline-250)ui.combo.classList.remove('on')},950)}
function showMessage(t){ui.message.textContent=t;ui.message.classList.add('on');clearTimeout(messageTimer);messageTimer=setTimeout(()=>ui.message.classList.remove('on'),1600)}

function resetRoom(){
  roomResetVersion++;damageTotal=0;destroyedCount=0;combo=1;comboDeadline=0;countdown=150;countdownStarted=false;ui.damage.textContent='€ 0';ui.destroyed.textContent='0';ui.timer.textContent='02:30';
  for(const s of initialStates){const d=s.d;d.destroyed=false;d.hp=d.maxHp;d.object.visible=s.visible;d.object.position.copy(s.pos);d.object.quaternion.copy(s.quat);if(d.type==='monitor'){d.object.userData.screen.material.map=monitorTextures.intact;d.object.userData.screen.material.needsUpdate=true}if(d.body&&s.body){d.body.position.copy(s.body.pos);d.body.quaternion.copy(s.body.quat);d.body.velocity.set(0,0,0);d.body.angularVelocity.set(0,0,0);d.body.sleep()}}
  for(const o of obstacles)o.active=true;
  player.position.set(0,0,5.6);jumpVelocity=0;grounded=true;walkCycle=0;showMessage('SALA RIPRISTINATA');
}

// --- Particles --------------------------------------------------------------
function spawnSparks(p){
  for(let i=0;i<10;i++) spawnParticle(p,0xffd85a,.025,new THREE.Vector3((Math.random()-.5)*3,Math.random()*2.5,(Math.random()-.5)*3),.45+.35*Math.random());
}
function spawnDebris(p,n,color,size){
  for(let i=0;i<n;i++) spawnParticle(p,color,size*(.6+Math.random()),new THREE.Vector3((Math.random()-.5)*3,1+Math.random()*3,(Math.random()-.5)*3),1.1+Math.random());
}
function spawnParticle(p,color,size,vel,life){
  const m=new THREE.Mesh(new THREE.BoxGeometry(size,size,size*1.6),new THREE.MeshBasicMaterial({color,toneMapped:false}));m.position.copy(p);scene.add(m);particles.push({m,vel,life,max:life,spin:new THREE.Vector3(Math.random()*6,Math.random()*6,Math.random()*6)});
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){const q=particles[i];q.life-=dt;if(q.life<=0){scene.remove(q.m);q.m.geometry.dispose();q.m.material.dispose();particles.splice(i,1);continue}q.vel.y-=7.5*dt;q.m.position.addScaledVector(q.vel,dt);q.m.rotation.x+=q.spin.x*dt;q.m.rotation.y+=q.spin.y*dt;if(q.m.position.y<.03){q.m.position.y=.03;q.vel.y*=-.25;q.vel.x*=.6;q.vel.z*=.6}q.m.material.opacity=clamp(q.life/.25,0,1);q.m.material.transparent=true}
}

// --- Audio ------------------------------------------------------------------
let audioCtx=null,noiseBuffer=null;
function buildAudio(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  const initAudio=()=>{if(audioCtx)return;audioCtx=new AC();const len=audioCtx.sampleRate*.35;noiseBuffer=audioCtx.createBuffer(1,len,audioCtx.sampleRate);const a=noiseBuffer.getChannelData(0);for(let i=0;i<len;i++)a[i]=Math.random()*2-1;removeEventListener('pointerdown',initAudio)};addEventListener('pointerdown',initAudio);
}
function tone(freq,dur,type='sine',gain=.05){if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}
function noise(dur=.12,gain=.08,cut=1200){if(!audioCtx||!noiseBuffer)return;const s=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();s.buffer=noiseBuffer;f.type='lowpass';f.frequency.value=cut;g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+dur);s.connect(f).connect(g).connect(audioCtx.destination);s.start();s.stop(audioCtx.currentTime+dur)}
function playSwing(){noise(.07,.03,700);tone(100,.08,'sine',.025)}
function playImpact(){noise(.12,.12,800);tone(74,.12,'triangle',.06)}
function playBreak(){noise(.22,.14,1500);tone(58,.18,'sawtooth',.035)}
function playGlass(){noise(.25,.1,5200);tone(1800,.08,'triangle',.04);setTimeout(()=>tone(1100,.09,'triangle',.025),35)}
function playZap(){noise(.08,.035,4200);tone(310,.08,'square',.025);setTimeout(()=>tone(160,.1,'sawtooth',.02),40)}

// --- Movement / collisions --------------------------------------------------
function updatePlayer(dt){
  let mx=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0), mz=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0);
  if(isTouch){mx+=mobileMove.x;mz+=mobileMove.y}
  const l=Math.hypot(mx,mz);if(l>1){mx/=l;mz/=l}
  const run=(keys.has('ShiftLeft')||keys.has('ShiftRight')) || (isTouch && currentMoveSpeed>0); const speed=run?5.2:3.15;
  const local=new THREE.Vector3(mx,0,mz);local.applyAxisAngle(new THREE.Vector3(0,1,0),cameraYaw);
  const moving=local.lengthSq()>.005;currentMoveSpeed=moving?speed:0;
  if(moving){
    local.normalize(); const np=player.position.clone().addScaledVector(local,speed*dt); resolveRoom(np);resolveObstacles(np);player.position.x=np.x;player.position.z=np.z;
    const desired=Math.atan2(-local.x,-local.z);player.rotation.y=angleLerp(player.rotation.y,desired,1-Math.exp(-12*dt)); if(!attacking)setAction(run?'run':'walk');
  } else if(!attacking) setAction('idle');

  jumpVelocity-=9.82*dt;player.position.y+=jumpVelocity*dt;if(player.position.y<=0){player.position.y=0;jumpVelocity=0;grounded=true}
  if(mixer)mixer.update(dt);
  animateCharacterRig(dt,moving,run);
  if(attacking) updateAttack(dt);
}
function resolveRoom(p){p.x=clamp(p.x,-13.15,13.15);p.z=clamp(p.z,-8.0,8.0)}
function resolveObstacles(p){const r=.42;for(const o of obstacles){if(!o.active)continue;const dx=p.x-o.x,dz=p.z-o.z;const px=o.w+r-Math.abs(dx),pz=o.d+r-Math.abs(dz);if(px>0&&pz>0){if(px<pz)p.x+=Math.sign(dx||1)*px;else p.z+=Math.sign(dz||1)*pz}}}
function angleLerp(a,b,t){let d=((b-a+Math.PI)%(Math.PI*2))-Math.PI;return a+d*t}
function updateAttack(dt){
  attackT+=dt;const duration=.58;const p=attackT/duration;const swing=Math.sin(clamp(p,0,1)*Math.PI);
  const arm=player.userData.upperArm;if(arm)arm.rotation.z-=swing*1.35;
  const bat=player.userData.bat;if(bat && !arm){bat.rotation.z=-.55-swing*1.75;bat.rotation.x=.2+swing*.35}
  if(!attackHitDone&&p>.43){attackHitDone=true;doHit()}
  if(p>=1){attacking=false;attackT=0;attackHitDone=false;if(arm && characterRig?.rest?.rightArm) arm.rotation.z = characterRig.rest.rightArm.z; if(bat&&!arm){bat.rotation.z=-.55;bat.rotation.x=.2}}
}

function updateCamera(dt){
  const target=player.position.clone().add(new THREE.Vector3(0,1.25,0));
  const cp=Math.cos(cameraPitch),sp=Math.sin(cameraPitch);const back=new THREE.Vector3(Math.sin(cameraYaw)*cp,-sp,Math.cos(cameraYaw)*cp).multiplyScalar(cameraDistance);
  const desired=target.clone().add(back);desired.y=Math.max(.7,desired.y);
  const k=1-Math.exp(-12*dt);camera.position.lerp(desired,k);
  if(cameraShake>0){cameraShake=Math.max(0,cameraShake-dt);camera.position.x+=(Math.random()-.5)*cameraShake*.25;camera.position.y+=(Math.random()-.5)*cameraShake*.18}
  camera.lookAt(target);
}

function updateTimer(dt){if(!countdownStarted)return;countdown=Math.max(0,countdown-dt);const m=Math.floor(countdown/60),s=Math.floor(countdown%60);ui.timer.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;if(countdown===0){countdownStarted=false;showMessage('TECNICO IN ARRIVO. SCAPPA!')}}

function animate(){
  requestAnimationFrame(animate);const now=performance.now();const dt=Math.min(.033,(now-lastTime)/1000||.016);lastTime=now;
  if(gameStarted){world.step(1/60,dt,3);updatePlayer(dt);updatePhysics();updateParticles(dt);updateCamera(dt);updateTimer(dt)} else updateCamera(dt);
  renderer.render(scene,camera);
}
function updatePhysics(){for(const p of physicsItems){p.mesh.position.copy(p.body.position);p.mesh.quaternion.copy(p.body.quaternion)}}
