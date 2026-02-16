#!/usr/bin/env bash
# Hook: Agent-Change Guard
# Event: PostToolUse (Edit, Write)
# Non-blocking reminder when agent code is modified.

# Read JSON from stdin
input=$(cat)

# Parse the file path from JSON input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Check if the file is in the agent code directory
if echo "$file_path" | grep -q 'packages/core/src/agent/'; then
  echo "Agent code modified. Run /eval-check before committing to catch quality regressions."
fi
