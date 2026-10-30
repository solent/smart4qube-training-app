#!/usr/bin/env bash
# CI : vérifie chaque commit d'une PR avec la règle de commit de l'AGENTS.md.
# Usage : scripts/check-commits.sh <sha de base> <sha de tête> [titre de la PR]
# La règle elle-même est dans .claude/hooks/check-commit.sh (partagée avec le hook d'agent et le hook Git).
set -uo pipefail
base="${1:?sha de base manquant}"; head="${2:?sha de tête manquant}"; title="${3:-}"
checker="$(git rev-parse --show-toplevel)/.claude/hooks/check-commit.sh"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
errors=0

# --no-merges : les commits de fusion (« Merge branch 'main' into … ») ne suivent pas la règle.
for sha in $(git rev-list --no-merges "$base..$head"); do
  git log -1 --format=%B "$sha" > "$tmp"
  if bash "$checker" "$tmp" 2>/dev/null; then
    echo "OK     $(git log -1 --format='%h %s' "$sha")"
  else
    echo "REFUSÉ $(git log -1 --format='%h %s' "$sha")"
    errors=$((errors + 1))
  fi
done

# Fusion en squash : c'est le titre de la PR (et sa description) qui devient le message final.
if [[ -n $title ]]; then
  if printf '%s\n\nRefs: #0\n' "$title" > "$tmp" && bash "$checker" "$tmp" 2>/dev/null; then
    echo "OK     titre de la PR : $title"
  else
    echo "REFUSÉ titre de la PR : $title"
    errors=$((errors + 1))
  fi
fi

if (( errors > 0 )); then
  echo
  bash "$checker" /dev/null 2>&1 | sed -n '2,$p'   # rappel du format attendu
  echo "$errors message(s) non conforme(s). Corriger avec git rebase -i puis git push --force-with-lease."
  exit 1
fi
echo "Tous les commits respectent la règle."
