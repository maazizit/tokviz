#!/usr/bin/env bash
# TokViz installer — review before running in enterprise environments
set -euo pipefail

echo "TokViz installer"
echo "================"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20+ required. Install from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js 20+ required (found $(node -v))"
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  echo "Installing with pnpm..."
  if [ -f package.json ] && [ -d packages/cli ]; then
    pnpm install
    pnpm build
    pnpm link --global
  else
    npm install -g @tokviz/cli
  fi
elif command -v npm >/dev/null 2>&1; then
  echo "Installing with npm..."
  if [ -f package.json ] && [ -d packages/cli ]; then
    npm install
    npm run build
    npm link -w packages/cli
  else
    npm install -g @tokviz/cli
  fi
else
  echo "Error: npm or pnpm required"
  exit 1
fi

chmod +x hooks/*/hook.sh 2>/dev/null || true

echo ""
echo "Done. Next steps:"
echo "  tokviz init -g --agent cursor    # or copilot / gemini"
echo "  tokviz doctor"
echo ""
echo "See docs/INSTALL-GUIDE.md for full guide."
