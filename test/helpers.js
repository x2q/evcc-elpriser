import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const zones = JSON.parse(readFileSync(join(root, 'src/zones.json'), 'utf8'));
export const fixture = (name) => JSON.parse(readFileSync(join(root, 'test/fixtures', name + '.json'), 'utf8'));

/** jq binary: JQ=gojq runs the tests with the Go implementation evcc itself uses. */
const JQ = process.env.JQ || 'jq';

/** Run a jq program over a JSON value; the program's result is a JSON string (as evcc expects). */
export function runJq(program, input) {
  const out = execFileSync(JQ, ['-r', program], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out);
}

export function program({ local = true, actualOnly = false } = {}) {
  return readFileSync(join(root, 'src/elpriser.jq'), 'utf8')
    .replace('__LOCAL_CURRENCY__', String(local))
    .replace('__ACTUAL_ONLY__', String(actualOnly));
}

const fmt = new Map();
/** Local calendar date (YYYY-MM-DD) and hour (0-23) of a UTC instant in an IANA zone. */
export function localParts(iso, tz) {
  if (!fmt.has(tz)) {
    fmt.set(
      tz,
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      }),
    );
  }
  const p = Object.fromEntries(fmt.get(tz).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Length in hours of a local calendar day (23, 24 or 25). */
export function dayLength(date, tz) {
  const next = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const start = firstInstant(date, tz);
  return (firstInstant(next, tz) - start) / 3600000;
}

function firstInstant(date, tz) {
  // local midnight lies in 21:00..03:00Z +/-; search the hour whose local date is `date` and hour is 0
  const base = Date.parse(date + 'T00:00:00Z');
  for (let h = -14; h <= 14; h++) {
    const t = base + h * 3600000;
    const p = localParts(new Date(t).toISOString(), tz);
    if (p.date === date && p.hour === 0) return t;
  }
  throw new Error('no local midnight for ' + date + ' ' + tz);
}
