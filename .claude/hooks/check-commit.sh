#!/usr/bin/env bash
# Vérifie la règle de commit de l'AGENTS.md (bloc 4) :
#   <type>(<portée>): <résumé de 72 caractères au plus>
#   ...
#   Refs: #<numéro du ticket>
#
# Deux usages, une seule règle :
#   - hook d'agent Claude Code (PreToolUse, matcher "Bash") : JSON de l'événement sur l'entrée standard ;
#   - hook Git commit-msg, ou CI : check-commit.sh <fichier contenant le message>.
# Code de sortie : 0 conforme ou pas un commit ; 2 non conforme (bloque l'agent, stderr lui est renvoyé).

TYPES='feat|fix|test|refactor|docs|chore|ci'
SCOPES='contract|api|web|scripts|skills|rocketnouilles'

fail() {
  {
    echo "Commit refusé : $1"
    echo "Format attendu (voir la section Commits de l'AGENTS.md) :"
    echo "  <type>(<portée>): <résumé, 72 caractères au plus>"
    echo "  <ligne vide, corps facultatif>"
    echo "  Refs: #<numéro du ticket>"
    echo "type : ${TYPES//|/, } · portée : ${SCOPES//|/, }"
    echo "Numéro de ticket inconnu : le demander, ne pas l'inventer."
  } >&2
  exit 2
}

check_message() {
  local msg subject
  msg="$(printf '%s\n' "$1" | tr -d '\r')"
  subject="$(printf '%s\n' "$msg" | grep -v '^[[:space:]]*$' | head -n 1)"
  local re="^(${TYPES})\((${SCOPES})\): (.+)$"
  [[ $subject =~ $re ]] || fail "première ligne non conforme : « ${subject} »"
  (( ${#BASH_REMATCH[3]} <= 72 )) || fail "résumé de ${#BASH_REMATCH[3]} caractères (72 au plus)"
  printf '%s\n' "$msg" | grep -Eq '^Refs: #[0-9]+$' || fail "ligne « Refs: #<numéro> » absente"
}

# Usage hook Git / CI : un fichier de message en argument.
if [[ $# -ge 1 ]]; then
  check_message "$(grep -v '^#' "$1")"   # git ignore les lignes de commentaire
  exit 0
fi

# Usage hook d'agent : lire la commande que l'agent s'apprête à lancer.
input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
else
  cmd="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')"
fi

# Pas un git commit : laisser passer.
commit_re='(^|[[:space:];&|(])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit([[:space:]]|$)'
[[ $cmd =~ $commit_re ]] || exit 0
cmd="${cmd#*"${BASH_REMATCH[0]}"}"   # on n'analyse que ce qui suit "git commit"

msg=""
# Cas 1 : message en heredoc, git commit -m "$(cat <<'EOF' ... EOF)".
# On ne peut pas lire le texte entre les guillemets du -m : il faut prendre les lignes du heredoc.
heredoc_re=$'<<-?[[:space:]]*[\'"]?([A-Za-z_][A-Za-z0-9_]*)[\'"]?'
if [[ $cmd =~ $heredoc_re ]]; then
  delim="${BASH_REMATCH[1]}"
  # Lignes situées après la ligne qui ouvre le heredoc, jusqu'au délimiteur.
  awk_prog='f { line = $0; sub(/^[\t ]+/, "", line); if (line == d) exit; print; next } index($0, "<" "<") { f = 1 }'
  msg="$(printf '%s\n' "$cmd" | awk -v d="$delim" "$awk_prog")"
else
  # Cas 2 : un ou plusieurs -m / --message (git en fait des paragraphes), y compris -am.
  rest="$cmd"
  opt_re=$'(^|[[:space:]])(-[A-Za-z]*m|--message)(=|[[:space:]]+)("([^"]*)"|\'([^\']*)\'|([^[:space:]"\']+))'
  while [[ $rest =~ $opt_re ]]; do
    part="${BASH_REMATCH[5]}${BASH_REMATCH[6]}${BASH_REMATCH[7]}"
    msg="${msg:+$msg$'\n\n'}$part"
    rest="${rest#*"${BASH_REMATCH[0]}"}"
  done
  # Cas 3 : -F <fichier> / --file=<fichier>.
  file_re='(-F|--file)(=|[[:space:]]+)([^[:space:]]+)'
  if [[ -z $msg && $cmd =~ $file_re ]]; then
    f="${BASH_REMATCH[3]}"; f="${f%\"}"; f="${f#\"}"; f="${f%\'}"; f="${f#\'}"
    [[ -f $f ]] && msg="$(grep -v '^#' "$f")"
  fi
fi

# Aucun message lisible (--amend --no-edit, éditeur...) : on ne bloque pas ;
# le hook Git commit-msg et la CI vérifient le message final.
[[ -z $msg ]] && exit 0

check_message "$msg"
exit 0
