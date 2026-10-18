const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const Core=require('../planner-core.js');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const main=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).find(x=>x.includes('const DATA_KEY'));
const json=value=>JSON.parse(JSON.stringify(value));

class Storage{
  constructor(values={}){this.values=new Map(Object.entries(values));this.fail=null;}
  get length(){return this.values.size;}
  key(i){return [...this.values.keys()][i]??null;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){if(this.fail?.(key)) throw new Error('QuotaExceededError');this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}
function mockDom(){
  const elements=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.style={setProperty(){}};this.dataset={};this.value='';this.checked=false;this.className='';this.listeners={};this._html='';
      this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(' '),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(' ').filter(x=>!names.includes(x)).join(' ');},contains:name=>this.className.split(' ').includes(name),toggle:(name,enabled)=>{if(enabled??!this.classList.contains(name))this.classList.add(name);else this.classList.remove(name);}};
    }
    set id(value){this._id=value;elements.set(value,this);}get id(){return this._id;}
    set innerHTML(value){this._html=value;this.children=[];}get innerHTML(){return this._html;}
    appendChild(child){child.parentElement=this;this.children.push(child);return child;}append(...children){children.forEach(x=>this.appendChild(x));}
    remove(){elements.delete(this.id);if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);}
    setAttribute(name,value){this[name]=value;}addEventListener(name,fn){this.listeners[name]=fn;}removeEventListener(){}
    getBoundingClientRect(){return {height:54,width:420};}scrollIntoView(){}click(){this.onclick?.();}
    querySelector(selector){const element=new Element();element.className=selector.replace('.','');return element;}
    querySelectorAll(){return [];}
    get offsetWidth(){return 420;}get offsetHeight(){return 800;}
  }
  for(const match of html.matchAll(/\bid="([^"]+)"/g)){const element=new Element();element.id=match[1];}
  const body=new Element('body'),head=new Element('head'),header=new Element('header');
  return {elements,document:{body,head,documentElement:new Element('html'),visibilityState:'visible',createElement:tag=>new Element(tag),getElementById:id=>elements.get(id)||null,querySelector:selector=>selector==='body > header'?header:null,querySelectorAll:()=>[],addEventListener(){}}};
}
function mockIdb(){
  const records=new Map();
  const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
    const tx={objectStore:()=>({get(id){const req={};queueMicrotask(()=>{req.result=records.has(id)?json(records.get(id)):undefined;req.onsuccess?.();});return req;},put(record){records.set(record.id,json(record));queueMicrotask(()=>tx.oncomplete?.());}})};return tx;
  }};
  return {records,indexedDB:{open(){const req={result:db};queueMicrotask(()=>req.onsuccess?.());return req;}}};
}
function environment(values={},fetcher=async()=>{throw new Error('Unexpected network request');}){
  const localStorage=new Storage(values),sessionStorage=new Storage(),dom=mockDom(),idb=mockIdb(),timers=[],alerts=[];
  const context={console,URL,URLSearchParams,Headers,Request,Response,AbortController,Blob,Date,Math,JSON,Intl,Promise,Set,Map,atob,btoa,encodeURIComponent,decodeURIComponent,escape,unescape,localStorage,sessionStorage,indexedDB:idb.indexedDB,document:dom.document,navigator:{userAgent:'Test browser',vibrate(){}},location:{href:'https://example.test/max-planner/',origin:'https://example.test',protocol:'https:',assign(){},reload(){}},setTimeout:(fn)=>{timers.push(fn);return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:fn=>fn(),fetch:fetcher,alert:message=>alerts.push(message),confirm:()=>true,BroadcastChannel:class{close(){}postMessage(){}},addEventListener(){},crypto:{randomUUID:()=> 'test-device'},open:()=>({}),innerWidth:420};
  context.window=context;context.PlannerCore=Core;
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'planner-safety.js'),'utf8'),context);
  return {context,localStorage,sessionStorage,...dom,...idb,timers,alerts};
}
async function app(values={},fetcher){
  const env=environment(values,fetcher);
  const expose=`\nreturn {getState:()=>({data,recurring,meta}),setState:value=>{data=value.data;recurring=value.recurring||[];meta=value.meta||{};},runStartupMaintenance,fetchGoogleCalendarEvents,applyGoogleCalendarEvents,saveAppointmentFromModal,openAppointmentModal,googleEventToAppointment,uploadDriveBackup,manualDriveBackup,ensureDriveTokenClient,driveBackupStatusInfo,setDriveToken:()=>persistDriveSessionToken('test-token',3600),setDate:value=>{current=value;},renderDay,buildPrintWeek};`;
  env.api=await vm.runInContext('(async()=>{'+main+expose+'})()',env.context);return env;
}
const existing=()=>({data:{'2026-10-12':{appts:[{id:'manual',title:'Appointment entered by Max',start:'11:00',end:'12:00',who:'mum',category:'health',notes:'Keep these details',status:'completed',flag:true,expenseLink:{id:'finance-1',amount:25},customReference:'from-user'},{id:'gpt',title:'Record entered through GPT',start:'18:00',end:'18:45',who:'work',notes:'Keep this too',status:'pending'}],todos:[{id:'todo-1',text:'User task',status:'pending'}],noteItems:[{id:'note-1',text:'User note'}]}},recurring:[{id:'custom-recurring',type:'reminder',title:'User recurring reminder',startDate:'2026-10-01',repeat:'weekly',who:'mum'}],meta:{disabledDefaults:['d1']}});
function storageFor(payload){return {'max-planner-v1':JSON.stringify(payload.data),'max-planner-recurring-v2':JSON.stringify(payload.recurring),'max-planner-meta-v3':JSON.stringify(payload.meta)};}
const calendar='mum@example.test',eventId='event-1',eventKey=calendar+'::'+eventId;
const appointment=()=>({id:'gcal-'+btoa(eventKey).replace(/=+$/,''),googleEventId:eventId,googleCalendarId:calendar,googleEventKey:eventKey,source:'google-calendar-mum',title:'Google appointment',start:'10:00',end:'11:00',who:'mum',notes:'Original Google notes',googleNotes:'Original Google notes',flag:true,status:'completed',expenseLink:{id:'receipt-1'},category:'health',colorKey:'pink'});
const event=()=>({id:eventId,_calendarId:calendar,start:{dateTime:'2026-10-18T10:00:00Z'},end:{dateTime:'2026-10-18T11:00:00Z'},summary:'Updated Google title'});
const result=items=>({minKey:'2026-01-01',maxKey:'2027-12-31',items,calendars:[{id:calendar}],skippedCalendars:[]});
const convert=ev=>({key:'2026-10-18',appt:{...appointment(),title:ev.summary,notes:'Changed Google notes',googleNotes:'Changed Google notes'}});

