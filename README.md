# elpriser.org for evcc

[![Tests](https://github.com/x2q/evcc-elpriser/actions/workflows/tests.yml/badge.svg)](https://github.com/x2q/evcc-elpriser/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Hourly electricity prices from [elpriser.org](https://elpriser.org) as a dynamic **grid tariff** (or feed-in
tariff) for [evcc](https://evcc.io), so the planner can charge in the cheapest hours.

* **40 price zones**: Denmark (DK1/DK2), the other Nordic and Dutch zones and most of continental Europe,
  Great Britain and Ireland. Free, no account, no API key.
* **Forecast included**: published day-ahead prices first, then up to 7-10 days of elpriser.org's own
  statistical model (see the caveat below). Switch the forecast days off with one setting.
* **Local currency or EUR**, converted with the ECB reference rate by the service.
* **Denmark: the price you actually pay** ("Din pris"): spot + Energinet's tariffs + electricity duty + VAT, and
  with your grid company's GLN also the grid tariff.
* One request per hour. Nothing is sent but the zone (and for Denmark the price type and GLN).

Status: tested with evcc built from `master` on 2026-11-03 (`evcc tariff` against the live service) and with the
template tests of the evcc repository. It is **not yet part of evcc**; until it is, copy a block from
[`examples/`](examples) into your `evcc.yaml`.

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
      uri: https://elpriser.org/api/forecast?area=DK1&mode=inkl_alt
      cache: 1h
      jq: |
        ...  # the program in src/elpriser.jq (about 35 lines, the same in every example)
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

| `uri` | Price | Currency |
| --- | --- | --- |
| `https://elpriser.org/api/nordic?zone=<zone>` | Wholesale (day-ahead) price, **no VAT, taxes or grid fees**. All zones except `dk1`/`dk2`. | zone currency (`def local_currency: true`) or EUR (`false`) |
| `https://elpriser.org/api/forecast?area=DK1&mode=inkl_alt` | **Denmark, "Din pris"**: spot + Energinet system and transmission tariff + electricity duty + 25 % VAT | DKK |
| `...area=DK2&mode=net_inkl_alt&gln=<13 digits>` | **Denmark, full price** including your grid company's tariff (as in force on each day, also on the forecast days) | DKK |
| `...mode=spot_ex` / `spot_inkl` | Danish spot price without / with VAT | DKK |
| `...mode=inkl_alt_elvarme`, `net_inkl_alt_elvarme` | Same with the reduced duty for electrically heated homes | DKK |
| `...mode=inkl_alt_minus`, `net_inkl_tarif` | Without the electricity duty | DKK |

Zones: `dk1 dk2 no1-no5 se1-se4 fi nl de fr pl it-n at be ch cz hu si es pt sk gr ro bg hr rs ee lv lt me mk al xk gb ie`
(see [`src/zones.json`](src/zones.json) and <https://elpriser.org/api/openapi.json>). The grid company GLN
list is on <https://elpriser.org/tariffer>.

Outside Denmark the number is the *market* price. Your own surcharge, grid fee and VAT are added with evcc's
`charges`, `tax` or `formula` settings, see `examples/de-eur.yaml` and the
[evcc tariff documentation](https://docs.evcc.io/en/reference/configuration/tariffs).

**Set `tariffs.currency` to the currency of the prices** (`DKK`, `SEK`, `PLN`, ...; `EUR` is evcc's default).
evcc does not convert anything.

### Settings inside the jq program

Two lines at the top of the program, edit them by hand in your copy:

```jq
def local_currency: true;   # false: EUR instead of the zone's currency (not for Denmark, not for gb)
def actual_only:    false;  # true: leave out the days that are only a model forecast
```

## Good to know

* **Forecast days are a model, not an official forecast.** They come from elpriser.org's statistical model, rank
  the cheapest hours better than they hit the price level, get worse with distance and are replaced by the
  settled day-ahead price when it is published (about 13:00 CET for the next day). evcc's planner will plan on
  them. If you want plans only on published prices, set `def actual_only: true;`. The model and its back-tested
  accuracy: <https://elpriser.org/prognose>.
* **Time.** The service speaks in local hours (0-23) per calendar day; evcc needs absolute times. jq has no time
  zone database, so the program applies the EU daylight-saving rule (last Sunday of March and October, 01:00
  UTC) to each zone's winter offset. It is verified against the IANA data for all 40 zones for 2025-2030,
  including 23- and 25-hour days (on a 25-hour day the doubled hour carries one price for both occurrences,
  as the service delivers it).
* **Gaps.** A few hours have no price in the service and are left out (evcc handles that): Great Britain only
  has the hours that are already over (it is the within-day market index, not a day-ahead price, GBP), and
  Portugal and Ireland lack the last hour of a published day.
* **Hourly in, quarter-hourly out.** The service delivers hourly means; evcc shows them as four equal
  15-minute slots.
* **Etiquette.** `interval: 1h` and `cache: 1h`: one request per hour. Please keep it that way, the service is free.
* **Attribution.** Zones taken from Bundesnetzagentur | SMARD.de via Energy-Charts.info are CC BY 4.0 (hourly
  means of the 15-minute prices, changed); `gb` is *Contains BMRS data © Elexon Limited copyright and database
  right*. Details per zone on <https://elpriser.org>.

## Upstream template

[`upstream/`](upstream) holds the same thing as an evcc tariff template (`type: template`, `template: elpriser`,
choose zone / price type / currency in the UI): `templates/definition/tariff/elpriser.yaml` and the generated
documentation. It passes `go test ./tariff/ ./util/templates/...` and loads with `evcc tariff`. **No pull request
has been opened**, see [`upstream/README.md`](upstream/README.md).

## Development

```bash
npm test                          # needs jq and Node >= 18: recorded live responses, DST for all zones
JQ=gojq npm test                  # the same with gojq, the implementation evcc uses
ELPRISER_LIVE=1 node --test test/live.test.js   # against the live service
scripts/evcc-check.sh /path/to/evcc             # every example through a real `evcc tariff`
npm run build                     # regenerates examples/ and the template from src/elpriser.jq
```

`src/elpriser.jq` is the only place the logic lives; `scripts/build.mjs` writes it into every YAML file, and
`npm test` fails if a file is out of date.

MIT licensed. Issues: <https://github.com/x2q/evcc-elpriser/issues>. Not affiliated with evcc.

---

*Kort på dansk:* Elpriser.org som dynamisk eltarif i evcc, for alle 40 prisområder, med prognose. Danmark
("Din pris") bruger `area=DK1|DK2&mode=inkl_alt` (spot + Energinets tariffer + elafgift + moms) eller
`mode=net_inkl_alt&gln=<dit netselskabs GLN>` for den fulde pris inkl. nettarif. Sæt `tariffs.currency: DKK`.
Kopiér en fil fra `examples/` ind i `evcc.yaml`. Prognosedagene er en statistisk model, ikke en officiel
prognose; sæt `def actual_only: true;` hvis evcc kun må planlægge på offentliggjorte priser.
