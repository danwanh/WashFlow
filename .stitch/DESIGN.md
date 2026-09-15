---
name: WashFlow Operational Laundry Design System
colors:
  background: "#F8FAFC"
  surface: "#FFFFFF"
  surface-muted: "#F1F5F9"
  surface-subtle: "#EFF4FF"
  text-primary: "#0F172A"
  text-secondary: "#64748B"
  border: "#E2E8F0"
  border-strong: "#CBD5E1"
  primary: "#1E293B"
  primary-hover: "#0F172A"
  interactive: "#2563EB"
  interactive-hover: "#1D4ED8"
  info: "#0284C7"
  info-surface: "#F0F9FF"
  warning: "#D97706"
  warning-surface: "#FFFBEB"
  success: "#059669"
  success-surface: "#ECFDF5"
  error: "#DC2626"
  error-surface: "#FEF2F2"
  focus: "#2563EB"
---

# Design System: WashFlow

**Project ID:** `10545765533273343244`
**Source:** Stitch project “WashFlow”, desktop operational queue screens

## 1. Visual Theme & Atmosphere

WashFlow is a high-density operational cockpit for commercial laundry teams. Its visual language is disciplined, calm, and exact: a cool slate canvas, crisp white work surfaces, strong alignment, compact data rows, and a small set of unmistakable status colors. The interface should feel reliable under fluorescent floor lighting and during high-tempo intake, sorting, washing, drying, and pickup work.

The product favors Scandinavian functional minimalism with Japanese operational ergonomics. It rejects decoration that competes with the queue. Depth comes from tonal surfaces and razor-sharp borders rather than blurred shadows. Every visual choice should reduce scanning time, clarify ownership, and make the next action obvious.

## 2. Color Palette & Roles

### Primary Foundation

- **Cool Slate Canvas — `#F8FAFC`**: Application background and low-glare page canvas.
- **Clean White Surface — `#FFFFFF`**: Cards, drawers, tables, modals, and active work panels.
- **Muted Slate Surface — `#F1F5F9`**: Table striping, nested areas, inactive controls, and hover backgrounds.
- **Pale Blue Surface — `#EFF4FF`**: Selected rows, active ticket context, and focused operational areas.
- **Hairline Slate Border — `#E2E8F0`**: Default perimeter and row-divider color.
- **Structural Border — `#CBD5E1`**: Inputs, flyouts, and higher-emphasis separators.

### Accent & Interactive

- **Authority Slate — `#1E293B`**: Primary commands, selected navigation, batch actions, and durable controls.
- **Deep Ink — `#0F172A`**: Primary text and high-contrast hover state for commands.
- **Execution Blue — `#2563EB`**: Active tabs, focused inputs, primary progression, links, and selected-row accent bars.
- **Execution Blue Hover — `#1D4ED8`**: Hover state for interactive blue controls.

### Typography & Text Hierarchy

- **Operational Ink — `#0F172A`**: Ticket IDs, customer names, headings, and key metrics.
- **Secondary Slate — `#64748B`**: Metadata, timestamps, descriptions, and supporting labels.
- **Quiet Border Text — `#94A3B8`**: Disabled and tertiary information only; never use for essential actions.

### Functional States

- **Cycle Blue — `#0284C7` / `#F0F9FF`**: Active wash or dry cycles, machine progress, and in-process work.
- **Rush Amber — `#D97706` / `#FFFBEB`**: Expedited orders, holds, warnings, and attention-required work.
- **Ready Emerald — `#059669` / `#ECFDF5`**: Completed processing, quality approved, and ready for pickup.
- **Critical Red — `#DC2626` / `#FEF2F2`**: Contamination, failed inspection, blocked order, and destructive actions.

Use semantic color with restraint. Status color should identify operational state, not decorate every card.

## 3. Typography Rules

### Hierarchy & Weights

The primary typeface is Geist: compact, highly legible, and neutral enough for prolonged terminal use. Use JetBrains Mono for identifiers, weights, machine codes, shelf locations, timers, and other fixed-width data.

- **Display / page title:** Geist, 24px, 600, 32px line-height, tight tracking.
- **Section heading:** Geist, 20px, 600, 28px line-height.
- **Component heading:** Geist, 16px, 600, 22px line-height.
- **Body:** Geist, 13px, 400, 18px line-height.
- **Body emphasis:** Geist, 13px, 600, 18px line-height.
- **Small metadata:** Geist, 12px, 400, 16px line-height.
- **Action label:** Geist, 11px, 700, uppercase, 14px line-height, positive tracking.
- **Code / ticket label:** JetBrains Mono, 12px, 500, 16px line-height.
- **Metric / timer:** JetBrains Mono, 14px, 600, 18px line-height.

### Spacing Principles

Use a compact 4px base rhythm. The default operational gap is 8px, panel padding is 12px, and major section spacing is 16–24px. Data rows should remain dense enough to scan without feeling compressed. Display text is tight; body copy stays at a readable 18px line-height.

