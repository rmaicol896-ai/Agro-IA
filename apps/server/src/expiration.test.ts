import { describe, expect, it } from "vitest";
import { isExpired, parseExpiration } from "./expiration.js";

describe("service expiration", () => {
  it("allows an unset deadline and remains available before the deadline", () => {
    expect(parseExpiration(undefined)).toBeUndefined();
    expect(isExpired(Date.parse("2026-11-30T22:02:21-05:00"), Date.parse("2026-11-30T22:02:20-05:00"))).toBe(false);
  });

  it("expires at the configured deadline and rejects invalid dates", () => {
    const deadline = parseExpiration("2026-11-30T22:02:21-05:00");
    expect(isExpired(deadline, deadline)).toBe(true);
    expect(() => parseExpiration("not-a-date")).toThrow("SERVICE_EXPIRES_AT");
  });
});
