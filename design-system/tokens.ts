/**
 * Inzivo design tokens — TypeScript module.
 * Mirrors Native/checkin-app/src/theme/{colors,typography,spacing}.ts
 * (the canonical "Inzivo Redesign" mobile theme) for use by the web
 * app or any other TS consumer. See BRAND.md for usage guidance.
 */

export const color = {
  background: "#FBF9F7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F1ED",
  border: "rgba(26,21,18,0.10)",

  primary: "#ef6c00",
  primaryDark: "#C25200",
  primaryMuted: "rgba(239,108,0,0.10)",
  primaryText: "#FFFFFF",
  primarySoftText: "#F7B27A",

  success: "#2E6F52",
  successMuted: "rgba(46,111,82,0.10)",
  warning: "#B8860B",
  warningMuted: "rgba(184,134,11,0.10)",
  danger: "#B3453F",
  dangerMuted: "rgba(179,69,63,0.10)",

  textPrimary: "#1A1512",
  textSecondary: "#86776F",
  textMuted: "#A0938B",
  textInverse: "#FFFFFF",

  panelDark: "#241E19",
  panelDarker: "#231D18",
  textOnDark: "#F7F3EF",
  textOnDarkMuted: "rgba(247,243,239,0.6)",

  overlay: "rgba(26,21,18,0.55)",
} as const;

export const typography = {
  fontFamily: "Inter",
  weight: { regular: 400, medium: 500, semiBold: 600, bold: 700 },
  h1: { fontSize: 28, fontWeight: 700 },
  h2: { fontSize: 22, fontWeight: 700 },
  h3: { fontSize: 18, fontWeight: 600 },
  body: { fontSize: 15, fontWeight: 400 },
  bodyStrong: { fontSize: 15, fontWeight: 600 },
  caption: { fontSize: 13, fontWeight: 400 },
  label: { fontSize: 13, fontWeight: 600 },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** xl (14) is the sheet/dialog corner radius — a distinct value from the
 * sm/md/lg card-and-button progression, not a step in it. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 14,
  full: 999,
} as const;

/** Primary actions are outlined, not filled — the only solid fill in the
 * palette is reserved for dark presence panels, not buttons. */
export const button = {
  minHeight: 50,
  variant: {
    primary: { background: "transparent", border: color.primary, text: color.primary },
    secondary: { background: color.surfaceMuted, border: "transparent", text: color.textPrimary },
    danger: { background: "transparent", border: color.danger, text: color.danger },
    ghost: { background: "transparent", border: "transparent", text: color.primary },
  },
} as const;

export type ColorToken = keyof typeof color;
