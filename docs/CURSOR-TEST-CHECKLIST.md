# TokViz — Checklist test Cursor (priorité)

**Scope actuel :** Cursor uniquement. Copilot / Antigravity = tâche ultérieure.  
**Projet test :** `dataint-dcm-app/packages/dcm-backend` (FastAPI + pytest — bon pour démo TokViz)  
**Rapports locaux :** `rapports/` (gitignored)

---

## 1. Install

```bash
cd ~/Desktop/tok-viz
pnpm install && pnpm build && pnpm link --global
tokviz doctor
```

Attendu : `✔ ~/.tokviz exists`

---

## 2. Hooks Cursor (global)

```bash
tokviz init -g --agent cursor --enterprise
```

Puis **redémarrer Cursor** (obligatoire).

Vérifier :

```bash
tokviz doctor
# ✔ cursor hooks (~/.cursor/hooks.json)
#   ✔ hook script
```

Fichier attendu : `~/.cursor/hooks.json` contient `tokviz`.

---

## 3. Test hook manuel (sans IDE)

Simule ce que Cursor envoie aux hooks :

```bash
# Shell output long → compression
echo '{"hook_event_name":"afterShellExecution","conversation_id":"test-cursor-001","command":"git diff","output":"'"$(python3 -c 'print("line\\n"*150)')"'"}' \
  | TOKVIZ_AGENT=cursor tokviz hook | head -c 200

# Réponse agent → tracking
echo '{"hook_event_name":"afterAgentResponse","conversation_id":"test-cursor-001","text":"Sure! I would be happy to help you with that. Bug in auth middleware. Fix token check."}' \
  | TOKVIZ_AGENT=cursor tokviz hook

tokviz stats --json | head -30
tokviz gain
```

Attendu :
- `eventCount` > 0
- `tokensSaved` > 0 sur gros `git diff`
- session `test-cursor-001` visible dans `stats`

> **Mode `--enterprise` :** `gain` n'affiche pas le top commandes (contenu masqué). Totaux `Raw` / `Saved` restent corrects.

---

## 4. Test réel dans Cursor (2 endroits séparés)

### Où tu fais quoi ?

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  CURSOR (IDE)               │     │  TERMINAL (après la session) │
│  Tu parles à l'agent        │     │  Tu lis les stats TokViz     │
│  dataint-dcm-app ouvert     │     │  cd tok-viz → gain / stats   │
└─────────────────────────────┘     └──────────────────────────────┘
         │                                        │
         │  hooks enregistrent                    │  lit ~/.tokviz/events.json
         └────────────────────────────────────────┘
```

**Tu ne lances PAS `gain` pendant que l'agent travaille.** D'abord session Cursor, **puis** terminal.

### Étape A — Dans Cursor

1. Ouvrir le dossier **`dataint-dcm-app`** (racine, pas un sous-package seul)
2. Nouvelle session **Agent**
3. Coller ce prompt :

```text
Package dcm-backend (FastAPI). Lis tests/test_notification_preferences.py.
Lance: cd packages/dcm-backend && uv run pytest tests/test_notification_preferences.py -v --tb=short
Résume en 3 points ce que ces tests vérifient. Réponse concise.
```

4. Laisser l'agent finir (ou 10 min max). **Fermer rien — juste attendre la fin.**

### Étape B — Dans le terminal (après)

```bash
cd ~/Desktop/tok-viz/packages/cli
node dist/index.js gain
node dist/index.js stats
mkdir -p ~/Desktop/tok-viz/rapports
node dist/index.js stats --json > ~/Desktop/tok-viz/rapports/cursor-dcm-backend.json
```

**Pourquoi `cd tok-viz/packages/cli` ?**  
C'est là que vit le programme `tokviz` (`dist/index.js`). Tu n'es pas dans DCM ici — tu **lis les compteurs** que les hooks Cursor ont écrit dans `~/.tokviz/`.

**Pourquoi pas `tokviz` direct ?**  
Si la commande globale n'est pas installée (`pnpm setup` manquant), `node dist/index.js` marche toujours.

**Le fichier JSON** → sauvegarde locale dans `rapports/` (gitignored), pour ta présentation équipe plus tard.

---

## 5. Critères OK / KO

| Check | OK | KO → action |
|-------|-----|-------------|
| `tokviz doctor` cursor ✔ | Hooks installés | `tokviz init -g --agent cursor` + restart |
| `eventCount` > 0 | Tracking actif | Vérifier `~/.cursor/hooks.json` |
| `tokensSaved` > 0 sur pytest | Compression shell | Pas `--track-only` |
| `agent: "cursor"` dans JSON | Bon agent taggé | `TOKVIZ_AGENT=cursor` dans hook.sh |
| Skills prose (optionnel) | `.cursor/skills/tokviz-*` | `tokviz init --agent cursor --prose lite` depuis repo |

---

## 6. Tests automatisés package

```bash
cd ~/Desktop/tok-viz
pnpm test
```

Attendu : tokens, redactSecrets, compressShellOutput verts.

---

## 7. Export rapport local

```bash
mkdir -p rapports
tokviz gain > rapports/gain-cursor-$(date +%F).txt
tokviz stats --json > rapports/stats-cursor-$(date +%F).json
```

Dossier `rapports/` = local only, pas commité.

---

## 8. Comparer les sessions

Voir **[COMPARER-SESSIONS.md](./COMPARER-SESSIONS.md)** — commandes pour lister, comparer 2 sessions, exporter JSON.

Récap rapide :

```bash
tokviz stats --json | jq '.sessions | sort_by(.startedAt) | .[-2:]'
```

---

## 9. Plus tard (hors scope maintenant)

- [ ] Copilot VS Code
- [ ] Antigravity CLI (post 18/06/2026)
- [ ] `tokviz compare` multi-sessions
- [ ] `tokviz report` Markdown

Voir [PROTOCOLE-TEST-DCM-AWS-COLLECTOR.md](./PROTOCOLE-TEST-DCM-AWS-COLLECTOR.md) quand multi-agent sera prioritaire.
