import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalog} from '../dist/catalog.js';
import {classicRecipe, normalizeRecipe, powers, recipeSeed} from '../dist/formulas.js';
import {ensurePrecision, parseDecimal, zoomLog} from '../dist/math.js';

// Model a direct, full-budget orbit. A multiplication of two b-bit values
// costs b² units. A long division of n bits by d bits costs d*(n-d).
// Count nominal widths, not leading zeroes or the runtime's multiplication
// algorithm. Ignore linear work, initialization, cache misses and final color.
const W = 1010, budget = 200;
const depths = Array.from({length: 91}, (_, i) => i + 11);
const precisions = new Map();
let digits = 40;
for (let x = 0; x <= depths.at(-1); ++x) {
  const span = parseDecimal('3.3e-' + x, digits);
  assert(span > 0n);
  const state = ensurePrecision({digits, span: String(span), cx: '0', cy: '0'});
  digits = state.digits;
  assert(Math.abs(zoomLog(state) - x) < 1e-10);
  precisions.set(x, {
    digits,
    classic: digits * Math.log2(10),
    studio: Math.ceil((x + Math.log10(W) + 32) * Math.log2(10)),
  });
}

function polynomialDegree(bits) {
  const unit = 1n << BigInt(bits);
  let factorial = 1n;
  for (let n = 2; ; ++n) {
    factorial *= BigInt(n);
    if ((unit >> BigInt(20 * n)) < factorial) return n - 1;
  }
}

function costOf(preset, x) {
  const p = precisions.get(x);
  if (preset.type !== 'studio' || classicRecipe(preset.recipe)) {
    return {model: 'Clasic', iterations: budget, bits: p.classic, digits: p.digits, work: budget * (5 + 2) * p.classic ** 2};
  }
  const recipe = preset.recipe;
  const b = p.studio, square = b ** 2;
  const expBits = b + 24 + Math.ceil(Math.log2(b));
  const angleDegree = polynomialDegree(b), expDegree = polynomialDegree(expBits);
  const sineCost = (4 + angleDegree - 1) * square;
  const pairCost = (6 + angleDegree - 1) * square;
  const expCost = (expDegree + 1) * expBits ** 2;
  if (recipe.mode === 'lyapunov') {
    const iterations = budget + 24;
    return {model: 'Studio', iterations, bits: b, work: 2 * iterations * square};
  }
  const sequence = recipe.steps.flatMap(step => Array(step.repeat).fill(step));
  const dual = recipeSeed(recipe).dual ? 2 : 1;
  const single = recipe.steps.length === 1;
  let work = 0, sinCalls = 0, pairs = 0, exps = 0;
  for (let i = 0; i < budget; ++i) {
    const step = sequence[i % sequence.length];
    const power = powers[step.formula] ?? 2;
    const base = (5 + 4 * (power - 2)) * square;
    switch (step.formula) {
      case 'warp':
        work += base + 2 * square + 2 * sineCost;
        sinCalls += 2;
        break;
      case 'phoenix':
        work += base + (recipe.memory === -.5 ? 0 : 2 * square);
        break;
      case 'lambda': work += base + 4 * square; break;
      case 'cubic': work += base + 6 * square; break;
      case 'newton': case 'nova':
        work += base + (4 + 2 * 4 + (single ? 2 : 0) +
          (step.formula === 'newton' && (step.drift || (step.julia && (step.re !== 0 || step.im !== 0))) ? 4 : 0)) * square;
        break;
      case 'magnet': work += base + (2 + 4 + 3 + (single ? 2 : 0) + 2 * 2) * square; break;
      case 'sine': case 'exp':
        work += (step.formula === 'sine' ? 5 : 4) * square + pairCost + expCost;
        pairs++;
        exps++;
        break;
      default: work += base;
    }
  }
  return {
    model: 'Studio', iterations: budget * dual, bits: b,
    angleDegree: sinCalls || pairs ? angleDegree : undefined,
    expDegree: exps ? expDegree : undefined,
    sinCalls: sinCalls * dual, pairs: pairs * dual, exps: exps * dual,
    work: work * dual,
  };
}

