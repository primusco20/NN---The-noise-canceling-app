import './style.css';

type Meeting = { id: string; title: string; date: string; attendees: string; agenda: string; createdAt: string; startTime?: string; endTime?: string; timezone?: string; platform?: string; location?: string; inviteEmails?: string; reminder?: string; googleEventId?: string; googleEventUrl?: string };
type Member = { id: string; firstName: string; lastName: string; email: string; phone: string; category: 'Team' | 'Client' | 'Other'; emailProvider: string; meetingPlatform: string; createdAt: string };
type Note = { id: string; title: string; body: string; updatedAt: string };
type ChatMessage = { id: string; role: 'user'; text: string; createdAt: string };
type Settings = { noiseSuppression: boolean; echoCancellation: boolean; autoGain: boolean; appearance: 'system' | 'light' | 'dark'; palette: 'orange' | 'charcoal' | 'galaxy'; storage: 'local' };
const KEYS = { meetings: 'nn.meetings.v1', notes: 'nn.notes.v1', chats: 'nn.chats.v1', settings: 'nn.settings.v1', members: 'nn.members.v1' };
const defaults: Settings = { noiseSuppression: true, echoCancellation: true, autoGain: true, appearance: 'system', palette: 'galaxy', storage: 'local' };
const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
let meetings = read<Meeting[]>(KEYS.meetings, []);
let notes = read<Note[]>(KEYS.notes, []);
let chats = read<ChatMessage[]>(KEYS.chats, []);
let members = read<Member[]>(KEYS.members, []);
const storedSettings = read<Partial<Settings> & { theme?: 'dark' | 'light' }>(KEYS.settings, {});
let settings: Settings = { ...defaults, ...storedSettings, appearance: storedSettings.appearance ?? storedSettings.theme ?? defaults.appearance, palette: storedSettings.palette ?? defaults.palette };
let activePage = 'Home';
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarSelectedDate = new Date().toISOString().slice(0,10);
let selectedNote = notes[0]?.id ?? '';
let stream: MediaStream | null = null;
let context: AudioContext | null = null;
let raf = 0;
let micActive = false;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing app root');

