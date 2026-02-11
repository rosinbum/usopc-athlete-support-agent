# Rulebooks & Competition Regulations — Source CSV Prompt

Search for competition rulebooks and regulations across all U.S. Olympic and Paralympic NGBs. There is typically one rulebook per NGB, though some may have discipline-specific rulebooks.

---

_Copy everything below this line into an LLM with web search._

## Task

Search the web for the current competition rulebook or rules/regulations document for each U.S. Olympic and Paralympic National Governing Body (NGB) listed below. Generate a CSV file with one row per document found. Only include documents with real, publicly accessible URLs that you have verified.

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

- `id` — Slug identifier (lowercase, hyphens only, e.g., `usa-cycling-rulebook`). Auto-generated from title if blank.
- `format` — `pdf`, `html`, or `text`. Default: `pdf`
- `priority` — `high`, `medium`, or `low`. Default: `medium`
- `authorityLevel` — Must be exactly one of: `law`, `international_rule`, `usopc_governance`, `usopc_policy_procedure`, `independent_office`, `anti_doping_national`, `ngb_policy_procedure`, `games_event_specific`, `educational_guidance`. Default: `educational_guidance`
- `ngbId` — The NGB identifier from the list below.

## NGB Identifiers

Use these exact IDs in the `ngbId` column:

| ID                    | Organization                  |
| --------------------- | ----------------------------- |
| usa-archery           | USA Archery                   |
| usa-badminton         | USA Badminton                 |
| usa-basketball        | USA Basketball                |
| usa-biathlon          | USA Biathlon                  |
| usa-bobsled-skeleton  | USA Bobsled & Skeleton        |
| usa-boxing            | USA Boxing                    |
| usa-canoe-kayak       | USA Canoe/Kayak               |
| usa-climbing          | USA Climbing                  |
| usa-cricket           | USA Cricket                   |
| usa-curling           | USA Curling                   |
| usa-cycling           | USA Cycling                   |
| usa-diving            | USA Diving                    |
| us-equestrian         | US Equestrian                 |
| us-fencing            | US Fencing                    |
| us-field-hockey       | US Field Hockey               |
| us-figure-skating     | US Figure Skating             |
| usa-flag-football     | USA Flag Football             |
| usa-golf              | USA Golf                      |
| usa-gymnastics        | USA Gymnastics                |
| usa-hockey            | USA Hockey                    |
| usa-judo              | USA Judo                      |
| usa-karate            | USA Karate                    |
| usa-lacrosse          | USA Lacrosse                  |
| usa-luge              | USA Luge                      |
| usa-modern-pentathlon | USA Modern Pentathlon         |
| us-rowing             | US Rowing                     |
| us-rugby              | US Rugby                      |
| us-sailing            | US Sailing                    |
| us-shooting           | US Shooting                   |
| us-ski-snowboard      | US Ski & Snowboard            |
| us-soccer             | US Soccer                     |
| usa-softball          | USA Softball                  |
| us-speedskating       | US Speedskating               |
| us-squash             | US Squash                     |
| usa-surfing           | USA Surfing                   |
| usa-swimming          | USA Swimming                  |
| usa-table-tennis      | USA Table Tennis              |
| usa-taekwondo         | USA Taekwondo                 |
| usa-team-handball     | USA Team Handball             |
| usa-tennis            | USA Tennis                    |
| usa-track-field       | USA Track & Field             |
| usa-triathlon         | USA Triathlon                 |
| usa-volleyball        | USA Volleyball                |
| usa-water-polo        | USA Water Polo                |
| usa-weightlifting     | USA Weightlifting             |
| usa-wrestling         | USA Wrestling                 |
| usopc-skateboarding   | Skateboarding (USOPC-managed) |
| usopc-breaking        | Breaking (USOPC-managed)      |

## What to Search For

For each NGB, search for the organization's **competition rulebook**, **rules and regulations**, or equivalent document. Use these field values:

- `documentType`: `rulebook`
- `topicDomains`: `team_selection|eligibility|governance`
- `authorityLevel`: `ngb_policy_procedure`
- `priority`: `high`

Search tips:

- Try `[NGB name] rulebook filetype:pdf` and `[NGB name] competition rules regulations`
- Check the governance, officials, or competition pages on NGB websites
- Some NGBs have a single unified rulebook; others have separate rulebooks per discipline (e.g., artistic gymnastics rules vs. rhythmic gymnastics rules). Include all that you find.
- Look for the most current version (2025 or 2025-2028 quad)
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
"USA Cycling Rulebook 2025",rulebook,team_selection|eligibility|governance,https://www.usacycling.org/resources/rulebook.pdf,"Official competition rules and regulations for USA Cycling covering race categories and eligibility requirements",usa-cycling-rulebook,pdf,high,ngb_policy_procedure,usa-cycling
"US Rowing Rules of Rowing 2025",rulebook,team_selection|eligibility|governance,https://www.usrowing.org/rules-of-rowing.pdf,"Official rules of rowing governing competition conduct and athlete eligibility for US Rowing events",us-rowing-rulebook,pdf,high,ngb_policy_procedure,us-rowing
```

## Output

Generate the complete CSV file. Start with the header row, then one row per document. Wrap any field containing commas in double quotes. After the CSV, provide a brief summary listing:

1. How many rulebook documents you found
2. Which NGBs you could not find a rulebook for
3. Any NGBs where you found multiple discipline-specific rulebooks

---

_Tips: Some NGBs publish rules as HTML pages rather than PDFs — include those with `format: html`. Update the skip list above before each run — check `/admin/sources` for current IDs._
