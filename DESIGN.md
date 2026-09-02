---
name: DAJDA
description: Georgian sports analysis with a ledger nobody can edit. Dark by default, one accent for what you can press, colour only for how a bet resolved.
colors:
  night-ink: "#0a1017"
  slate-surface: "#121a24"
  lifted-slate: "#1a242f"
  hairline: "#24303d"
  rule: "#3a4a59"
  chalk: "#eaf0f6"
  chalk-muted: "#a7b7c6"
  chalk-faint: "#8ba0b1"
  on-chalk: "#0a1017"
  press-blue: "#7db3ec"
  press-blue-deep: "#a5cbf4"
  on-press-blue: "#0a1017"
  ember: "#ff7a3d"
  on-ember: "#1a0a00"
  pitch-green: "#4ec98d"
  brick-red: "#ff8b80"
  slate-pending: "#8ba0b1"
  paper-cool: "#e9eef4"
  paper: "#f7fafc"
  paper-shade: "#dde5ee"
  paper-hairline: "#cfd9e4"
  paper-rule: "#adbccd"
  navy-ink: "#0a2842"
  navy-ink-muted: "#4d5f70"
  navy-ink-faint: "#516979"
  on-navy-ink: "#ffffff"
  press-blue-day: "#25507d"
  press-blue-day-deep: "#1a3d63"
  ember-day: "#cc3e00"
  pitch-green-day: "#1c6b47"
  brick-red-day: "#b3261e"
typography:
  display:
    fontFamily: "Google Sans, 'BPG Arial', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.028em"
  headline:
    fontFamily: "Google Sans, 'BPG Arial', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Google Sans, 'BPG Arial', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Google Sans, 'BPG Arial', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Google Sans, 'BPG Arial', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  figure:
    fontFamily: "Google Sans, 'BPG Arial', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
rounded:
  card: "2px"
  control: "6px"
  panel: "10px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
  section: "36px"
components:
  button-primary:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.on-chalk}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.press-blue}"
    textColor: "{colors.on-press-blue}"
  button-secondary:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.lifted-slate}"
    textColor: "{colors.chalk}"
  button-danger:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.brick-red}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.chalk}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.chalk-muted}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.press-blue}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  badge-neutral:
    backgroundColor: "{colors.lifted-slate}"
    textColor: "{colors.chalk-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.card}"
    padding: "16px"
  nav-tab-active:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.chalk}"
    typography: "{typography.body}"
    padding: "0 12px"
    height: "48px"
---

# Design System: DAJDA

## Overview

**Creative North Star: "The Settled Ledger"**

DAJDA is a record book before it is a website. An author's bets are entries;
the site is the ruled page a reader runs a finger down to see how they did.
Everything in the system serves that reading: rows separated by hairlines
rather than boxed in cards, figures set on a fixed pitch so a column of odds
lines up on the decimal, dates written out to the minute, and colour held back
until there is a result to write. A win is entered in green and a loss in
brick, in the same weight as the text around them. Nothing is celebrated,
because the ledger's whole value is that it records the losses too.

The mood is quiet and dense: a lot of information per screen and very little
noise around it. Surfaces step up from the ground by a small change in value,
not by shadow or glow. One accent, a press blue, marks what can be pressed and
what is current, and it is never used on a result, so a reader can never
mistake "clickable" for "won". The interface opens dark, a navy-grey night
rather than black, with a light "paper" theme available by choice; both share
one set of token names, and every rule below holds in both.

The confirmed anti-reference is the neon accent on black that every bookmaker
and casino on the Georgian market wears. DAJDA is not one and its chrome must
not resemble one: no glow, no hot gradient, no saturated fill on an inactive
control, and colour that means an outcome rather than a mood.

**Key Characteristics:**
- Ruled, not boxed: lists divided by hairlines; a card is a page, not a tile.
- Colour is a verdict: green and brick only ever mean won and lost.
- One accent for the pressable; one hot ember for the single urgent count.
- One typeface for words and figures, with tabular numerals doing the work a
  monospace face used to.
