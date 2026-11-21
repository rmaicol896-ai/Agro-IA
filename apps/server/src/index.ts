import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { ChatMessage, DashboardData, JournalEntry, Plant, Task } from "@agroia/shared";
import { db, setting, setSetting, transaction, type SQLInputValue } from "./db.js";
import { isExpired, parseExpiration } from "./expiration.js";
import { calculateRisks, irrigationPlan } from "./domain.js";
import { createAIProvider } from "./ai.js";
import { seedDemo } from "./seed.js";
import { updateLocation, getWeather } from "./weather.js";

seedDemo();

const app = express();
const port = Number(process.env.PORT ?? 3001);
const serviceExpiration = parseExpiration(process.env.SERVICE_EXPIRES_AT);
app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = (process.env.WEB_ORIGIN ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!origin || allowedOrigins.includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) callback(null, true);
    else callback(new Error("Origen no permitido por la política local de CORS."));
  },
}));
app.use(express.json({ limit: "5mb" }));

const plantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  species: z.string().trim().min(1).max(80),
  mode: z.enum(["agronomo", "hogar"]),
  location: z.string().trim().max(120).default(""),
  plantedAt: z.string().date(),
  area: z.number().positive().max(100000).default(1),
  notes: z.string().max(1000).default(""),
});
const readingSchema = z.object({
  plantId: z.number().int().positive().optional(),
  moisture: z.number().min(0).max(100),
  temperature: z.number().min(-20).max(80),
  ph: z.number().min(0).max(14),
  depth: z.string().trim().max(40).default("20 cm"),
  source: z.string().trim().max(40).default("manual"),
  createdAt: z.string().datetime().optional(),
});
const taskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  dueDate: z.string().date(),
  category: z.string().trim().min(1).max(60),
  plantId: z.number().int().positive().nullable().optional(),
});
const journalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(3000).default(""),
  category: z.string().trim().min(1).max(60),
  plantId: z.number().int().positive().nullable().optional(),
});
const settingsSchema = z.object({
  mode: z.enum(["agronomo", "hogar"]).optional(),
  location: z.string().trim().min(2).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  sensorSimulator: z.boolean().optional(),
  aiProvider: z.enum(["offline", "ollama", "openai", "anthropic"]).optional(),
  ollamaBaseUrl: z.string().url().optional(),
  ollamaModel: z.string().trim().min(1).max(100).optional(),
  openaiBaseUrl: z.string().url().optional(),
  openaiModel: z.string().trim().min(1).max(100).optional(),
  openaiApiKey: z.string().max(500).optional(),
  anthropicModel: z.string().trim().min(1).max(100).optional(),
  anthropicApiKey: z.string().max(500).optional(),
});

function rows<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
function one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
function httpError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado.";
  res.status(400).json({ error: message });
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "AgroIA", time: new Date().toISOString() }));

