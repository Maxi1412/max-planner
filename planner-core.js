(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.PlannerCore=api;
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function validateBackup(payload){
    if(!isObject(payload)||!isObject(payload.data)) throw new Error('This is not a valid planner backup.');
    for(const day of Object.values(payload.data)){
      if(!isObject(day)||('appts' in day&&!Array.isArray(day.appts))||('todos' in day&&!Array.isArray(day.todos))||('noteItems' in day&&!Array.isArray(day.noteItems))) throw new Error('The backup contains invalid planner entries.');
      if((day.appts||[]).some(item=>!isObject(item))) throw new Error('The backup contains an invalid appointment.');
    }
    if(payload.recurring!==undefined&&(!Array.isArray(payload.recurring)||payload.recurring.some(item=>!isObject(item)))) throw new Error('The backup contains invalid recurring items.');
    if(payload.meta!==undefined&&!isObject(payload.meta)) throw new Error('The backup contains invalid planner settings.');
    return {data:clone(payload.data),recurring:clone(payload.recurring||[]),meta:clone(payload.meta||{disabledDefaults:[]})};
  }
  function moveMonth(date,delta){
    const next=new Date(date),day=next.getDate();
    next.setDate(1);next.setMonth(next.getMonth()+delta);
    next.setDate(Math.min(day,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));
    return next;
  }
  function googleLinkage(appointment){
    if(appointment.googleEventId){
      const calendarId=String(appointment.googleCalendarId||'primary');
      return {googleEventId:String(appointment.googleEventId),googleCalendarId:calendarId,googleEventKey:appointment.googleEventKey||calendarId+'::'+appointment.googleEventId};
    }
    if(!String(appointment.id||'').startsWith('gcal-')) return null;
    try{
      const raw=decodeURIComponent(Array.from(atob(appointment.id.slice(5)),c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));
      const split=raw.indexOf('::');
      if(split<1||split===raw.length-2) return null;
      return {googleCalendarId:raw.slice(0,split),googleEventId:raw.slice(split+2),googleEventKey:raw};
    }catch(_){return null;}
  }
  function editedAppointment(original,fields,originalKey,nextKey){
    const next={...original,...fields},linkage=googleLinkage(original);
    for(const field of ['isDefault','defaultId','isRecurring','seriesId','isGeneratedWorkSupport']) delete next[field];
    if(!linkage) return next;
    Object.assign(next,linkage,{source:'google-calendar-mum'});
    const overrides={...(original.googleLocalOverrides||{})};
    for(const field of ['title','start','end','notes','who','category','subcategory','colorKey']) if(String(fields[field]??'')!==String(original[field]??'')) overrides[field]=true;
    if(originalKey!==nextKey) overrides.date=true;
    next.googleLocalOverrides=overrides;
    return next;
  }
  function selectMumCalendars(calendars,mumEmail){
    const target=calendars.find(cal=>String(cal.id||'').toLowerCase()===mumEmail.toLowerCase());
    if(!target) throw new Error('Mum’s calendar is not available to this Google account. Connect Mum’s account, or use an account that Mum has shared her calendar with.');
    const primary=calendars.find(cal=>cal.primary);
    return {calendars:String(primary?.id||'').toLowerCase()===mumEmail.toLowerCase()?calendars:[target],primaryId:String(primary?.id||''),targetId:String(target.id)};
  }
  function mergeGoogleCalendar(data,result,convert,now=new Date().toISOString()){
    const source='google-calendar-mum',next=clone(data),existing=new Map(),seen=new Set();
    const successful=new Set((result.calendars||[]).map(cal=>String(cal.id)));
    const stats={imported:0,updated:0,removed:0,missing:0};
    for(const [key,day] of Object.entries(next)){
      for(const appointment of day.appts||[]){
        const link=googleLinkage(appointment);
        if(!link||(appointment.source&&appointment.source!==source)) continue;
        const legacyEdited=!appointment.source;
        Object.assign(appointment,link,{source});
        if(legacyEdited&&!appointment.googleLocalOverrides) appointment.googleLocalOverrides={title:true,start:true,end:true,notes:true,date:true,who:true,category:true,subcategory:true,colorKey:true};
        const list=existing.get(link.googleEventKey)||[];list.push({key,appointment});existing.set(link.googleEventKey,list);
      }
    }
    for(const event of result.items||[]){
      const calendarId=String(event._calendarId||'primary');
      if(!successful.has(calendarId)||!event.id) continue;
      const stable=calendarId+'::'+event.id;
      if(seen.has(stable)) continue;
      seen.add(stable);
      const found=existing.get(stable)||[];
      if(event.status==='cancelled'){
        for(const entry of found){entry.appointment.googleSyncState='cancelled';entry.appointment.googleMissingAt=now;stats.missing++;}
        continue;
      }
      const converted=convert(event);
      if(!converted||converted.key<result.minKey||converted.key>result.maxKey) continue;
      if(!found.length){
        const day=next[converted.key]||(next[converted.key]={appts:[],todos:[],noteItems:[]});
        (day.appts||(day.appts=[])).push(converted.appt);stats.imported++;continue;
      }
      // Preserve existing distinct copies; never create another copy during sync.
      for(const entry of found){
        const old=entry.appointment,overrides=old.googleLocalOverrides||{};
        const merged={...old,...converted.appt,status:old.status||'pending',flag:!!old.flag,expenseLink:old.expenseLink||null};
        for(const field of ['who','category','subcategory','colorKey']) if(old[field]!==undefined) merged[field]=old[field];
        for(const field of ['title','start','end','notes']) if(overrides[field]) merged[field]=old[field];
        if(String(old.notes||'')!==String(old.googleNotes??old.notes??'')) merged.notes=old.notes;
        merged.googleLocalOverrides=overrides;delete merged.googleSyncState;delete merged.googleMissingAt;
        const targetKey=overrides.date?entry.key:converted.key,index=next[entry.key].appts.indexOf(old);
        if(targetKey===entry.key) next[entry.key].appts[index]=merged;
        else{
          next[entry.key].appts.splice(index,1);
          const target=next[targetKey]||(next[targetKey]={appts:[],todos:[],noteItems:[]});
          (target.appts||(target.appts=[])).push(merged);
        }
        stats.updated++;
      }
    }
    for(const [stable,entries] of existing){
      if(seen.has(stable)) continue;
      for(const entry of entries){
        const a=entry.appointment;
        if(entry.key<result.minKey||entry.key>result.maxKey||!successful.has(String(a.googleCalendarId))) continue;
        a.googleSyncState='missing';a.googleMissingAt=now;stats.missing++;
      }
    }
    return {data:next,...stats,total:seen.size};
  }
  return {validateBackup,moveMonth,googleLinkage,editedAppointment,selectMumCalendars,mergeGoogleCalendar};
});