const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const classicLine = source.split('\n').find(line => line.startsWith('const presets='));
const builtins = [...classicLine.matchAll(/(\w+):\{name:'([^']+)',type:'([^']+)'/g)]
  .map(([, id, name, type]) => ({id, name, type, group: 'Originals'}));
assert.equal(builtins.length, 3);
const userWarp = {id: 'customWarp', name: 'Drift z³ → Warp ×3', group: 'Custom', type: 'studio', recipe: normalizeRecipe({
  steps: [{formula: 'z3', julia: true, re: -.23, im: .53, drift: true, amplitude: .08, period: 13}, {formula: 'warp', repeat: 3}],
})};
const presets = [...builtins, ...Object.entries(catalog).map(([id, p]) => ({id, ...p})), userWarp];
assert.equal(new Set(presets.map(p => p.id)).size, 4 + Object.keys(catalog).length);
assert.equal(costOf(userWarp, 12).sinCalls, 300);
assert.equal(costOf(catalog.cubic, 12).iterations, 400);
assert.equal(costOf(catalog.lyapunov, 12).iterations, 224);
assert.equal(costOf(catalog.dendrite, 12).model, 'Clasic');
assert.equal(costOf(catalog.rings, 12).model, 'Studio');

const base = 5 * budget * precisions.get(12).studio ** 2;
const ratio = (p, from, to) => costOf(p, to).work / costOf(p, from).work;
const percentage = (p, from, to) => 100 * (ratio(p, from, to) - 1);
const decimal = (value, digits = 2) => value == null ? '' : value.toFixed(digits).replace('.', ',');
const idSteps = p => p.recipe?.mode === 'lyapunov' ? p.recipe.sequence : p.recipe?.steps.map(s =>
  [s.formula, s.repeat > 1 ? '×' + s.repeat : '', s.julia ? '+Julia' : '', s.drift ? '+Drift' : ''].join('')
).join(' → ') ?? p.type;

const summary = [[
  'Preset', 'Categorie', 'Motor fallback', 'Rețetă', 'Iterații modelate per pixel', 'Cost la 10^12 relativ la z² Studio',
  'Creștere 10^12 → 10^13 (%)', 'Creștere 10^16 → 10^17 (%)', 'Creștere 10^40 → 10^41 (%)',
  'Creștere 10^100 → 10^101 (%)', 'Factor 10^100 / 10^12', 'Sinusuri per pixel', 'Perechi sin/cos per pixel', 'Exp per pixel',
]];
const details = [[
  'Preset', 'Categorie', 'Motor fallback', 'Exponent x (zoom 10^x)', 'Cifre zecimale (Clasic)',
  'Biți nominali', 'Grad trig', 'Grad exp', 'Cost relativ la propriul cost la 10^12', 'Creștere la x+1 (%)',
]];
for (const preset of presets) {
  const ref = costOf(preset, 12);
  summary.push([
    preset.name, preset.group, ref.model, idSteps(preset), ref.iterations, decimal(ref.work / base),
    ...[12, 16, 40, 100].map(x => decimal(percentage(preset, x, x+1))), decimal(ratio(preset, 12, 100)),
    ref.sinCalls || 0, ref.pairs || 0, ref.exps || 0,
  ]);
  for (const x of depths) {
    const c = costOf(preset, x);
    details.push([
      preset.name, preset.group, c.model, x, c.digits ?? '', decimal(c.bits), c.angleDegree ?? '', c.expDegree ?? '',
      decimal(c.work / ref.work, 4), x < depths.at(-1) ? decimal(percentage(preset, x, x+1), 4) : '',
    ]);
  }
}
function csv(rows) {
  const escape = v => /[;"\r\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : v;
  return '\ufeff' + rows.map(row => row.map(escape).join(';')).join('\r\n') + '\r\n';
}
function markdown() {
  const rows = summary.slice(1).map(([name, , engine, recipe, iterations, cost, , , , , growth, sin, pairs, exps]) =>
    [name, engine, recipe, iterations, cost, growth, [sin, pairs, exps].join(' / ')]);
  return [
    ['Presetare', 'Motor direct', 'Pași / tip', 'Iterații/pixel', 'Cost la $10^{12}$ față de $z^2$ Studio', '$C(100)/C(12)$', 'sin / sincos / exp per pixel'],
    ['---', '---', '---', '---:', '---:', '---:', '---:'],
    ...rows,
  ].map(row => '| ' + row.join(' | ') + ' |').join('\n') + '\n';
}
const mode = process.argv[2] ?? '--csv';
if (!['--csv', '--decades', '--markdown'].includes(mode)) throw Error('Use --csv, --decades or --markdown.');
process.stdout.write(mode === '--markdown' ? markdown() : csv(mode === '--decades' ? details : summary));
