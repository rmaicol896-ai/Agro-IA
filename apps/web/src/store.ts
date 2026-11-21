import { create } from "zustand";
import type { DashboardData, Plant, Task } from "@agroia/shared";
import type { AppSettings } from "./api";

interface AgroStore {
  data: DashboardData | null;
  plants: Plant[];
  tasks: Task[];
  settings: AppSettings;
  error: string;
  loading: boolean;
  setDashboard: (data: DashboardData) => void;
  setPlants: (plants: Plant[]) => void;
  setTasks: (tasks: Task[]) => void;
  setSettings: (settings: AppSettings) => void;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
}

const defaultSettings: AppSettings = {
  mode: "agronomo",
  location: "Bogotá, Colombia",
  latitude: 4.711,
  longitude: -74.0721,
  theme: "light",
  sensorSimulator: false,
  aiProvider: "ollama",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-4o-mini",
  openaiApiKey: "",
  anthropicModel: "claude-3-5-sonnet-latest",
  anthropicApiKey: "",
};

export const useAgroStore = create<AgroStore>((set) => ({
  data: null,
  plants: [],
  tasks: [],
  settings: defaultSettings,
  error: "",
  loading: true,
  setDashboard: (data) => set({ data }),
  setPlants: (plants) => set({ plants }),
  setTasks: (tasks) => set({ tasks }),
  setSettings: (settings) => set({ settings }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
}));
