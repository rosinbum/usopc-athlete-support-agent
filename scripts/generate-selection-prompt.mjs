#!/usr/bin/env node
import { readFileSync } from "node:fs";

const NGB_MAP = new Map([
  [
    "usa-archery",
    { name: "USA Archery", website: "https://www.usarchery.org" },
  ],
  [
    "usa-badminton",
    { name: "USA Badminton", website: "https://www.usabadminton.org" },
  ],
  [
    "usa-basketball",
    { name: "USA Basketball", website: "https://www.usab.com" },
  ],
  [
    "usa-biathlon",
    { name: "USA Biathlon", website: "https://www.teamusa.org/us-biathlon" },
  ],
  [
    "usa-bobsled-skeleton",
    {
      name: "USA Bobsled & Skeleton",
      website: "https://www.bobsledskeleton.org",
    },
  ],
  ["usa-boxing", { name: "USA Boxing", website: "https://www.usaboxing.org" }],
  [
    "usa-canoe-kayak",
    { name: "USA Canoe/Kayak", website: "https://www.usacanoekayak.org" },
  ],
  [
    "usa-climbing",
    { name: "USA Climbing", website: "https://www.usaclimbing.org" },
  ],
  [
    "usa-cricket",
    { name: "USA Cricket", website: "https://www.usacricket.org" },
  ],
  [
    "usa-curling",
    { name: "USA Curling", website: "https://www.usacurling.org" },
  ],
  [
    "usa-cycling",
    { name: "USA Cycling", website: "https://www.usacycling.org" },
  ],
  ["usa-diving", { name: "USA Diving", website: "https://www.usadiving.org" }],
  ["us-equestrian", { name: "US Equestrian", website: "https://www.usef.org" }],
  ["us-fencing", { name: "US Fencing", website: "https://www.usafencing.org" }],
  [
    "us-field-hockey",
    { name: "US Field Hockey", website: "https://www.usfieldhockey.com" },
  ],
  [
    "us-figure-skating",
    { name: "US Figure Skating", website: "https://www.usfigureskating.org" },
  ],
  [
    "usa-flag-football",
    { name: "USA Flag Football", website: "https://www.usaflagfootball.org" },
  ],
  ["usa-golf", { name: "USA Golf", website: "https://www.usagolf.org" }],
  ["usa-gymnastics", { name: "USA Gymnastics", website: "https://usagym.org" }],
  ["usa-hockey", { name: "USA Hockey", website: "https://www.usahockey.com" }],
  ["usa-judo", { name: "USA Judo", website: "https://www.usajudo.com" }],
  [
    "usa-karate",
    { name: "USA Karate", website: "https://www.teamusa.org/usa-karate" },
  ],
  [
    "usa-lacrosse",
    { name: "USA Lacrosse", website: "https://www.usalacrosse.com" },
  ],
  ["usa-luge", { name: "USA Luge", website: "https://www.usaluge.org" }],
  [
    "usa-modern-pentathlon",
    { name: "USA Modern Pentathlon", website: "https://www.usapentathlon.org" },
  ],
  ["us-rowing", { name: "US Rowing", website: "https://www.usrowing.org" }],
  ["us-rugby", { name: "US Rugby", website: "https://www.usa.rugby" }],
  ["us-sailing", { name: "US Sailing", website: "https://www.ussailing.org" }],
  [
    "us-shooting",
    { name: "US Shooting", website: "https://www.usashooting.org" },
  ],
  [
    "us-ski-snowboard",
    {
      name: "US Ski & Snowboard",
      website: "https://www.usskiandsnowboard.org",
    },
  ],
  ["us-soccer", { name: "US Soccer", website: "https://www.ussoccer.com" }],
  [
    "usa-softball",
    { name: "USA Softball", website: "https://www.usasoftball.com" },
  ],
  [
    "us-speedskating",
    { name: "US Speedskating", website: "https://www.usspeedskating.org" },
  ],
  ["us-squash", { name: "US Squash", website: "https://www.ussquash.org" }],
  [
    "usa-surfing",
    { name: "USA Surfing", website: "https://www.usasurfing.org" },
  ],
  [
    "usa-swimming",
    { name: "USA Swimming", website: "https://www.usaswimming.org" },
  ],
  [
    "usa-table-tennis",
    { name: "USA Table Tennis", website: "https://www.usatt.org" },
  ],
  [
    "usa-taekwondo",
    { name: "USA Taekwondo", website: "https://www.usa-taekwondo.us" },
  ],
  [
    "usa-team-handball",
    { name: "USA Team Handball", website: "https://www.usateamhandball.org" },
  ],
  ["usa-tennis", { name: "USA Tennis", website: "https://www.usta.com" }],
  [
    "usa-track-field",
    { name: "USA Track & Field", website: "https://www.usatf.org" },
  ],
  [
    "usa-triathlon",
    { name: "USA Triathlon", website: "https://www.usatriathlon.org" },
  ],
  [
    "usa-volleyball",
    { name: "USA Volleyball", website: "https://www.usavolleyball.org" },
  ],
  [
    "usa-water-polo",
    { name: "USA Water Polo", website: "https://www.usawaterpolo.org" },
  ],
  [
    "usa-weightlifting",
    { name: "USA Weightlifting", website: "https://www.usaweightlifting.org" },
  ],
  [
    "usa-wrestling",
    { name: "USA Wrestling", website: "https://www.usawrestling.org" },
  ],
  [
    "usopc-skateboarding",
    {
      name: "Skateboarding (USOPC-managed)",
      website: "https://www.teamusa.org/usa-skateboarding",
    },
  ],
  [
    "usopc-breaking",
    {
      name: "Breaking (USOPC-managed)",
      website: "https://www.teamusa.org/usa-breaking",
    },
  ],
]);

