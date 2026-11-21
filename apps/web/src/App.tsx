import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, AudioLines, BarChart3, Bell, BookOpen,
  Check, CheckCircle2, ChevronDown, ChevronRight, Cloud, CloudRain, Command, Droplets,
  Ellipsis, Flower2, Gauge, Leaf, MapPin, Menu, MessageCircle, Moon, Plus, Search, Send,
  Pencil,   Settings2, ShieldAlert, Sprout, Sun, Thermometer, Trash2, TrendingUp, Upload, Wind, X,
} from "lucide-react";
import type { ChatMessage, DashboardData, Plant, Task } from "@agroia/shared";
import { api, ApiRequestError, type AppSettings, type ReadingTrendPeriod, type SpeciesCard } from "./api";
import { useAgroStore } from "./store";

const ChartCard = lazy(() => import("./Charts"));

type PageId = "dashboard" | "plants" | "species" | "calendar" | "journal" | "irrigation" | "assistant" | "settings";
const pageInfo: Record<PageId, { title: string; eyebrow: string }> = {
  dashboard: { title: "Centro de mando", eyebrow: "RESUMEN DE TU CAMPO" },
  plants: { title: "Mis cultivos y plantas", eyebrow: "TU ESPACIO VERDE" },
  species: { title: "Biblioteca de especies", eyebrow: "CONOCIMIENTO LOCAL" },
  calendar: { title: "Calendario", eyebrow: "PLANEA CON ANTICIPACIÓN" },
  journal: { title: "Bitácora", eyebrow: "HISTORIAL DE CAMPO" },
  irrigation: { title: "Planificador de riego", eyebrow: "AGUA, CON PRECISIÓN" },
  assistant: { title: "Conversa con AgroIA", eyebrow: "ASISTENTE INTELIGENTE" },
  settings: { title: "Ajustes", eyebrow: "TU AGROIA, A TU MANERA" },
};
const navigation: Array<{ id: PageId; label: string; icon: typeof Leaf; group: string }> = [
  { id: "dashboard", label: "Resumen", icon: BarChart3, group: "INICIO" },
  { id: "plants", label: "Mis cultivos", icon: Sprout, group: "MI ESPACIO" },
  { id: "species", label: "Especies", icon: Flower2, group: "MI ESPACIO" },
  { id: "calendar", label: "Calendario", icon: CheckCircle2, group: "MI ESPACIO" },
  { id: "journal", label: "Bitácora", icon: BookOpen, group: "MI ESPACIO" },
  { id: "irrigation", label: "Riego", icon: Droplets, group: "HERRAMIENTAS" },
  { id: "assistant", label: "AgroIA", icon: MessageCircle, group: "HERRAMIENTAS" },
];

const icons = { light: Sun, dark: Moon };
const widgetOrderDefault = ["weather", "moisture", "risk", "recommendation", "chart", "tasks", "map"];
const pagePaths: Record<PageId, string> = {
  dashboard: "/", plants: "/plants", species: "/species", calendar: "/calendar",
  journal: "/journal", irrigation: "/irrigation", assistant: "/assistant", settings: "/settings",
};

function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const page = (Object.entries(pagePaths).find(([, path]) => path === location.pathname)?.[0] ?? "dashboard") as PageId;
  const data = useAgroStore((state) => state.data);
  const plants = useAgroStore((state) => state.plants);
  const tasks = useAgroStore((state) => state.tasks);
  const settings = useAgroStore((state) => state.settings);
  const error = useAgroStore((state) => state.error);
  const loading = useAgroStore((state) => state.loading);
  const setData = useAgroStore((state) => state.setDashboard);
  const setPlants = useAgroStore((state) => state.setPlants);
  const setTasks = useAgroStore((state) => state.setTasks);
  const setSettings = useAgroStore((state) => state.setSettings);
  const setError = useAgroStore((state) => state.setError);
  const setLoading = useAgroStore((state) => state.setLoading);
  const [commandOpen, setCommandOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const refresh = useCallback(async (refreshWeather = false) => {
    let lastError: unknown;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const [dashboard, allPlants, allTasks, currentSettings] = await Promise.all([
            api.dashboard(refreshWeather), api.plants(), api.tasks(), api.settings(),
          ]);
          setData(dashboard);
          setPlants(allPlants);
          setTasks(allTasks);
          setSettings(currentSettings);
          document.documentElement.dataset.theme = currentSettings.theme;
          setError("");
          return;
        } catch (caught) {
          lastError = caught;
          const transient = caught instanceof TypeError || (caught instanceof ApiRequestError && caught.status >= 500);
          if (!transient || attempt === 2) break;
          await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
        }
      }
      setError(lastError instanceof TypeError
        ? "No se pudo conectar con el servicio local. Comprueba que AgroIA esté iniciado y vuelve a intentar."
        : lastError instanceof Error ? lastError.message : "No fue posible conectar con AgroIA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setError(""); }, [location.pathname, setError]);
  useEffect(() => {
    if (!Object.values(pagePaths).includes(location.pathname)) routerNavigate("/", { replace: true });
  }, [location.pathname, routerNavigate]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") { setCommandOpen(false); setMobileNav(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigate = (next: PageId) => { routerNavigate(pagePaths[next]); setMobileNav(false); setAssistantOpen(false); };
  const currentPlants = plants.filter((plant) => plant.mode === settings.mode);
  const changeMode = async (mode: AppSettings["mode"]) => {
    try {
      await api.saveSettings({ mode });
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cambiar el modo."); }
  };
  const updateSettings = async (values: Partial<AppSettings>) => {
    try {
      await api.saveSettings(values);
      await refresh();
    } catch (caught) { throw caught instanceof Error ? caught : new Error("No se pudo guardar la configuración."); }
  };
  const active = pageInfo[page];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <img src="/agroia.svg" alt="" className="brand-mark" />
          <div><strong>agroia<span>.</span></strong><small>INTELIGENCIA QUE CULTIVA</small></div>
          <button className="icon-button mobile-close" aria-label="Cerrar menú" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <div className="mode-control">
          <div className="mode-label">TU ESPACIO</div>
          <div className="mode-switch" role="group" aria-label="Selecciona tu modo">
            <button onClick={() => void changeMode("agronomo")} className={settings.mode === "agronomo" ? "selected" : ""}>
              <Activity size={15} /> Agrónomo
            </button>
            <button onClick={() => void changeMode("hogar")} className={settings.mode === "hogar" ? "selected" : ""}>
              <Flower2 size={15} /> Hogar
            </button>
          </div>
        </div>
        <nav className="side-nav" aria-label="Navegación principal">
          {["INICIO", "MI ESPACIO", "HERRAMIENTAS"].map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-title">{group}</div>
              {navigation.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                return <button key={item.id} className={`nav-item ${page === item.id ? "nav-active" : ""}`}
                  onClick={() => navigate(item.id)} aria-current={page === item.id ? "page" : undefined}>
                  <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>
                  {item.id === "assistant" && <span className="nav-new-dot" />}
                </button>;
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="local-card">
          <div className="local-card-icon"><ShieldAlert size={16} /></div>
          <div><strong>Tus datos son tuyos</strong><p>Guardados localmente en este dispositivo.</p></div>
        </div>
        <button className={`nav-item settings-link ${page === "settings" ? "nav-active" : ""}`} onClick={() => navigate("settings")}>
          <Settings2 size={17} /><span>Ajustes</span>
        </button>
        <div className="profile-row">
          <div className="avatar">A</div>
          <div className="profile-name"><strong>Mi espacio</strong><span>{settings.mode === "agronomo" ? "Agrónomo" : "Hogar"}</span></div>
          <Ellipsis size={19} className="muted-icon" />
        </div>
      </aside>

      {mobileNav && <button className="mobile-backdrop" aria-label="Cerrar navegación" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><span>AgroIA</span><ChevronRight size={14} /><strong>{active.title}</strong></div>
          <div className="top-actions">
            <button className="search-trigger" onClick={() => setCommandOpen(true)} aria-label="Abrir búsqueda y comandos">
              <Search size={16} /><span>Buscar en AgroIA</span><kbd>⌘ K</kbd>
            </button>
            <button className="icon-button notification-button" aria-label="Notificaciones" title="Alertas del día">
              <Bell size={18} />{(data?.risks.filter((risk) => risk.score >= 60).length ?? 0) > 0 && <i />}
            </button>
            <button className="avatar top-avatar" onClick={() => navigate("settings")} aria-label="Abrir ajustes">A</button>
            <button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          </div>
        </header>
        <div className="page-container">
          <div className="page-heading">
            <div><div className="eyebrow">{active.eyebrow}</div><h1>{active.title}</h1></div>
            <div className="heading-location"><span className="location-pulse" /><MapPin size={15} /><span>{data?.location ?? settings.location}</span><ChevronDown size={14} /></div>
          </div>
          {error && <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => void refresh()}>Reintentar</button></div>}
          {loading ? <DashboardSkeleton /> : <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {page === "dashboard" && data && <Dashboard data={data} settings={settings} onNavigate={navigate} onRefresh={refresh} />}
              {page === "plants" && <PlantsView plants={currentPlants} mode={settings.mode} onRefresh={refresh} />}
              {page === "species" && <SpeciesView />}
              {page === "calendar" && <CalendarView tasks={tasks.filter((task) => !task.plantId || currentPlants.some((plant) => plant.id === task.plantId))} plants={currentPlants} onRefresh={refresh} />}
              {page === "journal" && <JournalView plants={currentPlants} />}
              {page === "irrigation" && <IrrigationView mode={settings.mode} weather={data?.weather} plants={currentPlants} onRefresh={refresh} />}
              {page === "assistant" && <AssistantView onSaveAdvice={async (title, detail) => {
                await api.createJournal({ title, detail, category: "Consejo de AgroIA", plantId: null });
              }} />}
              {page === "settings" && <SettingsView settings={settings} onSave={updateSettings} onRefresh={refresh} />}
            </motion.div>
          </AnimatePresence>}
          <footer className="app-footer"><span>AgroIA · Un asistente para crecer con conocimiento</span><span><span className="privacy-dot" /> Datos almacenados localmente</span></footer>
        </div>
      </main>
      <nav className="mobile-bottom-nav" aria-label="Navegación móvil">
        {navigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-label={item.label}>
            <Icon size={19} /><span>{item.label === "Resumen" ? "Inicio" : item.label}</span>
          </button>;
        })}
        <button onClick={() => setMobileNav(true)}><Menu size={19} /><span>Más</span></button>
      </nav>
      <button className="floating-assistant" aria-label="Preguntar a AgroIA" onClick={() => setAssistantOpen(true)}>
        <MessageCircle size={19} /><span>Pregúntale a AgroIA</span><span className="online-dot" />
      </button>
      {assistantOpen && <QuickAssistant onClose={() => setAssistantOpen(false)} onFullChat={() => navigate("assistant")} />}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} onNavigate={navigate} />}
    </div>
  );
}

