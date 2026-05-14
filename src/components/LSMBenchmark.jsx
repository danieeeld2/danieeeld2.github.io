import { useState, useEffect, useRef, useMemo } from 'react';

const COLORS = {
  btree: '#c87533',
  lsm: '#5b8a72',
  grid: 'rgba(120, 113, 108, 0.15)',
  text: 'rgb(120, 113, 108)',
};

// Cost model parameters (from O'Neil et al. 1996)
// In a B-Tree, each random insert costs ~2 I/Os (read leaf + write leaf)
// In an LSM, M keys batch into 1 sequential page I/O
// Random I/O is ~10x more expensive in real seek time, but we count I/Os here

export default function LSMBenchmark() {
  const [insertRate, setInsertRate] = useState(1000);    // keys/sec
  const [pageSize, setPageSize] = useState(40);          // keys per page (4 KB / 100 B ≈ 40)
  const [memtableSize, setMemtableSize] = useState(40000); // keys held in C0
  const [duration, setDuration] = useState(60);          // simulation seconds
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState([]);
  const timerRef = useRef(null);

  // Theoretical per-key cost
  const btreeIOPerKey = 2;                              // read + write per insert
  const lsmIOPerKey = 2 / pageSize;                     // M keys batched into 1 page (read old + write new)
  const speedup = btreeIOPerKey / lsmIOPerKey;
  const mergeIntervalSec = memtableSize / insertRate;

  const totalKeys = insertRate * duration;

  // Run simulation
  useEffect(() => {
    if (!running) return;
    let t = 0;
    const step = 0.5; // 0.5s steps
    const points = [];

    const tick = () => {
      t = Math.min(t + step, duration);
      const keysInserted = insertRate * t;
      const btreeIO = keysInserted * btreeIOPerKey;
      const lsmIO = keysInserted * lsmIOPerKey;
      points.push({ t, keysInserted, btreeIO, lsmIO });
      setHistory([...points]);
      setElapsed(t);
      if (t >= duration) {
        setRunning(false);
      } else {
        timerRef.current = setTimeout(tick, 80);
      }
    };
    tick();
    return () => clearTimeout(timerRef.current);
  }, [running, insertRate, pageSize, memtableSize, duration]);

  const reset = () => {
    setRunning(false);
    clearTimeout(timerRef.current);
    setElapsed(0);
    setHistory([]);
  };

  const start = () => {
    reset();
    setTimeout(() => setRunning(true), 50);
  };

  // Final values
  const finalBtree = history.length ? history[history.length - 1].btreeIO : 0;
  const finalLsm = history.length ? history[history.length - 1].lsmIO : 0;

  return (
    <div className="my-8 p-6 rounded-lg border border-sand-300 dark:border-ink-700 bg-sand-50/50 dark:bg-ink-900/40 not-prose">
      <div className="mb-4">
        <h4 className="font-display text-lg mb-1">B-Tree vs LSM-Tree: I/O Cost</h4>
        <p className="text-sm text-ink-500 dark:text-sand-400">
          Tune the workload. A B-Tree pays ~2 I/Os per insert (read leaf, write leaf).
          An LSM batches M inserts into a single sequential write. The gap grows linearly with M.
        </p>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <SliderRow
          label="Insert rate"
          unit="keys/sec"
          value={insertRate}
          min={100}
          max={10000}
          step={100}
          onChange={setInsertRate}
        />
        <SliderRow
          label="Page size"
          unit="keys/page"
          value={pageSize}
          min={10}
          max={400}
          step={10}
          onChange={setPageSize}
          hint={`≈ ${(pageSize * 100 / 1024).toFixed(1)} KB at 100 B/key`}
        />
        <SliderRow
          label="Memtable C₀"
          unit="keys"
          value={memtableSize}
          min={1000}
          max={200000}
          step={1000}
          onChange={setMemtableSize}
          hint={`flush every ~${mergeIntervalSec.toFixed(1)}s`}
        />
        <SliderRow
          label="Duration"
          unit="sec"
          value={duration}
          min={10}
          max={300}
          step={10}
          onChange={setDuration}
        />
      </div>

      {/* Theoretical stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-xs font-mono">
        <Stat label="B-Tree" value={`${btreeIOPerKey} I/O`} sublabel="per key" color={COLORS.btree} />
        <Stat label="LSM-Tree" value={`${lsmIOPerKey.toFixed(3)} I/O`} sublabel="per key (batched)" color={COLORS.lsm} />
        <Stat label="Speedup" value={`${speedup.toFixed(0)}×`} sublabel="LSM advantage" />
        <Stat label="Workload" value={`${(totalKeys / 1000).toFixed(0)}k`} sublabel="keys total" />
      </div>

      {/* Controls */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={start}
          disabled={running}
          className="px-3 py-1.5 text-sm rounded font-mono bg-sand-200 dark:bg-ink-700 hover:bg-sand-300 dark:hover:bg-ink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ▶ Run simulation
        </button>
        <button
          onClick={reset}
          disabled={running}
          className="px-3 py-1.5 text-sm rounded font-mono bg-sand-200 dark:bg-ink-700 hover:bg-sand-300 dark:hover:bg-ink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Reset
        </button>
        {running && (
          <span className="self-center text-xs font-mono text-ink-500 dark:text-sand-400">
            t = {elapsed.toFixed(1)}s / {duration}s
          </span>
        )}
      </div>

      {/* Chart */}
      <Chart history={history} duration={duration} />

      {/* Final tally */}
      {history.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded border-l-4 bg-white/40 dark:bg-ink-950/40" style={{ borderColor: COLORS.btree }}>
            <div className="font-mono text-xs text-ink-500 dark:text-sand-400">B-Tree total I/Os</div>
            <div className="font-mono text-lg">{formatNum(finalBtree)}</div>
          </div>
          <div className="p-3 rounded border-l-4 bg-white/40 dark:bg-ink-950/40" style={{ borderColor: COLORS.lsm }}>
            <div className="font-mono text-xs text-ink-500 dark:text-sand-400">LSM total I/Os</div>
            <div className="font-mono text-lg">{formatNum(finalLsm)}</div>
          </div>
          <div className="p-3 rounded border-l-4 border-ink-400 bg-white/40 dark:bg-ink-950/40">
            <div className="font-mono text-xs text-ink-500 dark:text-sand-400">I/Os saved</div>
            <div className="font-mono text-lg">{formatNum(finalBtree - finalLsm)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SliderRow({ label, unit, value, min, max, step, onChange, hint }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs font-mono text-ink-600 dark:text-sand-300">{label}</label>
        <span className="text-xs font-mono text-ink-800 dark:text-sand-100">
          {value.toLocaleString()} <span className="text-ink-400 dark:text-sand-500">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-700"
      />
      {hint && <div className="text-[10px] font-mono text-ink-400 dark:text-sand-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Stat({ label, value, sublabel, color }) {
  return (
    <div className="p-2 rounded bg-white/40 dark:bg-ink-950/40">
      <div className="text-[10px] uppercase tracking-wider text-ink-400 dark:text-sand-500" style={color ? { color } : null}>
        {label}
      </div>
      <div className="font-mono text-sm text-ink-800 dark:text-sand-100">{value}</div>
      <div className="text-[10px] text-ink-400 dark:text-sand-500">{sublabel}</div>
    </div>
  );
}

function Chart({ history, duration }) {
  const width = 600;
  const height = 240;
  const pad = { top: 10, right: 60, bottom: 30, left: 60 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxY = useMemo(() => {
    if (!history.length) return 100;
    const m = Math.max(...history.map(p => p.btreeIO));
    return m > 0 ? m * 1.05 : 100;
  }, [history]);

  const xScale = (t) => (t / duration) * innerW;
  const yScale = (y) => innerH - (y / maxY) * innerH;

  const btreePath = history.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${yScale(p.btreeIO)}`
  ).join(' ');
  const lsmPath = history.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xScale(p.t)} ${yScale(p.lsmIO)}`
  ).join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: '100%' }}>
        <g transform={`translate(${pad.left}, ${pad.top})`}>
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line
              key={f}
              x1={0}
              x2={innerW}
              y1={innerH * f}
              y2={innerH * f}
              stroke={COLORS.grid}
              strokeWidth="1"
            />
          ))}
          {/* Y labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <text
              key={f}
              x={-8}
              y={innerH * (1 - f) + 4}
              textAnchor="end"
              fontSize="10"
              fontFamily="monospace"
              fill={COLORS.text}
            >
              {formatNum(maxY * f)}
            </text>
          ))}
          {/* X axis */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={COLORS.text} strokeWidth="1" />
          {/* X labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <text
              key={f}
              x={innerW * f}
              y={innerH + 18}
              textAnchor="middle"
              fontSize="10"
              fontFamily="monospace"
              fill={COLORS.text}
            >
              {(duration * f).toFixed(0)}s
            </text>
          ))}
          {/* Axis labels */}
          <text
            x={innerW / 2}
            y={innerH + 32}
            textAnchor="middle"
            fontSize="11"
            fontFamily="monospace"
            fill={COLORS.text}
          >
            time
          </text>
          <text
            transform={`translate(-40, ${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="11"
            fontFamily="monospace"
            fill={COLORS.text}
          >
            cumulative I/Os
          </text>
          {/* Lines */}
          {history.length > 1 && (
            <>
              <path d={btreePath} stroke={COLORS.btree} strokeWidth="2.5" fill="none" />
              <path d={lsmPath} stroke={COLORS.lsm} strokeWidth="2.5" fill="none" />
              {/* End markers */}
              <circle cx={xScale(history[history.length - 1].t)} cy={yScale(history[history.length - 1].btreeIO)} r="4" fill={COLORS.btree} />
              <circle cx={xScale(history[history.length - 1].t)} cy={yScale(history[history.length - 1].lsmIO)} r="4" fill={COLORS.lsm} />
            </>
          )}
          {/* Legend */}
          <g transform={`translate(${innerW - 130}, 10)`}>
            <rect x="0" y="0" width="125" height="44" fill="white" fillOpacity="0.8" stroke={COLORS.grid} rx="3" />
            <line x1="8" y1="14" x2="24" y2="14" stroke={COLORS.btree} strokeWidth="2.5" />
            <text x="30" y="18" fontSize="10" fontFamily="monospace" fill={COLORS.text}>B-Tree (random)</text>
            <line x1="8" y1="32" x2="24" y2="32" stroke={COLORS.lsm} strokeWidth="2.5" />
            <text x="30" y="36" fontSize="10" fontFamily="monospace" fill={COLORS.text}>LSM (batched)</text>
          </g>
        </g>
      </svg>
    </div>
  );
}

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return n.toFixed(0);
}
