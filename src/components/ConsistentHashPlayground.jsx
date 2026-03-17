import { useState, useCallback, useMemo } from "react";

// Simple hash function (FNV-1a inspired) for deterministic results
function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash / 4294967295; // normalize to [0, 1]
}

function hashKey(key, salt = "") {
  return hashString(`${salt}:${key}`);
}

// Generate virtual node positions for a server
function getVnodePositions(serverId, vnodes) {
  const positions = [];
  for (let v = 0; v < vnodes; v++) {
    positions.push({
      pos: hashKey(`server-${serverId}`, `vnode-${v}`),
      serverId,
      vnodeIndex: v,
    });
  }
  return positions;
}

// Assign a key to a server using consistent hashing
function assignConsistentHash(keyPos, ring) {
  if (ring.length === 0) return null;
  // Find first node clockwise from key position
  for (let i = 0; i < ring.length; i++) {
    if (ring[i].pos >= keyPos) return ring[i].serverId;
  }
  return ring[0].serverId; // wrap around
}

// Assign a key using modular hashing
function assignModularHash(keyPos, numServers) {
  if (numServers === 0) return null;
  return Math.floor(keyPos * 1000000) % numServers;
}

const NUM_KEYS = 80;
const SERVER_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#e84393", "#00b894", "#6c5ce7",
  "#fd79a8", "#00cec9",
];

function generateKeys() {
  return Array.from({ length: NUM_KEYS }, (_, i) => ({
    id: `key-${i}`,
    label: `k${i}`,
    pos: hashKey(`data-key-${i}`, "fixed-seed"),
  }));
}

