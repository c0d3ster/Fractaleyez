#!/bin/bash
# usage: scripts/bench/ab.sh <baseRef> <newRef> [--runs=3] [hitch.js args...]
#
# Measures two versions of the app against each other on this machine. Each ref is checked out in its own git worktree, built with the production
# webpack config (React in its production build, which is what users run and costs less than the dev build the other bench scripts use), served on its own port, and
# measured by hitch.js, alternating base and new each run so a drifting machine (thermals, other apps) hits both the same. Then compare-hitch.js prints the medians.
#
# For this branch: the "before" is the probe commit, which is the original rendering plus the probe (the original has no probe, so it cannot report GPU time):
#   scripts/bench/ab.sh 997da3b HEAD --runs=3 --popup --scenarios=idle,glow-first,particle-count,popup-drag-speed --quality=quality
# Set CHROME_PATH to the browser you want (GPU timer queries need one that exposes EXT_disjoint_timer_query_webgl2; hitch.js prints gpuTimer: 'unavailable' if not).
# Needs .env with CLERK_PUBLISHABLE_KEY in the repo (it is copied to the worktrees), or CLERK_PUBLISHABLE_KEY in the environment. Not headless unless you pass --headless.
set -e
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
BASE_REF=$1; NEW_REF=$2
if [ -z "$BASE_REF" ] || [ -z "$NEW_REF" ]; then sed -n 2,13p "$0" | sed 's/^# \{0,1\}//'; exit 1; fi
shift 2
RUNS=3
ARGS=()
for arg in "$@"; do
  case "$arg" in --runs=*) RUNS=${arg#--runs=} ;; *) ARGS+=("$arg") ;; esac
done
export BENCH_DIR=${BENCH_DIR:-$ROOT/scripts/bench/out}
WORK=$BENCH_DIR/ab
mkdir -p "$WORK"
PIDS=()
cleanup() { for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

prepare() { # side ref port
  local dir=$WORK/$1
  if [ -d "$dir" ]; then git -C "$dir" checkout -q --detach "$2"; else git worktree add -q --detach "$dir" "$2"; fi
  [ -f "$ROOT/.env" ] && cp "$ROOT/.env" "$dir/.env"
  (cd "$dir" && pnpm install --frozen-lockfile >/dev/null 2>&1 && pnpm build >/dev/null 2>&1)
  node "$ROOT/scripts/bench/serve.js" "$dir/public" "$3" >/dev/null &
  PIDS+=($!)
  echo "$1: $(git -C "$dir" log --oneline -1) on :$3"
}
prepare base "$BASE_REF" 4101
prepare new "$NEW_REF" 4102
sleep 1

rm -f "$BENCH_DIR"/hitch-base-r*.json "$BENCH_DIR"/hitch-new-r*.json
for i in $(seq 1 "$RUNS"); do
  # Alternate which side goes first.
  if [ $((i % 2)) -eq 1 ]; then order="base new"; else order="new base"; fi
  for side in $order; do
    port=4101; [ "$side" = new ] && port=4102
    echo "run $i: $side"
    BENCH_URL=http://localhost:$port node scripts/bench/hitch.js "$side-r$i" "${ARGS[@]}" >/dev/null
  done
done
node scripts/bench/compare-hitch.js base new --sections
