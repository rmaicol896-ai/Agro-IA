export type AppMode = "agronomo" | "hogar";

export interface Plant {
  id: number;
  name: string;
  species: string;
  mode: AppMode;
  location: string;
  plantedAt: string;
  area: number;
  notes: string;
}

export interface WeatherSnapshot {
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipitation: number;
  rainProbability: number;
  windSpeed: number;
  et0: number;
  soilMoisture: number;
  soilTemperature: number;
  updatedAt: string;
  source: "live" | "cache" | "demo";
}

export type RiskLevel = "Bajo" | "Medio" | "Alto" | "Crítico";

export interface Risk {
  id: string;
  title: string;
  score: number;
  level: RiskLevel;
  reason: string;
  recommendation: string;
}

export interface Task {
  id: number;
  title: string;
  dueDate: string;
  category: string;
  completed: boolean;
  plantId: number | null;
}

export interface JournalEntry {
  id: number;
  title: string;
  detail: string;
  category: string;
  createdAt: string;
  plantId: number | null;
}

export interface DashboardData {
  mode: AppMode;
  location: string;
  weather: WeatherSnapshot;
  risks: Risk[];
  plants: Plant[];
  tasks: Task[];
  journal: JournalEntry[];
  readings: Array<{ date: string; moisture: number; temperature: number; ph: number }>;
  recommendation: string;
  staleMinutes: number;
}

export interface SoilReadingTrend {
  date: string;
  moisture: number;
  temperature: number;
  ph: number;
  samples: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
