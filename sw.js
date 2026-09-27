const CACHE_NAME="max-planner-pwa-1.5.0";
const APP_SHELL=["./","./index.html","./app.webmanifest","./icon-192.png","./icon-512.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message",event=>{
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const req=event.request;
  if(req.mode==="navigate"){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:"no-store"});
        const cache=await caches.open(CACHE_NAME);
        cache.put("./index.html",fresh.clone());
        return fresh;
      }catch(e){
        return (await caches.match("./index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached) return cached;
    try{
      const fresh=await fetch(req);
      const cache=await caches.open(CACHE_NAME);
      cache.put(req,fresh.clone());
      return fresh;
    }catch(e){ return Response.error(); }
  })());
});
