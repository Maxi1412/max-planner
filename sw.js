const CACHE_PREFIX='max-planner-pwa-';
const CACHE_NAME=CACHE_PREFIX+'1.20.0';
const APP_SHELL=['./','./index.html','./planner-core.js','./planner-safety.js','./app.webmanifest','./icon-192.png','./icon-512.png'];
const SCOPE=new URL('./',self.registration.scope);
const SHELL_PATHS=new Set(APP_SHELL.map(path=>new URL(path,SCOPE).pathname));
const AUTH_PATH=new URL('./google-calendar-connect.html',SCOPE).pathname;

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
async function authDocument(request){
  const response=await fetch(request,{cache:'no-store'});
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  headers.set('X-Max-Planner-Calendar-Auth','planner-coop-v2');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  // OAuth, Google APIs, authorization headers, and other applications always use the network.
  if(request.method!=='GET'||url.origin!==SCOPE.origin||request.headers.has('Authorization')) return;
  if(url.pathname===AUTH_PATH){event.respondWith(authDocument(request));return;}
  if(!SHELL_PATHS.has(url.pathname)) return;
  event.respondWith((async()=>{
    let cache;
    try{cache=await caches.open(CACHE_NAME);}catch(_){}
    const canonical=new URL(url.pathname,SCOPE.origin).href;
    try{
      const response=await fetch(request,{cache:'no-store'});
      if(response.ok&&response.type!=='opaque'&&cache){try{await cache.put(canonical,response.clone());}catch(_){}}
      if(response.ok) return response;
      return (cache&&await cache.match(canonical))||response;
    }catch(error){
      const cached=cache&&await cache.match(canonical);
      if(cached) return cached;
      throw error;
    }
  })());
});
