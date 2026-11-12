import { describe, expect, it } from "vitest";
import { isInLocalWeek, isRepeatInterval, shiftEventDate, startOfLocalWeek } from "./eventSeries";

describe("repetición de eventos", () => {
  it("solo acepta los intervalos conocidos", () => {
    expect(isRepeatInterval("weekly")).toBe(true);
    expect(isRepeatInterval("biweekly")).toBe(true);
    expect(isRepeatInterval("monthly")).toBe(true);
    expect(isRepeatInterval("daily")).toBe(false);
  });

  it("desplaza semanas y conserva la hora UTC", () => {
    const iso = "2026-11-12T15:00:00.000Z";
    expect(shiftEventDate(iso, "weekly", 0)).toBe(iso);
    expect(shiftEventDate(iso, "weekly", 1)).toBe("2026-11-19T15:00:00.000Z");
    expect(shiftEventDate(iso, "weekly", -1)).toBe("2026-11-05T15:00:00.000Z");
    expect(shiftEventDate(iso, "biweekly", 2)).toBe("2026-12-10T15:00:00.000Z");
    expect(shiftEventDate("no-es-fecha", "weekly", 1)).toBe("no-es-fecha");
  });

  it("un mes desde el 12 cae el 12 y el 31 de enero desborda a marzo", () => {
    expect(shiftEventDate("2026-11-12T15:00:00.000Z", "monthly", 1)).toBe("2026-12-12T15:00:00.000Z");
    expect(shiftEventDate("2026-01-31T12:00:00.000Z", "monthly", 1)).toBe("2026-03-03T12:00:00.000Z");
  });
});

describe("semana local", () => {
  const thursday = new Date("2026-11-12T15:00:00.000Z");

  it("empieza el lunes", () => {
    expect(startOfLocalWeek(thursday).toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(startOfLocalWeek(new Date("2026-11-15T10:00:00.000Z")).toISOString()).toBe(
      "2026-11-09T00:00:00.000Z",
    );
    expect(startOfLocalWeek(new Date("2026-11-09T00:00:00.000Z")).toISOString()).toBe(
      "2026-11-09T00:00:00.000Z",
    );
  });

  it("incluye desde el lunes y excluye el lunes siguiente", () => {
    expect(isInLocalWeek("2026-11-09T00:00:00.000Z", thursday)).toBe(true);
    expect(isInLocalWeek("2026-11-15T23:59:00.000Z", thursday)).toBe(true);
    expect(isInLocalWeek("2026-11-16T00:00:00.000Z", thursday)).toBe(false);
    expect(isInLocalWeek("2026-11-08T23:00:00.000Z", thursday)).toBe(false);
    expect(isInLocalWeek("no-es-fecha", thursday)).toBe(false);
  });
});
