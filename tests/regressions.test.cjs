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
  const expose=`\nreturn {getState:()=>({data,recurring,meta}),setState:value=>{data=value.data;recurring=value.recurring||[];meta=value.meta||{};},runStartupMaintenance,fetchGoogleCalendarEvents,applyGoogleCalendarEvents,saveAppointmentFromModal,openAppointmentModal,googleEventToAppointment,uploadDriveBackup,manualDriveBackup,ensureDriveTokenClient,driveBackupStatusInfo,setDriveToken:()=>persistDriveSessionToken('test-token',3600),setDate:value=>{current=value;},autoRolloverPendingTodos,mergedAppts,appointmentVisualClass,renderDay,renderWeek,renderMonth,buildPrintWeek};`;
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
  for(const note of before.data['2026-10-12'].noteItems){
    const kept=state.data['2026-10-12'].noteItems.find(x=>x.id===note.id);
    assert.ok(kept,'Existing note retained');
    assert.equal(kept.text,note.text,'Original note content preserved');
  }
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
  const rows=env.elements.get('slots').children.filter(x=>x.classList.contains('slot'));assert.equal(rows.length,22);
  assert.ok(rows[0].children[0].innerHTML.includes('02:00'));assert.ok(rows.at(-1).children[0].innerHTML.includes('23:00'));
});
test('service worker leaves Google requests and other PWAs alone, and removes only old Planner caches',async()=>{
  const handlers={},deleted=[];const ctx={URL,Headers,Response,self:{registration:{scope:'https://example.test/max-planner/'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){}},caches:{keys:async()=>['max-planner-pwa-1.19.2','max-planner-pwa-1.20.0','expense-vault-pwa-v1','formfill-lite-v7'],delete:async name=>deleted.push(name)},fetch:async()=>{throw Error('Unexpected fetch');}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),ctx);
  for(const request of [new Request('https://www.googleapis.com/calendar/v3/events'),new Request('https://example.test/expense-vault/'),new Request('https://example.test/max-planner/index.html',{headers:{Authorization:'Bearer test'}})]){
    let intercepted=false;handlers.fetch({request,respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
  }
  let pending;handlers.activate({waitUntil:value=>pending=value});await pending;assert.deepEqual(deleted,['max-planner-pwa-1.19.2','max-planner-pwa-1.20.0']);
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
test('startup retains edited work-support records and completion history even when a shift is absent',async()=>{
  const env=await app();
  const items=[{id:'edited-support',autoWorkSupport:true,manualWorkSupport:true,title:'My preparation',start:'17:00',end:'17:30',status:'pending'},{id:'completed-support',autoWorkSupport:true,title:'Completed preparation',start:'17:30',end:'18:00',status:'completed'},{id:'linked-support',autoWorkSupport:true,title:'Travel with a receipt',start:'18:00',end:'18:30',status:'pending',expenseLink:{id:'receipt-1'}}];
  env.api.setState({data:{'2026-10-18':{appts:json(items),todos:[],noteItems:[]}},recurring:[],meta:{}});
  env.api.runStartupMaintenance();
  const remaining=env.api.getState().data['2026-10-18'].appts;
  assert.equal(remaining.length,3);for(const item of items)assert.ok(remaining.some(x=>x.id===item.id));
});
test('HTTP errors do not overwrite a working offline shell',async()=>{
  const handlers={},stored=new Map([['https://example.test/max-planner/index.html',new Response('Saved planner')]]);
  const cache={put:async(key,value)=>stored.set(key,value),match:async key=>stored.get(key)?.clone()};
  const ctx={URL,Headers,Response,self:{registration:{scope:'https://example.test/max-planner/'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>cache},fetch:async()=>new Response('Not found',{status:404})};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),ctx);
  let pending;handlers.fetch({request:new Request('https://example.test/max-planner/index.html'),respondWith:value=>pending=value});assert.equal(await (await pending).text(),'Saved planner');assert.equal(stored.size,1);
});

test('encrypted Mum feed links an existing manual appointment and preserves private notes without duplicates',async()=>{
  const env=await app();
  env.api.setState({
    data:{'2026-10-26':{appts:[{
      id:'manual-mum',who:'mum',title:'Existing appointment',start:'10:00',end:'11:00',
      notes:'Keep manual notes',status:'completed',flag:true,source:'samsung-ics-mum-2026-10-18'
    }],todos:[{id:'t1',text:'Keep this todo'}],noteItems:[{id:'n1',text:'Keep this note'}]}},
    recurring:[{id:'r1',title:'Keep recurring'}],meta:{}
  });
  const event={
    id:'google-123',summary:'Existing appointment',
    start:{dateTime:'2026-10-26T10:00:00'},end:{dateTime:'2026-10-26T11:00:00'}
  };
  const feed={items:[{...event,_calendarId:'martina.orihuela@gmail.com'}],
    calendars:[{id:'martina.orihuela@gmail.com'}],minKey:'2026-10-01',maxKey:'2027-10-01'};
  const first=env.context.MaxPlannerPrivateMumFeed.apply(feed,'test-fingerprint-1');
  assert.equal(first.imported,0);
  assert.equal(first.linked,1);
  let state=json(env.api.getState());
  assert.equal(state.data['2026-10-26'].appts.length,1);
  assert.equal(state.data['2026-10-26'].appts[0].id,'manual-mum');
  assert.equal(state.data['2026-10-26'].appts[0].notes,'Keep manual notes');
  assert.equal(state.data['2026-10-26'].appts[0].status,'completed');
  assert.equal(state.data['2026-10-26'].appts[0].googleEventId,'google-123');
  assert.equal(state.data['2026-10-26'].todos[0].text,'Keep this todo');
  assert.equal(state.data['2026-10-26'].noteItems[0].text,'Keep this note');
  assert.equal(state.recurring[0].id,'r1');
  const again=env.context.MaxPlannerPrivateMumFeed.apply(feed,'test-fingerprint-1');
  assert.equal(again.imported,0);
  state=json(env.api.getState());
  assert.equal(state.data['2026-10-26'].appts.length,1);
});

test('private feed forwards stable fingerprint for idempotent refresh after restart',()=>{
  const reader=fs.readFileSync(path.join(root,'mum-private-calendar.js'),'utf8');
  assert.ok(reader.includes('MaxPlannerPrivateMumFeed.apply(result, encrypted.fingerprint)'));
});

test('local Samsung rescue import preserves existing Mum edits, Google appointments, notes and shifts',async()=>{
  const env=await app();
  const original={
    data:{
      '2026-10-27':{appts:[
        {id:'manual-one',who:'mum',title:'Existing appointment',start:'13:00',end:'14:00',notes:'Keep my manual notes',status:'completed',colorKey:'coral'},
        {id:'manual-time',who:'mum',title:'Time corrected locally',start:'09:00',end:'10:00',notes:'Time was edited on phone'}
      ],todos:[{id:'todo',text:'Keep this task'}],noteItems:[{id:'note',text:'Keep this note'}]},
      '2026-10-28':{appts:[{id:'shift',who:'work',title:'Work shift',start:'15:00',end:'23:00'}],todos:[],noteItems:[]}
    },
    recurring:[{id:'keep-recurring',who:'work',title:'Work repeats'}],
    meta:{driveBackup:{enabled:false},googleCalendar:{connected:false},customSetting:'keep'}
  };
  env.api.setState(json(original));
  const pack={
    format:'max-planner-mum-samsung-import-v1',
    events:[
      {icsUidHash:'aaaaaaaaaaaaaaaaaaaaaaaa',date:'2026-10-27',start:'13:00',end:'14:00',title:'Existing appointment',notes:'',location:'',allDay:false},
      {icsUidHash:'bbbbbbbbbbbbbbbbbbbbbbbb',date:'2026-10-27',start:'10:00',end:'11:00',title:'Time corrected locally',notes:'',location:'',allDay:false},
      {icsUidHash:'cccccccccccccccccccccccc',date:'2026-10-28',start:'11:30',end:'12:30',title:'New Samsung Mum appointment',notes:'Local Samsung description',location:'Clinic',allDay:false}
    ]
  };
  const first=env.context.MaxPlannerMumSamsungImport.inspect(pack);
  assert.equal(first.total,3);
  assert.equal(first.already,1);
  assert.equal(first.timeConflict,1);
  assert.equal(first.eligible.length,1);
  const result=env.context.MaxPlannerMumSamsungImport.apply(pack);
  assert.equal(result.imported,1);
  let state=json(env.api.getState());
  assert.equal(state.data['2026-10-27'].appts.length,2);
  assert.deepEqual(state.data['2026-10-27'].appts[0],original.data['2026-10-27'].appts[0]);
  assert.deepEqual(state.data['2026-10-27'].appts[1],original.data['2026-10-27'].appts[1]);
  const added=state.data['2026-10-28'].appts.find(e=>e.who==='mum');
  assert.ok(added);
  assert.equal(added.title,'New Samsung Mum appointment');
  assert.equal(added.colorKey,'coral');
  assert.match(added.notes,/Local Samsung description/);
  assert.equal(state.data['2026-10-28'].appts[0].id,'shift');
  assert.deepEqual(state.data['2026-10-27'].todos,original.data['2026-10-27'].todos);
  assert.deepEqual(state.data['2026-10-27'].noteItems,original.data['2026-10-27'].noteItems);
  assert.deepEqual(state.recurring,original.recurring);
  assert.equal(state.meta.customSetting,'keep');
  const repeated=env.context.MaxPlannerMumSamsungImport.apply(pack);
  assert.equal(repeated.imported,0);
  state=json(env.api.getState());
  assert.equal(state.data['2026-10-28'].appts.filter(a=>a.who==='mum').length,1);
});
test('invalid Samsung rescue file is rejected before altering appointments',async()=>{
  const env=await app();
  const initial=json(env.api.getState());
  assert.throws(()=>env.context.MaxPlannerMumSamsungImport.apply({format:'unknown',events:[]}),/not a valid/);
  assert.deepEqual(json(env.api.getState()),initial);
});

test('23:00 rollover moves only unfinished tasks since activation, preserving every other record',()=>{
  const completed={id:'done',text:'Keep completed on original day',status:'completed'};
  const pending={id:'pending',text:'Move to tomorrow',status:'pending',custom:'keep'};
  const before={
    '2026-10-30':{appts:[],todos:[{id:'historical',text:'Old task',status:'pending'}],noteItems:[]},
    '2026-11-02':{appts:[{id:'appointment',title:'Do not touch'}],todos:[completed,pending],noteItems:[{id:'note',text:'Keep notes'}]},
    '2026-11-03':{appts:[{id:'tomorrow',title:'Preserve tomorrow'}],todos:[{id:'existing',text:'Already scheduled',status:'pending'}],noteItems:[]},
    '2026-11-04':{appts:[],todos:[{id:'future',text:'Future task'}],noteItems:[]}
  };
  const result=Core.rolloverPendingTodos(before,'2026-11-03','2026-11-02');
  assert.equal(result.moved,1);
  assert.deepEqual(before['2026-11-02'].todos,[completed,pending],'Original input was not mutated');
  assert.deepEqual(result.data['2026-10-30'],before['2026-10-30']);
  assert.deepEqual(result.data['2026-11-02'].todos,[completed]);
  assert.deepEqual(result.data['2026-11-02'].appts,before['2026-11-02'].appts);
  assert.deepEqual(result.data['2026-11-02'].noteItems,before['2026-11-02'].noteItems);
  assert.deepEqual(result.data['2026-11-03'].todos,[before['2026-11-03'].todos[0],pending]);
  assert.deepEqual(result.data['2026-11-03'].appts,before['2026-11-03'].appts);
  assert.deepEqual(result.data['2026-11-04'],before['2026-11-04']);
  const second=Core.rolloverPendingTodos(result.data,'2026-11-03','2026-11-02');
  assert.equal(second.moved,0);
  assert.strictEqual(second.data,result.data,'Second execution did not duplicate or rewrite tasks');
});

test('automatic rollover waits until exactly 23:00 and saves completed history',async()=>{
  const original={
    data:{
      '2026-11-02':{appts:[],todos:[{id:'t-pending',text:'Unfinished',status:'pending'},{id:'t-done',text:'Finished',status:'completed'}],noteItems:[]},
      '2026-11-03':{appts:[],todos:[{id:'t-tomorrow',text:'Already tomorrow',status:'pending'}],noteItems:[]}
    },recurring:[],meta:{disabledDefaults:[],todoRolloverStartedOn:'2026-11-02'}
  };
  const env=await app(storageFor(original));
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,2,22,59,59)),0);
  assert.equal(env.api.getState().data['2026-11-02'].todos.length,2);
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,2,23,0,0)),1);
  const state=json(env.api.getState());
  assert.deepEqual(state.data['2026-11-02'].todos,[original.data['2026-11-02'].todos[1]]);
  assert.deepEqual(state.data['2026-11-03'].todos,[original.data['2026-11-03'].todos[0],original.data['2026-11-02'].todos[0]]);
  assert.deepEqual(JSON.parse(env.localStorage.getItem('max-planner-v1'))['2026-11-03'].todos,state.data['2026-11-03'].todos);
  assert.ok([...env.records.values()].some(s=>s.reason==='before-auto-todo-rollover'),'A safety snapshot is made before moving tasks');
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,2,23,0,5)),0,'Repeated check is idempotent');
});

