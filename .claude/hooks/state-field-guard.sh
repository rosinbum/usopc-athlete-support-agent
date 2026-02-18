#!/usr/bin/env bash
# Hook: State-Field Guard
# Event: PostToolUse (Edit)
# Non-blocking reminder when agent state fields are modified.

# Read JSON from stdin
input=$(cat)

# Parse the file path from JSON input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Check if the file is the agent state definition
if echo "$file_path" | grep -q 'packages/core/src/agent/state\.ts'; then
  echo "State field change detected. Remember to update makeState/state factories across core, evals, web, and ingestion packages."
fi
