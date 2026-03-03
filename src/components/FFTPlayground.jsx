import { useState, useRef, useCallback, useEffect } from 'react';

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 2048;
const CANVAS_H = 200;

function generateWave(type, freq, numSamples, sampleRate) {
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * freq * t;
    switch (type) {
      case 'sine':
        samples[i] = Math.sin(phase);
        break;
      case 'square':
        samples[i] = Math.sin(phase) >= 0 ? 1 : -1;
        break;
      case 'sawtooth':
        samples[i] = 2 * ((freq * t) % 1) - 1;
        break;
      case 'triangle':
        samples[i] = 2 * Math.abs(2 * ((freq * t) % 1) - 1) - 1;
        break;
      default:
        samples[i] = Math.sin(phase);
    }
  }
  return samples;
}

function applySaturation(samples, amount) {
  if (amount <= 0) return samples;
  const out = new Float32Array(samples.length);
  // alpha ranges from 1 (clean) to 20 (extreme)
  const alpha = 1 + amount * 19;
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.tanh(alpha * samples[i]) / Math.tanh(alpha);
  }
  return out;
}

function computeFFT(samples) {
  // Simple DFT for visualization (not performance-critical at this size)
  const N = samples.length;
  const magnitudes = new Float32Array(N / 2);
  for (let k = 0; k < N / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      re += samples[n] * Math.cos(angle);
      im -= samples[n] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(re * re + im * im) / N;
  }
  return magnitudes;
}

function calcTHDFromMagnitudes(magnitudes, freq, sampleRate, N) {
  const binSize = sampleRate / N;
  const fundBin = Math.round(freq / binSize);
  if (fundBin >= magnitudes.length) return 0;
  const fundMag = magnitudes[fundBin];
  if (fundMag < 1e-10) return 0;
  let harmEnergy = 0;
  for (let h = 2; h <= 16; h++) {
    const hBin = fundBin * h;
    if (hBin >= magnitudes.length) break;
    // Search ±1 bin
    let peak = 0;
    for (let j = Math.max(0, hBin - 1); j <= Math.min(magnitudes.length - 1, hBin + 1); j++) {
      if (magnitudes[j] > peak) peak = magnitudes[j];
    }
    harmEnergy += peak * peak;
  }
  return (Math.sqrt(harmEnergy) / fundMag) * 100;
}

const WAVE_LABELS = {
  sine: { name: 'Sine', desc: 'Pure tone — single frequency, no harmonics' },
  square: { name: 'Square', desc: 'Odd harmonics (3×, 5×, 7×...) with 1/n amplitude' },
  sawtooth: { name: 'Sawtooth', desc: 'All harmonics (2×, 3×, 4×...) with 1/n amplitude' },
  triangle: { name: 'Triangle', desc: 'Odd harmonics with 1/n² amplitude — softer than square' },
};

