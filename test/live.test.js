// Runs against the live service. Skipped unless ELPRISER_LIVE=1 (needs network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zones, runJq, program } from './helpers.js';

const live = process.env.ELPRISER_LIVE === '1';
const get = async (path) => {
  const r = await fetch('https://elpriser.org' + path, { headers: { 'User-Agent': 'evcc-elpriser-tests/0.1' } });
  assert.equal(r.status, 200, path);
  return r.json();
};

test('the zone list of the service is the zone list of this repository', { skip: !live }, async () => {
  const spec = await get('/api/openapi.json');
  const nordic = spec.paths['/api/nordic'].get.parameters.find((p) => p.name === 'zone').schema.enum;
  assert.deepEqual([...nordic].sort(), zones.map((z) => z.key).sort());
});

test('DK1: the slot of the current hour equals /api/now', { skip: !live }, async () => {
  const fc = await get('/api/forecast?area=DK1&mode=inkl_alt');
  const now = await get('/api/now?area=DK1&mode=inkl_alt');
  const slots = runJq(program(), fc);
  const t = Date.now();
  const cur = slots.find((s) => Date.parse(s.start) <= t && t < Date.parse(s.end));
  assert.ok(cur, 'a slot covers now');
  assert.ok(Math.abs(cur.value - now.price) < 1e-4, `${cur.value} vs ${now.price}`);
});

for (const z of ['de', 'pl', 'se3', 'es', 'gr', 'pt', 'ie']) {
  test(`${z}: the live answer becomes hourly slots that cover now`, { skip: !live }, async () => {
    const r = await get('/api/nordic?zone=' + z);
    const slots = runJq(program(), r);
    const t = Date.now();
    assert.ok(slots.some((s) => Date.parse(s.start) <= t && t < Date.parse(s.end)), 'a slot covers now');
    const future = slots.filter((s) => Date.parse(s.start) > t);
    assert.ok(future.length >= 12, 'at least the rest of today and some of tomorrow');
    // the only gaps are hours the service itself has no price for (pt and ie: the last hour of a published day)
    const nulls = r.days.flatMap((d) => d.prices).filter((p) => p.eur_mwh == null).length;
    let gaps = 0;
    for (let i = 1; i < slots.length; i++) {
      const dt = (Date.parse(slots[i].start) - Date.parse(slots[i - 1].end)) / 3600000;
      assert.ok(dt >= 0, 'no overlap');
      gaps += dt;
    }
    assert.ok(gaps <= nulls, `${gaps} missing hours, ${nulls} unpriced rows in the answer`);
  });
}
