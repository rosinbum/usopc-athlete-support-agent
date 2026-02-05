#!/usr/bin/env bash
set -euo pipefail

COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 0
EVENTS_DIR="$COMMON_DIR/time-tracker"
mkdir -p "$EVENTS_DIR"

printf '{"ts":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$EVENTS_DIR/events.jsonl"
