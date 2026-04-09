import { useState, useRef, useCallback, useEffect } from 'react';

const COLORS = {
  set: '#c87533',
  check: '#5b8a72',
  hit: '#22c55e',
  miss: '#dc2626',
};

// Simple hash functions using FNV-1a variants with different seeds
function hash(str, seed, m) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % m;
}

function getHashPositions(str, k, m) {
  const positions = [];
  for (let i = 0; i < k; i++) {
    positions.push(hash(str, i * 2654435761, m));
  }
  return positions;
}

export default function BloomFilterPlayground() {
  const [m, setM] = useState(64);
  const [k, setK] = useState(3);
  const [bits, setBits] = useState(() => new Uint8Array(64));
  const [insertedItems, setInsertedItems] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [checkValue, setCheckValue] = useState('');
  const [highlightedBits, setHighlightedBits] = useState([]);
  const [highlightColor, setHighlightColor] = useState(COLORS.set);
  const [lastCheckResult, setLastCheckResult] = useState(null);
  const [falsePositiveCount, setFalsePositiveCount] = useState(0);
  const [testCount, setTestCount] = useState(0);

  // Rebuild bit array whenever m, k, or inserted items change
  useEffect(() => {
    const newBits = new Uint8Array(m);
    insertedItems.forEach(item => {
      getHashPositions(item, k, m).forEach(p => { newBits[p] = 1; });
    });
    setBits(newBits);
    setHighlightedBits([]);
    setLastCheckResult(null);
    // Reset FP counter since hash positions have changed
    setFalsePositiveCount(0);
    setTestCount(0);
  }, [m, k, insertedItems]);

  const addItem = useCallback(() => {
    if (!inputValue.trim()) return;
    const item = inputValue.trim();
    if (insertedItems.includes(item)) {
      setInputValue('');
      return;
    }
    const positions = getHashPositions(item, k, m);
    setInsertedItems([...insertedItems, item]);
    setHighlightedBits(positions);
    setHighlightColor(COLORS.set);
    setInputValue('');
    setTimeout(() => setHighlightedBits([]), 1500);
  }, [inputValue, insertedItems, k, m]);

  const checkItem = useCallback(() => {
    if (!checkValue.trim()) return;
    const item = checkValue.trim();
    const positions = getHashPositions(item, k, m);
    const allSet = positions.every(p => bits[p] === 1);
    const actuallyIn = insertedItems.includes(item);
    
    setHighlightedBits(positions);
    setHighlightColor(allSet ? COLORS.hit : COLORS.miss);
    setLastCheckResult({ item, allSet, actuallyIn, positions });
    
    setTestCount(c => c + 1);
    if (allSet && !actuallyIn) {
      setFalsePositiveCount(c => c + 1);
    }
    
    setTimeout(() => setHighlightedBits([]), 2000);
  }, [checkValue, k, m, bits, insertedItems]);

  const reset = useCallback(() => {
    setInsertedItems([]);
  }, []);

  const loadExample = useCallback(() => {
    setInsertedItems(['apple', 'banana', 'cherry', 'date', 'elderberry']);
  }, []);

  // Theoretical false positive rate
  const n = insertedItems.length;
  const theoreticalFP = n > 0 ? Math.pow(1 - Math.exp(-k * n / m), k) : 0;
  const actualFP = testCount > 0 ? falsePositiveCount / testCount : 0;
  const fillRatio = bits.reduce((s, b) => s + b, 0) / m;

  // Determine grid layout
  const cols = m <= 32 ? 16 : m <= 64 ? 16 : m <= 128 ? 32 : 32;
  const cellSize = m <= 32 ? 28 : m <= 64 ? 22 : m <= 128 ? 18 : 14;

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--analyzer-border, #e6ddd0)' }}>
      <style>{`
        :root { --analyzer-bg: #faf8f5; --analyzer-border: #e6ddd0; --analyzer-text: #3d3d3d; --analyzer-muted: #888; --stat-bg: #f2ede6; }
        .dark { --analyzer-bg: #1a1a1a; --analyzer-border: #454545; --analyzer-text: #f2ede6; --analyzer-muted: #777; --stat-bg: #2d241e; }
        .bloom-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: var(--analyzer-border); outline: none; }
        .bloom-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #c87533; cursor: pointer; border: 2px solid var(--analyzer-bg); }
        .bloom-input { background: transparent; border: 1px solid var(--analyzer-border); border-radius: 6px; padding: 6px 10px; font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--analyzer-text); outline: none; }
        .bloom-input:focus { border-color: #c87533; }
        .bloom-btn { padding: 6px 14px; border-radius: 6px; border: none; font-family: "JetBrains Mono", monospace; font-size: 11px; cursor: pointer; transition: opacity 0.2s; color: #fff; }
        .bloom-btn:hover { opacity: 0.85; }
        @keyframes bitPulse { 0% { transform: scale(1); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
      `}</style>

      <div style={{ padding: 16 }}>
        {/* Controls */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>m (bit array size)</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 700, color: 'var(--analyzer-text)' }}>{m}</span>
            </div>
            <input type="range" className="bloom-slider" min="16" max="256" step="16" value={m} onChange={e => setM(Number(e.target.value))} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--analyzer-muted)' }}>k (hash functions)</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 700, color: 'var(--analyzer-text)' }}>{k}</span>
            </div>
            <input type="range" className="bloom-slider" min="1" max="8" value={k} onChange={e => setK(Number(e.target.value))} />
          </div>
        </div>

        {/* Inputs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 6 }}>
            <input
              className="bloom-input"
              style={{ flex: 1 }}
              placeholder="Add word..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
            <button className="bloom-btn" style={{ background: COLORS.set }} onClick={addItem}>+ Add</button>
          </div>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 6 }}>
            <input
              className="bloom-input"
              style={{ flex: 1 }}
              placeholder="Check word..."
              value={checkValue}
              onChange={e => setCheckValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkItem()}
            />
            <button className="bloom-btn" style={{ background: COLORS.check }} onClick={checkItem}>? Check</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button className="bloom-btn" style={{ background: 'var(--analyzer-muted)' }} onClick={loadExample}>Load fruits example</button>
          <button className="bloom-btn" style={{ background: 'var(--analyzer-muted)' }} onClick={reset}>Reset</button>
        </div>

        {/* Bit array visualization */}
        <div style={{ 
          background: 'var(--stat-bg)', 
          borderRadius: 10, 
          padding: 12, 
          marginBottom: 12,
          overflowX: 'auto',
        }}>
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gap: 3,
            justifyContent: 'center',
          }}>
            {Array.from(bits).map((bit, i) => {
              const isHighlighted = highlightedBits.includes(i);
              return (
                <div
                  key={i}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 4,
                    background: isHighlighted ? highlightColor : (bit === 1 ? 'var(--analyzer-text)' : 'transparent'),
                    border: isHighlighted ? `2px solid ${highlightColor}` : `1px solid var(--analyzer-border)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: Math.max(8, cellSize - 14),
                    color: isHighlighted ? '#fff' : (bit === 1 ? 'var(--analyzer-bg)' : 'var(--analyzer-muted)'),
                    fontWeight: 600,
                    animation: isHighlighted ? 'bitPulse 0.5s ease' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {bit}
                </div>
              );
            })}
          </div>
        </div>

        {/* Last check result */}
        {lastCheckResult && (
          <div style={{
            padding: 10,
            borderRadius: 8,
            background: lastCheckResult.allSet 
              ? (lastCheckResult.actuallyIn ? '#22c55e15' : '#dc262615')
              : '#88888815',
            border: `1px solid ${lastCheckResult.allSet 
              ? (lastCheckResult.actuallyIn ? '#22c55e40' : '#dc262640')
              : '#88888840'}`,
            marginBottom: 12,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            color: 'var(--analyzer-text)',
          }}>
            <strong>"{lastCheckResult.item}"</strong> → bits [{lastCheckResult.positions.join(', ')}] → {' '}
            {lastCheckResult.allSet ? (
              lastCheckResult.actuallyIn ? (
                <span style={{ color: '#22c55e' }}>✓ probably in set (correct)</span>
              ) : (
                <span style={{ color: '#dc2626' }}>⚠ probably in set (FALSE POSITIVE)</span>
              )
            ) : (
              <span style={{ color: 'var(--analyzer-muted)' }}>✗ definitely not in set</span>
            )}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <StatBox label="Items (n)" value={n} />
          <StatBox label="Fill ratio" value={`${(fillRatio * 100).toFixed(0)}%`} />
          <StatBox label="Theoretical FP" value={`${(theoreticalFP * 100).toFixed(2)}%`} />
          <StatBox label="Observed FP" value={testCount > 0 ? `${(actualFP * 100).toFixed(1)}%` : '—'} sub={`${falsePositiveCount}/${testCount} tests`} />
        </div>

        {/* Inserted items list */}
        {insertedItems.length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--stat-bg)', borderRadius: 8 }}>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)', marginBottom: 4 }}>
              Inserted items ({insertedItems.length}):
            </div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--analyzer-text)' }}>
              {insertedItems.join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--stat-bg)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'var(--analyzer-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 16, fontWeight: 700, color: 'var(--analyzer-text)' }}>{value}</div>
      {sub && <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 8, color: 'var(--analyzer-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
