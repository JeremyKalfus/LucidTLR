import { describe, expect, it } from "vitest";

import {
  nativeRuntimeStartButtonLabel,
  runtimeStartLoadingLabel,
} from "@/src/features/sessions/runtimeStartLabels";

describe("runtime start labels", () => {
  it("uses mode-specific loading copy", () => {
    expect(runtimeStartLoadingLabel("phone")).toBe("Starting Phone Runtime...");
    expect(runtimeStartLoadingLabel("watch")).toBe("Starting Watch Runtime...");
  });

  it("uses mode-specific native runtime button copy", () => {
    expect(
      nativeRuntimeStartButtonLabel({ mode: "phone", isStarting: false }),
    ).toBe("Start Native Phone Runtime");
    expect(
      nativeRuntimeStartButtonLabel({ mode: "watch", isStarting: false }),
    ).toBe("Start Native Watch Runtime");
    expect(
      nativeRuntimeStartButtonLabel({ mode: "watch", isStarting: true }),
    ).toBe("Starting Watch Runtime...");
  });
});
