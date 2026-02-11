# USOPC & Cross-Sport Documents — Source CSV Prompt

Search for USOPC-level and cross-sport governance documents: Section 8/9 decisions, Athlete Ombudsman resources, IOC/IPC governance docs. These are **not** NGB-specific — leave `ngbId` blank.

---

_Copy everything below this line into an LLM with web search._

## Task

Search the web for USOPC-level governance documents, published arbitration/complaint decisions, Athlete Ombudsman resources, and IOC/IPC governance documents. These are cross-sport documents not tied to any single NGB. Generate a CSV file with one row per document found. Only include documents with real, publicly accessible URLs that you have verified.

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

- `id` — Slug identifier (lowercase, hyphens only, e.g., `olympic-charter`). Auto-generated from title if blank.
- `format` — `pdf`, `html`, or `text`. Default: `pdf`
- `priority` — `high`, `medium`, or `low`. Default: `medium`
- `authorityLevel` — Must be exactly one of: `law`, `international_rule`, `usopc_governance`, `usopc_policy_procedure`, `independent_office`, `anti_doping_national`, `ngb_policy_procedure`, `games_event_specific`, `educational_guidance`. Default: `educational_guidance`
- `ngbId` — **Leave blank** for all rows in this prompt. These are cross-sport documents.

## What to Search For

Search for the following categories of documents. Leave `ngbId` blank for all rows.

### 1. Section 8 Complaint Decisions

Published decisions from USOPC Section 8 complaints (NGB compliance complaints filed by athletes or members).

- `documentType`: `procedure`
- `topicDomains`: `dispute_resolution|governance`
- `authorityLevel`: `usopc_policy_procedure`
- `priority`: `high`

Search tips:

- Try `USOPC "Section 8" complaint decision`
- Check `teamusa.org` governance and compliance pages
- Look for published findings or outcomes of Section 8 proceedings

### 2. Section 9 Arbitration Decisions

Published CAS/AAA arbitration awards under Section 9 of the Ted Stevens Olympic and Amateur Sports Act (opportunity-to-compete claims).

- `documentType`: `procedure`
- `topicDomains`: `dispute_resolution|team_selection`
- `authorityLevel`: `usopc_policy_procedure`
- `priority`: `high`

Search tips:

- Try `USOPC "Section 9" arbitration award` and `"Ted Stevens Act" Section 9 arbitration`
- Check CAS (Court of Arbitration for Sport) and AAA (American Arbitration Association) published awards
- Look for landmark decisions cited in athlete rights resources

### 3. USOPC Athlete Ombudsman Resources

Guides, FAQs, educational materials, and informational documents from the USOPC Athlete Ombudsman.

- `documentType`: `policy`
- `topicDomains`: `athlete_rights|dispute_resolution`
- `authorityLevel`: `educational_guidance`
- `priority`: `medium`

Search tips:

- Try `USOPC "Athlete Ombudsman"` and `"athlete ombudsman" guide resources`
- Check `www.usathlete.org` and Team USA governance pages
- Look for athlete guides, FAQ documents, know-your-rights resources

### 4. IOC / IPC Governance Documents

Olympic Charter, IPC Handbook, Athletes' Rights and Responsibilities Declaration, IOC Code of Ethics, and similar international governance documents.

- `documentType`: `code`
- `topicDomains`: `governance|athlete_rights`
- `authorityLevel`: `international_rule`
- `priority`: `medium`

Search tips:

- Try `IOC Olympic Charter filetype:pdf` and `IPC Handbook filetype:pdf`
- Try `IOC Athletes' Rights and Responsibilities Declaration`
- Try `IOC Code of Ethics` and `IPC Code of Ethics`
- Check `olympics.com` and `paralympic.org` official document pages

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
"Olympic Charter (2024 Edition)",code,governance|athlete_rights,https://stillmed.olympics.com/media/Document%20Library/OlympicOrg/General/EN-Olympic-Charter.pdf,"The foundational document of the Olympic Movement defining athlete rights and participation rules",olympic-charter,pdf,medium,international_rule,
"IPC Handbook",code,governance|athlete_rights,https://www.paralympic.org/ipc-handbook,"International Paralympic Committee handbook governing Paralympic sport including classification and eligibility",ipc-handbook,html,medium,international_rule,
"USOPC Athlete Ombudsman FAQ",policy,athlete_rights|dispute_resolution,https://www.usathlete.org/faq,"Frequently asked questions about athlete rights and the role of the Athlete Ombudsman in dispute resolution",usopc-ombudsman-faq,html,medium,educational_guidance,
```

## Output

Generate the complete CSV file. Start with the header row, then one row per document. Wrap any field containing commas in double quotes. After the CSV, provide a brief summary listing:

1. How many documents you found per category (Section 8, Section 9, Ombudsman, IOC/IPC)
2. Any categories where you could not find documents

---

_Tips: Section 8 and Section 9 decisions can be hard to find — not all are published publicly. Include whatever you can verify. IOC/IPC documents are usually well-catalogued on official sites. Update the skip list above before each run — check `/admin/sources` for current IDs._
