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

/** The program every example and the template use. */
export const program = () => readFileSync(join(root, 'src/elpriser.jq'), 'utf8');

/** Length of a slot in minutes. */
export const minutes = (s) => (Date.parse(s.end) - Date.parse(s.start)) / 60000;