test('unfinished tasks catch up across closed days, leaving completed tasks behind',async()=>{
  const seed={
    data:{
      '2026-11-02':{appts:[],todos:[{id:'mon',text:'Monday unfinished',status:'pending'},{id:'mon-done',text:'Done on Monday',status:'completed'}],noteItems:[]},
      '2026-11-03':{appts:[],todos:[{id:'tue',text:'Tuesday unfinished',status:'pending'}],noteItems:[]},
      '2026-11-05':{appts:[],todos:[{id:'thu',text:'Thursday already planned',status:'pending'}],noteItems:[]}
    },recurring:[],meta:{disabledDefaults:[],todoRolloverStartedOn:'2026-11-02'}
  };
  const env=await app(storageFor(seed));
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,5,10,0)),2);
  const state=json(env.api.getState().data);
  assert.deepEqual(state['2026-11-02'].todos,[seed.data['2026-11-02'].todos[1]]);
  assert.deepEqual(state['2026-11-03'].todos,[]);
  assert.deepEqual(state['2026-11-05'].todos.map(t=>t.id),['thu','mon','tue']);
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,5,23,0)),3,'At 23:00 the unfinished list moves to November 6');
  assert.deepEqual(json(env.api.getState().data)['2026-11-06'].todos.map(t=>t.id),['thu','mon','tue']);
});

