import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, root, runJq, program, minutes } from './helpers.js';

// Recorded live answers of https://elpriser.org/api/slots (test/fixtures/*.json).
const FIXTURES = ['de', 'es', 'dk1_inkl_alt', 'dk2_net', 'se3', 'xk', 'gb'];

function checkRates(rates, input) {
  assert.ok(rates.length > 0);
  assert.equal(rates.length, input.slots.length, 'one rate per slot, none added or dropped');
  for (let i = 0; i < rates.length; i++) {
    const r = rates[i], s = input.slots[i];
    assert.deepEqual(Object.keys(r).sort(), ['end', 'start', 'value'], 'exactly what evcc reads');
    assert.equal(r.start, s.start);
    assert.equal(r.end, s.end);
    assert.equal(r.value, s.price, 'value = price, currency per kWh, as the service delivers it');
    assert.match(r.start, /^\d{4}-\d\d-\d\dT\d\d:\d\d:00Z$/, 'UTC timestamps');
    assert.ok([15, 30, 60].includes(minutes(r)), `slot of ${minutes(r)} minutes`);
    assert.equal(typeof r.value, 'number');
    if (i) assert.ok(Date.parse(r.start) >= Date.parse(rates[i - 1].end), 'in order, no overlap');
  }
}

for (const name of FIXTURES) {
  test(`recorded answer ${name}: every slot becomes one rate on the same instants`, () => {
    const input = fixture(name);
    checkRates(runJq(program(), input), input);
  });
}

test('Germany and Spain: the settled days are 15-minute slots, the model days hourly', () => {
  for (const name of ['de', 'es']) {
    const rates = runJq(program(), fixture(name));
    const input = fixture(name);
    const settled = input.slots.map((s, i) => [s, rates[i]]).filter(([s]) => s.type === 'actual');
    assert.ok(settled.length >= 192, `${name}: two settled days or more`);
    assert.ok(settled.every(([, r]) => minutes(r) === 15), `${name}: 15 minutes`);
    assert.ok(input.slots.filter((s) => s.type === 'forecast').every((s) => minutes(s) === 60), `${name}: forecast days hourly`);
  }
});

test('Denmark: the settled days are 15-minute slots in DKK/kWh, the forecast days hourly', () => {
  for (const name of ['dk1_inkl_alt', 'dk2_net']) {
    const input = fixture(name);
    assert.equal(input.currency, 'DKK');
    const rates = runJq(program(), input);
    assert.ok(rates.filter((r, i) => input.slots[i].type === 'actual').every((r) => minutes(r) === 15), name);
  }
});

test('hourly sources stay hourly (Kosovo) and half-hourly ones are not cut up (Great Britain)', () => {
  assert.ok(runJq(program(), fixture('xk')).every((r) => minutes(r) === 60));
  assert.ok(runJq(program(), fixture('gb')).every((r) => minutes(r) >= 30));
});

test('the jq program is the whole logic: no time zone arithmetic left in it', () => {
  const code = program().split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.ok(!/fromdate|mktime|gmtime|strptime|dst/i.test(code), code);
});

test('every example reads /api/slots and carries exactly this program', () => {
  const code = program().trimEnd();
  const files = readdirSync(join(root, 'examples')).filter((f) => f.endsWith('.yaml'));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const yaml = readFileSync(join(root, 'examples', f), 'utf8');
    assert.match(yaml, /uri: https:\/\/elpriser\.org\/api\/slots\?zone=[a-z0-9-]+/, f);
    assert.ok(!/api\/(nordic|forecast)/.test(yaml.replace(/^#.*$/gm, '')), `${f} still reads an hourly endpoint`);
    for (const line of code.split('\n')) assert.ok(yaml.includes(line.trimEnd()), `${f} lacks the program line: ${line}`);
  }
});
