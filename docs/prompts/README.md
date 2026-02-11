# Source CSV Generation Prompts

Segmented prompts for generating source document CSVs with an LLM that has web search (ChatGPT with browsing, Perplexity, Claude with web search, etc.). The generated CSVs are imported via the admin UI at `/admin/sources/bulk-import`.

## Why Segmented?

A single monolithic prompt asking for 6+ document types across 49 NGBs overwhelms LLMs — causing timeouts, incomplete results, and hallucinated URLs. These focused prompts produce higher-quality output.

## Prompt Files

| File                         | Scope                                                    | Run style                               |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `01-bylaws.md`               | NGB bylaws and constitutions                             | Once — covers all NGBs                  |
| `02-selection-procedures.md` | Selection procedures (Olympic, Paralympic, Worlds, etc.) | **Once per NGB** — fill in placeholders |
| `03-safesport.md`            | SafeSport / MAAP policies                                | Once — covers all NGBs                  |
| `04-rulebooks.md`            | Competition rulebooks and regulations                    | Once — covers all NGBs                  |
| `05-dispute-resolution.md`   | Grievance procedures, codes of conduct                   | Once — covers all NGBs                  |
| `06-usopc-cross-sport.md`    | USOPC Section 8/9, Ombudsman, IOC/IPC docs               | Once — no NGB scope                     |

## Recommended Run Order

1. **`06-usopc-cross-sport.md`** — Smallest scope, good warm-up to verify your workflow.
2. **`01-bylaws.md`** — One doc per NGB, straightforward to verify.
3. **`03-safesport.md`** — One doc per NGB, similar pattern.
4. **`04-rulebooks.md`** — One doc per NGB.
5. **`05-dispute-resolution.md`** — May yield fewer results; some NGBs don't publish these.
6. **`02-selection-procedures.md`** — Run once per NGB. Start with high-priority NGBs.

## How to Run a Prompt

1. Open the prompt file and copy everything **below the `---` line**.
2. Paste into your LLM chat.
3. Review the CSV output — check that URLs look plausible.
4. **Verify URLs manually** before importing. LLMs hallucinate URLs. The bulk import preview step helps catch bad data.
5. Import via `/admin/sources/bulk-import`.

## Running Selection Procedures (02)

The selection procedures prompt is a **template**. For each NGB:

1. Copy the prompt.
2. Replace `[NGB_NAME]` with the full organization name (e.g., "USA Triathlon").
3. Replace `[NGB_ID]` with the ID from the table below (e.g., "usa-triathlon").
4. Replace `[NGB_WEBSITE]` with the NGB's website (e.g., "https://www.usatriathlon.org").
5. Run the prompt.

Prioritize NGBs with the most complex selection landscapes first (track & field, swimming, gymnastics, skiing, etc.).

## Merging CSVs

Each prompt produces a CSV with the same header row. To merge:

```bash
# Keep the header from the first file, strip headers from the rest
head -1 bylaws.csv > combined.csv
for f in bylaws.csv safesport.csv rulebooks.csv disputes.csv usopc.csv selection-*.csv; do
  tail -n +2 "$f" >> combined.csv
done
```

Or simply import each CSV separately through the bulk import UI — the system handles deduplication by `id`.

## Updating the Skip List

Before each run, check the admin UI at `/admin/sources` for currently imported document IDs. Update the "Already Imported" section in each prompt file to prevent duplicates. The skip list is identical across all prompt files.

## Master NGB Reference

Use this table to fill in the selection procedures template. All 49 NGBs:

| ID                    | Organization                  | Website                                   |
| --------------------- | ----------------------------- | ----------------------------------------- |
| usa-archery           | USA Archery                   | https://www.usarchery.org                 |
| usa-badminton         | USA Badminton                 | https://www.usabadminton.org              |
| usa-basketball        | USA Basketball                | https://www.usab.com                      |
| usa-biathlon          | USA Biathlon                  | https://www.teamusa.org/us-biathlon       |
| usa-bobsled-skeleton  | USA Bobsled & Skeleton        | https://www.bobsledskeleton.org           |
| usa-boxing            | USA Boxing                    | https://www.usaboxing.org                 |
| usa-canoe-kayak       | USA Canoe/Kayak               | https://www.usacanoekayak.org             |
| usa-climbing          | USA Climbing                  | https://www.usaclimbing.org               |
| usa-cricket           | USA Cricket                   | https://www.usacricket.org                |
| usa-curling           | USA Curling                   | https://www.usacurling.org                |
| usa-cycling           | USA Cycling                   | https://www.usacycling.org                |
| usa-diving            | USA Diving                    | https://www.usadiving.org                 |
| us-equestrian         | US Equestrian                 | https://www.usef.org                      |
| us-fencing            | US Fencing                    | https://www.usafencing.org                |
| us-field-hockey       | US Field Hockey               | https://www.usfieldhockey.com             |
| us-figure-skating     | US Figure Skating             | https://www.usfigureskating.org           |
| usa-flag-football     | USA Flag Football             | https://www.usaflagfootball.org           |
| usa-golf              | USA Golf                      | https://www.usagolf.org                   |
| usa-gymnastics        | USA Gymnastics                | https://usagym.org                        |
| usa-hockey            | USA Hockey                    | https://www.usahockey.com                 |
| usa-judo              | USA Judo                      | https://www.usajudo.com                   |
| usa-karate            | USA Karate                    | https://www.teamusa.org/usa-karate        |
| usa-lacrosse          | USA Lacrosse                  | https://www.usalacrosse.com               |
| usa-luge              | USA Luge                      | https://www.usaluge.org                   |
| usa-modern-pentathlon | USA Modern Pentathlon         | https://www.usapentathlon.org             |
| us-rowing             | US Rowing                     | https://www.usrowing.org                  |
| us-rugby              | US Rugby                      | https://www.usa.rugby                     |
| us-sailing            | US Sailing                    | https://www.ussailing.org                 |
| us-shooting           | US Shooting                   | https://www.usashooting.org               |
| us-ski-snowboard      | US Ski & Snowboard            | https://www.usskiandsnowboard.org         |
| us-soccer             | US Soccer                     | https://www.ussoccer.com                  |
| usa-softball          | USA Softball                  | https://www.usasoftball.com               |
| us-speedskating       | US Speedskating               | https://www.usspeedskating.org            |
| us-squash             | US Squash                     | https://www.ussquash.org                  |
| usa-surfing           | USA Surfing                   | https://www.usasurfing.org                |
| usa-swimming          | USA Swimming                  | https://www.usaswimming.org               |
| usa-table-tennis      | USA Table Tennis              | https://www.usatt.org                     |
| usa-taekwondo         | USA Taekwondo                 | https://www.usa-taekwondo.us              |
| usa-team-handball     | USA Team Handball             | https://www.usateamhandball.org           |
| usa-tennis            | USA Tennis                    | https://www.usta.com                      |
| usa-track-field       | USA Track & Field             | https://www.usatf.org                     |
| usa-triathlon         | USA Triathlon                 | https://www.usatriathlon.org              |
| usa-volleyball        | USA Volleyball                | https://www.usavolleyball.org             |
| usa-water-polo        | USA Water Polo                | https://www.usawaterpolo.org              |
| usa-weightlifting     | USA Weightlifting             | https://www.usaweightlifting.org          |
| usa-wrestling         | USA Wrestling                 | https://www.usawrestling.org              |
| usopc-skateboarding   | Skateboarding (USOPC-managed) | https://www.teamusa.org/usa-skateboarding |
| usopc-breaking        | Breaking (USOPC-managed)      | https://www.teamusa.org/usa-breaking      |
