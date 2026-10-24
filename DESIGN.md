---
name: CBT Hospitality Supplies · Sales
description: The back-office sales sheet for CBT Hospitality Supplies; every sale, exact to the cent, in the company's own colors.
colors:
  cbt-blue: "oklch(0.45 0.17 263)"
  cbt-blue-deep: "oklch(0.39 0.16 263)"
  cbt-blue-wash: "oklch(0.95 0.025 263)"
  cbt-blue-ink: "oklch(0.36 0.14 263)"
  harbor-navy: "oklch(0.32 0.075 248)"
  ledger-ink: "oklch(0.25 0.03 264)"
  ledger-ink-soft: "oklch(0.41 0.025 264)"
  ledger-ink-faint: "oklch(0.5 0.02 264)"
  paper: "oklch(0.997 0.002 264)"
  paper-shade: "oklch(0.962 0.007 264)"
  paper-fold: "oklch(0.93 0.011 264)"
  desk: "oklch(0.982 0.004 264)"
  canopy-green: "oklch(0.47 0.09 150)"
  canopy-wash: "oklch(0.95 0.03 150)"
  amber-check: "oklch(0.47 0.1 65)"
  amber-wash: "oklch(0.96 0.045 85)"
  coral-alert: "oklch(0.52 0.17 35)"
  coral-wash: "oklch(0.96 0.03 35)"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  figure-lead:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  column-head:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.4
  code:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.9em"
    fontWeight: 400
    letterSpacing: "-0.01em"
rounded:
  badge: "4px"
  control: "8px"
  surface: "12px"
  round: "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "8": "48px"
components:
  button-primary:
    backgroundColor: "{colors.cbt-blue}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.cbt-blue-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ledger-ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-shade}"
  button-ghost:
    textColor: "{colors.ledger-ink-soft}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.coral-alert}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  icon-button:
    textColor: "{colors.ledger-ink-soft}"
    rounded: "{rounded.control}"
    size: "40px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ledger-ink}"
    typography: "{typography.data}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ledger-ink-soft}"
    typography: "{typography.data}"
    rounded: "{rounded.surface}"
  sheet-column-head:
    backgroundColor: "{colors.paper-shade}"
    textColor: "{colors.ledger-ink-soft}"
    typography: "{typography.column-head}"
    padding: "11px 16px"
  badge-ai:
    backgroundColor: "{colors.cbt-blue-wash}"
    textColor: "{colors.cbt-blue-ink}"
    rounded: "{rounded.badge}"
    padding: "1px 6px"
  attention-list:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ledger-ink-soft}"
    rounded: "{rounded.surface}"
    padding: "12px 16px"
  review-note:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-check}"
    rounded: "{rounded.control}"
    padding: "16px"
---

# Design System: CBT Hospitality Supplies · Sales

## 1. Overview

**Creative North Star: "The Supply Room Ledger"**

This is the ledger kept in the back room of a wholesale supply company: exact figures in tidy columns, written in the company's own blue ink, on paper that never competes with the numbers. The owner sits down at a desk at the start or end of the day, reads what sold, settles anything that needs them, and closes the book. Every visual decision serves that ten-minute routine. The interface is calm until something needs a decision, then says so plainly.

The system is restrained by doctrine. Paper and ink carry almost every screen; CBT blue appears only where the owner acts or has selected something; amber, coral and the logo's canopy green are reserved for states (to check, a problem, all good). Density is a working ledger's density: sixteen columns are fine, small type is not. Motion is limited to state changes and the three approved Magic UI effects, each of which must stand down for people who turn motion off.

It explicitly rejects what PRODUCT.md names: "Generic AI-generated SaaS dashboards: purple gradients, glass cards, giant hero metrics with sparkline confetti", "Busy 'growth' analytics tools that shout with color and motion", "Dense developer tools that assume keyboard shortcuts and technical vocabulary", and "Anything that makes a draft or warning look like an error the owner caused."

Layout follows one predictable column on a 1680px maximum: header, title line, figures row, attention list (only when needed), filters, then the sheet with breakdowns beside it (stacked below at 1200px and under). At 640px and under, everything stacks and the header keeps only icons.