test('first activation does not sweep historical unfinished to-dos',async()=>{
  const seed={
    data:{
      '2026-10-26':{appts:[],todos:[{id:'old',text:'Historical task',status:'pending'}],noteItems:[]},
      '2026-11-02':{appts:[],todos:[{id:'today',text:'New task',status:'pending'}],noteItems:[]}
    },recurring:[],meta:{disabledDefaults:[]}
  };
  const env=await app(storageFor(seed));
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,2,22,0)),0);
  assert.equal(env.api.getState().meta.todoRolloverStartedOn,'2026-11-02');
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,2,23,0)),1);
  const state=json(env.api.getState().data);
  assert.deepEqual(state['2026-10-26'].todos,seed.data['2026-10-26'].todos);
  assert.deepEqual(state['2026-11-03'].todos,[seed.data['2026-11-02'].todos[0]]);
});

test('failed automatic save leaves original to-dos available and raises a storage warning',async()=>{
  const seed={
    data:{'2026-11-02':{appts:[],todos:[{id:'safe',text:'Must not lose',status:'pending'}],noteItems:[]}},
    recurring:[],meta:{disabledDefaults:[],todoRolloverStartedOn:'2026-11-02'}
  };
  const env=await app(storageFor(seed));
  env.localStorage.fail=key=>key==='max-planner-v1';
  assert.equal(await env.api.autoRolloverPendingTodos(new Date(2026,10,2,23,0)),0);
  assert.deepEqual(json(env.api.getState().data)['2026-11-02'].todos,seed.data['2026-11-02'].todos);
  assert.deepEqual(JSON.parse(env.localStorage.getItem('max-planner-v1'))['2026-11-02'].todos,seed.data['2026-11-02'].todos);
  assert.ok(env.document.getElementById('storageWarning'));
});


test('screenshot appointments repeat daily on 6 November through 31 December, but never into 2027',async()=>{
  const env=await app();
  env.api.runStartupMaintenance();
  const data=json(env.api.getState().data);
  const wanted=[
    ['08:15','09:00','Wake up, shower, coffee','mine','mint'],
    ['09:15','09:45','Walk the dogs','shared','sky'],
    ['10:00','10:30','Breakfast','mine','mint'],
    ['14:00','14:45','Lunch/Food','mine','sky']
  ];
  let days=0;
  for(let d=new Date(2026,10,6);d<=new Date(2026,11,31);d.setDate(d.getDate()+1)){
    days++;
    const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    assert.ok(data[key],key+' exists');
    for(const [start,end,title,who,colorKey] of wanted){
      const matches=json(env.api.mergedAppts(key)).filter(a=>a.title===title&&a.start===start&&a.end===end);
      assert.equal(matches.length,1,key+' has exactly one '+title+' appointment');
      assert.equal(matches[0].who,who,key+' '+title+' owner');
      if(!matches[0].source?.includes('daily-morning-routine')) assert.equal(matches[0].colorKey,colorKey,key+' '+title+' color');
    }
    assert.equal(json(env.api.mergedAppts(key)).filter(a=>a.title==='Wake up, shower, coffee'&&a.start==='08:30').length,0,key+' no duplicate 08:30 wake-up');
  }
  assert.equal(days,56);
  assert.ok(!data['2027-01-01']?.appts?.some(a=>wanted.some(x=>x[2]===a.title)),'No Jan 2027 daily copies');
  assert.equal(env.api.getState().meta.dailyRoutineNov6ToDec31V48Applied,true);
});

