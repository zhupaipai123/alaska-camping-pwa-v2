'use strict';
const CACHE='alaska-pwa-20261119-icon-v2';
const RESOURCE_LIST='offline-resources.json';
const MARKER='__offline_ready_v1__';
let preparing=false;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const localUrl=path=>new URL(path,self.registration.scope).href;
async function notify(client,payload){if(client)client.postMessage(payload);}
async function sha256(bytes){const data=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,'0')).join('');}
async function getList(cache){let r=await cache.match(localUrl(RESOURCE_LIST));if(!r)return null;try{return await r.json();}catch(_){return null;}}
async function check(cache,list){if(!list||!Array.isArray(list.files))return {ready:false,missing:[]};const missing=[];for(const item of list.files){if(!await cache.match(localUrl(item.path)))missing.push(item.path);}const marker=await cache.match(localUrl(MARKER));return {ready:!!marker&&missing.length===0,missing};}
async function status(client){const cache=await caches.open(CACHE),list=await getList(cache),result=await check(cache,list);await notify(client,{type:'STATUS',ready:result.ready,total:list?.files?.length||0,missing:result.missing.length});}
async function prepare(client){
 if(preparing){await notify(client,{type:'BUSY'});return;}preparing=true;
 try{
  const cache=await caches.open(CACHE);
  const listResp=await fetch(localUrl(RESOURCE_LIST),{cache:'no-store'});
  if(!listResp.ok)throw new Error('无法获取离线资源清单');
  const list=await listResp.clone().json();
  if(!Array.isArray(list.files)||!list.files.length)throw new Error('离线资源清单无效');
  await cache.delete(localUrl(MARKER));
  let done=0;await notify(client,{type:'PROGRESS',done,total:list.files.length});
  for(const item of list.files){
   const url=localUrl(item.path);let response=await cache.match(url),valid=false;
   if(response&&response.ok){const bytes=await response.clone().arrayBuffer();valid=bytes.byteLength===item.bytes&&await sha256(bytes)===item.sha256;}
   if(!valid){response=await fetch(url,{cache:'no-store'});if(!response.ok||response.type==='opaque')throw new Error('无法下载 '+item.path);const bytes=await response.clone().arrayBuffer();if(bytes.byteLength!==item.bytes||await sha256(bytes)!==item.sha256)throw new Error('资源校验失败 '+item.path);await cache.put(url,response);}
   done++;await notify(client,{type:'PROGRESS',done,total:list.files.length});
  }
  await cache.put(localUrl(RESOURCE_LIST),listResp);
  const result=await check(cache,list);if(result.missing.length)throw new Error('缓存资源不完整');
  await cache.put(localUrl(MARKER),new Response('ready'));
  await notify(client,{type:'COMPLETE',done,total:list.files.length});
 }catch(e){await notify(client,{type:'ERROR',message:String(e.message||e)});}finally{preparing=false;}
}
self.addEventListener('message',event=>{const client=event.source;if(event.data?.type==='STATUS')event.waitUntil(status(client));if(event.data?.type==='PREPARE')event.waitUntil(prepare(client));});
async function fromCache(request){
 const cache=await caches.open(CACHE);let response=await cache.match(request,{ignoreSearch:true});
 if(!response&&request.mode==='navigate')response=await cache.match(localUrl('offline.html'));
 if(!response)return fetch(request);
 const range=request.headers.get('range');if(!range)return response;
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return fetch(request);
 const data=await response.arrayBuffer(),size=data.byteLength;let start,end;
 if(!match[1]){const suffix=Number(match[2]);start=Math.max(size-suffix,0);end=size-1;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
 const headers=new Headers(response.headers);headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');return new Response(data.slice(start,end+1),{status:206,headers});
}
self.addEventListener('fetch',event=>{if(event.request.method==='GET'&&event.request.url.startsWith(self.registration.scope))event.respondWith(fromCache(event.request));});