function persist() {
  localStorage.setItem(KEYS.meetings, JSON.stringify(meetings));
  localStorage.setItem(KEYS.notes, JSON.stringify(notes));
  localStorage.setItem(KEYS.chats, JSON.stringify(chats));
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  localStorage.setItem(KEYS.members, JSON.stringify(members));
}
function esc(value: string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c)); }
function icon(name: string) {
  const paths: Record<string,string> = {
    home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/>',
    team:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    client:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M3 11h18M10 11v2h4v-2"/>',
    meetings:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    notes:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    chats:'<path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l1.8-5.1A8.5 8.5 0 1 1 21 11.5Z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M9 22h6"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
    back:'<path d="M19 12H5M12 19l-7-7 7-7"/>'
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[name] ?? paths.home)+'</svg>';
}
function navButton(page: string, label: string) {
  return `<button class="nav-item ${activePage===page?'active':''}" data-page="${page}">${icon(label.toLowerCase())}<span>${label}</span>${page==='Meetings'&&meetings.length?'<small>'+meetings.length+'</small>':''}</button>`;
}
function shell(content: string, subtitle: string) {
  root!.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <a class="brand" href="#" data-page="Home"><span class="brand-mark">N</span><span>NN<small>NOISE CANCELING</small></span></a>
      <button class="workspace-switch"><span class="workspace-avatar">N</span><span><b>Personal workspace</b><small>Local workspace</small></span><span class="dots">•••</span></button>
      <div class="nav-label">WORKSPACE</div><nav>${navButton('Home','Home')}${navButton('Calendar','Calendar')}${navButton('Meetings','Meetings')}${navButton('Team','Team')}${navButton('Client','Client')}<button class="nav-item nav-add-member" id="nav-add-member">${icon('plus')}<span>Add</span></button>${navButton('Notes','Notes')}${navButton('Chats','Chats')}</nav>
      <div class="sidebar-bottom"><div class="privacy-mini"><span class="lock-dot">✓</span><span><b>Private by default</b><small>Your workspace stays in this browser.</small></span></div>${navButton('Settings','Settings')}<button class="nav-item back-home-item ${activePage==='Home'?'is-home':''}" data-page="Home" aria-label="Back to Home" ${activePage==='Home'?'disabled':''}>${icon('back')}<span>Back to Home</span></button><div class="profile"><span class="profile-avatar">NN</span><span><b>Personal account</b><small>Local-only mode</small></span><button class="icon-button" id="profile-menu" aria-label="Workspace information">•••</button></div></div>
    </aside>
    <main class="main-area"><header class="topbar"><button id="mobile-menu" class="icon-button mobile-only" aria-label="Open navigation">☰</button><div class="breadcrumbs">Workspace ${icon('chevron')} <b>${activePage}</b></div><div class="top-actions"><span class="secure-pill"><i></i> On-device workspace</span><button class="icon-button" data-page="Settings" aria-label="Settings">${icon('settings')}</button></div></header>
    <section class="page"><div class="page-heading"><div><p class="eyebrow">NN WORKSPACE</p><h1>${activePage}</h1><p class="page-subtitle">${subtitle}</p></div>${activePage==='Meetings'?'<button class="primary-button" id="new-meeting">'+icon('plus')+' New meeting</button>':activePage==='Notes'?'<button class="primary-button" id="new-note">'+icon('plus')+' New note</button>':(activePage==='Team'||activePage==='Client')?'<button class="primary-button" id="new-member">'+icon('plus')+' Add '+activePage.toLowerCase()+'</button>':''}</div>${content}</section>
    <footer class="footer"><span>NN · The Noise Canceling App</span><span>Local-first · You control your data</span></footer></main>
    <div class="quick-tools" id="quick-tools"><button class="quick-tools-toggle" id="quick-tools-toggle" aria-expanded="false" aria-controls="quick-tools-panel">✦ <span>Quick tools</span></button><div class="quick-tools-panel" id="quick-tools-panel" hidden><div class="quick-tools-heading"><b>Quick tools</b><button class="icon-button" id="quick-tools-close" aria-label="Close quick tools">✕</button></div><button class="quick-tool-action" id="quick-tool-mic">${icon('mic')}<span><b>Microphone</b><small>Start or stop local input meter</small></span></button><button class="quick-tool-action" id="quick-tool-minutes">${icon('notes')}<span><b>Meeting minutes</b><small>Open a local meeting note</small></span></button><button class="quick-tool-action" id="quick-tool-captions">CC <span><b>Live captions</b><small>Browser speech recognition is not enabled yet</small></span></button><button class="quick-tool-action" id="quick-tool-nasrinai">✦ <span><b>Enable NasrinAI</b><small>Connection is not configured</small></span></button><p class="quick-tools-disclaimer">AI denoising, live captions, and NasrinAI require additional tested processing and consent flows. These controls do not claim those services are connected.</p></div></div>
  </div>`;
  root!.querySelectorAll<HTMLElement>('[data-page]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); const page=(el as HTMLElement).dataset.page; if(page) navigate(page); }));
  root!.querySelector<HTMLButtonElement>('#mobile-menu')?.addEventListener('click',()=>root!.querySelector('#sidebar')?.classList.toggle('mobile-open'));
  root!.querySelector<HTMLButtonElement>('#profile-menu')?.addEventListener('click',()=>navigate('Settings'));
  root!.querySelector<HTMLButtonElement>('#nav-add-member')?.addEventListener('click',()=>{navigate('Team');root!.querySelector<HTMLDialogElement>('#member-dialog')?.showModal();});
  const quickPanel=root!.querySelector<HTMLElement>('#quick-tools-panel');
  const quickToggle=root!.querySelector<HTMLButtonElement>('#quick-tools-toggle');
  const setQuickOpen=(open:boolean)=>{if(quickPanel)quickPanel.hidden=!open;quickToggle?.setAttribute('aria-expanded',String(open));};
  quickToggle?.addEventListener('click',()=>setQuickOpen(quickPanel?.hidden??true));
  root!.querySelector<HTMLButtonElement>('#quick-tools-close')?.addEventListener('click',()=>setQuickOpen(false));
  root!.querySelector<HTMLButtonElement>('#quick-tool-mic')?.addEventListener('click',()=>{setQuickOpen(false);if(activePage!=='Home')navigate('Home');const micButton=root!.querySelector<HTMLButtonElement>('#home-mic');micButton?.click();});
  root!.querySelector<HTMLButtonElement>('#quick-tool-minutes')?.addEventListener('click',()=>{setQuickOpen(false);createMinutesNote();});
  root!.querySelector<HTMLButtonElement>('#quick-tool-captions')?.addEventListener('click',()=>alert('Live captions are not enabled in this build. Browser speech recognition support and its audio-processing privacy behavior must be validated before activation.'));
  root!.querySelector<HTMLButtonElement>('#quick-tool-nasrinai')?.addEventListener('click',()=>alert('NasrinAI is not connected yet. No audio or notes will be sent until a secure integration and explicit consent flow are implemented.'));
}
function applyAppearance() { const mode=settings.appearance==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):settings.appearance; document.documentElement.dataset.theme=mode; document.documentElement.dataset.palette=settings.palette; }
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(settings.appearance==='system')applyAppearance();});
function navigate(page: string) { activePage=page; render(); }
function homePage() {
  return `<section class="welcome-card"><div class="welcome-copy"><span class="soft-tag">${icon('mic')} AUDIO WORKSPACE</span><h2>Make every conversation<br><em>clearer.</em></h2><p>Check your microphone, organize meetings, and keep your notes in one calm workspace.</p><div class="welcome-actions"><button class="primary-button" id="home-mic">${icon('mic')} ${micActive?'Stop microphone':'Check microphone'}</button><button class="secondary-button" data-page="Meetings">${icon('plus')} Plan a meeting</button></div></div><div class="sound-visual" aria-hidden="true"><div class="sound-ring ring-one"></div><div class="sound-ring ring-two"></div><div class="sound-core">${icon('mic')}</div><div class="sound-bars">${Array.from({length:21},(_,i)=>'<i style="--h:'+([12,20,32,18,42,26,52,34,68,44,78,40,60,30,48,22,38,17,30,14,22][i])+'px"></i>').join('')}</div></div></section>
  <div class="section-title"><div><h2>Your workspace</h2><p>Everything you need to stay focused.</p></div></div>
  <div class="stats-grid"><button class="stat-card" data-page="Meetings"><span class="stat-icon purple">${icon('meetings')}</span><span class="stat-number">${meetings.length}</span><span class="stat-name">Meetings</span><span class="stat-foot">Scheduled in this browser ${icon('chevron')}</span></button><button class="stat-card" data-page="Notes"><span class="stat-icon blue">${icon('notes')}</span><span class="stat-number">${notes.length}</span><span class="stat-name">Notes</span><span class="stat-foot">Saved locally ${icon('chevron')}</span></button><button class="stat-card" data-page="Chats"><span class="stat-icon amber">${icon('chats')}</span><span class="stat-number">${chats.length}</span><span class="stat-name">Chat messages</span><span class="stat-foot">Local chat drafts ${icon('chevron')}</span></button></div>
  <div class="section-title"><div><h2>Quick access</h2><p>Pick up where you left off.</p></div></div><div class="quick-grid"><button class="quick-card" data-page="Notes"><span class="quick-icon">${icon('notes')}</span><span><b>Capture an idea</b><small>Write and save a note</small></span>${icon('chevron')}</button><button class="quick-card" data-page="Chats"><span class="quick-icon">${icon('chats')}</span><span><b>Open chats</b><small>Keep a local conversation draft</small></span>${icon('chevron')}</button></div>
  <div class="audio-card"><div class="audio-card-heading"><div><span class="eyebrow">MICROPHONE TEST</span><h2>Audio input</h2></div><span id="mic-status" class="status-chip ${micActive?'active':''}">${micActive?'Microphone active':'Not connected'}</span></div><p>Browser-native noise suppression is available when supported. Local AI denoising is not connected yet.</p><div class="level-row"><span>Input level</span><meter id="level" min="0" max="1" value="0"></meter></div><div class="audio-controls"><button class="primary-button" id="start-mic">${icon('mic')} Start microphone</button><button class="secondary-button" id="stop-mic" ${micActive?'':'disabled'}>Stop</button></div><p class="privacy-note" id="mic-notice">Audio is analyzed locally for this meter only; it is not recorded or uploaded.</p></div>`;
}
function meetingsPage() {
  const cards=meetings.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(m=>`<article class="meeting-card"><div class="meeting-date"><b>${esc(m.date?new Date(m.date+'T12:00:00').toLocaleDateString(undefined,{day:'2-digit'}):'—')}</b><span>${esc(m.date?new Date(m.date+'T12:00:00').toLocaleDateString(undefined,{month:'short'}):'DATE')}</span></div><div class="meeting-info"><h3>${esc(m.title)}</h3><p>${esc([m.startTime&&m.endTime?m.startTime+'–'+m.endTime:m.startTime,m.platform,m.attendees].filter(Boolean).join(' · ')||'No attendees added')}</p>${m.location?'<p>'+esc(m.location)+'</p>':''}${m.inviteEmails?'<p>Invitees: '+esc(m.inviteEmails)+'</p>':''}${m.agenda?'<p class="agenda">'+esc(m.agenda)+'</p>':''}<small>Created ${esc(new Date(m.createdAt).toLocaleDateString())}</small></div><div class="meeting-actions"><button class="secondary-button small" data-meeting-note="${m.id}">Open notes</button><button class="icon-button danger" data-delete-meeting="${m.id}" aria-label="Delete meeting">${icon('trash')}</button></div></article>`).join('');
  return `<div class="toolbar"><div class="search-box">${icon('search')}<input id="meeting-search" placeholder="Search meetings" aria-label="Search meetings"></div><span class="result-count">${meetings.length} meeting${meetings.length===1?'':'s'}</span></div><div id="meeting-list" class="meeting-list">${cards||'<div class="empty-state"><span class="empty-icon">'+icon('meetings')+'</span><h3>No meetings yet</h3><p>Create a meeting to keep its date, attendees, agenda, and related notes together.</p><button class="primary-button" id="empty-meeting">'+icon('plus')+' Create your first meeting</button></div>'}</div><dialog id="meeting-dialog" class="modal"><form id="meeting-form"><div class="modal-heading"><div><p class="eyebrow">MEETING DETAILS</p><h2>New meeting</h2></div><button type="button" class="icon-button" id="close-meeting" aria-label="Close">✕</button></div><label>Meeting title<input name="title" required maxlength="120" placeholder="Weekly team sync"></label><div class="form-row"><label>Date<input name="date" type="date" required></label><label>Time zone<select name="timezone"><option value="Asia/Manila">Asia/Manila (Philippines)</option><option value="UTC">UTC</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/New_York">Eastern Time</option><option value="Europe/London">London</option><option value="Asia/Singapore">Singapore</option></select></label></div><div class="form-row"><label>Start time<input name="startTime" type="time"></label><label>End time<input name="endTime" type="time"></label></div><div class="form-row"><label>Meeting platform<select name="platform"><option value="">Choose platform</option><option>Google Meet</option><option>Zoom</option><option>Microsoft Teams</option><option>In person</option><option>Phone</option><option>Other</option></select></label><label>Location / meeting link<input name="location" maxlength="500" placeholder="Room, address, or meeting URL"></label></div><label>Attendees<input name="attendees" maxlength="240" placeholder="Names, separated by commas"></label><label>Invitee email addresses<input name="inviteEmails" maxlength="2000" placeholder="person@example.com, another@example.com"></label><label>Reminder<select name="reminder"><option value="none">No reminder</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="custom">Custom (not yet supported)</option></select></label><label>Agenda<textarea name="agenda" rows="3" maxlength="2000" placeholder="What do you want to cover?"></textarea></label><p class="form-hint">Save locally, or explicitly send a Google Calendar invitation after connecting Google Calendar in Settings.</p><button class="primary-button full" type="submit">Save meeting locally</button><button class="secondary-button full" type="button" data-send-google-invite>Save &amp; send Google Calendar invite</button></form></dialog>`;
}
function calendarPage() {
  const year=calendarCursor.getFullYear(), month=calendarCursor.getMonth(), first=new Date(year,month,1).getDay(), days=new Date(year,month+1,0).getDate();
  const monthName=calendarCursor.toLocaleDateString(undefined,{month:'long',year:'numeric'}), today=new Date().toISOString().slice(0,10);
  const key=(d:number)=>year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const cells=Array.from({length:first},()=>'<div class="calendar-day outside"></div>').join('')+Array.from({length:days},(_,i)=>{const d=i+1,k=key(d),ev=meetings.filter(m=>m.date===k);return '<button class="calendar-day '+(k===today?'today ':'')+(k===calendarSelectedDate?'selected':'')+'" data-cal-date="'+k+'"><span class="day-number">'+d+'</span>'+ev.slice(0,2).map(m=>'<span class="calendar-event">'+esc(m.title)+'</span>').join('')+(ev.length>2?'<small>+'+(ev.length-2)+' more</small>':'')+'</button>';}).join('');
  const dayMeetings=meetings.filter(m=>m.date===calendarSelectedDate);
  return '<div class="calendar-toolbar"><div><h2>'+esc(monthName)+'</h2><p>Meetings from your local workspace.</p></div><div class="calendar-controls"><button class="secondary-button small" id="cal-today">Today</button><button class="secondary-button small" id="cal-prev">←</button><button class="secondary-button small" id="cal-next">→</button><button class="primary-button" id="cal-add">+ Add event</button></div></div><div class="calendar-layout"><section class="calendar-panel"><div class="calendar-weekdays">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="calendar-grid">'+cells+'</div></section><aside class="calendar-agenda"><p class="eyebrow">SELECTED DATE</p><h3>'+esc(new Date(calendarSelectedDate+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}))+'</h3>'+(dayMeetings.length?dayMeetings.map(m=>'<article class="agenda-event"><b>'+esc(m.title)+'</b><p>'+esc([m.startTime&&m.endTime?m.startTime+'–'+m.endTime:m.startTime,m.platform,m.attendees].filter(Boolean).join(' · ')||'No attendees added')+'</p></article>').join(''):'<p class="muted">Nothing scheduled for this day.</p>')+'</aside></div><p class="privacy-note">Events are shared with Meetings and stored locally in this browser. External calendar sync is not connected.</p><dialog id="cal-dialog" class="modal"><form id="cal-form"><div class="modal-heading"><h2>Add calendar event</h2><button type="button" class="icon-button" id="cal-close">✕</button></div><label>Title<input name="title" required maxlength="120" placeholder="Team meeting"></label><div class="form-row"><label>Date<input name="date" type="date" required value="'+calendarSelectedDate+'"></label><label>Time zone<select name="timezone"><option value="Asia/Manila">Asia/Manila (Philippines)</option><option value="UTC">UTC</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/New_York">Eastern Time</option><option value="Europe/London">London</option><option value="Asia/Singapore">Singapore</option></select></label></div><div class="form-row"><label>Start time<input name="startTime" type="time"></label><label>End time<input name="endTime" type="time"></label></div><div class="form-row"><label>Meeting platform<select name="platform"><option value="">Choose platform</option><option>Google Meet</option><option>Zoom</option><option>Microsoft Teams</option><option>In person</option><option>Phone</option><option>Other</option></select></label><label>Location / meeting link<input name="location" maxlength="500" placeholder="Room, address, or meeting URL"></label></div><label>Attendees<input name="attendees" maxlength="240" placeholder="Names, separated by commas"></label><label>Invitee email addresses<input name="inviteEmails" maxlength="2000" placeholder="person@example.com, another@example.com"></label><label>Reminder<select name="reminder"><option value="none">No reminder</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="custom">Custom (not yet supported)</option></select></label><label>Agenda<textarea name="agenda" rows="3" maxlength="2000"></textarea></label><p class="form-hint">Save locally, or explicitly send a Google Calendar invitation after connecting Google Calendar in Settings.</p><button class="primary-button full" type="submit">Save event locally</button><button class="secondary-button full" type="button" data-send-google-invite>Save &amp; send Google Calendar invite</button></form></dialog>';
}
function membersPage(category: 'Team' | 'Client') {
  const list=members.filter(m=>m.category===category).sort((a,b)=>(a.lastName+a.firstName).localeCompare(b.lastName+b.firstName));
  const cards=list.map(m=>'<article class="member-card"><div class="member-avatar">'+esc((m.firstName[0]||'')+(m.lastName[0]||''))+'</div><div class="member-info"><h3>'+esc(m.firstName+' '+m.lastName)+'</h3><p>'+esc(m.email||'No email provided')+'</p>'+(m.phone?'<p>'+esc(m.phone)+'</p>':'')+'<small>Email: '+esc(m.emailProvider||'Not set')+' · Meetings: '+esc(m.meetingPlatform||'Not set')+'</small></div><button class="icon-button danger" data-delete-member="'+m.id+'" aria-label="Delete member">'+icon('trash')+'</button></article>').join('');
  return '<div class="toolbar"><div><b>'+list.length+' '+(category==='Team'?'team member':'client')+(list.length===1?'':'s')+'</b></div><span class="result-count">Saved in this browser</span></div><div class="member-list">'+(cards||'<div class="empty-state"><span class="empty-icon">'+icon('plus')+'</span><h3>No '+category.toLowerCase()+(category==='Team'?' members':'s')+' yet</h3><p>Add a contact to keep their details and preferred tools in one place.</p><button class="primary-button" id="empty-member">'+icon('plus')+' Add '+category.toLowerCase()+'</button></div>')+'</div><dialog id="member-dialog" class="modal"><form id="member-form"><div class="modal-heading"><div><p class="eyebrow">CONTACT DETAILS</p><h2>Add '+category.toLowerCase()+'</h2></div><button type="button" class="icon-button" id="member-close" aria-label="Close">✕</button></div><div class="form-row"><label>First name<input name="firstName" required maxlength="80" autocomplete="given-name"></label><label>Last name<input name="lastName" required maxlength="80" autocomplete="family-name"></label></div><label>Email<input name="email" type="email" maxlength="254" autocomplete="email" placeholder="person@example.com"></label><label>Phone (optional)<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label><label>Class<select name="category" required><option value="Team" '+(category==='Team'?'selected':'')+'>Team</option><option value="Client" '+(category==='Client'?'selected':'')+'>Client</option><option value="Other">Other</option></select></label><div class="form-row"><label>Email preference<select name="emailProvider"><option value="">Not set</option><option>Gmail</option><option>Outlook / Microsoft 365</option><option>Yahoo Mail</option><option>Apple Mail / iCloud</option><option>Other</option></select></label><label>Meeting preference<select name="meetingPlatform"><option value="">Not set</option><option>Google Meet</option><option>Microsoft Teams</option><option>Zoom</option><option>In person</option><option>Other</option></select></label></div><p class="form-hint">Contact details are stored in this browser only. No email is sent and no account is connected.</p><button class="primary-button full" type="submit">Save contact</button></form></dialog>';
}
function notesPage() {
  const current=notes.find(n=>n.id===selectedNote);
  return `<div class="notes-layout"><aside class="notes-list-panel"><div class="notes-list-head"><b>All notes</b><span>${notes.length}</span></div><div class="note-items">${notes.map(n=>`<button class="note-list-item ${n.id===selectedNote?'selected':''}" data-select-note="${n.id}"><b>${esc(n.title||'Untitled note')}</b><small>${esc(new Date(n.updatedAt).toLocaleDateString())}</small><p>${esc(n.body.slice(0,76)||'No content yet')}</p></button>`).join('')||'<p class="muted empty-notes">Your notes will appear here.</p>'}</div></aside><section class="note-editor">${current?`<div class="editor-top"><span class="saved-label"><i></i> Saved in this browser</span><button id="delete-note" class="icon-button danger" aria-label="Delete note">${icon('trash')}</button></div><input id="note-title" class="note-title-input" value="${esc(current.title)}" maxlength="160" aria-label="Note title" placeholder="Untitled note"><textarea id="note-body" class="note-body-input" maxlength="30000" placeholder="Start writing…">${esc(current.body)}</textarea><div class="editor-bottom"><span id="note-status">Changes save automatically</span><span>${current.body.length} characters</span></div>`:'<div class="empty-state compact"><span class="empty-icon">'+icon('notes')+'</span><h3>Make space for an idea</h3><p>Create a note to capture the details worth remembering.</p><button class="primary-button" id="first-note">'+icon('plus')+' Create a note</button></div>'}</section></div><p class="privacy-note below-note">Notes are stored in this browser's local storage. Clearing browser site data can remove them; export and cloud sync are not implemented yet.</p>`;
}
function chatsPage() {
  return `<section class="chat-layout"><div class="chat-header"><div class="chat-avatar">${icon('chats')}</div><div><h2>Workspace chat</h2><p>Private local draft · AI is not connected</p></div><span class="local-pill">LOCAL ONLY</span></div><div class="chat-history" id="chat-history">${chats.length?chats.map(m=>`<div class="chat-message user-message"><div class="message-avatar">You</div><div><p>${esc(m.text)}</p><small>${esc(new Date(m.createdAt).toLocaleString())}</small></div></div>`).join(''):'<div class="chat-empty"><span class="empty-icon">'+icon('chats')+'</span><h3>Think it through here</h3><p>Use this space to draft questions, meeting follow-ups, or ideas. Messages stay in this browser.</p><div class="prompt-chips"><button data-prompt="Help me outline a meeting agenda">Outline an agenda</button><button data-prompt="Draft a meeting follow-up checklist">Draft follow-up tasks</button><button data-prompt="Help me organize my ideas">Organize my ideas</button></div></div>'}</div><form id="chat-form" class="chat-composer"><textarea id="chat-input" rows="1" maxlength="4000" placeholder="Write a message or draft…" aria-label="Chat message"></textarea><button class="send-button" type="submit" aria-label="Save message draft">↑</button></form><div class="chat-disclaimer">Messages are saved locally as drafts. No AI response is generated or sent to a service.</div><div class="chat-tools"><button id="clear-chat" class="text-button">${icon('trash')} Clear chat drafts</button></div></section>`;
}
function settingsPage() {
  const providerGroups = [{title:'Email accounts',description:'Connect inbox providers and standards supported by your account.',items:[['gmail','Gmail','Send email from your Google account','Google OAuth · Gmail send permission'],['outlook','Outlook / Microsoft 365','Microsoft email and calendars','OAuth setup required'],['yahoo','Yahoo Mail','Yahoo email','OAuth setup required'],['apple-mail','Apple Mail / iCloud Mail','Apple account or iCloud mail','Provider setup required'],['imap','Other email (IMAP/SMTP)','Compatible custom mail servers','Secure server setup required']]},{title:'Meetings & collaboration',description:'Connect collaboration tools for meeting details, messages, and workflows.',items:[['google-calendar','Google Calendar','Create events and email invitations','Google OAuth · calendar events permission'],['slack','Slack','Team messages and channels','OAuth setup required'],['google-meet','Google Meet','Google Workspace meetings','Separate Meet API integration not configured'],['teams','Microsoft Teams','Teams meetings and collaboration','Microsoft OAuth setup required'],['zoom','Zoom','Zoom meetings and account data','Zoom OAuth setup required']]}] as const;
  const integrationCards = providerGroups.map(group=>`<div class="integration-group"><div class="integration-group-heading"><h3>${group.title}</h3><p>${group.description}</p></div><div class="integration-grid">${group.items.map(([id,name,description,requirement])=>`<article class="integration-card"><div class="integration-card-top"><span class="integration-mark mark-${id}">${name.split(' ').filter(Boolean).map(part=>part[0]).slice(0,2).join('').toUpperCase()}</span><span class="integration-status" data-integration-status="${id}">Not connected</span></div><h4>${name}</h4><p>${description}</p><button class="secondary-button small integration-connect" data-connect-provider="${id}" data-provider-name="${name}" data-provider-requirement="${requirement}">Connect</button></article>`).join('')}</div></div>`).join('');
  return `<div class="settings-layout"><aside class="settings-nav"><button class="settings-tab active" data-settings-tab="audio">Audio preferences</button><button class="settings-tab" data-settings-tab="privacy">Privacy & data</button><button class="settings-tab" data-settings-tab="appearance">Appearance</button><button class="settings-tab" data-settings-tab="integrations">Integrations</button><button class="settings-tab" data-settings-tab="about">About NN</button></aside><div class="settings-content" id="settings-content"><div class="settings-section" data-settings-section="audio"><p class="eyebrow">INPUT PREFERENCES</p><h2>Audio preferences</h2><p>Choose the browser processing options used when you start your microphone.</p><div class="setting-row"><div><b>Noise suppression</b><p>Ask the browser to reduce background noise when supported.</p></div><label class="switch"><input type="checkbox" data-setting="noiseSuppression" ${settings.noiseSuppression?'checked':''}><span></span></label></div><div class="setting-row"><div><b>Echo cancellation</b><p>Reduce speaker audio leaking into the microphone.</p></div><label class="switch"><input type="checkbox" data-setting="echoCancellation" ${settings.echoCancellation?'checked':''}><span></span></label></div><div class="setting-row"><div><b>Automatic gain control</b><p>Let the browser adjust microphone input level.</p></div><label class="switch"><input type="checkbox" data-setting="autoGain" ${settings.autoGain?'checked':''}><span></span></label></div></div><div class="settings-section" data-settings-section="privacy"><p class="eyebrow">DATA CONTROL</p><h2>Privacy & data</h2><div class="privacy-panel"><span class="privacy-check">✓</span><div><b>Local-only storage is active</b><p>Meetings, notes, chat drafts, and preferences are saved in this browser. They are not synced to a server.</p></div></div><div class="setting-row"><div><b>Export workspace data</b><p>Download your meetings, notes, chat drafts, and preferences as JSON.</p></div><button class="secondary-button small" id="export-data">Export JSON</button></div><div class="setting-row"><div><b>Delete local workspace data</b><p>Remove saved meetings, notes, chat drafts, and preferences from this browser.</p></div><button class="danger-button" id="delete-data">Delete data</button></div></div><div class="settings-section" data-settings-section="appearance"><p class="eyebrow">DISPLAY</p><h2>Appearance</h2><div class="setting-row"><div><b>Appearance</b><p>Follow your device or choose a fixed light or dark mode.</p></div><select id="appearance-select" class="select-control"><option value="system" ${settings.appearance==='system'?'selected':''}>System</option><option value="light" ${settings.appearance==='light'?'selected':''}>Light</option><option value="dark" ${settings.appearance==='dark'?'selected':''}>Dark</option></select></div><div class="palette-heading"><b>Theme</b><p>Choose a color personality for NN.</p></div><div class="palette-grid"><button class="palette-option ${settings.palette==='orange'?'selected':''}" data-palette="orange" aria-pressed="${settings.palette==='orange'}"><span class="palette-preview palette-orange"><i></i><i></i><i></i></span><b>Orange</b><small>Warm and energetic</small></button><button class="palette-option ${settings.palette==='charcoal'?'selected':''}" data-palette="charcoal" aria-pressed="${settings.palette==='charcoal'}"><span class="palette-preview palette-charcoal"><i></i><i></i><i></i></span><b>Charcoal</b><small>Quiet neutral tones</small></button><button class="palette-option ${settings.palette==='galaxy'?'selected':''}" data-palette="galaxy" aria-pressed="${settings.palette==='galaxy'}"><span class="palette-preview palette-galaxy"><i></i><i></i><i></i></span><b>Galaxy</b><small>Cosmic blue-violet</small></button></div></div><div class="settings-section" data-settings-section="integrations"><p class="eyebrow">CONNECTED WORKSPACE</p><h2>Integrations</h2><p>Connect Google services using OAuth. Gmail access is limited to sending email; Calendar access is limited to events on calendars you own. NN never asks for your Google password.</p><p id="google-oauth-feedback" class="integration-dialog-message" aria-live="polite" hidden></p><div id="google-connection-control" class="google-connection-control" hidden><span id="google-account-email"></span><button class="danger-button" id="google-disconnect" type="button">Disconnect Google</button></div>${integrationCards}<div id="gmail-compose-panel" class="gmail-compose-panel" hidden><h3>Send email from Gmail</h3><form id="gmail-send-form"><label>To<input name="to" required maxlength="2000" placeholder="person@example.com, another@example.com"></label><label>Subject<input name="subject" required maxlength="240"></label><label>Message<textarea name="text" required maxlength="100000" rows="5"></textarea></label><button class="primary-button" type="submit">Send email</button><p id="gmail-send-status" class="form-hint" aria-live="polite"></p></form></div><div class="integration-security-note"><b>Security first</b><p>NN will use provider OAuth or an approved secure server-side connection. Passwords and API secrets must never be collected in this page. Apple Mail is an email client, so availability depends on the account provider (such as iCloud, Microsoft 365, or IMAP).</p></div><dialog id="integration-dialog" class="modal"><div class="modal-heading"><div><p class="eyebrow">ACCOUNT CONNECTION</p><h2 id="integration-dialog-title">Connect account</h2></div><button type="button" class="icon-button" id="integration-dialog-close" aria-label="Close">✕</button></div><p id="integration-dialog-message" class="integration-dialog-message"></p><div class="integration-security-note"><b>Not connected yet</b><p>Provider sign-in, consent scopes, callback URLs, token storage, and disconnect/revoke handling must be configured before NN can link this account.</p></div><button type="button" class="secondary-button full" id="integration-dialog-done">Got it</button></dialog></div><div class="settings-section" data-settings-section="about"><p class="eyebrow">PRODUCT STATUS</p><h2>About NN</h2><p>NN is a separate web app at <b>nn.nasrinai.com</b>.</p><div class="feature-status"><span>Browser microphone capture</span><b class="complete">Available</b></div><div class="feature-status"><span>Native browser noise suppression</span><b class="complete">Best effort</b></div><div class="feature-status"><span>Local AI denoising</span><b>Not implemented</b></div><div class="feature-status"><span>Cloud transcription / summaries</span><b>Not connected</b></div><div class="feature-status"><span>NasrinAI integration</span><b>Not connected</b></div></div></div></div>`;
}
function render() {
  applyAppearance();
  const subtitles:Record<string,string>={Home:'Your quieter, more organized meeting workspace.',Calendar:'Plan your schedule and see upcoming meetings.',Meetings:'Plan conversations and keep meeting details organized.',Team:'Manage your team contacts and preferred tools.',Client:'Keep client contacts and meeting preferences organized.',Notes:'A simple, private space for your meeting notes and ideas.',Chats:'Keep drafts and thoughts together in one place.',Settings:'Make NN work the way you want.'};
  const pages:Record<string,()=>string>={Home:homePage,Calendar:calendarPage,Meetings:meetingsPage,Team:()=>membersPage('Team'),Client:()=>membersPage('Client'),Notes:notesPage,Chats:chatsPage,Settings:settingsPage};
  shell((pages[activePage]??homePage)(),subtitles[activePage]??subtitles.Home);
  bindPage();
}
function startMic() {
  const start=root!.querySelector<HTMLButtonElement>('#start-mic');
  const stop=root!.querySelector<HTMLButtonElement>('#stop-mic');
  const level=root!.querySelector<HTMLMeterElement>('#level');
  const status=root!.querySelector<HTMLElement>('#mic-status');
  const notice=root!.querySelector<HTMLElement>('#mic-notice');
  if(!start||!stop||!level||!status||!notice)return;
  const startHandler=async()=>{
    if(!navigator.mediaDevices?.getUserMedia){start.disabled=false;notice.textContent='Microphone capture is unavailable in this browser. Use a current browser over HTTPS.';return;}
    start.disabled=true;notice.textContent='Waiting for microphone permission…';
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:{noiseSuppression:settings.noiseSuppression,echoCancellation:settings.echoCancellation,autoGainControl:settings.autoGain},video:false});
      context=new AudioContext();await context.resume();const source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=512;source.connect(analyser);const data=new Uint8Array(analyser.fftSize);
      micActive=true;status.textContent='Microphone active';status.classList.add('active');stop.disabled=false;start.innerHTML=icon('mic')+' Microphone active';notice.textContent='Audio levels are analyzed locally for this meter only. No audio is recorded or uploaded.';
      const tick=()=>{if(!analyser)return;analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const n=(v-128)/128;sum+=n*n;}level.value=Math.min(1,Math.sqrt(sum/data.length)*4);raf=requestAnimationFrame(tick);};tick();
    } catch(e) { stream?.getTracks().forEach(t=>t.stop());stream=null;if(context&&context.state!=='closed')void context.close();context=null;start.disabled=false;status.textContent='Needs attention';notice.textContent=e instanceof DOMException&&e.name==='NotAllowedError'?'Microphone permission denied. Allow access in browser settings, then retry.':'Could not start the microphone. Check the selected device and permissions.'; }
  };
  const stopHandler=()=>{stopMicrophone();render();};
  start.addEventListener('click',()=>void startHandler());stop.addEventListener('click',stopHandler);
  root!.querySelector<HTMLButtonElement>('#home-mic')?.addEventListener('click',()=>{if(micActive){stopMicrophone();render();}else{void startHandler();}});
}
function stopMicrophone(){
  cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;if(context&&context.state!=='closed')void context.close();context=null;micActive=false;
}
async function refreshGoogleStatus() {
  try {
    const response = await fetch('/api/google/status', { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const status = await response.json() as { connected?: boolean; email?: string | null; gmailConnected?: boolean; calendarConnected?: boolean };
    const states: Record<string, boolean> = { gmail: Boolean(status.gmailConnected), 'google-calendar': Boolean(status.calendarConnected) };
    Object.entries(states).forEach(([id, connected]) => {
      const badge = root!.querySelector<HTMLElement>('[data-integration-status="' + id + '"]');
      const button = root!.querySelector<HTMLButtonElement>('[data-connect-provider="' + id + '"]');
      if (badge) { badge.textContent = connected ? 'Connected' : 'Not connected'; badge.classList.toggle('connected', connected); }
      if (button) button.textContent = connected ? 'Reconnect' : 'Connect';
    });
    const control = root!.querySelector<HTMLElement>('#google-connection-control');
    if (control) control.hidden = !status.connected;
    const email = root!.querySelector<HTMLElement>('#google-account-email');
    if (email) email.textContent = status.email ? 'Connected as ' + status.email : 'Google account connected';
    const compose = root!.querySelector<HTMLElement>('#gmail-compose-panel');
    if (compose) compose.hidden = !status.gmailConnected;
  } catch { /* Status is informational; the integration stays disconnected if the endpoint is unavailable. */ }
}
function showGoogleFeedback(message: string) {
  const feedback = root!.querySelector<HTMLElement>('#google-oauth-feedback');
  if (feedback) { feedback.textContent = message; feedback.hidden = false; }
}
async function startGoogleConnect(service: 'gmail' | 'calendar', button: HTMLButtonElement) {
  button.disabled = true;
  const previousLabel = button.textContent || 'Connect';
  button.textContent = 'Opening Google…';
  try {
    const response = await fetch('/api/google/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ service })
    });
    const result = await response.json() as { authorizationUrl?: string; error?: string };
    if (!response.ok || !result.authorizationUrl || !result.authorizationUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')) {
      throw new Error(result.error || 'google_setup_incomplete');
    }
    window.location.assign(result.authorizationUrl);
  } catch {
    button.disabled = false;
    button.textContent = previousLabel;
    showGoogleFeedback('Google OAuth is not ready on this deployment. Confirm the server-side environment variables and apply the reviewed Supabase migration, then try again.');
  }
}
async function saveMeetingForm(form: HTMLFormElement, sendGoogleInvite: boolean, fromCalendar: boolean) {
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const title = String(data.get('title') ?? '').trim();
  const date = String(data.get('date') ?? '');
  const startTime = String(data.get('startTime') ?? '');
  const endTime = String(data.get('endTime') ?? '');
  const inviteEmails = String(data.get('inviteEmails') ?? '').trim();
  if ((startTime && !endTime) || (!startTime && endTime) || (startTime && endTime && endTime <= startTime)) {
    alert('Enter both start and end times, and make sure the end is later than the start.');
    return;
  }
  if (sendGoogleInvite && !inviteEmails) {
    alert('Add at least one invitee email address before sending a Google Calendar invitation.');
    return;
  }
  const meeting: Meeting = {
    id: crypto.randomUUID(),
    title,
    date,
    attendees: String(data.get('attendees') ?? '').trim(),
    agenda: String(data.get('agenda') ?? '').trim(),
    createdAt: new Date().toISOString(),
    startTime,
    endTime,
    timezone: String(data.get('timezone') || 'Asia/Manila'),
    platform: String(data.get('platform') || ''),
    location: String(data.get('location') || '').trim(),
    inviteEmails,
    reminder: String(data.get('reminder') || 'none')
  };
  meetings.push(meeting);
  if (fromCalendar) {
    calendarSelectedDate = date;
    const parts = date.split('-').map(Number);
    calendarCursor = new Date(parts[0], parts[1] - 1, 1);
  }
  persist();
  if (!sendGoogleInvite) { render(); return; }
  const button = form.querySelector<HTMLButtonElement>('[data-send-google-invite]');
  if (button) { button.disabled = true; button.textContent = 'Saving & sending…'; }
  try {
    const response = await fetch('/api/google/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        title: meeting.title, date: meeting.date, startTime: meeting.startTime, endTime: meeting.endTime,
        timezone: meeting.timezone, platform: meeting.platform, location: meeting.location,
        inviteEmails: meeting.inviteEmails, agenda: meeting.agenda, reminder: meeting.reminder
      })
    });
    const result = await response.json() as { id?: string; htmlLink?: string; error?: string };
    if (!response.ok) {
      const reason = result.error === 'google_not_connected' || result.error === 'google_scope_missing'
        ? 'Connect Google Calendar in Settings first.'
        : result.error === 'google_reauthorization_required'
          ? 'Reconnect Google Calendar in Settings and try again.'
          : 'Google Calendar could not send the invitation.';
      throw new Error(reason);
    }
    if (typeof result.id === 'string') meeting.googleEventId = result.id;
    if (typeof result.htmlLink === 'string' && result.htmlLink.startsWith('https://calendar.google.com/')) meeting.googleEventUrl = result.htmlLink;
    persist();
    render();

    alert('Meeting saved locally and Google Calendar invitation sent.');
  } catch (error) {
    render();
    alert('Meeting saved locally, but the Google Calendar invitation was not sent. ' + (error instanceof Error ? error.message : 'Please check the Google connection and try again.'));
  }
}
function bindPage() {
  root!.querySelector<HTMLButtonElement>('#cal-prev')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);render();});
  root!.querySelector<HTMLButtonElement>('#cal-next')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);render();});
  root!.querySelector<HTMLButtonElement>('#cal-today')?.addEventListener('click',()=>{const now=new Date();calendarCursor=new Date(now.getFullYear(),now.getMonth(),1);calendarSelectedDate=now.toISOString().slice(0,10);render();});
  root!.querySelectorAll<HTMLElement>('[data-cal-date]').forEach(el=>el.addEventListener('click',()=>{calendarSelectedDate=el.dataset.calDate||calendarSelectedDate;render();}));
  root!.querySelector<HTMLButtonElement>('#cal-add')?.addEventListener('click',()=>root!.querySelector<HTMLDialogElement>('#cal-dialog')?.showModal());
  root!.querySelector<HTMLButtonElement>('#cal-close')?.addEventListener('click',()=>root!.querySelector<HTMLDialogElement>('#cal-dialog')?.close());
  root!.querySelector<HTMLFormElement>('#cal-form')?.addEventListener('submit',e=>{e.preventDefault();void saveMeetingForm(e.currentTarget as HTMLFormElement,false,true);});
  startMic();
  root!.querySelector<HTMLButtonElement>('#new-member')?.addEventListener('click',()=>root!.querySelector<HTMLDialogElement>('#member-dialog')?.showModal());
  root!.querySelector<HTMLButtonElement>('#empty-member')?.addEventListener('click',()=>root!.querySelector<HTMLDialogElement>('#member-dialog')?.showModal());
  root!.querySelector<HTMLButtonElement>('#member-close')?.addEventListener('click',()=>root!.querySelector<HTMLDialogElement>('#member-dialog')?.close());
  root!.querySelector<HTMLFormElement>('#member-form')?.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.currentTarget as HTMLFormElement);const firstName=String(d.get('firstName')).trim(),lastName=String(d.get('lastName')).trim(),email=String(d.get('email')).trim();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){alert('Enter a valid email address or leave it blank.');return;}members.push({id:crypto.randomUUID(),firstName,lastName,email,phone:String(d.get('phone')).trim(),category:String(d.get('category')) as Member['category'],emailProvider:String(d.get('emailProvider')),meetingPlatform:String(d.get('meetingPlatform')),createdAt:new Date().toISOString()});persist();render();});
  root!.querySelectorAll<HTMLElement>('[data-delete-member]').forEach(el=>el.addEventListener('click',()=>{if(confirm('Delete this contact from this browser?')){members=members.filter(m=>m.id!==el.dataset.deleteMember);persist();render();}}));
  root!.querySelector<HTMLButtonElement>('#new-meeting')?.addEventListener('click',()=> (root!.querySelector<HTMLDialogElement>('#meeting-dialog'))?.showModal());
  root!.querySelector<HTMLButtonElement>('#empty-meeting')?.addEventListener('click',()=> (root!.querySelector<HTMLDialogElement>('#meeting-dialog'))?.showModal());
  root!.querySelector<HTMLButtonElement>('#close-meeting')?.addEventListener('click',()=> (root!.querySelector<HTMLDialogElement>('#meeting-dialog'))?.close());
  root!.querySelector<HTMLFormElement>('#meeting-form')?.addEventListener('submit',e=>{e.preventDefault();void saveMeetingForm(e.currentTarget as HTMLFormElement,false,false);});
  root!.querySelectorAll<HTMLButtonElement>('[data-send-google-invite]').forEach(button=>button.addEventListener('click',()=>{const form=button.closest('form');if(form)void saveMeetingForm(form,true,form.id==='cal-form');}));
  root!.querySelectorAll<HTMLElement>('[data-delete-meeting]').forEach(el=>el.addEventListener('click',()=>{if(confirm('Delete this meeting from this browser?')){meetings=meetings.filter(m=>m.id!==el.dataset.deleteMeeting);persist();render();}}));
  root!.querySelectorAll<HTMLElement>('[data-meeting-note]').forEach(el=>el.addEventListener('click',()=>{const m=meetings.find(x=>x.id===el.dataset.meetingNote);if(m){let n=notes.find(x=>x.title===m.title+' — Notes');if(!n){n={id:crypto.randomUUID(),title:m.title+' — Notes',body:m.agenda?'Agenda: '+m.agenda+'\n\nMeeting notes:\n':'',updatedAt:new Date().toISOString()};notes.unshift(n);persist();}selectedNote=n.id;navigate('Notes');}}));
  root!.querySelector<HTMLInputElement>('#meeting-search')?.addEventListener('input',e=>{const q=(e.target as HTMLInputElement).value.toLowerCase();root!.querySelectorAll<HTMLElement>('.meeting-card').forEach(el=>el.hidden=!el.textContent?.toLowerCase().includes(q));});
  root!.querySelector<HTMLButtonElement>('#new-note')?.addEventListener('click',createNote);
  root!.querySelector<HTMLButtonElement>('#first-note')?.addEventListener('click',createNote);
  root!.querySelectorAll<HTMLElement>('[data-select-note]').forEach(el=>el.addEventListener('click',()=>{selectedNote=el.dataset.selectNote??'';render();}));
  const title=root!.querySelector<HTMLInputElement>('#note-title');const body=root!.querySelector<HTMLTextAreaElement>('#note-body');const editingNoteId=selectedNote;let saveTimer=0;
  const saveNote=()=>{const n=notes.find(x=>x.id===editingNoteId);if(!n)return;n.title=title?.value??n.title;n.body=body?.value??n.body;n.updatedAt=new Date().toISOString();persist();const s=root!.querySelector<HTMLElement>('#note-status');if(s)s.textContent='Saved just now';const count=root!.querySelector<HTMLElement>('.editor-bottom span:last-child');if(count&&body)count.textContent=body.value.length+' characters';};
  title?.addEventListener('input',()=>{window.clearTimeout(saveTimer);saveTimer=window.setTimeout(saveNote,250);});body?.addEventListener('input',()=>{window.clearTimeout(saveTimer);saveTimer=window.setTimeout(saveNote,250);});
  root!.querySelector<HTMLButtonElement>('#delete-note')?.addEventListener('click',()=>{if(confirm('Delete this note from this browser?')){notes=notes.filter(n=>n.id!==selectedNote);selectedNote=notes[0]?.id??'';persist();render();}});
  root!.querySelector<HTMLFormElement>('#chat-form')?.addEventListener('submit',e=>{e.preventDefault();const input=root!.querySelector<HTMLTextAreaElement>('#chat-input');const text=input?.value.trim();if(!text)return;chats.push({id:crypto.randomUUID(),role:'user',text,createdAt:new Date().toISOString()});persist();render();});
  root!.querySelectorAll<HTMLElement>('[data-prompt]').forEach(el=>el.addEventListener('click',()=>{const input=root!.querySelector<HTMLTextAreaElement>('#chat-input');if(input){input.value=el.dataset.prompt??'';input.focus();}}));
  root!.querySelector<HTMLButtonElement>('#clear-chat')?.addEventListener('click',()=>{if(confirm('Clear all local chat drafts?')){chats=[];persist();render();}});
  root!.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(el=>el.addEventListener('change',()=>{const key=el.dataset.setting as keyof Settings;settings={...settings,[key]:el.checked};persist();}));
  root!.querySelector<HTMLSelectElement>('#appearance-select')?.addEventListener('change',e=>{settings.appearance=(e.target as HTMLSelectElement).value as Settings['appearance'];persist();render();});
  root!.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach(el=>el.addEventListener('click',()=>{settings.palette=el.dataset.palette as Settings['palette'];persist();render();}));
  const integrationDialog=root!.querySelector<HTMLDialogElement>('#integration-dialog');
  root!.querySelectorAll<HTMLButtonElement>('[data-connect-provider]').forEach(el=>el.addEventListener('click',()=>{const provider=el.dataset.connectProvider;if(provider==='gmail'||provider==='google-calendar'){void startGoogleConnect(provider==='gmail'?'gmail':'calendar',el);return;}const name=el.dataset.providerName||'this provider';const requirement=el.dataset.providerRequirement||'Provider setup required';const title=root!.querySelector<HTMLElement>('#integration-dialog-title');const message=root!.querySelector<HTMLElement>('#integration-dialog-message');if(title)title.textContent='Connect '+name;if(message)message.textContent=name+' is listed as a planned integration. '+requirement+'. The secure sign-in flow is not configured yet, so no account has been connected and no data will be accessed.';integrationDialog?.showModal();}));
  root!.querySelector<HTMLButtonElement>('#integration-dialog-close')?.addEventListener('click',()=>integrationDialog?.close());
  root!.querySelector<HTMLButtonElement>('#integration-dialog-done')?.addEventListener('click',()=>integrationDialog?.close());
  root!.querySelector<HTMLButtonElement>('#google-disconnect')?.addEventListener('click',async()=>{if(!confirm('Disconnect Google and revoke NN’s saved Google connection?'))return;const button=root!.querySelector<HTMLButtonElement>('#google-disconnect');if(button)button.disabled=true;try{const response=await fetch('/api/google/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});if(!response.ok)throw new Error('disconnect_failed');showGoogleFeedback('Google has been disconnected from this NN browser session.');await refreshGoogleStatus();}catch{showGoogleFeedback('Could not finish disconnecting Google. Please retry.');}finally{if(button)button.disabled=false;}});
  root!.querySelector<HTMLFormElement>('#gmail-send-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const button=form.querySelector<HTMLButtonElement>('button[type="submit"]');const status=root!.querySelector<HTMLElement>('#gmail-send-status');if(button){button.disabled=true;button.textContent='Sending…';}if(status)status.textContent='Sending through your connected Google account…';try{const data=new FormData(form);const response=await fetch('/api/google/gmail/send',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({to:String(data.get('to')||''),subject:String(data.get('subject')||''),text:String(data.get('text')||'')})});const result=await response.json() as {sent?:boolean;error?:string};if(!response.ok)throw new Error(result.error||'gmail_send_failed');if(status)status.textContent='Email sent from your connected Gmail account.';form.reset();}catch(error){if(status)status.textContent=error instanceof Error&&error.message==='google_not_connected'?'Connect Gmail first.':error instanceof Error&&error.message==='google_scope_missing'?'Reconnect Gmail and approve the send-email permission.':'Email was not sent. Check the Google connection and try again.';}finally{if(button){button.disabled=false;button.textContent='Send email';}}});
  if(activePage==='Settings')void refreshGoogleStatus();
  root!.querySelector<HTMLButtonElement>('#export-data')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),meetings,members,notes,chats,settings},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nn-workspace-export.json';a.click();URL.revokeObjectURL(url);});
  root!.querySelector<HTMLButtonElement>('#delete-data')?.addEventListener('click',()=>{if(confirm('Permanently delete all NN meetings, contacts, notes, chat drafts, and preferences saved in this browser? This cannot be undone.')){Object.values(KEYS).forEach(k=>localStorage.removeItem(k));meetings=[];notes=[];chats=[];members=[];settings={...defaults};selectedNote='';persist();render();}});
  const settingsSections=root!.querySelectorAll<HTMLElement>('.settings-section');settingsSections.forEach(section=>section.hidden=section.dataset.settingsSection!=='audio');
  root!.querySelectorAll<HTMLElement>('[data-settings-tab]').forEach(el=>el.addEventListener('click',()=>{const target=el.dataset.settingsTab;root!.querySelectorAll('[data-settings-tab]').forEach(x=>x.classList.toggle('active',x===el));settingsSections.forEach(section=>{section.hidden=section.dataset.settingsSection!==target;});}));
  root!.querySelectorAll<HTMLButtonElement>('.stat-card,.quick-card').forEach(el=>el.addEventListener('click',()=>{const p=el.dataset.page;if(p)navigate(p);}));
}
function createMinutesNote(){const n:Note={id:crypto.randomUUID(),title:'Meeting minutes — '+new Date().toLocaleDateString(),body:['Meeting:','Date:','Participants:','','Summary:','','Decisions:','','Action items:',''].join('\n'),updatedAt:new Date().toISOString()};notes.unshift(n);selectedNote=n.id;persist();navigate('Notes');}
function createNote(){const n:Note={id:crypto.randomUUID(),title:'',body:'',updatedAt:new Date().toISOString()};notes.unshift(n);selectedNote=n.id;persist();navigate('Notes');}
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());if(context&&context.state!=='closed')void context.close();});
render();
const googleReturnStatus = new URLSearchParams(window.location.search).get('google');
if (googleReturnStatus) {
  navigate('Settings');
  root!.querySelector<HTMLButtonElement>('[data-settings-tab="integrations"]')?.click();
  const messages: Record<string,string> = {
    'gmail-connected':'Gmail connected successfully.',
    'calendar-connected':'Google Calendar connected successfully.',
    'cancelled':'Google connection was cancelled.',
    'refresh-token-missing':'Google did not return a refresh token. Retry Connect and approve the requested permissions.',
    'session-expired':'The connection session expired. Please start again from Settings.',
    'invalid-state':'Google authorization could not be verified. Please try connecting again.',
    'failed':'Google connection did not complete. Check the server-side OAuth configuration and try again.'
  };
  showGoogleFeedback(messages[googleReturnStatus] || 'Google connection could not be completed.');
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);


