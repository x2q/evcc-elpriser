#!/bin/sh
# End-to-end check with a real evcc binary: every example is loaded by `evcc tariff`
# (evcc's own gojq, its own custom-tariff code) against the live service.
#
#   scripts/evcc-check.sh /path/to/evcc
#
# Build a binary with: git clone --depth 1 https://github.com/evcc-io/evcc && cd evcc &&
#   mkdir -p dist && echo ok > dist/index.html && go build -tags release -o evcc .
set -eu
EVCC=${1:?usage: evcc-check.sh /path/to/evcc}
HERE=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
status=0
for f in "$HERE"/examples/*.yaml; do
  name=$(basename "$f")
  # HOME points to a temp dir so evcc does not create ~/.evcc
  if HOME="$TMP" "$EVCC" tariff --config "$f" --ignore-db >"$TMP/out" 2>&1 \
     && [ "$(grep -c '^20[0-9][0-9]-' "$TMP/out")" -ge 48 ]; then
    echo "ok    $name ($(grep -c '^20[0-9][0-9]-' "$TMP/out") rate rows, $(grep -m1 Price/Cost "$TMP/out" | sed 's/.*(\(.*\)).*/\1/'))"
  else
    echo "FAIL  $name"; tail -5 "$TMP/out"; status=1
  fi
done
exit $status
