import { useState, useMemo, useRef, useEffect } from 'react';

function calcOptimal(n, p) {
  // m = -n * ln(p) / (ln(2)^2)
  const m = Math.ceil(-n * Math.log(p) / (Math.log(2) ** 2));
  // k = (m/n) * ln(2)
  const k = Math.max(1, Math.round((m / n) * Math.log(2)));
  return { m, k };
}

function calcFP(n, m, k) {
  return Math.pow(1 - Math.exp(-k * n / m), k);
}

function formatBytes(bits) {
  const bytes = bits / 8;
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNumber(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

export default function BloomOptimizer() {
  const [n, setN] = useState(1000000);
  const [p, setP] = useState(0.01);
  const canvasRef = useRef(null);

  const { m, k } = useMemo(() => calcOptimal(n, p), [n, p]);
  const bitsPerElement = m / n;
  const actualFP = calcFP(n, m, k);

  // Draw trade-off curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#1a1a1a' : '#faf8f5';
    const optimalColor = '#c87533';
    const lowerBoundColor = '#888';
    const suboptimalColor = '#5b8a72';
    const gridColor = isDark ? '#ffffff0d' : '#00000009';
    const textColor = isDark ? '#888' : '#999';
    const pointColor = '#c87533';
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    
    const minBPE = 4;
    const maxBPE = 24;
    const minLogP = -6;
    const maxLogP = 0;
    const paddingLeft = 38;
    const paddingRight = 12;
    const paddingTop = 14;
    const paddingBottom = 26;
    
    const toX = (bpe) => ((bpe - minBPE) / (maxBPE - minBPE)) * (w - paddingLeft - paddingRight) + paddingLeft;
    const toY = (fp) => {
      const logP = Math.log10(Math.max(fp, 1e-7));
      return ((maxLogP - logP) / (maxLogP - minLogP)) * (h - paddingTop - paddingBottom) + paddingTop;
    };
    
    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let bpe = 4; bpe <= 24; bpe += 4) {
      const x = toX(bpe);
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, h - paddingBottom);
      ctx.stroke();
    }
    for (let lp = -6; lp <= 0; lp++) {
      const y = toY(Math.pow(10, lp));
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(w - paddingRight, y);
      ctx.stroke();
    }

    // 1. Theoretical lower bound: m >= n * log2(1/p), so fp >= 2^(-bpe)
    ctx.beginPath();
    ctx.strokeStyle = lowerBoundColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (let bpe = minBPE; bpe <= maxBPE; bpe += 0.1) {
      const fp = Math.pow(2, -bpe);
      const x = toX(bpe);
      const y = toY(fp);
      if (bpe === minBPE) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Suboptimal Bloom filter with fixed k=4 (to show cost of not choosing k well)
    ctx.beginPath();
    ctx.strokeStyle = suboptimalColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 4]);
    const kFixed = 4;
    for (let bpe = minBPE; bpe <= maxBPE; bpe += 0.1) {
      // fp = (1 - e^(-k/bpe))^k
      const fp = Math.pow(1 - Math.exp(-kFixed / bpe), kFixed);
      const x = toX(bpe);
      const y = toY(fp);
      if (bpe === minBPE) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Optimal Bloom filter curve (main line)
    ctx.beginPath();
    ctx.strokeStyle = optimalColor;
    ctx.lineWidth = 2.5;
    for (let bpe = minBPE; bpe <= maxBPE; bpe += 0.1) {
      const fp = Math.pow(0.6185, bpe);
      const x = toX(bpe);
      const y = toY(fp);
      if (bpe === minBPE) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under optimal curve
    ctx.lineTo(toX(maxBPE), h - paddingBottom);
    ctx.lineTo(toX(minBPE), h - paddingBottom);
    ctx.closePath();
    ctx.fillStyle = optimalColor + '0d';
    ctx.fill();
    
    // Current point
    if (bitsPerElement >= minBPE && bitsPerElement <= maxBPE) {
      const x = toX(bitsPerElement);
      const y = toY(actualFP);
      
      ctx.strokeStyle = pointColor + '60';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, h - paddingBottom);
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(w - paddingRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = pointColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // Axis labels
    ctx.fillStyle = textColor;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let bpe = 4; bpe <= 24; bpe += 4) {
      ctx.fillText(bpe + '', toX(bpe), h - 10);
    }
    ctx.textAlign = 'right';
    const fpLabels = [
      { v: 1, label: '1' },
      { v: 0.1, label: '10⁻¹' },
      { v: 0.01, label: '10⁻²' },
      { v: 0.001, label: '10⁻³' },
      { v: 0.0001, label: '10⁻⁴' },
      { v: 0.00001, label: '10⁻⁵' },
      { v: 0.000001, label: '10⁻⁶' },
    ];
    fpLabels.forEach(({ v, label }) => {
      ctx.fillText(label, paddingLeft - 4, toY(v) + 3);
    });
    
    // Axis title
    ctx.textAlign = 'center';
    ctx.fillText('bits per element (m/n)', w / 2, h - 1);

    // Legend
    const legendY = paddingTop + 2;
    const legendItems = [
      { color: optimalColor, label: 'Bloom (optimal k)', dash: [] },
      { color: suboptimalColor, label: 'Bloom (k=4 fixed)', dash: [2, 4] },
      { color: lowerBoundColor, label: 'Theoretical lower bound', dash: [4, 3] },
    ];
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    legendItems.forEach((item, i) => {
      const y = legendY + i * 13;
      const x = w - paddingRight - 170;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(item.dash);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = textColor;
      ctx.fillText(item.label, x + 22, y + 3);
    });
  }, [n, p, m, k, bitsPerElement, actualFP]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 260;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Comparison: what if we used a hash set instead?
  const hashSetBits = n * 64; // 64-bit pointer per element, rough estimate
  const spaceSaving = (1 - m / hashSetBits) * 100;

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--analyzer-border, #e6ddd0)' }}>
      <style>{`
        :root { --analyzer-bg: #faf8f5; --analyzer-border: #e6ddd0; --analyzer-text: #3d3d3d; --analyzer-muted: #888; --stat-bg: #f2ede6; }
        .dark { --analyzer-bg: #1a1a1a; --analyzer-border: #454545; --analyzer-text: #f2ede6; --analyzer-muted: #777; --stat-bg: #2d241e; }
        .opt-slider { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: var(--analyzer-border); outline: none; }
        .opt-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #c87533; cursor: pointer; border: 2px solid var(--analyzer-bg); }
      `}</style>

      <div style={{ padding: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600, color: 'var(--analyzer-text)' }}>
            Bloom Filter Optimizer
          </div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)', marginTop: 2 }}>
            Given expected items and desired false positive rate, find optimal parameters
          </div>
        </div>

        {/* Inputs */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>Expected items (n)</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 700, color: 'var(--analyzer-text)' }}>{formatNumber(n)}</span>
            </div>
            <input 
              type="range" 
              className="opt-slider" 
              min="1" max="9" step="0.1" 
              value={Math.log10(n)}
              onChange={e => setN(Math.round(Math.pow(10, Number(e.target.value))))}
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>Target false positive rate (p)</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 700, color: 'var(--analyzer-text)' }}>
                {p >= 0.01 ? `${(p * 100).toFixed(1)}%` : `10${String(Math.round(Math.log10(p))).replace('-', '⁻')}`}
              </span>
            </div>
            <input 
              type="range" 
              className="opt-slider" 
              min="-6" max="-0.5" step="0.1" 
              value={Math.log10(p)}
              onChange={e => setP(Math.pow(10, Number(e.target.value)))}
            />
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
          <ResultBox label="Bit array size (m)" value={formatNumber(m)} sub={`${m.toLocaleString()} bits`} />
          <ResultBox label="Hash functions (k)" value={k} sub="optimal" />
          <ResultBox label="Memory needed" value={formatBytes(m)} sub={`${bitsPerElement.toFixed(1)} bits/item`} />
          <ResultBox label="Actual FP rate" value={actualFP < 0.0001 ? actualFP.toExponential(1) : `${(actualFP * 100).toFixed(3)}%`} />
        </div>

        {/* Formulas */}
        <div style={{ background: 'var(--stat-bg)', borderRadius: 8, padding: 12, marginBottom: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-text)' }}>
          <div style={{ color: 'var(--analyzer-muted)', marginBottom: 4, fontSize: 9 }}>OPTIMAL FORMULAS</div>
          <div>m = −n · ln(p) / (ln 2)² = {m.toLocaleString()}</div>
          <div>k = (m / n) · ln 2 = {k}</div>
          <div>f(n, m, k) = (1 − e<sup>−kn/m</sup>)<sup>k</sup> = {actualFP < 0.0001 ? actualFP.toExponential(2) : actualFP.toFixed(4)}</div>
        </div>

        {/* Trade-off curve */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)', marginBottom: 6, textAlign: 'center' }}>
            Space / error trade-off. The orange dot is your current configuration.
          </div>
          <canvas ref={canvasRef} style={{ width: '100%', height: 260, borderRadius: 8, display: 'block', background: 'var(--stat-bg)' }} />
        </div>

        {/* Comparison */}
        <div style={{ background: '#c8753315', border: '1px solid #c8753340', borderRadius: 8, padding: 12, fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--analyzer-text)' }}>
          <div style={{ fontSize: 9, color: 'var(--analyzer-muted)', marginBottom: 4 }}>VS. EXACT HASH SET</div>
          <div>Hash set (~64 bits/item): {formatBytes(hashSetBits)}</div>
          <div>Bloom filter: {formatBytes(m)}</div>
          <div style={{ color: '#c87533', fontWeight: 700, marginTop: 4 }}>Space saving: {spaceSaving.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

function ResultBox({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--stat-bg)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 17, fontWeight: 700, color: 'var(--analyzer-text)' }}>{value}</div>
      {sub && <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: 'var(--analyzer-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
