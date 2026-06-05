import { describe, expect, it } from "vitest";

import {
  nativeRuntimeStartButtonLabel,
  runtimeStartLoadingLabel,
} from "@/src/features/sessions/runtimeStartLabels";

describe("runtime start labels", () => {
  it("uses mode-specific loading copy", () => {
    expect(runtimeStartLoadingLabel("phone")).toBe("Starting Phone Runtime...");
    expect(runtimeStartLoadingLabel("watch")).toBe("Watch Mode Disabled");
  });

  it("uses mode-specific native runtime button copy", () => {
    expect(
      nativeRuntimeStartButtonLabel({ mode: "phone", isStarting: false }),
    ).toBe("Start Native Phone Runtime");
    expect(
      nativeRuntimeStartButtonLabel({ mode: "watch", isStarting: false }),
    ).toBe("Watch Mode Disabled");
    expect(
      nativeRuntimeStartButtonLabel({ mode: "watch", isStarting: true }),
    ).toBe("Watch Mode Disabled");
  });
});
