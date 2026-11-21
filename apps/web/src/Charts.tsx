import { useEffect, useState, type FormEvent } from "react";
import { Activity, Check, Plus, X } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashboardData, SoilReadingTrend } from "@agroia/shared";
import { api, type ReadingTrendPeriod } from "./api";

export default function ChartCard({ data, period, setPeriod, onRefresh }: {
  data: DashboardData;
  period: ReadingTrendPeriod;
  setPeriod: (period: ReadingTrendPeriod) => void;
  onRefresh: () => Promise<void>;
}) {
  const [readingError, setReadingError] = useState("");
  const [addingReading, setAddingReading] = useState(false);
  const [chartData, setChartData] = useState<SoilReadingTrend[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState("");
  const [reading, setReading] = useState({
    plantId: "",
    moisture: String(Math.round(data.weather.soilMoisture)),
    temperature: String(data.weather.soilTemperature),
    ph: "6.2",
  });

  useEffect(() => {
    let active = true;
    setChartLoading(true);
    setChartError("");
    setChartData([]);
    api.readingTrend(period).then((result) => {
      if (active) setChartData(result);
    }).catch((error: unknown) => {
      if (active) setChartError(error instanceof Error ? error.message : "No fue posible cargar las lecturas.");
    }).finally(() => {
      if (active) setChartLoading(false);
    });
    return () => { active = false; };
  }, [period, data.mode, data.readings.length]);

  const submitReading = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setReadingError("");
      await api.createReading({
        ...(reading.plantId ? { plantId: Number(reading.plantId) } : {}),
        moisture: Number(reading.moisture), temperature: Number(reading.temperature), ph: Number(reading.ph),
      });
      setAddingReading(false);
      await onRefresh();
      setChartData(await api.readingTrend(period));
    } catch (error) {
      setReadingError(error instanceof Error ? error.message : "No se pudo registrar la lectura.");
    }
  };

  const historyData = data.readings.map((reading) => ({ ...reading, samples: 1 }));
  const displayData = chartData.length > 0 ? chartData : historyData;
  const displaySampleCount = displayData.reduce((total, point) => total + point.samples, 0);
  const showingHistory = chartData.length === 0 && historyData.length > 0;
  const average = (key: "moisture" | "temperature" | "ph") => displayData.length
    ? displayData.reduce((total, point) => total + point[key] * point.samples, 0) / displaySampleCount
    : null;
  const formatTick = (value: string) => {
    const date = period === "24h" ? new Date(value) : new Date(`${value}T12:00:00`);
    return period === "24h"
      ? date.toLocaleTimeString("es-CO", { hour: "2-digit" })
      : date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  };

  return <div className="card chart-card">
    <div className="card-topline chart-header">
      <div>
        <div className="card-label"><span className="tiny-icon green-icon"><Activity size={15} /></span> TENDENCIA DE TU SUELO</div>
        <div className="chart-subtitle">Historial de mediciones <span>· {displaySampleCount} muestras · promedio por intervalo</span></div>
      </div>
      <div className="segmented-control">
        {([{ value: "24h", label: "24 h" }, { value: "7d", label: "7 días" }, { value: "30d", label: "30 días" }] as const).map(({ value, label }) =>
          <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{label}</button>)}
      </div>
    </div>
    <div className="chart-metrics" aria-live="polite">
      <div><span>Humedad media</span><strong>{average("moisture") === null ? "—" : `${average("moisture")?.toFixed(1)}%`}</strong></div>
      <div><span>Temperatura media</span><strong>{average("temperature") === null ? "—" : `${average("temperature")?.toFixed(1)} °C`}</strong></div>
      <div><span>pH medio</span><strong>{average("ph") === null ? "—" : average("ph")?.toFixed(1)}</strong></div>
      <div><span>Registros agregados</span><strong>{displaySampleCount}</strong></div>
    </div>
    {chartLoading ? <div className="empty-chart" role="status">Cargando serie de lecturas…</div>
      : chartError ? <div className="inline-error" role="alert">{chartError}</div>
      : displayData.length > 0 ? <>
        {showingHistory && <div className="chart-history-note">No hay lecturas en este periodo. Mostramos las últimas mediciones disponibles.</div>}
        <div className="metric-chart-grid">
          {([
            { key: "moisture", title: "Humedad del suelo", color: "#5d9570", unit: "%", domain: [0, 100] as [number, number] },
            { key: "temperature", title: "Temperatura", color: "#d9a054", unit: "°C", domain: ["auto", "auto"] as ["auto", "auto"] },
            { key: "ph", title: "Acidez (pH)", color: "#7d79a8", unit: "", domain: [0, 14] as [number, number] },
          ] as const).map(({ key, title, color, unit, domain }) => (
            <section className="metric-chart" key={key} aria-label={`Gráfico de ${title}`}>
              <h3><i style={{ background: color }} />{title}</h3>
              <div className="metric-chart-plot">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayData} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line-light)" strokeDasharray="4 5" />
                    <XAxis dataKey="date" tickFormatter={formatTick} tickLine={false} axisLine={false} tick={{ fill: "var(--text-faint)", fontSize: 9 }} />
                    <YAxis domain={domain} tickLine={false} axisLine={false} tick={{ fill: "var(--text-faint)", fontSize: 9 }} unit={unit} />
                    <Tooltip
                      labelFormatter={(value) => period === "24h"
                        ? new Date(String(value)).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : formatTick(String(value))}
                      formatter={(value) => [`${Number(value).toFixed(1)}${unit ? ` ${unit}` : ""}`, title]}
                    />
                    <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2.5} name={title} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ))}
        </div>
      </>
      : <div className="empty-chart"><Activity size={20} /><span>Aún no hay mediciones guardadas. Registra una lectura para comenzar a ver las tendencias.</span></div>}
    <div className="chart-legend">
      <span><i className="legend-moisture" /> Humedad</span>
      <span><i className="legend-temp" /> Temperatura</span>
      <span><i className="legend-ph" /> pH</span>
      <button onClick={() => { setReadingError(""); setAddingReading((value) => !value); }}><Plus size={13} /> Registrar lectura</button>
    </div>
    {addingReading && <form className="reading-entry-form" onSubmit={(event) => void submitReading(event)}>
      <label>Humedad (%)<input type="number" min="0" max="100" required value={reading.moisture} onChange={(event) => setReading({ ...reading, moisture: event.target.value })} /></label>
      <label>Temperatura (°C)<input type="number" min="-20" max="80" step="0.1" required value={reading.temperature} onChange={(event) => setReading({ ...reading, temperature: event.target.value })} /></label>
      <label>pH<input type="number" min="0" max="14" step="0.1" required value={reading.ph} onChange={(event) => setReading({ ...reading, ph: event.target.value })} /></label>
      <label>Espacio<select value={reading.plantId} onChange={(event) => setReading({ ...reading, plantId: event.target.value })}><option value="">General</option>{data.plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></label>
      <div className="reading-form-actions"><button className="button button-primary"><Check size={13} /> Guardar</button><button type="button" className="icon-button" aria-label="Cancelar" onClick={() => setAddingReading(false)}><X size={15} /></button></div>
    </form>}
    {readingError && <div className="inline-error" role="alert">{readingError}</div>}
  </div>;
}