export default function ConsistentHashPlayground() {
  const [numServers, setNumServers] = useState(3);
  const [vnodesPerServer, setVnodesPerServer] = useState(3);
  const [mode, setMode] = useState("consistent"); // "consistent" | "modular"
  const [prevAssignments, setPrevAssignments] = useState(null);
  const [showMoved, setShowMoved] = useState(false);

  const keys = useMemo(() => generateKeys(), []);

  // Build the ring
  const ring = useMemo(() => {
    const allVnodes = [];
    for (let s = 0; s < numServers; s++) {
      allVnodes.push(...getVnodePositions(s, vnodesPerServer));
    }
    return allVnodes.sort((a, b) => a.pos - b.pos);
  }, [numServers, vnodesPerServer]);

  // Assign keys
  const assignments = useMemo(() => {
    const result = {};
    keys.forEach((key) => {
      if (mode === "consistent") {
        result[key.id] = assignConsistentHash(key.pos, ring);
      } else {
        result[key.id] = assignModularHash(key.pos, numServers);
      }
    });
    return result;
  }, [keys, ring, numServers, mode]);

  // Count moved keys
  const movedKeys = useMemo(() => {
    if (!prevAssignments) return new Set();
    const moved = new Set();
    keys.forEach((key) => {
      if (
        prevAssignments[key.id] !== undefined &&
        prevAssignments[key.id] !== assignments[key.id]
      ) {
        moved.add(key.id);
      }
    });
    return moved;
  }, [assignments, prevAssignments, keys]);

  const handleChangeServers = useCallback(
    (delta) => {
      setPrevAssignments({ ...assignments });
      setShowMoved(true);
      setNumServers((n) => Math.max(1, Math.min(12, n + delta)));
    },
    [assignments]
  );

  // Distribution stats
  const distribution = useMemo(() => {
    const counts = {};
    for (let s = 0; s < numServers; s++) counts[s] = 0;
    Object.values(assignments).forEach((s) => {
      if (s !== null) counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [assignments, numServers]);

  const idealPerServer = NUM_KEYS / numServers;
  const maxDeviation = useMemo(() => {
    let maxDev = 0;
    for (let s = 0; s < numServers; s++) {
      const dev = Math.abs((distribution[s] || 0) - idealPerServer);
      if (dev > maxDev) maxDev = dev;
    }
    return maxDev;
  }, [distribution, numServers, idealPerServer]);

  // Ring SVG dimensions
  const cx = 200, cy = 200, radius = 160;
  const innerRadius = 120;

  const angleForPos = (pos) => pos * 2 * Math.PI - Math.PI / 2;

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
      maxWidth: 900,
      margin: "0 auto",
      background: "var(--color-bg-secondary, #0f1117)",
      borderRadius: 16,
      padding: "24px 28px",
      color: "var(--color-text, #e2e8f0)",
    }}>
      {/* Controls */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        marginBottom: 20,
        alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Modo:</span>
          <button
            onClick={() => { setMode("consistent"); setPrevAssignments(null); setShowMoved(false); }}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: mode === "consistent" ? "#3498db" : "#333",
              background: mode === "consistent" ? "#3498db22" : "transparent",
              color: mode === "consistent" ? "#3498db" : "#999",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: mode === "consistent" ? 600 : 400,
            }}
          >
            Consistent Hash
          </button>
          <button
            onClick={() => { setMode("modular"); setPrevAssignments(null); setShowMoved(false); }}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: mode === "modular" ? "#e74c3c" : "#333",
              background: mode === "modular" ? "#e74c3c22" : "transparent",
              color: mode === "modular" ? "#e74c3c" : "#999",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: mode === "modular" ? 600 : 400,
            }}
          >
            Hash Modular
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Servidores:</span>
          <button
            onClick={() => handleChangeServers(-1)}
            disabled={numServers <= 1}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "1px solid #333",
              background: "transparent", color: "#e2e8f0", cursor: "pointer",
              fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
              opacity: numServers <= 1 ? 0.3 : 1,
            }}
          >−</button>
          <span style={{
            fontWeight: 700, fontSize: 20, minWidth: 30, textAlign: "center",
            fontVariantNumeric: "tabular-nums",
          }}>{numServers}</span>
          <button
            onClick={() => handleChangeServers(1)}
            disabled={numServers >= 12}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "1px solid #333",
              background: "transparent", color: "#e2e8f0", cursor: "pointer",
              fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
              opacity: numServers >= 12 ? 0.3 : 1,
            }}
          >+</button>
        </div>

        {mode === "consistent" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>Vnodes:</span>
            <input
              type="range"
              min={1}
              max={20}
              value={vnodesPerServer}
              onChange={(e) => {
                setPrevAssignments({ ...assignments });
                setShowMoved(true);
                setVnodesPerServer(parseInt(e.target.value));
              }}
              style={{ width: 80, accentColor: "#3498db" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {vnodesPerServer}
            </span>
          </div>
        )}
      </div>

      {/* Stats bar */}
      {showMoved && prevAssignments && (
        <div style={{
          background: movedKeys.size > NUM_KEYS * 0.3 ? "#e74c3c18" : "#2ecc7118",
          border: `1px solid ${movedKeys.size > NUM_KEYS * 0.3 ? "#e74c3c44" : "#2ecc7144"}`,
          borderRadius: 10,
          padding: "10px 16px",
          marginBottom: 16,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ fontSize: 20 }}>{movedKeys.size > NUM_KEYS * 0.3 ? "💥" : "✨"}</span>
          <span>
            <strong>{movedKeys.size}</strong> de {NUM_KEYS} claves reasignadas
            ({((movedKeys.size / NUM_KEYS) * 100).toFixed(1)}%)
            {mode === "consistent" && movedKeys.size <= NUM_KEYS * 0.3 && (
              <span style={{ opacity: 0.6 }}> — cambio mínimo</span>
            )}
            {mode === "modular" && movedKeys.size > NUM_KEYS * 0.3 && (
              <span style={{ opacity: 0.6 }}> — casi todo se remapea</span>
            )}
          </span>
          <button
            onClick={() => { setShowMoved(false); setPrevAssignments(null); }}
            style={{
              marginLeft: "auto", background: "transparent", border: "none",
              color: "#999", cursor: "pointer", fontSize: 16,
            }}
          >✕</button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {/* Ring visualization */}
        {mode === "consistent" && (
          <div style={{ flex: "1 1 400px", minWidth: 300 }}>
            <svg viewBox="0 0 400 400" style={{ width: "100%", maxWidth: 400 }}>
              {/* Ring background */}
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#222" strokeWidth={2} />
              <circle cx={cx} cy={cy} r={innerRadius} fill="none" stroke="#1a1a1a" strokeWidth={1} strokeDasharray="4 4" />

              {/* Arcs showing which server owns which range */}
              {ring.map((node, idx) => {
                const nextNode = ring[(idx + 1) % ring.length];
                const startAngle = angleForPos(node.pos);
                let endAngle = angleForPos(nextNode.pos);
                if (idx === ring.length - 1) endAngle += 2 * Math.PI;

                const x1 = cx + radius * Math.cos(startAngle);
                const y1 = cy + radius * Math.sin(startAngle);
                const x2 = cx + radius * Math.cos(endAngle);
                const y2 = cy + radius * Math.sin(endAngle);
                const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;

                return (
                  <path
                    key={`arc-${idx}`}
                    d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
                    fill="none"
                    stroke={SERVER_COLORS[node.serverId % SERVER_COLORS.length]}
                    strokeWidth={3}
                    opacity={0.4}
                  />
                );
              })}

              {/* Keys on ring */}
              {keys.map((key) => {
                const angle = angleForPos(key.pos);
                const kr = innerRadius - 4;
                const kx = cx + kr * Math.cos(angle);
                const ky = cy + kr * Math.sin(angle);
                const serverId = assignments[key.id];
                const isMoved = showMoved && movedKeys.has(key.id);

                return (
                  <circle
                    key={key.id}
                    cx={kx}
                    cy={ky}
                    r={isMoved ? 4 : 2.5}
                    fill={serverId !== null ? SERVER_COLORS[serverId % SERVER_COLORS.length] : "#555"}
                    stroke={isMoved ? "#fff" : "none"}
                    strokeWidth={isMoved ? 1.5 : 0}
                    opacity={isMoved ? 1 : 0.7}
                  />
                );
              })}

              {/* Server nodes on ring */}
              {ring.map((node, idx) => {
                const angle = angleForPos(node.pos);
                const nx = cx + radius * Math.cos(angle);
                const ny = cy + radius * Math.sin(angle);
                return (
                  <g key={`node-${idx}`}>
                    <circle
                      cx={nx}
                      cy={ny}
                      r={node.vnodeIndex === 0 ? 8 : 5}
                      fill={SERVER_COLORS[node.serverId % SERVER_COLORS.length]}
                      stroke="#0f1117"
                      strokeWidth={2}
                    />
                    {node.vnodeIndex === 0 && (
                      <text
                        x={nx + 14 * Math.cos(angle)}
                        y={ny + 14 * Math.sin(angle)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={10}
                        fontWeight={700}
                        fill={SERVER_COLORS[node.serverId % SERVER_COLORS.length]}
                      >
                        S{node.serverId}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Center text */}
              <text x={cx} y={cy - 10} textAnchor="middle" fontSize={11} fill="#666">
                {ring.length} puntos
              </text>
              <text x={cx} y={cy + 8} textAnchor="middle" fontSize={11} fill="#666">
                en el anillo
              </text>
            </svg>
          </div>
        )}

        {/* Distribution bar chart */}
        <div style={{ flex: "1 1 300px", minWidth: 250 }}>
          <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 12 }}>
            Distribución de {NUM_KEYS} claves entre servidores
          </div>
          {Array.from({ length: numServers }, (_, s) => {
            const count = distribution[s] || 0;
            const pct = (count / NUM_KEYS) * 100;
            const idealPct = (idealPerServer / NUM_KEYS) * 100;
            return (
              <div key={s} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 3,
                    background: SERVER_COLORS[s % SERVER_COLORS.length],
                  }} />
                  <span style={{ fontSize: 12, minWidth: 24, fontWeight: 600 }}>S{s}</span>
                  <div style={{
                    flex: 1, height: 18, background: "#1a1a1a", borderRadius: 4,
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: SERVER_COLORS[s % SERVER_COLORS.length],
                      borderRadius: 4,
                      opacity: 0.7,
                      transition: "width 0.3s ease",
                    }} />
                    {/* Ideal line */}
                    <div style={{
                      position: "absolute",
                      left: `${idealPct}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: "#fff",
                      opacity: 0.3,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 12, minWidth: 40, textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{
            marginTop: 12, fontSize: 12, opacity: 0.5, display: "flex",
            alignItems: "center", gap: 6,
          }}>
            <div style={{ width: 16, height: 1, background: "#fff", opacity: 0.3 }} />
            <span>= distribución ideal ({idealPerServer.toFixed(1)} claves/servidor)</span>
          </div>

          <div style={{
            marginTop: 20, padding: "12px 14px", background: "#1a1a1a",
            borderRadius: 10, fontSize: 13,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ opacity: 0.6 }}>Desviación máxima</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {((maxDeviation / idealPerServer) * 100).toFixed(1)}%
              </span>
            </div>
            {showMoved && prevAssignments && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.6 }}>Claves movidas</span>
                <span style={{
                  fontWeight: 600,
                  color: movedKeys.size > NUM_KEYS * 0.3 ? "#e74c3c" : "#2ecc71",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {movedKeys.size}/{NUM_KEYS} ({((movedKeys.size / NUM_KEYS) * 100).toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