test('existing screenshot entries stay intact, old duplicate wake-up stays archived and hidden',async()=>{
  const originals=[
    {id:'screen-wake',title:'Wake up, shower, coffee',start:'08:15',end:'09:00',who:'mine',category:'meal',notes:'Morning personal note',status:'completed',expenseLink:{id:'linked'}},
    {id:'travel-one',title:'Travel Time',start:'09:00',end:'09:15',who:'other',notes:'Do not touch trip'},
    {id:'screen-dog',title:'Walk the dogs',start:'09:15',end:'09:45',who:'shared',colorKey:'sky'},
    {id:'screen-breakfast',title:'Make Breakfast',start:'10:00',end:'10:30',who:'mine',colorKey:'mint'},
    {id:'screen-lunch',title:'Lunch/Food',start:'14:00',end:'14:45',who:'mine',colorKey:'sky'},
    {id:'old-auto',title:'Wake up, shower, coffee',start:'08:30',end:'09:00',who:'mine',category:'general',subcategory:'general',colorKey:'auto',status:'pending',source:'daily-morning-routine-2026'}
  ];
  const seed={data:{
    '2026-11-05':{appts:[{id:'earlier',title:'Keep earlier date',start:'10:00',end:'10:30'}],todos:[{id:'task-before',text:'Old task'}],noteItems:[]},
    '2026-11-06':{appts:originals,todos:[{id:'task',text:'To-do remains'}],noteItems:[{id:'note',text:'Original note'}]},
    '2026-11-07':{appts:[{id:'old-auto-7',title:'Wake up, shower, coffee',start:'08:30',end:'09:00',who:'mine',category:'general',subcategory:'general',colorKey:'auto',status:'pending',source:'daily-morning-routine-2026'}],todos:[],noteItems:[]}
  },recurring:[{id:'reminder',type:'reminder',title:'Reminder',startDate:'2026-11-01',repeat:'daily',who:'mum'}],meta:{disabledDefaults:[],dailyMorningRoutineThrough2026V46Applied:true,workRosterNov2To8V45Applied:true}};
  const env=await app(storageFor(seed));
  const preMigration=json(env.api.getState().data['2026-11-06'].appts);
  env.api.runStartupMaintenance();
  const state=json(env.api.getState());
  const day=state.data['2026-11-06'];
  for(const entry of preMigration){
    const found=day.appts.find(a=>a.id===entry.id);
    assert.ok(found,'Preserves original '+entry.id);
    for(const [key,value] of Object.entries(entry)){
      if(entry.id==='screen-breakfast'&&key==='title') assert.equal(found.title,'Breakfast','Requested shorter title applied in place');
      else assert.deepEqual(found[key],value,'Preserves '+entry.id+'.'+key);
    }
  }
  assert.equal(day.appts.find(a=>a.id==='old-auto').supersededByDailyRoutineV48,true);
  assert.equal(json(env.api.mergedAppts('2026-11-06')).filter(a=>a.title==='Wake up, shower, coffee').length,1);
  assert.equal(day.todos[0].text,'To-do remains');
  assert.equal(day.noteItems[0].text,'Original note');
  assert.equal(state.data['2026-11-05'].appts[0].title,'Keep earlier date');
  assert.equal(state.data['2026-11-05'].todos[0].text,'Old task');
  assert.equal(state.recurring[0].id,'reminder');
  const fixed=state.data['2026-11-07'].appts.find(a=>a.id==='old-auto-7');
  assert.equal(fixed.start,'08:15','Untouched old default corrected in place');
  assert.equal(fixed.end,'09:00');
  assert.equal(fixed.source,'daily-morning-routine-2026');
  assert.equal(state.data['2026-11-07'].appts.filter(a=>a.title==='Wake up, shower, coffee').length,1);
});

test('daily appointment migration is idempotent across reopening with original IDs',async()=>{
  const env=await app();
  env.api.runStartupMaintenance();
  const first=json(env.api.getState());
  env.api.runStartupMaintenance();
  assert.deepEqual(json(env.api.getState()),first);
  const reopened=await app(storageFor(first));
  reopened.api.runStartupMaintenance();
  assert.deepEqual(json(reopened.api.getState().data['2026-11-09'].appts),first.data['2026-11-09'].appts);
  assert.equal(json(reopened.api.mergedAppts('2026-11-09')).filter(a=>a.title==='Walk the dogs').length,1);
});

test('manually changed previous wake-up is kept alongside new requested routine',async()=>{
  const edited={id:'edited-user',start:'08:30',end:'09:00',title:'Wake up, shower, coffee',who:'mine',status:'completed',source:'daily-morning-routine-2026',notes:'Important completed details',colorKey:'purple'};
  const seed={data:{'2026-11-10':{appts:[edited],todos:[],noteItems:[]}},recurring:[],meta:{dailyMorningRoutineThrough2026V46Applied:true}};
  const env=await app(storageFor(seed));
  const originalAfterExistingMigrations=json(env.api.getState().data['2026-11-10'].appts.find(a=>a.id===edited.id));
  env.api.runStartupMaintenance();
  const day=json(env.api.getState().data['2026-11-10']);
  assert.deepEqual(day.appts.find(a=>a.id===edited.id),originalAfterExistingMigrations);
  assert.ok(day.appts.some(a=>a.title===edited.title&&a.start==='08:15'&&a.status==='pending'));
});

test('routine migration rolls back in-memory data if local device storage fails',async()=>{
  const seed={data:{'2026-11-06':{appts:[{id:'old',start:'08:30',end:'09:00',title:'Wake up, shower, coffee',status:'pending',source:'daily-morning-routine-2026'}],todos:[],noteItems:[]}},recurring:[],meta:{dailyMorningRoutineThrough2026V46Applied:true}};
  const env=await app(storageFor(seed));
  const before=json(env.api.getState());
  env.localStorage.fail=key=>key==='max-planner-v1';
  env.api.runStartupMaintenance();
  assert.deepEqual(json(env.api.getState()),before,'In-memory planner retains original entries');
  assert.equal(JSON.parse(env.localStorage.getItem('max-planner-v1'))['2026-11-06'].appts[0].start,'08:30','Stored data remains unchanged');
  assert.ok(env.document.getElementById('storageWarning'),'Storage failure is visible');
});


