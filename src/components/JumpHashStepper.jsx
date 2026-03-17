import { useState, useMemo, useCallback } from "react";

// Replicate the Jump Consistent Hash logic step by step
// Using the same LCG as the original C++ code
function jumpHashSteps(keyInput, numBuckets) {
  // Parse key as integer or hash the string
  let key = BigInt(keyInput);
  const steps = [];
  let b = -1n;
  let j = 0n;
  const buckets = BigInt(numBuckets);
  let iteration = 0;

  while (j < buckets) {
    b = j;
    // LCG: key = key * 2862933555777941757 + 1
    key = BigInt.asUintN(64, key * 2862933555777941757n + 1n);
    // j = (b + 1) * (2^31 / ((key >> 33) + 1))
    const shifted = Number(key >> 33n) + 1;
    const ratio = 2147483648 / shifted; // 2^31 / shifted
    j = BigInt(Math.floor(Number(b + 1n) * ratio));

    const r = 1.0 / ratio; // effective random value

    steps.push({
      iteration: iteration++,
      b: Number(b),
      j: Number(j),
      r: r,
      landed: j < buckets,
      keyState: key.toString(16).slice(0, 12) + "…",
    });
  }

  return { result: Number(b), steps };
}

// Simple string -> integer hash for non-numeric keys
function stringToKey(str) {
  let h = 0n;
  for (let i = 0; i < str.length; i++) {
    h = BigInt.asUintN(64, h * 31n + BigInt(str.charCodeAt(i)));
  }
  return h;
}

