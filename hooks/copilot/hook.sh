#!/usr/bin/env bash
# TokViz hook for GitHub Copilot VS Code
set -euo pipefail

export TOKVIZ_AGENT=copilot

if command -v tokviz >/dev/null 2>&1; then
  tokviz hook
else
  npx --yes @tokviz/cli@0.1.0 hook 2>/dev/null || echo '{}'
fi