test('upgrade snapshots raw user data before migrations and retains manual/GPT details',async()=>{
  const before=existing(),values=storageFor(before),env=await app(values);
  const snapshot=[...env.records.values()][0];
  assert.equal(snapshot.raw['max-planner-v1'],values['max-planner-v1']);
  assert.equal(snapshot.raw['max-planner-recurring-v2'],values['max-planner-recurring-v2']);
  env.api.runStartupMaintenance();
  const state=json(env.api.getState());
  for(const old of before.data['2026-10-12'].appts){
    const kept=state.data['2026-10-12'].appts.find(x=>x.id===old.id);assert.ok(kept);
    for(const [field,value] of Object.entries(old)) assert.deepEqual(kept[field],value,'Existing field preserved: '+field);
  }
  assert.deepEqual(state.data['2026-10-12'].todos,before.data['2026-10-12'].todos);
  assert.deepEqual(state.data['2026-10-12'].noteItems,before.data['2026-10-12'].noteItems);
  assert.ok(state.recurring.some(x=>x.id==='custom-recurring'));
  assert.equal(env.localStorage.getItem('max-planner-pending-save-v1'),null);
});
test('a failed secondary calendar never deletes or changes existing appointments',()=>{
  const data={'2026-10-18':{appts:[appointment()],todos:[{text:'Task'}],noteItems:[{text:'Note'}]}};
  const merged=Core.mergeGoogleCalendar(data,{...result([]),calendars:[{id:'other'}],skippedCalendars:[{id:calendar,status:503}]},convert);
  assert.deepEqual(merged.data,data);assert.equal(merged.removed,0);
});
test('editing a Google appointment preserves its linkage, personal notes, colors and finance link across repeated syncs',()=>{
  const original=appointment(),edited=Core.editedAppointment(original,{...original,title:'My edited title',notes:'My own notes',start:'12:00',end:'13:00'},'2026-10-18','2026-10-19');
  let data={'2026-10-19':{appts:[edited],todos:[],noteItems:[]}};
  for(let i=0;i<3;i++) data=Core.mergeGoogleCalendar(data,result([event()]),convert).data;
  const all=Object.values(data).flatMap(day=>day.appts);assert.equal(all.length,1);
  assert.equal(all[0].title,'My edited title');assert.equal(all[0].start,'12:00');assert.equal(all[0].notes,'My own notes');
  assert.equal(all[0].googleEventKey,eventKey);assert.equal(all[0].colorKey,'pink');assert.equal(all[0].status,'completed');assert.deepEqual(all[0].expenseLink,{id:'receipt-1'});
  assert.equal(data['2026-10-19'].appts.length,1);
});
test('legacy edits with only an encoded Google ID are relinked without duplicate imports',()=>{
  const old={id:appointment().id,title:'Legacy local edit',start:'12:00',end:'13:00',notes:'Local legacy note',who:'mum'};
  const merged=Core.mergeGoogleCalendar({'2026-10-18':{appts:[old]}},result([event()]),convert);
  assert.equal(merged.imported,0);assert.equal(merged.data['2026-10-18'].appts.length,1);assert.equal(merged.data['2026-10-18'].appts[0].notes,'Local legacy note');
});
test('remote deletion keeps the local appointment and recovery details',()=>{
  const source={'2026-10-18':{appts:[appointment()]}};
  for(const items of [[],[{...event(),status:'cancelled'}]]){
    const merged=Core.mergeGoogleCalendar(source,result(items),convert);const kept=merged.data['2026-10-18'].appts[0];
    assert.equal(merged.data['2026-10-18'].appts.length,1);assert.equal(kept.notes,appointment().notes);assert.ok(kept.googleSyncState);assert.equal(merged.removed,0);
  }
});
test('shared-calendar login selects Mum’s calendar without relabeling the authorized account’s own calendar',()=>{
  const calendars=[{id:'max@example.test',primary:true},{id:calendar}];
  assert.deepEqual(Core.selectMumCalendars(calendars,calendar).calendars,[calendars[1]]);
  assert.equal(Core.selectMumCalendars(calendars,calendar).primaryId,'max@example.test');
  assert.throws(()=>Core.selectMumCalendars([calendars[0]],calendar),/shared her calendar/);
});
test('partial pagination of an unavailable secondary calendar is discarded without affecting the target calendar',async()=>{
  const mum='martina.orihuela@gmail.com';
  const env=await app({},async url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/calendarList'))return Response.json({items:[{id:mum,primary:true,accessRole:'owner'},{id:'secondary',accessRole:'reader'}]});
    if(u.pathname.includes(encodeURIComponent(mum)))return Response.json({items:[]});
    if(!u.searchParams.get('pageToken'))return Response.json({items:[{id:'partial'}],nextPageToken:'page-2'});
    return Response.json({error:{message:'Unavailable'}},{status:503});
  });
  const fetched=await env.api.fetchGoogleCalendarEvents('test-token');
  assert.equal(fetched.items.length,0);assert.equal(fetched.calendars.length,1);assert.equal(fetched.skippedCalendars[0].id,'secondary');
});
test('connecting a new device creates a separate Drive file and never overwrites the legacy backup',async()=>{
  const legacy={id:'legacy-file',name:'max-planner-backup.json',modifiedTime:'2026-10-18T00:00:00Z'},writes=[];
  const env=await app({},async(url,options={})=>{
    if((options.method||'GET')==='GET')return Response.json({files:[legacy]});
    if(options.method==='POST'){const metadata=JSON.parse(options.body);assert.equal(metadata.appProperties.plannerDeviceId,'test-device');return Response.json({id:'new-device-file'});}
    if(options.method==='PATCH'){writes.push(url);return new Response(null,{status:200});}
    throw Error('Unexpected Drive operation');
  });
  env.api.setDriveToken();await env.api.manualDriveBackup();
  assert.equal(writes.length,1);assert.ok(writes[0].includes('/new-device-file?'));assert.ok(!writes[0].includes(legacy.id));
  assert.equal(env.api.getState().meta.driveBackup.deviceId,'test-device');
});
test('storage failures stay visible and a partially written save is recovered from its complete journal',async()=>{
  const old=existing(),env=environment(storageFor(old));await env.context.PlannerSafety.prepare('test');
  const latest=existing();latest.data['2026-10-12'].appts[0].notes='Latest note that must survive';
  env.localStorage.fail=key=>key==='max-planner-recurring-v2';
  assert.equal(env.context.PlannerSafety.commit(latest),false);
  assert.ok(env.elements.get('storageWarningText').textContent.includes('saving on this device failed'));
  assert.equal(JSON.parse(env.localStorage.getItem('max-planner-pending-save-v1')).data['2026-10-12'].appts[0].notes,'Latest note that must survive');
  env.localStorage.fail=null;await env.context.PlannerSafety.prepare('test');
  assert.equal(env.localStorage.getItem('max-planner-pending-save-v1'),null);
  assert.equal(JSON.parse(env.localStorage.getItem('max-planner-v1'))['2026-10-12'].appts[0].notes,'Latest note that must survive');
});
test('backup failure prevents application initialization and never resets stored user information',async()=>{
  const values=storageFor(existing()),env=environment(values);env.context.indexedDB={open(){throw Error('Unavailable');}};env.localStorage.fail=()=>true;
  await assert.rejects(vm.runInContext('(async()=>{'+main+'})()',env.context),/could not be backed up/);
  assert.equal(env.localStorage.getItem('max-planner-v1'),values['max-planner-v1']);
});
test('month navigation clamps month ends, including leap years',()=>{
  for(const [input,delta,expected] of [[new Date(2026,0,31),1,[2026,1,28]],[new Date(2028,0,31),1,[2028,1,29]],[new Date(2026,2,31),-1,[2026,1,28]],[new Date(2026,11,31),1,[2027,0,31]]]){
    const output=Core.moveMonth(input,delta);assert.deepEqual([output.getFullYear(),output.getMonth(),output.getDate()],expected);
  }
});
test('invalid backup objects are rejected before any planner replacement',()=>{
  for(const payload of [{data:null},{data:[]},{data:{date:null}},{data:{date:{appts:[null]}}},{data:{},recurring:{}}])assert.throws(()=>Core.validateBackup(payload));
  const source=existing(),copy=Core.validateBackup(source);copy.data['2026-10-12'].appts[0].notes='Changed';assert.equal(source.data['2026-10-12'].appts[0].notes,'Keep these details');
});
test('editing generated defaults produces a real appointment rather than keeping virtual default flags',()=>{
  const edited=Core.editedAppointment({id:'default',isDefault:true,defaultId:'d2'},{id:'real',title:'Edited breakfast'},'2026-10-18','2026-10-18');
  assert.equal(edited.isDefault,undefined);assert.equal(edited.defaultId,undefined);
});
test('day view includes early imported appointments and late entries',async()=>{
  const env=await app();env.api.setState({data:{'2026-10-21':{appts:[{id:'early',title:'Early event',start:'02:00',end:'03:00',who:'mum'},{id:'late',title:'Late event',start:'23:00',end:'23:45',who:'mine'}],todos:[],noteItems:[]}},recurring:[],meta:{disabledDefaults:[]}});
  env.api.setDate(new Date(2026,9,21));env.api.renderDay();
  const rows=env.elements.get('slots').children.filter(x=>x.className==='slot');assert.equal(rows.length,22);
  assert.ok(rows[0].children[0].innerHTML.includes('02:00'));assert.ok(rows.at(-1).children[0].innerHTML.includes('23:00'));
});
test('service worker leaves Google requests and other PWAs alone, and removes only old Planner caches',async()=>{
  const handlers={},deleted=[];const ctx={URL,Headers,Response,self:{registration:{scope:'https://example.test/max-planner/'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){}},caches:{keys:async()=>['max-planner-pwa-1.19.2','max-planner-pwa-1.20.0','expense-vault-pwa-v1','formfill-lite-v7'],delete:async name=>deleted.push(name)},fetch:async()=>{throw Error('Unexpected fetch');}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),ctx);
  for(const request of [new Request('https://www.googleapis.com/calendar/v3/events'),new Request('https://example.test/expense-vault/'),new Request('https://example.test/max-planner/index.html',{headers:{Authorization:'Bearer test'}})]){
    let intercepted=false;handlers.fetch({request,respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
  }
  let pending;handlers.activate({waitUntil:value=>pending=value});await pending;assert.deepEqual(deleted,['max-planner-pwa-1.19.2']);
});
test('service-worker cache failure does not block a working network response',async()=>{
  for(const cacheFailure of ['open','put']){
    const handlers={},ctx={URL,Headers,Response,self:{registration:{scope:'https://example.test/max-planner/'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>{if(cacheFailure==='open')throw Error('Storage unavailable');return {put:async()=>{throw Error('QuotaExceededError');},match:async()=>undefined};}},fetch:async()=>new Response('Working planner',{status:200})};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),ctx);
    let pending;handlers.fetch({request:new Request('https://example.test/max-planner/index.html'),respondWith:value=>pending=value});assert.equal(await (await pending).text(),'Working planner');
  }
});
test('the actual appointment editor retains the Google identity and local notes during sync',async()=>{
  const env=await app(),original=appointment();
  env.api.setState({data:{'2026-10-18':{appts:[original],todos:[],noteItems:[]}},recurring:[],meta:{disabledDefaults:[]}});
  env.api.openAppointmentModal(original,'2026-10-18');
  env.elements.get('fTitle').value='Edited through the actual form';env.elements.get('fNotes').value='My form note';
  assert.equal(env.api.saveAppointmentFromModal(),true);
  for(let i=0;i<3;i++)env.api.applyGoogleCalendarEvents(result([event()]));
  const entries=Object.values(env.api.getState().data).flatMap(day=>day.appts);
  assert.equal(entries.filter(entry=>entry.googleEventKey===eventKey).length,1);
  const kept=entries.find(entry=>entry.googleEventKey===eventKey);assert.equal(kept.title,'Edited through the actual form');assert.equal(kept.notes,'My form note');
});
test('Drive status never claims automatic backup is on for an unverified destination or a failed upload',async()=>{
  const env=await app();env.api.setDriveToken();
  env.api.setState({data:{},recurring:[],meta:{driveBackup:{enabled:true,fileId:'legacy-file'}}});
  assert.equal(env.api.driveBackupStatusInfo().state,'paused');
  env.api.setState({data:{},recurring:[],meta:{driveBackup:{enabled:true,deviceId:'test-device',lastError:'Upload failed'}}});
  assert.equal(env.api.driveBackupStatusInfo().state,'error');
});
test('HTTP errors do not overwrite a working offline shell',async()=>{
  const handlers={},stored=new Map([['https://example.test/max-planner/index.html',new Response('Saved planner')]]);
  const cache={put:async(key,value)=>stored.set(key,value),match:async key=>stored.get(key)?.clone()};
  const ctx={URL,Headers,Response,self:{registration:{scope:'https://example.test/max-planner/'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>cache},fetch:async()=>new Response('Not found',{status:404})};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),ctx);
  let pending;handlers.fetch({request:new Request('https://example.test/max-planner/index.html'),respondWith:value=>pending=value});assert.equal(await (await pending).text(),'Saved planner');assert.equal(stored.size,1);
});
