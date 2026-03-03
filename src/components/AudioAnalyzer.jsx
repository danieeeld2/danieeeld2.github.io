import { useState, useRef, useCallback, useEffect } from 'react';

const FFT_SIZE = 4096;
const COLORS = { a: '#c87533', b: '#5b8a72' };

function calcTHD(dataArray, sampleRate) {
  const binSize = sampleRate / FFT_SIZE;
  const magArray = dataArray.map(db => Math.pow(10, db / 20));
  let maxMag = 0, fundIdx = 0;
  const minBin = Math.floor(30 / binSize);
  const maxBin = Math.min(Math.floor(300 / binSize), magArray.length);
  for (let i = minBin; i < maxBin; i++) {
    if (magArray[i] > maxMag) { maxMag = magArray[i]; fundIdx = i; }
  }
  if (maxMag < 1e-6) return { thd: 0, fundamental: 0 };
  const a_ = fundIdx > 0 ? magArray[fundIdx - 1] : magArray[fundIdx];
  const b_ = magArray[fundIdx];
  const c_ = fundIdx < magArray.length - 1 ? magArray[fundIdx + 1] : magArray[fundIdx];
  const delta = 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ || 1);
  const fundFreq = (fundIdx + delta) * binSize;
  let fundEnergy = 0;
  for (let j = Math.max(0, fundIdx - 2); j <= Math.min(magArray.length - 1, fundIdx + 2); j++) {
    fundEnergy += magArray[j] * magArray[j];
  }
  let harmEnergy = 0;
  for (let h = 2; h <= 16; h++) {
    const hBin = Math.round(fundIdx * h);
    if (hBin >= magArray.length - 2) break;
    let hPeak = 0;
    for (let j = Math.max(0, hBin - 2); j <= Math.min(magArray.length - 1, hBin + 2); j++) {
      if (magArray[j] > hPeak) hPeak = magArray[j];
    }
    harmEnergy += hPeak * hPeak;
  }
  const noiseStart = Math.floor(4000 / binSize);
  const noiseEnd = Math.min(Math.floor(8000 / binSize), magArray.length);
  const noiseBins = magArray.slice(noiseStart, noiseEnd).sort((x, y) => x - y);
  const noiseFloor = noiseBins[Math.floor(noiseBins.length / 2)] || 0;
  harmEnergy = Math.max(0, harmEnergy - noiseFloor * noiseFloor * 16);
  const thd = (Math.sqrt(harmEnergy) / Math.sqrt(fundEnergy)) * 100;
  return { thd: Math.min(thd, 200), fundamental: fundFreq };
}

function getTHDLabel(thd) {
  if (thd < 3) return 'Clean';
  if (thd < 10) return 'Low distortion';
  if (thd < 25) return 'Moderate';
  if (thd < 45) return 'Heavy';
  return 'Extreme';
}

function getTHDColor(thd) {
  if (thd < 10) return '#22c55e';
  if (thd < 25) return '#eab308';
  if (thd < 45) return '#f97316';
  return '#dc2626';
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function detectKicks(audioBuffer, threshold = 0.7) {
  const data = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  const windowSize = Math.floor(sr * 0.01);
  const hopSize = Math.floor(sr * 0.005);
  const minGap = Math.floor(sr * 0.15);
  const energies = [];
  for (let i = 0; i < data.length - windowSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) energy += data[i + j] * data[i + j];
    energies.push({ energy: energy / windowSize, sample: i });
  }
  const maxEnergy = Math.max(...energies.map(e => e.energy));
  const thresh = maxEnergy * threshold * 0.3;
  const kicks = [];
  let lastKick = -minGap;
  for (let i = 1; i < energies.length - 1; i++) {
    const e = energies[i];
    if (e.energy > thresh && e.energy > energies[i-1].energy && e.energy >= energies[i+1].energy) {
      if (e.sample - lastKick >= minGap) { kicks.push(e.sample); lastKick = e.sample; }
    }
  }
  return kicks;
}

async function analyzeKick(audioBuffer, kickSample) {
  const sr = audioBuffer.sampleRate;
  const windowSamples = Math.floor(sr * 0.05);
  const start = Math.max(0, kickSample);
  const end = Math.min(audioBuffer.length, start + windowSamples);
  const length = end - start;
  if (length < 256) return null;
  const offline = new OfflineAudioContext(1, length, sr);
  const buffer = offline.createBuffer(1, length, sr);
  const srcData = audioBuffer.getChannelData(0);
  const destData = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) destData[i] = srcData[start + i];
  const source = offline.createBufferSource();
  source.buffer = buffer;
  const analyser = offline.createAnalyser();
  analyser.fftSize = Math.min(FFT_SIZE, 2048);
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  analyser.connect(offline.destination);
  source.start(0);
  await offline.startRendering();
  const freqData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(freqData);
  return calcTHD(freqData, sr);
}

