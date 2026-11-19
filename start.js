'use strict';
(async()=>{
 let settled=false;
 const go=path=>{if(!settled){settled=true;location.replace(path);}};
 if(!('serviceWorker' in navigator)){go('./offline.html');return;}
 const timer=setTimeout(()=>go('./offline.html'),15000);
 navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='STATUS'){clearTimeout(timer);go(event.data.ready?'./index.html':'./offline.html');}
 });
 try{const registration=await navigator.serviceWorker.register('./service-worker.js',{scope:'./'});await navigator.serviceWorker.ready;const worker=registration.active||registration.waiting||registration.installing;if(!worker)throw new Error('service worker unavailable');worker.postMessage({type:'STATUS'});}catch(_){clearTimeout(timer);go('./offline.html');}
})();
