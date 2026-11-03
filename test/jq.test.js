import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, zones, runJq, program, localParts, dayLength } from './helpers.js';

const tzOf = Object.fromEntries(zones.map((z) => [z.key, z.tz]));

function checkSlots(slots, tz) {
  assert.ok(slots.length > 0);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    assert.equal(Date.parse(s.end) - Date.parse(s.start), 3600000, 'one hour per slot');
    assert.match(s.start, /^\d{4}-\d\d-\d\dT\d\d:00:00Z$/);
    if (i) assert.ok(Date.parse(s.start) >= Date.parse(slots[i - 1].end), 'slots are in order, no overlap');
    assert.equal(typeof s.value, 'number');
  }
}

// --- recorded live responses ------------------------------------------------------------

for (const [file, zone] of [['de', 'de'], ['pl', 'pl'], ['se3', 'se3'], ['gb', 'gb']]) {
  test(`nordic response ${file}: every priced hour lands on the right instant, in local currency`, () => {
    const r = fixture(file);
    const slots = runJq(program({ local: true }), r);
    checkSlots(slots, tzOf[zone]);
    const expected = new Map();
    for (const d of r.days)
      for (const p of d.prices)
        if (p.eur_mwh != null) expected.set(`${d.date}|${p.hour}`, Math.round(((p.eur_mwh * r.zoneInfo.rate) / 1000) * 1e5) / 1e5);
    assert.equal(slots.length, expected.size, 'one slot per priced hour (no DST change in the recorded days)');
    for (const s of slots) {
      const l = localParts(s.start, tzOf[zone]);
      assert.equal(s.value, expected.get(`${l.date}|${l.hour}`), `${s.start}`);
    }
  });
}

test('EUR instead of local currency: the zone rate is not applied', () => {
  const r = fixture('pl');
  assert.ok(r.zoneInfo.rate > 1);
  const local = runJq(program({ local: true }), r);
  const eur = runJq(program({ local: false }), r);
  assert.equal(local.length, eur.length);
  for (let i = 0; i < eur.length; i++) {
    assert.ok(Math.abs(local[i].value - eur[i].value * r.zoneInfo.rate) < 2e-5);
  }
  const first = r.days[0].prices[0].eur_mwh;
  assert.equal(eur[0].value, Math.round((first / 1000) * 1e5) / 1e5);
});

test('GB: hours without a price are left out, the unit stays GBP (rate 1)', () => {
  const r = fixture('gb');
  const nulls = r.days.flatMap((d) => d.prices).filter((p) => p.eur_mwh == null).length;
  assert.ok(nulls > 0, 'fixture has unpriced hours');
  const total = r.days.reduce((n, d) => n + d.prices.length, 0);
  assert.equal(runJq(program(), r).length, total - nulls);
});

test('actual_only drops the model forecast days', () => {
  const r = fixture('de');
  const all = runJq(program({ actualOnly: false }), r);
  const actual = runJq(program({ actualOnly: true }), r);
  const nActual = r.days.filter((d) => d.type === 'actual').length * 24;
  assert.equal(actual.length, nActual);
  assert.ok(all.length > actual.length);
});

test('Denmark: /api/forecast price is passed through in DKK/kWh', () => {
  for (const f of ['dk1_fc', 'dk2_net']) {
    const r = fixture(f);
    const slots = runJq(program(), r);
    checkSlots(slots, 'Europe/Copenhagen');
    const prices = new Map(r.days.flatMap((d) => d.prices.map((p) => [`${d.date}|${p.hour}`, p.price])));
    for (const s of slots) {
      const l = localParts(s.start, 'Europe/Copenhagen');
      assert.equal(s.value, Math.round(prices.get(`${l.date}|${l.hour}`) * 1e5) / 1e5);
    }
    assert.equal(slots.length, r.days.length * 24);
  }
});

// --- daylight saving: every zone, 2025-2030 --------------------------------------------

function sweepPayload(zone, years) {
  const days = [];
  const start = Date.parse(`${years[0]}-01-01T00:00:00Z`);
  const end = Date.parse(`${years[1]}-12-31T00:00:00Z`);
  let n = 0;
  for (let t = start; t <= end; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const md = date.slice(5);
    // the weeks around both clock changes (last Sunday of March / October) plus a winter and a summer day
    const near = (md >= '03-22' && md <= '04-02') || (md >= '10-22' && md <= '11-02') || md === '01-15' || md === '07-15';
    if (!near) continue;
    n++;
    // the price encodes (day number, hour), so the check does not depend on the program under test
    days.push({ date, type: 'actual', prices: Array.from({ length: 24 }, (_, hour) => ({ hour, eur_mwh: (n - 1) * 100 + hour })) });
  }
  return { zone, zoneInfo: { currency: 'EUR', rate: 1 }, unit: 'EUR/MWh', days };
}

test('daylight saving, all 40 zones 2025-2030: 23/24/25-hour days and the hour of every slot', () => {
  for (const z of zones) {
    const payload = sweepPayload(z.key, [2025, 2030]);
    const slots = runJq(program(), payload);
    const byDate = new Map();
    for (const s of slots) {
      const l = localParts(s.start, z.tz);
      const day = payload.days.find((d) => d.date === l.date);
      assert.ok(day, `${z.key} ${s.start} falls outside the requested days`);
      const idx = payload.days.indexOf(day);
      // value is eur_mwh/1000, rounded to 5 decimals: n*100+hour in MWh -> kWh
      assert.equal(Math.round(s.value * 1000), idx * 100 + l.hour, `${z.key} ${s.start}`);
      byDate.set(l.date, (byDate.get(l.date) || 0) + 1);
    }
    for (const d of payload.days) {
      assert.equal(byDate.get(d.date), dayLength(d.date, z.tz), `${z.key} ${d.date}: slots in the day`);
    }
  }
});

test('the doubled hour of a 25-hour day carries the same price twice (Berlin, 2026-10-25)', () => {
  const payload = sweepPayload('de', [2026, 2026]);
  payload.days = payload.days.filter((d) => d.date === '2026-10-25');
  const slots = runJq(program(), payload);
  assert.equal(slots.length, 25);
  const twos = slots.filter((s) => Math.round(s.value * 1000) % 100 === 2);
  assert.equal(twos.length, 2);
  assert.equal(twos[0].value, twos[1].value);
  assert.deepEqual(slots.map((s) => s.start).slice(0, 2), ['2026-10-24T22:00:00Z', '2026-10-24T23:00:00Z']);
});

test('the missing hour of a 23-hour day is absent (Berlin, 2026-03-29)', () => {
  const payload = sweepPayload('de', [2026, 2026]);
  payload.days = payload.days.filter((d) => d.date === '2026-03-29');
  const slots = runJq(program(), payload);
  assert.equal(slots.length, 23);
  assert.ok(!slots.some((s) => Math.round(s.value * 1000) % 100 === 2));
});
