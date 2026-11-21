import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import dotenv from "dotenv";
import { speciesLibrary } from "./species.js";

const rootPath = resolve(process.cwd(), "../../");
dotenv.config({ path: resolve(rootPath, ".env") });
const databasePath = resolve(rootPath, process.env.DATABASE_PATH ?? "apps/server/data/agroia.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS plants (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, species TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('agronomo','hogar')), location TEXT NOT NULL DEFAULT '',
    planted_at TEXT NOT NULL, area REAL NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, due_date TEXT NOT NULL,
    category TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, plant_id INTEGER REFERENCES plants(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL, created_at TEXT NOT NULL, plant_id INTEGER REFERENCES plants(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS soil_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER REFERENCES plants(id) ON DELETE SET NULL,
    moisture REAL NOT NULL, temperature REAL NOT NULL, ph REAL NOT NULL, depth TEXT NOT NULL DEFAULT '20 cm',
    source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS weather_cache (
    id INTEGER PRIMARY KEY CHECK(id=1), location TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
    payload TEXT NOT NULL, fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, messages TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS species (
    name TEXT PRIMARY KEY, category TEXT NOT NULL, light TEXT NOT NULL, watering TEXT NOT NULL,
    temperature TEXT NOT NULL, soil TEXT NOT NULL, cycle TEXT NOT NULL
  );
`);

const plantColumns = db.prepare("PRAGMA table_info(plants)").all() as Array<{ name: string }>;
if (!plantColumns.some((column) => column.name === "archived")) {
  db.exec("ALTER TABLE plants ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
}

const count = db.prepare("SELECT COUNT(*) AS total FROM species").get() as { total: number };
if (count.total === 0) {
  const insertSpecies = db.prepare(
    "INSERT INTO species (name,category,light,watering,temperature,soil,cycle) VALUES (@name,@category,@light,@watering,@temperature,@soil,@cycle)",
  );
  const seedSpecies = transaction(() => speciesLibrary.forEach((species) => insertSpecies.run({
    name: species.name, category: species.category, light: species.light, watering: species.watering,
    temperature: species.temperature, soil: species.soil, cycle: species.cycle,
  })));
  seedSpecies();
}

const defaultSettings = [
  ["mode", "agronomo"],
  ["location", "Bogotá, Colombia"],
  ["latitude", "4.711"],
  ["longitude", "-74.0721"],
  ["theme", "light"],
  ["sensor_simulator", "false"],
  ["ai_provider", process.env.AI_PROVIDER ?? "ollama"],
  ["ollama_base_url", process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"],
  ["ollama_model", process.env.OLLAMA_MODEL ?? "llama3.1"],
  ["openai_base_url", process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"],
  ["openai_model", process.env.OPENAI_MODEL ?? "gpt-4o-mini"],
  ["anthropic_model", process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest"],
];
const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)");
defaultSettings.forEach(([key, value]) => insertSetting.run(key, value));
for (const [key, envKey] of [["openai_api_key", "OPENAI_API_KEY"], ["anthropic_api_key", "ANTHROPIC_API_KEY"]]) {
  const value = process.env[envKey];
  if (value) db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").run(key, value);
}

export function setting(key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

export function transaction<T>(callback: () => T): () => T {
  return () => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
}

export type { SQLInputValue };
