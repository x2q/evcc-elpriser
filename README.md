# elpriser.org for evcc

[![Tests](https://github.com/x2q/evcc-elpriser/actions/workflows/tests.yml/badge.svg)](https://github.com/x2q/evcc-elpriser/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Electricity prices from [elpriser.org](https://elpriser.org) as a dynamic **grid tariff** (or feed-in
tariff) for [evcc](https://evcc.io), in the market's own **15-minute slots**, so the planner can charge in the cheapest quarter hours.

* **40 price zones**: Denmark (DK1/DK2), the other Nordic and Dutch zones and most of continental Europe,
  Great Britain and Ireland. Free, no account, no API key.
* **Forecast included**: published day-ahead prices first, then up to 7-10 days of elpriser.org's own
  statistical model (see the caveat below). Switch the forecast days off with one setting.
* **Local currency or EUR**, converted with the ECB reference rate by the service.
* **Denmark: the price you actually pay** ("Din pris"): spot + Energinet's tariffs + electricity duty + VAT, and
  with your grid company's GLN also the grid tariff.
* **15-minute slots with real timestamps.** The service delivers absolute UTC slots (`/api/slots`), 15 minutes
  wherever the day-ahead market has 15-minute prices (since 2025-10-01), so nothing here knows about time zones
  or daylight saving. The forecast days are hourly, a few zones (`xk`, `me`, `mk`, `al`, `gb`) have hourly or
  half-hourly sources; every slot carries its own `start` and `end`.
* One request per hour. Nothing is sent but the zone (and for Denmark the price type and GLN).

Status: tested with evcc built from `master` on 2026-11-03 (`evcc tariff` against the live service) and with the
template tests of the evcc repository. It is **not yet part of evcc**; until it is, copy a block from
[`examples/`](examples) into your `evcc.yaml`. Submitted upstream: https://github.com/evcc-io/evcc/pull/35753

## Quick start

Pick the file that is closest to you, merge its `tariffs:` block into `evcc.yaml` and restart evcc.

| You are | File |
| --- | --- |
| Germany (any other zone: change `zone=de`) | [`examples/de-eur.yaml`](examples/de-eur.yaml) |
| Denmark, DK1 or DK2, price incl. Energinet tariffs, duty and VAT ("Din pris") | [`examples/dk1-din-pris.yaml`](examples/dk1-din-pris.yaml) |
| Denmark with your grid company's tariff (full price) | [`examples/dk2-netselskab.yaml`](examples/dk2-netselskab.yaml) |
| Sweden, SEK/kWh (Norway, Poland, ... the same way) | [`examples/se3-sek.yaml`](examples/se3-sek.yaml) |
| Feed-in tariff (what surplus is worth at the spot price) | [`examples/feedin-de.yaml`](examples/feedin-de.yaml) |

The Danish "Din pris" example, complete:

```yaml
tariffs:
  currency: DKK
  grid:
    type: custom
    forecast:
      source: http
      uri: https://elpriser.org/api/slots?zone=dk1&mode=inkl_alt
      cache: 1h
      jq: |
        .slots | map({ start, end, value: .price }) | tostring   # the whole program
    interval: 1h
```

Check what evcc sees before you rely on it (an evcc build is needed; `evcc tariff` is part of evcc):

```
$ evcc tariff --config examples/dk1-din-pris.yaml
grid:
From                   To                     Price/Cost (DKK/kWh)
2026-11-03 08:00:00    2026-11-03 08:15:00    2.990
...
```

### Choosing the price

Every example reads `https://elpriser.org/api/slots` ([OpenAPI](https://elpriser.org/api/openapi.json)); the
query decides the price:

| `uri` | Price | Currency |
| --- | --- | --- |
| `.../api/slots?zone=<zone>` | Wholesale (day-ahead) price, **no VAT, taxes or grid fees**. All zones. | zone currency, or EUR with `&currency=eur` (not `gb`) |
| `.../api/slots?zone=dk1&mode=inkl_alt` | **Denmark, "Din pris"**: spot + Energinet system and transmission tariff + electricity duty + 25 % VAT | DKK (or `&currency=eur`) |
| `...zone=dk2&mode=net_inkl_alt&gln=<13 digits>` | **Denmark, full price** including your grid company's tariff (as in force on each day, also on the forecast days) | DKK |
| `...mode=spot_ex` / `spot_inkl` | Danish spot price without / with VAT | DKK |
| `...mode=inkl_alt_elvarme`, `net_inkl_alt_elvarme` | Same with the reduced duty for electrically heated homes | DKK |
| `...mode=inkl_alt_minus`, `net_inkl_tarif` | Without the electricity duty | DKK |
| `...&actualonly=1` | Leave out the days that are only a model forecast | |

Zones: `dk1 dk2 no1-no5 se1-se4 fi nl de fr pl it-n at be ch cz hu si es pt sk gr ro bg hr rs ee lv lt me mk al xk gb ie`
(see [`src/zones.json`](src/zones.json) and <https://elpriser.org/api/openapi.json>). The grid company GLN
list is on <https://elpriser.org/tariffer>.

Outside Denmark the number is the *market* price. Your own surcharge, grid fee and VAT are added with evcc's
`charges`, `tax` or `formula` settings, see `examples/de-eur.yaml` and the
[evcc tariff documentation](https://docs.evcc.io/en/reference/configuration/tariffs).

**Set `tariffs.currency` to the currency of the prices** (`DKK`, `SEK`, `PLN`, ...; `EUR` is evcc's default).
evcc does not convert anything; the service converts with the ECB reference rate.

## Good to know

* **Forecast days are a model, not an official forecast.** They come from elpriser.org's statistical model, rank
  the cheapest hours better than they hit the price level, get worse with distance and are replaced by the
  settled day-ahead price when it is published (about 13:00 CET for the next day). evcc's planner will plan on
  them. If you want plans only on published prices, add `&actualonly=1` to the `uri`. The model and its back-tested
  accuracy: <https://elpriser.org/prognose>.
* **Time.** The service speaks in absolute UTC slots (`start`, `end`), so there is no daylight-saving logic
  in the jq program: the zone's clock is applied once, on the server, with the platform's time zone database
  (tested for all 40 zones, including 23- and 25-hour days).
* **Resolution.** The day-ahead market has settled in 15-minute slots since 2025-10-01 and the settled days
  here are 15-minute slots (the EU zones from Energy-Charts and ENTSO-E, Denmark and the Nordic zones from
  ENTSO-E), except in the zones whose source is hourly or half-hourly (`xk`, `me`, `mk`, `al`, `ie`, `gb`). The model's
  forecast days are hourly. Never assume the step: `end - start` is the slot, and evcc takes the slots as they are.
* **Gaps.** A few hours have no price and are left out (evcc handles that): Great Britain only has the hours that
  are already over (it is the within-day market index, not a day-ahead price, GBP), and Portugal and Ireland
  lack the last hour of a published day.
* **Etiquette.** `interval: 1h` and `cache: 1h`: one request per hour. Please keep it that way, the service is free.
* **Attribution.** Zones taken from Bundesnetzagentur | SMARD.de via Energy-Charts.info are CC BY 4.0 (the prices
  are the market's, the slots are re-cut to the zone's clock, nothing else changed); `gb` is *Contains BMRS data © Elexon Limited copyright and database
  right*. Details per zone on <https://elpriser.org>.

## Upstream template

[`upstream/`](upstream) holds the same thing as an evcc tariff template (`type: template`, `template: elpriser`,
choose zone / price type / currency in the UI): `templates/definition/tariff/elpriser.yaml` and the generated
documentation. It passes `go test ./tariff/ ./util/templates/...` and loads with `evcc tariff`. It is submitted in
[evcc-io/evcc#35753](https://github.com/evcc-io/evcc/pull/35753), see [`upstream/README.md`](upstream/README.md).

## Development

```bash
npm test                          # needs jq and Node >= 18: recorded live responses through the jq program
JQ=gojq npm test                  # the same with gojq, the implementation evcc uses
ELPRISER_LIVE=1 node --test test/live.test.js   # against the live service
scripts/evcc-check.sh /path/to/evcc             # every example through a real `evcc tariff`
npm run build                     # regenerates examples/ from src/elpriser.jq
```

`src/elpriser.jq` is the only place the logic lives; `scripts/build.mjs` writes it into every YAML file, and
`npm test` fails if a file is out of date.

MIT licensed. Issues: <https://github.com/x2q/evcc-elpriser/issues>. Not affiliated with evcc.

---

*Kort på dansk:* Elpriser.org som dynamisk eltarif i evcc, for alle 40 prisområder, med prognose. Danmark
("Din pris") bruger `zone=dk1|dk2&mode=inkl_alt` (spot + Energinets tariffer + elafgift + moms) eller
`mode=net_inkl_alt&gln=<dit netselskabs GLN>` for den fulde pris inkl. nettarif. Priserne kommer i 15-minutters slots med UTC-tidsstempler. Sæt `tariffs.currency: DKK`.
Kopiér en fil fra `examples/` ind i `evcc.yaml`. Prognosedagene er en statistisk model, ikke en officiel
prognose; tilføj `&actualonly=1` hvis evcc kun må planlægge på offentliggjorte priser.