function DashboardSkeleton() {
  return <div className="skeleton-grid" aria-label="Cargando tablero">
    <div className="skeleton skeleton-wide" /><div className="skeleton" /><div className="skeleton" />
    <div className="skeleton skeleton-large" /><div className="skeleton skeleton-large" />
  </div>;
}

function Dashboard({ data, settings, onNavigate, onRefresh }: { data: DashboardData; settings: AppSettings; onNavigate: (page: PageId) => void; onRefresh: (refreshWeather?: boolean) => Promise<void> }) {
  const [period, setPeriod] = useState<ReadingTrendPeriod>("7d");
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("agroia.widgets") ?? "null");
      if (!Array.isArray(stored)) return widgetOrderDefault;
      const savedOrder = [...new Set(stored.filter((item): item is string =>
        typeof item === "string" && widgetOrderDefault.includes(item)))];
      return [...savedOrder, ...widgetOrderDefault.filter((item) => !savedOrder.includes(item))];
    }
    catch { return widgetOrderDefault; }
  });
  const [dragging, setDragging] = useState("");
  const [riskExpanded, setRiskExpanded] = useState<string | null>(null);
  const alerts = data.risks.filter((risk) => risk.score >= 60).length;
  const reorder = (target: string) => {
    if (!dragging || dragging === target) return;
    const next = [...order];
    const from = next.indexOf(dragging);
    const to = next.indexOf(target);
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    localStorage.setItem("agroia.widgets", JSON.stringify(next));
    setDragging("");
  };
  const widget = (id: string, content: React.ReactNode, className = "") => (
    <div key={id} draggable className={`widget widget-${id} ${className} ${dragging === id ? "widget-dragging" : ""}`}
      onDragStart={() => setDragging(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(id)}
      onDragEnd={() => setDragging("")}>
      <button className="drag-handle" title="Arrastra para reordenar" aria-label="Reordenar tarjeta">⠿</button>{content}
    </div>
  );
  const widgets: Record<string, React.ReactNode> = {
    weather: widget("weather", <WeatherCard data={data} settings={settings} onRefresh={onRefresh} />),
    moisture: widget("moisture", <MoistureCard data={data} />),
    risk: widget("risk", <RiskCard data={data} expanded={riskExpanded} onExpand={setRiskExpanded} onAsk={() => onNavigate("assistant")} />),
    recommendation: widget("recommendation", <RecommendationCard data={data} onAsk={() => onNavigate("assistant")} />),
    chart: widget("chart", <Suspense fallback={<div className="card skeleton" aria-label="Cargando gráfico" />}><ChartCard data={data} period={period} setPeriod={setPeriod} onRefresh={onRefresh} /></Suspense>),
    tasks: widget("tasks", <TasksCard data={data} onNavigate={() => onNavigate("calendar")} />),
    map: widget("map", <MapCard data={data} onNavigate={() => onNavigate("settings")} />),
  };

  return <section className="dashboard">
    <div className="welcome-row">
      <div><h2>{settings.mode === "agronomo" ? "Buenos días, qué bueno tenerte por aquí." : "Tus plantas están en buenas manos."}</h2>
        <p>Esto es lo que está pasando con tu espacio hoy.</p></div>
      <button className="button button-primary" onClick={() => onNavigate("plants")}><Plus size={16} /> Agregar {settings.mode === "hogar" ? "planta" : "cultivo"}</button>
    </div>
    {data.weather.source !== "live" && <div className="stale-banner"><Cloud size={15} /> {data.weather.source === "cache" ? `Mostrando el último clima disponible${data.staleMinutes ? `, hace ${data.staleMinutes} min` : ""}.` : "Sin conexión al clima: mostrando valores de demostración."}</div>}
    <div className="dashboard-grid">
      {order.filter((id) => widgets[id]).map((id) => widgets[id])}
    </div>
    {settings.mode === "hogar" && <div className="streak-card"><div className="streak-emoji">🌱</div><div><strong>Vas muy bien con tus plantas</strong><p>Un pequeño cuidado hoy suma para una semana más verde.</p></div><div className="streak-count">4 <span>días cuidando</span></div></div>}
    <div className="safety-note"><ShieldAlert size={15} /> AgroIA ofrece orientación, no reemplaza a un ingeniero agrónomo ni a un fitosanitario autorizado.</div>
    <span className="sr-only">{alerts} alertas de riesgo prioritarias.</span>
  </section>;
}

