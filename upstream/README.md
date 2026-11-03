# Submitted to evcc-io/evcc (https://github.com/evcc-io/evcc/pull/35753)

The version submitted upstream is slightly shortened (shorter descriptions, no zone list in the help text). To reproduce it:

1. Copy `templates/definition/tariff/elpriser.yaml` into `evcc-io/evcc` at the same path.
2. Run `go generate ./util/templates/...` (`make docs`) to write `templates/docs/{en,de}/tariff/*.yaml`;
   the generated files of this build are kept in `docs/` for reference. Check `go test ./tariff/ ./util/templates/...`.
3. The template is marked `evcc: ["skiptest"]` like the other online tariffs (the unit test renders it but
   does not call the network).
4. Verify with `evcc tariff --config <file with type: template, template: elpriser, zone: de>` against a build
   that contains the template.

Notes for a reviewer:

* The jq program converts the service's local hours to UTC with the EU daylight-saving rule, so a plain
  `source: http` + `jq` is enough (no `go`/`js` plugin). It is generated from `src/elpriser.jq`; the logic is
  tested against the IANA time zone data in this repository.
* Param names: `pricemode` instead of `mode`, because `mode` is a reserved default parameter in evcc templates.
* Template parameters: `zone` (40 choices), `pricemode` and `gln` (Denmark only), `currency` (`local`/`eur`),
  `actualonly` (advanced), plus the shared `tariff-base` and `tariff-features` presets.
* Verified with evcc `master` of 2026-11-02 (`70ff31c`).
