import type { DashboardData, JournalEntry, Plant, SoilReadingTrend, Task } from "@agroia/shared";

export interface SpeciesCard {
  name: string;
  category: string;
  light: string;
  watering: string;
  temperature: string;
  soil: string;
  cycle: string;
}

export interface AppSettings {
  mode: "agronomo" | "hogar";
  location: string;
  latitude: number;
  longitude: number;
  theme: "light" | "dark";
  sensorSimulator: boolean;
  aiProvider: "offline" | "ollama" | "openai" | "anthropic";
  ollamaBaseUrl: string;
  ollamaModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey: string;
  anthropicModel: string;
  anthropicApiKey: string;
}

export type ReadingTrendPeriod = "24h" | "7d" | "30d";

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({ error: `Error ${response.status}` })) as { error?: string };
    const message = result.error?.startsWith("Error ")
      ? response.status >= 500 ? "El servidor local no pudo completar la solicitud." : `No se pudo completar la solicitud (${response.status}).`
      : result.error ?? "No se pudo completar la solicitud.";
    throw new ApiRequestError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  dashboard: (refreshWeather = false) => request<DashboardData>(`/api/dashboard${refreshWeather ? "?refresh=true" : ""}`),
  readingTrend: (period: ReadingTrendPeriod) => request<SoilReadingTrend[]>(`/api/readings/trend?period=${period}`),
  plants: () => request<Plant[]>("/api/plants"),
  createPlant: (plant: Omit<Plant, "id">) => request<Plant>("/api/plants", { method: "POST", body: JSON.stringify(plant) }),
  updatePlant: (id: number, plant: Partial<Omit<Plant, "id">>) => request<Plant>(`/api/plants/${id}`, { method: "PATCH", body: JSON.stringify(plant) }),
  deletePlant: (id: number) => request<void>(`/api/plants/${id}`, { method: "DELETE" }),
  species: (query: string, category: string) => request<SpeciesCard[]>(`/api/species?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`),
  tasks: () => request<Task[]>("/api/tasks"),
  createTask: (task: Omit<Task, "id" | "completed">) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(task) }),
  completeTask: (id: number, completed: boolean) => request(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }),
  journal: () => request<JournalEntry[]>("/api/journal"),
  createJournal: (entry: Omit<JournalEntry, "id" | "createdAt">) => request<JournalEntry>("/api/journal", { method: "POST", body: JSON.stringify(entry) }),
  settings: () => request<AppSettings>("/api/settings"),
  saveSettings: (settings: Partial<AppSettings>) => request("/api/settings", { method: "PATCH", body: JSON.stringify(settings) }),
  locationSearch: (name: string) => request<{ name: string; latitude: number; longitude: number }>("/api/location/search", { method: "POST", body: JSON.stringify({ name }) }),
  createReading: (reading: { plantId?: number; moisture: number; temperature: number; ph: number; depth?: string }) =>
    request("/api/sensors/readings", { method: "POST", body: JSON.stringify(reading) }),
  importReadings: (csv: string) => request<{ imported: number }>("/api/readings/import", { method: "POST", body: JSON.stringify({ csv }) }),
  irrigationPlan: (input: { et0: number; kc: number; areaM2: number; effectiveRainMm: number; soilMoisturePercent: number; mode: "agronomo" | "hogar" }) =>
    request<{ suggestedMm: number; litres: number; glasses: number; explanation: string }>("/api/irrigation/plan", { method: "POST", body: JSON.stringify(input) }),
};
