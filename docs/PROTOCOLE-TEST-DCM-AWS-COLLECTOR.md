# Protocole de test TokViz — `dcm-aws-collector`

> **Statut : tâche ultérieure.** Priorité actuelle : [CURSOR-TEST-CHECKLIST.md](./CURSOR-TEST-CHECKLIST.md) (Cursor seul).

**Objectif :** comparer Cursor, GitHub Copilot (VS Code) et Antigravity CLI sur **la même tâche**, avec métriques TokViz fiables.

**Projet cible :**  
`/Users/zahramaaziz/Desktop/new squad/dataint-dcm-app/packages/dcm-aws-collector`

**Durée :** ~45 min (3 sessions × 15 min)

---

## 0. Contexte Gemini CLI → Antigravity

| Date | Événement |
|------|-----------|
| **18 juin 2026** | Gemini CLI arrête de servir les requêtes (free, Google AI Pro/Ultra) |
| **Remplacement** | **Antigravity CLI** (`agy`) — [annonce Google](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) |

**Pour ce protocole :**

- **Avant le 18/06** : tu peux encore tester `tokviz init -g --agent gemini` pour baseline historique.
- **Après le 18/06** : utiliser Antigravity CLI (`agy`). TokViz n'a pas encore d'agent `antigravity` dédié — hooks Gemini à migrer vers `~/.agy/` (voir §7).
- **Entreprise** (Gemini Code Assist Standard/Enterprise) : Gemini CLI reste supporté plus longtemps — préciser ton tier à l'équipe.

---

## 1. Préparation (une fois)

### 1.1 Installer TokViz

```bash
cd ~/Desktop/tok-viz   # ou chemin repo tok-viz
pnpm install && pnpm build && pnpm link --global
tokviz doctor
```

### 1.2 Installer hooks pour chaque agent

```bash
# Code entreprise DCM → mode enterprise recommandé
tokviz init -g --agent cursor --enterprise
tokviz init -g --agent copilot --enterprise

# Gemini : seulement si encore actif avant 18/06
tokviz init -g --agent gemini --enterprise
```

**Redémarrer** Cursor et VS Code après chaque `init`.

### 1.3 Ouvrir le bon workspace

| Agent | Dossier à ouvrir |
|-------|------------------|
| **Cursor** | Racine `dataint-dcm-app` (ou au minimum `packages/dcm-aws-collector`) |
| **Copilot VS Code** | Idem — racine repo pour `copilot-instructions.md` |
| **Antigravity / Gemini** | `cd packages/dcm-aws-collector` en terminal |

### 1.4 Baseline — vider ou taguer les events

```bash
# Option A : sauvegarder l'existant
cp ~/.tokviz/events.json ~/.tokviz/events-backup-$(date +%F).json 2>/dev/null || true

# Option B : repartir de zéro pour ce protocole
# mv ~/.tokviz/events.json ~/.tokviz/events-before-dcm-test.json
```

### 1.5 Vérifier hooks actifs

```bash
tokviz doctor
cat ~/.cursor/hooks.json | grep -i tokviz
cat ~/.copilot/hooks.json | grep -i tokviz 2>/dev/null || cat ~/.config/github-copilot/hooks.json 2>/dev/null
```

---

## 2. Tâche standardisée (identique pour les 3 agents)

**But :** générer du shell output (pytest) + réponses agent (explication) pour mesurer compression.

### 2.1 Prompt à copier-coller (exactement le même)

```text
Contexte: package dcm-aws-collector (Python 3.12, pytest, boto3 mocks).

Tâche:
1. Lis tests/test_cost_explorer_collector.py
2. Explique en 5 points ce que test_cost_explorer_collector couvre
3. Lance: cd packages/dcm-aws-collector && uv run pytest tests/test_cost_explorer_collector.py -v --tb=short
4. Si échec, propose fix minimal. Si vert, résume le résultat.

Contraintes: pas de refactor hors scope. Réponse concise.
```

### 2.2 Commandes shell attendues (TokViz doit les tracker)

```bash
cd "/Users/zahramaaziz/Desktop/new squad/dataint-dcm-app/packages/dcm-aws-collector"
uv run pytest tests/test_cost_explorer_collector.py -v --tb=short
git diff --stat tests/test_cost_explorer_collector.py
```

> Si l'agent n'exécute pas pytest tout seul, lance la commande manuellement dans le terminal intégré — les hooks `afterShellExecution` / `PreToolUse` comptent quand même.

---

## 3. Déroulé par agent (15 min chacun)

### Session A — Cursor

1. Nouvelle session chat Cursor (Agent mode)
2. Coller le prompt §2.1
3. Laisser l'agent travailler jusqu'à fin ou 15 min max
4. Noter l'heure de début/fin
5. Exporter :

```bash
tokviz stats --json > ~/Desktop/tok-viz/rapports/session-A-cursor-$(date +%F-%H%M).json
tokviz gain
```

6. Noter le `sessionId` dans la sortie JSON (champ `sessions[-1].sessionId`)

