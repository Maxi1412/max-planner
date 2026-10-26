/* Local-only import of Mum's Samsung calendar rescue pack. User chooses file; no uploads. */
(() => {
  'use strict';
  const setup=()=>{
    const menu=document.querySelector('#menuModal .menuList');
    if(!menu||document.getElementById('mumSamsungLocalImportBtn'))return;
    const button=document.createElement('button');
    button.type='button';
    button.id='mumSamsungLocalImportBtn';
    button.textContent="Import Mum's local Samsung appointments";
    const status=document.createElement('div');
    status.id='mumSamsungLocalImportStatus';
    status.className='pwaMeta';
    status.textContent='One-time import; compares with your existing Mum appointments.';
    const picker=document.createElement('input');
    picker.type='file';
    picker.accept='.json,application/json';
    picker.style.display='none';
    picker.addEventListener('change',async()=>{
      const file=picker.files&&picker.files[0];
      if(!file)return;
      try{
        if(file.size>1500000)throw Error('The selected import file is too large.');
        if(!window.MaxPlannerMumSamsungImport)throw Error('Planner is still updating. Reopen Max Planner and retry.');
        const pack=JSON.parse(await file.text());
        const result=window.MaxPlannerMumSamsungImport.inspect(pack);
        const message=
          'Samsung calendar appointments checked: '+result.total+'\n'+
          'Missing to add: '+result.eligible.length+'\n'+
          'Already present: '+result.already+'\n'+
          'Same title but different time (preserved): '+result.timeConflict+'\n\n'+
          'No existing appointments, notes, shifts or backups will be deleted or replaced.';
        if(!result.eligible.length){
          alert(message+'\n\nNothing needs importing.');
          status.textContent='Import review complete · '+result.already+' already present · '+
            result.timeConflict+' time conflicts retained.';
          return;
        }
        if(!confirm(message+'\n\nAdd only the missing Mum appointments now?'))return;
        const applied=window.MaxPlannerMumSamsungImport.apply(pack);
        status.textContent='Import complete · '+applied.imported+' added · '+
          applied.already+' already present · '+applied.timeConflict+' time conflicts preserved.';
        alert('Imported '+applied.imported+
          ' Mum appointments in coral/red. Existing appointments and notes were preserved.');
      }catch(error){
        status.textContent='Import not completed. Existing data unchanged.';
        alert('Samsung import not completed: '+String(error&&error.message||error));
      }finally{
        picker.value='';
      }
    });
    button.addEventListener('click',()=>picker.click());
    const before=document.getElementById('googleCalendarConnectBtn');
    menu.insertBefore(button,before||null);
    menu.insertBefore(status,before||null);
    menu.appendChild(picker);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();