# Dispute Resolution & Codes of Conduct — Source CSV Prompt

Search for grievance procedures, codes of conduct, ethics codes, and internal complaint processes across all U.S. Olympic and Paralympic NGBs. Not all NGBs publish these separately, so expect fewer results than other categories.

---

_Copy everything below this line into an LLM with web search._

## Task

Search the web for grievance procedures, codes of conduct, and ethics codes for each U.S. Olympic and Paralympic National Governing Body (NGB) listed below. Generate a CSV file with one row per document found. Only include documents with real, publicly accessible URLs that you have verified.

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

- `id` — Slug identifier (lowercase, hyphens only, e.g., `usa-swimming-code-of-conduct`). Auto-generated from title if blank.
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

For each NGB, search for **two types of documents**:

### 1. Grievance / Dispute Resolution Procedures

Internal grievance or complaint procedures (distinct from Section 9 arbitration at the USOPC level).

- `documentType`: `procedure`
- `topicDomains`: `dispute_resolution`
- `authorityLevel`: `ngb_policy_procedure`
- `priority`: `medium`

### 2. Code of Conduct / Ethics Code

Athlete or member code of conduct, ethics code, or code of ethics.

- `documentType`: `code`
- `topicDomains`: `governance|athlete_rights`
- `authorityLevel`: `ngb_policy_procedure`
- `priority`: `medium`

Search tips:

- Try `[NGB name] grievance procedure filetype:pdf` and `[NGB name] code of conduct`
- Try `[NGB name] ethics code` and `[NGB name] complaint procedure`
- Check governance, athlete resources, or legal/compliance pages on NGB websites
- Some NGBs embed grievance procedures in their bylaws rather than publishing them separately — skip those (the bylaws prompt covers them)
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
"USA Track & Field Code of Ethics",code,governance|athlete_rights,https://www.usatf.org/governance/code-of-ethics.pdf,"Code of ethics for USATF members including athletes covering expected conduct and ethical obligations",usa-track-field-code-of-ethics,pdf,medium,ngb_policy_procedure,usa-track-field
"US Rowing Grievance Procedure",procedure,dispute_resolution,https://www.usrowing.org/grievance-procedure.pdf,"Internal grievance and complaint resolution process for US Rowing athletes and members",us-rowing-grievance,pdf,medium,ngb_policy_procedure,us-rowing
"USA Gymnastics Code of Ethical Conduct",code,governance|athlete_rights,https://usagym.org/wp-content/uploads/code-of-conduct.pdf,"Ethical conduct standards for USA Gymnastics athletes and members including prohibited behaviors",usa-gymnastics-code-of-conduct,pdf,medium,ngb_policy_procedure,usa-gymnastics
```

## Output

Generate the complete CSV file. Start with the header row, then one row per document. Wrap any field containing commas in double quotes. After the CSV, provide a brief summary listing:

1. How many grievance procedures you found
2. How many codes of conduct you found
3. Which NGBs you could not find either document type for

---

_Tips: Many NGBs include grievance procedures within their bylaws rather than as standalone documents. If you only find a code of conduct and not a separate grievance procedure, that's fine — include what you find. Update the skip list above before each run — check `/admin/sources` for current IDs._