app.use((_req, res, next) => {
  if (isExpired(serviceExpiration)) return res.status(410).json({ error: "El acceso a esta demostración de AgroIA ya expiró." });
  next();
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const weather = await getWeather(req.query.refresh === "true");
    const mode = setting("mode") as DashboardData["mode"];
    const plants = rows<Plant>("SELECT id,name,species,mode,location,planted_at AS plantedAt,area,notes FROM plants WHERE archived=0");
    const tasks = rows<Task>(`SELECT id,title,due_date AS dueDate,category,completed,plant_id AS plantId FROM tasks
      WHERE completed=0 AND (plant_id IS NULL OR plant_id IN (SELECT id FROM plants WHERE mode=? AND archived=0))
      ORDER BY due_date LIMIT 8`, mode);
    const journal = rows<JournalEntry>(`SELECT id,title,detail,category,created_at AS createdAt,plant_id AS plantId FROM journal
      WHERE plant_id IS NULL OR plant_id IN (SELECT id FROM plants WHERE mode=? AND archived=0)
      ORDER BY created_at DESC LIMIT 6`, mode);
    const readings = rows<{ date: string; moisture: number; temperature: number; ph: number }>(
      `SELECT substr(created_at,1,10) AS date,AVG(moisture) AS moisture,
      AVG(temperature) AS temperature,AVG(ph) AS ph FROM soil_readings
      WHERE plant_id IS NULL OR plant_id IN (SELECT id FROM plants WHERE mode=? AND archived=0)
      GROUP BY substr(created_at,1,10) ORDER BY date DESC LIMIT 30`, mode,
    ).reverse();
    const lastSoilReading = one<{ moisture: number; ph: number }>(
      `SELECT moisture,ph FROM soil_readings WHERE plant_id IS NULL OR plant_id IN (SELECT id FROM plants WHERE mode=? AND archived=0)
      ORDER BY created_at DESC LIMIT 1`, mode,
    );
    const risks = calculateRisks({
      temperature: weather.temperature,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
      rainProbability: weather.rainProbability,
      soilMoisture: lastSoilReading?.moisture ?? weather.soilMoisture,
      et0: weather.et0,
      ph: lastSoilReading?.ph,
      species: plants.filter((plant) => plant.mode === mode).map((plant) => plant.species),
    });
    const weatherTime = db.prepare("SELECT fetched_at FROM weather_cache WHERE id=1").get() as { fetched_at: string } | undefined;
    res.json({
      mode, location: setting("location"), weather, risks,
      plants: plants.filter((plant) => plant.mode === mode),
      tasks: tasks.map((task) => ({ ...task, completed: Boolean(task.completed) })),
      journal, readings,
      recommendation: weather.rainProbability >= 65
        ? "Hoy conviene revisar el drenaje y aplazar el riego: hay probabilidad de lluvia."
        : (lastSoilReading?.moisture ?? weather.soilMoisture) < 25
          ? "Hoy conviene verificar la humedad en la zona de raíces antes de planear un riego."
          : "Hoy conviene inspeccionar las hojas y registrar una lectura de humedad antes de intervenir.",
      staleMinutes: weatherTime ? Math.max(0, Math.floor((Date.now() - new Date(weatherTime.fetched_at).getTime()) / 60000)) : 0,
    } satisfies DashboardData);
  } catch (error) {
    httpError(res, error);
  }
});

app.get("/api/plants", (_req, res) => {
  res.json(rows("SELECT id,name,species,mode,location,planted_at AS plantedAt,area,notes FROM plants WHERE archived=0 ORDER BY id DESC"));
});
app.post("/api/plants", (req, res) => {
  const parsed = plantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." });
  const result = db.prepare(`INSERT INTO plants (name,species,mode,location,planted_at,area,notes)
    VALUES (@name,@species,@mode,@location,@plantedAt,@area,@notes)`).run(parsed.data);
  res.status(201).json({ id: Number(result.lastInsertRowid), ...parsed.data });
});
app.patch("/api/plants/:id", (req, res) => {
  const parsed = plantSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return res.status(400).json({ error: "Datos de planta inválidos." });
  const current = one<Record<string, unknown>>("SELECT id,name,species,mode,location,planted_at AS plantedAt,area,notes FROM plants WHERE id=? AND archived=0", Number(req.params.id));
  if (!current) return res.status(404).json({ error: "No se encontró la planta o cultivo." });
  const updated = { ...current, ...parsed.data };
  db.prepare(`UPDATE plants SET name=@name,species=@species,mode=@mode,location=@location,
    planted_at=@plantedAt,area=@area,notes=@notes WHERE id=@id`).run(updated);
  res.json(updated);
});
app.delete("/api/plants/:id", (req, res) => {
  const result = db.prepare("UPDATE plants SET archived=1 WHERE id=? AND archived=0").run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: "No se encontró la planta o cultivo activo." });
  res.status(204).end();
});

