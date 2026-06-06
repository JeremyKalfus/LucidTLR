# Figma MCP Connection

This project uses Figma MCP as the visual source of truth for LucidTLR UI work.
Before implementing UI, use the Figma MCP tools to inspect exact colors, fonts,
sizes, radii, spacing, borders, icons, and screenshots. You do not have to follow it exactly, but it should be a broad guideline.

## Source File

- Figma file: LucidTLR home page
- External URL slug still uses the pre-rename `LucidCue-home-page` name.
- URL: https://www.figma.com/design/xLQfDmzGAc5dTty0rMlu6p/LucidCue-home-page?node-id=0-1&p=f&t=OKgxllhXHz8dDfG0-0
- File key: `xLQfDmzGAc5dTty0rMlu6p`
- Page node: `0:1` (`Page 1`)
- Main frame node: `1:3` (`iPhone 16 - 1`)
- Local reference snapshot: `docs/figma/lucidtlr-home-page-page-1.png`

## Verified MCP Status

Verified on 2026-05-27:

- Figma MCP authenticated as Jeremy Kalfus (`jeremykalfus@gmail.com`).
- `get_metadata` works for the file.
- `get_screenshot` works for the page and main frame.
- `get_design_context` works for the main frame, but the main frame currently
  contains only the black background.

The visible home-screen UI layers are currently siblings of the `iPhone 16 - 1`
frame on `Page 1`, not children of the frame. For implementation work, inspect
`Page 1` metadata and fetch individual visible nodes as needed.

## Known Page 1 Node Map

- `1:3` - `iPhone 16 - 1`, 393 x 852
- `3:138` - `Sleep w/o TLR`, bottom navigation background
- `3:96` - `Navigation Button List`
- `3:288` - `Your last sleep`
- `8:70` - `TLR settings button`
- `8:33` - `TLR options`
- `8:44` - `Begin TLR Button (glowing)`
- `8:53` - `Sleep without TLR button`
- `8:57` - `Record Dream button`
- `8:43` - `Info Card`
- `8:45` - `Standard Card`

## Current Visual Style Inventory

Status: exact style-property MCP calls are currently blocked by the Figma
Starter-plan tool-call limit. The inventory below combines:

- Exact MCP metadata for node IDs, positions, and sizes.
- The exact `#0C0C0C` frame background returned by `get_design_context` for
  `1:3`.
- Snapshot-derived color samples from
  `docs/figma/lucidtlr-home-page-page-1.png`.

When the MCP limit resets, replace provisional values with direct
`get_variable_defs` / `use_figma` values before treating these as final design
tokens.

### Canvas

| Token | Value | Source |
| --- | --- | --- |
| Screen size | 393 x 852 | MCP metadata |
| App background | `#0C0C0C` | MCP design context |
| Off-frame transparent/black edge | `#000000` | PNG sample |
| Primary horizontal margin | 19-20 px | MCP metadata |
| Title x offset | 24-25 px | MCP metadata |
| Bottom nav x offset | 19 px | MCP metadata |

### Color Samples

| Usage | Value | Source / note |
| --- | --- | --- |
| Background | `#0C0C0C` | Exact from MCP design context |
| Card/button fill | `#0E0E0E` | PNG sample |
| Card border | `#252525` | PNG sample |
| Bottom nav fill | `#0D0D0D` | PNG sample |
| Bottom nav border | `#1B1B1B` | PNG sample |
| Primary text | `#A7A7A7` | Dominant PNG text sample |
| Secondary/body text | `#949494` | Dominant PNG text sample |
| Muted labels | `#757575` | PNG label sample |
| Dim/inactive labels | `#414141` to `#4E4E4E` | PNG label sample |
| Subtle glow/shadow | `#2B2B2B` to `#323232` | PNG edge sample |

The current design is intentionally grayscale/nocturnal. Avoid introducing new
hues unless Jeremy explicitly approves a UI direction.

### Typography

Exact font family and weight are not available until MCP style-property access
is restored. Treat these as implementation placeholders only, then verify with
Figma MCP:

| Usage | Figma nodes | Provisional implementation style |
| --- | --- | --- |
| Screen/section titles | `8:33`, `3:288` | System sans / regular, 24 px, 24 px line height, `#A7A7A7` |
| Primary CTA label | `3:289` | System sans / regular, 24 px, 24 px line height, `#A7A7A7` |
| Info card body | `8:31` | System sans / regular, 13-14 px, 24-26 px line height, `#949494` |
| Secondary button labels | children of `8:53`, `8:57` | System sans / regular, 12 px, 16-18 px line height, `#757575` |
| Bottom nav labels | children of `3:96` | System sans / regular, 12 px, 16-18 px line height, muted/dim states |

Use letter spacing `0` unless Figma MCP later reports otherwise.

### Layout And Components

| Element | Node | Position / size | Style notes |
| --- | --- | --- | --- |
| Main frame | `1:3` | x 0, y 0, 393 x 852 | Background `#0C0C0C` |
| Header title | `8:33` | x 24, y 54, 125 x 24 | 24 px title |
| Settings icon | `8:70` | x 350, y 54, 24 x 24 | Thin outline icon |
| Info card | `8:43` / `8:35` | x 20, y 89, 354 x 95 | Fill `#0E0E0E`, 1 px border, rounded rectangle |
| Primary CTA | `8:44` / `3:275` | x 19, y 208, 355 x 78 | Pill button, subtle glow, large centered text |
| Sleep without TLR | `8:53` / `8:54` | x 20, y 300, 170 x 72 | Pill/rounded button, icon above label |
| Record dream | `8:57` / `8:58` | x 204, y 300, 170 x 72 | Pill/rounded button, icon above label |
| Last sleep title | `3:288` | x 25, y 395, 155 x 24 | 24 px section title |
| Last sleep card | `8:45` / `8:46` | x 20, y 432, 354 x 312 | Fill `#0E0E0E`, 1 px border, rounded rectangle |
| Bottom nav shell | `3:138` | x 19, y 760, 355 x 71 | Pill background, thin border |
| Bottom nav list | `3:96` | x 40, y 762, 314 x 68 | Five equal items, each about 62.8 x 68 |

Approximate radii from the snapshot:

- Primary CTA: pill radius about 39 px.
- Secondary buttons: pill radius about 36 px.
- Bottom nav: pill radius about 35 px.
- Cards: rounded rectangle radius about 14-16 px.

### Icon Style

- Icons are thin outline marks.
- Primary icon size appears 24 px.
- Settings icon node is exactly 24 x 24.
- Bottom nav uses five evenly spaced outline icons with labels:
  `guide`, `data`, `home`, `journal`, `settings`.

## Required Workflow

For every Figma-driven UI task:

1. Read `TLR_App_Plan.md`.
2. Use Figma MCP `get_metadata` on `0:1` if you need the current node map.
3. Use `get_design_context` on the exact node or component being implemented.
4. Use `get_screenshot` for the same node or page before coding.
5. Translate MCP output into the project stack: React Native + TypeScript for
   shared UI, Swift/SwiftUI for native iOS/watchOS pieces, and Kotlin for native
   Android pieces only when needed.
6. Validate the implemented UI against the Figma screenshot before marking the
   task complete.

Do not guess from screenshots when MCP data is available.

## Current Limitation

The authenticated Figma account is on the Starter plan. During initial setup,
the MCP server returned a tool-call limit error while fetching variables and
individual node design contexts. If this happens again, pause Figma-driven work
until the limit resets or Jeremy changes the plan/access. Do not substitute
guessed design tokens for unavailable MCP data.