test('day view shades the full 11:00–14:00 client-hours rows on every day without adding appointments',async()=>{
  const env=await app();
  const safeDay=()=>({appts:[],todos:[],noteItems:[],recurringHidden:{},recurringStatus:{},defaultStatus:{},workSupportSuppressed:{}});
  const fixture={
    data:{'2026-11-06':safeDay(),'2027-01-20':safeDay()},
    recurring:[],
    meta:{disabledDefaults:[],dailyRoutineNov6ToDec31V48Applied:true}
  };
  env.api.setState(json(fixture));
  for(const day of [new Date(2026,10,6),new Date(2027,0,20)]){
    env.api.setDate(day);
    const before=json(env.api.getState());
    env.api.renderDay();
    const rows=env.document.getElementById('slots').children.filter(x=>x.classList.contains('slot'));
    assert.ok(rows.length>=14,'Day view includes 11:00 through 14:00');
    for(const h of [8,9,10,11,12,13,14,15]){
      const row=rows.find(x=>x.children[0]?.innerHTML.includes(String(h).padStart(2,'0')+':00'));
      assert.ok(row,'Hour '+h+' exists');
      assert.equal(row.classList.contains('clientHours'),h>=11&&h<14,'Only client hours shaded: '+h);
      assert.equal(row.classList.contains('clientHoursStart'),h===11,'Top boundary');
      assert.equal(row.classList.contains('clientHoursEnd'),h===13,'Bottom boundary');
      assert.equal(typeof row.children[0]?.onclick,'function','Time column still adds appointments');
      if(h>=11&&h<14)assert.equal(typeof row.children[1]?.children.find(x=>x.className==='addslot')?.onclick,'function','Empty client hour still allows booking');
    }
    assert.deepEqual(json(env.api.getState()),before,'Background-only feature does not change planner data');
  }
  assert.match(html,/\.slot\.clientHours\s*\{\s*background:\s*var\(--client-hours-bg\)/,'Whole row has grey background');
  assert.match(html,/--client-hours-bg:#e3e8ef/,'Light mode grey available');
  assert.match(html,/--client-hours-bg:#303842/,'Dark mode grey available');
});

test('overlapping coloured client appointments stay as normal tappable cards above the grey background',async()=>{
  const env=await app();
  const entries=[
    {id:'client-1',title:'Pick up Folder Kornelia',start:'11:00',end:'11:30',who:'other',category:'general',subcategory:'general',colorKey:'purple',status:'pending',notes:''},
    {id:'client-2',title:'See Clients/ Work',start:'11:00',end:'14:00',who:'work',category:'work',subcategory:'shift',colorKey:'slate',status:'pending',notes:''}
  ];
  const fixture={
    data:{'2026-11-06':{appts:entries,todos:[],noteItems:[],recurringHidden:{},recurringStatus:{},defaultStatus:{},workSupportSuppressed:{}}},
    recurring:[],meta:{disabledDefaults:[],dailyRoutineNov6ToDec31V48Applied:true}
  };
  env.api.setState(json(fixture));
  env.api.setDate(new Date(2026,10,6));
  const before=json(env.api.getState());
  env.api.renderDay();
  const children=env.document.getElementById('slots').children;
  const rows=children.filter(x=>x.classList.contains('slot'));
  const row=rows.find(x=>x.children[0]?.innerHTML.includes('11:00'));
  assert.ok(row.classList.contains('clientHours'),'Time beneath appointments is grey');
  const layer=children.find(x=>x.id==='spanLayer');
  assert.ok(layer,'Existing overlapping appointment layer is still present');
  const clientCards=layer.children.filter(x=>/Pick up Folder Kornelia|See Clients\/ Work/.test(x.innerHTML));
  assert.equal(clientCards.length,2,'Both requested client appointments remain on top');
  assert.ok(clientCards.some(x=>x.className.includes('color-purple')),'First appointment retains original purple colour');
  assert.ok(clientCards.some(x=>x.className.includes('color-slate')),'Second appointment retains original slate colour');
  assert.ok(clientCards.every(x=>x.className.includes('appt span')),'Normal appointment cards are unchanged');
  assert.ok(clientCards.every(x=>x.listeners.pointerdown && x.listeners.pointerup),'Appointments remain interactive');
  assert.notEqual(clientCards[0].style.left,clientCards[1].style.left,'Overlaps remain in two columns');
  assert.deepEqual(json(env.api.getState()),before,'Viewing client hours makes no data changes');
});


test('both purple Travel Time slots and one green Breakfast appear daily Nov 6–Dec 31 only',async()=>{
  const env=await app();
  env.api.runStartupMaintenance();
  const before=json(env.api.getState());
  let dayCount=0;
  for(let date=new Date(2026,10,6);date<=new Date(2026,11,31);date.setDate(date.getDate()+1)){
    dayCount++;
    const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    const visible=json(env.api.mergedAppts(key));
    for(const [start,end] of [['09:00','09:15'],['09:45','10:00']]){
      const matches=visible.filter(a=>a.title==='Travel Time'&&a.start===start&&a.end===end);
      assert.equal(matches.length,1,key+' has exactly one Travel Time '+start);
      assert.equal(matches[0].colorKey,'purple');
      assert.equal(matches[0].who,'other');
    }
    const breakfast=visible.filter(a=>a.title==='Breakfast'&&a.start==='10:00'&&a.end==='10:30');
    assert.equal(breakfast.length,1,key+' has one Breakfast');
    assert.equal(breakfast[0].colorKey,'mint',key+' Breakfast stays green');
    assert.equal(visible.filter(a=>a.title==='Make Breakfast'&&a.start==='10:00').length,0,key+' no old Make Breakfast');
  }
  assert.equal(dayCount,56);
  const nextYear=json(env.api.mergedAppts('2027-01-01'));
  assert.equal(nextYear.filter(a=>a.title==='Travel Time'&&['09:00','09:45'].includes(a.start)).length,0,'No travel beyond Dec 31');
  assert.equal(env.api.getState().meta.dailyTravelBreakfastV49Applied,true);
  env.api.runStartupMaintenance();
  const after=json(env.api.getState());
  assert.deepEqual(after.data['2026-11-06'].appts,before.data['2026-11-06'].appts,'Daily migration is idempotent');
  assert.equal(after.meta.dailyTravelBreakfastV49Applied,true);
});

test('existing manually created travel and breakfast appointments are retained without visible duplicates',async()=>{
  const records=[
    {id:'original-breakfast',title:'Breakfast',start:'10:00',end:'10:30',who:'mine',colorKey:'sky',status:'completed',notes:'Favorite meal',expenseLink:{id:'link-1'}},
    {id:'newer-make-breakfast',title:'Make Breakfast',start:'10:00',end:'10:30',who:'mine',colorKey:'mint',status:'pending',source:'screenshot-daily-routine-2026-v48'},
    {id:'first-travel',title:'Travel Time',start:'09:00',end:'09:15',who:'other',colorKey:'lavender',notes:'Car journey',status:'completed'},
    {id:'duplicate-travel',title:'Travel Time',start:'09:00',end:'09:15',who:'other',colorKey:'sky',status:'pending'},
    {id:'second-travel',title:'Travel Time',start:'09:45',end:'10:00',who:'other',colorKey:'purple',status:'pending'},
    {id:'personal-appointment',title:'My appointment',start:'12:30',end:'13:30',who:'mine',status:'completed',notes:'Private notes'}
  ];
  const seed={data:{'2026-11-06':{appts:records,todos:[{id:'todo',text:'Retain to-do'}],noteItems:[{id:'n',text:'Retain note'}]}},recurring:[{id:'rec',type:'reminder',title:'Mum reminder',who:'mum',startDate:'2026-11-01',repeat:'weekly'}],meta:{dailyRoutineNov6ToDec31V48Applied:true,dailyMorningRoutineThrough2026V46Applied:true}};
  const env=await app(storageFor(seed));
  const originals=json(env.api.getState().data['2026-11-06'].appts);
  env.api.runStartupMaintenance();
  const day=json(env.api.getState().data['2026-11-06']),visible=json(env.api.mergedAppts('2026-11-06'));
  assert.equal(day.appts.filter(a=>records.some(r=>r.id===a.id)).length,records.length,'All source records are kept');
  assert.equal(visible.filter(a=>a.title==='Breakfast'&&a.start==='10:00').length,1);
  assert.equal(visible.filter(a=>a.title==='Make Breakfast'&&a.start==='10:00').length,0);
  assert.equal(day.appts.find(a=>a.id==='newer-make-breakfast').supersededByRoutineV49,true);
  const chosen=day.appts.find(a=>a.id==='original-breakfast');
  assert.equal(chosen.status,'completed');
  assert.equal(chosen.notes,'Favorite meal');
  assert.deepEqual(chosen.expenseLink,{id:'link-1'});
  assert.equal(chosen.colorKey,'mint','Standard green colour');
  const firstTravel=day.appts.find(a=>a.id==='first-travel');
  assert.equal(firstTravel.notes,'Car journey');
  assert.equal(firstTravel.status,'completed');
  assert.equal(firstTravel.colorKey,'purple');
  assert.equal(day.appts.find(a=>a.id==='duplicate-travel').supersededByRoutineV49,true);
  assert.equal(visible.filter(a=>a.title==='Travel Time'&&a.start==='09:00').length,1);
  assert.equal(visible.filter(a=>a.title==='Travel Time'&&a.start==='09:45').length,1);
  assert.deepEqual(day.appts.find(a=>a.id==='personal-appointment'),originals.find(a=>a.id==='personal-appointment'));
  assert.equal(day.todos[0].text,'Retain to-do');assert.equal(day.noteItems[0].text,'Retain note');
  assert.equal(json(env.api.getState().recurring)[0].id,'rec');
});

test('newer Make Breakfast is renamed in place when no other Breakfast is stored',async()=>{
  const existingBreakfast={id:'v48-breakfast',title:'Make Breakfast',start:'10:00',end:'10:30',who:'mine',colorKey:'mint',status:'completed',notes:'Preserve this note',source:'screenshot-daily-routine-2026-v48'};
  const seed={data:{'2026-11-06':{appts:[existingBreakfast],todos:[],noteItems:[]}},recurring:[],meta:{dailyRoutineNov6ToDec31V48Applied:true,dailyMorningRoutineThrough2026V46Applied:true}};
  const env=await app(storageFor(seed));
  env.api.runStartupMaintenance();
  const day=json(env.api.getState().data['2026-11-06']);
  const found=day.appts.find(a=>a.id==='v48-breakfast');
  assert.equal(found.title,'Breakfast');assert.equal(found.notes,existingBreakfast.notes);assert.equal(found.status,'completed');
  assert.equal(day.appts.filter(a=>a.title==='Breakfast'&&a.start==='10:00').length,1);
  assert.equal(json(env.api.mergedAppts('2026-11-06')).filter(a=>a.title==='Breakfast'&&a.start==='10:00').length,1,'Legacy virtual default stays suppressed');
});

test("Mum's appointments always have the exact reminder red regardless of owner-specified category and colour",async()=>{
  const env=await app();
  for(const config of [
    {who:'mum',title:'Mum lunch',category:'meal',colorKey:'mint'},
    {who:'mum',title:'Mum doctor',category:'health',colorKey:'purple'},
    {who:'mum',title:'Google imported event',category:'general',colorKey:'coral',source:'google-calendar-mum'},
    {who:'mum',title:'Mum admin',category:'admin',colorKey:'teal'},
    {who:'mum',title:'Recurring appointment',category:'meal',colorKey:'orange',isRecurring:true},
  ]){
    const cls=env.api.appointmentVisualClass(config);
    assert.match(cls,/\bmumAppointment\b/,config.title+' gets Mum colour class');
  }
  assert.doesNotMatch(env.api.appointmentVisualClass({who:'mine',title:'Lunch with Mum',category:'meal',colorKey:'mint'}),/\bmumAppointment\b/);
  const colourRule='.preview.mumAppointment,.weekAppt.mumAppointment,.appt.mumAppointment';
  const ruleIndex=html.indexOf(colourRule);
  assert.ok(ruleIndex>html.indexOf('.appt.color-slate'),'Mum colour rule comes after all category and palette colours');
  assert.match(html.slice(ruleIndex,ruleIndex+190),/background:var\(--pal-coral-bg\);color:var\(--mum\)/,'Colour matches the recurring Mum note');
  assert.match(html,/\.noteItem\.noteMum,.autoNote\.noteMum\{background:var\(--pal-coral-bg\);color:var\(--mum\)/,'Mum reminders use same palette');
});

test('unopposed Mum entry occupies only the right half; unrelated personal entry stays full width',async()=>{
  const env=await app();
  const day={appts:[
    {id:'mum',title:'Mum lunch',who:'mum',start:'12:00',end:'13:00',colorKey:'mint',category:'meal',status:'pending'},
    {id:'personal',title:'Personal afternoon',who:'mine',start:'15:00',end:'16:00',colorKey:'sky',status:'pending'}
  ],todos:[],noteItems:[]};
  env.api.setState({data:{'2026-11-09':day},recurring:[],meta:{disabledDefaults:[],dailyRoutineNov6ToDec31V48Applied:true}});
  env.api.setDate(new Date(2026,10,9));
  env.api.renderDay();
  const before=json(env.api.getState());
  const layer=env.document.getElementById('spanLayer');
  const mum=layer.children.find(x=>x.innerHTML.includes('Mum lunch')),personal=layer.children.find(x=>x.innerHTML.includes('Personal afternoon'));
  assert.ok(mum&&personal);
  assert.equal(mum.style.left,'calc(50% + 0px)');
  assert.equal(mum.style.width,'calc(50% - 0px)');
  assert.ok(mum.className.includes('mumAppointment'),'Mum dark red style applied');
  assert.equal(personal.style.left,'calc(0% + 0px)');
  assert.equal(personal.style.width,'calc(100% - 0px)','Non-overlapping personal appointment remains full width');
  assert.equal(typeof mum.listeners.pointerdown==='function',true,'Mum card remains clickable');
  assert.deepEqual(json(env.api.getState()),before,'Right-hand lane adds no storage changes');
});

test('Mum and personal appointments overlapping simultaneously stay on separate left and right sides',async()=>{
  const env=await app();
  const entries=[
    {id:'p1',who:'mine',title:'My client',start:'11:00',end:'12:00',colorKey:'sky'},
    {id:'p2',who:'work',title:'My phone appointment',start:'11:00',end:'11:30',colorKey:'purple',subcategory:'meeting'},
    {id:'m1',who:'mum',title:'Mum appointment',start:'11:00',end:'12:00',colorKey:'sky',category:'general'},
    {id:'m2',who:'mum',title:'Mum other appointment',start:'11:00',end:'11:30',colorKey:'mint',category:'meal'}
  ];
  env.api.setState({data:{'2026-11-09':{appts:entries,todos:[],noteItems:[]}},recurring:[],meta:{disabledDefaults:[],dailyRoutineNov6ToDec31V48Applied:true}});
  env.api.setDate(new Date(2026,10,9));env.api.renderDay();
  const layer=env.document.getElementById('spanLayer');
  const find=t=>layer.children.find(x=>x.innerHTML.includes(t));
  for(const title of ['My client','My phone appointment','Mum appointment','Mum other appointment'])assert.ok(find(title),'Appointment rendered: '+title);
  const p1=find('My client'),p2=find('My phone appointment'),m1=find('Mum appointment'),m2=find('Mum other appointment');
  assert.deepEqual([p1.style.left,p2.style.left].sort(),['calc(0% + 0px)','calc(25% + 2px)'],'Both personal appointments stay entirely left');
  assert.deepEqual([m1.style.left,m2.style.left].sort(),['calc(50% + 0px)','calc(75% + 2px)'],'Both Mum appointments stay entirely right');
  assert.match(p1.style.width,/calc\(25%/);
  assert.match(m1.style.width,/calc\(25%/);
  assert.ok(m1.className.includes('mumAppointment')&&m2.className.includes('mumAppointment'));
  assert.equal(typeof m1.listeners.pointerdown==='function',true);
});

test('Mum entries without end time appear on the right half and still support tap/long press',async()=>{
  const env=await app();
  env.api.setState({data:{'2026-11-09':{appts:[{id:'m-unbounded',title:'Mum quick note',who:'mum',start:'17:00',end:'',colorKey:'blue'}],todos:[],noteItems:[]}},recurring:[],meta:{disabledDefaults:[],dailyRoutineNov6ToDec31V48Applied:true}});
  env.api.setDate(new Date(2026,10,9));env.api.renderDay();
  const row=env.document.getElementById('slots').children.find(x=>x.classList.contains('slot')&&x.children[0].innerHTML.includes('17:00'));
  const mum=row.children[1].children.find(x=>x.innerHTML.includes('Mum quick note'));
  assert.ok(mum);
  assert.equal(mum.style.width,'50%');
  assert.equal(mum.style.marginLeft,'auto');
  assert.ok(mum.className.includes('mumAppointment'));
  assert.equal(typeof mum.listeners.pointerdown,'function');
});


test('November 9–22 screenshot roster adds exactly eleven 19:00–23:00 work shifts and expected support blocks',async()=>{
  const env=await app();
  env.api.runStartupMaintenance();
  const data=json(env.api.getState().data);
  const dates=['2026-11-10','2026-11-11','2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-20','2026-11-21','2026-11-22'];
  const dayOff=['2026-11-09','2026-11-12','2026-11-19'];
  for(const date of dates){
    const source=data[date].appts.filter(a=>a.source==='confirmed-waiter-roster-nov9-to22-2026');
    assert.equal(source.length,1,date+' has one inserted waiter shift');
    const shift=source[0];
    assert.equal(shift.start,'19:00');assert.equal(shift.end,'23:00');
    assert.equal(shift.who,'work');assert.equal(shift.category,'work');
    assert.equal(shift.subcategory,'shift');assert.equal(shift.status,'pending');
    const visible=json(env.api.mergedAppts(date));
    assert.equal(visible.filter(a=>a.id===shift.id).length,1,date+' is displayed without duplicates');
    for(const [name,start,end] of [
      ['Get ready for work','18:00','18:30'],['Drive to work','18:30','19:00']
    ]) assert.ok(visible.some(a=>a.title===name&&a.start===start&&a.end===end),date+' shows '+name);
  }
  for(const date of dayOff){
    assert.equal((data[date]?.appts||[]).filter(a=>a.source==='confirmed-waiter-roster-nov9-to22-2026').length,0,date+' remains without newly added work');
  }
  assert.equal(Object.values(data).flatMap(d=>d.appts||[]).filter(a=>a.source==='confirmed-waiter-roster-nov9-to22-2026').length,11);
  assert.equal(env.api.getState().meta.workRosterNov9To22V50Applied,true);
  assert.deepEqual(json(env.api.getState().meta.workRosterNov9To22V50Summary),{added:11,skipped:0});
  assert.equal((data['2026-11-23']?.appts||[]).filter(a=>a.source==='confirmed-waiter-roster-nov9-to22-2026').length,0);
});

test('work roster respects existing, overlapping and cancelled shifts without changing unrelated personal records',async()=>{
  const original=[
    {id:'existing',title:'Work',start:'19:00',end:'23:00',who:'work',subcategory:'shift',status:'completed',notes:'Already entered by Max'},
    {id:'other-note',title:'Client meeting',start:'11:00',end:'12:00',who:'mine',notes:'Preserve this'}
  ];
  const overlap={id:'overlap',title:'Waiter',start:'18:30',end:'22:30',who:'work',subcategory:'shift',status:'pending',notes:'Manual shift time'};
  const cancelled={id:'cancelled',title:'Work',start:'19:00',end:'23:00',who:'work',subcategory:'shift',status:'cancelled',notes:'Max cancelled this'};
  const seed={data:{
    '2026-11-10':{appts:original,todos:[{id:'todo',text:'Remember me'}],noteItems:[{id:'note',text:'Preserve notes'}]},
    '2026-11-11':{appts:[overlap],todos:[],noteItems:[]},
    '2026-11-13':{appts:[cancelled],todos:[],noteItems:[]}
  },recurring:[],meta:{disabledDefaults:[],dailyRoutineNov6ToDec31V48Applied:true,dailyTravelBreakfastV49Applied:true,workRosterNov2To8V45Applied:true}};
  const env=await app(storageFor(seed));
  const before=json(env.api.getState());
  env.api.runStartupMaintenance();
  const after=json(env.api.getState());
  assert.equal(after.meta.workRosterNov9To22V50Summary.skipped,3);
  assert.equal(after.meta.workRosterNov9To22V50Summary.added,8);
  for(const [date,id] of [['2026-11-10','existing'],['2026-11-11','overlap'],['2026-11-13','cancelled']]){
    const actual=after.data[date].appts.find(a=>a.id===id);
    const originalState=before.data[date].appts.find(a=>a.id===id);
    assert.ok(actual);
    for(const field of ['title','start','end','who','status','notes'])assert.equal(actual[field],originalState[field],date+' retains '+field);
    assert.equal(after.data[date].appts.filter(a=>a.source==='confirmed-waiter-roster-nov9-to22-2026').length,0,date+' has no duplicate');
  }
  assert.equal(after.data['2026-11-10'].appts.find(a=>a.id==='other-note').notes,'Preserve this');
  assert.equal(after.data['2026-11-10'].todos[0].text,'Remember me');
  assert.equal(after.data['2026-11-10'].noteItems[0].text,'Preserve notes');
  assert.equal(after.data['2026-11-14'].appts.filter(a=>a.source==='confirmed-waiter-roster-nov9-to22-2026').length,1);
});

test('work roster is idempotent on reopening and never re-adds intentionally removed new shifts',async()=>{
  const env=await app();
  env.api.runStartupMaintenance();
  const original=json(env.api.getState());
  const source='confirmed-waiter-roster-nov9-to22-2026';
  const ids=original.data['2026-11-14'].appts.filter(a=>a.source===source).map(a=>a.id);
  assert.equal(ids.length,1);
  original.data['2026-11-14'].appts=original.data['2026-11-14'].appts.filter(a=>a.source!==source);
  const reopened=await app(storageFor(original));
  reopened.api.runStartupMaintenance();
  const result=json(reopened.api.getState());
  assert.equal(result.data['2026-11-14'].appts.filter(a=>a.source===source).length,0,'Removed shift is not resurrected');
  assert.equal(result.data['2026-11-15'].appts.filter(a=>a.source===source).length,1);
  assert.equal(result.meta.workRosterNov9To22V50Applied,true);
});

test('failed storage during new work-roster migration keeps original appointments and flags unchanged',async()=>{
  const seed={data:{
    '2026-11-10':{appts:[{id:'keep',title:'Unrelated appointment',start:'09:30',end:'10:00',who:'mine',notes:'Do not lose me'}],todos:[{id:'task',text:'Keep this'}],noteItems:[]}
  },recurring:[],meta:{
    disabledDefaults:[],dailyRoutineNov6ToDec31V48Applied:true,dailyTravelBreakfastV49Applied:true,workRosterNov2To8V45Applied:true
  }};
  const env=await app(storageFor(seed));
  const before=json(env.api.getState());
  env.localStorage.fail=key=>key==='max-planner-v1';
  env.api.runStartupMaintenance();
  assert.deepEqual(json(env.api.getState()),before,'In-memory changes roll back on a failed write');
  assert.equal(JSON.parse(env.localStorage.getItem('max-planner-v1'))['2026-11-10'].appts[0].notes,'Do not lose me');
  assert.equal(env.api.getState().meta.workRosterNov9To22V50Applied,undefined,'Migration is retryable');
  assert.ok(env.document.getElementById('storageWarning'));
});