app.get("/api/tasks", (_req, res) => res.json(rows<{ id: number; title: string; dueDate: string; category: string; completed: number; plantId: number | null }>(
  "SELECT id,title,due_date AS dueDate,category,completed,plant_id AS plantId FROM tasks ORDER BY due_date",
).map((task: { completed: number }) => ({ ...task, completed: Boolean(task.completed) }))));
app.post("/api/tasks", (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." });
  const result = db.prepare("INSERT INTO tasks (title,due_date,category,plant_id) VALUES (?,?,?,?)")
    .run(parsed.data.title, parsed.data.dueDate, parsed.data.category, parsed.data.plantId ?? null);
  res.status(201).json({ id: Number(result.lastInsertRowid), ...parsed.data, completed: false });
});
app.patch("/api/tasks/:id", (req, res) => {
  const parsed = z.object({ completed: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Estado de tarea inválido." });
  const result = db.prepare("UPDATE tasks SET completed=? WHERE id=?").run(Number(parsed.data.completed), Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "No se encontró la tarea." });
  res.json({ ok: true });
});

app.get("/api/journal", (_req, res) => res.json(rows(
  "SELECT id,title,detail,category,created_at AS createdAt,plant_id AS plantId FROM journal ORDER BY created_at DESC",
)));
app.post("/api/journal", (req, res) => {
  const parsed = journalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." });
  const result = db.prepare("INSERT INTO journal (title,detail,category,created_at,plant_id) VALUES (?,?,?,?,?)")
    .run(parsed.data.title, parsed.data.detail, parsed.data.category, new Date().toISOString(), parsed.data.plantId ?? null);
  res.status(201).json({ id: Number(result.lastInsertRowid), ...parsed.data, createdAt: new Date().toISOString() });
});

app.get("/api/species", (req, res) => {
  const query = String(req.query.q ?? "").trim();
  const category = String(req.query.category ?? "").trim();
  res.json(rows(
    `SELECT name,category,light,watering,temperature,soil,cycle FROM species
      WHERE (?='' OR name LIKE ? OR category LIKE ?) AND (?='' OR category=?) ORDER BY category,name`,
    query, `%${query}%`, `%${query}%`, category, category,
  ));
});

app.get("/api/readings", (_req, res) => res.json(rows(
  "SELECT id,plant_id AS plantId,moisture,temperature,ph,depth,source,created_at AS createdAt FROM soil_readings ORDER BY created_at DESC LIMIT 500",
)));
app.get("/api/readings/trend", (req, res) => {
  const parsed = z.enum(["24h", "7d", "30d"]).safeParse(req.query.period ?? "7d");
  if (!parsed.success) return res.status(400).json({ error: "El periodo del gráfico no es válido." });
  const period = parsed.data;
  const bucket = period === "24h"
    ? "strftime('%Y-%m-%dT%H:00:00Z', created_at)"
    : "date(created_at)";
  const cutoff = period === "24h" ? "-24 hours" : period === "7d" ? "-6 days" : "-29 days";
  const dateFilter = period === "24h"
    ? "datetime(created_at)>=datetime('now',?)"
    : "date(created_at)>=date('now',?)";
  const mode = setting("mode");
  res.json(rows(
    `SELECT ${bucket} AS date,ROUND(AVG(moisture),1) AS moisture,
      ROUND(AVG(temperature),1) AS temperature,ROUND(AVG(ph),1) AS ph,COUNT(*) AS samples
     FROM soil_readings
     WHERE ${dateFilter}
       AND (plant_id IS NULL OR plant_id IN (SELECT id FROM plants WHERE mode=? AND archived=0))
     GROUP BY date ORDER BY date ASC`,
    cutoff, mode,
  ));
});
app.post("/api/sensors/readings", (req, res) => {
  const parsed = readingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Lectura inválida." });
  if (parsed.data.plantId && !one("SELECT id FROM plants WHERE id=? AND archived=0", parsed.data.plantId)) {
    return res.status(400).json({ error: "El cultivo o planta indicado no existe." });
  }
  const result = db.prepare(`INSERT INTO soil_readings (plant_id,moisture,temperature,ph,depth,source,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(parsed.data.plantId ?? null, parsed.data.moisture, parsed.data.temperature,
    parsed.data.ph, parsed.data.depth, parsed.data.source, parsed.data.createdAt ?? new Date().toISOString());
  res.status(201).json({ id: Number(result.lastInsertRowid), ...parsed.data });
});
app.post("/api/readings/import", (req, res) => {
  const body = z.object({ csv: z.string().min(1).max(1000000) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "El CSV falta o supera el tamaño permitido." });
  const lines = body.data.csv.trim().split(/\r?\n/);
  const header = lines.shift()?.toLocaleLowerCase("es-CO").split(",").map((item) => item.trim()) ?? [];
  const required = ["moisture", "temperature", "ph"];
  if (!required.every((key) => header.includes(key))) return res.status(400).json({ error: "El CSV requiere columnas moisture, temperature y ph." });
  const insert = db.prepare(`INSERT INTO soil_readings (moisture,temperature,ph,depth,source,created_at)
    VALUES (?,?,?,?,?,?)`);
  const validRows = lines.map((line) => {
    const values = line.split(",").map((item) => item.trim());
    const record = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    return readingSchema.safeParse({
      moisture: Number(record.moisture), temperature: Number(record.temperature), ph: Number(record.ph),
      depth: record.depth || "20 cm", createdAt: record.createdat && !Number.isNaN(Date.parse(record.createdat))
        ? new Date(record.createdat).toISOString() : undefined, source: "csv",
    });
  });
  const invalidRow = validRows.findIndex((row) => !row.success);
  if (invalidRow >= 0) return res.status(400).json({ error: `La fila ${invalidRow + 2} contiene una lectura fuera de rango.` });
  const insertRows = transaction(() => validRows.forEach((row) => {
    if (row.success) insert.run(row.data.moisture, row.data.temperature, row.data.ph, row.data.depth, "csv", row.data.createdAt ?? new Date().toISOString());
  }));
  insertRows();
  res.status(201).json({ imported: validRows.length });
});

app.post("/api/irrigation/plan", (req, res) => {
  const parsed = z.object({
    et0: z.number().min(0).max(25), kc: z.number().min(0).max(2.5),
    areaM2: z.number().positive().max(100000), effectiveRainMm: z.number().min(0).max(500),
    soilMoisturePercent: z.number().min(0).max(100), mode: z.enum(["agronomo", "hogar"]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Verifica los datos del cálculo de riego." });
  res.json(irrigationPlan(parsed.data));
});

app.get("/api/settings", (_req, res) => res.json({
  mode: setting("mode"), location: setting("location"),
  latitude: Number(setting("latitude")), longitude: Number(setting("longitude")),
  theme: setting("theme"), sensorSimulator: setting("sensor_simulator") === "true",
  aiProvider: setting("ai_provider"), ollamaBaseUrl: setting("ollama_base_url"),
  ollamaModel: setting("ollama_model"), openaiBaseUrl: setting("openai_base_url"),
  openaiModel: setting("openai_model"), openaiApiKey: setting("openai_api_key") ? "••••••••" : "",
  anthropicModel: setting("anthropic_model"), anthropicApiKey: setting("anthropic_api_key") ? "••••••••" : "",
}));
app.patch("/api/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Configuración inválida." });
  const simulatorWasActive = setting("sensor_simulator") === "true";
  const pairs: Array<[string, string | number | boolean | undefined]> = [
    ["mode", parsed.data.mode], ["theme", parsed.data.theme],
    ["sensor_simulator", parsed.data.sensorSimulator === undefined ? undefined : String(parsed.data.sensorSimulator)],
    ["ai_provider", parsed.data.aiProvider], ["ollama_base_url", parsed.data.ollamaBaseUrl],
    ["ollama_model", parsed.data.ollamaModel], ["openai_base_url", parsed.data.openaiBaseUrl],
    ["openai_model", parsed.data.openaiModel], ["openai_api_key", parsed.data.openaiApiKey],
    ["anthropic_model", parsed.data.anthropicModel], ["anthropic_api_key", parsed.data.anthropicApiKey],
  ];
  pairs.forEach(([key, value]) => { if (value !== undefined) setSetting(key, String(value)); });
  if (parsed.data.sensorSimulator === true && !simulatorWasActive) {
    generateSensorReadings();
  }
  if (parsed.data.location && (parsed.data.latitude === undefined || parsed.data.longitude === undefined)) {
    try { await updateLocation(parsed.data.location); } catch (error) { return httpError(res, error); }
  } else if (parsed.data.location && parsed.data.latitude !== undefined && parsed.data.longitude !== undefined) {
    await updateLocation(parsed.data.location, parsed.data.latitude, parsed.data.longitude);
  } else if (parsed.data.latitude !== undefined && parsed.data.longitude !== undefined) {
    await updateLocation(setting("location"), parsed.data.latitude, parsed.data.longitude);
  }
  res.json({ ok: true });
});
app.post("/api/location/search", async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Escribe una ciudad para buscar." });
  try { res.json(await updateLocation(parsed.data.name)); } catch (error) { httpError(res, error); }
});

app.get("/api/conversations", (_req, res) => res.json(rows<{ id: number; title: string; createdAt: string; messages: string }>(
  "SELECT id,title,created_at AS createdAt,messages FROM conversations ORDER BY created_at DESC",
).map((conversation: { messages: string }) => ({ ...conversation, messages: JSON.parse(conversation.messages) }))));
app.post("/api/chat", async (req, res) => {
  const parsed = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(5000) }).strict()).min(1).max(30) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "La conversación no tiene un mensaje válido." });
  const weather = await getWeather();
  const plants = rows<Plant>("SELECT id,name,species,mode,location,planted_at AS plantedAt,area,notes FROM plants WHERE archived=0");
  const activeMode = setting("mode") as "agronomo" | "hogar";
  const latestReading = one<{ moisture: number; ph: number }>("SELECT moisture,ph FROM soil_readings ORDER BY created_at DESC LIMIT 1");
  const context = JSON.stringify({
    mode: activeMode, species: plants.filter((plant) => plant.mode === activeMode).map((plant) => plant.species),
    location: setting("location"), weather, soil: latestReading ?? null,
    risks: calculateRisks({ temperature: weather.temperature, humidity: weather.humidity, windSpeed: weather.windSpeed,
      rainProbability: weather.rainProbability, soilMoisture: latestReading?.moisture ?? weather.soilMoisture,
    et0: weather.et0, ph: latestReading?.ph, species: plants.filter((plant) => plant.mode === activeMode).map((plant) => plant.species) }),
    recentJournal: rows("SELECT title,detail,created_at AS createdAt FROM journal WHERE plant_id IS NULL OR plant_id IN (SELECT id FROM plants WHERE mode=? AND archived=0) ORDER BY created_at DESC LIMIT 3", activeMode),
  });
  try {
    const systemPrompt = `Eres AgroIA, asistente agrícola responsable para Colombia. Contexto: ${context}. Responde en español con diagnóstico probable, causas, acciones priorizadas, prevención y cuándo consultar a un profesional; indica certeza. Nunca inventes dosis agroquímicas. Si mencionas productos, exige revisar etiqueta, registro ICA y consultar a un ingeniero agrónomo.`;
    const answer = await createAIProvider(setting("ai_provider"), activeMode,
      plants.filter((plant) => plant.mode === activeMode).map((plant) => plant.species))
      .generate(parsed.data.messages as ChatMessage[], systemPrompt);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    const chunkSize = 30;
    for (let index = 0; index < answer.length; index += chunkSize) {
      res.write(`data: ${JSON.stringify({ text: answer.slice(index, index + chunkSize) })}\n\n`);
    }
    const messages = [...parsed.data.messages, { role: "assistant", content: answer }];
    const title = String(parsed.data.messages[0]?.content ?? "Conversación AgroIA").slice(0, 80);
    db.prepare("INSERT INTO conversations (title,messages,created_at) VALUES (?,?,?)")
      .run(title, JSON.stringify(messages), new Date().toISOString());
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    if (!res.headersSent) return httpError(res, error);
    res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "No se pudo generar una respuesta." })}\n\n`);
    res.end();
  }
});

