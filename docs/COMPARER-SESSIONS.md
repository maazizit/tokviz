# TokViz — Comparer les sessions Cursor

**Objectif :** voir combien de tokens chaque session Agent a consommé, et comparer deux sessions entre elles.

**Prérequis :** TokViz installé + hooks Cursor actifs. Voir [CURSOR-TEST-CHECKLIST.md](./CURSOR-TEST-CHECKLIST.md).

---

## 1. Avant de comparer — checklist rapide

| Étape | Commande / action | Attendu |
|-------|-------------------|---------|
| Hooks installés | `tokviz doctor` | `✔ cursor hooks` |
| Cursor redémarré | **Cmd+Q** puis rouvrir | Obligatoire après `tokviz init` |
| Session Agent faite | Agent exécute au moins 1 commande shell | pytest, git, etc. |
| Events enregistrés | `tokviz stats` | `Events` > 0 |

> **Important :** ouvrir 2 onglets chat dans Cursor ≠ 2 sessions TokViz.  
> TokViz enregistre quand l'agent **exécute des commandes** ou **répond**. Sans activité shell, rien n'est tracké.

---

## 2. Toutes les commandes utiles

### Installation (une fois)

```bash
cd ~/Desktop/tok-viz
pnpm install && pnpm build && pnpm link --global

tokviz init -g --agent cursor --enterprise
# Puis Cmd+Q Cursor → rouvrir
```

### Voir les tokens — au quotidien

```bash
# Résumé global (le plus rapide)
tokviz gain

# Liste sessions + totaux
tokviz stats

# Détail d'UNE session
tokviz stats --session <sessionId>

# Export JSON complet
tokviz stats --json

# Vérifier que ça enregistre
tokviz doctor
```

### Alternative si `tokviz` pas dans PATH

```bash
cd ~/Desktop/tok-viz/packages/cli
node dist/index.js gain
node dist/index.js stats
node dist/index.js stats --json
```

### Données brutes (debug)

```bash
cat ~/.tokviz/events.json | python3 -m json.tool | head -80
```

---

## 3. Lister les sessions disponibles

```bash
tokviz stats
```

Exemple :

```text
Recent sessions:
  a1b2c3d4-e5f6…  cursor  saved 12,400 (34%)
  x9y8z7w6-v5u4…  cursor  saved 5,100 (12%)
```

Pour récupérer les IDs complets en JSON :

```bash
tokviz stats --json | jq '.sessions[] | {sessionId, startedAt, tokensIn, tokensSaved, savingsPercent}'
```

---

## 4. Comparer 2 sessions — méthode actuelle

> `tokviz compare` est **disponible** depuis V1.2.  
> Voir aussi `tokviz report` pour rapport + recommandations.

### 4.1 Voir les 2 dernières sessions

```bash
tokviz stats --json | jq '.sessions | sort_by(.startedAt) | .[-2:]'
```

### 4.2 Tableau comparatif lisible

```bash
tokviz stats --json | jq -r '
  .sessions | sort_by(.startedAt) | .[-2:] |
  ["SESSION", "TOKENS_IN", "TOKENS_OUT", "SAVED", "SAVINGS_%"],
  (.[] | [.sessionId[0:12], .tokensIn, .tokensOut, .tokensSaved, .savingsPercent]) |
  @tsv' | column -t -s $'\t'
```

### 4.3 Comparer 2 sessions par ID

Remplace les IDs par les tiens (visibles dans `tokviz stats --json`) :

```bash
SESSION_A="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
SESSION_B="x9y8z7w6-v5u4-3210-fedc-ba0987654321"

echo "=== Session A ===" && tokviz stats --session "$SESSION_A"
echo "=== Session B ===" && tokviz stats --session "$SESSION_B"
```

### 4.4 Comparaison côte à côte (jq)

```bash
SESSION_A="id-session-1"
SESSION_B="id-session-2"

tokviz stats --json | jq --arg a "$SESSION_A" --arg b "$SESSION_B" '
  (.sessions | map(select(.sessionId == $a or .sessionId == $b))) as $s |
  if ($s | length) < 2 then
    "Erreur: une ou deux sessions introuvables. Lance: tokviz stats --json | jq .sessions[].sessionId"
  else
    {
      sessionA: $s[0],
      sessionB: $s[1],
      delta: {
        tokensIn: ($s[0].tokensIn - $s[1].tokensIn),
        tokensSaved: ($s[0].tokensSaved - $s[1].tokensSaved),
        savingsPercent: ($s[0].savingsPercent - $s[1].savingsPercent)
      }
    }
  end
'
```

---

## 5. Exporter pour présentation équipe

```bash
mkdir -p ~/Desktop/tok-viz/rapports

# Snapshot global
tokviz gain > ~/Desktop/tok-viz/rapports/gain-$(date +%F-%H%M).txt

# Toutes les sessions en JSON
tokviz stats --json > ~/Desktop/tok-viz/rapports/stats-$(date +%F-%H%M).json

# Les 2 dernières sessions seulement
tokviz stats --json | jq '{sessions: (.sessions | sort_by(.startedAt) | .[-2:])}' \
  > ~/Desktop/tok-viz/rapports/compare-2-sessions-$(date +%F).json
```