function WeatherCard({ data, settings, onRefresh }: { data: DashboardData; settings: AppSettings; onRefresh: (refreshWeather?: boolean) => Promise<void> }) {
  const w = data.weather;
  const sunny = w.rainProbability < 45;
  const WeatherIcon = sunny ? Sun : CloudRain;
  return <div className="card weather-card">
    <div className="card-topline"><div className="card-label"><span className="tiny-icon weather-icon"><WeatherIcon size={15} /></span> CLIMA AHORA</div>
      <button className="subtle-action" onClick={() => void onRefresh(true)} aria-label="Actualizar datos del clima"><Ellipsis size={17} /></button></div>
    <div className="weather-main"><div className="temperature">{Math.round(w.temperature)}<span>°</span></div>
      <div className="weather-condition"><strong>{sunny ? "Parcialmente soleado" : "Posible lluvia"}</strong><span>Sensación de {Math.round(w.feelsLike)}°</span></div>
      <WeatherIcon className={`weather-illustration ${sunny ? "sunny" : ""}`} size={47} strokeWidth={1.35} /></div>
    <div className="weather-bottom">
      <span><CloudRain size={14} /> {Math.round(w.rainProbability)}% lluvia</span>
      <span><Droplets size={14} /> {w.humidity}% humedad</span>
      <span><Wind size={14} /> {Math.round(w.windSpeed)} km/h</span>
    </div>
    <div className="card-footnote"><MapPin size={12} /> {data.location} <span>·</span>{settings.mode === "agronomo" ? " Pronóstico local" : " Datos locales"}</div>
  </div>;
}

function MoistureCard({ data }: { data: DashboardData }) {
  const moisture = data.readings.at(-1)?.moisture ?? data.weather.soilMoisture;
  const tone = moisture < 25 ? "dry" : moisture > 75 ? "wet" : "good";
  const status = moisture < 25 ? "Necesita atención" : moisture > 75 ? "Muy húmedo" : "En buen nivel";
  return <div className="card moisture-card">
    <div className="card-topline"><div className="card-label"><span className="tiny-icon blue-icon"><Droplets size={15} /></span> HUMEDAD DEL SUELO</div>
      <button className="period-tag">20 cm <ChevronDown size={12} /></button></div>
    <div className="moisture-content"><div className={`moisture-gauge ${tone}`} style={{ "--gauge": `${Math.max(0, Math.min(100, moisture))}%` } as React.CSSProperties}>
      <div className="gauge-inner"><strong>{Math.round(moisture)}<span>%</span></strong><small>volumétrica</small></div></div>
      <div className="moisture-caption"><span className={`status-pill ${tone}`}><i /> {status}</span>
        <p>Rango recomendado<br /><strong>30–65%</strong> para este lote</p>
        <span className="change-positive"><TrendingUp size={13} /> Estable hoy</span></div>
    </div>
    <div className="gauge-scale"><span>Seco</span><i /><span>Óptimo</span><i /><span>Saturado</span></div>
    <div className="card-footnote"><Activity size={12} /> {data.readings.length ? "Última lectura registrada" : "Estimación meteorológica"} <span>·</span> {data.readings.length ? "Profundidad según registro" : "Capa superficial estimada"}</div>
  </div>;
}

