#!/usr/bin/env bash
# Restack a chain of stacked branches after a parent was rewritten or gained commits.
# Usage: scripts/restack.sh <branch-1> <branch-2> ... (parent first, children after)
# Each child is rebased onto its parent's current tip. `--fork-point` finds where the child branched
# from the parent's OLD tip using the parent's reflog, so the parent's stale commits are dropped
# instead of replayed. Needs the local branches' reflogs, so run it in the clone that did the rewrite.
# Stops on the first conflict.
set -euo pipefail

[ "$#" -ge 2 ] || { echo 'need at least a parent and a child' >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo 'working tree not clean' >&2; exit 1; }

parent="$1"
shift
for child in "$@"; do
  echo "== $child onto $parent"
  git rebase --fork-point "$parent" "$child"
  parent="$child"
done
echo 'restacked; review, then push each with: git push --force-with-lease origin <branch>'
