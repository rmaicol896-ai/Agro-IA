import { db, setting, setSetting } from "./db.js";
import type { WeatherSnapshot } from "@agroia/shared";

type OpenMeteoResponse = {
  current: Record<string, number>;
  hourly: Record<string, Array<string | number>>;
};

const fallback: WeatherSnapshot = {
  temperature: 17, feelsLike: 17, humidity: 72, precipitation: 0,
  rainProbability: 25, windSpeed: 9, et0: 2.8, soilMoisture: 38,
  soilTemperature: 16, updatedAt: new Date().toISOString(), source: "demo",
};

export async function getWeather(force = false): Promise<WeatherSnapshot> {
  const cache = db.prepare("SELECT payload,fetched_at FROM weather_cache WHERE id=1")
    .get() as { payload: string; fetched_at: string } | undefined;
  const cacheAge = cache ? Date.now() - new Date(cache.fetched_at).getTime() : Infinity;
  if (cache && cacheAge < 30 * 60 * 1000 && !force) {
    return { ...(JSON.parse(cache.payload) as WeatherSnapshot), source: "cache" };
  }

  const latitude = Number(setting("latitude"));
  const longitude = Number(setting("longitude"));
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m",
    hourly: "precipitation_probability,et0_fao_evapotranspiration,soil_moisture_0_to_1cm,soil_temperature_0cm",
    forecast_days: "7", timezone: "auto",
  }).toString();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Open-Meteo respondió ${response.status}`);
    const data = await response.json() as OpenMeteoResponse;
    const nowHour = new Date().getHours();
    const at = (key: string, fallbackValue: number) => Number(data.hourly[key]?.[nowHour] ?? fallbackValue);
    const current = data.current;
    const weather: WeatherSnapshot = {
      temperature: Number(current.temperature_2m ?? fallback.temperature),
      feelsLike: Number(current.apparent_temperature ?? fallback.feelsLike),
      humidity: Number(current.relative_humidity_2m ?? fallback.humidity),
      precipitation: Number(current.precipitation ?? 0),
      rainProbability: at("precipitation_probability", fallback.rainProbability),
      windSpeed: Number(current.wind_speed_10m ?? fallback.windSpeed),
      et0: at("et0_fao_evapotranspiration", fallback.et0),
      soilMoisture: (() => {
        const value = at("soil_moisture_0_to_1cm", fallback.soilMoisture);
        return value <= 1 ? Math.round(value * 100) : value;
      })(),
      soilTemperature: at("soil_temperature_0cm", fallback.soilTemperature),
      updatedAt: new Date().toISOString(),
      source: "live",
    };
    db.prepare(`INSERT INTO weather_cache (id,location,latitude,longitude,payload,fetched_at)
      VALUES (1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET location=excluded.location,
      latitude=excluded.latitude,longitude=excluded.longitude,payload=excluded.payload,fetched_at=excluded.fetched_at`)
      .run(setting("location"), latitude, longitude, JSON.stringify(weather), weather.updatedAt);
    return weather;
  } catch (error) {
    if (cache) return { ...(JSON.parse(cache.payload) as WeatherSnapshot), source: "cache" };
    if (error instanceof Error) console.warn(`Clima no disponible; usando datos de demostración: ${error.message}`);
    return fallback;
  }
}

export async function updateLocation(name: string, latitude?: number, longitude?: number) {
  if (latitude !== undefined && longitude !== undefined) {
    setSetting("location", name);
    setSetting("latitude", String(latitude));
    setSetting("longitude", String(longitude));
    return { name, latitude, longitude };
  }
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name, count: "1", language: "es", format: "json" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Geocodificación respondió ${response.status}`);
  const data = await response.json() as { results?: Array<{ name: string; latitude: number; longitude: number; country?: string }> };
  const result = data.results?.[0];
  if (!result) throw new Error("No se encontró esa ubicación.");
  const locationName = `${result.name}${result.country ? `, ${result.country}` : ""}`;
  setSetting("location", locationName);
  setSetting("latitude", String(result.latitude));
  setSetting("longitude", String(result.longitude));
  db.prepare("DELETE FROM weather_cache").run();
  return { name: locationName, latitude: result.latitude, longitude: result.longitude };
}