## 4. Component Stylings

### Buttons

Buttons are tool-like, compact, and explicit. Primary buttons use `#1E293B` with white text, are approximately 32px high, use 12px horizontal padding, and carry uppercase action labels. Blue buttons are reserved for execution or progression. Secondary buttons are transparent or white with a 1px border. Hold and destructive actions use the pale red surface with red text and border. Provide a clear 1px blue focus ring and a restrained 120–180ms color transition.

### Cards & Operational Containers

Cards use white surfaces with 1px `#E2E8F0` borders and 4px corners. Avoid ambient shadows in default states. Selected containers use a blue border or a sharp 1px outline. Operational cards use 10px vertical and 12px horizontal padding, with the first row reserved for ticket ID, state, and elapsed time; the middle row for customer and metrics; and the final row for machine, service, or exception tags.

### Navigation

Use a fixed 240px desktop sidebar or compact operational navigation rail. Navigation labels are short and action-oriented. The active item uses a dark slate or blue-tinted background plus a clear text/icon treatment. Keep navigation persistent on desktop and convert it into a drawer or compact top bar below the standard desktop breakpoint.

### Inputs & Forms

Inputs are 32px high with white backgrounds, 1px `#CBD5E1` borders, 4px corners, and Geist 13px text. Focus changes the border to `#2563EB` and adds a crisp blue ring. Barcode and ticket search fields use JetBrains Mono text and may include a green ready indicator. Forms should prioritize keyboard flow, clear labels, and visible validation states.

### Domain-Specific Components

**Work queue cards:** Show ticket ID, service state, customer, weight/count, elapsed time, machine assignment, and service type in a predictable vertical hierarchy. A selected or urgent ticket must be identifiable without opening it.

**Machine status tiles:** Use compact white hardware tiles with a 1px border, a live countdown in JetBrains Mono, and a 2px progress bar along the lower edge. Use sky blue for active cycles and emerald for complete states.

**Inspection drawer:** Use a fixed 420px detail drawer on wide desktop. Keep ticket identity and state visible at the top, then group garment details, exceptions, notes, and next actions into short sections. The drawer must not obscure the queue’s primary selection context.

**Tables:** Use 36px rows, a muted header, horizontal separators, subtle alternating row surfaces, and a 2px blue left accent for the selected row.

## 5. Layout Principles

### Grid & Structure

Design for a 1366px minimum desktop canvas and optimize for 1920×1080 work terminals. The preferred wide layout is a three-pane system: 240px navigation, flexible queue workspace, and a 420px inspector drawer. At standard desktop widths, the inspector can overlay or slide in while preserving the queue. Use a 12-column mental grid with 12px column gaps and consistent panel edges.

### Whitespace Strategy

The interface is information-dense but not crowded. Use 12px panel padding, 8px inner gaps, 16px component groups, and 24–32px page-level separation. Preserve breathing room around titles and primary actions, while keeping repeated data rows compact.

### Alignment & Visual Balance

Favor left-aligned operational content and strong vertical columns. Align identifiers and numeric values consistently. Keep action clusters near the relevant queue or drawer context. Use visual weight to emphasize current work, urgent exceptions, and the next progression step—not decorative hero imagery.

### Responsive Behavior & Touch

Desktop is the primary experience. At 1024–1439px, collapse to navigation plus queue with an inspector overlay. Below 1024px, stack priority queues and use full-width status rows. Maintain at least 44px touch targets on handheld floor views, even if the visual typography remains compact.

## 6. Design System Notes for Stitch Generation

### Language to Use

Use phrases such as “high-density operational cockpit,” “Nordic precision,” “cool slate canvas,” “razor-sharp borders,” “compact queue rows,” “calm under operational stress,” and “machine-readable data hierarchy.” Ask for disciplined alignment, rapid visual triage, and minimal decorative depth.

### Color References

Anchor generated screens in `#F8FAFC`, `#FFFFFF`, `#0F172A`, `#1E293B`, and `#2563EB`. Use `#0284C7`, `#D97706`, `#059669`, and `#DC2626` only as semantic operational states with their paired pale surfaces.

### Component Prompts

- “Create a dense desktop laundry work queue with a 240px slate navigation rail, compact white ticket cards, JetBrains Mono ticket IDs and timers, and blue selected-row accents.”
- “Add a 420px inspection drawer for the selected laundry ticket, with garment groups, exception badges, quality notes, and one clear next-action button.”
- “Create a machine status board using compact bordered tiles, live Montserrat countdowns, and thin blue or emerald progress bars.”

### Incremental Iteration

Preserve the queue’s column structure, density, and status semantics when iterating. Improve hierarchy before adding decoration. If a screen feels visually noisy, remove shadows and extra color first. When adding a new state, reuse the established blue, amber, emerald, and red vocabulary rather than inventing a new hue. Validate at 1280px and 1920px desktop widths.
