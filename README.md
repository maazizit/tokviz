# TokViz

**Token tracker & shell compressor** for Cursor, GitHub Copilot, and Gemini CLI.

Local-first. No cloud. No account. Inspired by [RTK](https://github.com/rtk-ai/rtk) (shell) and [Caveman](https://github.com/JuliusBrussee/caveman) (prose) — **not affiliated**.

**Author:** Zahra Maaziz · **License:** [Proprietary](LICENSE) — personal use OK, commercial requires written permission

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
tokviz gain
tokviz doctor
```

---

## Supported agents

| Agent | Status | Install |
|-------|--------|---------|
| **Cursor** | ✅ MVP | `tokviz init -g --agent cursor` |
| **GitHub Copilot** (VS Code) | ✅ MVP | `tokviz init -g --agent copilot` |
| **Gemini CLI** | ⚠️ Sunset 18 Jun 2026 → Antigravity | `tokviz init -g --agent gemini` |
| **Antigravity CLI** | 🚧 Planned | `agy` — hooks TBD |
| VS Code extension (charts) | 🚧 Planned | — |

---

## What it does

1. **Tracks** token usage locally (`~/.tokviz/events.json`)
2. **Compresses** shell output (`git diff`, tests, `grep`…) before it hits agent context
3. **Optional prose mode** via skills (`/tokviz lite|full|ultra`)

What it does **not** do:

- No LLM proxy (unlike Headroom)
- No cloud telemetry
- No mandatory account

---

## Commands

```bash
tokviz init -g --agent cursor          # install hooks globally
tokviz init -g --agent cursor --enterprise   # metrics only, no command text
tokviz init -g --agent cursor --track-only   # track, don't compress
tokviz gain                            # savings summary
tokviz stats [--json] [--session <id>]
tokviz report [--since 7d] [-o file]   # report + recommendations
tokviz compare [sessA sessB] [--rank top]
tokviz doctor                          # verify installation
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

---

## Project structure

```text
tokviz/
├── packages/core/     # tracker, compressor, storage
├── packages/cli/      # tokviz CLI
├── hooks/             # cursor, copilot, gemini
├── skills/            # prose compression
├── rules/cursor/      # Cursor rules
├── docs/              # install guide, copyright
└── SPEC-tokviz-package.md
```

---

## Roadmap

- [x] Core tracker + shell compressor
- [x] CLI init / stats / gain / doctor
- [x] Hooks Cursor, Copilot, Gemini
- [x] `tokviz report` — Markdown/HTML/JSON + recommendations
- [x] `tokviz compare` — session & agent comparison
- [ ] `antigravity` agent hooks (replace gemini post 2026-06-18)
- [ ] VS Code extension with charts
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
