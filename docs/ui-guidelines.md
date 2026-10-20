# spendual — UI guidelines

**Status:** agreed design, before implementation. Date: 2026-10-14.
**Mockups:** [ui-mockups.html](ui-mockups.html). Open it in a browser. It has a light/dark switch.
**Product rules:** [household-finance-reference-guide.md](household-finance-reference-guide.md).
This file covers only look, layout and UI behavior. When the two files conflict, the guide wins on
accounting rules and this file wins on presentation.

The user will test the design in real use. Treat sizes and exact colors as a first version.
Treat the structural rules (sections 1, 2, 4 and 6) as fixed.

---

## 1. Principles

- Confirmed numbers come first. Planned numbers always look different from confirmed ones.
- The base is calm: neutral surfaces, one accent. Color comes from category tiles and the one chart.
- A user tone means "who". It appears only on records that belong to a person.
- Red means error. Over budget and overdue use amber.
- Entering a record is the most frequent task. `+` is one tap away on every screen.
- Every color has a text label next to it. Color is never the only signal.

## 2. Navigation shell

| Device | Shell |
|---|---|
| Phone (< 768 px) | Bottom tab bar: `Início` · `Lançamentos` · `+` · `A pagar` · `Mais`. `+` is a raised center button. |
| Desktop (≥ 768 px) | Left sidebar: `Início`, `Lançamentos`, `A pagar`, `Orçamentos`, `Metas`, then a `Mais` group with `Pessoal` and `Ajustes`. `+ Novo lançamento` button in the top bar. |

- Phone `Mais` opens a list: `Orçamentos`, `Pessoal`, `Metas`, `Ajustes`.
- `Pessoal` is reachable **only** through `Mais`. No other view shows personal balances or a link
  to them. This includes `Início`.
- Month views share one month selector (`‹ Outubro 2026 ›`) in the top bar. The selected month is
  kept across views.
- Top bar right side: the signed-in user's dot and name.
- `Entrar / Criar conta` has no shell.

## 3. Design tokens

All colors are CSS variables on `:root`, with a dark set. Components use only tokens, never literal
colors. Tailwind reads the tokens (`theme.extend.colors` maps to `var(--…)`).

Theme: follow the OS by default (`prefers-color-scheme`). `Ajustes` has an override
`Sistema | Claro | Escuro` that sets `data-theme` on `<html>`. The override is stored per user on
the server.

### 3.1 Neutrals, accent, semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#eef1f3` | `#12171b` | Page background |
| `--surface` | `#ffffff` | `#1b2227` | Cards, sheets, tab bar, inputs |
| `--surface-2` | `#f4f6f8` | `#232b31` | Bar tracks, segmented control background |
| `--fg` | `#1d2730` | `#e4e9ec` | Main text |
| `--muted` | `#5d6b77` | `#9aa7b1` | Secondary text, transfers |
| `--line` | `#dde3e7` | `#2d373e` | Borders, dividers, dashed planned cards |
| `--accent` | `#1f6f78` | `#5fb7b4` | Primary buttons, active tab, links, progress |
| `--accent-fg` | `#ffffff` | `#0d1417` | Text on accent |
| `--on-tone` | `#14202a` | `#14202a` | Text on a solid user color (the tones are pastel in both themes) |
| `--pos` | `#1e8449` | `#5cc98a` | Income amounts, and money left or saved (balance above 0, savings above 0, under budget in a closed month). Always with a sign or arrow. |
| `--warn` | `#b86e00` | `#f0a630` | Over budget, overdue, warning icon |
| `--err` | `#c62f3a` | `#f07178` | Validation errors, failed saves only |

### 3.2 Category palette (saturated)

Used for category tiles and the chart. Never for users, buttons or status.

