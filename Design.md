# TOOV Design System

## Overview

TOOV's panel is built on a high-contrast, geometry-first design system — a white canvas for data-heavy pages paired with a permanent black sidebar, and a single Sunlight Yellow accent (`#ffed00`) reserved for the most consequential actions. The system is unapologetically sharp: square corners dominate, shadows are rare, and elevation is expressed through color blocking rather than blur.

Typography is monolithic. The entire interface uses **Manrope**, a geometric grotesque with tall x-heights and squared apexes that pairs naturally with the `< TOOV />` wordmark. Weight 700 at display sizes with a tight `line-height: 0.95`, weight 400 for body text — no secondary typeface, no decorative italic.

Page rhythm cycles between two surface modes: a **white catalogue mode** for listings, tables, and forms, and a **permanent black sidebar** that grounds every page in the brand. Yellow accent moments — primary CTAs, active nav indicators, user avatar chips — punctuate the otherwise neutral palette.

**Key Characteristics:**
- Two-tone layout — white (`#ffffff`) for content, black (`#000000`) for the sidebar, always.
- Single brand accent — Sunlight Yellow (`#ffed00`) — used on primary buttons, active nav, avatar, and the `/>`  logotype fragment.
- **Manrope everywhere**, with 700 weight display headlines at `line-height: 0.95`.
- Square geometry — `border-radius: 0` on cards and tiles, `2px` on buttons and inputs, `9999px` reserved exclusively for pill badges.
- No drop shadows on cards. Elevation is expressed via `1px solid` borders on white surfaces, and color-blocking (white card inside the white page — only the border reads).
- Sidebar always dark, content always light. No dark-mode toggle needed for the sidebar — it is always black.

---

## Colors

### Brand & Accent
- **Sunlight Yellow** (`#ffed00` — `hsl(56 100% 50%)`): the single brand accent. Reserved for primary CTAs, active nav left-border + background, the `/>`  logotype fragment, and the user avatar square. Never decorative.
- **Sunlight Yellow Pressed** (`#e6d200`): the active/pressed state of primary yellow elements.
- **On-Primary** (`#000000`): label color on top of yellow surfaces. Yellow always pairs with black text — never white.

### Light Surface (main content area)
- **Canvas** (`#ffffff`): the default page background and card surface.
- **Surface Soft** (`#f7f7f7`): subtle elevation step for grouped rows and muted backgrounds.
- **Hairline** (`#e5e5e5`): 1px dividers between rows on white surfaces.
- **Hairline Strong** (`#000000`): full-strength dividers and card outlines.

### Dark Surface (sidebar)
- **Sidebar** (`#000000`): the permanent sidebar background.
- **Sidebar Card** (`#111111`): inset sections inside the sidebar (firma selector, user area).
- **Sidebar Divider** (`rgba(255,255,255,0.12)`): low-contrast dividers inside the sidebar.

### Text — Light Mode
- **Ink** (`#111111`): primary text on white surfaces.
- **Body** (`#222222`): secondary body text in long paragraphs.
- **Mute** (`#666666`): supporting text, inactive labels, metadata.
- **Placeholder** (`#999999`): input placeholder text.

### Text — Dark Mode / Sidebar
- **On-Dark** (`#ffffff`): primary text on black surfaces.
- **On-Dark Mute** (`rgba(255,255,255,0.40)`): secondary text in dark regions.

### Semantic
- **Error** (`hsl(0 60% 50%)`): desaturated red for inline form errors.
- **Warning** (`#f0ad4e`): amber alert.
- **Success** (`#8dc572`): muted green confirmation.
- **Destructive foreground** (`#ffffff`): label on destructive backgrounds.

---

## Typography

### Font Family

The entire system is set in **Manrope**, a geometric grotesque from Google Fonts. It shares the geometric-with-warmth personality of Renault's proprietary NouvelR — tall x-heights, squared apexes, clean diagonals — and adapts cleanly to weights 400 / 600 / 700.

```
font-family: 'Manrope', sans-serif;
import: https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700
```

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `display-xl` | 56px | 700 | 0.95 | 0 | Login hero headline, marketing banners |
| `display-lg` | 40px | 700 | 0.95 | 0 | Empty-state headings, large section titles |
| `display-md` | 32px | 700 | 0.95 | 0 | Page-level H1 (dashboard hero metric) |
| `heading-lg` | 24px | 700 | 0.95 | 0 | Section headers, dialog titles |
| `heading-md` | 20px | 700 | 0.95 | 0 | Sub-section headers, card titles |
| `heading-sm` | 18px | 700 | 1.0 | 0 | Table column group headers |
| `body-lg` | 16px | 400 | 1.5 | 0 | Default body and form fields |
| `body-sm` | 14px | 400 | 1.57 | 0 | Captions, metadata, table cells |
| `button` | 14px | 700 | 1.0 | 0.5px | Button labels (uppercase) |
| `overline` | 10px | 700 | 1.45 | 2px+ | Section labels above titles (`text-[10px] font-bold uppercase tracking-widest`) |

### Principles
- Display sizes always weight 700, always `line-height: 0.95`. The tightness is the brand signature.
- Body copy stays at weight 400. The contrast between body and display drives visual hierarchy.
- Button labels use uppercase + a small positive letter-spacing. In Tailwind: `font-black uppercase tracking-wider`.
- Section labels (overlines) are the 10px uppercase tracking-widest pattern seen on the login page and sidebar labels.
- No italics. No script. No decorative ligatures.

