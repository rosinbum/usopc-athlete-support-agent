#!/usr/bin/env bash
# Hook: Migration Review Reminder
# Event: PostToolUse (Write)
# Non-blocking reminder when a new migration file is created.

# Read JSON from stdin
input=$(cat)

# Parse the file path from JSON input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Check if the file is in a migrations directory
if echo "$file_path" | grep -q '/migrations/'; then
  echo "New migration file created. Review for reversibility and index impact before committing."
fi