function RiskCard({ data, expanded, onExpand, onAsk }: { data: DashboardData; expanded: string | null; onExpand: (id: string | null) => void; onAsk: () => void }) {
  const mainRisks = data.risks.slice(0, 3);
  const highCount = data.risks.filter((risk) => risk.score >= 60).length;
  return <div className="card risk-card">
    <div className="card-topline"><div className="card-label"><span className="tiny-icon amber-icon"><ShieldAlert size={15} /></span> SEMÁFORO DE RIESGOS</div>
      <span className={`risk-summary ${highCount ? "has-risk" : ""}`}><i /> {highCount ? `${highCount} por revisar` : "Todo tranquilo"}</span></div>
    <div className="risk-list">{mainRisks.map((risk) => <div className={`risk-item ${risk.level.toLocaleLowerCase("es-CO")}`} key={risk.id}>
      <button className="risk-trigger" onClick={() => onExpand(expanded === risk.id ? null : risk.id)} aria-expanded={expanded === risk.id}>
        <span className={`risk-dot risk-${risk.level.toLocaleLowerCase("es-CO")}`} />
        <span className="risk-title">{risk.title}</span><span className={`risk-level level-${risk.level.toLocaleLowerCase("es-CO")}`}>{risk.level}</span>
        {expanded === risk.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {expanded === risk.id && <div className="risk-details"><p>{risk.reason}</p><p><strong>Sugerencia:</strong> {risk.recommendation}</p>
        <button onClick={onAsk}>Preguntar a AgroIA <ArrowRight size={13} /></button></div>}
    </div>)}</div>
    <div className="risk-foot"><span>Reglas explicables · Puntaje sobre 100</span><button onClick={onAsk}>Ver análisis <ArrowRight size={14} /></button></div>
  </div>;
}

function RecommendationCard({ data, onAsk }: { data: DashboardData; onAsk: () => void }) {
  return <div className="card recommendation-card">
    <div className="recommendation-orb"><Sprout size={21} /></div>
    <div className="recommendation-content"><div className="card-label">RECOMENDACIÓN DEL DÍA <span className="ai-badge">AgroIA</span></div>
      <h3>{data.recommendation}</h3><p>Basada en el clima y la última lectura disponible.</p></div>
    <button className="button button-light" onClick={onAsk}>Ampliar en el chat <ArrowRight size={15} /></button>
    <div className="recommendation-decoration" />
  </div>;
}

function TasksCard({ data, onNavigate }: { data: DashboardData; onNavigate: () => void }) {
  return <div className="card tasks-card">
    <div className="card-topline"><div className="card-label"><span className="tiny-icon purple-icon"><CheckCircle2 size={15} /></span> LO QUE VIENE</div>
      <button className="text-action" onClick={onNavigate}>Ver calendario <ArrowRight size={13} /></button></div>
    {data.tasks.slice(0, 4).map((task) => <div className="mini-task" key={task.id}>
      <span className={`task-icon task-${task.category.toLocaleLowerCase("es-CO")}`}><TaskIcon category={task.category} /></span>
      <span className="mini-task-name">{task.title}</span><span className="mini-task-date">{relativeDate(task.dueDate)}</span>
    </div>)}
    {data.tasks.length === 0 && <div className="empty-state compact-empty"><CheckCircle2 size={22} /><strong>Todo al día</strong><span>Tu calendario está despejado.</span></div>}
  </div>;
}

function TaskIcon({ category }: { category: string }) {
  const Icon = /riego/i.test(category) ? Droplets : /monitoreo|sanidad/i.test(category) ? Activity : Sprout;
  return <Icon size={14} />;
}

function MapCard({ data, onNavigate }: { data: DashboardData; onNavigate: () => void }) {
  return <div className="card map-card">
    <div className="card-topline"><div className="card-label"><span className="tiny-icon green-icon"><MapPin size={14} /></span> UBICACIÓN</div>
      <button className="text-action" onClick={onNavigate}>Editar <ArrowRight size={13} /></button></div>
    <div className="map-art" aria-label={`Mapa ilustrado de ${data.location}`}>
      <svg viewBox="0 0 370 132" role="img" aria-hidden="true">
        <path d="M0 70c50-37 81 12 128-16s61 13 99-6 75 28 143-11" fill="none" stroke="var(--map-road)" strokeWidth="10" />
        <path d="M-10 100c53-30 64-5 110-28s73 12 127-1 80 16 155-18" fill="none" stroke="var(--map-road)" strokeWidth="4" />
        <path d="M62-4c19 43-9 61 18 88s-2 43 10 58M252-6c-12 35 10 46-7 73s6 50-4 68" fill="none" stroke="var(--map-road-soft)" strokeWidth="4" />
        <circle cx="187" cy="55" r="21" fill="var(--map-pulse)" /><circle cx="187" cy="55" r="8" fill="#397b59" stroke="white" strokeWidth="4" />
        <path d="M43 38c9-9 25-9 34 0M282 96c7-7 20-7 27 0M120 105c5-5 14-5 19 0" fill="none" stroke="var(--map-green)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="map-place"><MapPin size={12} />{data.location}</div>
    </div>
    <div className="map-legend"><span><i className="map-legend-dot" /> {data.plants.length} {data.plants.length === 1 ? "espacio" : "espacios"} monitoreados</span><span><i className="map-legend-line" /> Mapa local</span></div>
  </div>;
}

function relativeDate(date: string) {
  const target = new Date(`${date}T00:00:00`);
  const days = Math.ceil((target.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days < 7) return `En ${days} días`;
  return target.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function PlantsView({ plants, mode, onRefresh }: { plants: Plant[]; mode: AppSettings["mode"]; onRefresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", species: "", location: "", plantedAt: new Date().toISOString().slice(0, 10), area: "1", notes: "" });
  const emptyForm = () => ({ name: "", species: "", location: "", plantedAt: new Date().toISOString().slice(0, 10), area: "1", notes: "" });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setFormError("");
      const plant = { ...form, mode, area: Number(form.area) };
      if (editingId === null) await api.createPlant(plant);
      else await api.updatePlant(editingId, plant);
      setAdding(false);
      setEditingId(null);
      setForm(emptyForm());
      await onRefresh();
    } catch (error) { setFormError(error instanceof Error ? error.message : "No se pudo guardar."); }
  };
  const edit = (plant: Plant) => {
    setForm({ name: plant.name, species: plant.species, location: plant.location, plantedAt: plant.plantedAt, area: String(plant.area), notes: plant.notes });
    setEditingId(plant.id);
    setAdding(true);
    setFormError("");
  };
  const archive = async (plant: Plant) => {
    if (!window.confirm(`¿Archivar “${plant.name}”? Se ocultará del espacio activo; sus registros se conservarán.`)) return;
    try { await api.deletePlant(plant.id); await onRefresh(); }
    catch (error) { setFormError(error instanceof Error ? error.message : "No se pudo archivar."); }
  };
  return <section className="module-view">
    <div className="module-intro"><div><h2>{plants.length} {mode === "hogar" ? "plantas" : "lotes y cultivos"} en tu espacio</h2><p>Registra cada espacio para tener consejos más relevantes.</p></div>
      <button className="button button-primary" onClick={() => {
        if (adding) { setAdding(false); setEditingId(null); setForm(emptyForm()); }
        else { setEditingId(null); setForm(emptyForm()); setAdding(true); }
      }}><Plus size={16} /> Agregar</button></div>
    {formError && <div className="error-banner" role="alert"><AlertTriangle size={16} />{formError}</div>}
    {adding && <form className="form-card plant-form" onSubmit={submit}>
      <div className="form-card-heading"><h3>{editingId === null ? `Nuevo ${mode === "hogar" ? "espacio verde" : "cultivo o lote"}` : "Editar espacio"}</h3><button type="button" className="icon-button" onClick={() => { setAdding(false); setEditingId(null); setForm(emptyForm()); }} aria-label="Cerrar formulario"><X size={17} /></button></div>
      <div className="form-grid">
        <label>Nombre del espacio<input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Huerta del patio" /></label>
        <label>Especie<input required maxLength={80} value={form.species} onChange={(event) => setForm({ ...form, species: event.target.value })} placeholder="Ej. Tomate" /></label>
        <label>Ubicación<input maxLength={120} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Barrio, lote o habitación" /></label>
        <label>{mode === "hogar" ? "Área aproximada (m²)" : "Área (hectáreas)"}<input type="number" min="0.01" step="0.01" required value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label>
        <label>Fecha de siembra o inicio<input type="date" required value={form.plantedAt} onChange={(event) => setForm({ ...form, plantedAt: event.target.value })} /></label>
        <label className="span-two">Notas<textarea maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Etapa, variedad o detalles importantes…" /></label>
      </div>
      <div className="form-actions"><button className="button button-primary"><Check size={15} /> {editingId === null ? "Guardar espacio" : "Guardar cambios"}</button></div>
    </form>}
    {plants.length ? <div className="plant-grid">{plants.map((plant, index) => <article className="plant-card" key={plant.id}>
      <div className={`plant-art plant-art-${index % 4}`}><div className="plant-art-sun" /><Sprout size={42} strokeWidth={1.2} /><span className="plant-state"><i /> Activo</span>
        <button className="plant-menu plant-edit" aria-label={`Editar ${plant.name}`} title="Editar" onClick={() => edit(plant)}><Pencil size={14} /></button>
        <button className="plant-menu" aria-label={`Archivar ${plant.name}`} title="Archivar" onClick={() => void archive(plant)}><Trash2 size={14} /></button></div>
      <div className="plant-card-body"><div className="plant-species-label">{plant.species.toUpperCase()}</div><h3>{plant.name}</h3>
        <div className="plant-meta"><span><MapPin size={13} />{plant.location || "Ubicación sin definir"}</span><span><CalendarIcon /> Desde {new Date(`${plant.plantedAt}T00:00:00`).toLocaleDateString("es-CO", { month: "short", year: "numeric" })}</span></div>
        <div className="plant-card-footer"><span><Droplets size={14} /> Riego según necesidad</span><ChevronRight size={16} /></div></div>
    </article>)}</div> : <div className="empty-state"><Sprout size={28} /><strong>Tu espacio está listo para crecer</strong><span>Agrega tu primera planta o cultivo para personalizar los datos y recomendaciones.</span><button className="button button-primary" onClick={() => setAdding(true)}><Plus size={15} /> Agregar ahora</button></div>}
  </section>;
}

function CalendarIcon() { return <Activity size={13} />; }

function SpeciesView() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [species, setSpecies] = useState<SpeciesCard[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.species(query, category).then((result) => { if (active) { setSpecies(result); setError(""); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "No se pudo cargar la biblioteca."); });
    return () => { active = false; };
  }, [query, category]);
  return <section className="module-view">
    <div className="module-intro"><div><h2>Aprende a cuidar cada especie</h2><p>Guía local con referencias útiles para Colombia. Ajusta siempre según tu clima y observación.</p></div><div className="species-count"><Flower2 size={16} /> {species.length} especies</div></div>
    <div className="species-toolbar"><label className="search-field"><Search size={17} /><input placeholder="Buscar por nombre…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select aria-label="Filtrar por categoría" value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="">Todas las categorías</option>{["Cultivo", "Hortaliza", "Frutal", "Aromática", "Interior", "Ornamental"].map((value) => <option key={value}>{value}</option>)}
      </select></div>
    {error && <div className="error-banner"><AlertTriangle size={16} />{error}</div>}
    <div className="species-grid">{species.map((item, index) => <article className="species-card" key={item.name}>
      <div className={`species-art species-art-${index % 5}`}><Leaf size={27} strokeWidth={1.5} /><span>{item.category}</span></div>
      <div className="species-body"><h3>{item.name}</h3><div className="species-cycle">Ciclo <strong>{item.cycle}</strong></div>
        <div className="species-facts"><div><Sun size={13} /><span><strong>Luz</strong>{item.light}</span></div>
          <div><Droplets size={13} /><span><strong>Riego</strong>{item.watering}</span></div>
          <div><Thermometer size={13} /><span><strong>Temperatura</strong>{item.temperature}</span></div>
          <div><Activity size={13} /><span><strong>Suelo / pH</strong>{item.soil}</span></div></div></div>
    </article>)}</div>
    {species.length === 0 && !error && <div className="empty-state"><Search size={25} /><strong>Sin resultados</strong><span>Prueba con otro nombre o categoría.</span></div>}
    <div className="safety-note"><AlertTriangle size={15} /> Los rangos son orientativos. Confirma las necesidades específicas de tu variedad y zona.</div>
  </section>;
}