| Category (PT-BR label) | Light | Dark | Icon (Lucide) |
|---|---|---|---|
| Mercado | `#2e9e5b` | `#5cc78a` | `shopping-cart` |
| Restaurantes e delivery | `#e5733a` | `#f39a6a` | `utensils` |
| Utilidades domésticas | `#a06b35` | `#cf9a62` | `spray-can` |
| Eletrodomésticos e móveis ⚠ | `#6d4c41` | `#b08a7e` | `sofa` |
| Casa e contas | `#4f5bd5` | `#8e98f2` | `house` |
| Transporte | `#1b95a6` | `#4fc0cf` | `car` |
| Saúde e cuidados | `#d6457a` | `#ee7aa4` | `heart` |
| Lazer e hobbies | `#76a91b` | `#a3d14b` | `gamepad-2` |
| Viagem ⚠ | `#2f80ed` | `#73a9f5` | `plane` |
| Assinaturas | `#8656e8` | `#ae8cf5` | `repeat` |
| Presentes | `#d9424a` | `#f07a80` | `gift` |
| Diversos / Outras | `#8c99a4` | `#7d8a95` | `ellipsis` |

- ⚠ The two marked rows are not in the mockup yet. Check them against their neighbors on a real
  screen before use.
- ⚠ `--pos` (income) and Mercado are both green. They never share a role: `--pos` is only amount
  text, Mercado is only a tile or a bar segment. Revisit if users confuse them.
- New user-created categories pick from this palette. Colors may repeat after 12. The tile icon
  and label tell them apart.

### 3.3 User palette (soft)

Each user picks one tone in `Ajustes`. The server rejects a tone the other user already has.
These tones never appear in charts, buttons or status.

| Name (PT-BR) | Light | Dark |
|---|---|---|
| Azul | `#7d9cc0` | `#8fadd0` |
| Rosé | `#c98b9a` | `#d6a0ad` |
| Sálvia | `#8fae94` | `#a3c2a8` |
| Areia | `#c8b28a` | `#d6c29c` |
| Lavanda | `#a99cc9` | `#b9addb` |
| Ardósia | `#8a96a3` | `#9ba7b3` |

Defaults: first account Azul, second account Rosé. Store the palette key (`blue`, `rose`, …), not
the hex. The theme maps the key to the hex.

### 3.4 Type, spacing, radius

- Font: **Figtree**, weights 400 / 500 / 600 / 700, **self-hosted** (bundle the `woff2` files).
  No Google Fonts and no CDN at runtime: the app is LAN-only. Fallback:
  `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- All amounts, dates and counts use `font-variant-numeric: tabular-nums`.

| Role | Size / weight |
|---|---|
| Entry amount | 34 px / 700 |
| Balance (Pessoal, Metas) | 27 px / 700 |
| Screen title | 17 px / 700 |
| Body, row title | 15 px / 600 for titles, 400 for text |
| Row meta, field label | 12 px / 400–600 |
| Eyebrow (`REALIZADO`) | 11 px / 600, uppercase, letter-spacing 0.07em |

- Spacing scale: 4 px steps (4, 8, 12, 16, 24). Use `gap` on flex/grid, not margins.
- Radius: tile 8 · input and small button 10 · card 14 · bottom sheet 20 (top corners) · chips 999.
- Touch targets ≥ 44 × 44 px.

## 4. Text and line breaks

Short UI text must never break into two lines. Long text may wrap, but must wrap cleanly.

- `white-space: nowrap` on: inputs and select values, buttons, chips, tags, name chips, segmented
  options, tab labels, sidebar links, card titles, label/value rows, every amount.
- If a short text can be too long (a description, an account name), truncate with an ellipsis
  inside its own column (`min-width: 0; overflow: hidden; text-overflow: ellipsis`). Show the full
  text in the detail view.
- Do not put two long fields side by side on the phone. Example: `Método` takes a full row because
  `Cartão de crédito · Nubank` does not fit half a row.
- Buttons in a pair use unequal columns when the action label is long (`1fr 1.7fr`).
- Paragraphs, notes and dialog bodies: `text-wrap: pretty`. Headings: `text-wrap: balance`.
- Money: `R$` and the number are joined by a non-breaking space (`Intl.NumberFormat` already does
  this). Never break between the sign, `R$` and the digits.
- Test every screen at 360 px width with the longest real labels.

## 5. Number, date and amount display

| What | Format | Style |
|---|---|---|
| Expense | `−R$ 312,40` (U+2212 minus) | `--fg` |
| Income | `+R$ 7.100,00` | `--pos` |
| Transfer, allocation | `⇄ R$ 500,00` + `não conta como gasto` | `--muted`, weight 500 |
| Planned | `R$ 190,00` | normal, inside a planned group (see 6.2) |
| Unknown planned amount | `valor ?` | `--muted`. Never shown as `R$ 0,00` |
| Voided | struck through | `--muted`, with `Anulado · <motivo>` in meta |
| Savings rate with income 0 | `—` | |

- Format with `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, then replace
  the ASCII `-` with `−` and add `+` for income. One shared formatter in `frontend/src/lib/`.
