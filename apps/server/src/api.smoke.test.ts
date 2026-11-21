import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "agroia-api-"));
const port = 31000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess | undefined;
let startupOutput = "";

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* The child process may not have started listening yet. */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error(`La API de humo no inició en el tiempo esperado. ${startupOutput}`);
}

describe("API local (humo)", () => {
  beforeAll(async () => {
    server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: resolve(process.cwd()),
      env: { ...process.env, PORT: String(port), DATABASE_PATH: join(directory, "smoke.sqlite"), AI_PROVIDER: "ollama" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk: Buffer) => { startupOutput += chunk.toString(); });
    server.stderr?.on("data", (chunk: Buffer) => { startupOutput += chunk.toString(); });
    await waitUntilReady();
  }, 15000);

  afterAll(async () => {
    if (server && server.exitCode === null) {
      const child = server;
      await new Promise<void>((resolveExit) => {
        child.once("exit", () => resolveExit());
        child.kill();
      });
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it("serves a healthy local API and a seeded species library", async () => {
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json()) as { status: string };
    const species = await fetch(`${baseUrl}/api/species`).then((response) => response.json()) as Array<{ name: string }>;
    const settings = await fetch(`${baseUrl}/api/settings`).then((response) => response.json()) as { aiProvider: string };
    expect(health.status).toBe("ok");
    expect(species.length).toBeGreaterThanOrEqual(40);
    expect(settings.aiProvider).toBe("ollama");
  });

  it("rejects invalid sensor input", async () => {
    const response = await fetch(`${baseUrl}/api/sensors/readings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moisture: 200, temperature: 15, ph: 6.5 }),
    });
    expect(response.status).toBe(400);
  });

  it("returns soil trends at hourly and daily resolution for the active mode", async () => {
    const hourlyResponse = await fetch(`${baseUrl}/api/readings/trend?period=24h`);
    const hourly = await hourlyResponse.json() as Array<{ date: string; moisture: number; temperature: number; ph: number; samples: number }>;
    expect(hourlyResponse.status).toBe(200);
    expect(hourly.length).toBeGreaterThan(0);
    expect(hourly[0]).toMatchObject({ moisture: expect.any(Number), temperature: expect.any(Number), ph: expect.any(Number) });
    expect(hourly[0]?.samples).toBeGreaterThan(0);

    const dailyResponse = await fetch(`${baseUrl}/api/readings/trend?period=7d`);
    const daily = await dailyResponse.json() as Array<{ date: string }>;
    expect(dailyResponse.status).toBe(200);
    expect(daily).toHaveLength(7);
    const monthlyResponse = await fetch(`${baseUrl}/api/readings/trend?period=30d`);
    const monthly = await monthlyResponse.json() as Array<{ date: string }>;
    expect(monthlyResponse.status).toBe(200);
    expect(monthly).toHaveLength(30);
    expect((await fetch(`${baseUrl}/api/readings/trend?period=invalid`)).status).toBe(400);
  });

  it("creates a validated local plant record", async () => {
    const response = await fetch(`${baseUrl}/api/plants`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Huerta de humo", species: "Tomate", mode: "hogar",
        location: "Balcón", plantedAt: new Date().toISOString().slice(0, 10), area: 1, notes: "",
      }),
    });
    expect(response.status).toBe(201);
    const created = await response.json() as { id: number; name: string };
    expect(created).toMatchObject({ name: "Huerta de humo" });
    const updatedResponse = await fetch(`${baseUrl}/api/plants/${created.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Huerta actualizada" }),
    });
    expect(updatedResponse.status).toBe(200);
    expect(await updatedResponse.json()).toMatchObject({ name: "Huerta actualizada" });
    expect((await fetch(`${baseUrl}/api/plants`)).status).toBe(200);
    const archived = await fetch(`${baseUrl}/api/plants/${created.id}`, { method: "DELETE" });
    expect(archived.status).toBe(204);
  });

  it("falls back to the local guide if Ollama is unavailable and stores the conversation", async () => {
    await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ollamaBaseUrl: "http://127.0.0.1:1" }),
    });
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "¿Debo regar hoy?" }] }),
    });
    const body = await response.text();
    const answer = body.split("\n\n").flatMap((event) => {
      const line = event.split("\n").find((entry) => entry.startsWith("data: {"));
      return line ? [(JSON.parse(line.slice(6)) as { text?: string }).text ?? ""] : [];
    }).join("");
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(answer).toContain("Diagnóstico probable");
    expect(answer).toContain("Ollama no respondió");
    expect(body).toContain("[DONE]");
    const conversations = await fetch(`${baseUrl}/api/conversations`).then((result) => result.json()) as Array<{ title: string }>;
    expect(conversations[0]?.title).toContain("regar");
  });

  it("exports and restores local demo data without exporting API keys", async () => {
    const backup = await fetch(`${baseUrl}/api/backup`).then((response) => response.json()) as {
      plants: Array<unknown>;
      readings: Array<unknown>;
      settings: Array<{ key: string }>;
    };
    expect(backup.plants.length).toBeGreaterThanOrEqual(7);
    expect(backup.readings.length).toBeGreaterThanOrEqual(30);
    expect(backup.settings.some(({ key }) => key.endsWith("api_key"))).toBe(false);
    const response = await fetch(`${baseUrl}/api/backup/import`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ importedPlants: backup.plants.length });
  });
});