---

## Layout

### Spacing System
Base unit: 4px. Working scale built on multiples of 4 and 8.

| Token | Value | Use |
|---|---|---|
| `xxs` | 4px | Icon internal padding, tight chip gaps |
| `xs` | 8px | Label-to-input gap, icon-to-text gap in nav |
| `sm` | 12px | Card inner padding (compact rows) |
| `md` | 16px | Default component padding |
| `lg` | 24px | Section sub-group gap |
| `xl` | 32px | Card internal padding |
| `xxl` | 48px | Section-to-section gap |
| `section` | 80px | Full-band vertical padding (login hero) |

### Grid & Container
- **Max content width**: 1440px. Content centered inside full-bleed bands.
- **Sidebar**: 256px fixed, always black, no collapse animation in production.
- **Main content**: fluid, `max-w-6xl` centered, `p-4 md:p-8` padding.
- **Card grids**: 1-col mobile → 2-col tablet → 3-col desktop for quote/invoice cards.
- **Form grids**: 2-col for pairs (date + currency), full-width for text areas.

### Whitespace Philosophy
- Whitespace is structural. Sections separated by color-blocking and `1px` borders rather than soft padding ramps.
- Inside tables and configurator rows, density is acceptable — this is a professional B2B tool.
- Hairline borders on white surfaces create catalogue precision.

---

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — flat | No border, no shadow | Page background, full-bleed bands |
| 1 — outline | `1px solid` border (`hsl(0 0% 88%)`) | Cards, table containers, inputs |
| 2 — strong outline | `1px solid #000` | Focused inputs, active elements |
| 3 — dark inversion | Black card inside white band | Sidebar, login left panel |

Drop shadows are absent from the system. The only depth is structural — border + color.

---

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `rounded-none` | 0px | Cards, table containers, tiles, banners, images |
| `rounded-sm` | 2px | Buttons, inputs, form controls, icon chips |
| `rounded-full` | 9999px | Pill badges only (status chips) |

### Rules
- Cards: always `rounded-none`. No exceptions.
- Buttons: `rounded-sm` (2px) via `@theme --radius: 2px`. Override to `rounded-none` for full-bleed or login CTAs.
- Inputs: `rounded-sm` (2px).
- Avatars / user chips: `rounded-sm` square (not circle — the system is geometric, not friendly-soft).
- Pill badges: `rounded-full` reserved for status labels (`rounded-full` is `9999px` in the scale).
- Nav items: `rounded-none` with a `border-l-2` left indicator in yellow for active state.

---

## Components

### Primary Button
- Background `#ffed00`, label `#000000`, weight 700, uppercase, `letter-spacing: 0.5px`
- Height `h-11` (44px) for form CTAs, `h-9` (36px) for compact CTAs
- `rounded-sm` (2px) by default, `rounded-none` for full-width/login buttons
- Pressed: `#e6d200`
- Disabled: 50% opacity
- Usage: the single most important action per page

### Outline Button
- `1px solid` border, transparent background, inherits text color
- Used for secondary actions alongside a primary CTA

### Ghost / Icon Button
- Transparent border, transparent background
- Used in table rows, card action bars, icon-only actions

### Card
- `rounded-none`, `1px solid` border (`hsl(0 0% 88%)`), white background, no shadow
- Hover: `box-shadow: 0 2px 8px rgba(0,0,0,0.06)` (subtle, not the default)

### Input / Textarea
- `rounded-sm`, `1px solid` border, `focus-visible:ring-1 focus-visible:ring-[#ffed00]`
- Height `h-9` default, `h-11` for prominent login/hero forms

### Badge
- `rounded-sm` for status badges, `rounded-full` for pill status chips
- Default (primary): yellow background + black text
- Secondary: muted background + foreground text
- Destructive: red background + white text
- Outline: transparent background + border

### Navigation Item (Sidebar)
- `rounded-none` with `border-l-2 border-transparent` default
- Active: `bg-primary text-primary-foreground border-l-primary` (yellow left bar + yellow fill + black text)
- Hover: `bg-sidebar-accent/80 border-l-primary/50`
- Icon: `h-4 w-4`, muted color when inactive, primary-foreground when active

### Sidebar
- Background: `#000000` always
- Top section: `< TOOV />` wordmark — `<` and `>` in `white/30`, `TOOV` in `white`, `/>` in `#ffed00`
- Bottom section: user avatar square (yellow background + black initials), name, role, logout icon
- Dividers: `1px solid rgba(255,255,255,0.12)`

### Overline Label
Pattern used above section titles and in sidebar labels:
```
text-[10px] font-bold uppercase tracking-widest text-{color}/40
```

### Tooltip
- `rounded-none`, black background (`bg-foreground`), white text (`text-background`)
- No yellow — tooltip is a utility, not a CTA

---

## The `< TOOV />` Logotype

The wordmark is always typeset in Manrope 700 (or 900 when available), never rasterized as an image:

```jsx
<span className="font-black tracking-tight">
  <span className="opacity-30">&lt;</span>
  <span className="mx-1.5">TOOV</span>
  <span className="text-[#ffed00]">/&gt;</span>
</span>
```

- On dark (sidebar, login left): `<` and `>` in `white/30`, `TOOV` in `white`, `/>` in `#ffed00`
- On light (any white surface): `<` in `black/20`, `TOOV` in `black`, `/>` in `#ffed00`
- Never place the logotype over a yellow background — contrast fails.
