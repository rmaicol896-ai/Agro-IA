import { describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("API client", () => {
  it("surfaces server validation errors to the interface", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "La ciudad no se encontró." }), { status: 400 })));
    await expect(api.dashboard()).rejects.toThrow("La ciudad no se encontró.");
    vi.unstubAllGlobals();
  });

  it("requests location search with a JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "Bogotá", latitude: 4.7, longitude: -74 }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    await expect(api.locationSearch("Bogotá")).resolves.toMatchObject({ name: "Bogotá" });
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/api/location/search");
    vi.unstubAllGlobals();
  });
});