const arg = process.argv[2];

if (!arg) {
  console.error("Usage: node scripts/generate-selection-prompt.mjs <ngb-id>");
  console.error("       node scripts/generate-selection-prompt.mjs --list");
  process.exit(1);
}

if (arg === "--list") {
  for (const [id, { name }] of NGB_MAP) {
    console.log(`${id.padEnd(24)} ${name}`);
  }
  process.exit(0);
}

const ngb = NGB_MAP.get(arg);
if (!ngb) {
  console.error(`Unknown NGB ID: "${arg}"`);
  console.error("Run with --list to see all valid NGB IDs.");
  process.exit(1);
}

// Read template — everything after the first "---" line
const templatePath = new URL(
  "../docs/prompts/02-selection-procedures.md",
  import.meta.url,
);
const raw = readFileSync(templatePath, "utf-8");
const dashIndex = raw.indexOf("\n---\n");
if (dashIndex === -1) {
  console.error("Could not find --- delimiter in template file.");
  process.exit(1);
}
let prompt = raw.slice(dashIndex + "\n---\n".length);

// Try to fetch live source IDs for the skip list
try {
  const res = await fetch("http://localhost:3000/api/admin/sources");
  if (res.ok) {
    const data = await res.json();
    const ids = (data.sources || []).map((s) => s.id);
    if (ids.length > 0) {
      const bulletList = ids.map((id) => `- \`${id}\``).join("\n");
      // Replace the existing "Already Imported" bullet list
      prompt = prompt.replace(
        /(?<=Do not include documents with these IDs — they are already in the system:\n\n)- `.+?`(\n- `.+?`)*/,
        bulletList,
      );
      console.error(
        `(Using live skip list: ${ids.length} source IDs from dev server)`,
      );
    }
  } else {
    console.error("(Dev server returned non-OK; using static skip list)");
  }
} catch {
  console.error("(Dev server not running; using static skip list)");
}

// Replace placeholders
prompt = prompt.replaceAll("[NGB_NAME]", ngb.name);
prompt = prompt.replaceAll("[NGB_ID]", arg);
prompt = prompt.replaceAll("[NGB_WEBSITE]", ngb.website);

process.stdout.write(prompt);