function CalendarView({ tasks, plants, onRefresh }: { tasks: Task[]; plants: Plant[]; onRefresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ title: "", dueDate: new Date().toISOString().slice(0, 10), category: "Riego", plantId: "" });
  const updateTask = async (task: Task) => {
    try { await api.completeTask(task.id, !task.completed); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo actualizar la tarea."); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.createTask({ title: form.title, dueDate: form.dueDate, category: form.category, plantId: form.plantId ? Number(form.plantId) : null });
      setForm({ ...form, title: "" }); setAdding(false); await onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo crear la tarea."); }
  };
  const grouped = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const today = new Date().toISOString().slice(0, 10);
    return [
      { label: "HOY", rows: sorted.filter((task) => task.dueDate <= today && !task.completed) },
      { label: "PRÓXIMAMENTE", rows: sorted.filter((task) => task.dueDate > today && !task.completed) },
      { label: "COMPLETADAS", rows: sorted.filter((task) => task.completed) },
    ].filter((group) => group.rows.length);
  }, [tasks]);
  return <section className="module-view">
    <div className="module-intro"><div><h2>Cuidados que vienen</h2><p>Organiza las labores y márcalas cuando estén listas.</p></div><button className="button button-primary" onClick={() => setAdding(!adding)}><Plus size={16} /> Nueva tarea</button></div>
    {message && <div className="error-banner" role="alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
    {adding && <form className="form-card task-form" onSubmit={submit}>
      <div className="form-grid"><label className="span-two">Tarea<input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Revisar hojas y tallos" /></label>
        <label>Fecha<input type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
        <label>Tipo<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{["Riego", "Monitoreo", "Sanidad", "Fertilización", "Poda", "Cosecha", "Cuidado"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="span-two">Planta o cultivo<select value={form.plantId} onChange={(event) => setForm({ ...form, plantId: event.target.value })}><option value="">Sin asignar</option>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></label></div>
      <div className="form-actions"><button className="button button-primary"><Check size={15} /> Crear tarea</button></div>
    </form>}
    <div className="calendar-layout"><div className="calendar-timeline">{grouped.map((group) => <div className="task-group" key={group.label}>
      <div className="task-group-heading"><span>{group.label}</span><i /> <small>{group.rows.length}</small></div>
      {group.rows.map((task) => <article className={`calendar-task ${task.completed ? "completed" : ""}`} key={task.id}>
        <button className={`task-check ${task.completed ? "checked" : ""}`} aria-label={task.completed ? "Marcar pendiente" : "Marcar como hecha"} onClick={() => void updateTask(task)}>{task.completed && <Check size={13} />}</button>
        <div className="calendar-task-copy"><strong>{task.title}</strong><span>{plants.find((plant) => plant.id === task.plantId)?.name ?? "Espacio general"} · {task.category}</span></div>
        <time>{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}</time>
      </article>)}
    </div>)}{grouped.length === 0 && <div className="empty-state"><CheckCircle2 size={26} /><strong>Sin tareas pendientes</strong><span>Tu agenda está despejada por ahora.</span></div>}</div>
      <aside className="calendar-tip"><div className="calendar-tip-icon"><CloudRain size={20} /></div><span className="eyebrow">CONSEJO DEL CLIMA</span><h3>Riega con intención</h3><p>Revisa el pronóstico antes de programar un riego. La lluvia efectiva puede ayudarte a ahorrar agua.</p><button className="text-action" onClick={() => setMessage("Tip: revisa el pronóstico local y confirma la humedad del suelo antes de decidir.")}>Ver recomendaciones <ArrowRight size={13} /></button></aside>
    </div>
  </section>;
}

function JournalView({ plants }: { plants: Plant[] }) {
  const [entries, setEntries] = useState<Array<{ id: number; title: string; detail: string; category: string; createdAt: string; plantId: number | null }>>([]);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({ title: "", detail: "", category: "Observación", plantId: "" });
  const [error, setError] = useState("");
  const refresh = useCallback(() => api.journal().then(setEntries).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "No se pudo cargar la bitácora.")), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try { await api.createJournal({ ...form, plantId: form.plantId ? Number(form.plantId) : null }); setForm({ title: "", detail: "", category: "Observación", plantId: "" }); setAdding(false); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar la entrada."); }
  };
  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = ["Fecha,Título,Categoría,Espacio,Detalle", ...entries.map((entry) =>
      [entry.createdAt, entry.title, entry.category, plants.find((plant) => plant.id === entry.plantId)?.name ?? "", entry.detail].map(escape).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = "agroia-bitacora.csv"; link.click(); URL.revokeObjectURL(link.href);
  };
  const currentPlantIds = new Set(plants.map((plant) => plant.id));
  const visible = entries.filter((entry) => (!entry.plantId || currentPlantIds.has(entry.plantId))
    && `${entry.title} ${entry.detail} ${entry.category}`.toLocaleLowerCase("es-CO").includes(filter.toLocaleLowerCase("es-CO")));
  return <section className="module-view">
    <div className="module-intro"><div><h2>Lo que observas importa</h2><p>Registra labores, síntomas y aprendizajes para tomar mejores decisiones.</p></div>
      <div className="button-row"><button className="button button-secondary" onClick={exportCsv}><ArrowDownToLine size={15} /> Exportar CSV</button><button className="button button-primary" onClick={() => setAdding(!adding)}><Plus size={16} /> Nueva entrada</button></div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {adding && <form className="form-card" onSubmit={submit}><div className="form-grid">
      <label className="span-two">Título<input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="¿Qué pasó hoy?" /></label>
      <label>Categoría<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{["Observación", "Riego", "Monitoreo", "Sanidad", "Fertilización", "Aplicación", "Cosecha", "Consejo de AgroIA"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Espacio<select value={form.plantId} onChange={(event) => setForm({ ...form, plantId: event.target.value })}><option value="">Sin asignar</option>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></label>
      <label className="span-two">Detalle<textarea maxLength={3000} value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} placeholder="Agrega detalles para recordar…" /></label>
      </div><div className="form-actions"><button className="button button-primary"><Check size={15} /> Guardar en bitácora</button></div></form>}
    <label className="search-field journal-search"><Search size={16} /><input placeholder="Buscar en tus registros…" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
    <div className="journal-list">{visible.map((entry, index) => <article className="journal-entry" key={entry.id}>
      <div className="journal-date"><strong>{new Date(entry.createdAt).toLocaleDateString("es-CO", { day: "2-digit" })}</strong><span>{new Date(entry.createdAt).toLocaleDateString("es-CO", { month: "short" })}</span></div>
      <div className={`journal-marker marker-${index % 4}`}><BookOpen size={15} /></div>
      <div className="journal-copy"><div className="journal-entry-meta"><span className="category-chip">{entry.category}</span><span>{plants.find((plant) => plant.id === entry.plantId)?.name ?? "Espacio general"}</span><span>·</span><span>{new Date(entry.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span></div>
        <h3>{entry.title}</h3><p>{entry.detail}</p></div><ChevronRight size={16} className="muted-icon" /></article>)}
      {visible.length === 0 && <div className="empty-state"><BookOpen size={24} /><strong>La bitácora comienza contigo</strong><span>Registra observaciones, labores o recomendaciones para consultar después.</span></div>}
    </div>
  </section>;
}

function IrrigationView({ mode, weather, plants, onRefresh }: { mode: AppSettings["mode"]; weather?: DashboardData["weather"]; plants: Plant[]; onRefresh: () => Promise<void> }) {
  const [areaM2, setAreaM2] = useState(mode === "hogar" ? "1" : "1000");
  const [kc, setKc] = useState(mode === "hogar" ? "0.7" : "1.05");
  const [rain, setRain] = useState("0");
  const [moisture, setMoisture] = useState(String(weather?.soilMoisture ?? 38));
  const [result, setResult] = useState<{ suggestedMm: number; litres: number; glasses: number; explanation: string } | null>(null);
  const [error, setError] = useState("");
  const [readingMessage, setReadingMessage] = useState("");
  const [selected, setSelected] = useState("");
  const calculate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setError("");
      setResult(await api.irrigationPlan({
        et0: weather?.et0 ?? 2.8, kc: Number(kc), areaM2: Number(areaM2),
        effectiveRainMm: Number(rain), soilMoisturePercent: Number(moisture), mode,
      }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo calcular."); }
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    try {
      setError(""); setReadingMessage("");
      if (file.size > 1000000) throw new Error("El CSV debe pesar menos de 1 MB.");
      const response = await api.importReadings(await file.text());
      setReadingMessage(`${response.imported} lecturas importadas.`);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo importar el CSV.");
    }
  };
  return <section className="module-view irrigation-view">
    <div className="module-intro"><div><h2>Agua cuando hace falta, ni más ni menos</h2><p>Estimación orientativa basada en evapotranspiración, lluvia y humedad disponible.</p></div><span className="weather-source"><Cloud size={15} /> ET₀ {weather?.et0 ?? "—"} mm/día</span></div>
    <div className="irrigation-layout"><form className="form-card irrigation-form" onSubmit={calculate}>
      <h3>Datos de cálculo</h3><p>Los resultados son una referencia; valida con el suelo y la etapa del cultivo.</p>
      <label>{mode === "hogar" ? "Área de la maceta o jardinera (m²)" : "Área del lote (m²)"}
        <input type="number" required min="0.01" max="100000" step="any" value={areaM2} onChange={(event) => setAreaM2(event.target.value)} /></label>
      <label>Coeficiente de cultivo (Kc)<input type="number" required min="0" max="2.5" step="0.01" value={kc} onChange={(event) => setKc(event.target.value)} /></label>
      <label>Lluvia efectiva reciente (mm)<input type="number" required min="0" max="500" step="0.1" value={rain} onChange={(event) => setRain(event.target.value)} /></label>
      <label>Humedad actual del suelo (%)<input type="number" required min="0" max="100" value={moisture} onChange={(event) => setMoisture(event.target.value)} /></label>
      {plants.length > 0 && <label>Espacio a consultar<select value={selected} onChange={(event) => {
        const plant = plants.find((item) => item.id === Number(event.target.value));
        setSelected(event.target.value);
        if (plant) { setAreaM2(String(plant.mode === "agronomo" ? plant.area * 10000 : plant.area)); setKc(/papa|tomate|maíz|maiz/i.test(plant.species) ? "1.05" : "0.8"); }
      }}><option value="">Elegir espacio (opcional)</option>{plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></label>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <button className="button button-primary full-button"><Gauge size={16} /> Calcular recomendación</button>
      <label className="csv-import-button"><Upload size={14} /> Importar lecturas desde CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0])} /></label>
      {readingMessage && <div className="success-banner" role="status"><CheckCircle2 size={15} />{readingMessage}</div>}
    </form>
      <div className="irrigation-result-area">{result ? <div className="irrigation-result">
        <div className="result-kicker"><Droplets size={16} /> RECOMENDACIÓN ESTIMADA</div><div className="result-number">{mode === "hogar" ? result.litres : result.suggestedMm}<span>{mode === "hogar" ? "L" : "mm"}</span></div>
        <h3>{mode === "hogar" ? "agua como referencia" : "lámina neta sugerida"}</h3><p>{result.explanation}</p>
        <div className="result-breakdown"><div><span>Agua total</span><strong>{result.litres} L</strong></div><div><span>ET₀ de referencia</span><strong>{weather?.et0 ?? 2.8} mm/día</strong></div><div><span>Humedad del suelo</span><strong>{moisture}%</strong></div></div>
        <div className="result-caution"><ShieldAlert size={15} /> Verifica el sustrato o perfil de suelo. No riegues si está saturado o si el pronóstico indica lluvia significativa.</div>
      </div> : <div className="irrigation-empty"><div className="water-illustration"><Droplets size={42} /></div><h3>Un riego más consciente</h3><p>Ingresa los datos de tu espacio. AgroIA combinará el clima y la lectura del suelo para estimar un volumen.</p><div className="irrigation-facts"><span><CloudRain size={15} /> Lluvia efectiva</span><span><Activity size={15} /> ET₀ y Kc</span><span><Droplets size={15} /> Humedad actual</span></div></div>}</div>
    </div>
    <div className="safety-note"><AlertTriangle size={15} /> La estimación no sustituye mediciones ni un balance hídrico específico. En modo hogar, los vasos usan 250 ml como referencia.</div>
  </section>;
}

function AssistantView({ onSaveAdvice }: { onSaveAdvice: (title: string, detail: string) => Promise<void> }) {
  return <section className="assistant-page">
    <div className="assistant-intro"><div className="assistant-spark"><Sprout size={23} /></div><div><h2>Hablemos de lo que está creciendo</h2>
      <p>Pregunta sobre tus plantas, comparte síntomas o piensa en tu siguiente paso.</p></div></div>
    <ChatPanel onSaveAdvice={onSaveAdvice} />
    <div className="safety-note"><ShieldAlert size={15} /> La orientación es informativa. Para decisiones fitosanitarias, consulta a un profesional y verifica el registro ICA.</div>
  </section>;
}

function ChatPanel({ compact = false, onClose, onFullChat, onSaveAdvice }: {
  compact?: boolean; onClose?: () => void; onFullChat?: () => void;
  onSaveAdvice: (title: string, detail: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "¡Hola! Soy AgroIA 🌿 Cuéntame qué observas y te ayudaré a pensar en próximos pasos. ¿Qué planta o cultivo quieres revisar?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<Array<{ id: number; title: string; createdAt: string; messages: ChatMessage[] }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const endRef = useState<HTMLDivElement | null>(null);
  const lastAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const quickQuestions = ["¿Debo regar hoy?", "¿Qué señales de plaga reviso?", "¿Cómo cuido mejor mis plantas?"];

  const refreshHistory = useCallback(async () => {
    const response = await fetch("/api/conversations");
    if (!response.ok) throw new Error("No se pudo cargar el historial.");
    setHistory(await response.json() as Array<{ id: number; title: string; createdAt: string; messages: ChatMessage[] }>);
  }, []);
  useEffect(() => { void refreshHistory().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "No se pudo cargar el historial.")); }, [refreshHistory]);
  useEffect(() => { endRef[0]?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, sending]);
  const submit = async (event?: FormEvent, suggestion?: string) => {
    event?.preventDefault();
    const question = (suggestion ?? input).trim();
    if (!question || sending) return;
    const nextMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(nextMessages);
    setInput(""); setSending(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-12) }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({ error: `Error ${response.status}` })) as { error?: string };
        throw new Error(detail.error ?? "No se pudo enviar la pregunta.");
      }
      if (!response.body) throw new Error("El navegador no pudo abrir la respuesta en streaming.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const eventText of events) {
          const line = eventText.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          const item = JSON.parse(payload) as { text?: string; error?: string };
          if (item.error) throw new Error(item.error);
          answer += item.text ?? "";
          setMessages([...nextMessages, { role: "assistant", content: answer }]);
        }
        if (done) break;
      }
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocurrió un error al consultar al asistente.");
      setMessages(nextMessages);
    } finally { setSending(false); }
  };
  const saveAnswer = async () => {
    try {
      await onSaveAdvice("Consejo de AgroIA", lastAnswer);
      setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el consejo."); }
  };
  const filteredHistory = history.filter((item) => item.title.toLocaleLowerCase("es-CO").includes(historyQuery.toLocaleLowerCase("es-CO")));
  return <div className={`chat-panel ${compact ? "chat-compact" : ""}`}>
    {compact && <div className="quick-chat-head"><div className="assistant-orb"><Sprout size={17} /></div><div><strong>AgroIA</strong><span><i /> Disponible ahora</span></div><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button></div>}
    <div className="chat-context"><span><Cloud size={14} /> Contexto del clima incluido</span><span><ShieldAlert size={14} /> Orientación responsable</span>
      <button className="history-trigger" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}><BookOpen size={13} /> Historial {history.length}</button></div>
    {historyOpen && <div className="history-panel"><label className="search-field"><Search size={14} /><input placeholder="Buscar conversaciones…" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} /></label>
      {filteredHistory.slice(0, 8).map((item) => <button className="history-item" key={item.id} onClick={() => { setMessages(item.messages); setHistoryOpen(false); setSaved(false); }}>
        <span>{item.title}</span><small>{new Date(item.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</small></button>)}
      {filteredHistory.length === 0 && <p className="history-empty">Aún no hay conversaciones que coincidan.</p>}</div>}
    <div className="chat-messages">
      {messages.map((message, index) => <div key={index} className={`chat-message ${message.role === "user" ? "user-message" : "assistant-message"}`}>
        {message.role === "assistant" && <div className="chat-avatar"><Sprout size={14} /></div>}
        <div className="chat-bubble">{message.content.split("\n").map((line, lineIndex) => <span key={lineIndex}>
          {line.startsWith("### ") ? <strong className="chat-section-heading">{line.slice(4)}</strong> : line.replaceAll("**", "") || "\u00a0"}<br />
        </span>)}</div>
        {message.role === "assistant" && index === messages.length - 1 && index > 0 && <button className={`save-advice ${saved ? "saved" : ""}`} onClick={() => void saveAnswer()}><BookOpen size={13} /> {saved ? "Guardado en bitácora" : "Guardar consejo"}</button>}
      </div>)}
      {sending && <div className="assistant-message"><div className="chat-avatar"><Sprout size={14} /></div><div className="typing-indicator"><i /><i /><i /></div></div>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div ref={endRef[1]} />
    </div>
    <div className="quick-prompts">{quickQuestions.map((question) => <button key={question} onClick={() => void submit(undefined, question)} disabled={sending}>{question}</button>)}</div>
    <form className="chat-compose" onSubmit={(event) => void submit(event)}>
      <input aria-label="Escribe tu pregunta" placeholder="Pregúntale lo que quieras a AgroIA…" value={input} onChange={(event) => setInput(event.target.value)} maxLength={5000} />
      <button type="button" className="voice-button" title="Entrada de voz" aria-label="Usar entrada de voz" onClick={() => startVoice(setInput)}><AudioLines size={17} /></button>
      <button className="send-button" disabled={!input.trim() || sending} aria-label="Enviar pregunta"><Send size={16} /></button>
    </form>
    {compact && <button className="full-chat-link" onClick={onFullChat}>Abrir conversación completa <ArrowRight size={13} /></button>}
  </div>;
}

function startVoice(setInput: (value: string) => void) {
  type SpeechResult = { transcript: string };
  type SpeechEvent = { results: ArrayLike<ArrayLike<SpeechResult>> };
  type SpeechInstance = { lang: string; onresult: (event: SpeechEvent) => void; onerror: () => void; start: () => void };
  const Speech = (window as Window & { webkitSpeechRecognition?: new () => SpeechInstance }).webkitSpeechRecognition;
  if (!Speech) {
    window.alert("La entrada de voz no está disponible en este navegador.");
    return;
  }
  const recognition = new Speech();
  recognition.lang = "es-CO";
  recognition.onresult = (event) => setInput(event.results[0]?.[0]?.transcript ?? "");
  recognition.onerror = () => window.alert("No se pudo reconocer la voz. Revisa los permisos del micrófono.");
  recognition.start();
}

function QuickAssistant({ onClose, onFullChat }: { onClose: () => void; onFullChat: () => void }) {
  return <div className="quick-assistant">
    <ChatPanel compact onClose={onClose} onFullChat={onFullChat} onSaveAdvice={async (title, detail) => {
      await api.createJournal({ title, detail, category: "Consejo de AgroIA", plantId: null });
    }} />
  </div>;
}

function SettingsView({ settings, onSave, onRefresh }: {
  settings: AppSettings; onSave: (settings: Partial<AppSettings>) => Promise<void>; onRefresh: () => Promise<void>;
}) {
  const [form, setForm] = useState(settings);
  const [apiKey, setApiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [locationQuery, setLocationQuery] = useState(settings.location);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => { setForm(settings); setLocationQuery(settings.location); }, [settings]);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      const values: Partial<AppSettings> = { ...form, location: locationQuery };
      if (apiKey.trim()) values.openaiApiKey = apiKey.trim();
      else delete values.openaiApiKey;
      if (anthropicKey.trim()) values.anthropicApiKey = anthropicKey.trim();
      else delete values.anthropicApiKey;
      await onSave(values);
      setApiKey(""); setAnthropicKey(""); setMessage("Ajustes guardados en este dispositivo.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron guardar los ajustes."); }
    finally { setSaving(false); }
  };
  const searchLocation = async () => {
    try {
      setError(""); setMessage("");
      const location = await api.locationSearch(locationQuery);
      setLocationQuery(location.name);
      setForm((current) => ({ ...current, location: location.name, latitude: location.latitude, longitude: location.longitude }));
      setMessage(`Ubicación encontrada: ${location.name}. Guarda los cambios para actualizar los datos.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo encontrar la ubicación."); }
  };
  const downloadBackup = async () => {
    try {
      const response = await fetch("/api/backup");
      if (!response.ok) throw new Error("No se pudo descargar el respaldo.");
      const blob = await response.blob();
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "agroia-respaldo.json"; link.click(); URL.revokeObjectURL(link.href);
      setMessage("Respaldo descargado.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo exportar."); }
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    if (!window.confirm("Importar este respaldo reemplazará los cultivos, tareas, bitácora, lecturas y conversaciones actuales. ¿Continuar?")) return;
    setImporting(true); setMessage(""); setError("");
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) });
      const payload = await response.json() as { importedPlants?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "El respaldo no es válido.");
      await onRefresh();
      setMessage(`Respaldo importado: ${payload.importedPlants ?? 0} espacios.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo importar el respaldo."); }
    finally { setImporting(false); }
  };
  const clearData = async () => {
    if (!window.confirm("¿Borrar cultivos, tareas, bitácora, lecturas y conversaciones de este dispositivo? Esta acción no se puede deshacer.")) return;
    try {
      const response = await fetch("/api/data", { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudieron borrar los datos.");
      await onRefresh(); setMessage("Tus datos personales fueron borrados.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron borrar los datos."); }
  };
  return <section className="module-view settings-view">
    <div className="module-intro"><div><h2>Configura tu espacio</h2><p>La configuración y tus datos se guardan en tu dispositivo.</p></div></div>
    {message && <div className="success-banner" role="status"><CheckCircle2 size={16} />{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
    {error && <div className="error-banner" role="alert"><AlertTriangle size={16} />{error}</div>}
    <form className="settings-layout" onSubmit={(event) => void save(event)}>
      <div className="settings-main">
        <section className="settings-card"><div className="settings-card-icon"><MapPin size={18} /></div><div className="settings-card-content"><h3>Ubicación y clima</h3><p>Los datos meteorológicos provienen de Open-Meteo. La ciudad se busca cuando tú lo solicitas.</p>
          <div className="location-edit"><input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} maxLength={100} aria-label="Ciudad" /><button type="button" className="button button-secondary" onClick={() => void searchLocation()}><Search size={14} /> Buscar ciudad</button></div>
          <small>Coordenadas guardadas: {form.latitude.toFixed(3)}, {form.longitude.toFixed(3)}</small></div></section>
        <section className="settings-card"><div className="settings-card-icon"><MessageCircle size={18} /></div><div className="settings-card-content"><h3>Asistente de inteligencia artificial</h3><p>En modo local las preguntas se responden sin enviar datos a servicios externos.</p>
          <label>Proveedor<select value={form.aiProvider} onChange={(event) => set("aiProvider", event.target.value as AppSettings["aiProvider"])}>
            <option value="offline">Sin conexión · reglas locales</option><option value="ollama">Ollama local</option><option value="openai">API compatible con OpenAI</option><option value="anthropic">Anthropic</option></select></label>
          {form.aiProvider === "ollama" && <div className="form-grid settings-form-grid"><label>Dirección local<input value={form.ollamaBaseUrl} onChange={(event) => set("ollamaBaseUrl", event.target.value)} /></label><label>Modelo<input value={form.ollamaModel} onChange={(event) => set("ollamaModel", event.target.value)} /></label></div>}
          {form.aiProvider === "openai" && <div className="form-grid settings-form-grid"><label>URL base compatible<input value={form.openaiBaseUrl} onChange={(event) => set("openaiBaseUrl", event.target.value)} /></label><label>Modelo<input value={form.openaiModel} onChange={(event) => set("openaiModel", event.target.value)} /></label><label className="span-two">Clave API<input type="password" autoComplete="new-password" placeholder={settings.openaiApiKey ? "•••••••• (ya guardada)" : "Pega tu clave aquí"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label></div>}
          {form.aiProvider === "anthropic" && <div className="form-grid settings-form-grid"><label>Modelo<input value={form.anthropicModel} onChange={(event) => set("anthropicModel", event.target.value)} /></label><label>Clave API<input type="password" autoComplete="new-password" placeholder={settings.anthropicApiKey ? "•••••••• (ya guardada)" : "Pega tu clave aquí"} value={anthropicKey} onChange={(event) => setAnthropicKey(event.target.value)} /></label></div>}
          <div className="privacy-callout"><ShieldAlert size={15} /> Si eliges un proveedor externo, el contenido de tus preguntas y el contexto agronómico se enviarán a ese proveedor. Las claves se guardan en el servidor local y no se muestran de nuevo.</div>
        </div></section>
        <section className="settings-card"><div className="settings-card-icon"><Sun size={18} /></div><div className="settings-card-content"><h3>Preferencias</h3><p>Personaliza cómo quieres consultar AgroIA.</p>
          <div className="preference-row"><div><strong>Apariencia</strong><span>Elige un tema para tu espacio.</span></div><div className="theme-toggle">
            {(["light", "dark"] as const).map((theme) => { const ThemeIcon = icons[theme]; return <button type="button" className={form.theme === theme ? "active" : ""} key={theme} onClick={() => set("theme", theme)}><ThemeIcon size={15} /> {theme === "light" ? "Claro" : "Oscuro"}</button>; })}
          </div></div>
          <div className="preference-row"><div><strong>Simulador de sensores</strong><span>Genera lecturas de muestra para demostración.</span></div><button type="button" className={`toggle-switch ${form.sensorSimulator ? "on" : ""}`} role="switch" aria-checked={form.sensorSimulator} onClick={() => set("sensorSimulator", !form.sensorSimulator)}><i /></button></div>
          <label>Modo de uso<select value={form.mode} onChange={(event) => set("mode", event.target.value as AppSettings["mode"])}><option value="agronomo">Agrónomo</option><option value="hogar">Hogar</option></select></label>
        </div></section>
        <section className="settings-card"><div className="settings-card-icon"><ArrowDownToLine size={18} /></div><div className="settings-card-content"><h3>Respaldo y privacidad</h3><p>Exporta tus datos o restaura un archivo de AgroIA en este dispositivo.</p>
          <div className="button-row"><button type="button" className="button button-secondary" onClick={() => void downloadBackup()}><ArrowDownToLine size={15} /> Exportar respaldo</button>
            <label className={`button button-secondary import-button ${importing ? "disabled" : ""}`}><ArrowRight size={15} />{importing ? "Importando…" : "Importar respaldo"}<input type="file" accept="application/json,.json" disabled={importing} onChange={(event) => void importBackup(event.target.files?.[0])} /></label></div>
          <button type="button" className="danger-link" onClick={() => void clearData()}><Trash2 size={14} /> Borrar datos locales</button>
        </div></section>
      </div>
      <aside className="settings-aside"><div className="local-privacy-art"><div className="privacy-lock"><ShieldAlert size={24} /></div><h3>Tu espacio, tus datos.</h3><p>Los cultivos, lecturas, tareas y bitácora se guardan en una base de datos local en tu dispositivo.</p><div className="privacy-line"><CheckCircle2 size={14} /> Sin cuenta ni nube</div><div className="privacy-line"><CheckCircle2 size={14} /> Claves solo en el servidor local</div><div className="privacy-line"><CheckCircle2 size={14} /> Tú decides si conectas IA externa</div></div>
        <p className="settings-version">AgroIA v1.0 · Hecho para crecer</p></aside>
      <div className="settings-submit"><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : <><Check size={15} /> Guardar ajustes</>}</button></div>
    </form>
  </section>;
}

function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (page: PageId) => void }) {
  const [query, setQuery] = useState("");
  const items = navigation.filter((item) => item.label.toLocaleLowerCase("es-CO").includes(query.toLocaleLowerCase("es-CO")));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Búsqueda y comandos">
      <div className="command-search"><Search size={18} /><input autoFocus placeholder="¿A dónde quieres ir?" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && items[0]) { onNavigate(items[0].id); onClose(); }
      }} /><kbd>ESC</kbd></div>
      <div className="command-results"><span>IR A</span>{items.map((item) => {
        const Icon = item.icon;
        return <button key={item.id} onClick={() => { onNavigate(item.id); onClose(); }}><Icon size={16} /><span>{item.label}</span><ArrowRight size={14} /></button>;
      })}{items.length === 0 && <p>No encontramos una sección con ese nombre.</p>}</div>
      <div className="command-foot"><Command size={13} /> Navegación rápida de AgroIA <span>↑ ↓ seleccionar · enter abrir</span></div>
    </div>
  </div>;
}

export default App;
