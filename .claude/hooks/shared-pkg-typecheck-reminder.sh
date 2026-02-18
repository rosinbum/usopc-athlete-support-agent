#!/usr/bin/env bash
# Hook: Shared Package Typecheck Reminder
# Event: PostToolUse (Edit, Write)
# Non-blocking reminder when shared package files are modified.

# Read JSON from stdin
input=$(cat)

# Parse the file path from JSON input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Check if the file is in the shared package source directory
if echo "$file_path" | grep -q 'packages/shared/src/'; then
  echo "Shared package modified. Run 'pnpm typecheck' (full monorepo) — shared changes affect all consumers."
fi
