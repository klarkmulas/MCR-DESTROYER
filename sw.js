const VERSION='2026.09.24.1';
const PREFIX='mcr-destroyer-';
const SHELL_CACHE=PREFIX+'shell-'+VERSION;
const RUNTIME_CACHE=PREFIX+'runtime-'+VERSION;
const OFFLINE_CACHE=PREFIX+'offline-'+VERSION;

const SHELL=[
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-icon-192.svg',
  './pwa-icon-512.svg',
  './sfx_step.wav?v=2',
  './sfx_impact.wav?v=2'
];

const OFFLINE_URLS=[
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-icon-192.svg',
  './pwa-icon-512.svg',
  './sfx_step.wav?v=2',
  './sfx_impact.wav?v=2',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&![SHELL_CACHE,RUNTIME_CACHE,OFFLINE_CACHE].includes(k)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function putIfUsable(cache,request,response){
  if(response && (response.ok || response.type==='opaque')){
    try{await cache.put(request,response.clone())}catch(e){}
  }
  return response;
}

async function networkFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  try{
    const response=await fetch(request);
    await putIfUsable(cache,request,response);
    return response;
  }catch(err){
    const cached=await caches.match(request);
    if(cached)return cached;
    if(request.mode==='navigate'){
      const fallback=await caches.match('./index.html');
      if(fallback)return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request,cacheName){
  const cached=await caches.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  const cache=await caches.open(cacheName);
  await putIfUsable(cache,request,response);
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,RUNTIME_CACHE));
    return;
  }

  if(url.origin===self.location.origin){
    event.respondWith(cacheFirst(request,RUNTIME_CACHE));
    return;
  }

  if(url.hostname==='cdn.jsdelivr.net'){
    event.respondWith(cacheFirst(request,RUNTIME_CACHE));
    return;
  }

  if(url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/')){
    event.respondWith(networkFirst(request,RUNTIME_CACHE));
  }
});

async function cacheOffline(source){
  const cache=await caches.open(OFFLINE_CACHE);
  let done=0;
  const failures=[];
  for(const item of OFFLINE_URLS){
    try{
      const absolute=new URL(item,self.location.href).href;
      const request=new Request(absolute,{method:'GET',credentials:'same-origin',cache:'reload'});
      const response=await fetch(request);
      if(!response || (!response.ok && response.type!=='opaque'))throw new Error('HTTP '+(response&&response.status));
      await cache.put(request,response.clone());
    }catch(err){
      failures.push({url:item,error:String(err&&err.message||err)});
    }
    done++;
    try{source&&source.postMessage({type:'OFFLINE_PROGRESS',done,total:OFFLINE_URLS.length,url:item,failures:failures.length,version:VERSION})}catch(e){}
  }
  try{
    source&&source.postMessage({
      type:failures.length?'OFFLINE_PARTIAL':'OFFLINE_READY',
      done,total:OFFLINE_URLS.length,failures,version:VERSION
    });
  }catch(e){}
}

self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type==='DOWNLOAD_OFFLINE'){
    event.waitUntil(cacheOffline(event.source));
  }
  if(data.type==='SKIP_WAITING'){
    self.skipWaiting();
  }
});
