import './style.css';
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing app root');
root.innerHTML = '<main><h1>NN — Clearer meeting audio</h1><p>Microphone capture foundation</p><button id="start">Start microphone</button><button id="stop" disabled>Stop</button><p id="status">Not connected</p><meter id="level" min="0" max="1" value="0"></meter><p id="notice">Audio is processed locally in this prototype.</p></main>';
const start = document.querySelector<HTMLButtonElement>('#start')!;
const stop = document.querySelector<HTMLButtonElement>('#stop')!;
const status = document.querySelector<HTMLElement>('#status')!;
const notice = document.querySelector<HTMLElement>('#notice')!;
const level = document.querySelector<HTMLMeterElement>('#level')!;
let stream: MediaStream | null = null;
let context: AudioContext | null = null;
let raf = 0;
start.onclick = async () => {
  try {
    start.disabled = true;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true }, video: false });
    context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => { analyser.getByteTimeDomainData(data); let sum = 0; for (const v of data) { const n = (v - 128) / 128; sum += n*n; } level.value = Math.min(1, Math.sqrt(sum/data.length)*4); raf = requestAnimationFrame(tick); };
    tick(); status.textContent = 'Microphone active'; stop.disabled = false;
    notice.textContent = 'Audio levels are analyzed locally. No audio is recorded or uploaded.';
  } catch (e) { start.disabled = false; status.textContent = 'Needs attention'; notice.textContent = e instanceof Error ? e.message : 'Could not access microphone.'; }
};
stop.onclick = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); stream = null; if (context && context.state !== 'closed') void context.close(); context = null; level.value = 0; start.disabled = false; stop.disabled = true; status.textContent = 'Not connected'; notice.textContent = 'Microphone stopped. No audio was saved or uploaded.'; };
window.addEventListener('pagehide', () => { stream?.getTracks().forEach(t => t.stop()); if (context && context.state !== 'closed') void context.close(); });
