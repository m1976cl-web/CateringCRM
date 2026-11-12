import { describe, expect, it } from "vitest";
import { statusLabel, statusTone } from "./eventStatus";
import { EVENT_STATUSES, EVENT_STATUS_LABELS } from "./types";

describe("estado del evento", () => {
  it("usa las etiquetas compartidas", () => {
    for (const status of EVENT_STATUSES) {
      expect(statusLabel(status)).toBe(EVENT_STATUS_LABELS[status]);
    }
  });

  it("asigna el tono de cada estado", () => {
    expect(statusTone("borrador")).toBe("neutral");
    expect(statusTone("cotizado")).toBe("info");
    expect(statusTone("confirmado")).toBe("good");
    expect(statusTone("realizado")).toBe("neutral");
    expect(statusTone("cancelado")).toBe("danger");
  });
});