- Dates: `dd/MM/yyyy` in forms, `03/10` in rows, day headers `Sex, 03/10`. Timezone
  `America/Sao_Paulo`.
- Chart and budget labels may drop cents (`R$ 2.380`). Rows and forms always show cents.

## 6. Components

### 6.1 Category tile

28 × 28 px (40 × 40 in pickers), radius 8. Background: category color at 16 % (24 % in dark)
via `color-mix`. Icon: Lucide, 16 px, stroke 2, in the category color. "Tinted" only; no solid
tiles.

One category picker everywhere (entry form, `A pagar` create sheet, `Lançamentos` filter): icon
tiles, the 4 most used plus `todas ›`. Chosen tiles are highlighted (`aria-pressed`) and stay
visible. No dropdown and no filter bubble for categories.

### 6.1b Person picker

Users are picked with tiles too (entry form `De quem` and `Pago por` / `Recebido por`, A pagar create
sheet, `Lançamentos` person filter): one full-width row, equal widths, min height 44 px. Unselected:
the user's color at 25 % with a thin border. Selected: the full user color, bold name, 2 px accent
border, `--on-tone` text. Forms keep one tile selected; the filter clears when the selected tile is
tapped again.

**One account:** while only one user exists (second signup not done), no person field is shown
anywhere: no pickers, no person name in row subtitles, no `Pago por` / `De quem` rows in detail
sheets. The record is saved for that user. The `Pessoal` page and the `Casa | Pessoal` scope stay.

### 6.2 Cards: actual vs planned

- Actual card: `--surface` fill, no border.
- Planned card: transparent fill, 1.5 px dashed `--line` border, eyebrow says
  `PREVISÃO · INCLUI PLANEJADOS`.
- Never put actual and planned numbers in the same card without this split.

### 6.3 Record row

Grid `28px 1fr auto`: tile · title + meta · amount.

- Left border 3 px in the user tone of the payer (for personal records: the owner).
- Meta line: `Categoria · Casa|Pessoal` then a name chip (user tone at 22 %, dot + name).
- Rows group under day headers with the day total.
- Tap opens the detail with `Editar` and `Anular` / `Cancelar`.

### 6.4 Budget bar

- Track `--surface-2`, height 8 px.
- Solid segment: actual, category color. Light segment (category color at 35 %): planned for the
  rest of the month.
- Over 100 %: bar turns `--warn`, note `▲ R$ 72 acima` in `--warn`.
- Category without budget: no bar, text `sem orçamento`. No warning.

### 6.5 Dashboard chart

One horizontal stacked bar, height 10 px, 2 px gaps, inside the `Saldo atual` card. Its width is
the month's budget: each category takes its share of the budget, and the empty rest is the
balance. Two categories of 25 % each fill half the bar. Over budget, the bar scales to the
spending. Without a budget, it scales to the spending. Legend below: top 4 categories, then
`Outras (n)`, each row `tile · name · value · % of budget`. Actuals only. Plain HTML/CSS.

### 6.5b Trend chart (Análises)

