#!/usr/bin/env bash
# TokViz hook for Gemini CLI
set -euo pipefail

export TOKVIZ_AGENT=gemini

if command -v tokviz >/dev/null 2>&1; then
  tokviz hook
else
  npx --yes @tokviz/cli@0.1.0 hook 2>/dev/null || echo '{}'
fi
