import { describe, expect, it } from "vitest";

import { LOCAL_RUNTIME_MIGRATIONS } from "@/src/data/local/runtimeMigrations";
import { LOCAL_MIGRATIONS } from "@/src/data/local/schema";

describe("local migration registries", () => {
  it("keeps static and runtime migration IDs aligned", () => {
    expect(LOCAL_MIGRATIONS.map((migration) => migration.id)).toEqual(
      LOCAL_RUNTIME_MIGRATIONS.map((migration) => migration.id),
    );
  });

  it("registers the Watch runtime completion migration statically", () => {
    expect(LOCAL_MIGRATIONS).toContainEqual({
      id: "007_watch_mode_runtime_completion",
      filename: "007_watch_mode_runtime_completion.sql",
    });
  });
});
