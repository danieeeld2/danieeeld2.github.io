import { useState, useEffect, useRef, useCallback } from 'react';

const COLORS = {
  c0: '#c87533',      // copper - RAM
  c1: '#5b8a72',      // green - disk
  fresh: '#f59e0b',   // amber - newly inserted
  merging: '#dc2626', // red - currently merging
  merged: '#22c55e',  // green - just merged
};

const C0_CAPACITY = 8;
const PAGE_SIZE = 4;
const INITIAL_C1 = [12, 24, 35, 48, 61, 73, 84, 97, 105, 118, 132, 145];

function randomKey() {
  return Math.floor(Math.random() * 200);
}

export default function LSMVisualizer() {
  const [c0, setC0] = useState([]);
  const [c1, setC1] = useState(INITIAL_C1);
  const [freshKey, setFreshKey] = useState(null);
  const [mergingKeys, setMergingKeys] = useState(new Set());
  const [mergedKeys, setMergedKeys] = useState(new Set());
  const [isMerging, setIsMerging] = useState(false);
  const [autoInsert, setAutoInsert] = useState(false);
  const [stats, setStats] = useState({ inserts: 0, merges: 0, ios: 0 });
  const [mergeLog, setMergeLog] = useState([]);
  const timerRef = useRef(null);

  const insertKey = useCallback((key) => {
    if (isMerging) return;
    const k = key ?? randomKey();
    setC0(prev => {
      if (prev.includes(k)) return prev;
      const next = [...prev, k].sort((a, b) => a - b);
      return next;
    });
    setFreshKey(k);
    setStats(s => ({ ...s, inserts: s.inserts + 1 }));
    setTimeout(() => setFreshKey(null), 600);
  }, [isMerging]);

  // Trigger merge when C0 is full
  useEffect(() => {
    if (c0.length >= C0_CAPACITY && !isMerging) {
      runMerge();
    }
  }, [c0.length, isMerging]);

  const runMerge = useCallback(async () => {
    setIsMerging(true);
    setAutoInsert(false);
    setMergeLog([`Rolling merge started: ${C0_CAPACITY} keys from C₀`]);

    // Animate page by page
    const c0Snapshot = [...c0];
    const c1Snapshot = [...c1];
    const merged = [...c1Snapshot, ...c0Snapshot].sort((a, b) => a - b);

    // Map each C0 key to the C1 page index it belongs to
    const totalPages = Math.max(1, Math.ceil(c1Snapshot.length / PAGE_SIZE));
    const keyToPage = (k) => {
      // Find first index in C1 where c1[i] >= k
      let lo = 0, hi = c1Snapshot.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (c1Snapshot[mid] < k) lo = mid + 1;
        else hi = mid;
      }
      // Insert position is `lo`. The page it falls into is lo / PAGE_SIZE,
      // clamped to the last existing page.
      return Math.min(Math.floor(lo / PAGE_SIZE), totalPages - 1);
    };

    const pageToC0Keys = new Map();
    c0Snapshot.forEach(k => {
      const p = keyToPage(k);
      if (!pageToC0Keys.has(p)) pageToC0Keys.set(p, []);
      pageToC0Keys.get(p).push(k);
    });

    // Highlight merging keys page by page, in order
    const affectedPages = [...pageToC0Keys.keys()].sort((a, b) => a - b);
    for (const pageIdx of affectedPages) {
      const pageStart = pageIdx * PAGE_SIZE;
      const pageEnd = Math.min(pageStart + PAGE_SIZE, c1Snapshot.length);
      const pageKeys = c1Snapshot.slice(pageStart, pageEnd);
      const c0InRange = pageToC0Keys.get(pageIdx) || [];

      const highlightSet = new Set([...pageKeys, ...c0InRange]);
      setMergingKeys(highlightSet);
      setMergeLog(prev => [
        ...prev,
        `Loading C₁ page ${pageIdx + 1} → merging ${c0InRange.length} key${c0InRange.length === 1 ? '' : 's'} from C₀`
      ]);
      await sleep(700);

      setMergedKeys(prev => new Set([...prev, ...highlightSet]));
      await sleep(300);
    }

    setStats(s => ({
      ...s,
      merges: s.merges + 1,
      // 1 read + 1 write per affected page (each I/O is a full sequential page)
      ios: s.ios + affectedPages.length * 2,
    }));

    setC0([]);
    setC1(merged);
    setMergingKeys(new Set());
    setTimeout(() => setMergedKeys(new Set()), 1000);
    setMergeLog(prev => [...prev, 'Merge complete. C₀ flushed.']);
    setIsMerging(false);
  }, [c0, c1]);

  // Auto insert loop
  useEffect(() => {
    if (autoInsert && !isMerging) {
      timerRef.current = setTimeout(() => {
        insertKey();
      }, 400);
    }
    return () => clearTimeout(timerRef.current);
  }, [autoInsert, c0, isMerging, insertKey]);

  const reset = () => {
    setC0([]);
    setC1(INITIAL_C1);
    setFreshKey(null);
    setMergingKeys(new Set());
    setMergedKeys(new Set());
    setIsMerging(false);
    setAutoInsert(false);
    setStats({ inserts: 0, merges: 0, ios: 0 });
    setMergeLog([]);
  };

  const fillPercent = (c0.length / C0_CAPACITY) * 100;
  const pages = chunk(c1, PAGE_SIZE);

  return (
    <div className="my-8 p-6 rounded-lg border border-sand-300 dark:border-ink-700 bg-sand-50/50 dark:bg-ink-900/40 not-prose">
      <div className="mb-4">
        <h4 className="font-display text-lg mb-1">LSM-Tree Visualizer</h4>
        <p className="text-sm text-ink-500 dark:text-sand-400">
          Insert keys into C₀ (RAM). When it fills up ({C0_CAPACITY} keys), a rolling merge flushes them into C₁ (disk).
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => insertKey()}
          disabled={isMerging}
          className="px-3 py-1.5 text-sm rounded font-mono bg-sand-200 dark:bg-ink-700 hover:bg-sand-300 dark:hover:bg-ink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Insert random key
        </button>
        <button
          onClick={() => setAutoInsert(a => !a)}
          disabled={isMerging}
          className="px-3 py-1.5 text-sm rounded font-mono bg-sand-200 dark:bg-ink-700 hover:bg-sand-300 dark:hover:bg-ink-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {autoInsert ? '⏸ Stop auto' : '▶ Auto insert'}
        </button>
        <button
          onClick={reset}
          className="px-3 py-1.5 text-sm rounded font-mono bg-sand-200 dark:bg-ink-700 hover:bg-sand-300 dark:hover:bg-ink-600 transition-colors"
        >
          Reset
        </button>
        <div className="ml-auto flex gap-4 text-xs font-mono text-ink-500 dark:text-sand-400 self-center">
          <span>inserts: <span className="text-ink-800 dark:text-sand-100">{stats.inserts}</span></span>
          <span>merges: <span className="text-ink-800 dark:text-sand-100">{stats.merges}</span></span>
          <span>I/Os: <span className="text-ink-800 dark:text-sand-100">{stats.ios}</span></span>
        </div>
      </div>

      {/* C0 - RAM */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h5 className="font-mono text-sm">
            <span style={{ color: COLORS.c0 }}>C₀</span> · RAM
          </h5>
          <span className="text-xs font-mono text-ink-500 dark:text-sand-400">
            {c0.length} / {C0_CAPACITY}
          </span>
        </div>
        <div className="relative h-2 mb-3 rounded-full bg-sand-200 dark:bg-ink-800 overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${fillPercent}%`,
              background: fillPercent >= 100 ? COLORS.merging : COLORS.c0,
            }}
          />
        </div>
        <div className="min-h-[44px] flex flex-wrap gap-1.5 p-2 rounded border border-dashed border-sand-300 dark:border-ink-700">
          {c0.length === 0 ? (
            <span className="text-xs italic text-ink-400 dark:text-sand-500 self-center">empty</span>
          ) : (
            c0.map(k => (
              <KeyChip
                key={k}
                value={k}
                color={
                  k === freshKey ? COLORS.fresh :
                  mergingKeys.has(k) ? COLORS.merging :
                  COLORS.c0
                }
                pulsing={k === freshKey}
              />
            ))
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center mb-4">
        <div className={`text-2xl transition-opacity ${isMerging ? 'opacity-100' : 'opacity-30'}`}>
          ↓
        </div>
      </div>

      {/* C1 - Disk */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <h5 className="font-mono text-sm">
            <span style={{ color: COLORS.c1 }}>C₁</span> · Disk · {pages.length} pages
          </h5>
          <span className="text-xs font-mono text-ink-500 dark:text-sand-400">
            {c1.length} keys
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {pages.map((page, pi) => (
            <div
              key={pi}
              className="flex gap-1 p-1.5 rounded border border-sand-300 dark:border-ink-700 bg-white/40 dark:bg-ink-950/40"
            >
              {page.map(k => (
                <KeyChip
                  key={k}
                  value={k}
                  color={
                    mergingKeys.has(k) ? COLORS.merging :
                    mergedKeys.has(k) ? COLORS.merged :
                    COLORS.c1
                  }
                  small
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Merge log */}
      {mergeLog.length > 0 && (
        <div className="mt-4 p-3 rounded bg-ink-950 dark:bg-black text-sand-200 font-mono text-xs max-h-32 overflow-y-auto">
          {mergeLog.map((line, i) => (
            <div key={i} className="leading-relaxed">
              <span className="text-sand-500">›</span> {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyChip({ value, color, pulsing, small }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-mono text-white transition-all duration-300 ${
        small ? 'text-xs px-1.5 py-0.5 min-w-[28px]' : 'text-sm px-2 py-1 min-w-[36px]'
      } ${pulsing ? 'animate-pulse' : ''}`}
      style={{ background: color }}
    >
      {value}
    </span>
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}
