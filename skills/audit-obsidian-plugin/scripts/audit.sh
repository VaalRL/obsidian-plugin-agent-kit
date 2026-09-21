#!/usr/bin/env bash
# Lightweight grep-based audit for Obsidian plugins.
# Usage: bash scripts/audit.sh [plugin_root]
# Output: tab-separated list of rule_id<TAB>severity<TAB>file:line<TAB>snippet
#
# This is a best-effort scanner. The canonical audit is run via the SKILL.md
# workflow with Claude's tools; this script exists for a quick pre-commit check.

set -u

ROOT="${1:-.}"
cd "$ROOT" || exit 1

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is required" >&2
  exit 2
fi

EXCLUDES=(
  -g '!node_modules/**'
  -g '!dist/**'
  -g '!build/**'
  -g '!main.js'
  -g '!Test Vault/**'
  -g '!**/*.test.ts'
)

report() {
  local rule="$1" sev="$2" pattern="$3" glob="${4:-*.ts}"
  rg -n --no-heading "${EXCLUDES[@]}" -g "$glob" -- "$pattern" \
    | awk -v r="$rule" -v s="$sev" -F: '{printf "%s\t%s\t%s:%s\t%s\n", r, s, $1, $2, substr($0, index($0,$3))}'
}

# Security
report SEC-001 BLOCKER '\binnerHTML\s*='
report SEC-002 BLOCKER '\bouterHTML\s*='
report SEC-003 BLOCKER '\binsertAdjacentHTML\b'
report SEC-004 BLOCKER '\bdocument\.write\b'
report SEC-005 BLOCKER '\beval\s*\('
report SEC-006 BLOCKER '\bnew\s+Function\s*\('
report SEC-008 BLOCKER '\bfetch\s*\('

# API
report API-001 BLOCKER '\bnavigator\.(platform|userAgent)\b'
report API-002 BLOCKER '\bprocess\.platform\b'
report API-003 MAJOR  "['\"]\.obsidian[/\"']"
report API-008 MAJOR  '\bdetachLeavesOfType\s*\('
report API-013 MAJOR  '\(\?<[=!]'

# Code quality
report CQ-001  MAJOR  '(^|\s)var\s+\w'
report CQ-002  MAJOR  ':\s*any\b'
report CQ-003  MAJOR  '\bconsole\.log\b'
report CQ-004  MAJOR  '\bconsole\.info\b'
report CQ-007  MAJOR  '\brequire\s*\('

# UI / styling
report UI-001  MAJOR  "createEl\(\s*['\"]h[1-6]['\"]"
report UI-007  MAJOR  '\belement?\.style\.\w+\s*='
report UI-008  MAJOR  "createEl\(\s*['\"](link|style)['\"]"

# Memory / lifecycle
report MEM-001 MAJOR  '\baddEventListener\s*\('
report MEM-002 MAJOR  '\b(setInterval|setTimeout)\s*\('

# Performance
report PERF-002 PERF  'JSON\.stringify\([^)]*,\s*null,\s*2\)'
report PERF-003 PERF  'Promise\.all\s*\(\s*\w+\.map'

# Buy Me A Coffee. Set FUNDING_HANDLE in the environment, or from identity.json.
FUNDING_HANDLE="${FUNDING_HANDLE:-}"
# With no funding handle configured these checks are meaningless, so skip them.
if [ -z "$FUNDING_HANDLE" ]; then SKIP_BMC=1; fi
AUTHOR_HANDLE="${AUTHOR_HANDLE:-}"
report BMC-004 BLOCKER 'http://(www\.|cdn\.|img\.)?buymeacoffee\.com' '*.{md,ts,json}'
report BMC-007 BLOCKER 'buymeacoffee\.com/(?!${FUNDING_HANDLE}\b)[A-Za-z0-9_-]+' '*.{md,ts,json}'
report BMC-008 MAJOR   'YOUR_BMC_ID|YOUR_USERNAME|<bmc-id>|example_user' '*.{md,ts,json}'
report BMC-010 BLOCKER 'innerHTML\s*=.*buymeacoffee' '*.ts'
report BMC-011 BLOCKER "createEl\(\s*['\"]script['\"].*buymeacoffee" '*.ts'

# Missing funding url (emit once if absent from manifest)
if [ -f manifest.json ] && ! grep -q "$FUNDING_HANDLE" manifest.json 2>/dev/null; then
  printf "BMC-001\tMINOR\tmanifest.json:1\tfundingUrl missing or does not reference \$FUNDING_HANDLE\n"
fi

# Author identity — the author handle is NOT the funding handle.
# MAN-022: BMC id leaked into author/authorUrl field.
if [ -f manifest.json ]; then
  if grep -Eq '"author"\s*:\s*"${FUNDING_HANDLE}"' manifest.json 2>/dev/null; then
    printf "MAN-022\tBLOCKER\tmanifest.json:1\tauthor is set to BMC id '${FUNDING_HANDLE}' — use '${AUTHOR_HANDLE}'\n"
  fi
  if grep -Eq '"authorUrl"\s*:\s*"[^"]*github\.com/${FUNDING_HANDLE}' manifest.json 2>/dev/null; then
    printf "MAN-022\tBLOCKER\tmanifest.json:1\tauthorUrl points at github.com/${FUNDING_HANDLE} — use github.com/${AUTHOR_HANDLE}\n"
  fi
  # MAN-018/019: author/authorUrl not set to canonical ${AUTHOR_HANDLE} values.
  if ! grep -Eq '"author"\s*:\s*"${AUTHOR_HANDLE}"' manifest.json 2>/dev/null; then
    printf "MAN-018\tMINOR\tmanifest.json:1\tauthor should be '${AUTHOR_HANDLE}'\n"
  fi
  if ! grep -Eq '"authorUrl"\s*:\s*"https://github\.com/${AUTHOR_HANDLE}"?' manifest.json 2>/dev/null; then
    printf "MAN-019\tMINOR\tmanifest.json:1\tauthorUrl should be 'https://github.com/${AUTHOR_HANDLE}'\n"
  fi
fi

# Missing BMC badge in README
if [ -f README.md ] && ! grep -q 'buymeacoffee\.com/${FUNDING_HANDLE}' README.md 2>/dev/null; then
  printf "BMC-003\tMINOR\tREADME.md:1\tno BMC badge linking to ${FUNDING_HANDLE}\n"
fi

# BMC url duplication across ts files (DEBT)
BMC_HITS=$(rg -l "${EXCLUDES[@]}" -g '*.ts' 'buymeacoffee\.com/${FUNDING_HANDLE}' 2>/dev/null | wc -l)
if [ "$BMC_HITS" -gt 1 ]; then
  printf "BMC-023\tDEBT\tvarious:%s\tBMC url literal duplicated in %s .ts files — extract to constants\n" "$BMC_HITS" "$BMC_HITS"
fi

# Naming debt
rg -l "${EXCLUDES[@]}" -g '*.ts' '' \
  | grep -E '(_v2|_new|enhanced_|improved_|manager2)' \
  | awk '{printf "DEBT-002\tDEBT\t%s:1\t%s\n", $0, "filename suggests duplication"}'

exit 0
