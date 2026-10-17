#!/bin/bash
# usage: rep.sh <prefix> <n> <extra bench args...>   -> result-<prefix>-r<i>.json
cd "$(dirname "$0")"
P=$1; N=$2; shift; shift
for i in $(seq 1 $N); do node bench.js $P-r$i "$@" >/dev/null 2>&1; done