Plain SVG, no library. One bar per month in the category color, a dashed line for the average
of the closed months, a gray step line for the budget in force each month. A bar above its
budget is `--warn`. The month in progress is hatched and not in the average. The average starts
at the first month with spending. Value labels above the bars up to 7 months.

### 6.6 Chips and segmented control

- Chips: filters and type selector. Active chip: accent fill.
- Segmented control: two or three exclusive options (`Casa | Pessoal`, tabs inside a view, theme).

### 6.7 Bottom sheet / dialog

- Phone: bottom sheet with grab handle over a 38 % black scrim. Desktop: centered dialog, max
  width 520 px, max height 90 % of the window (at most 820 px); the body then scrolls.
- The save bar is sticky with a top border and a fade, so cut-off fields read as scrollable.
- Built on Radix `Dialog`. Focus goes into the sheet and returns to the trigger on close.

### 6.8 Confirmation

Required before edit of history, void, cancel and goal withdrawal (guide §8).

- Title names the action: `Anular lançamento?`
- First line: the record (`iFood · −R$ 64,50 · 02/10`).
- Body: the consequence in one or two sentences. Never only "Tem certeza?".
- Void and cancel need a reason field (required).
- Buttons: safe action left (`Voltar`, ghost), action right, repeating the verb
  (`▲ Anular lançamento`). Destructive style: `--fg` fill, `--bg` text, warning glyph. Not red.
- New records save without confirmation.

### 6.9 Feedback states

- Loading: skeleton rows in `--surface-2`. No spinners on full screens.
- Empty: one sentence on what will appear and a button to add the first item.
- Save error: inline message in `--err` under the form, inputs kept. Never lose typed data.
- Success: short toast (`Lançamento salvo`).
- Submit buttons disable while a request runs. No double submit.
- No optimistic updates for financial records.

### 6.8 Logo

Rounded tile cut by one diagonal: top-left `--tone-blue` (`#7d9cc0`), bottom-right `--tone-rose` (`#c98b9a`),
a teal badge (`#1f6f78`) in the middle with a white `$` tilted +14° (Figtree 800, outlined to a path). The gaps
are transparent cut-outs, so it works on light and dark. The colors are fixed; they do not follow the users' tones.

| File (`frontend/public`) | Use |
|---|---|
| `logo.svg`, `favicon.svg` | Header mark, login page, browser tab |
| `favicon-32.png` | Tab icon fallback |
| `apple-touch-icon.png` (180), `icon-maskable-512.png` | Opaque full-bleed art on `#f4f6f8`; the OS rounds it |
| `icon-192.png`, `icon-512.png`, `manifest.webmanifest` | Install icon (name, theme color `#1f6f78`) |

`Logo` (`components/ui/logo.tsx`): 28 px next to `Spendual` in the desktop sidebar; 28 px alone (alt
`Spendual`) at the left of the phone header; 72 px above the title on `Entrar`.

## 7. Views

