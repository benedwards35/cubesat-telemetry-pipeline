import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:5000";
const REFRESH_INTERVAL_MS = 2000;

const SENSORS = {
  TEMP:     { unit: "°C",  color: "#f97316", thresholds: { min: 15.0, max: 30.0 } },
  HUMIDITY: { unit: "%",   color: "#38bdf8", thresholds: { min: 20.0, max: 80.0 } },
  DISTANCE: { unit: "cm",  color: "#4ade80", thresholds: { min: 50.0, max: 200.0 } },
};

// ─── FONTS (injected inline) ──────────────────────────────────────────────────
const FONT_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow+Condensed:wght@400;600;700&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; background: #080c0a; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0d1410; }
  ::-webkit-scrollbar-thumb { background: #1a3d28; border-radius: 3px; }

  @keyframes pulse-ring {
    0%   { transform: scale(0.8); opacity: 1; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @keyframes scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes value-flash {
    0%, 100% { color: inherit; }
    50%       { color: #86efac; }
  }
  .flash { animation: value-flash 0.4s ease; }
  .fade-in { animation: fade-in 0.3s ease forwards; }
`;

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (v, decimals = 2) =>
  v == null ? "—" : Number(v).toFixed(decimals);

const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const fmtTimestamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
};

const isAnomaly = (sensorId, value) => {
  const t = SENSORS[sensorId]?.thresholds;
  if (!t) return false;
  return value < t.min || value > t.max;
};

// ─── HOOK: API FETCHER ────────────────────────────────────────────────────────
function usePoller(path, interval = REFRESH_INTERVAL_MS) {
  const [data, setData]     = useState(null);
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick]     = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}${path}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setError(null); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [path, tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [interval]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refresh };
}

// ─── SCANLINE OVERLAY ─────────────────────────────────────────────────────────
function Scanlines() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999,
      background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
    }} />
  );
}

// ─── STATUS INDICATOR ─────────────────────────────────────────────────────────
function StatusDot({ active }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14 }}>
      {active && (
        <span style={{
          position: "absolute", width: 14, height: 14, borderRadius: "50%",
          background: "#4ade80", opacity: 0.4,
          animation: "pulse-ring 1.4s ease-out infinite",
        }} />
      )}
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: active ? "#4ade80" : "#374151",
        boxShadow: active ? "0 0 8px #4ade80" : "none",
      }} />
    </span>
  );
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SectionHeader({ label, sub }) {
  return (
    <div style={{ marginBottom: 16, borderBottom: "1px solid #1a2e1e", paddingBottom: 10 }}>
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
        fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
        color: "#4ade80",
      }}>{label}</span>
      {sub && <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: "#3d6b4a", marginLeft: 12 }}>{sub}</span>}
    </div>
  );
}

// ─── LATEST READINGS CARD ─────────────────────────────────────────────────────
function LatestCard({ reading }) {
  const sensorCfg = SENSORS[reading.sensor_id] || {};
  const color = sensorCfg.color || "#4ade80";
  const anomaly = isAnomaly(reading.sensor_id, reading.value);

  return (
    <div style={{
      background: "#0a110d",
      border: `1px solid ${anomaly ? "#ef4444" : "#1a3d28"}`,
      borderRadius: 4,
      padding: "20px 24px",
      position: "relative",
      overflow: "hidden",
      boxShadow: anomaly ? "0 0 20px rgba(239,68,68,0.15)" : "none",
    }}>
      {/* corner accent */}
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: 3, height: "100%",
        background: anomaly ? "#ef4444" : color,
        boxShadow: `0 0 12px ${anomaly ? "#ef4444" : color}`,
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase",
          color: anomaly ? "#ef4444" : "#4d7a58",
        }}>{reading.sensor_id}</span>
        {anomaly && (
          <span style={{
            fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
            color: "#ef4444", border: "1px solid #ef444466", padding: "1px 6px", borderRadius: 2,
            animation: "blink 1s step-end infinite",
          }}>ANOMALY</span>
        )}
      </div>

      <div style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 42, fontWeight: 400, lineHeight: 1,
        color: anomaly ? "#ef4444" : color,
        textShadow: `0 0 20px ${anomaly ? "#ef444480" : color + "80"}`,
        marginBottom: 8,
        transition: "color 0.2s",
      }}>
        {fmt(reading.value)}
        <span style={{ fontSize: 16, marginLeft: 6, color: "#3d6b4a", textShadow: "none" }}>{sensorCfg.unit}</span>
      </div>

      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: "#2d5238" }}>
        {fmtTime(reading.timestamp)}
      </div>

      {sensorCfg.thresholds && (
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 3, background: "#0f1f14", borderRadius: 2, position: "relative" }}>
            {(() => {
              const t = sensorCfg.thresholds;
              const range = t.max - t.min;
              const pct = Math.max(0, Math.min(100, ((reading.value - t.min) / range) * 100));
              return (
                <div style={{
                  position: "absolute", top: 0, left: 0,
                  width: `${pct}%`, height: "100%",
                  background: anomaly ? "#ef4444" : color,
                  borderRadius: 2, transition: "width 0.5s ease",
                  boxShadow: `0 0 6px ${anomaly ? "#ef4444" : color}`,
                }} />
              );
            })()}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: "#2a4a34" }}>
            <span>{fmt(sensorCfg.thresholds.min)}</span>
            <span>{fmt(sensorCfg.thresholds.max)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STATS CHART ──────────────────────────────────────────────────────────────
function StatsSection({ data }) {
  if (!data?.sensors?.length) return null;

  return (
    <div>
      <SectionHeader label="Sensor Statistics" sub="min / avg / max over all records" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {data.sensors.map((s) => {
          const cfg = SENSORS[s.sensor_id] || {};
          const color = cfg.color || "#4ade80";
          const barData = [
            { label: "MIN", value: parseFloat(s.min) },
            { label: "AVG", value: parseFloat(s.avg) },
            { label: "MAX", value: parseFloat(s.max) },
          ];
          const absMax = Math.max(Math.abs(parseFloat(s.max)), Math.abs(parseFloat(s.min)));

          return (
            <div key={s.sensor_id} style={{
              background: "#0a110d", border: "1px solid #1a3d28", borderRadius: 4, padding: "18px 20px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: 12, letterSpacing: "0.25em", color,
                }}>{s.sensor_id}</span>
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: "#3d6b4a" }}>
                  n={s.count}
                </span>
              </div>

              {barData.map(({ label, value }) => {
                const pct = absMax > 0 ? (Math.abs(value) / absMax) * 100 : 50;
                return (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: "'Share Tech Mono', monospace", fontSize: 11 }}>
                      <span style={{ color: "#4d7a58" }}>{label}</span>
                      <span style={{ color: label === "AVG" ? color : "#6aaa80" }}>
                        {fmt(value)} {cfg.unit}
                      </span>
                    </div>
                    <div style={{ height: 3, background: "#0f1f14", borderRadius: 2 }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: label === "AVG" ? color : color + "66",
                        borderRadius: 2, transition: "width 0.6s ease",
                        boxShadow: label === "AVG" ? `0 0 8px ${color}` : "none",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ANOMALIES FEED ───────────────────────────────────────────────────────────
function AnomaliesSection({ data }) {
  const anomalies = data?.anomalies || [];

  return (
    <div>
      <SectionHeader
        label="Anomaly Feed"
        sub={`${anomalies.length} flagged reading${anomalies.length !== 1 ? "s" : ""}`}
      />
      {anomalies.length === 0 ? (
        <div style={{
          fontFamily: "'Share Tech Mono', monospace", fontSize: 13,
          color: "#2d5238", textAlign: "center", padding: "40px 0",
        }}>
          — NO ANOMALIES DETECTED —
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {anomalies.map((a, i) => {
            const cfg = SENSORS[a.sensor_id] || {};
            const t = cfg.thresholds;
            const direction = t ? (a.value > t.max ? "HIGH" : "LOW") : "?";
            return (
              <div key={i} className="fade-in" style={{
                display: "grid",
                gridTemplateColumns: "90px 90px 1fr 100px 140px",
                gap: 12, alignItems: "center",
                background: "#0f0a0a", border: "1px solid #3a1515",
                borderRadius: 3, padding: "10px 16px",
                fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
              }}>
                <span style={{ color: "#9a4a4a", letterSpacing: "0.1em" }}>{a.sensor_id}</span>
                <span style={{
                  color: "#ef4444", fontWeight: "bold", fontSize: 14,
                  textShadow: "0 0 10px #ef444480",
                }}>{fmt(a.value)} {cfg.unit}</span>
                <div style={{ height: 2, background: "#2a0f0f", borderRadius: 1 }}>
                  {t && (
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, Math.max(0, ((a.value - t.min) / (t.max - t.min)) * 100))}%`,
                      background: "#ef4444", borderRadius: 1,
                    }} />
                  )}
                </div>
                <span style={{
                  color: "#7a2020", border: "1px solid #5a1515", borderRadius: 2,
                  padding: "2px 8px", fontSize: 10, letterSpacing: "0.15em", textAlign: "center",
                }}>{direction}</span>
                <span style={{ color: "#4a2020", textAlign: "right" }}>{fmtTimestamp(a.timestamp)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── HISTORY TABLE ────────────────────────────────────────────────────────────
function HistorySection() {
  const [sensor, setSensor] = useState("");
  const [limit, setLimit]   = useState(50);
  const [committed, setCommitted] = useState({ sensor: "", limit: 50 });

  const params = new URLSearchParams();
  if (committed.sensor) params.set("sensor", committed.sensor);
  params.set("limit", committed.limit);

  const { data, loading, refresh } = usePoller(`/telemetry/history?${params}`, 5000);
  const readings = data?.readings || [];

  return (
    <div>
      <SectionHeader label="History" sub="queryable packet log" />

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <select
          value={sensor}
          onChange={(e) => setSensor(e.target.value)}
          style={{
            background: "#0a110d", border: "1px solid #1a3d28", borderRadius: 3,
            color: "#4ade80", padding: "6px 12px",
            fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
            outline: "none", cursor: "pointer",
          }}
        >
          <option value="">ALL SENSORS</option>
          {Object.keys(SENSORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{
            background: "#0a110d", border: "1px solid #1a3d28", borderRadius: 3,
            color: "#4ade80", padding: "6px 12px",
            fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
            outline: "none", cursor: "pointer",
          }}
        >
          {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} rows</option>)}
        </select>

        <button
          onClick={() => { setCommitted({ sensor, limit }); refresh(); }}
          style={{
            background: "transparent", border: "1px solid #4ade80", borderRadius: 3,
            color: "#4ade80", padding: "6px 18px",
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 0 8px #4ade8033",
          }}
        >
          Query
        </button>

        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: "#2d5238", marginLeft: 8 }}>
          {loading ? "loading…" : `${readings.length} rows`}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Share Tech Mono', monospace", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a3d28" }}>
              {["SENSOR", "VALUE", "RANGE", "TIMESTAMP", "RECEIVED"].map((col) => (
                <th key={col} style={{
                  textAlign: "left", padding: "8px 12px", color: "#3d6b4a",
                  fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11,
                  letterSpacing: "0.2em", fontWeight: 600,
                }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readings.map((r, i) => {
              const cfg = SENSORS[r.sensor_id] || {};
              const anom = isAnomaly(r.sensor_id, r.value);
              return (
                <tr key={i} style={{
                  borderBottom: "1px solid #0f1f14",
                  background: anom ? "#150808" : i % 2 === 0 ? "#0a110d" : "transparent",
                  transition: "background 0.15s",
                }}>
                  <td style={{ padding: "7px 12px", color: anom ? "#9a4a4a" : "#4d7a58", letterSpacing: "0.1em" }}>{r.sensor_id}</td>
                  <td style={{ padding: "7px 12px", color: anom ? "#ef4444" : cfg.color || "#4ade80", fontWeight: anom ? "bold" : "normal" }}>
                    {fmt(r.value)} {cfg.unit}
                  </td>
                  <td style={{ padding: "7px 12px" }}>
                    {cfg.thresholds ? (
                      <div style={{ width: 80, height: 3, background: "#0f1f14", borderRadius: 1 }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.min(100, Math.max(0, ((r.value - cfg.thresholds.min) / (cfg.thresholds.max - cfg.thresholds.min)) * 100))}%`,
                          background: anom ? "#ef4444" : cfg.color || "#4ade80",
                          borderRadius: 1,
                        }} />
                      </div>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "7px 12px", color: "#2d5238" }}>{fmtTimestamp(r.timestamp)}</td>
                  <td style={{ padding: "7px 12px", color: "#1f3d29" }}>{fmtTimestamp(r.received_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {readings.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#2d5238" }}>— NO DATA —</div>
        )}
      </div>
    </div>
  );
}

// ─── HISTORY SPARKLINES (for latest section) ──────────────────────────────────
function Sparkline({ sensorId }) {
  const { data } = usePoller(`/telemetry/history?sensor=${sensorId}&limit=40`);
  const readings = (data?.readings || []).slice().reverse();
  const cfg = SENSORS[sensorId] || {};
  if (readings.length < 2) return null;

  return (
    <div style={{ height: 48, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={readings} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone" dataKey="value"
            stroke={cfg.color || "#4ade80"} strokeWidth={1.5}
            dot={false} isAnimationActive={false}
          />
          {cfg.thresholds && <ReferenceLine y={cfg.thresholds.min} stroke="#ef444440" strokeDasharray="3 3" />}
          {cfg.thresholds && <ReferenceLine y={cfg.thresholds.max} stroke="#ef444440" strokeDasharray="3 3" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── TOP BAR ──────────────────────────────────────────────────────────────────
function TopBar({ connected, lastUpdate }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "14px 32px", borderBottom: "1px solid #1a3d28",
      background: "#060a07",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
          fontSize: 20, letterSpacing: "0.3em", textTransform: "uppercase",
          color: "#4ade80", textShadow: "0 0 20px #4ade8060",
        }}>
          ◈ GROUNDSTATION
        </div>
        <div style={{
          fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
          color: "#2d5238", letterSpacing: "0.05em",
        }}>
          CUBESAT TELEMETRY PIPELINE v1.0
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24, fontFamily: "'Share Tech Mono', monospace", fontSize: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#3d6b4a" }}>
          <StatusDot active={connected} />
          <span>{connected ? "LINK ACTIVE" : "NO SIGNAL"}</span>
        </div>
        <div style={{ color: "#2d5238" }}>
          {new Date().toLocaleTimeString("en-US", { hour12: false })}
        </div>
        {lastUpdate && (
          <div style={{ color: "#1f3d29" }}>
            UPD {fmtTime(lastUpdate)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const { data: latestData, error: latestError } = usePoller("/telemetry/latest");
  const { data: statsData }   = usePoller("/telemetry/stats",     10000);
  const { data: anomalyData } = usePoller("/telemetry/anomalies?limit=30", 3000);

  const [activeTab, setActiveTab] = useState("overview");

  const latestReadings = latestData?.readings || [];
  const connected = !latestError && latestData != null;
  const lastUpdate = latestReadings[0]?.received_at;;

  const TABS = [
    { id: "overview",  label: "Overview" },
    { id: "history",   label: "History" },
    { id: "anomalies", label: "Anomalies" },
    { id: "stats",     label: "Statistics" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c0a",
      color: "#6aaa80",
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <style>{FONT_STYLE}</style>
      <Scanlines />

      <TopBar connected={connected} lastUpdate={lastUpdate} />

      {/* Tab nav */}
      <div style={{
        display: "flex", gap: 0, padding: "0 32px",
        borderBottom: "1px solid #1a3d28", background: "#060a07",
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #4ade80" : "2px solid transparent",
              color: activeTab === tab.id ? "#4ade80" : "#2d5238",
              padding: "12px 24px",
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
              fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
              cursor: "pointer",
              transition: "color 0.2s, border-color 0.2s",
              textShadow: activeTab === tab.id ? "0 0 12px #4ade8080" : "none",
            }}
          >
            {tab.id === "anomalies" && (anomalyData?.count || 0) > 0
              ? `${tab.label} [${anomalyData.count}]`
              : tab.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ padding: "28px 32px" }}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div>
            <SectionHeader label="Live Telemetry" sub={`${REFRESH_INTERVAL_MS / 1000}s refresh · ${latestReadings.length} sensors`} />

            {!connected && (
              <div style={{
                background: "#150a0a", border: "1px solid #5a1515", borderRadius: 4,
                padding: "20px 24px", marginBottom: 24,
                fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: "#9a4a4a",
              }}>
                ⚠ Cannot reach API at {API_BASE} — ensure Flask server is running and CORS is enabled.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 32 }}>
              {latestReadings.map((r) => (
                <div key={r.sensor_id}>
                  <LatestCard reading={r} />
                  <Sparkline sensorId={r.sensor_id} />
                </div>
              ))}
              {latestReadings.length === 0 && connected && (
                <div style={{ color: "#2d5238", fontSize: 13, padding: "40px 0" }}>Waiting for data…</div>
              )}
            </div>

            {/* Mini anomaly alert strip */}
            {(anomalyData?.count || 0) > 0 && (
              <div style={{
                background: "#150808", border: "1px solid #5a1515", borderRadius: 4,
                padding: "12px 20px", display: "flex", alignItems: "center", gap: 16,
              }}>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                  fontSize: 12, letterSpacing: "0.2em", color: "#ef4444",
                  animation: "blink 1.5s step-end infinite",
                }}>⚠ ANOMALY ALERT</span>
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: "#9a4a4a" }}>
                  {anomalyData.count} out-of-range reading{anomalyData.count !== 1 ? "s" : ""} detected — see Anomalies tab
                </span>
                <button
                  onClick={() => setActiveTab("anomalies")}
                  style={{
                    marginLeft: "auto", background: "transparent", border: "1px solid #9a4a4a",
                    color: "#ef4444", padding: "4px 14px", borderRadius: 2,
                    fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
                    letterSpacing: "0.15em", cursor: "pointer",
                  }}
                >INSPECT</button>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && <HistorySection />}

        {/* ── ANOMALIES TAB ── */}
        {activeTab === "anomalies" && <AnomaliesSection data={anomalyData} />}

        {/* ── STATS TAB ── */}
        {activeTab === "stats" && <StatsSection data={statsData} />}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid #1a3d28", padding: "12px 32px",
        display: "flex", justifyContent: "space-between",
        fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: "#1f3d29",
      }}>
        <span>BEN EDWARDS · CUBESAT TELEMETRY PIPELINE · SJU CS</span>
        <span>API {API_BASE}</span>
      </div>
    </div>
  );
}