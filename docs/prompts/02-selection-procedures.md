# Selection Procedures — Source CSV Prompt (Per-NGB Template)

Template prompt for finding **all** selection procedure documents for a single NGB. Run this once per NGB, replacing the placeholders below.

Each NGB can have 10+ separate selection procedure documents (Olympic team, Paralympic team, World Championships, Continental cups, mixed relay, age-group nationals, etc.), so a focused per-NGB search produces much better results than a broad sweep.

See the [README](./README.md) for the full NGB table with website URLs.

---

_Copy everything below this line. Replace `[NGB_NAME]`, `[NGB_ID]`, and `[NGB_WEBSITE]` before pasting into an LLM with web search._

## Task

Search the web exhaustively for **all** current selection procedure documents published by **[NGB_NAME]**. Start at their website ([NGB_WEBSITE]) and search more broadly. Generate a CSV file with one row per document found. Only include documents with real, publicly accessible URLs that you have verified.

## CSV Format

The CSV must have these exact column headers:

```
title,documentType,topicDomains,url,description,id,format,priority,authorityLevel,ngbId
```

**Required columns** (must have a value):

- `title` — Full official document title
- `documentType` — Must be exactly one of: `bylaws`, `code`, `legislation`, `policy`, `procedure`, `protocol`, `rulebook`, `selection_procedures`
- `topicDomains` — One or more of the values below, separated by pipes (`|`): `team_selection`, `dispute_resolution`, `safesport`, `anti_doping`, `eligibility`, `governance`, `athlete_rights`
- `url` — Direct URL to the document (PDF link or HTML page). Must be a real, working URL you have verified.
- `description` — 1-2 sentence description of what the document covers and why it matters to athletes

**Optional columns** (leave blank for defaults):

- `id` — Slug identifier (lowercase, hyphens only, e.g., `usa-swimming-olympic-selection-2025`). Auto-generated from title if blank.
- `format` — `pdf`, `html`, or `text`. Default: `pdf`
- `priority` — `high`, `medium`, or `low`. Default: `medium`
- `authorityLevel` — Must be exactly one of: `law`, `international_rule`, `usopc_governance`, `usopc_policy_procedure`, `independent_office`, `anti_doping_national`, `ngb_policy_procedure`, `games_event_specific`, `educational_guidance`. Default: `educational_guidance`
- `ngbId` — Use `[NGB_ID]` for all rows.

## NGB for This Run

- **Name**: [NGB_NAME]
- **ID**: `[NGB_ID]`
- **Website**: [NGB_WEBSITE]

Set `ngbId` to `[NGB_ID]` for every row.

## What to Search For

Find **every** selection procedure document published by [NGB_NAME]. Use these field values for all rows:

- `documentType`: `selection_procedures`
- `topicDomains`: `team_selection`
- `authorityLevel`: `ngb_policy_procedure`
- `priority`: `high`

Search exhaustively for all of these categories:

1. **Olympic team selection** — LA 2028 or current quad selection procedures
2. **Paralympic team selection** — LA 2028 or current quad Paralympic selection procedures
3. **World Championships selection** — Procedures for selecting athletes to annual World Championships
4. **World Cup / World Series selection** — Procedures for World Cup, Grand Prix, or series events
5. **Continental Championships / Pan American Games** — Selection for continental-level competitions
6. **Mixed relay / team events** — If the sport has team or mixed relay events with separate selection criteria
7. **Age-group / junior / masters** — Junior Worlds, Youth Olympics, masters-level selection
8. **Para-specific disciplines** — Para-sport-specific selection procedures (e.g., wheelchair, visually impaired classifications)
9. **Discipline-specific** — If the NGB covers multiple disciplines (e.g., track vs. field, artistic vs. rhythmic gymnastics), look for discipline-specific procedures
10. **Event-specific** — Marathon trials, championship meet procedures, wildcard/discretionary selection criteria

Search tips:

- Start at `[NGB_WEBSITE]` — check governance, athlete resources, high performance, and selection pages
- Try `"[NGB_NAME]" selection procedures filetype:pdf`
- Try `site:[NGB_WEBSITE domain] selection procedures`
- Check Team USA page: `site:teamusa.org [NGB_NAME] selection`
- Look for the most current version (2025-2026, LA 2028 cycle)
- Prefer direct PDF links. Set `format: pdf` for PDFs, `format: html` for web pages.

## Already Imported

Do not include documents with these IDs — they are already in the system:

- `usopc-bylaws`
- `ted-stevens-act`
- `safesport-code`
- `usada-protocol`
- `wada-code`
- `section-9-procedures`
- `athlete-rights-responsibilities`
- `aac-bylaws`
- `usa-swimming-rulebook`
- `usa-swimming-bylaws`
- `usa-swimming-selection`

## Example Rows

```csv
title,documentType,topicDomains,url,description,id,format,priority,authorityLevel,ngbId
"USA Triathlon 2025 Olympic Team Selection Procedures",selection_procedures,team_selection,https://www.usatriathlon.org/selection-procedures-olympic-2025.pdf,"Criteria for selecting U.S. triathletes to the 2028 Olympic Games team including qualification events and ranking requirements",usa-triathlon-olympic-selection-2025,pdf,high,ngb_policy_procedure,usa-triathlon
"USA Triathlon 2025 World Championships Selection Procedures",selection_procedures,team_selection,https://www.usatriathlon.org/selection-procedures-worlds-2025.pdf,"Procedures for selecting U.S. athletes to World Triathlon Championship Series events",usa-triathlon-worlds-selection-2025,pdf,high,ngb_policy_procedure,usa-triathlon
"USA Triathlon 2025 Paratriathlon Selection Procedures",selection_procedures,team_selection,https://www.usatriathlon.org/selection-procedures-para-2025.pdf,"Criteria for selecting U.S. paratriathletes to Paralympic and World Championship teams",usa-triathlon-para-selection-2025,pdf,high,ngb_policy_procedure,usa-triathlon
```

## Output

Generate the complete CSV file. Start with the header row, then one row per document. Wrap any field containing commas in double quotes. After the CSV, provide a brief summary listing:

1. How many selection procedure documents you found for [NGB_NAME]
2. What categories of selection procedures you found (Olympic, Paralympic, Worlds, etc.)
3. Any categories you looked for but could not find documents for

---

_Tips: NGBs with many disciplines (track & field, gymnastics, skiing) may have 15+ separate selection documents. If the LLM finds fewer than expected, run again asking it to focus on the missing categories. Update the skip list above before each run — check `/admin/sources` for current IDs._
