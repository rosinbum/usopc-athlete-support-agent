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
const readmePath = path.join(repoRoot, "README.md");

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

function updateReadme(readme, replacement) {
  const start = "<!-- HOURS:START -->";
  const end = "<!-- HOURS:END -->";
  const startIdx = readme.indexOf(start);
  const endIdx = readme.indexOf(end);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return (
      readme.trimEnd() + "\n\n" + start + "\n" + replacement + "\n" + end + "\n"
    );
  }

  const before = readme.slice(0, startIdx + start.length);
  const after = readme.slice(endIdx);
  return `${before}\n\n${replacement}\n${after}`;
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
  const snippet = [
    `**Tracked build time:** ${pretty} hours`,
    ``,
    `- Method: terminal-activity-based (idle cutoff: ${IDLE_CUTOFF_MIN} min)`,
    `- Last updated: ${now}`,
  ].join("\n");

  let readme = fs.existsSync(readmePath)
    ? fs.readFileSync(readmePath, "utf8")
    : "";
  readme = updateReadme(readme, snippet);
  readme = readme.replace(
    /approximately \d+(\.\d+)? hours/,
    `approximately ${pretty} hours`,
  );
  fs.writeFileSync(readmePath, readme, "utf8");

  console.log(`Updated README with ${pretty} hours.`);
}

main();