---

### Session B — GitHub Copilot (VS Code)

1. **Fermer Cursor** (éviter confusion hooks) ou utiliser une autre machine
2. Ouvrir VS Code sur `dataint-dcm-app`
3. Copilot Chat — mode Agent si dispo
4. Même prompt §2.1
5. Exporter :

```bash
tokviz stats --json > ~/Desktop/tok-viz/rapports/session-B-copilot-$(date +%F-%H%M).json
tokviz gain
```

---

### Session C — Antigravity CLI (ou Gemini avant 18/06)

**Si Antigravity (`agy`) :**

```bash
cd "/Users/zahramaaziz/Desktop/new squad/dataint-dcm-app/packages/dcm-aws-collector"
agy   # ou agy chat
# Coller prompt §2.1
```

**Si encore Gemini CLI (avant 18/06) :**

```bash
gemini
# Coller prompt §2.1
```

Exporter :

```bash
tokviz stats --json > ~/Desktop/tok-viz/rapports/session-C-antigravity-$(date +%F-%H%M).json
```

---

## 4. Critères de succès (hooks OK ?)

| Check | Attendu | Si KO |
|-------|---------|-------|
| `tokviz doctor` | ✅ tous agents | Réinstaller `init -g` |
| `eventCount` > 0 après session | Au moins 1 event shell | Hooks pas chargés → redémarrer IDE |
| `tokensSaved` > 0 sur pytest/git | Compression active | `track-only` ? → réinit sans `--track-only` |
| `agent` correct dans JSON | `cursor` / `copilot` / `gemini` | Vérifier quel hook a tiré |
| Économie % | Typiquement 20–80 % sur gros `pytest -v` | Normal si petite sortie |

**Signaux d'alerte :**

- `savingsPercent` < 10 % sur session avec gros pytest → hooks inactifs
- `eventCount` = 0 → TokViz ne voit rien → ne pas comparer

---

## 5. Comparaison des sessions (manuel — en attendant `tokviz compare`)

```bash
mkdir -p ~/Desktop/tok-viz/rapports

# Fusionner les 3 exports (jq requis)
jq -s '{
  test: "dcm-aws-collector cost_explorer",
  date: now | strftime("%Y-%m-%d"),
  sessions: [.[].sessions[]] | unique_by(.sessionId)
}' \
  rapports/session-A-*.json \
  rapports/session-B-*.json \
  rapports/session-C-*.json \
  > rapports/compare-dcm-aws-$(date +%F).json
```

**Tableau à remplir pour l'équipe :**

| Session | Agent | tokensIn | tokensOut | tokensSaved | savings % | events |
|---------|-------|----------|-----------|-------------|-----------|--------|
| A | cursor | | | | | |
| B | copilot | | | | | |
| C | antigravity/gemini | | | | | |

**Questions à trancher :**

1. Quel agent injecte le **plus** de contexte shell brut ?
2. Où TokViz économise le **plus** (git vs pytest vs prose) ?
3. Quel outil recommander pour reviews `dcm-aws-collector` ?

---

## 6. Tâches bonus (optionnel — stress test)

Pour pousser la compression shell :

```bash
# Depuis dcm-aws-collector
uv run pytest tests/ -v --tb=long    # sortie longue
git diff HEAD~3 -- packages/dcm-aws-collector/
grep -r "CostExplorer" src/ tests/
```

Refaire une session par agent avec :

```text
Lance tous les tests du package dcm-aws-collector avec -v --tb=long et résume les échecs.
```

---

## 7. Migration TokViz → Antigravity (après 18/06)

Antigravity conserve **Hooks** et **Skills** (format proche Gemini CLI).

| Élément Gemini | Antigravity |
|----------------|-------------|
| Commande | `gemini` → `agy` |
| Config hooks | `~/.gemini/hooks.json` → à confirmer `~/.agy/hooks.json` |
| Skills | `.gemini/skills/` → `.agents/skills/` |
| Instructions | `GEMINI.md` → `AGENTS.md` |

**TokViz — roadmap :**

```bash
# Aujourd'hui
tokviz init -g --agent gemini

# Futur (à implémenter)
tokviz init -g --agent antigravity
```

En attendant : tester Antigravity avec hooks Gemini si compatibles, ou `--track-only` + mesure manuelle.

---

## 8. Checklist avant présentation équipe

- [ ] 3 sessions complétées (Cursor, Copilot, Antigravity/Gemini)
- [ ] 3 fichiers JSON exportés dans `rapports/`
- [ ] Tableau §5 rempli
- [ ] `tokviz doctor` vert sur ta machine
- [ ] Note sur sunset Gemini 18/06 dans la slide
- [ ] Mode `--enterprise` utilisé sur code DCM

---

## 9. Liens

- [Présentation équipe](./PRESENTATION-EQUIPE.md)
- [Rapports & compare](./ROADMAP-RAPPORTS-SESSIONS.md)
- [Google — Gemini → Antigravity](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
