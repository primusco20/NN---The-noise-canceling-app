import './style.css';

type Meeting = { id: string; title: string; date: string; attendees: string; agenda: string; createdAt: string };
type Note = { id: string; title: string; body: string; updatedAt: string };
type ChatMessage = { id: string; role: 'user'; text: string; createdAt: string };
type Settings = { noiseSuppression: boolean; echoCancellation: boolean; autoGain: boolean; theme: 'dark' | 'light'; storage: 'local' };
const KEYS = { meetings: 'nn.meetings.v1', notes: 'nn.notes.v1', chats: 'nn.chats.v1', settings: 'nn.settings.v1' };
const defaults: Settings = { noiseSuppression: true, echoCancellation: true, autoGain: true, theme: 'dark', storage: 'local' };
const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
let meetings = read<Meeting[]>(KEYS.meetings, []);
let notes = read<Note[]>(KEYS.notes, []);
let chats = read<ChatMessage[]>(KEYS.chats, []);
let settings = read<Settings>(KEYS.settings, defaults);
let activePage = 'Home';
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
}
function esc(value: string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c)); }
function icon(name: string) {
  const paths: Record<string,string> = {
    home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/>',
    meetings:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    notes:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    chats:'<path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 21l1.8-5.1A8.5 8.5 0 1 1 21 11.5Z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M9 22h6"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>'
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
      <div class="nav-label">WORKSPACE</div><nav>${navButton('Home','Home')}${navButton('Meetings','Meetings')}${navButton('Notes','Notes')}${navButton('Chats','Chats')}</nav>
      <div class="sidebar-bottom"><div class="privacy-mini"><span class="lock-dot">✓</span><span><b>Private by default</b><small>Your workspace stays in this browser.</small></span></div>${navButton('Settings','Settings')}<div class="profile"><span class="profile-avatar">NN</span><span><b>Personal account</b><small>Local-only mode</small></span><button class="icon-button" id="profile-menu" aria-label="Workspace information">•••</button></div></div>
    </aside>
    <main class="main-area"><header class="topbar"><button id="mobile-menu" class="icon-button mobile-only" aria-label="Open navigation">☰</button><div class="breadcrumbs">Workspace ${icon('chevron')} <b>${activePage}</b></div><div class="top-actions"><span class="secure-pill"><i></i> On-device workspace</span><button class="icon-button" data-page="Settings" aria-label="Settings">${icon('settings')}</button></div></header>
    <section class="page"><div class="page-heading"><div><p class="eyebrow">NN WORKSPACE</p><h1>${activePage}</h1><p class="page-subtitle">${subtitle}</p></div>${activePage==='Meetings'?'<button class="primary-button" id="new-meeting">'+icon('plus')+' New meeting</button>':activePage==='Notes'?'<button class="primary-button" id="new-note">'+icon('plus')+' New note</button>':''}</div>${content}</section>
    <footer class="footer"><span>NN · The Noise Canceling App</span><span>Local-first · You control your data</span></footer></main>
  </div>`;
  root!.querySelectorAll<HTMLElement>('[data-page]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); const page=(el as HTMLElement).dataset.page; if(page) navigate(page); }));
  root!.querySelector<HTMLButtonElement>('#mobile-menu')?.addEventListener('click',()=>root!.querySelector('#sidebar')?.classList.toggle('mobile-open'));
  root!.querySelector<HTMLButtonElement>('#profile-menu')?.addEventListener('click',()=>navigate('Settings'));
}
function navigate(page: string) { activePage=page; render(); }
function homePage() {
  return `<section class="welcome-card"><div class="welcome-copy"><span class="soft-tag">${icon('mic')} AUDIO WORKSPACE</span><h2>Make every conversation<br><em>clearer.</em></h2><p>Check your microphone, organize meetings, and keep your notes in one calm workspace.</p><div class="welcome-actions"><button class="primary-button" id="home-mic">${icon('mic')} ${micActive?'Stop microphone':'Check microphone'}</button><button class="secondary-button" data-page="Meetings">${icon('plus')} Plan a meeting</button></div></div><div class="sound-visual" aria-hidden="true"><div class="sound-ring ring-one"></div><div class="sound-ring ring-two"></div><div class="sound-core">${icon('mic')}</div><div class="sound-bars">${Array.from({length:21},(_,i)=>'<i style="--h:'+([12,20,32,18,42,26,52,34,68,44,78,40,60,30,48,22,38,17,30,14,22][i])+'px"></i>').join('')}</div></div></section>
  <div class="section-title"><div><h2>Your workspace</h2><p>Everything you need to stay focused.</p></div></div>
  <div class="stats-grid"><button class="stat-card" data-page="Meetings"><span class="stat-icon purple">${icon('meetings')}</span><span class="stat-number">${meetings.length}</span><span class="stat-name">Meetings</span><span class="stat-foot">Scheduled in this browser ${icon('chevron')}</span></button><button class="stat-card" data-page="Notes"><span class="stat-icon blue">${icon('notes')}</span><span class="stat-number">${notes.length}</span><span class="stat-name">Notes</span><span class="stat-foot">Saved locally ${icon('chevron')}</span></button><button class="stat-card" data-page="Chats"><span class="stat-icon amber">${icon('chats')}</span><span class="stat-number">${chats.length}</span><span class="stat-name">Chat messages</span><span class="stat-foot">Local chat drafts ${icon('chevron')}</span></button></div>
  <div class="section-title"><div><h2>Quick access</h2><p>Pick up where you left off.</p></div></div><div class="quick-grid"><button class="quick-card" data-page="Notes"><span class="quick-icon">${icon('notes')}</span><span><b>Capture an idea</b><small>Write and save a note</small></span>${icon('chevron')}</button><button class="quick-card" data-page="Chats"><span class="quick-icon">${icon('chats')}</span><span><b>Open chats</b><small>Keep a local conversation draft</small></span>${icon('chevron')}</button></div>
  <div class="audio-card"><div class="audio-card-heading"><div><span class="eyebrow">MICROPHONE TEST</span><h2>Audio input</h2></div><span id="mic-status" class="status-chip ${micActive?'active':''}">${micActive?'Microphone active':'Not connected'}</span></div><p>Browser-native noise suppression is available when supported. Local AI denoising is not connected yet.</p><div class="level-row"><span>Input level</span><meter id="level" min="0" max="1" value="0"></meter></div><div class="audio-controls"><button class="primary-button" id="start-mic">${icon('mic')} Start microphone</button><button class="secondary-button" id="stop-mic" ${micActive?'':'disabled'}>Stop</button></div><p class="privacy-note" id="mic-notice">Audio is analyzed locally for this meter only; it is not recorded or uploaded.</p></div>`;
}
function meetingsPage() {
  const cards=meetings.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(m=>`<article class="meeting-card"><div class="meeting-date"><b>${esc(m.date?new Date(m.date+'T12:00:00').toLocaleDateString(undefined,{day:'2-digit'}):'—')}</b><span>${esc(m.date?new Date(m.date+'T12:00:00').toLocaleDateString(undefined,{month:'short'}):'DATE')}</span></div><div class="meeting-info"><h3>${esc(m.title)}</h3><p>${esc(m.attendees||'No attendees added')}</p>${m.agenda?'<p class="agenda">'+esc(m.agenda)+'</p>':''}<small>Created ${esc(new Date(m.createdAt).toLocaleDateString())}</small></div><div class="meeting-actions"><button class="secondary-button small" data-meeting-note="${m.id}">Open notes</button><button class="icon-button danger" data-delete-meeting="${m.id}" aria-label="Delete meeting">${icon('trash')}</button></div></article>`).join('');
  return `<div class="toolbar"><div class="search-box">${icon('search')}<input id="meeting-search" placeholder="Search meetings" aria-label="Search meetings"></div><span class="result-count">${meetings.length} meeting${meetings.length===1?'':'s'}</span></div><div id="meeting-list" class="meeting-list">${cards||'<div class="empty-state"><span class="empty-icon">'+icon('meetings')+'</span><h3>No meetings yet</h3><p>Create a meeting to keep its date, attendees, agenda, and related notes together.</p><button class="primary-button" id="empty-meeting">'+icon('plus')+' Create your first meeting</button></div>'}</div><dialog id="meeting-dialog" class="modal"><form id="meeting-form"><div class="modal-heading"><div><p class="eyebrow">MEETING DETAILS</p><h2>New meeting</h2></div><button type="button" class="icon-button" id="close-meeting" aria-label="Close">✕</button></div><label>Meeting title<input name="title" required maxlength="120" placeholder="Weekly team sync"></label><div class="form-row"><label>Date<input name="date" type="date" required></label><label>Attendees<input name="attendees" maxlength="240" placeholder="Names, separated by commas"></label></div><label>Agenda<textarea name="agenda" rows="3" maxlength="2000" placeholder="What do you want to cover?"></textarea></label><p class="form-hint">Meeting details are saved to this browser only.</p><button class="primary-button full" type="submit">Save meeting</button></form></dialog>`;
}
function notesPage() {
  const current=notes.find(n=>n.id===selectedNote);
  return `<div class="notes-layout"><aside class="notes-list-panel"><div class="notes-list-head"><b>All notes</b><span>${notes.length}</span></div><div class="note-items">${notes.map(n=>`<button class="note-list-item ${n.id===selectedNote?'selected':''}" data-select-note="${n.id}"><b>${esc(n.title||'Untitled note')}</b><small>${esc(new Date(n.updatedAt).toLocaleDateString())}</small><p>${esc(n.body.slice(0,76)||'No content yet')}</p></button>`).join('')||'<p class="muted empty-notes">Your notes will appear here.</p>'}</div></aside><section class="note-editor">${current?`<div class="editor-top"><span class="saved-label"><i></i> Saved in this browser</span><button id="delete-note" class="icon-button danger" aria-label="Delete note">${icon('trash')}</button></div><input id="note-title" class="note-title-input" value="${esc(current.title)}" maxlength="160" aria-label="Note title" placeholder="Untitled note"><textarea id="note-body" class="note-body-input" maxlength="30000" placeholder="Start writing…">${esc(current.body)}</textarea><div class="editor-bottom"><span id="note-status">Changes save automatically</span><span>${current.body.length} characters</span></div>`:'<div class="empty-state compact"><span class="empty-icon">'+icon('notes')+'</span><h3>Make space for an idea</h3><p>Create a note to capture the details worth remembering.</p><button class="primary-button" id="first-note">'+icon('plus')+' Create a note</button></div>'}</section></div><p class="privacy-note below-note">Notes are stored in this browser's local storage. Clearing browser site data can remove them; export and cloud sync are not implemented yet.</p>`;
}
function chatsPage() {
  return `<section class="chat-layout"><div class="chat-header"><div class="chat-avatar">${icon('chats')}</div><div><h2>Workspace chat</h2><p>Private local draft · AI is not connected</p></div><span class="local-pill">LOCAL ONLY</span></div><div class="chat-history" id="chat-history">${chats.length?chats.map(m=>`<div class="chat-message user-message"><div class="message-avatar">You</div><div><p>${esc(m.text)}</p><small>${esc(new Date(m.createdAt).toLocaleString())}</small></div></div>`).join(''):'<div class="chat-empty"><span class="empty-icon">'+icon('chats')+'</span><h3>Think it through here</h3><p>Use this space to draft questions, meeting follow-ups, or ideas. Messages stay in this browser.</p><div class="prompt-chips"><button data-prompt="Help me outline a meeting agenda">Outline an agenda</button><button data-prompt="Draft a meeting follow-up checklist">Draft follow-up tasks</button><button data-prompt="Help me organize my ideas">Organize my ideas</button></div></div>'}</div><form id="chat-form" class="chat-composer"><textarea id="chat-input" rows="1" maxlength="4000" placeholder="Write a message or draft…" aria-label="Chat message"></textarea><button class="send-button" type="submit" aria-label="Save message draft">↑</button></form><div class="chat-disclaimer">Messages are saved locally as drafts. No AI response is generated or sent to a service.</div><div class="chat-tools"><button id="clear-chat" class="text-button">${icon('trash')} Clear chat drafts</button></div></section>`;
}
function settingsPage() {
  return `<div class="settings-layout"><aside class="settings-nav"><button class="settings-tab active" data-settings-tab="audio">Audio preferences</button><button class="settings-tab" data-settings-tab="privacy">Privacy & data</button><button class="settings-tab" data-settings-tab="appearance">Appearance</button><button class="settings-tab" data-settings-tab="about">About NN</button></aside><div class="settings-content" id="settings-content"><div class="settings-section"><p class="eyebrow">INPUT PREFERENCES</p><h2>Audio preferences</h2><p>Choose the browser processing options used when you start your microphone.</p><div class="setting-row"><div><b>Noise suppression</b><p>Ask the browser to reduce background noise when supported.</p></div><label class="switch"><input type="checkbox" data-setting="noiseSuppression" ${settings.noiseSuppression?'checked':''}><span></span></label></div><div class="setting-row"><div><b>Echo cancellation</b><p>Reduce speaker audio leaking into the microphone.</p></div><label class="switch"><input type="checkbox" data-setting="echoCancellation" ${settings.echoCancellation?'checked':''}><span></span></label></div><div class="setting-row"><div><b>Automatic gain control</b><p>Let the browser adjust microphone input level.</p></div><label class="switch"><input type="checkbox" data-setting="autoGain" ${settings.autoGain?'checked':''}><span></span></label></div></div><div class="settings-section"><p class="eyebrow">DATA CONTROL</p><h2>Privacy & data</h2><div class="privacy-panel"><span class="privacy-check">✓</span><div><b>Local-only storage is active</b><p>Meetings, notes, chat drafts, and preferences are saved in this browser. They are not synced to a server.</p></div></div><div class="setting-row"><div><b>Export workspace data</b><p>Download your meetings, notes, chat drafts, and preferences as JSON.</p></div><button class="secondary-button small" id="export-data">Export JSON</button></div><div class="setting-row"><div><b>Delete local workspace data</b><p>Remove saved meetings, notes, chat drafts, and preferences from this browser.</p></div><button class="danger-button" id="delete-data">Delete data</button></div></div><div class="settings-section"><p class="eyebrow">DISPLAY</p><h2>Appearance</h2><div class="setting-row"><div><b>Theme</b><p>Choose the workspace color scheme.</p></div><select id="theme-select" class="select-control"><option value="dark" ${settings.theme==='dark'?'selected':''}>Dark</option><option value="light" ${settings.theme==='light'?'selected':''}>Light</option></select></div></div><div class="settings-section"><p class="eyebrow">PRODUCT STATUS</p><h2>About NN</h2><p>NN is a separate web app at <b>nn.nasrinai.com</b>.</p><div class="feature-status"><span>Browser microphone capture</span><b class="complete">Available</b></div><div class="feature-status"><span>Native browser noise suppression</span><b class="complete">Best effort</b></div><div class="feature-status"><span>Local AI denoising</span><b>Not implemented</b></div><div class="feature-status"><span>Cloud transcription / summaries</span><b>Not connected</b></div><div class="feature-status"><span>NasrinAI integration</span><b>Not connected</b></div></div></div></div>`;
}
function render() {
  document.documentElement.dataset.theme=settings.theme;
  const subtitles:Record<string,string>={Home:'Your quieter, more organized meeting workspace.',Meetings:'Plan conversations and keep meeting details organized.',Notes:'A simple, private space for your meeting notes and ideas.',Chats:'Keep drafts and thoughts together in one place.',Settings:'Make NN work the way you want.'};
  const pages:Record<string,()=>string>={Home:homePage,Meetings:meetingsPage,Notes:notesPage,Chats:chatsPage,Settings:settingsPage};
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
    if(!navigator.mediaDevices?.getUserMedia){notice.textContent='Microphone capture is unavailable in this browser. Use a current browser over HTTPS.';return;}
    start.disabled=true;notice.textContent='Waiting for microphone permission…';
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:{noiseSuppression:settings.noiseSuppression,echoCancellation:settings.echoCancellation,autoGainControl:settings.autoGain},video:false});
      context=new AudioContext();await context.resume();const source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=512;source.connect(analyser);const data=new Uint8Array(analyser.fftSize);
      micActive=true;status.textContent='Microphone active';status.classList.add('active');stop.disabled=false;start.innerHTML=icon('mic')+' Microphone active';notice.textContent='Audio levels are analyzed locally for this meter only. No audio is recorded or uploaded.';
      const tick=()=>{if(!analyser)return;analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const n=(v-128)/128;sum+=n*n;}level.value=Math.min(1,Math.sqrt(sum/data.length)*4);raf=requestAnimationFrame(tick);};tick();
    } catch(e) { stream?.getTracks().forEach(t=>t.stop());stream=null;start.disabled=false;status.textContent='Needs attention';notice.textContent=e instanceof DOMException&&e.name==='NotAllowedError'?'Microphone permission denied. Allow access in browser settings, then retry.':'Could not start the microphone. Check the selected device and permissions.'; }
  };
  const stopHandler=()=>stopMicrophone();
  start.addEventListener('click',()=>void startHandler());stop.addEventListener('click',stopHandler);
  root!.querySelector<HTMLButtonElement>('#home-mic')?.addEventListener('click',()=>{if(micActive){stopMicrophone();render();}else{void startHandler();}});
}
function stopMicrophone(){
  cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;if(context&&context.state!=='closed')void context.close();context=null;micActive=false;
}
function bindPage() {
  root!.querySelector<HTMLButtonElement>('#new-meeting')?.addEventListener('click',()=> (root!.querySelector<HTMLDialogElement>('#meeting-dialog'))?.showModal());
  root!.querySelector<HTMLButtonElement>('#empty-meeting')?.addEventListener('click',()=> (root!.querySelector<HTMLDialogElement>('#meeting-dialog'))?.showModal());
  root!.querySelector<HTMLButtonElement>('#close-meeting')?.addEventListener('click',()=> (root!.querySelector<HTMLDialogElement>('#meeting-dialog'))?.close());
  root!.querySelector<HTMLFormElement>('#meeting-form')?.addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const data=new FormData(form);meetings.push({id:crypto.randomUUID(),title:String(data.get('title')).trim(),date:String(data.get('date')),attendees:String(data.get('attendees')).trim(),agenda:String(data.get('agenda')).trim(),createdAt:new Date().toISOString()});persist();render();});
  root!.querySelectorAll<HTMLElement>('[data-delete-meeting]').forEach(el=>el.addEventListener('click',()=>{if(confirm('Delete this meeting from this browser?')){meetings=meetings.filter(m=>m.id!==el.dataset.deleteMeeting);persist();render();}}));
  root!.querySelectorAll<HTMLElement>('[data-meeting-note]').forEach(el=>el.addEventListener('click',()=>{const m=meetings.find(x=>x.id===el.dataset.meetingNote);if(m){let n=notes.find(x=>x.title===m.title+' — Notes');if(!n){n={id:crypto.randomUUID(),title:m.title+' — Notes',body:m.agenda?'Agenda: '+m.agenda+'\n\nMeeting notes:\n':'',updatedAt:new Date().toISOString()};notes.unshift(n);persist();}selectedNote=n.id;navigate('Notes');}}));
  root!.querySelector<HTMLInputElement>('#meeting-search')?.addEventListener('input',e=>{const q=(e.target as HTMLInputElement).value.toLowerCase();root!.querySelectorAll<HTMLElement>('.meeting-card').forEach(el=>el.hidden=!el.textContent?.toLowerCase().includes(q));});
  root!.querySelector<HTMLButtonElement>('#new-note')?.addEventListener('click',createNote);
  root!.querySelector<HTMLButtonElement>('#first-note')?.addEventListener('click',createNote);
  root!.querySelectorAll<HTMLElement>('[data-select-note]').forEach(el=>el.addEventListener('click',()=>{selectedNote=el.dataset.selectNote??'';render();}));
  const title=root!.querySelector<HTMLInputElement>('#note-title');const body=root!.querySelector<HTMLTextAreaElement>('#note-body');let saveTimer=0;
  const saveNote=()=>{const n=notes.find(x=>x.id===selectedNote);if(!n)return;n.title=title?.value??n.title;n.body=body?.value??n.body;n.updatedAt=new Date().toISOString();persist();const s=root!.querySelector<HTMLElement>('#note-status');if(s)s.textContent='Saved just now';const count=root!.querySelector<HTMLElement>('.editor-bottom span:last-child');if(count&&body)count.textContent=body.value.length+' characters';};
  title?.addEventListener('input',()=>{window.clearTimeout(saveTimer);saveTimer=window.setTimeout(saveNote,250);});body?.addEventListener('input',()=>{window.clearTimeout(saveTimer);saveTimer=window.setTimeout(saveNote,250);});
  root!.querySelector<HTMLButtonElement>('#delete-note')?.addEventListener('click',()=>{if(confirm('Delete this note from this browser?')){notes=notes.filter(n=>n.id!==selectedNote);selectedNote=notes[0]?.id??'';persist();render();}});
  root!.querySelector<HTMLFormElement>('#chat-form')?.addEventListener('submit',e=>{e.preventDefault();const input=root!.querySelector<HTMLTextAreaElement>('#chat-input');const text=input?.value.trim();if(!text)return;chats.push({id:crypto.randomUUID(),role:'user',text,createdAt:new Date().toISOString()});persist();render();});
  root!.querySelectorAll<HTMLElement>('[data-prompt]').forEach(el=>el.addEventListener('click',()=>{const input=root!.querySelector<HTMLTextAreaElement>('#chat-input');if(input){input.value=el.dataset.prompt??'';input.focus();}}));
  root!.querySelector<HTMLButtonElement>('#clear-chat')?.addEventListener('click',()=>{if(confirm('Clear all local chat drafts?')){chats=[];persist();render();}});
  root!.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(el=>el.addEventListener('change',()=>{const key=el.dataset.setting as keyof Settings;settings={...settings,[key]:el.checked};persist();}));
  root!.querySelector<HTMLSelectElement>('#theme-select')?.addEventListener('change',e=>{settings.theme=(e.target as HTMLSelectElement).value as Settings['theme'];persist();render();});
  root!.querySelector<HTMLButtonElement>('#export-data')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),meetings,notes,chats,settings},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nn-workspace-export.json';a.click();URL.revokeObjectURL(url);});
  root!.querySelector<HTMLButtonElement>('#delete-data')?.addEventListener('click',()=>{if(confirm('Permanently delete all NN meetings, notes, chat drafts, and preferences saved in this browser? This cannot be undone.')){Object.values(KEYS).forEach(k=>localStorage.removeItem(k));meetings=[];notes=[];chats=[];settings={...defaults};selectedNote='';persist();render();}});
  root!.querySelectorAll<HTMLElement>('[data-settings-tab]').forEach(el=>el.addEventListener('click',()=>{const target=el.dataset.settingsTab;root!.querySelectorAll('[data-settings-tab]').forEach(x=>x.classList.toggle('active',x===el));const sections=root!.querySelectorAll<HTMLElement>('.settings-section');sections.forEach((s,i)=>s.hidden=(target==='audio'&&i!==0)||(target==='privacy'&&i!==1)||(target==='appearance'&&i!==2)||(target==='about'&&i!==3));}));
  root!.querySelectorAll<HTMLButtonElement>('.stat-card,.quick-card').forEach(el=>el.addEventListener('click',()=>{const p=el.dataset.page;if(p)navigate(p);}));
}
function createNote(){const n:Note={id:crypto.randomUUID(),title:'',body:'',updatedAt:new Date().toISOString()};notes.unshift(n);selectedNote=n.id;persist();navigate('Notes');}
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());if(context&&context.state!=='closed')void context.close();});
render();
