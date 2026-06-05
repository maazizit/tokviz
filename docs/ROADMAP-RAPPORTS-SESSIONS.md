# TokViz — Rapports & comparaison de sessions

**Statut :** V1.1 / V1.2 **implémenté** (CLI). Extension VS Code graphiques = V2.  
**Objectif :** donner aux équipes des **artefacts mesurables** pour optimiser l'usage des agents IA.

---

## 1. Pourquoi ces modules ?

| Besoin équipe | Aujourd'hui | Avec rapports + compare |
|---------------|-------------|-------------------------|
| « Combien on a économisé ? » | `tokviz gain` (terminal) | Rapport Markdown/HTML partageable |
| « Quelle session a tout mangé ? » | `stats` liste 5 sessions | Ranking + alerte session aberrante |
| « Cursor ou Copilot pour cette tâche ? » | Rien | `compare --agents cursor,copilot` |
| « ROI TokViz avant déploiement ? » | `--track-only` manuel | Rapport avant/après sur même période |

---

## 2. `tokviz report` (V1.1)

### 2.1 Interface CLI

```bash
tokviz report [options]

Options:
  --format <md|html|json>   défaut: md
  -o, --output <file>       fichier sortie (sinon stdout)
  --since <duration>        7d, 30d, 2026-06-01
  --until <date>            fin de fenêtre
  --agent <name>            filtre cursor | copilot | gemini
  --no-recommendations      masquer section conseils
```

### 2.2 Sections du rapport

1. **Synthèse** — sessions, events, brut / optimisé / économie %
2. **Par agent** — tableau Cursor vs Copilot vs Gemini
3. **Par source** — shell vs prose vs tool
4. **Top commandes** — les 10 plus coûteuses + économie post-compression
5. **Sessions extrêmes** — top 3 consommation + top 3 économie %
6. **Recommandations** — règles heuristiques auto (voir §2.3)
7. **Annexe JSON** — option `--format json` pour pipelines

### 2.3 Règles de recommandation automatiques

| Condition | Message |
|-----------|---------|
| Économie session < 15 % | « Hooks peut-être inactifs — lancer `tokviz doctor` » |
| > 60 % tokens = une commande | « Envisager alias ou filtre pour `{cmd}` » |
| Agent A économie 2× agent B | « Préférer `{agent}` pour tâches shell-heavy » |
| Prose > 40 % tokens IN | « Activer mode prose `/tokviz full` » |

### 2.4 Exemple usage équipe

```bash
# Rapport hebdo pour retro
tokviz report --since 7d -o docs/rapports/tokviz-semaine-24.md

# Poster dans Teams / Confluence
tokviz report --format html -o tokviz-rapport.html
```

---

## 3. `tokviz compare` (V1.2)

### 3.1 Modes de comparaison

| Mode | Commande | Cas d'usage |
|------|----------|-------------|
| **Session vs session** | `compare sess-A sess-B` | Même tâche, deux outils |
| **Agent vs agent** | `compare --agents cursor,copilot --since 30d` | Choix outil équipe |
| **Ranking** | `compare --rank top --limit 10` | Sessions les plus chères |
| **Baseline** | `compare sess-X --baseline median` | Session vs médiane historique |
| **Avant / après** | `compare --before 2026-06-01 --after 2026-06-08` | Mesurer impact install TokViz |

### 3.2 Métriques comparées

| Métrique | Description |
|----------|-------------|
| `tokensIn` | Somme `tokensRaw` (contexte injecté) |
| `tokensOut` | Somme `tokensOptimized` (après compression) |
| `tokensSaved` | Delta brut − optimisé |
| `savingsPercent` | % économie sur la session |
| `shellRatio` | Part shell dans tokens IN |
| `proseRatio` | Part prose dans tokens IN |
| `eventCount` | Nombre d'événements (activité) |
| `duration` | `lastEvent - startedAt` |

### 3.3 Sorties

```bash
# Terminal (tableau ASCII)
tokviz compare sess-abc sess-def

# JSON (scripts / dashboard)
tokviz compare --agents cursor,copilot --since 7d --json

# Markdown (rapport annexe)
tokviz compare --rank top -o top-sessions.md
```

### 3.4 Algorithme ranking

```
score_coût = tokensIn * (1 - savingsPercent/100)
```

Sessions triées par `score_coût` décroissant — surface les sessions **chères ET peu compressées**.

### 3.5 Wireframe dashboard (extension V2)

```
┌─────────────────────────────────────────────────────────┐
│ TokViz Compare                              [7d ▼] [⟳] │
├─────────────────────────────────────────────────────────┤
│  Bar chart: tokens IN par agent (cursor vs copilot)     │
│  ████████████ cursor  124k                              │
│  ████████ copilot      89k                              │
├─────────────────────────────────────────────────────────┤
│  Table: Top sessions                                    │
│  │ Session    │ Agent   │ IN     │ Saved │ % │          │
│  │ sess-8f2a  │ cursor  │ 42.1k  │ 5.1k  │12%│ ⚠        │
│  │ sess-3c91  │ copilot │ 38.7k  │15.9k  │41%│ ✓        │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Implémentation technique

### 4.1 Fichiers à créer

```
packages/cli/src/commands/
  report.ts      # V1.1
  compare.ts     # V1.2

packages/core/src/
  report.ts      # buildReport(global, sessions, opts)
  compare.ts     # compareSessions(a, b), rankSessions(sessions)
  recommendations.ts
```

### 4.2 Réutilisation existant

- `getGlobalStats()` — synthèse
- `getSessionStats(sessionId?)` — agrégats par session
- `getAllEvents()` — top commandes (`gain.ts` pattern)

Pas de migration DB : `events.json` suffit pour V1.1/V1.2.

### 4.3 Tests à ajouter

```typescript
// compare: session A plus chère que B
// report: section recommendations si savings < 15%
// report --since 7d: filtre events par date
// compare --rank: ordre décroissant score_coût
```

---

## 5. Planning suggéré

| Sprint | Livrable | Effort estimé |
|--------|----------|---------------|
| S1 | `tokviz report --format md` | 2–3 j |
| S1 | `tokviz report --format json` | 1 j |
| S2 | `tokviz compare` 2 sessions | 2 j |
| S2 | `compare --agents` + `--rank` | 2 j |
| S3 | `report --format html` | 2 j |
| S3 | Extension webview (lecture compare) | 5 j |

---

## 6. Message pour la présentation équipe

> **TokViz ne se contente pas de compresser** — il donne aux équipes un **tableau de bord local** pour voir quelle session, quel agent et quelle commande consomment le plus. Les modules `report` et `compare` transforment des données techniques en **décisions** : quel outil adopter, où activer la compression, comment challenger les habitudes de l'équipe.
