#!/usr/bin/env node
/**
 * Reads .hours.json and stamps the hours into README.md.
 * Run on merge to main (post-merge hook or CI), NOT on every commit.
 */
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const hoursJsonPath = path.join(repoRoot, ".hours.json");
const readmePath = path.join(repoRoot, "README.md");

function main() {
  if (!fs.existsSync(hoursJsonPath)) {
    console.log("No .hours.json found, skipping README update.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(hoursJsonPath, "utf8"));
  const pretty = data.hours.toFixed(1);

  const start = "<!-- HOURS:START -->";
  const end = "<!-- HOURS:END -->";
  const snippet = [
    `**Tracked build time:** ${pretty} hours`,
    ``,
    `- Method: terminal-activity-based (idle cutoff: ${data.idleCutoffMin} min)`,
    `- Last updated: ${data.updatedAt}`,
  ].join("\n");

  let readme = fs.existsSync(readmePath)
    ? fs.readFileSync(readmePath, "utf8")
    : "";

  const startIdx = readme.indexOf(start);
  const endIdx = readme.indexOf(end);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = readme.slice(0, startIdx + start.length);
    const after = readme.slice(endIdx);
    readme = `${before}\n\n${snippet}\n${after}`;
  } else {
    readme =
      readme.trimEnd() + "\n\n" + start + "\n\n" + snippet + "\n" + end + "\n";
  }

  readme = readme.replace(
    /approximately \d+(\.\d+)? hours/,
    `approximately ${pretty} hours`,
  );

  fs.writeFileSync(readmePath, readme, "utf8");
  console.log(`Stamped README.md with ${pretty} hours.`);
}

main();
