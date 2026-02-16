#!/usr/bin/env bash
# Hook: Test-Coverage Reminder
# Event: PostToolUse (Write)
# Non-blocking reminder when a new .ts file is created without a .test.ts counterpart.

# Read JSON from stdin
input=$(cat)

# Parse the file path from JSON input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Only check .ts files in src/ directories, skip test files and non-ts files
if echo "$file_path" | grep -q '/src/.*\.ts$' && ! echo "$file_path" | grep -q '\.test\.ts$' && ! echo "$file_path" | grep -q '\.d\.ts$'; then
  # Derive the expected test file path
  test_file="${file_path%.ts}.test.ts"

  # Check if the test file exists
  if [ ! -f "$test_file" ]; then
    basename=$(basename "$file_path")
    test_basename="${basename%.ts}.test.ts"
    echo "No test file found for $basename. Consider adding $test_basename."
  fi
fi
