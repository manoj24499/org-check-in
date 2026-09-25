# Inzivo brand & design system

This is the canonical design system for **Inzivo**, the employee check-in /
attendance platform. It's sourced directly from the shipped "Inzivo
Redesign" mobile theme (`Native/checkin-app/src/theme/`), the design system
with the most deliberate, documented decisions behind it.

**Known inconsistency, not yet fixed:** the web admin/kiosk app
(`app/globals.css` in this repo) currently runs a different, older palette
internally called "Nocturne" — a cooler blue-gray background (`#e8eaf2`)
and a slightly different orange (`#f06400` vs. mobile's `#ef6c00`). This
folder documents the **mobile theme as the target brand** the web app has
not yet been aligned to. Don't treat `app/globals.css`'s current values as
correct when building new UI — use the tokens here instead, and treat
reconciling the web app as a separate, explicit task.

## Identity

- **Name:** Inzivo
- **Mark:** the "Z-gate" — a top bar, a bottom bar, and an orange diagonal
  stroke connecting them (see [logo.svg](logo.svg)). The bars render in
  `textPrimary`/`currentColor` (adapts to light/dark), the diagonal is
  always the brand orange.
- **Animated build-in** (web only, `components/Logo.tsx` + `app/globals.css`):
  top bar slides in from the left, the diagonal wipes into view top-to-bottom,
  the bottom bar slides in from the right — ~1.1s, plays once, holds its
  settled state. Reserved for genuine once-per-view moments (a page hero),
  never for elements that remount often (headers/nav use the static mark).
- **Voice:** internal operational tool, not consumer-facing. Copy should be
  direct and functional (status, confirmations, errors) — no marketing tone.

## Color

| Token | Value | Use |
|---|---|---|
| `background` | `#FBF9F7` | App background |
| `surface` | `#FFFFFF` | Cards, sheets |
| `surfaceMuted` | `#F4F1ED` | Secondary-button fill, subtle panels |
| `border` | `rgba(26,21,18,0.10)` | Hairline borders |
| `primary` | `#ef6c00` | Brand orange — accents, outlined primary buttons, links |
| `primaryDark` | `#C25200` | Pressed/active state of primary |
| `primaryMuted` | `rgba(239,108,0,0.10)` | Orange-tinted background fills |
| `primarySoftText` | `#F7B27A` | Orange text legible on dark panels |
| `success` / `successMuted` | `#2E6F52` / 10% tint | Positive status |
| `warning` / `warningMuted` | `#B8860B` / 10% tint | Caution status |
| `danger` / `dangerMuted` | `#B3453F` / 10% tint | Errors, destructive actions |
| `textPrimary` | `#1A1512` | Primary text |
| `textSecondary` | `#86776F` | Secondary text |
| `textMuted` | `#A0938B` | Placeholder/disabled text |
| `panelDark` / `panelDarker` | `#241E19` / `#231D18` | Dark "presence" panels (dashboard hero, live map) — the *only* place solid fill is used |
| `textOnDark` / `textOnDarkMuted` | `#F7F3EF` / 60% opacity | Text on dark panels |
| `overlay` | `rgba(26,21,18,0.55)` | Modal/sheet scrims |

Every semantic color (`success`, `warning`, `danger`) pairs with a 10%-opacity
`*Muted` tint for its own background fill (e.g. a danger banner uses
`dangerMuted` background + `danger` text/icon) — never a fully-saturated fill.

## Typography

Inter, loaded via `@expo-google-fonts/inter` on mobile / `next/font` on web.
Weights: Regular (400), Medium (500), SemiBold (600), Bold (700).

| Style | Size | Weight |
|---|---|---|
| h1 | 28 | Bold |
| h2 | 22 | Bold |
| h3 | 18 | SemiBold |
| body | 15 | Regular |
| bodyStrong | 15 | SemiBold |
| caption | 13 | Regular |
| label | 13 | SemiBold |

## Spacing

4 / 8 / 16 / 24 / 32 / 48 (`xs`/`sm`/`md`/`lg`/`xl`/`xxl`). Use the scale, not
arbitrary pixel values — every shipped screen builds from these six steps.

## Radius

Flat, 8px as the default card/button corner (`sm`). `md` (12) and `lg` (16)
step up for larger surfaces. `xl` (14) is a **distinct** value reserved for
bottom sheets and blocking dialogs — not a step between `sm` and `lg`, so
don't read the scale as strictly ascending. `full` (999) is for pills/avatars.

## Buttons

**System rule: primary actions are outlined, not filled.** The only solid
color fill anywhere in the system is reserved for dark presence panels — not
buttons. This is a deliberate, documented choice in the shipped code
(`Button.tsx`), not an oversight.

| Variant | Background | Border | Text |
|---|---|---|---|
| primary | transparent | 1px `primary` | `primary` |
| secondary | `surfaceMuted` | none | `textPrimary` |
| danger | transparent | 1px `danger` | `danger` |
| ghost | transparent | none | `primary` |

Minimum tap target height: 50px.

## Files in this folder

- [tokens.json](tokens.json) — raw token values, language-agnostic
- [tokens.css](tokens.css) — CSS custom properties (`--inzivo-*`) for the web app
- [tokens.ts](tokens.ts) — TypeScript module, mirrors the mobile theme's shape
- [logo.svg](logo.svg) — static Z-gate mark
- [components/reference.html](components/reference.html) — visual reference sheet: buttons, cards, badges, inputs, typography scale, color swatches, rendered from the tokens above

## Do / don't

- **Do** reuse an existing token before reaching for a new color or size.
- **Do** pair a semantic color with its own `*Muted` tint for backgrounds.
- **Don't** fill a primary button — outline only.
- **Don't** introduce a new radius value outside `sm`/`md`/`lg`/`xl`/`full`.
- **Don't** copy `app/globals.css`'s current Nocturne values into new work —
  they're the known-divergent legacy palette, not the target.
