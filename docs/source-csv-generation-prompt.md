# Source CSV Generation Prompt

Use the prompt below with an LLM that has web search capabilities (e.g., ChatGPT with browsing, Perplexity, Claude with web search) to generate CSV files for bulk import into the admin UI at `/admin/sources/bulk-import`.

---

## The Prompt

Copy everything between the `---` markers below.

---

I need you to search the web and generate a CSV file of governance documents for U.S. Olympic and Paralympic sport organizations. This CSV will be imported into a compliance knowledge base for athletes.

### CSV Format

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

- `id` — Slug identifier (lowercase, hyphens only, e.g., `usa-swimming-bylaws`). Auto-generated from title if blank.
- `format` — `pdf`, `html`, or `text`. Default: `pdf`
- `priority` — `high`, `medium`, or `low`. Default: `medium`
- `authorityLevel` — Must be exactly one of: `law`, `international_rule`, `usopc_governance`, `usopc_policy_procedure`, `independent_office`, `anti_doping_national`, `ngb_policy_procedure`, `games_event_specific`, `educational_guidance`. Default: `educational_guidance`
- `ngbId` — The NGB identifier from the list below. Leave blank for USOPC-wide / cross-sport documents.

### NGB Identifiers

Use these exact IDs in the `ngbId` column. Only include an ngbId when the document is specific to that NGB:

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

### Documents to Search For

For each NGB above, search for and include any of the following documents you can find with a working URL:

1. **Bylaws** (`documentType: bylaws`) — The NGB's organizational bylaws or constitution. `authorityLevel: ngb_policy_procedure`, `topicDomains: governance|athlete_rights`, `priority: high`

2. **Selection Procedures** (`documentType: selection_procedures`) — Olympic/Paralympic/international team selection criteria. Look for the most recent version (2025-2026 or LA 2028 cycle). `authorityLevel: ngb_policy_procedure`, `topicDomains: team_selection`, `priority: high`

3. **Rulebook** (`documentType: rulebook`) — Competition rules and regulations. `authorityLevel: ngb_policy_procedure`, `topicDomains: team_selection|eligibility|governance`, `priority: high`

4. **SafeSport / Minor Athlete Abuse Prevention Policy (MAAP/MAP)** (`documentType: policy`) — The NGB's SafeSport policy, MAAP, or minor athlete protection policy. `authorityLevel: ngb_policy_procedure`, `topicDomains: safesport`, `priority: high`

5. **Grievance / Dispute Resolution Procedures** (`documentType: procedure`) — Internal grievance or complaint procedures (distinct from Section 9 arbitration). `authorityLevel: ngb_policy_procedure`, `topicDomains: dispute_resolution`, `priority: medium`

6. **Code of Conduct / Ethics Code** (`documentType: code`) — Athlete or member code of conduct. `authorityLevel: ngb_policy_procedure`, `topicDomains: governance|athlete_rights`, `priority: medium`

Also search for these **cross-sport / USOPC-level** documents (leave `ngbId` blank):

7. **Section 8 Complaint decisions** — Published decisions from USOPC Section 8 complaints (NGB compliance complaints). `documentType: procedure`, `topicDomains: dispute_resolution|governance`, `authorityLevel: usopc_policy_procedure`, `priority: high`

8. **Section 9 Arbitration decisions** — Published CAS/AAA arbitration awards under Section 9 of the Ted Stevens Act (opportunity to compete). `documentType: procedure`, `topicDomains: dispute_resolution|team_selection`, `authorityLevel: usopc_policy_procedure`, `priority: high`

9. **USOPC Athlete Ombudsman resources** — Guides, FAQs, or educational materials from the USOPC Athlete Ombudsman. `documentType: policy`, `topicDomains: athlete_rights|dispute_resolution`, `authorityLevel: educational_guidance`, `priority: medium`

10. **IOC / IPC governance documents** — Olympic Charter, IPC Handbook, etc. `documentType: code`, `topicDomains: governance|athlete_rights`, `authorityLevel: international_rule`, `priority: medium`

### Important Rules

- **Only include documents with working, publicly accessible URLs.** Do not guess or fabricate URLs. If you cannot find a direct link, skip that document.
- **Prefer direct PDF links** over landing pages when available. Set `format: pdf` for PDFs, `format: html` for web pages.
- **Use the most current version** of each document. Many NGBs update bylaws and selection procedures annually.
- **Wrap fields containing commas in double quotes.** For example: `"USA Swimming Olympic Team Selection Procedures, 2025-2028"`
- **Do not include documents that are already in the system.** The following IDs are already imported — skip any duplicates:
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

### Example Rows

```csv
title,documentType,topicDomains,url,description,id,format,priority,authorityLevel,ngbId
"USA Track & Field Bylaws",bylaws,governance|athlete_rights,https://www.usatf.org/governance/bylaws,"Organizational bylaws governing USA Track & Field including athlete representation and governance structure",usa-track-field-bylaws,pdf,high,ngb_policy_procedure,usa-track-field
"USA Gymnastics Selection Procedures 2025-2028",selection_procedures,team_selection,https://usagym.org/selection-procedures-2025.pdf,"Criteria and procedures for selecting U.S. gymnasts to Olympic and World Championship teams",usa-gymnastics-selection,pdf,high,ngb_policy_procedure,usa-gymnastics
"US Figure Skating SafeSport Policy",policy,safesport,https://www.usfigureskating.org/safesport-policy.pdf,"US Figure Skating minor athlete abuse prevention and SafeSport compliance policy",us-figure-skating-safesport,pdf,high,ngb_policy_procedure,us-figure-skating
```

### Output

Generate the complete CSV file. Start with the header row, then one row per document. Aim for as many documents as you can find with verified URLs. After the CSV, provide a brief summary of how many documents you found per category and note any NGBs where you could not find key documents.

---

## Tips for Best Results

- **Run the prompt in batches.** If you want comprehensive coverage, run it multiple times targeting specific groups of NGBs (e.g., "Focus on summer sports A-G" in one pass, "Focus on winter sports" in another). Merge the CSVs afterward.
- **Update the "already imported" list** before each run. Check the admin UI at `/admin/sources` for current IDs.
- **Verify URLs manually** before importing. LLMs sometimes hallucinate URLs even when instructed not to. The bulk import preview step will let you catch bad data before creation.
- **Iterate.** After the first import, you can ask the LLM to "find documents for the NGBs that are still missing coverage" by providing the list of NGBs without sources.
