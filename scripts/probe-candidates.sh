#!/usr/bin/env bash
# Probe alternate candidate slugs for each miss. Reads tab-separated
# (id, name, candidates...) on stdin, outputs (id, name, hit_url) for
# the first 200 it finds.
set -u

while IFS=$'\t' read -r id name candidates; do
  hit=""
  IFS='|' read -ra cands <<< "$candidates"
  for cand in "${cands[@]}"; do
    [[ -z "$cand" ]] && continue
    url="https://spotebi.com/exercise-guide/${cand}/"
    status=$(curl -s -o /dev/null -w "%{http_code}" -A "workout-tracker dev probe (personal use)" --max-time 8 -L "$url" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
      hit="$url"
      break
    fi
    sleep 0.25
  done
  printf "%s\t%s\t%s\n" "$id" "$name" "$hit"
done
