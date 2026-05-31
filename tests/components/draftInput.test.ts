import { describe, expect, it } from "vitest";

import {
  isFiniteNumberDraft,
  isNumberRangeDraft,
  parseFiniteNumberDraft,
  parseNumberRangeDraft,
} from "@/src/components/ui/draftInput";

describe("draft input parsing", () => {
  it("accepts finite number drafts", () => {
    expect(parseFiniteNumberDraft("7")).toBe(7);
    expect(parseFiniteNumberDraft(" 0.25 ")).toBe(0.25);
    expect(parseFiniteNumberDraft("0.")).toBe(0);
  });

  it("rejects empty, partial, and invalid number drafts", () => {
    expect(isFiniteNumberDraft("")).toBe(false);
    expect(isFiniteNumberDraft(" ")).toBe(false);
    expect(isFiniteNumberDraft(".")).toBe(false);
    expect(isFiniteNumberDraft("abc")).toBe(false);
  });

  it("accepts complete number range drafts", () => {
    expect(parseNumberRangeDraft("20-40")).toEqual([20, 40]);
    expect(parseNumberRangeDraft(" 20.5 - 40.25 ")).toEqual([20.5, 40.25]);
  });

  it("rejects empty, partial, and invalid range drafts", () => {
    expect(isNumberRangeDraft("")).toBe(false);
    expect(isNumberRangeDraft("300-")).toBe(false);
    expect(isNumberRangeDraft("-400")).toBe(false);
    expect(isNumberRangeDraft("300")).toBe(false);
    expect(isNumberRangeDraft("300-400-500")).toBe(false);
    expect(isNumberRangeDraft("300-fast")).toBe(false);
  });
});
