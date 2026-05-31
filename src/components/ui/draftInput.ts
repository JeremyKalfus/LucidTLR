export function parseFiniteNumberDraft(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

export function isFiniteNumberDraft(value: string): boolean {
  return parseFiniteNumberDraft(value) !== null;
}

export function parseNumberRangeDraft(
  value: string,
): readonly [number, number] | null {
  const parts = value.split("-");

  if (parts.length !== 2) {
    return null;
  }

  const min = parseFiniteNumberDraft(parts[0]);
  const max = parseFiniteNumberDraft(parts[1]);

  if (min === null || max === null) {
    return null;
  }

  return [min, max];
}

export function isNumberRangeDraft(value: string): boolean {
  return parseNumberRangeDraft(value) !== null;
}
