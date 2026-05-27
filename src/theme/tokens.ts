export const colors = {
  background: "#0C0C0C",
  edge: "#000000",
  card: "#0E0E0E",
  cardBorder: "#252525",
  bottomNav: "#0D0D0D",
  bottomNavBorder: "#1B1B1B",
  textPrimary: "#A7A7A7",
  textSecondary: "#949494",
  textMuted: "#757575",
  textDim: "#4A4A4A",
  glow: "#323232",
} as const;

export const spacing = {
  screenMargin: 20,
  titleOffset: 24,
  cardGap: 14,
  controlGap: 14,
  bottomNavInset: 19,
} as const;

export const typography = {
  title: {
    fontSize: 24,
    lineHeight: 24,
    letterSpacing: 0,
  },
  body: {
    fontSize: 14,
    lineHeight: 24,
    letterSpacing: 0,
  },
  label: {
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
  },
} as const;

export const radii = {
  card: 16,
  primaryPill: 39,
  secondaryPill: 36,
  bottomNav: 35,
} as const;

export const borders = {
  hairline: 1,
} as const;

export const shadows = {
  primaryGlow: "0 0 18px rgba(50, 50, 50, 0.85)",
} as const;