app.get("/api/backup", (_req, res) => {
  const backup = {
    exportedAt: new Date().toISOString(),
    plants: rows("SELECT * FROM plants"), tasks: rows("SELECT * FROM tasks"),
    journal: rows("SELECT * FROM journal"), readings: rows("SELECT * FROM soil_readings"),
    settings: rows("SELECT key,value FROM settings WHERE key NOT LIKE '%api_key'"),
    conversations: rows("SELECT * FROM conversations"),
  };
  res.setHeader("Content-Disposition", "attachment; filename=agroia-respaldo.json");
  res.json(backup);
});
app.post("/api/backup/import", (req, res) => {
  const parsed = z.object({
    plants: z.array(z.object({ id: z.number().optional(), name: z.string().min(1), species: z.string().min(1), mode: z.enum(["agronomo", "hogar"]), location: z.string().default(""), planted_at: z.string(), area: z.number(), notes: z.string().default(""), archived: z.number().optional() })).max(1000),
    tasks: z.array(z.object({ title: z.string(), due_date: z.string(), category: z.string(), completed: z.number().optional(), plant_id: z.number().nullable().optional() })).max(10000).optional(),
    journal: z.array(z.object({ title: z.string(), detail: z.string(), category: z.string(), created_at: z.string(), plant_id: z.number().nullable().optional() })).max(10000).optional(),
    readings: z.array(z.object({ plant_id: z.number().nullable().optional(), moisture: z.number().min(0).max(100), temperature: z.number().min(-20).max(80), ph: z.number().min(0).max(14), depth: z.string(), source: z.string(), created_at: z.string() })).max(100000).optional(),
    settings: z.array(z.object({ key: z.string(), value: z.string() })).max(100).optional(),
    conversations: z.array(z.object({ title: z.string(), messages: z.string().max(50000), created_at: z.string() })).max(5000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "El archivo de respaldo no tiene el formato esperado." });
  const importData = transaction(() => {
    db.prepare("DELETE FROM soil_readings").run(); db.prepare("DELETE FROM conversations").run();
    db.prepare("DELETE FROM tasks").run(); db.prepare("DELETE FROM journal").run(); db.prepare("DELETE FROM plants").run();
    const mapping = new Map<number, number>();
    parsed.data.plants.forEach((plant) => {
      const result = db.prepare("INSERT INTO plants (name,species,mode,location,planted_at,area,notes,archived) VALUES (?,?,?,?,?,?,?,?)")
        .run(plant.name, plant.species, plant.mode, plant.location, plant.planted_at, plant.area, plant.notes, plant.archived ?? 0);
      mapping.set(Number(plant.id ?? 0), Number(result.lastInsertRowid));
    });
    parsed.data.tasks?.forEach((task) => db.prepare("INSERT INTO tasks (title,due_date,category,completed,plant_id) VALUES (?,?,?,?,?)")
      .run(task.title, task.due_date, task.category, task.completed ?? 0, task.plant_id ? mapping.get(task.plant_id) ?? null : null));
    parsed.data.journal?.forEach((entry) => db.prepare("INSERT INTO journal (title,detail,category,created_at,plant_id) VALUES (?,?,?,?,?)")
      .run(entry.title, entry.detail, entry.category, entry.created_at, entry.plant_id ? mapping.get(entry.plant_id) ?? null : null));
    parsed.data.readings?.forEach((reading) => db.prepare(`INSERT INTO soil_readings (plant_id,moisture,temperature,ph,depth,source,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(reading.plant_id ? mapping.get(reading.plant_id) ?? null : null,
      reading.moisture, reading.temperature, reading.ph, reading.depth, reading.source, reading.created_at));
    parsed.data.conversations?.forEach((conversation) => db.prepare(
      "INSERT INTO conversations (title,messages,created_at) VALUES (?,?,?)",
    ).run(conversation.title, conversation.messages, conversation.created_at));
    const allowedSettings = new Set(["mode", "location", "latitude", "longitude", "theme", "sensor_simulator",
      "ai_provider", "ollama_base_url", "ollama_model", "openai_base_url", "openai_model", "anthropic_model"]);
    parsed.data.settings?.forEach(({ key, value }) => {
      if (allowedSettings.has(key)) setSetting(key, value);
    });
  });
  importData();
  res.json({ importedPlants: parsed.data.plants.length });
});
app.delete("/api/data", (_req, res) => {
  const clear = transaction(() => {
    db.prepare("DELETE FROM soil_readings").run(); db.prepare("DELETE FROM journal").run();
    db.prepare("DELETE FROM tasks").run(); db.prepare("DELETE FROM plants").run();
    db.prepare("DELETE FROM conversations").run(); db.prepare("DELETE FROM weather_cache").run();
  });
  clear();
  res.json({ ok: true });
});

const webDist = resolve(process.cwd(), "../../apps/web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist, {
    index: "index.html",
    maxAge: "1h",
    setHeaders(res, filePath) {
      if (filePath.endsWith("sw.js") || filePath.endsWith("manifest.webmanifest")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));
  app.get("*", (_req, res) => res.sendFile(resolve(webDist, "index.html")));
}

function generateSensorReadings() {
  const sensorPlants = rows<{ id: number }>("SELECT id FROM plants WHERE archived=0");
  const insert = db.prepare(`INSERT INTO soil_readings (plant_id,moisture,temperature,ph,depth,source,created_at)
    VALUES (?,?,?,?,?,'simulador',?)`);
  const now = new Date().toISOString();
  for (const plant of sensorPlants) {
    const latest = one<{ moisture: number; temperature: number; ph: number }>(
      "SELECT moisture,temperature,ph FROM soil_readings WHERE plant_id=? ORDER BY created_at DESC LIMIT 1",
      plant.id,
    ) ?? { moisture: 40, temperature: 18, ph: 6.2 };
    insert.run(
      plant.id,
      Math.round(Math.max(10, Math.min(80, latest.moisture + (Math.random() * 6 - 3))) * 10) / 10,
      Math.round(Math.max(8, Math.min(35, latest.temperature + (Math.random() * 2 - 1))) * 10) / 10,
      Math.round(Math.max(4, Math.min(8, latest.ph + (Math.random() * 0.2 - 0.1))) * 10) / 10,
      "20 cm",
      now,
    );
  }
}

const sensorTimer = setInterval(() => {
  if (setting("sensor_simulator") === "true") generateSensorReadings();
}, 30 * 60 * 1000);
sensorTimer.unref();

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Error interno del servidor local." });
});

app.listen(port, "0.0.0.0", () => console.log(`AgroIA lista en el puerto ${port}`));