export default function JumpHashStepper() {
  const [keyStr, setKeyStr] = useState("42");
  const [numBuckets, setNumBuckets] = useState(1000);
  const [activeStep, setActiveStep] = useState(null);

  const parsedKey = useMemo(() => {
    const trimmed = keyStr.trim();
    if (!trimmed) return 0n;
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
    return stringToKey(trimmed);
  }, [keyStr]);

  const { result, steps } = useMemo(() => {
    if (numBuckets < 1) return { result: 0, steps: [] };
    return jumpHashSteps(parsedKey, numBuckets);
  }, [parsedKey, numBuckets]);

  // Visual: show jumps on a number line
  const maxJ = useMemo(() => {
    let m = numBuckets;
    steps.forEach((s) => { if (s.j > m) m = s.j; });
    return m;
  }, [steps, numBuckets]);

  const posToPercent = useCallback(
    (val) => Math.min(100, (val / maxJ) * 100),
    [maxJ]
  );

  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
        maxWidth: 820,
        margin: "0 auto",
        background: "var(--color-bg-secondary, #0f1117)",
        borderRadius: 16,
        padding: "24px 28px",
        color: "var(--color-text, #e2e8f0)",
      }}
    >
      {/* Inputs */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 20,
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: "1 1 200px" }}>
          <label
            style={{ fontSize: 11, opacity: 0.5, display: "block", marginBottom: 4, fontFamily: "sans-serif" }}
          >
            Clave (número o texto)
          </label>
          <input
            type="text"
            value={keyStr}
            onChange={(e) => setKeyStr(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#1a1a1a",
              color: "#e2e8f0",
              fontSize: 15,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ flex: "0 0 160px" }}>
          <label
            style={{ fontSize: 11, opacity: 0.5, display: "block", marginBottom: 4, fontFamily: "sans-serif" }}
          >
            Número de buckets
          </label>
          <input
            type="number"
            min={1}
            max={1000000}
            value={numBuckets}
            onChange={(e) => setNumBuckets(Math.max(1, parseInt(e.target.value) || 1))}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#1a1a1a",
              color: "#e2e8f0",
              fontSize: 15,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Result */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 24,
          padding: "14px 18px",
          background: "#1a1a2e",
          borderRadius: 12,
          border: "1px solid #2ecc7133",
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.6, fontFamily: "sans-serif" }}>Resultado</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#2ecc71" }}>
          bucket {result}
        </div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: 13,
            opacity: 0.6,
            fontFamily: "sans-serif",
          }}
        >
          {steps.length} iteraciones de {numBuckets.toLocaleString()} buckets
          <span style={{ opacity: 0.4 }}> — O(log n) = {Math.ceil(Math.log2(numBuckets))}</span>
        </div>
      </div>

      {/* Jump visualization - number line */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 11,
            opacity: 0.5,
            marginBottom: 8,
            fontFamily: "sans-serif",
          }}
        >
          Saltos del algoritmo (eje = rango de buckets)
        </div>
        <div
          style={{
            position: "relative",
            height: 64,
            background: "#1a1a1a",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Bucket range bar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 28,
              width: `${posToPercent(numBuckets)}%`,
              height: 8,
              background: "#222",
              borderRadius: 4,
            }}
          />
          {/* num_buckets marker */}
          <div
            style={{
              position: "absolute",
              left: `${posToPercent(numBuckets)}%`,
              top: 12,
              bottom: 12,
              width: 2,
              background: "#e74c3c55",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${posToPercent(numBuckets)}%`,
              top: 2,
              transform: "translateX(-50%)",
              fontSize: 9,
              color: "#e74c3c",
              opacity: 0.7,
              fontFamily: "sans-serif",
            }}
          >
            n={numBuckets}
          </div>

          {/* Jump arrows */}
          {steps.map((step, i) => {
            const fromX = posToPercent(step.b);
            const toX = posToPercent(Math.min(step.j, maxJ));
            const isOvershoot = step.j >= numBuckets;
            const isHovered = activeStep === i;

            return (
              <g key={i}>
                {/* Landing dot */}
                <div
                  style={{
                    position: "absolute",
                    left: `${fromX}%`,
                    top: 26,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: isOvershoot ? "#e74c3c" : "#3498db",
                    border: `2px solid ${isHovered ? "#fff" : "transparent"}`,
                    transform: "translateX(-50%)",
                    cursor: "pointer",
                    zIndex: isHovered ? 10 : 2,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={() => setActiveStep(i)}
                  onMouseLeave={() => setActiveStep(null)}
                />
                {/* Arrow line */}
                {i < steps.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${fromX}%`,
                      top: 40,
                      width: `${Math.abs(toX - fromX)}%`,
                      height: 2,
                      background:
                        steps[i + 1].j >= numBuckets
                          ? "#e74c3c44"
                          : "#3498db44",
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* Final result marker */}
          <div
            style={{
              position: "absolute",
              left: `${posToPercent(result)}%`,
              bottom: 4,
              transform: "translateX(-50%)",
              fontSize: 9,
              color: "#2ecc71",
              fontWeight: 700,
            }}
          >
            ▲ {result}
          </div>
        </div>
      </div>

      {/* Step table */}
      <div
        style={{
          maxHeight: 260,
          overflowY: "auto",
          borderRadius: 10,
          border: "1px solid #222",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                background: "#1a1a1a",
                position: "sticky",
                top: 0,
                zIndex: 5,
              }}
            >
              {["#", "b (último válido)", "j (próximo salto)", "r ≈", "Estado"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 600,
                      fontSize: 11,
                      opacity: 0.5,
                      borderBottom: "1px solid #222",
                      fontFamily: "sans-serif",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1;
              const isHovered = activeStep === i;
              return (
                <tr
                  key={i}
                  style={{
                    background: isHovered
                      ? "#ffffff08"
                      : isLast
                      ? "#2ecc7108"
                      : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={() => setActiveStep(i)}
                  onMouseLeave={() => setActiveStep(null)}
                >
                  <td style={{ padding: "6px 12px", opacity: 0.4 }}>{step.iteration}</td>
                  <td
                    style={{
                      padding: "6px 12px",
                      fontWeight: isLast ? 700 : 400,
                      color: isLast ? "#2ecc71" : "inherit",
                    }}
                  >
                    {step.b}
                  </td>
                  <td
                    style={{
                      padding: "6px 12px",
                      color: step.j >= numBuckets ? "#e74c3c" : "#3498db",
                    }}
                  >
                    {step.j.toLocaleString()}
                    {step.j >= numBuckets && (
                      <span
                        style={{
                          fontSize: 10,
                          opacity: 0.5,
                          marginLeft: 6,
                          fontFamily: "sans-serif",
                        }}
                      >
                        ≥ n → STOP
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "6px 12px", opacity: 0.6 }}>
                    {step.r.toFixed(4)}
                  </td>
                  <td style={{ padding: "6px 12px" }}>
                    {isLast ? (
                      <span
                        style={{
                          color: "#2ecc71",
                          fontWeight: 600,
                          fontFamily: "sans-serif",
                          fontSize: 11,
                        }}
                      >
                        ✓ resultado = {step.b}
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          opacity: 0.4,
                          fontFamily: "sans-serif",
                        }}
                      >
                        j &lt; n → salta
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Explanation */}
      <div
        style={{
          marginTop: 16,
          fontSize: 12,
          opacity: 0.45,
          lineHeight: 1.6,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        Cada iteración calcula <code>j = ⌊(b+1) / r⌋</code> donde <code>r</code> es
        un pseudoaleatorio derivado de la clave. El salto crece exponencialmente,
        por eso con {numBuckets.toLocaleString()} buckets solo necesita{" "}
        {steps.length} iteraciones.
      </div>
    </div>
  );
}
