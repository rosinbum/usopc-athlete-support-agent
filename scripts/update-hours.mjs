#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();

// Config
const IDLE_CUTOFF_MIN = Number(process.env.IDLE_CUTOFF_MIN ?? 10);
const MAX_GAP_MS = IDLE_CUTOFF_MIN * 60 * 1000;

function gitCommonDir(root) {
  const out = execSync("git rev-parse --git-common-dir", {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (path.isAbsolute(out)) return out;
  return path.join(root, out);
}

const commonDir = gitCommonDir(repoRoot);
const eventsPath = path.join(commonDir, "time-tracker", "events.jsonl");
const hoursJsonPath = path.join(repoRoot, ".hours.json");

function parseEvents(jsonl) {
  return jsonl
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const e = JSON.parse(line);
        return { ts: new Date(e.ts).getTime() };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

function computeActiveMs(events) {
  if (events.length < 2) return 0;
  let active = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = events[i].ts - events[i - 1].ts;
    active += Math.min(Math.max(gap, 0), MAX_GAP_MS);
  }
  return active;
}

function main() {
  const eventsJsonl = fs.existsSync(eventsPath)
    ? fs.readFileSync(eventsPath, "utf8")
    : "";
  const events = parseEvents(eventsJsonl);

  const activeMs = computeActiveMs(events);
  const hours = activeMs / (1000 * 60 * 60);
  const pretty = hours.toFixed(1);

  const now = new Date().toISOString().replace(".000Z", "Z");
  const data = {
    hours: Number(pretty),
    idleCutoffMin: IDLE_CUTOFF_MIN,
    updatedAt: now,
  };

  fs.writeFileSync(hoursJsonPath, JSON.stringify(data) + "\n", "utf8");
  console.log(`Updated .hours.json with ${pretty} hours.`);
}

main();
