#!/usr/bin/env bash
# One-shot URL prober. Writes a tab-separated file (id, name, url) to
# stdin, get back (id, name, url, status) on stdout. Polite delay
# between requests.
#
# Usage: bash scripts/probe-spotebi.sh < urls.txt > status.txt
set -u

while IFS=$'\t' read -r id name url; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -A "workout-tracker dev probe (personal use)" --max-time 10 -L "$url" || echo "ERR")
  printf "%s\t%s\t%s\t%s\n" "$id" "$name" "$url" "$status"
  sleep 0.4
done