**Key Characteristics:**
- Paper-and-ink neutrals tinted toward CBT blue (hue 264); never pure white or black.
- One action color: CBT blue, matched to the website's `#1346AF`.
- Numbers in tabular figures, right-aligned, never rounded, never hidden.
- Hairline rules instead of boxes; cards only where a group must read as one unit.
- 16px base text, 15px in the sheet, 40px controls: easy to read in bright stockroom light.
- Motion conveys state; the three approved Magic UI effects are the only flourishes.

## 2. Colors

A ledger palette: blue-tinted paper and ink, one company blue for action, and three state colors borrowed from the CBT logo and website.

### Primary
- **CBT Blue** (oklch(0.45 0.17 263), matched to the website's #1346AF): primary buttons (Download Excel, Save, Read and fill in), keyboard focus outlines, selected rows, breakdown bars, Magic UI highlight color. Nothing else.
- **CBT Blue Deep** (oklch(0.39 0.16 263)): hover and pressed state of CBT Blue only.
- **CBT Blue Wash** (oklch(0.95 0.025 263)): row hover, AI badge background, focused dropzone. A tint, never a fill for text-heavy areas.
- **Harbor Navy** (oklch(0.32 0.075 248), from the website's #0D3B66): the company name, the lead "Total sales" figure, a panel's total line. The "this is ours" color.

### Tertiary (states)
- **Canopy Green** (oklch(0.47 0.09 150), the logo's leaves): "all good" only: the live dot when website orders are flowing, saved results, "Reviewed".
- **Amber Check** (oklch(0.47 0.1 65)) on **Amber Wash** (oklch(0.96 0.045 85)): "worth a second look": review flags, held drafts, the reason line on a draft. Never an error.
- **Coral Alert** (oklch(0.52 0.17 35), from the website's coral) on **Coral Wash** (oklch(0.96 0.03 35)): real problems and destructive actions: connection failures, field errors, Delete and Discard.

### Neutral
- **Ledger Ink** (oklch(0.25 0.03 264)): primary text and figures (15.8:1 on paper).
- **Ledger Ink Soft** (oklch(0.41 0.025 264)): secondary text, column heads, field labels (8.8:1).
- **Ledger Ink Faint** (oklch(0.5 0.02 264)): hints, timestamps, empty states (6.0:1). The lightest text allowed anywhere.
- **Paper** (oklch(0.997 0.002 264)): the sheet, header, panels, inputs.
- **Paper Shade** (oklch(0.962 0.007 264)): column heads, segmented-control track, total line.
- **Paper Fold** (oklch(0.93 0.011 264)): bar tracks and skeleton blocks.
- **Desk** (oklch(0.982 0.004 264)): the page behind everything.
- **Rules**: Ledger Ink at 10% (hairlines) and 18% (control borders, sheet edge).

### Named Rules
**The Blue Ink Rule.** CBT Blue marks what the owner can act on or has selected, and nothing else. If a screen shows CBT Blue on more than one primary button, one of them is wrong.

**The Amber Is Not Red Rule.** Drafts and review flags are amber, never coral. Coral means something failed or will be destroyed. A held AI draft is the system being careful, not the owner making a mistake.

**The 4.5 Floor Rule.** No text below 4.5:1 contrast. Ledger Ink Faint is the floor; anything lighter is decoration and must not carry words.

## 3. Typography

**Body Font:** the device's UI font (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`); Segoe UI on the owner's Windows machines matches the website's headings.
**Label/Mono Font:** IBM Plex Mono for invoice numbers, SKUs and pasted source text.

**Character:** one familiar sans for everything, so the tool disappears into the work; a quiet monospace only where characters must line up for checking against paper.

### Hierarchy
- **Headline** (650, 1.75rem, 1.15): the page title ("Sales", "Sales to double-check"). One per screen.
- **Figure Lead** (600, 1.875rem, 1.15, tabular): "Total sales" only. The other four figures use 600 at 1.375rem.
- **Title** (650, 1.375rem, 1.2): panel headings (an invoice number, "Add sales from anything").
- **Body** (400, 1rem, 1.5): sentences, attention items, help text (max 62ch).
- **Data** (400, 0.9375rem, 1.5, tabular): the sheet, breakdowns, form fields.
- **Label** (600, 0.875rem): field labels, figure names, section legends (legends at 650, 0.9375rem).
- **Column Head** (650, 0.8125rem): sheet column headings, sentence case.
- **Code** (Plex Mono 400, 0.9em): invoice numbers and SKUs.

### Named Rules
**The No Tiny Capitals Rule.** Labels are sentence case at 13px or larger. Letter-spaced all-caps micro labels are prohibited: they are the hardest text to read and the most AI-generated-looking.

**The Tabular Money Rule.** Every money and count value uses `font-variant-numeric: tabular-nums` and is right-aligned in columns, so cents line up down the page like a ledger.

## 4. Elevation

Flat by default. Depth comes from paper tones and hairline rules, not shadows: the header is separated by a 1px rule, the figures row by rules above and below, the sheet by a 1px edge. Shadows exist in only two places, both functional.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px oklch(0.25 0.03 264 / 0.05), 0 2px 8px oklch(0.25 0.03 264 / 0.04)`): the active tab in a segmented control. Says "this is the selected or standalone thing".
- **Panel** (`box-shadow: 0 2px 6px oklch(0.25 0.03 264 / 0.08), 0 18px 48px oklch(0.25 0.03 264 / 0.16)`): side panels sliding over the sheet, with a 32% ink scrim behind.

### Named Rules
**The Hairline Rule.** Group with a 1px rule or spacing before reaching for a box, and a box before a shadow. Nested boxes are prohibited.

## 5. Components

Familiar, sturdy, and the same everywhere: the owner should never wonder whether two buttons do the same kind of thing. Each entry below is also the **usage map**: where the component lives in this codebase, the shadcn/ui primitive it corresponds to (Magic UI is built on shadcn/ui and supplies effects, not primitives), the approved Magic UI effect if any, and the react.dev pattern behind it.

### Buttons
- **Shape:** gently rounded (8px), 40px tall, 15px semibold label, icon 16px at 1.75 stroke, 8px gap.
- **Primary:** CBT Blue fill, paper text. One per screen or panel. Used for: Download Excel (`app/dashboard/sales-dashboard.tsx:139`), Save changes / Save to sheet (`app/dashboard/sale-form-drawer.tsx:241`), Read and fill in (`app/dashboard/ai-import.tsx:126`), Sign in (`app/login/login-form.tsx:29`).
- **Secondary:** paper fill, 1px ink-18% inset edge. Supporting actions: Import with AI (`sales-dashboard.tsx:135`), Check drafts (`:185`), Review them / Show all sales (`:200`), Clear filters in empty state (`:333`), Mark as reviewed (`app/dashboard/edit-drawer.tsx:77`), Check the drafts (`ai-import.tsx:157`), Try again (`app/dashboard/woo-status.tsx:89`).
- **Ghost:** no fill, soft ink; paper-shade on hover. Quiet exits: Cancel and Keep (`sale-form-drawer.tsx:238`, `:226`), Clear filters (`sales-dashboard.tsx:244`), Retry (`:254`).
- **Danger:** a two-step pattern. The quiet coral trigger (`sale-form-drawer.tsx:233`) reveals an inline confirm row with the solid coral button (`:223`). Never a single-click delete.
- **Icon button:** 40px square, soft ink, paper-shade hover; always has `aria-label` and `title`. Close (`ai-import.tsx:27`, `sale-form-drawer.tsx:161`), Previous/Next page (`sales-dashboard.tsx:350`, `:353`), Check website orders now (`woo-status.tsx:62`).
- **Hover / Focus / Pressed:** 150ms color change on ease-out-quart; a 2px CBT Blue focus outline offset 2px; pressed nudges down 1px. Disabled is 55% opacity, no pointer.
- **Built from:** shadcn/ui `Button` (variants `default`, `outline`, `ghost`, `destructive`, size `icon`).
- **Magic UI:** none. Shimmer, Rainbow, Pulsating, Ripple, Shiny and Interactive Hover buttons are prohibited here.
- **React pattern:** [Responding to Events](https://react.dev/learn/responding-to-events); pending labels ("Saving…", "Checking…") come from the same state that disables the button.

### Inputs / Fields
- **Style:** paper fill, 1px ink-18% border, 8px radius, 40px tall, 15px text, label above at Label weight.
- **Focus:** border turns CBT Blue plus a 3px CBT Blue 35% ring. Never removed.
- **Error / Disabled:** coral border and a coral message under the field (`field-error`), written as what to do ("Must be a US zip code (12345 or 12345-6789)").
- **Used in:** every sale field via the `input()` and `select()` helpers (`sale-form-drawer.tsx:119`, `:133`), import text and link (`ai-import.tsx:101`, `:114`), the filters bar (below).
- **Built from:** shadcn/ui `Input`, `Label`, `Select`, `Textarea`, `Form` message pattern.
- **Magic UI:** none.
- **React pattern:** controlled fields per [`<input>`](https://react.dev/reference/react-dom/components/input), [`<select>`](https://react.dev/reference/react-dom/components/select) and [`<textarea>`](https://react.dev/reference/react-dom/components/textarea); the login form uses [`useActionState`](https://react.dev/reference/react/useActionState) with a [`<form action>`](https://react.dev/reference/react-dom/components/form) server function; the first field is focused through a ref ([Manipulating the DOM with Refs](https://react.dev/learn/manipulating-the-dom-with-refs), `sale-form-drawer.tsx:77`).

### Navigation (header)
- **Style:** a 64px paper bar, sticky, with a 1px rule. Left: the round CBT logo (36px, loaded from the company website via `lib/brand.ts`) with the company name in Harbor Navy and "Sales" in faint ink. Right: Import with AI, Download Excel, Log out.
- **Website orders indicator** (`woo-status.tsx:53`, placed at `sales-dashboard.tsx:133`): canopy-green dot with a 3px wash halo, "Website orders checked 2 min ago", and a refresh icon button. It appears only while the connection is healthy; problems move to the attention list instead.
- **Mobile:** the company name truncates with an ellipsis; buttons become icon-only but keep their `aria-label`.
- **Built from:** a plain `header` with shadcn/ui `Button`s; no navigation menu is needed for one screen.
- **React pattern:** connection state comes from the custom hook `useWooStatus` ([Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks), `woo-status.tsx:19`), shared by the indicator and the attention row so the status is fetched once.

### Figures Row (signature)
- **Style:** five figures on the desk background between two hairlines, separated by vertical hairlines, never cards. "Total sales" leads in Harbor Navy at Figure Lead size; Invoices, Average sale, Discounts given and Sales tax follow at 1.375rem. While loading, each value is a pulsing Paper Fold block.
- **Used in:** `sales-dashboard.tsx:157`. Reflows to 3 then 2 columns (`dashboard.module.css`, 900px and 640px).
- **Built from:** a semantic `dl`; no shadcn/ui card.
- **Magic UI (approved): Number Ticker.** Use only to move a figure from its previous value to its new value when filters change, by passing `startValue` (the last shown value) and `decimalPlaces={2}` for money; the "$" sits outside the ticker because the component formats a plain `en-US` number. Never animate from 0 on page load. Use a near-critically damped spring (stiffness 170, damping 26) so the exact figure lands in under a second; Magic UI's default (damping 60, stiffness 100) shows wrong cents for 5 to 6 seconds. Its source does not check for reduced motion: wrap it so that under `prefers-reduced-motion: reduce` the final value renders directly. Give the figure an `aria-label` with the exact final amount, because the ticker writes intermediate numbers into the page. Adds the `motion` package.
- **React pattern:** values are derived during render from `summary` rather than kept in separate state ([You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)).

### Needs Your Attention (signature)
- **Style:** one paper panel with a 1px ink-18% edge and 12px radius, titled "Needs your attention", holding only what currently needs the owner. Rows are separated by hairlines: an 18px state icon (CBT Blue for AI drafts, Amber for review flags, Coral or faint ink for website orders), a bold first clause, a plain explanation, and one secondary button. The whole panel disappears when nothing is waiting.
- **Used in:** `sales-dashboard.tsx:173` (drafts row `:177`, review row `:191`), website-orders row `woo-status.tsx:70` (`WooAttention`).
- **Built from:** shadcn/ui `Alert` content pattern inside a list; deliberately not three stacked alerts.
- **Magic UI:** none. Animated List was considered and rejected: it shows one row per second and reverses their order, which delays information the owner came to read.
- **React pattern:** [Conditional Rendering](https://react.dev/learn/conditional-rendering); each row renders only when its count is above zero.

### Filters Bar
- **Style:** search field (max 440px, 17px search icon inset), Category and Sales rep selects (min 170px), a From/to date pair, and a ghost "Clear filters" that appears only when a filter is set. The title line reports the active filters in words ("Showing Kitchen · Oct 1, 2026 to today").
- **Used in:** `sales-dashboard.tsx:214` (search `:215`).
- **Built from:** shadcn/ui `Input`, `Select`, and a date `Input` (shadcn `Calendar`/`Popover` would be the upgrade path).
- **React pattern:** filters live in the dashboard component and flow down as props ([Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)); the search text is debounced by the custom hook `useDebounced` (`sales-dashboard.tsx:48`; [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue) is the built-in alternative); the request string is memoized with [`useMemo`](https://react.dev/reference/react/useMemo).

### The Sheet (signature)
- **Style:** a paper table with a 1px ink-18% edge and 12px radius. Column heads sit on Paper Shade, sticky to the top; the Invoice column is frozen on the left with a hairline. Rows are 15px Data text with 11px vertical padding, hairline separated; numbers right-aligned and tabular; customer and email cells cut at 260px with an ellipsis and the full text on hover. Hover tints the row CBT Blue Wash; keyboard focus adds a 2px CBT Blue inset outline; Enter or click opens the row.
- **Row markers:** the **AI badge** (Code-sized caps on CBT Blue Wash, 4px radius, `sales-dashboard.tsx:298`) for sales entered by AI import, and the **review flag** (amber triangle with an `aria-label` naming the reasons, `:303`).
- **Empty and loading:** "No sales match these filters." with a Clear filters button, or "No sales yet…" (`:329`); a dimmed table while refreshing, never a spinner over content.
- **Pager:** "1–50 of 119" in faint ink with previous/next icon buttons (`:345`).
- **Used in:** `sales-dashboard.tsx:263`.
- **Built from:** shadcn/ui `Table` (with the Data Table / TanStack pattern as the upgrade path for column sorting).
- **Magic UI (approved): Text Highlighter.** Only for marking the search match inside the cell that matched, with `action="highlight"`, `color` set to CBT Blue Wash, `iterations={1}`, a short `animationDuration`, and only on the 50 visible rows. Under reduced motion, render a plain `<mark>` in the same color. Each highlight draws its own annotation (the component uses `rough-notation`), so never highlight whole rows or every column. Adds the `motion` and `rough-notation` packages.
- **React pattern:** rows rendered from data with stable `key={row.id}` ([Rendering Lists](https://react.dev/learn/rendering-lists)); the fetch effect aborts stale requests with an `AbortController` (`sales-dashboard.tsx:82`; [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)).

### Breakdowns
- **Style:** three headed lists (By sales rep, By category, By month) beside the sheet: name and amount on one line, a 6px CBT Blue bar on a Paper Fold track, the invoice count in faint ink.
- **Used in:** `Breakdown` at `sales-dashboard.tsx:388`, placed at `:362`, `:363`, `:364`.
- **Built from:** plain lists; shadcn/ui `Progress` is the equivalent bar.
- **Magic UI:** none.
- **React pattern:** one component reused with different props ([Passing Props to a Component](https://react.dev/learn/passing-props-to-a-component)).

### Side Panels
- **Style:** a 540px paper panel sliding 16px in from the right over a 32% ink scrim (220ms ease-out-quart; scrim fades in 150ms), with a header (faint eyebrow, Title heading, close icon button), a scrolling body, and a footer that keeps the destructive action on the left and Cancel + primary on the right. Escape and clicking the scrim close it.
- **Sale form** (`SaleFormDrawer`, `sale-form-drawer.tsx:51`): four fieldsets (Sale, Product, Amounts, Customer); the Amounts group ends in a **total line** (Paper Shade, total in Harbor Navy, `:195`) that recalculates as the owner types. Used by **Edit sale** (`edit-drawer.tsx:42`) and **AI draft** (`ai-import.tsx:215`), so both read and behave identically.
- **Review note** (`edit-drawer.tsx:66`, `ai-import.tsx:238`): Amber Wash block listing why a sale was flagged or held, with the AI's note, the source, and "Show what the AI read"; turns Canopy Wash with a check once reviewed.
- **Panel shell** (`Panel`, `ai-import.tsx:13`): the same frame for Import with AI (`:78`) and the AI drafts list (`:263`).
- **Built from:** shadcn/ui `Sheet` (side="right"), `Collapsible` for the source excerpt.
- **Magic UI (approved): Blur Fade.** Only on the content that arrives after an action inside a panel: the import results list and the drafts list. Use `direction="up"`, a small `offset`, a duration of about 0.2s, and per-item `delay` under 0.05s; never on the panel itself, the form, or anything present when the panel opens. Its source ignores reduced motion: wrap it to render children directly under `prefers-reduced-motion: reduce`. Adds the `motion` package.
- **React pattern:** the form keeps its own field state seeded from props and remounts per sale ([Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state)); save and delete callbacks come in as props so one form serves two flows.

### Import with AI (inside a panel)
- **Segmented control** (`ai-import.tsx:84`): Paste text / Upload file / Link on a Paper Shade track; the active segment lifts onto Paper with the Lift shadow. Built from shadcn/ui `Tabs`.
- **Dropzone** (`:107`): dashed 1.5px rule, 12px radius, the whole area clickable; tints CBT Blue Wash on hover and focus.
- **Results** (`:133`): one row per sale found, Canopy Wash for "Saved to the sheet" or "Already in the sheet", Amber Wash for "Held as a draft" with its reasons, then one secondary button to check the drafts. Blur Fade is approved here (see Side Panels).
- **Draft cards** (`:272`): the one place cards are used, because each draft is a separate decision: invoice and total on top, customer and SKU, the first reason in amber, the source in faint ink; CBT Blue edge and wash on hover.


## 6. Do's and Don'ts

### Do:
- **Do** keep CBT Blue (oklch(0.45 0.17 263)) to primary buttons, focus, selection and breakdown bars: one primary button per screen or panel.
- **Do** use the shadcn/ui primitive named in Components for any new control, restyled with these tokens, before writing a custom one.
- **Do** show every amount exactly, with cents, in tabular figures, right-aligned.
- **Do** say where each sale came from: the AI badge in the sheet, the Source column in the Excel download, the source line on drafts.
- **Do** put anything that needs the owner into the "Needs your attention" list as one row with one button, and remove the row when it's resolved.
- **Do** wrap every Magic UI effect so it renders the final state under `prefers-reduced-motion: reduce`; none of the three approved components does this on its own.
- **Do** keep text at 13px or larger and at 4.5:1 contrast or better (Ledger Ink Faint is the floor).
- **Do** give icon-only buttons an `aria-label` and pair every color meaning with an icon or words.

### Don't:
- **Don't** build "Generic AI-generated SaaS dashboards: purple gradients, glass cards, giant hero metrics with sparkline confetti." No figures in colored cards, no gradient text, no backdrop blur.
- **Don't** imitate "Busy 'growth' analytics tools that shout with color and motion." The approved Magic UI list is Number Ticker, Blur Fade and Text Highlighter; Border Beam, Shine Border, Magic Card, Neon Gradient Card, Meteors, Confetti, Particles, patterns, aurora or animated-gradient text, and every shimmer, rainbow, ripple or pulsating button are prohibited.
- **Don't** assume "keyboard shortcuts and technical vocabulary": every action has a visible, labeled control and plain words.
- **Don't** make "a draft or warning look like an error the owner caused." Drafts and review flags are amber; coral is only for failures and destroying data.
- **Don't** animate on page load, and don't count figures up from zero.
- **Don't** use letter-spaced all-caps micro labels, side-stripe borders thicker than 1px, or nested boxes.
- **Don't** add a dark theme: the owner works at a desk in office light.
- **Don't** use em dashes in interface copy; use a middle dot, colon or period.