| View | Route | Layout | Key rules |
|---|---|---|---|
| Entrar / Criar conta | `/entrar` | Centered, no shell. Segmented `Entrar | Criar conta`. | `autocomplete` on fields. Shows free slots (`1 de 2 vagas livres`). Signup tab disabled after 2 accounts. |
| Início | `/` | Phone: one column. Desktop: two columns. | Order: `Saldo atual` card (balance, `Gasto/Total`, bar, legend; each legend row links to `Lançamentos` for those categories, `Outras (n)` for all of them, `Sem categoria` for records without one) → `Realizado` card → `Previsão` card (dashed) → `Próximas contas`. **No personal balances.** |
| Lançamentos | `/lancamentos` | Filter chips, then rows by day. | Actuals only, no planned items. Voided rows stay visible. Filters: month, scope, person, category, status. Opened from an `Início` legend row it is filtered to those categories (household, confirmed) with those category tiles highlighted; with a category filter a `Total do mês` line shows expenses minus refunds. |
| Novo lançamento | sheet from `+` | Full-height sheet (phone), dialog (desktop). | See 7.1. |
| A pagar | `/a-pagar` | Segmented `Próximas | Recorrentes | Parcelas`. | `Próximas` groups: `Vencidas`, `Esta semana`, then by month. `Confirmar pagamento` opens the entry form pre-filled. `Informar valor` for unknown amounts. Never auto-confirm. |
| Orçamentos | `/orcamentos` | Overall budget card, then one row per category. | Edit asks `Só <mês>` or `De <mês> em diante`. Past months never change. |
| Análises | `/analises` | Category chips, 3 number tiles (average, budget, months above), trend chart, month list. `6 meses | 12 meses`. | Reached from `Mais` (phone) and the sidebar. Household spending only. Month selector sets the last month. No budget: no gray line, text `sem orçamento`. |
| Pessoal | `/pessoal` | Phone: segmented per person. Desktop: two columns. | Reached only from `Mais`. Balance, previous balance, allowance, spending, then the person's records. Both people see everything. |
| Metas (P1) | `/metas` | Unallocated savings card, then one card per goal with progress. | `Alocar` / `Retirar`. Closing a goal with money left asks for a transfer first. |
| Ajustes | `/ajustes` | Profile card, then list rows. | Name, user tone (taken tone disabled), theme, categories, accounts, payment methods, allowance, backup status, `Sair`. |
| Mais (phone) | `/mais` | List with icon, name, one-line description. | Items: Orçamentos, Pessoal, Metas, Ajustes. |

⚠ Route names are a proposal. Labels in the UI are PT-BR. Code identifiers stay in English.

### 7.1 Novo lançamento

1. Type chips: `Despesa` (default) · `Receita` · `Transferência` · `Reembolso`.
2. Amount, large, focused on open, numeric keyboard (`inputmode="decimal"`), PT-BR parsing.
3. `Descrição`.
4. `Casa | Pessoal` (default `Casa`).
5. Category grid: the 4 most used (count of confirmed records, server side) + `todas ›`. Ties by name.
6. Person tiles `Pago por` (default: me; hidden with one account), then `Data` (default: today).
7. `Método`, full row (default: last used).
8. If `Método` is a credit card: a `Parcelado` label above `Não | Sim`. On `Sim`: `Parcelas`, `1ª parcela`, and a
   live line `10x de R$ 410,00` (no last-installment or total text). Remainder cents go to the last installment.
9. `Mais detalhes` (collapsed): account, notes, related record.
10. `Salvar`, pinned to the bottom.

Fields show only when the type and scope need them (guide §14).

## 8. Accessibility

- Contrast: text ≥ 4.5:1, large text and UI parts ≥ 3:1, in both themes.
- Visible focus ring: 2 px `--accent`, offset 2 px.
- Every tile and color dot has a text label or `aria-label`.
- Radix primitives for dialog, sheet, select, tabs, toast. Do not build these by hand.
- Respect `prefers-reduced-motion`: no slide animations for sheets when set.

## 9. Stack

| Part | Choice |
|---|---|
| Styling | Tailwind CSS, theme mapped to the CSS tokens in section 3 |
| Primitives | Radix UI |
| Components | shadcn/ui style: source copied into `frontend/src/components/ui/`, owned by the repo |
| Icons | Lucide (`lucide-react`) |
| Font | Figtree, self-hosted `woff2` |
| Charts | None in MVP. Plain HTML/CSS bar. |

All assets ship in the bundle. The app makes no request outside the LAN.

## 10. Open points

- Feel: the user wants to use the app before fixing sizes and density. Collect changes after the
  first usable build.
- ⚠ Category colors for `Eletrodomésticos e móveis` and `Viagem` are not tested on screen.
- ⚠ Income green vs Mercado green, see 3.2.
- Assumed, not discussed: personal records still appear in `Lançamentos` (with the `Pessoal`
  scope and the owner chip). Only the personal **balance view** is limited to `Mais`.
- Desktop breakpoint (768 px) is a proposal.
