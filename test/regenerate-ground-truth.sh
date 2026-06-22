#!/usr/bin/env bash
# Regenerate test/git-ground-truth.json from the real git binary.
#
# This is the source of truth the regression test (../test.mjs) asserts
# against. Run it whenever you add a case or want to re-confirm the fixture
# against your installed git.
#
# THE ONE GOTCHA, because it cost an afternoon:
#
#   `git check-ignore -v <path>` exits 0 when a pattern MATCHES the path,
#   even when that pattern is a NEGATION (!foo) and the file is therefore
#   NOT ignored. So the exit code of `-v` is "did any rule match", not
#   "is the file ignored".
#
#   The true ignore verdict comes from PLAIN `git check-ignore <path>`
#   (no -v): exit 0 = ignored, exit 1 = not ignored.
#
#   So: take the VERDICT from plain check-ignore, and the DECIDING RULE
#   (the last matching pattern, which may be a negation) from -v.
#
# Requires: git, jq.
set -euo pipefail

cases_file="$(realpath "${1:-cases.tsv}")"
out="${2:-git-ground-truth.json}"
out="$(realpath -m "$out")"

if [[ ! -f "$cases_file" ]]; then
  cat >&2 <<'EOF'
Provide a TSV of cases: each line is
  <gitignore-with-\n-for-newlines><TAB><path>
e.g.
  build/\n!build/keep.txt<TAB>build/keep.txt
EOF
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
git init -q

printf '[\n' > "$out"
first=1
while IFS=$'\t' read -r gi path; do
  [[ -z "$gi" ]] && continue
  printf '%b\n' "$gi" > .gitignore

  # VERDICT: plain check-ignore, exit 0 = ignored.
  if git check-ignore -q "$path"; then
    ignored=true
  else
    ignored=false
  fi

  # DECIDING RULE: -v prints "<source>:<linenum>:<pattern>\t<path>".
  # Field 1 holds source:linenum:pattern; strip up to the last colon.
  # -v exits 1 when nothing matches; tolerate that without aborting (set -e).
  rule="$( { git check-ignore -v "$path" 2>/dev/null || true; } | awk -F'\t' '{print $1}' | sed 's/.*://')"
  [[ -z "$rule" ]] && rule_json=null || rule_json="$(jq -Rn --arg r "$rule" '$r')"

  gi_json="$(printf '%b' "$gi" | jq -Rs '.')"
  path_json="$(jq -Rn --arg p "$path" '$p')"

  [[ $first -eq 0 ]] && printf ',\n' >> "$out"
  first=0
  printf '  {"gitignore": %s, "path": %s, "ignored": %s, "decidingRule": %s}' \
    "$gi_json" "$path_json" "$ignored" "$rule_json" >> "$out"
done < "$cases_file"
printf '\n]\n' >> "$out"

echo "wrote $out" >&2
