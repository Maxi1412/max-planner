(function(root){
  'use strict';
  const DB='max-planner-recovery-v1',STORE='snapshots',PENDING='max-planner-pending-save-v1';
  const KEYS=['max-planner-v1','max-planner-recurring-v2','max-planner-meta-v3'];
  let lastSnapshot=null,provider=null,saveFailed=false;
  function rawState(){
    const raw={};
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key?.startsWith('max-planner-')&&!key.startsWith('max-planner-recovery-')&&!/handoff|token/i.test(key)) raw[key]=localStorage.getItem(key);
    }
    return raw;
  }
  function database(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Recovery storage is unavailable.'));
      request.onblocked=()=>reject(new Error('Close other planner tabs and try again.'));
    });
  }
  async function readRecord(db,id){
    return new Promise((resolve,reject)=>{
      const request=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  async function writeRecord(db,record){
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('The safety snapshot was interrupted.'));
    });
    const check=await readRecord(db,record.id);
    if(JSON.stringify(check?.raw)!==JSON.stringify(record.raw)) throw new Error('The safety snapshot could not be verified.');
    return check;
  }
  async function snapshot(reason,{once=false}={}){
    const id=once?reason:reason+':'+new Date().toISOString()+':'+Math.random().toString(36).slice(2);
    const record={id,reason,savedAt:new Date().toISOString(),raw:rawState()};
    let db;
    try{
      db=await database();
      const existing=once?await readRecord(db,id):null;
      lastSnapshot=existing||await writeRecord(db,record);return lastSnapshot;
    }catch(error){
      const key='max-planner-recovery-'+id,text=JSON.stringify(record);
      try{
        const existing=once?localStorage.getItem(key):null;
        if(!existing){localStorage.setItem(key,text);if(localStorage.getItem(key)!==text) throw error;}
        lastSnapshot=existing?JSON.parse(existing):record;return lastSnapshot;
      }catch(_){throw new Error('Your planner could not be backed up on this device. Download a backup below before making more changes.');}
    }finally{db?.close();}
  }
  function payloadFromRaw(raw){
    if(raw[PENDING]) return JSON.parse(raw[PENDING]);
    return {app:'Max Planner',exportedAt:new Date().toISOString(),data:JSON.parse(raw[KEYS[0]]||'{}'),recurring:JSON.parse(raw[KEYS[1]]||'[]'),meta:JSON.parse(raw[KEYS[2]]||'{}')};
  }
  function download(payload,filename){
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportCurrent(){
    let payload;
    try{payload=provider?provider():payloadFromRaw(rawState());}
    catch(_){payload={app:'Max Planner recovery',exportedAt:new Date().toISOString(),raw:rawState()};}
    download(payload,'max-planner-recovery-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
  }
  function showFailure(message,{blocking=false}={}){
    saveFailed=true;
    let panel=document.getElementById('storageWarning');
    if(!panel){
      panel=document.createElement('div');panel.id='storageWarning';panel.setAttribute('role','alert');
      panel.style.cssText='position:fixed;left:10px;right:10px;bottom:12px;z-index:120;background:#fff3cd;color:#573c00;border:2px solid #ad7900;border-radius:12px;padding:14px;font:14px system-ui;box-shadow:0 4px 20px #0004';
      const text=document.createElement('p');text.id='storageWarningText';panel.appendChild(text);
      const button=document.createElement('button');button.type='button';button.textContent='Download planner backup';button.onclick=exportCurrent;panel.appendChild(button);
      document.body.appendChild(panel);
    }
    document.getElementById('storageWarningText').textContent=message;
    if(blocking) panel.style.inset='20px 10px auto';
  }
  function clearFailure(){saveFailed=false;document.getElementById('storageWarning')?.remove();}
  function commit(payload){
    const text=JSON.stringify(payload),values=[JSON.stringify(payload.data),JSON.stringify(payload.recurring),JSON.stringify(payload.meta)];
    try{
      localStorage.setItem(PENDING,text);
      if(localStorage.getItem(PENDING)!==text) throw new Error('The planner write could not be verified.');
      KEYS.forEach((key,i)=>{localStorage.setItem(key,values[i]);if(localStorage.getItem(key)!==values[i]) throw new Error('The planner write could not be verified.');});
      localStorage.removeItem(PENDING);clearFailure();return true;
    }catch(error){
      showFailure('Your latest changes are still on this screen, but saving on this device failed. Download a planner backup now.');return false;
    }
  }
  async function prepare(build){
    await snapshot('before-update-'+build,{once:true});
    const pending=localStorage.getItem(PENDING);
    if(pending){
      const payload=root.PlannerCore.validateBackup(JSON.parse(pending));
      if(!commit(payload)) throw new Error('A previous planner save needs recovery. Download the planner backup below before continuing.');
    }
  }
  function deviceId(){
    const key='max-planner-device-id-v1';
    let value=localStorage.getItem(key);
    if(!value){
      value=root.crypto?.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
      localStorage.setItem(key,value);
      if(localStorage.getItem(key)!==value) throw new Error('The backup destination could not be saved on this device.');
    }
    return value;
  }
  root.addEventListener('beforeunload',event=>{if(saveFailed){event.preventDefault();event.returnValue='';}});
  root.PlannerSafety={prepare,snapshot,commit,showFailure,exportCurrent,download,payloadFromRaw,deviceId,getLatestSnapshot:()=>lastSnapshot,setPayloadProvider:fn=>{provider=fn;}};
})(window);
