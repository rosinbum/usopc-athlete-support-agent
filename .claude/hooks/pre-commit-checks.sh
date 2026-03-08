#!/usr/bin/env bash
# Hook: Pre-Commit Quality Gate
# Event: PreToolUse (Bash git commit)
# Reminds Claude to run tests and typecheck before committing.
# Non-blocking — prints a warning if checks haven't been run recently.

# Read JSON from stdin
input=$(cat)

# Get the working directory (worktree or main repo)
cwd=$(echo "$input" | jq -r '.cwd // empty')
project_dir="${cwd:-$CLAUDE_PROJECT_DIR}"

# Check if tests and typecheck have been run in this session
# by looking for recent test output files or just remind every time
echo "Pre-commit reminder: Ensure you have run 'pnpm --filter @usopc/<pkg> test' and 'pnpm typecheck' before committing. CI will catch failures, but running locally saves a round-trip."
