# TokViz

**Token tracker & shell compressor** for Cursor, GitHub Copilot, and Gemini CLI.

Local-first. No cloud. No account. Inspired by [RTK](https://github.com/rtk-ai/rtk) (shell compression via hooks) and [Caveman](https://github.com/JuliusBrussee/caveman) (prose compression via skills) — **not affiliated**.

**Author:** Zahra Maaziz · **License:** [Proprietary](LICENSE) — personal use OK, commercial requires written permission

---

## How it works

TokViz is **hooks + CLI only**. There is no VS Code extension and no LLM proxy.

When your agent runs shell commands or replies, the IDE calls TokViz hooks. Each hook forwards JSON on stdin to `tokviz hook`, which either compresses output before it enters agent context, or records token estimates to `~/.tokviz/events.json`.

```text
Agent (Cursor / Copilot / Gemini)
        │
        ▼
  IDE hooks (preToolUse / afterShellExecution / afterAgentResponse)
        │
        ▼
  ~/.tokviz/hooks/<agent>/hook.sh
        │
        ▼
  tokviz hook  ──►  @tokviz/core
        │              ├── compressShellOutput()  → return smaller output to agent
        │              └── track*()               → append to ~/.tokviz/events.json
        │
        ▼
  tokviz gain | stats | report   ← read events locally
```

### Two layers (RTK + Caveman)

| Layer | What it saves | How | Trigger |
|-------|---------------|-----|---------|
| **Shell** (RTK-style) | `git diff`, test logs, `grep` output… | Hooks intercept terminal output and compress before the agent reads it | Automatic when agent runs shell |
| **Prose** (Caveman-style) | Assistant replies in chat | Skills + Cursor rules shorten model output | Manual: `/tokviz lite`, `/tokviz full`, `/tokviz ultra` |

Shell compression is the main token win. Prose mode is optional and applies to the assistant's writing style, not terminal output.

### What gets measured

TokViz does **not** read Cursor's internal token counter or billing API. It **estimates** tokens from text the hooks see:

| Hook event | Data captured | Used for |
|------------|---------------|----------|
| `preToolUse` (Shell) | Command string | Input token estimate |
| `afterShellExecution` | Command + stdout/stderr | Compression + saved tokens |
| `afterAgentResponse` | Assistant message text | Response token estimate |

Estimation uses ~4 characters per token. Numbers are useful for **relative savings** (`tokviz gain`, session compare), not for matching your cloud invoice exactly.

### What it does not do

- No native Cursor / Copilot billing meter
- No cloud telemetry or account
- No remote control of the agent
- No fake/demo events — hooks only fire when the **agent** runs tools

---

## Quick start

```bash
# Clone & install (dev)
git clone git@github.com:<your-org>/tokviz.git
cd tokviz
pnpm install && pnpm build
pnpm link --global

# Setup for your agent
tokviz init -g --agent cursor   # or copilot | gemini

# Restart your IDE / CLI, then check stats
tokviz doctor
tokviz gain
```

Hooks need **agent mode** (Cursor Agent / Copilot Agent). A command typed manually in your terminal does not trigger TokViz.

Optional prose compression (project scope):

```bash
tokviz init --agent cursor --prose lite   # copies skills/ + rules/ into .cursor/
```

---

## Supported agents

| Agent | Status | Hooks file | Install |
|-------|--------|------------|---------|
| **Cursor** | ✅ MVP | `~/.cursor/hooks.json` | `tokviz init -g --agent cursor` |
| **GitHub Copilot** (VS Code) | ✅ MVP | `~/.copilot/hooks/tokviz-tracker.json` | `tokviz init -g --agent copilot` |
| **Gemini CLI** | ⚠️ Sunset 18 Jun 2026 → Antigravity | `~/.gemini/hooks.json` | `tokviz init -g --agent gemini` |
| **Antigravity CLI** | 🚧 Planned | TBD | — |

Installed hook scripts live in `~/.tokviz/hooks/<agent>/hook.sh` and always call `tokviz hook`.

---

## Commands

```bash
tokviz init -g --agent cursor          # install hooks globally
tokviz init -g --agent cursor --enterprise   # metrics only, no command text
tokviz init -g --agent cursor --track-only   # track, don't compress
tokviz hook                            # called by IDE hooks (stdin JSON) — not for humans
tokviz gain                            # savings summary
tokviz stats [--json] [--session <id>]
tokviz report [--since 7d] [-o file]   # report + recommendations
tokviz compare [sessA sessB] [--rank top]
tokviz doctor                          # verify hooks + ~/.tokviz/
tokviz uninstall -g --agent cursor
```

Full guide (FR): **[docs/INSTALL-GUIDE.md](docs/INSTALL-GUIDE.md)**  
Team presentation (FR): **[docs/PRESENTATION-EQUIPE.md](docs/PRESENTATION-EQUIPE.md)**  
Cursor test checklist: **[docs/CURSOR-TEST-CHECKLIST.md](docs/CURSOR-TEST-CHECKLIST.md)**  
Compare sessions (FR): **[docs/COMPARER-SESSIONS.md](docs/COMPARER-SESSIONS.md)**  
Multi-agent protocol (later): **[docs/PROTOCOLE-TEST-DCM-AWS-COLLECTOR.md](docs/PROTOCOLE-TEST-DCM-AWS-COLLECTOR.md)**

---

## Example output

```text
TokViz — Token Savings
────────────────────────────────────────
Raw:       142,800 tokens
Optimized: 89,200 tokens
Saved:     53,600 tokens (37.5%)

Top savings:
  git diff         -18,400 (71%)
  cargo test       -12,100 (82%)
```

---

## Security / enterprise

```bash
tokviz init -g --agent cursor --enterprise
```

- Data stays in `~/.tokviz/` on your machine
- `--enterprise`: no command content logged
- Secrets redacted before storage
- Fail-open hooks — never block the agent

Details: [docs/COPYRIGHT.md](docs/COPYRIGHT.md) · [SPEC §10](SPEC-tokviz-package.md)

---

## For the team

> **Feel free** on personal projects (free, non-commercial). Commercial use requires a written license from Zahra. On company code, use `--enterprise` and validate with security first. Everything runs locally — no data sent to TokViz servers.

Pair TokViz with agents that actually run shell commands (e.g. [ai-agents-kit](https://github.com/maazizit/ai-agents-kit)). Without agent-driven shell, hooks stay idle and stats stay at zero.

---

## Project structure

```text
tokviz/
├── packages/
│   ├── core/          # tracker, compressor, storage (~/.tokviz/)
│   └── cli/           # tokviz CLI + `tokviz hook` handler
├── hooks/             # cursor, copilot, gemini shell wrappers
├── skills/            # prose compression (/tokviz lite|full|ultra)
├── rules/cursor/      # optional Cursor rule for prose mode
├── docs/              # install guide, copyright
└── SPEC-tokviz-package.md
```

---

## Roadmap

- [x] Core tracker + shell compressor
- [x] CLI init / stats / gain / doctor / hook
- [x] Hooks Cursor, Copilot, Gemini
- [x] `tokviz report` — Markdown/HTML/JSON + recommendations
- [x] `tokviz compare` — session & agent comparison
- [ ] `antigravity` agent hooks (replace gemini post 2026-06-18)
- [ ] npm publish `@tokviz/cli`

Spec: [SPEC-tokviz-package.md](SPEC-tokviz-package.md)

---

## Contributing

Issues and PRs welcome. Keep changes focused. Run `pnpm build && pnpm test` before submitting.

---

## License

**Proprietary** © 2026 Zahra Maaziz — see [LICENSE](LICENSE).

- ✅ Personal & evaluation use — free
- ❌ Commercial use — contact [zahra.maaziz08@gmail.com](mailto:zahra.maaziz08@gmail.com) for a license
- Details: [docs/COPYRIGHT.md](docs/COPYRIGHT.md)
