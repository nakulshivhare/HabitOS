(() => {
  'use strict';

  const KEY = 'habitOS_v5';
  const OLD_KEY = 'habitOS_v1';
  const MAX_HABITS = 30;
  const MAX_TASKS = 100;
  const palette = {
    indigo:'#4f46e5', blue:'#2563eb', emerald:'#059669', orange:'#ea580c', rose:'#e11d48', violet:'#7c3aed', teal:'#0d9488'
  };

  const localKey = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  };
  const fromKey = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d); };
  const monthKey = (y,m) => `${y}-${String(m+1).padStart(2,'0')}`;
  const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmtDate = key => fromKey(key).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const fmtMonth = (y,m) => new Date(y,m,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});

  function defaultDB(){
    return {
      version: 5,
      habits: [
        {id:1,name:'Study',target:1},
        {id:2,name:'Exercise / walk',target:1},
        {id:3,name:'Read / revise',target:1},
        {id:4,name:'Sleep on time',target:1}
      ],
      logs: {},
      reflections: {},
      tasks: {},
      settings: {view:'today', calendar:{y:new Date().getFullYear(),m:new Date().getMonth(),selected:localKey()}, theme:'light', accent:'indigo'}
    };
  }

  function normalise(raw){
    const d = defaultDB();
    if (!raw || typeof raw !== 'object') return d;
    d.habits = Array.isArray(raw.habits) ? raw.habits.slice(0,MAX_HABITS).map((h,i)=>({id:h.id ?? Date.now()+i,name:String(h.name ?? `Habit ${i+1}`).trim() || `Habit ${i+1}`,target:clamp(Number(h.target)||1,1,31)})) : d.habits;
    d.logs = raw.logs && typeof raw.logs === 'object' ? raw.logs : {};
    d.reflections = raw.reflections && typeof raw.reflections === 'object' ? raw.reflections : {};
    d.tasks = raw.tasks && typeof raw.tasks === 'object' ? raw.tasks : {};
    d.settings = {...d.settings,...(raw.settings||{})};
    if (!['today','calendar','progress'].includes(d.settings.view)) d.settings.view='today';
    if (!['light','dark'].includes(d.settings.theme)) d.settings.theme='light';
    if (!palette[d.settings.accent]) d.settings.accent='indigo';
    if (!d.settings.calendar || typeof d.settings.calendar !== 'object') d.settings.calendar=defaultDB().settings.calendar;
    return d;
  }

  function migrate(){
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
    if (raw) return normalise(raw);
    try {
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
      if (old) {
        const migrated = normalise({...old, version:5, settings:{view:old.view || 'today',calendar:{y:new Date().getFullYear(),m:new Date().getMonth(),selected:localKey()},theme:'light',accent:'indigo'}});
        localStorage.setItem(KEY,JSON.stringify(migrated));
        return migrated;
      }
    } catch {}
    return defaultDB();
  }

  let db = migrate();
  let deferredInstall = null;
  const $ = id => document.getElementById(id);

  function save(){ try{localStorage.setItem(KEY,JSON.stringify(db));}catch(e){toast('Storage is unavailable in this browser.');} }
  function applyTheme(){
    document.body.classList.toggle('dark',db.settings.theme==='dark');
    document.documentElement.style.setProperty('--accent',palette[db.settings.accent]);
    document.documentElement.style.setProperty('--accent-soft', `${palette[db.settings.accent]}18`);
    $('themeColorMeta')?.setAttribute('content',db.settings.theme==='dark'?'#0b1020':'#111827');
  }
  function toast(msg){
    const el=$('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2200);
  }

  function isDone(h,key=localKey()){ return !!db.logs[key]?.[h.id]; }
  function toggleHabit(hid,key=localKey()){
    const d = fromKey(key), today = fromKey(localKey());
    if (d > today) return toast('Future dates cannot be marked complete.');
    db.logs[key] ??= {};
    db.logs[key][hid] = !db.logs[key][hid];
    if (!db.logs[key][hid]) delete db.logs[key][hid];
    if (!Object.keys(db.logs[key]).length) delete db.logs[key];
    save(); render();
  }
  function streak(h){
    let n=0,d=new Date();
    while(isDone(h,localKey(d))){n++;d.setDate(d.getDate()-1);}
    return n;
  }
  function bestStreak(h){
    let best=0,n=0,previous=null;
    const days=Object.keys(db.logs).filter(key=>isDone(h,key)).sort();
    for(const key of days){
      const current=fromKey(key);
      const consecutive=previous && Math.round((current-previous)/86400000)===1;
      n=consecutive?n+1:1;
      best=Math.max(best,n);
      previous=current;
    }
    return best;
  }
  function monthStats(y,m){
    const totalDays=daysInMonth(y,m), todayKey=localKey();
    let completed=0, possible=0;
    db.habits.forEach(h=>{ for(let day=1;day<=totalDays;day++){const key=monthKey(y,m)+'-'+String(day).padStart(2,'0'); if(key<=todayKey){possible++;if(isDone(h,key))completed++;}} });
    return {completed,possible,pct:possible?Math.round(completed/possible*100):0,totalDays};
  }
  function last7(){
    const out=[]; const d=new Date();
    for(let i=6;i>=0;i--){const x=new Date(d);x.setDate(d.getDate()-i);const key=localKey(x);const completed=db.habits.filter(h=>isDone(h,key)).length;out.push({key,label:x.toLocaleDateString(undefined,{weekday:'short'}),completed,total:db.habits.length});}
    return out;
  }
  function daySummary(key){
    return {done:db.habits.filter(h=>isDone(h,key)).length,total:db.habits.length};
  }

  function render(){
    applyTheme();
    const view=db.settings.view;
    $('app').innerHTML=`<div class="app">
      <header class="top"><div><div class="brand">Habit OS</div><div class="sub">${esc(fmtDate(localKey()))}</div></div><div class="top-actions"><button class="icon-btn" data-action="settings" aria-label="Settings">⚙</button></div></header>
      ${installBanner()}
      ${view==='today'?todayPage():view==='calendar'?calendarPage():progressPage()}
    </div>
    <nav class="nav" aria-label="Main navigation">
      <button class="${view==='today'?'active':''}" data-view="today">✓ Today</button>
      <button class="${view==='calendar'?'active':''}" data-view="calendar">▦ Calendar</button>
      <button class="${view==='progress'?'active':''}" data-view="progress">◔ Progress</button>
    </nav>`;
  }

  function installBanner(){
    if (!deferredInstall || window.matchMedia('(display-mode: standalone)').matches) return '';
    return `<div class="install-banner"><span class="small"><b>Make Habit OS an app</b><br>Install it for quick, offline access.</span><button class="btn primary" data-action="install">Install</button><button class="icon-btn" data-action="hide-install" aria-label="Dismiss">×</button></div>`;
  }

  function todayPage(){
    const key=localKey(), s=daySummary(key), pct=s.total?Math.round(s.done/s.total*100):0;
    const tasks=db.tasks[key]||[];
    return `<section class="card hero"><div class="sub">TODAY</div><h1>${s.done}/${s.total} completed</h1><div class="progress"><i style="width:${pct}%"></i></div><div class="sub" style="margin-top:8px">${pct}% of today's habits complete</div><div class="hero-actions"><button class="btn" data-action="focus-calendar">Open calendar</button><button class="btn" data-action="focus-progress">View progress</button></div></section>
      <div class="section-title">Checklist</div>
      <div class="card">${taskList(key,tasks)}<div class="row" style="margin-top:10px"><input id="taskInput" class="input" placeholder="Add a task for today…" maxlength="120"><button class="btn primary" data-action="add-task">Add</button></div></div>
      <div class="section-title">Your habits</div>
      <div class="card">${db.habits.length?db.habits.map(h=>`<div class="habit"><button class="check ${isDone(h,key)?'done':''}" data-habit="${h.id}" aria-label="${isDone(h,key)?'Mark incomplete':'Mark complete'} ${esc(h.name)}">${isDone(h,key)?'✓':'○'}</button><div class="habit-info"><div class="habit-name">${esc(h.name)}</div><div class="habit-meta">🔥 ${streak(h)} day streak · Best ${bestStreak(h)} · Goal ${h.target} days/month</div></div></div>`).join(''):'<div class="empty">No habits yet. Add your first one from Settings.</div>'}</div>
      <div class="section-title">Quick reflection</div>${reflectionCard(key)}`;
  }

  function taskList(key,tasks){
    if(!tasks.length) return '<div class="empty" style="padding:18px 5px">No tasks yet. Keep this list short and useful.</div>';
    return `<ul class="checklist">${tasks.map((t,i)=>`<li class="task ${t.done?'done':''}"><button class="task-check" data-task="${i}" aria-label="Toggle task">${t.done?'✓':''}</button><span class="task-text">${esc(t.text)}</span><button class="task-delete" data-task-delete="${i}" aria-label="Delete task">×</button></li>`).join('')}</ul>`;
  }

  function reflectionCard(key){
    const r=db.reflections[key]||{};
    return `<div class="card"><div class="small muted">Mood / energy</div><div class="row" style="margin:10px 0">${[1,2,3,4,5].map(x=>`<button class="btn ${r.mood===x?'primary':''}" data-mood="${x}">${x}</button>`).join('')}</div><input class="input" data-reflection="screen" inputmode="decimal" placeholder="Screen time (e.g. 3.5 hours)" value="${esc(r.screen||'')}"><textarea class="input" style="margin-top:10px" data-reflection="win" placeholder="Biggest win today…">${esc(r.win||'')}</textarea><textarea class="input" style="margin-top:10px" data-reflection="wrong" placeholder="What went wrong?">${esc(r.wrong||'')}</textarea><textarea class="input" style="margin-top:10px" data-reflection="priority" placeholder="Tomorrow's priority…">${esc(r.priority||'')}</textarea></div>`;
  }

  function calendarPage(){
    let {y,m,selected}=db.settings.calendar;
    if(!Number.isInteger(y)||!Number.isInteger(m)||m<0||m>11){y=new Date().getFullYear();m=new Date().getMonth();selected=localKey();db.settings.calendar={y,m,selected};save();}
    const first=new Date(y,m,1).getDay(), total=daysInMonth(y,m), today=localKey();
    const cells=[]; for(let i=0;i<first;i++) cells.push('<div></div>');
    for(let day=1;day<=total;day++){
      const key=`${monthKey(y,m)}-${String(day).padStart(2,'0')}`, s=daySummary(key), future=key>today;
      cells.push(`<button class="day ${s.done?'has-done':''} ${key===today?'today':''} ${key===selected?'selected':''} ${future?'future':''}" data-date="${key}" ${future?'disabled':''}><span class="num">${day}</span>${s.done?'<span class="dot"></span>':''}<span class="small muted">${s.total?s.done+'/'+s.total:''}</span></button>`);
    }
    const ss=daySummary(selected), dateText=fmtDate(selected);
    return `<div class="card"><div class="calendar-head"><button class="icon-btn" data-month="prev" aria-label="Previous month">‹</button><div class="calendar-title">${esc(fmtMonth(y,m))}</div><button class="icon-btn" data-month="next" aria-label="Next month">›</button></div><div class="row between" style="margin-top:10px"><span class="small muted">${ss.done}/${ss.total} habits on selected day</span><button class="btn" data-action="today-calendar">Today</button></div><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="dow">${x}</div>`).join('')}${cells.join('')}</div><div class="notice" style="margin-top:12px">Tap a date to see the habit summary below. Future dates are locked.</div></div>
      <div class="section-title">${esc(dateText)}</div>
      <div class="card calendar-summary">${db.habits.length?db.habits.map(h=>`<div class="summary-item"><span class="status-dot ${isDone(h,selected)?'done':''}"></span><span style="flex:1">${esc(h.name)}</span><span class="small ${isDone(h,selected)?'':'muted'}">${isDone(h,selected)?'Completed':'Not completed'}</span>${selected<=today?`<button class="btn" data-summary-toggle="${h.id}">${isDone(h,selected)?'Undo':'Done'}</button>`:''}</div>`).join(''):'<div class="empty">Add habits from Settings to build your calendar.</div>'}</div>
      ${calendarMonthSummary(y,m)}`;
  }

  function calendarMonthSummary(y,m){
    const stats=monthStats(y,m), total=stats.totalDays;
    const rows=db.habits.map(h=>{let done=0;for(let d=1;d<=total;d++){const key=`${monthKey(y,m)}-${String(d).padStart(2,'0')}`;if(isDone(h,key))done++;}const goal=Math.min(h.target,total),p=goal?Math.min(100,Math.round(done/goal*100)):0;return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row between"><b>${esc(h.name)}</b><span class="small">${done}/${goal} goal · ${p}%</span></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join('');
    return `<div class="section-title">Month summary</div><div class="statgrid"><div class="stat"><b>${stats.pct}%</b><span>completion to date</span></div><div class="stat"><b>${stats.completed}</b><span>habit completions</span></div><div class="stat"><b>${db.habits.length}</b><span>active habits</span></div><div class="stat"><b>${total}</b><span>days in month</span></div></div><div class="card">${rows||'<div class="empty">No habit data yet.</div>'}</div>`;
  }

  function progressPage(){
    const stats=monthStats(new Date().getFullYear(),new Date().getMonth()), data=last7();
    const max=Math.max(1,...data.map(x=>x.total));
    const avg=data.length?Math.round(data.reduce((a,x)=>a+(x.total?x.completed/x.total:0),0)/data.length*100):0;
    const bars=data.map(x=>`<div class="bar-wrap"><span class="bar-value">${x.completed}</span><div class="bar" style="height:${Math.max(2,Math.round(x.completed/max*112))}px"></div><span class="bar-label">${esc(x.label)}</span></div>`).join('');
    const habitRows=db.habits.map(h=>{const d=monthDoneFor(h,new Date().getFullYear(),new Date().getMonth());const p=stats.totalDays?Math.round(d/stats.totalDays*100):0;return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row between"><b>${esc(h.name)}</b><span>${d}/${stats.totalDays} · ${p}%</span></div><div class="progress"><i style="width:${p}%"></i></div></div>`}).join('');
    return `<div class="card"><div class="sub">THIS MONTH</div><h1 style="margin:3px 0">${stats.pct}%</h1><div class="progress"><i style="width:${stats.pct}%"></i></div><div class="small muted" style="margin-top:8px">${stats.completed} completed check-ins across ${stats.possible} possible check-ins so far.</div></div><div class="statgrid"><div class="stat"><b>${db.habits.length}</b><span>Habits</span></div><div class="stat"><b>${stats.completed}</b><span>Completed</span></div><div class="stat"><b>${Math.max(0,...db.habits.map(bestStreak))}</b><span>Best streak</span></div><div class="stat"><b>${avg}%</b><span>7-day average</span></div></div><div class="section-title">Last 7 days</div><div class="card chart"><div class="bar-chart">${bars}</div><div class="legend"><span>0</span><span>Daily habit completions</span><span>${max}</span></div></div><div class="section-title">Habit performance</div><div class="card">${habitRows||'<div class="empty">No habits yet.</div>'}</div><div class="section-title">Palette</div><div class="card"><div class="palette">${Object.keys(palette).map(name=>`<button class="swatch ${db.settings.accent===name?'active':''}" data-accent="${name}"><span style="--swatch:${palette[name]}"></span><span>${name}</span></button>`).join('')}</div><div class="small muted" style="margin-top:10px">Change the accent used throughout Habit OS.</div></div>`;
  }

  function monthDoneFor(h,y,m){let n=0;for(let d=1;d<=daysInMonth(y,m);d++){const key=`${monthKey(y,m)}-${String(d).padStart(2,'0')}`;if(isDone(h,key))n++;}return n;}

  function openSettings(){
    const modal=document.createElement('div'); modal.id='modal'; modal.className='modal show';
    modal.innerHTML=`<div class="sheet"><div class="row between"><h2>Settings</h2><button class="icon-btn" data-action="close-modal">×</button></div><div class="setting-row"><b>Manage habits</b><div class="small muted" style="margin:4px 0 10px">Set a monthly goal in days. Keep the list focused.</div>${db.habits.map(h=>`<div class="row" style="margin:8px 0"><input class="input" data-rename="${h.id}" value="${esc(h.name)}" maxlength="80"><input class="input" style="max-width:95px" type="number" min="1" max="31" data-target="${h.id}" value="${h.target}" aria-label="Goal days"><button class="btn danger" data-delete="${h.id}">Delete</button></div>`).join('')||'<div class="empty">No habits.</div>'}<button class="btn primary" data-action="add-habit" style="margin-top:8px">＋ Add habit</button></div><div class="setting-row"><b>Appearance</b><div class="row wrap" style="margin-top:10px"><button class="btn ${db.settings.theme==='light'?'primary':''}" data-theme="light">Light</button><button class="btn ${db.settings.theme==='dark'?'primary':''}" data-theme="dark">Dark</button></div></div><div class="setting-row"><b>Data</b><div class="row wrap" style="margin-top:10px"><button class="btn" data-action="export">Export backup</button><button class="btn" data-action="import">Import backup</button><button class="btn danger" data-action="reset">Reset everything</button></div><input id="importFile" class="hidden" type="file" accept="application/json,.json"></div><div class="setting-row"><b>PWA / offline</b><p class="small muted">The app caches its interface for offline use when launched from a supported HTTPS host such as GitHub Pages. Your data stays in this browser's local storage.</p></div><button class="btn primary" style="width:100%;margin-top:14px" data-action="close-modal">Done</button></div>`;
    document.body.appendChild(modal);
  }
  function closeModal(){ $('modal')?.remove(); }

  function addHabit(){
    if(db.habits.length>=MAX_HABITS) return toast(`Maximum ${MAX_HABITS} habits.`);
    const name=prompt('Habit name'); if(!name)return; const clean=name.trim(); if(!clean)return;
    const target=Number(prompt('Monthly goal in days (1–31)', '20'));
    db.habits.push({id:Date.now(),name:clean,target:clamp(Number.isFinite(target)?target:20,1,31)});save();closeModal();render();toast('Habit added.');
  }
  function deleteHabit(id){
    const h=db.habits.find(x=>x.id==id); if(!h)return;
    if(!confirm(`Delete “${h.name}”? Old check-ins will remain in the backup data.`))return;
    db.habits=db.habits.filter(x=>x.id!=id); save(); openSettings(); toast('Habit deleted.');
  }

  function exportData(){
    const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`habit-os-backup-${localKey()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Backup exported.');
  }
  function importData(){ $('importFile')?.click(); }
  function resetData(){
    if(!confirm('This clears Habit OS data on this device. Export a backup first if you need it. Continue?'))return;
    localStorage.removeItem(KEY);localStorage.removeItem(OLD_KEY);db=defaultDB();save();closeModal();render();toast('Habit OS was reset.');
  }

  document.addEventListener('click', e => {
    const view=e.target.closest('[data-view]'); if(view){db.settings.view=view.dataset.view;save();render();return;}
    const habit=e.target.closest('[data-habit]'); if(habit){toggleHabit(Number(habit.dataset.habit));return;}
    const date=e.target.closest('[data-date]'); if(date){db.settings.calendar.selected=date.dataset.date;save();render();return;}
    const sum=e.target.closest('[data-summary-toggle]'); if(sum){toggleHabit(Number(sum.dataset.summaryToggle),db.settings.calendar.selected);return;}
    const month=e.target.closest('[data-month]'); if(month){let {y,m}=db.settings.calendar;m+=month.dataset.month==='next'?1:-1;if(m<0){m=11;y--;}if(m>11){m=0;y++;}db.settings.calendar={y,m,selected:`${monthKey(y,m)}-01`};save();render();return;}
    const accent=e.target.closest('[data-accent]'); if(accent){db.settings.accent=accent.dataset.accent;save();render();return;}
    const theme=e.target.closest('[data-theme]'); if(theme){db.settings.theme=theme.dataset.theme;save();applyTheme();openSettings();return;}
    const mood=e.target.closest('[data-mood]'); if(mood){const k=localKey();db.reflections[k]??={};db.reflections[k].mood=Number(mood.dataset.mood);save();render();return;}
    const task=e.target.closest('[data-task]'); if(task){const key=localKey(),list=db.tasks[key]||[];const i=Number(task.dataset.task);if(list[i])list[i].done=!list[i].done;save();render();return;}
    const delTask=e.target.closest('[data-task-delete]'); if(delTask){const key=localKey(),list=db.tasks[key]||[];list.splice(Number(delTask.dataset.task),1);db.tasks[key]=list;save();render();return;}
    const del=e.target.closest('[data-delete]'); if(del){deleteHabit(del.dataset.delete);return;}
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action==='settings')return openSettings();
    if(action==='close-modal')return closeModal();
    if(action==='add-habit')return addHabit();
    if(action==='export')return exportData();
    if(action==='import')return importData();
    if(action==='reset')return resetData();
    if(action==='install' && deferredInstall){deferredInstall.prompt();deferredInstall.userChoice.finally(()=>{deferredInstall=null;render();});return;}
    if(action==='hide-install'){deferredInstall=null;render();return;}
    if(action==='focus-calendar'){db.settings.view='calendar';save();render();return;}
    if(action==='focus-progress'){db.settings.view='progress';save();render();return;}
    if(action==='today-calendar'){db.settings.calendar={y:new Date().getFullYear(),m:new Date().getMonth(),selected:localKey()};save();render();return;}
    if(action==='add-task'){
      const input=$('taskInput'),text=input?.value.trim(); if(!text)return;
      const key=localKey();db.tasks[key]??=[];if(db.tasks[key].length>=MAX_TASKS)return toast('Task limit reached.');db.tasks[key].push({text,done:false});save();render();return;
    }
  });

  document.addEventListener('change', e => {
    const ref=e.target.closest('[data-reflection]'); if(ref){const k=localKey();db.reflections[k]??={};db.reflections[k][ref.dataset.reflection]=ref.value;save();return;}
    const rename=e.target.closest('[data-rename]'); if(rename){const h=db.habits.find(x=>x.id==rename.dataset.rename);if(h&&rename.value.trim()){h.name=rename.value.trim();save();toast('Habit updated.');}return;}
    const target=e.target.closest('[data-target]'); if(target){const h=db.habits.find(x=>x.id==target.dataset.target);if(h){h.target=clamp(Number(target.value)||1,1,31);save();toast('Goal updated.');}return;}
    if(e.target.id==='importFile'){
      const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const imported=normalise(JSON.parse(reader.result));db=imported;save();closeModal();render();toast('Backup imported.');}catch{toast('That backup file is not valid.');}};reader.readAsText(file);e.target.value='';
    }
  });

  window.addEventListener('beforeinstallprompt', e => {e.preventDefault();deferredInstall=e;render();});
  window.addEventListener('appinstalled',()=>{deferredInstall=null;toast('Habit OS installed.');render();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) {
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
  }
  save();render();
})();
