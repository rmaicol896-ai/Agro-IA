import { describe, expect, it } from "vitest";
import { calculateRisks, irrigationPlan, offlineAnswer } from "./domain.js";

describe("RiskEngine", () => {
  it("explains fungal conditions for potato and tomato crops", () => {
    const risks = calculateRisks({
      temperature: 18, humidity: 94, windSpeed: 8, rainProbability: 15,
      soilMoisture: 42, et0: 2, species: ["Papa"],
    });
    expect(risks[0]?.id).toBe("fungal");
    expect(risks[0]?.score).toBeGreaterThanOrEqual(60);
    expect(risks[0]?.reason).toContain("94%");
    expect(risks[0]?.recommendation).toContain("diagnóstico");
  });

  it("reports dry soil and a cold snap with prioritized severity", () => {
    const risks = calculateRisks({
      temperature: 1, humidity: 45, windSpeed: 8, rainProbability: 5,
      soilMoisture: 12, et0: 4, species: ["Café"],
    });
    expect(risks.some((risk) => risk.id === "drought")).toBe(true);
    expect(risks.some((risk) => risk.id === "frost")).toBe(true);
    expect(risks[0]?.score).toBeGreaterThanOrEqual(risks[1]?.score ?? 0);
  });

  it("uses stable conditions when no threshold is active", () => {
    const risks = calculateRisks({
      temperature: 22, humidity: 60, windSpeed: 8, rainProbability: 40,
      soilMoisture: 45, et0: 2, species: [],
    });
    expect(risks).toHaveLength(1);
    expect(risks[0]?.id).toBe("stable");
  });

  it("explains pest-conducive weather and out-of-range soil pH", () => {
    const risks = calculateRisks({
      temperature: 29, humidity: 60, windSpeed: 7, rainProbability: 10,
      soilMoisture: 45, et0: 2.5, ph: 4.6, species: ["Tomate"],
    });
    expect(risks.some((risk) => risk.id === "pest-conditions" && risk.reason.includes("grados-día"))).toBe(true);
    expect(risks.some((risk) => risk.id === "nutrition-ph")).toBe(true);
  });
});

describe("irrigationPlan", () => {
  it("reduces net demand by effective rainfall and returns volume", () => {
    const plan = irrigationPlan({
      et0: 4, kc: 1, areaM2: 10, effectiveRainMm: 1, soilMoisturePercent: 40, mode: "agronomo",
    });
    expect(plan.suggestedMm).toBe(2.4);
    expect(plan.litres).toBe(24);
    expect(plan.explanation).toContain("mm netos");
  });

  it("avoids recommending additional water to saturated soil", () => {
    const plan = irrigationPlan({
      et0: 3, kc: 1, areaM2: 1, effectiveRainMm: 0, soilMoisturePercent: 90, mode: "hogar",
    });
    expect(plan.suggestedMm).toBe(1.2);
    expect(plan.explanation).toContain("vasos de 250 ml");
  });
});

describe("offline assistant", () => {
  it("includes safe structured guidance and professional referral", () => {
    const answer = offlineAnswer("¿Qué producto aplico para las manchas?", "agronomo", "Tomate");
    expect(answer).toContain("Diagnóstico probable");
    expect(answer).toContain("registro ICA");
    expect(answer).toContain("Certeza: baja");
  });
});
