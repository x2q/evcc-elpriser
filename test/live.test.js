// Runs against the live service. Skipped unless ELPRISER_LIVE=1 (needs network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zones, runJq, program, minutes } from './helpers.js';

const live = process.env.ELPRISER_LIVE === '1';
const get = async (path) => {
  const r = await fetch('https://elpriser.org' + path, { headers: { 'User-Agent': 'evcc-elpriser-tests/0.2' } });
  assert.equal(r.status, 200, path);
  return r.json();
};

test('the zone list of the service is the zone list of this repository', { skip: !live }, async () => {
  const spec = await get('/api/openapi.json');
  const slots = spec.paths['/api/slots'].get.parameters.find((p) => p.name === 'zone').schema.enum;
  assert.deepEqual([...slots].sort(), zones.map((z) => z.key).sort());
});

for (const z of ['de', 'pl', 'se3', 'no1', 'fi', 'es', 'gr', 'pt', 'ie', 'dk1']) {
  test(`${z}: the live answer becomes rates that cover now, in order`, { skip: !live }, async () => {
    const r = await get('/api/slots?zone=' + z);
    const rates = runJq(program(), r);
    const t = Date.now();
    assert.ok(rates.some((s) => Date.parse(s.start) <= t && t < Date.parse(s.end)), 'a slot covers now');
    assert.ok(rates.filter((s) => Date.parse(s.start) > t).length >= 12, 'the rest of today and more');
    for (let i = 1; i < rates.length; i++) assert.ok(Date.parse(rates[i].start) >= Date.parse(rates[i - 1].end), 'no overlap');
    assert.ok(rates.every((s) => [15, 30, 60].includes(minutes(s))));
  });
}

test('de: the settled days are 15-minute slots', { skip: !live }, async () => {
  const r = await get('/api/slots?zone=de');
  const settled = r.slots.filter((s) => s.type === 'actual');
  assert.ok(settled.length >= 192);
  assert.ok(settled.every((s) => minutes(s) === 15), 'every settled Germany slot is 15 minutes');
});

test('DK1: the four quarters of the current hour average to /api/now', { skip: !live }, async () => {
  const r = await get('/api/slots?zone=dk1&mode=inkl_alt');
  const now = await get('/api/now?area=DK1&mode=inkl_alt');
  const t = Date.now(), h = t - (t % 3600000);
  const q = r.slots.filter((s) => Date.parse(s.start) >= h && Date.parse(s.end) <= h + 3600000);
  assert.equal(q.length, 4);
  const mean = q.reduce((a, s) => a + s.price, 0) / 4;
  assert.ok(Math.abs(mean - now.price) < 2e-4, `${mean} vs ${now.price}`);
});
