# Submitted to evcc-io/evcc (https://github.com/evcc-io/evcc/pull/35753)

This is the template of evcc-io/evcc#35753. To reproduce it:

1. Copy `templates/definition/tariff/elpriser.yaml` into `evcc-io/evcc` at the same path.
2. Run `go generate ./util/templates/...` (`make docs`) to write `templates/docs/{en,de}/tariff/*.yaml`;
   the generated files of this build are kept in `docs/` for reference. Check `go test ./tariff/ ./util/templates/...`.
3. The template is marked `evcc: ["skiptest"]` like the other online tariffs (the unit test renders it but
   does not call the network).
4. Verify with `evcc tariff --config <file with type: template, template: elpriser, zone: de>` against a build
   that contains the template.

Notes for a reviewer:

* The service (`/api/slots`) delivers absolute UTC slots, 15 minutes wherever the day-ahead market has 15-minute
  prices, so the jq program is one line (`.slots | map({start, end, value: .price})`) and knows nothing about
  time zones or daylight saving. The service's slot arithmetic is tested against the IANA data for all 40 zones.
* Param names: `pricemode` instead of `mode`, because `mode` is a reserved default parameter in evcc templates.
* Template parameters: `zone` (40 choices), `pricemode` and `gln` (Denmark only), `currency` (`local`/`eur`),
  `actualonly` (advanced), plus the shared `tariff-base` and `tariff-features` presets.
* Verified with evcc `master` of 2026-11-02 (`70ff31c`).
