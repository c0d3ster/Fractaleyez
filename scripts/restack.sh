#!/usr/bin/env bash
# Restack a chain of stacked branches after a parent was rewritten or gained commits.
# Usage: scripts/restack.sh <branch-1> <branch-2> ... (parent first, children after)
# Each child is rebased onto its parent's LOCAL tip, dropping the parent's old commits, which are
# found via the parent's origin/ ref. Run before force-pushing; stops on the first conflict.
set -euo pipefail

[ "$#" -ge 2 ] || { echo 'need at least a parent and a child' >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo 'working tree not clean' >&2; exit 1; }

# Capture every old base up front: origin/<parent> stays the pre-rewrite tip until you push.
parent="$1"
shift
for child in "$@"; do
  old_base="$(git rev-parse "origin/$parent")"
  echo "== $child onto $parent (old base ${old_base:0:7})"
  git rebase --onto "$parent" "$old_base" "$child"
  parent="$child"
done
echo 'restacked; review, then push each with: git push --force-with-lease origin <branch>'
