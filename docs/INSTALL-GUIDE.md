# Guide d'installation TokViz

Guide pour l'équipe — **Cursor**, **GitHub Copilot**, **Gemini CLI** (sunset 18/06/2026 → **Antigravity CLI**).

> **18 juin 2026 :** Gemini CLI ne sert plus les requêtes free / Google AI Pro/Ultra. Migration vers [Antigravity CLI](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) (`agy`). TokViz ajoutera `--agent antigravity` — en attendant, voir [PROTOCOLE-TEST-DCM-AWS-COLLECTOR.md](./PROTOCOLE-TEST-DCM-AWS-COLLECTOR.md).

> **Feel free** (usage perso) : licence propriétaire, local-only, pas de cloud obligatoire. Installez sur projets perso librement. **Usage commercial interdit** sans accord écrit de Zahra. Sur code entreprise sensible → mode `--enterprise` + validation sécu.

---

## Prérequis

- **Node.js 20+** (`node -v`)
- **pnpm** (recommandé) ou npm
- Git

---

## 1. Installation du CLI

### Depuis le repo (dev / équipe interne)

```bash
git clone git@github.com:<votre-org>/tokviz.git
cd tokviz
pnpm install
pnpm build
pnpm link --global   # ou: npm link -w packages/cli
```

### Depuis npm (après publication)

```bash
npm install -g @tokviz/cli
```

### Script one-liner (après publication GitHub)

```bash
curl -fsSL https://raw.githubusercontent.com/<votre-org>/tokviz/main/install.sh | bash
```

Vérifier :

```bash
tokviz doctor
tokviz --help
```

---

## 2. Cursor

### Install global (tous projets)

```bash
tokviz init -g --agent cursor
```

### Install projet seulement

```bash
cd mon-projet
tokviz init --agent cursor
```

### Avec compression prose (skills)

```bash
tokviz init --agent cursor --prose lite
# ou full / ultra
```

### Mode entreprise (pas de contenu commande en DB)

```bash
tokviz init -g --agent cursor --enterprise
```

### Mode tracking seul (pas de compression shell)

```bash
tokviz init -g --agent cursor --track-only
```

### Après install

1. **Redémarrer Cursor** complètement
2. Utiliser l'agent normalement
3. Voir les stats :

```bash
tokviz gain
tokviz stats
tokviz stats --json
```

### Désinstall

```bash
tokviz uninstall -g --agent cursor
```

### Fichiers touchés

| Fichier | Rôle |
|---------|------|
| `~/.cursor/hooks.json` | Hooks mergés (ne écrase pas les existants) |
| `~/.tokviz/hooks/cursor/hook.sh` | Script hook |
| `~/.tokviz/events.json` | Stats locales |
| `.cursor/skills/tokviz-*` | Skills prose (si `--prose`) |

---

## 3. GitHub Copilot (VS Code)

### Install global

```bash
tokviz init -g --agent copilot
```

### Mode entreprise

```bash
tokviz init -g --agent copilot --enterprise
```

### Après install

1. **Redémarrer VS Code**
2. Utiliser Copilot Chat / agent
3. Stats :

```bash
tokviz gain
tokviz doctor
```

### Désinstall

```bash
tokviz uninstall -g --agent copilot
```

### Fichiers touchés

| Fichier | Rôle |
|---------|------|
| `~/.copilot/hooks.json` | Hooks Copilot |
| `~/.tokviz/hooks/copilot/hook.sh` | Script hook |

> **Note** : Copilot CLI a des limitations hook (deny-with-suggestion). VS Code Chat est le cas principal.

---

## 4. Gemini CLI

### Install global

```bash
tokviz init -g --agent gemini
```

### Install projet

```bash
cd mon-projet
tokviz init --agent gemini
```

### Après install

1. **Redémarrer** session Gemini CLI
2. Stats :

```bash
tokviz gain
tokviz stats --session <id>
```

### Désinstall

```bash
tokviz uninstall -g --agent gemini
```

### Fichiers touchés

| Fichier | Rôle |
|---------|------|
| `~/.gemini/hooks.json` | Hooks Gemini |
| `~/.tokviz/hooks/gemini/hook.sh` | Script hook |

---

## 5. Commandes utiles (tous agents)

| Commande | Description |
|----------|-------------|
| `tokviz gain` | Résumé économies tokens |
| `tokviz stats` | Détail sessions |
| `tokviz stats --json` | Export JSON |
| `tokviz stats --session <id>` | Une session |
| `tokviz doctor` | Vérifie install + hooks |
| `tokviz hook` | Appelé par hooks (ne pas lancer manuellement) |

### Slash commands (prose — Cursor)

| Commande | Effet |
|----------|-------|
| `/tokviz lite` | Réponses plus courtes, style pro |
| `/tokviz` | Mode full (direct) |
| `/tokviz ultra` | Compression max |
| `stop tokviz` | Revenir au mode normal |

---

## 6. Coexistence RTK / Caveman / Headroom

| Outil | Compatible ? | Note |
|-------|--------------|------|
| **RTK** | ✅ | Hooks mergés dans `hooks.json` |
| **Caveman** | ✅ | Complémentaire (prose) |
| **Headroom** | ⚠️ | Proxy global — valider sécu avant cumul |

`tokviz doctor` signale si hooks sont présents.

---

## 7. Sécurité entreprise

```bash
# Recommandé code sensible
tokviz init -g --agent cursor --enterprise

# Encore plus restrictif
tokviz init -g --agent cursor --track-only
```

- Données dans `~/.tokviz/` **uniquement**
- Pas de télémétrie cloud par défaut
- `--enterprise` : métriques seulement, pas de texte commande
- Secrets filtrés (`api_key=`, `Bearer …`) avant stockage

Voir [SPEC section 10](../SPEC-tokviz-package.md) et [COPYRIGHT.md](./COPYRIGHT.md).

---

## 8. Dépannage

| Problème | Solution |
|----------|----------|
| `tokviz: command not found` | `pnpm link --global` ou `npm i -g @tokviz/cli` |
| Stats vides | Redémarrer agent ; lancer une commande shell via l'agent |
| Hooks pas actifs | `tokviz doctor` ; vérifier `hooks.json` |
| Conflit RTK | Normal — les deux peuvent coexister |

---

## 9. Message équipe (feel free)

> TokViz est maintenu par Zahra (licence propriétaire). **Feel free** sur projets **perso**. Usage **commercial** ou revente → **zahra.maaziz08@gmail.com**. Pas de compte, pas de cloud — tout reste local.