async function analyzeKicksTHD(audioBuffer) {
  const kicks = detectKicks(audioBuffer);
  if (kicks.length === 0) return { thd: 0, fundamental: 0, kickCount: 0, mode: 'kick' };
  const step = Math.max(1, Math.floor(kicks.length / 20));
  const sampled = kicks.filter((_, i) => i % step === 0).slice(0, 20);
  const results = [];
  for (const k of sampled) {
    const r = await analyzeKick(audioBuffer, k);
    if (r && r.fundamental > 0) results.push(r);
  }
  if (results.length === 0) return { thd: 0, fundamental: 0, kickCount: 0, mode: 'kick' };
  const avgThd = results.reduce((s, r) => s + r.thd, 0) / results.length;
  const avgFund = results.reduce((s, r) => s + r.fundamental, 0) / results.length;
  return { thd: avgThd, fundamental: avgFund, kickCount: kicks.length, mode: 'kick' };
}

function TrackPanel({ label, color, audioCtxRef, onReady, onBuffer }) {
  const [fileName, setFileName] = useState('');
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const sourceNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef = useRef(null);
  const startCtxTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const timerRef = useRef(null);

  // Centralized stop function
  const stopPlayback = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.onended = null; sourceNodeRef.current.stop(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    setPlaying(false);
  }, []);

  // Centralized play function
  const startPlayback = useCallback((fromOffset) => {
    if (!bufferRef.current || !audioCtxRef.current || !analyserRef.current) return;
    // Always clean up before starting
    stopPlayback();

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const src = ctx.createBufferSource();
    src.buffer = bufferRef.current;
    src.connect(analyserRef.current);
    analyserRef.current.connect(ctx.destination);

    const off = Math.max(0, Math.min(fromOffset, bufferRef.current.duration - 0.01));
    src.start(0, off);
    startCtxTimeRef.current = ctx.currentTime;
    offsetRef.current = off;
    sourceNodeRef.current = src;
    setPlaying(true);

    src.onended = () => {
      stopPlayback();
      offsetRef.current = 0;
      setCurrentTime(0);
    };

    timerRef.current = setInterval(() => {
      if (!audioCtxRef.current) return;
      const t = offsetRef.current + (audioCtxRef.current.currentTime - startCtxTimeRef.current);
      setCurrentTime(Math.min(t, bufferRef.current?.duration || 0));
    }, 50);
  }, [audioCtxRef, stopPlayback]);

  const handleFile = useCallback(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    stopPlayback();
    setFileName(f.name);
    offsetRef.current = 0;
    setCurrentTime(0);

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const arrayBuf = await f.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    bufferRef.current = audioBuf;
    setDuration(audioBuf.duration);

    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = FFT_SIZE;
      analyserRef.current.smoothingTimeConstant = 0.75;
    }
    onReady(analyserRef.current);
    onBuffer(audioBuf);
  }, [audioCtxRef, onReady, onBuffer, stopPlayback]);

  const togglePlay = useCallback(() => {
    if (!bufferRef.current) return;
    if (playing) {
      // Save current position before stopping
      if (audioCtxRef.current) {
        offsetRef.current += audioCtxRef.current.currentTime - startCtxTimeRef.current;
      }
      stopPlayback();
    } else {
      startPlayback(offsetRef.current);
    }
  }, [playing, audioCtxRef, stopPlayback, startPlayback]);

  const handleSeek = useCallback((e) => {
    if (!bufferRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = ratio * bufferRef.current.duration;
    offsetRef.current = seekTime;
    setCurrentTime(seekTime);
    if (playing) startPlayback(seekTime);
  }, [playing, startPlayback]);

  // Cleanup on unmount
  useEffect(() => { return () => stopPlayback(); }, [stopPlayback]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{ border: `1px solid ${color}33`, borderRadius: 12, padding: 14, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, color: 'var(--analyzer-text)' }}>{label}</span>
      </div>
      <label style={{
        display: 'block', padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--analyzer-border)',
        textAlign: 'center', cursor: 'pointer', fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
        marginBottom: 8, color: 'var(--analyzer-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {fileName || 'Select .mp3 / .wav'}
        <input type="file" accept="audio/*" onChange={handleFile} style={{ display: 'none' }} />
      </label>
      {fileName && (
        <>
          <button onClick={togglePlay} style={{
            width: '100%', padding: '7px 0', borderRadius: 8, border: 'none',
            background: playing ? '#dc2626' : color, color: '#fff',
            fontFamily: '"JetBrains Mono", monospace', fontSize: 12, cursor: 'pointer', marginBottom: 8,
          }}>
            {playing ? '■ Stop' : '▶ Play'}
          </button>
          <div onClick={handleSeek} style={{
            height: 6, background: 'var(--analyzer-border)', borderRadius: 3, cursor: 'pointer', position: 'relative',
          }}>
            <div style={{ height: '100%', width: `${progress}%`, background: color, borderRadius: 3, transition: 'width 0.05s linear' }} />
            <div style={{
              position: 'absolute', top: -4, left: `calc(${progress}% - 7px)`, width: 14, height: 14,
              borderRadius: '50%', background: color, border: '2px solid var(--analyzer-bg)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>{formatTime(currentTime)}</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>{formatTime(duration)}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function AudioAnalyzer() {
  const audioCtxRef = useRef(null);
  const canvasRef = useRef(null);
  const analysersRef = useRef({ a: null, b: null });
  const buffersRef = useRef({ a: null, b: null });
  const animRef = useRef(null);
  const [stats, setStats] = useState({ a: null, b: null });
  const [kickStats, setKickStats] = useState({ a: null, b: null });
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState('realtime');
  const [analyzing, setAnalyzing] = useState({ a: false, b: false });
  const frozenRef = useRef({ a: null, b: null });

  const runKickAnalysis = useCallback(async (key) => {
    const buf = buffersRef.current[key];
    if (!buf) return;
    setAnalyzing(prev => ({ ...prev, [key]: true }));
    try {
      const result = await analyzeKicksTHD(buf);
      setKickStats(prev => ({ ...prev, [key]: result }));
    } catch (e) { console.error('Kick analysis failed:', e); }
    setAnalyzing(prev => ({ ...prev, [key]: false }));
  }, []);

  useEffect(() => {
    if (mode === 'kick') {
      if (buffersRef.current.a) runKickAnalysis('a');
      if (buffersRef.current.b) runKickAnalysis('b');
    }
  }, [mode, runKickAnalysis]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#1a1a1a' : '#faf8f5';
    ctx.fillRect(0, 0, w, h);
    const sampleRate = audioCtxRef.current?.sampleRate || 44100;
    const maxFreq = 10000;
    const newStats = { a: null, b: null };
    const toX = (freq) => {
      const logFreq = Math.log10(Math.max(freq, 20));
      return ((logFreq - Math.log10(20)) / (Math.log10(maxFreq) - Math.log10(20))) * w;
    };
    const toY = (db) => h - ((Math.max(db, -120) + 120) / 100) * h;
    ctx.strokeStyle = isDark ? '#ffffff0d' : '#00000009';
    ctx.lineWidth = 0.5;
    [-20, -40, -60, -80, -100].forEach(db => { const y = toY(db); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); });
    [50, 100, 200, 500, 1000, 2000, 5000].forEach(f => { const x = toX(f); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); });
    ['a', 'b'].forEach((key) => {
      const analyser = analysersRef.current[key];
      if (!analyser) return;
      const bufLen = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufLen);
      analyser.getFloatFrequencyData(dataArray);
      const hasSignal = dataArray.some(v => v > -100);
      let displayData = dataArray;
      if (!hasSignal && frozenRef.current[key]) displayData = frozenRef.current[key];
      else if (hasSignal) frozenRef.current[key] = new Float32Array(dataArray);
      const color = COLORS[key];
      const binSize = sampleRate / FFT_SIZE;
      const maxBin = Math.min(Math.floor(maxFreq / binSize), bufLen);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      for (let i = 1; i < maxBin; i++) {
        const x = toX(i * binSize); const y = toY(displayData[i]);
        if (i === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineTo(toX(maxBin * binSize), h); ctx.lineTo(toX(binSize), h); ctx.closePath();
      ctx.fillStyle = color + '12'; ctx.fill();
      if (mode === 'realtime') newStats[key] = calcTHD(displayData, sampleRate);
    });
    ctx.fillStyle = isDark ? '#666' : '#aaa';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    [50, 100, 200, 500, 1000, 2000, 5000].forEach(f => { ctx.fillText(f >= 1000 ? (f/1000)+'k' : f+'', toX(f), h - 4); });
    ctx.textAlign = 'left';
    [-20, -40, -60, -80].forEach(db => { ctx.fillText(db + 'dB', 4, toY(db) - 3); });
    if (mode === 'realtime') setStats(newStats);
    animRef.current = requestAnimationFrame(draw);
  }, [mode]);

  useEffect(() => {
    if (isActive) animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isActive, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { const rect = canvas.parentElement.getBoundingClientRect(); canvas.width = rect.width; canvas.height = 260; };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const setReady = useCallback((key) => (analyser) => {
    analysersRef.current[key] = analyser;
    if (!isActive) setIsActive(true);
  }, [isActive]);

  const setBuffer = useCallback((key) => (buf) => {
    buffersRef.current[key] = buf;
    if (mode === 'kick') runKickAnalysis(key);
  }, [mode, runKickAnalysis]);

  const displayStats = mode === 'kick' ? kickStats : stats;

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--analyzer-border, #e6ddd0)' }}>
      <style>{`
        :root { --analyzer-bg: #faf8f5; --analyzer-border: #e6ddd0; --analyzer-text: #3d3d3d; --analyzer-muted: #888; --stat-bg: #f2ede6; }
        .dark { --analyzer-bg: #1a1a1a; --analyzer-border: #454545; --analyzer-text: #f2ede6; --analyzer-muted: #777; --stat-bg: #2d241e; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 14px 4px', gap: 4 }}>
        <button onClick={() => setMode('realtime')} style={{
          padding: '6px 16px', borderRadius: 20, border: '1px solid var(--analyzer-border)',
          background: mode === 'realtime' ? 'var(--analyzer-text)' : 'transparent',
          color: mode === 'realtime' ? 'var(--analyzer-bg)' : 'var(--analyzer-muted)',
          fontFamily: '"JetBrains Mono", monospace', fontSize: 11, cursor: 'pointer', transition: 'all 0.2s',
        }}>Full Mix</button>
        <button onClick={() => setMode('kick')} style={{
          padding: '6px 16px', borderRadius: 20, border: '1px solid var(--analyzer-border)',
          background: mode === 'kick' ? 'var(--analyzer-text)' : 'transparent',
          color: mode === 'kick' ? 'var(--analyzer-bg)' : 'var(--analyzer-muted)',
          fontFamily: '"JetBrains Mono", monospace', fontSize: 11, cursor: 'pointer', transition: 'all 0.2s',
        }}>Kick Analysis</button>
      </div>
      <div style={{ textAlign: 'center', padding: '2px 14px 8px' }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)' }}>
          {mode === 'realtime'
            ? 'THD of the full mix in real time. Best for seeing the overall spectrum.'
            : 'THD calculated only from detected kick transients. More accurate for comparing production styles.'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '0 14px 10px', flexWrap: 'wrap' }}>
        <TrackPanel label="Track A" color={COLORS.a} audioCtxRef={audioCtxRef} onReady={setReady('a')} onBuffer={setBuffer('a')} />
        <TrackPanel label="Track B" color={COLORS.b} audioCtxRef={audioCtxRef} onReady={setReady('b')} onBuffer={setBuffer('b')} />
      </div>

      <div style={{ padding: '0 14px', position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: 260, borderRadius: 8, display: 'block' }} />
        {!isActive && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 14px', borderRadius: 8, background: 'var(--analyzer-bg)',
          }}>
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--analyzer-muted)', textAlign: 'center', padding: 20 }}>
              Upload a track to see the FFT spectrum
            </p>
          </div>
        )}
      </div>

      {isActive && (
        <div style={{ display: 'flex', gap: 10, padding: 14, flexWrap: 'wrap' }}>
          {['a', 'b'].map((key, idx) => {
            const s = displayStats[key];
            const isAnalyzing = mode === 'kick' && analyzing[key];
            const color = COLORS[key];
            const label = idx === 0 ? 'Track A' : 'Track B';
            if (!s && !isAnalyzing && !analysersRef.current[key]) return null;
            return (
              <div key={key} style={{ flex: 1, minWidth: 180, background: 'var(--stat-bg)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600, color: 'var(--analyzer-text)' }}>{label}</span>
                  {mode === 'kick' && s?.kickCount > 0 && (
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)', marginLeft: 'auto' }}>
                      {s.kickCount} kicks
                    </span>
                  )}
                </div>
                {isAnalyzing ? (
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--analyzer-muted)', padding: '8px 0' }}>
                    Analyzing kicks...
                  </div>
                ) : s ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)', marginBottom: 2 }}>THD</div>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 20, fontWeight: 700, color: 'var(--analyzer-text)' }}>
                        {s.thd.toFixed(1)}%
                      </div>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: getTHDColor(s.thd), fontWeight: 600 }}>
                        {getTHDLabel(s.thd)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)', marginBottom: 2 }}>Fundamental</div>
                      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 20, fontWeight: 700, color: 'var(--analyzer-text)' }}>
                        {s.fundamental.toFixed(0)} Hz
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--analyzer-muted)', padding: '8px 0' }}>
                    Upload a track
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ padding: '0 14px 10px', textAlign: 'center' }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)' }}>
          FFT size: {FFT_SIZE} · Log frequency scale · Web Audio API
        </span>
      </div>
    </div>
  );
}
