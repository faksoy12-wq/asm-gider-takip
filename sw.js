const CACHE='asm-gider-v7-pdf';
const ASSETS=['./','./index.html','./style.css?v=6','./app.js?v=7','./pdf-report.js?v=7','./cloud.js?v=5','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png','./favicon-32.png','./favicon-48.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});