export default function FFTPlayground() {
  const [waveType, setWaveType] = useState('sine');
  const [frequency, setFrequency] = useState(120);
  const [saturation, setSaturation] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timeCanvasRef = useRef(null);
  const freqCanvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const oscRef = useRef(null);
  const gainRef = useRef(null);
  const shaperRef = useRef(null);

  // Generate and draw
  const draw = useCallback(() => {
    const timeCanvas = timeCanvasRef.current;
    const freqCanvas = freqCanvasRef.current;
    if (!timeCanvas || !freqCanvas) return;

    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#1a1a1a' : '#faf8f5';
    const lineColor = '#c87533';
    const gridColor = isDark ? '#ffffff0d' : '#00000009';
    const textColor = isDark ? '#666' : '#aaa';
    const accentColor = '#5b8a72';

    // Generate samples
    const rawSamples = generateWave(waveType, frequency, BUFFER_SIZE, SAMPLE_RATE);
    const samples = applySaturation(rawSamples, saturation);

    // --- TIME DOMAIN ---
    const tCtx = timeCanvas.getContext('2d');
    const tw = timeCanvas.width;
    const th = timeCanvas.height;
    tCtx.fillStyle = bgColor;
    tCtx.fillRect(0, 0, tw, th);

    // Grid
    tCtx.strokeStyle = gridColor;
    tCtx.lineWidth = 0.5;
    tCtx.beginPath(); tCtx.moveTo(0, th/2); tCtx.lineTo(tw, th/2); tCtx.stroke();
    tCtx.beginPath(); tCtx.moveTo(0, th/4); tCtx.lineTo(tw, th/4); tCtx.stroke();
    tCtx.beginPath(); tCtx.moveTo(0, th*3/4); tCtx.lineTo(tw, th*3/4); tCtx.stroke();

    // Labels
    tCtx.fillStyle = textColor;
    tCtx.font = '10px "JetBrains Mono", monospace';
    tCtx.textAlign = 'left';
    tCtx.fillText('+1', 4, th/4 - 4);
    tCtx.fillText(' 0', 4, th/2 - 4);
    tCtx.fillText('-1', 4, th*3/4 - 4);

    // Draw waveform (show ~4 cycles)
    const cycleSamples = Math.floor(SAMPLE_RATE / frequency);
    const showSamples = Math.min(cycleSamples * 4, samples.length);

    // Original (faint)
    if (saturation > 0) {
      tCtx.beginPath();
      tCtx.strokeStyle = lineColor + '35';
      tCtx.lineWidth = 1;
      for (let i = 0; i < showSamples; i++) {
        const x = (i / showSamples) * tw;
        const y = th / 2 - rawSamples[i] * (th / 2 - 20);
        if (i === 0) tCtx.moveTo(x, y); else tCtx.lineTo(x, y);
      }
      tCtx.stroke();
    }

    // Saturated
    tCtx.beginPath();
    tCtx.strokeStyle = lineColor;
    tCtx.lineWidth = 2;
    for (let i = 0; i < showSamples; i++) {
      const x = (i / showSamples) * tw;
      const y = th / 2 - samples[i] * (th / 2 - 20);
      if (i === 0) tCtx.moveTo(x, y); else tCtx.lineTo(x, y);
    }
    tCtx.stroke();

    // Title
    tCtx.fillStyle = textColor;
    tCtx.font = '10px "JetBrains Mono", monospace';
    tCtx.textAlign = 'right';
    tCtx.fillText('Time domain', tw - 8, 14);

    // --- FREQUENCY DOMAIN ---
    const fCtx = freqCanvas.getContext('2d');
    const fw = freqCanvas.width;
    const fh = freqCanvas.height;
    fCtx.fillStyle = bgColor;
    fCtx.fillRect(0, 0, fw, fh);

    const magnitudes = computeFFT(samples);
    const maxMag = Math.max(...magnitudes) || 1;

    // Grid
    fCtx.strokeStyle = gridColor;
    fCtx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * fh;
      fCtx.beginPath(); fCtx.moveTo(0, y); fCtx.lineTo(fw, y); fCtx.stroke();
    }

    // Draw frequency bars
    const maxFreqBin = Math.min(Math.floor(4000 / (SAMPLE_RATE / BUFFER_SIZE)), magnitudes.length);
    const barWidth = fw / maxFreqBin;

    // Highlight harmonic positions
    const fundBin = Math.round(frequency / (SAMPLE_RATE / BUFFER_SIZE));
    for (let h = 1; h <= 10; h++) {
      const hBin = fundBin * h;
      if (hBin >= maxFreqBin) break;
      const x = (hBin / maxFreqBin) * fw;
      fCtx.fillStyle = h === 1 ? lineColor + '15' : accentColor + '10';
      fCtx.fillRect(x - barWidth, 0, barWidth * 2, fh);
    }

    // Draw spectrum
    fCtx.beginPath();
    fCtx.strokeStyle = lineColor;
    fCtx.lineWidth = 2;
    for (let i = 0; i < maxFreqBin; i++) {
      const x = (i / maxFreqBin) * fw;
      const h = (magnitudes[i] / maxMag) * (fh - 30);
      const y = fh - h - 15;
      if (i === 0) fCtx.moveTo(x, y); else fCtx.lineTo(x, y);
    }
    fCtx.stroke();

    // Fill
    fCtx.lineTo(fw, fh - 15);
    fCtx.lineTo(0, fh - 15);
    fCtx.closePath();
    fCtx.fillStyle = lineColor + '12';
    fCtx.fill();

    // Mark harmonics with dots
    for (let h = 1; h <= 10; h++) {
      const hBin = fundBin * h;
      if (hBin >= maxFreqBin) break;
      const x = (hBin / maxFreqBin) * fw;
      const mag = magnitudes[hBin] || 0;
      const y = fh - (mag / maxMag) * (fh - 30) - 15;
      fCtx.beginPath();
      fCtx.arc(x, y, h === 1 ? 5 : 3, 0, Math.PI * 2);
      fCtx.fillStyle = h === 1 ? lineColor : accentColor;
      fCtx.fill();
      // Label
      if (mag / maxMag > 0.05) {
        fCtx.fillStyle = textColor;
        fCtx.font = '9px "JetBrains Mono", monospace';
        fCtx.textAlign = 'center';
        fCtx.fillText(h === 1 ? 'f₀' : h + '×', x, y - 8);
      }
    }

    // Frequency axis
    fCtx.fillStyle = textColor;
    fCtx.font = '10px "JetBrains Mono", monospace';
    fCtx.textAlign = 'center';
    const freqMarks = [100, 500, 1000, 2000, 3000];
    freqMarks.forEach(f => {
      const bin = Math.round(f / (SAMPLE_RATE / BUFFER_SIZE));
      if (bin < maxFreqBin) {
        const x = (bin / maxFreqBin) * fw;
        fCtx.fillText(f >= 1000 ? (f/1000) + 'k' : f + '', x, fh - 2);
      }
    });

    fCtx.textAlign = 'right';
    fCtx.fillText('Frequency domain (FFT)', fw - 8, 14);

    // Compute THD
    const thd = calcTHDFromMagnitudes(magnitudes, frequency, SAMPLE_RATE, BUFFER_SIZE);
    return thd;
  }, [waveType, frequency, saturation]);

  const [thd, setThd] = useState(0);

  useEffect(() => {
    const val = draw();
    if (val !== undefined) setThd(val);
  }, [draw]);

  useEffect(() => {
    const resize = () => {
      [timeCanvasRef, freqCanvasRef].forEach(ref => {
        if (ref.current) {
          const w = ref.current.parentElement.getBoundingClientRect().width;
          ref.current.width = w;
          ref.current.height = CANVAS_H;
        }
      });
      const val = draw();
      if (val !== undefined) setThd(val);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  // Audio playback
  const toggleSound = useCallback(() => {
    if (isPlaying) {
      if (oscRef.current) { try { oscRef.current.stop(); } catch(e) {} oscRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
      setIsPlaying(false);
      return;
    }

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;

    const osc = ctx.createOscillator();
    osc.type = waveType === 'sine' ? 'sine' : waveType === 'square' ? 'square' : waveType === 'sawtooth' ? 'sawtooth' : 'triangle';
    osc.frequency.value = frequency;

    // Waveshaper for saturation
    const shaper = ctx.createWaveShaper();
    const nSamples = 44100;
    const curve = new Float32Array(nSamples);
    const alpha = 1 + saturation * 19;
    for (let i = 0; i < nSamples; i++) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = Math.tanh(alpha * x) / Math.tanh(alpha);
    }
    shaper.curve = curve;
    shaper.oversample = '4x';

    const gain = ctx.createGain();
    gain.gain.value = 0.15;

    osc.connect(shaper);
    shaper.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    oscRef.current = osc;
    gainRef.current = gain;
    shaperRef.current = shaper;
    setIsPlaying(true);
  }, [isPlaying, waveType, frequency, saturation]);

  // Update audio params in real time
  useEffect(() => {
    if (oscRef.current && audioCtxRef.current) {
      oscRef.current.type = waveType;
      oscRef.current.frequency.value = frequency;
    }
    if (shaperRef.current) {
      const nSamples = 44100;
      const curve = new Float32Array(nSamples);
      const alpha = 1 + saturation * 19;
      for (let i = 0; i < nSamples; i++) {
        const x = (i * 2) / nSamples - 1;
        curve[i] = Math.tanh(alpha * x) / Math.tanh(alpha);
      }
      shaperRef.current.curve = curve;
    }
  }, [waveType, frequency, saturation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (oscRef.current) { try { oscRef.current.stop(); } catch(e) {} }
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch(e) {} }
    };
  }, []);

  const satLabel = saturation < 0.05 ? 'Clean' : saturation < 0.3 ? 'Mild' : saturation < 0.6 ? 'Moderate' : saturation < 0.85 ? 'Heavy' : 'Extreme';

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--analyzer-border, #e6ddd0)' }}>
      <style>{`
        :root { --analyzer-bg: #faf8f5; --analyzer-border: #e6ddd0; --analyzer-text: #3d3d3d; --analyzer-muted: #888; --stat-bg: #f2ede6; }
        .dark { --analyzer-bg: #1a1a1a; --analyzer-border: #454545; --analyzer-text: #f2ede6; --analyzer-muted: #777; --stat-bg: #2d241e; }
        .fft-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: var(--analyzer-border); outline: none; }
        .fft-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #c87533; cursor: pointer; border: 2px solid var(--analyzer-bg); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
      `}</style>

      <div style={{ padding: 16 }}>
        {/* Waveform selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {Object.entries(WAVE_LABELS).map(([key, { name }]) => (
            <button key={key} onClick={() => setWaveType(key)} style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid var(--analyzer-border)',
              background: waveType === key ? 'var(--analyzer-text)' : 'transparent',
              color: waveType === key ? 'var(--analyzer-bg)' : 'var(--analyzer-muted)',
              fontFamily: '"JetBrains Mono", monospace', fontSize: 11, cursor: 'pointer', transition: 'all 0.2s',
            }}>{name}</button>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)' }}>
            {WAVE_LABELS[waveType].desc}
          </span>
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'end' }}>
          {/* Frequency */}
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>Frequency</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 700, color: 'var(--analyzer-text)' }}>{frequency} Hz</span>
            </div>
            <input type="range" className="fft-slider" min="40" max="500" value={frequency} onChange={e => setFrequency(Number(e.target.value))} />
          </div>

          {/* Saturation */}
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>
                Saturation — <span style={{ color: saturation > 0.6 ? '#dc2626' : saturation > 0.3 ? '#f97316' : '#22c55e' }}>{satLabel}</span>
              </span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 700, color: 'var(--analyzer-text)' }}>
                α = {(1 + saturation * 19).toFixed(1)}
              </span>
            </div>
            <input type="range" className="fft-slider" min="0" max="1" step="0.01" value={saturation} onChange={e => setSaturation(Number(e.target.value))} />
          </div>

          {/* Play button */}
          <button onClick={toggleSound} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: isPlaying ? '#dc2626' : '#c87533', color: '#fff',
            fontFamily: '"JetBrains Mono", monospace', fontSize: 12, cursor: 'pointer',
            whiteSpace: 'nowrap', transition: 'background 0.2s',
          }}>
            {isPlaying ? '■ Mute' : '♪ Listen'}
          </button>
        </div>

        {/* Canvases */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 250 }}>
            <canvas ref={timeCanvasRef} style={{ width: '100%', height: CANVAS_H, borderRadius: 8, display: 'block' }} />
          </div>
          <div style={{ flex: 1, minWidth: 250 }}>
            <canvas ref={freqCanvasRef} style={{ width: '100%', height: CANVAS_H, borderRadius: 8, display: 'block' }} />
          </div>
        </div>

        {/* THD readout */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12, padding: '10px 0', background: 'var(--stat-bg)', borderRadius: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)' }}>THD</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 22, fontWeight: 700, color: 'var(--analyzer-text)' }}>
              {thd.toFixed(1)}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)' }}>Harmonics visible</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 22, fontWeight: 700, color: 'var(--analyzer-text)' }}>
              {waveType === 'sine' && saturation < 0.05 ? '0' : waveType === 'sine' ? '~' + Math.min(10, Math.ceil(saturation * 12)) : waveType === 'square' || waveType === 'triangle' ? 'odd' : 'all'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)' }}>Formula</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--analyzer-text)', marginTop: 4 }}>
              y = tanh({(1 + saturation * 19).toFixed(1)}·x)
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 10px', textAlign: 'center' }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)' }}>
          DFT computed in-browser · {BUFFER_SIZE} samples · {SAMPLE_RATE} Hz
        </span>
      </div>
    </div>
  );
}