- Radius carries meaning: near-square for records, rounder for controls,
  roundest for panels that sit on the page.
- Dark by default, light by choice, same rules in both.

## Colors

A navy-grey night with chalk text and one soft blue, or navy ink on cool paper; in both, green and brick are reserved for how a bet resolved.

### Primary
- **Press Blue** (#7db3ec, dark) / **Press Blue, day** (#25507d, light): the one accent. Links, the current nav item, the selected chip, the focus ring, text selection, the check in the brand mark. Never a result colour and never a fill on something that cannot be pressed. **Press Blue deep** (#a5cbf4 / #1a3d63) is its hover and active state.
- **Chalk** (#eaf0f6, dark) / **Navy Ink** (#0a2842, light): the darkest available text and, filled, the primary button. In light this is also the dark controls band above a list; in dark that band uses Lifted Slate instead, so a full-width bar never inverts into a white slab.

### Secondary
- **Ember** (#ff7a3d, dark) / **Ember, day** (#cc3e00, light): the single hot colour, used in exactly one place, the active-bets count badge, so that one urgent number reads as urgent. The reference orange was lowered until white numerals pass contrast on it.

### Tertiary
- **Pitch Green** (#4ec98d / #1c6b47): a won bet, positive profit, a success alert. Deliberately not the brand accent, because painting wins in the brand colour is what a bookmaker's interface does.
- **Brick Red** (#ff8b80 / #b3261e): a lost bet, negative profit, an error, a danger button's text. The only other saturated colour in the system.
- **Slate Pending** (#8ba0b1 / #516979): an unsettled bet's dot and chip. Grey on purpose: nothing has happened yet.

### Neutral
- **Night Ink** (#0a1017) / **Cool Paper** (#e9eef4): the page ground.
- **Slate Surface** (#121a24) / **Paper** (#f7fafc): cards, the header, inputs, the footer. Never pure white, even in light: the first pass was a wall of glare.
- **Lifted Slate** (#1a242f) / **Paper Shade** (#dde5ee): the step above a surface. Selected tabs, avatar discs, select controls, the controls band in dark, the ground a warning alert sits on.
- **Hairline** (#24303d / #cfd9e4): every divider and default border.
- **Rule** (#3a4a59 / #adbccd): the stronger border on inputs and dashed "provisional" outlines.
- **Chalk Muted** (#a7b7c6 / #4d5f70) and **Chalk Faint** (#8ba0b1 / #516979): secondary and tertiary text. Both are audited against the worst ground they land on (Lifted Slate or Paper Shade), not the best.

### Named Rules
**The Verdict Rule.** Green and brick mean won and lost and nothing else. A component that needs emphasis uses weight, size or the accent; it never borrows a result colour.

**The One Ember Rule.** Ember appears on the active-bets count and nowhere else. A second use would make the first one ordinary.

**The Worst Ground Rule.** Every text colour is checked for AA contrast against the darkest surface it can sit on, not against the page ground. This is how Chalk Faint got its value.

## Typography

**Display Font:** Google Sans (with 'BPG Arial', 'Segoe UI', system-ui)
**Body Font:** Google Sans (same family)
**Label/Mono Font:** none. Figures use the same family with tabular numerals.

**Character:** One UI face for everything, chosen because it is one of the few families with real Mkhedruli drawn as a typeface rather than a fallback. Headings get their presence from size and slightly tightened tracking, not from a heavier cut; the family stops at 700. Nothing is condensed, nothing is uppercase (Georgian has no case, so tracked caps only pull the letters apart).

### Hierarchy
- **Display** (700, 1.875rem to 3rem on large screens, line-height 1.12, tracking -0.028em): the page headline on a profile or a workspace. One per page.
- **Headline** (700, 1.5rem, tracking -0.015em): a page title in a task area, a queue heading.
- **Title** (700, 1.125rem to 1.25rem): a card header, a section inside a page.
- **Body** (400, 1rem, line-height 1.6): all reading text. Never below 16px for body, never below 12px for anything.
- **Label** (600, 0.75rem, Chalk Faint): the small label above a control or a chip row. Not tracked, not uppercase.
- **Figure** (600, tabular numerals via `font-feature-settings: 'tnum'`): every odds, date, count, amount and percentage. The `.tabular` class is the whole treatment.

### Named Rules
**The Tabular Rule.** Any number that could sit in a column is set with tabular numerals in the text face. A monospace face is never introduced for "technical" feel.

**The One Face Rule.** No second family, for headings or anything else. Hierarchy comes from size, weight and tracking.

## Layout

A single content column up to 96rem (`--container-page`), wider than a default framework container because the reference fills its viewport. Horizontal padding is 16px on phones and 24px to 32px above. Pages open with a header block (headline, one line of muted text) followed by sections separated by 32px to 36px; inside a section, rows are separated by hairlines and 16px of vertical padding, not by gaps between cards.

Density is high by intent: a feed row carries a thumbnail, title, author, odds, kickoff and status in two lines. Spacing follows a 4px base with the steps 4, 8, 16, 20, 24, 32 and 36px; tight inside a row, generous between sections.

Responsive behaviour is structural. Below 1024px the primary navigation moves to a fixed bottom tab bar with a drawer for everything visited once; tab strips and chip rows scroll sideways in one line rather than wrapping; a thumbnail-plus-text row stacks the thumbnails above the text; tables scroll inside their own container. Task drawers rise from the bottom as a sheet on a phone and take a right-hand column on a desktop. Every touch target is at least 44px tall.

## Elevation & Depth

Flat by default. Surfaces separate by a hairline border and a one-step change in background value: page ground, then surface, then lifted. A shadow appears only on something that genuinely floats above the page, a drawer, a modal or a menu. In the dark theme even that becomes a faint 1px light ring, because a drop shadow is invisible on a dark ground.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px rgba(10, 40, 66, 0.05), 0 12px 32px -12px rgba(10, 40, 66, 0.14)`, light theme): a floating panel. A hairline so the edge survives on a light ground, plus a wide soft drop tinted with the ink colour so it reads as shadow rather than grey haze.
- **Panel, dark** (`box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04)`): the same role in the dark theme, as a lifted edge rather than a glow.

### Named Rules
**The Floats-Only Rule.** Cards, rows and headers never carry a shadow at rest. If something has a shadow, it is because a reader can dismiss it.

## Shapes

Radius carries meaning. Surfaces that hold a record are near-square (2px): they are ruled tables. Controls are rounder (6px) because they are meant to be pressed. A panel is rounder still (10px): a piece of furniture on the page rather than a row of data. Chips, badges and avatars are pills. Borders are 1px hairlines; a dashed hairline means "provisional" (demo data, a small sample, a warning) and is the only decorative border in the system. Thumbnails are cropped to a fixed 4:3 frame. The brand mark is a ticket with a torn perforation and a check, and carries no coin, chip or card suit.

## Components

Character: tactile and confident. A control looks like a control, fills solidly when it is the main action, shows a visible press, and always clears 44px.

### Buttons
- **Shape:** control radius (6px), min height 44px, horizontal padding 20px at the default size, 14px small, 28px large.
- **Primary:** filled with the text colour (Chalk in dark, Navy Ink in light), text in the ground colour, semibold. The darkest available fill reads as the committed action and leaves the accent free to mean "link".
- **Hover / Focus:** hover and active swap the fill to Press Blue; focus draws a 2px accent outline offset 2px. Transitions run 150ms on colour only.
- **Secondary:** surface fill with a Rule border; hover darkens the border and lifts the background one step.
- **Ghost:** no border, muted text, hover lifts the background.
- **Danger:** surface fill, Brick text and a 35% Brick border; hover solidifies the border and tints the ground 5%.
- **Disabled:** 45% opacity, pointer events off.

### Chips
- **Style:** pill, 36px tall, 14px side padding, surface fill with a hairline border and muted text.
- **State:** selected chips gain a Press Blue border, a 10% Press Blue tint and a check mark; the check exists only when ticked so an untouched row does not read as an unfilled form. Directional chips write the active direction on the chip.
- **Badges:** the smaller pill (12px semibold text) for status. Neutral is Lifted Slate; win, loss and accent tones tint at 8% with a 30% border and the matching text colour; `warn` is a dashed Rule outline with no hue at all. A status badge always carries its Georgian label and a 6px dot.

### Cards / Containers
- **Corner Style:** card radius (2px).
- **Background:** Slate Surface (Paper in light) on the Night Ink ground.
- **Shadow Strategy:** none at rest; see Elevation.
- **Border:** 1px Hairline; an interactive card moves to Rule and lifts its ground on hover.
- **Internal Padding:** 16px on phones, 20px above; a card header sits in a 14px band with a hairline under it.

### Inputs / Fields
- **Style:** surface fill, 1px Rule border, control radius, 44px min height, 16px text, 12px side padding. Selects use the lifted ground and hide the native arrow.
- **Focus:** border turns Press Blue and the 2px accent outline appears.
- **Error / Disabled:** `aria-invalid` turns the border Brick and the field's error line appears in Brick below it with `role="alert"`; disabled sits at 50% opacity.
- **Label:** the label above is body weight 500 and the required mark is a Brick asterisk.

### Navigation
- **Desktop:** text links on a 68px header bar, current item marked by a 2px underline in the text colour and semibold weight; hover raises the text from muted to full. Secondary tab rows use the same underline at 48px, with a lifted-ground pill row beneath for sub-pages.
- **Mobile:** a fixed five-slot bottom tab bar with icon over a 10px label, current tab in Press Blue with a heavier stroke, and a drawer for everything visited once. The theme control is a two-segment radio group, selected segment filled with the text colour.

### Signature: the record row
The unit the whole product is built from. A 24 by 16 (or 4:3) thumbnail of the slip, a title in weight 500, a muted line of author, sport, odds and kickoff in tabular figures, and a status badge, separated from the next row by a hairline and 16px. A locked pick shows a sport glyph tile instead of the slip and a placeholder title; a settled one shows signed units in Pitch Green or Brick. Nothing in the row is a card.

## Do's and Don'ts

### Do:
- **Do** separate rows with a 1px Hairline and vertical padding; box them only when they are a panel a reader can dismiss.
- **Do** set every number in `.tabular` so columns align on the decimal.
- **Do** use Press Blue only on things that can be pressed or are current, and always as a link, border, tint or outline rather than a large fill.
- **Do** carry a Georgian label next to every status colour, so the result survives greyscale.
- **Do** fill the primary action with the text colour and swap to Press Blue on hover and press.
- **Do** keep every control at least 44px tall and give it hover, focus-visible, active and disabled states.
- **Do** define every colour in the light block of `globals.css` and only redefine it in the dark block; a token that exists in one theme only disappears in the other.
- **Do** check contrast against Lifted Slate or Paper Shade, the worst ground a colour lands on.

### Don't:
- **Don't** use a neon or saturated accent on a black ground, a glow, or a hot gradient anywhere. That is the bookmaker look the product exists to not be.
- **Don't** paint a win in the brand accent or use green and brick for anything but a result.
- **Don't** add a second typeface, a monospace face for figures, a condensed cut, or tracked uppercase labels.
- **Don't** put a shadow on a card or row at rest, or nest a card inside a card.
- **Don't** give avatars, sections or authors identity colours; initials on Lifted Slate are the whole treatment.
- **Don't** use pure white as a surface, in either theme.
- **Don't** use a padlock as the placeholder for a withheld pick; the sport glyph tile is the placeholder.