Dossier `rapports/` = local, gitignored.

---

## 6. Workflow complet — 2 sessions Cursor

```
Session 1 (Cursor)                    Session 2 (Cursor)
─────────────────                     ─────────────────
Nouvelle session Agent                Nouvelle session Agent
Prompt + pytest / git                 Autre tâche (ex. dcm-backend)
        │                                     │
        └──────────┬──────────────────────────┘
                   ▼
         ~/.tokviz/events.json
                   ▼
         tokviz stats --json | jq '.sessions[-2:]'
```

### Prompts test suggérés (dataint-dcm-app)

**Session 1 — dcm-backend :**

```text
Package dcm-backend (FastAPI). Lis tests/test_notification_preferences.py.
Lance: cd packages/dcm-backend && uv run pytest tests/test_notification_preferences.py -v --tb=short
Résume en 3 points. Réponse concise.
```

**Session 2 — dcm-aws-collector :**

```text
Package dcm-aws-collector. Lis tests/test_cost_explorer_collector.py.
Lance: cd packages/dcm-aws-collector && uv run pytest tests/test_cost_explorer_collector.py -v --tb=short
Résume en 3 points. Réponse concise.
```

Puis comparer :

```bash
tokviz stats --json | jq '.sessions | sort_by(.startedAt) | .[-2:] | .[] | {sessionId, tokensIn, tokensSaved, savingsPercent, bySource}'
```

---

## 7. Lire les métriques

| Champ | Signification |
|-------|---------------|
| `tokensIn` | Tokens **bruts** injectés (avant compression) |
| `tokensOut` | Tokens **après** compression TokViz |
| `tokensSaved` | Économie = `tokensIn - tokensOut` |
| `savingsPercent` | % économisé sur la session |
| `bySource.shell` | Part venant des sorties terminal (pytest, git…) |
| `bySource.prose` | Part venant des réponses agent |
| `sessionId` | ID Cursor (`conversation_id`) — regroupe une session chat |

**Session qui consomme le plus :** celle avec le plus haut `tokensIn`.  
**Session où TokViz aide le plus :** celle avec le plus haut `savingsPercent`.

---

## 8. Dépannage

| Problème | Cause probable | Fix |
|----------|----------------|-----|
| `Events: 0` | Cursor pas redémarré après `init` | Cmd+Q → rouvrir |
| Sessions `test-dcm-001` seulement | Tests manuels, pas vraies sessions | Refaire session Agent avec pytest |
| `savingsPercent` = 0 % | Pas de grosse sortie shell | Normal si peu de commandes |
| `savingsPercent` < 10 % sur gros pytest | Hooks inactifs | `tokviz doctor` + restart Cursor |
| Top commandes vide dans `gain` | Mode `--enterprise` | Normal — totaux OK, contenu masqué |
| 2 onglets Cursor, 1 session TokViz | Même `conversation_id` ou pas d'activité shell | Nouvelle session Agent + commandes |

---

## 9. `tokviz compare` — disponible

```bash
# 2 dernières sessions (auto)
tokviz compare

# 2 sessions par ID
tokviz compare sess-A sess-B

# Sessions les plus chères
tokviz compare --rank top --limit 10

# Comparer agents
tokviz compare --agents cursor,copilot --since 7d

# Export JSON
tokviz compare --json
```

## 10. `tokviz report` — rapport + recommandations

```bash
# Rapport Markdown (terminal)
tokviz report

# Rapport hebdo fichier
tokviz report --since 7d -o ~/Desktop/tok-viz/rapports/rapport-semaine.md

# HTML (Confluence / Teams)
tokviz report --format html -o rapport.html

# JSON
tokviz report --format json
```

Spec : [ROADMAP-RAPPORTS-SESSIONS.md](./ROADMAP-RAPPORTS-SESSIONS.md).

---

## 10. Récap — commandes copier-coller

```bash
# 1. Vérifier
tokviz doctor
tokviz stats

# 2. Les 2 dernières sessions
tokviz stats --json | jq '.sessions | sort_by(.startedAt) | .[-2:]'

# 3. Tableau comparatif
tokviz stats --json | jq -r '
  .sessions | sort_by(.startedAt) | .[-2:] |
  ["SESSION", "IN", "OUT", "SAVED", "%"],
  (.[] | [.sessionId[0:12], .tokensIn, .tokensOut, .tokensSaved, .savingsPercent]) |
  @tsv' | column -t -s $'\t'

# 4. Export
mkdir -p ~/Desktop/tok-viz/rapports
tokviz stats --json > ~/Desktop/tok-viz/rapports/stats-$(date +%F-%H%M).json
```

---

## Liens

- [Checklist test Cursor](./CURSOR-TEST-CHECKLIST.md)
- [Guide installation](./INSTALL-GUIDE.md)
- [Présentation équipe](./PRESENTATION-EQUIPE.md)
- [Roadmap report & compare](./ROADMAP-RAPPORTS-SESSIONS.md)
