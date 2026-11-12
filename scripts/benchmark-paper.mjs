import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cpus} from 'node:os';
import {Worker} from 'node:worker_threads';
import {colorize} from '../dist/colorize.js';

// Replay the exact views and worker counts from the article, on the current code.
const files = [
  'zoom-detail-1010x751-warp11-warpLink-warp14.json',
  'zoom-detail-1010x751-mandel18-mandelUser-mini12-mini18-mini40-mini100.json',
];
const archive = files.flatMap(name => JSON.parse(
  readFileSync(new URL('../docs/data/' + name, import.meta.url), 'utf8').replace(/^\uFEFF/, '')
));
const [caseId = 'mini12', repeatsArg = '3'] = process.argv.slice(2);
const repeats = Number(repeatsArg);
const selected = caseId === 'all' ? archive : archive.filter(row => row.key === caseId);
assert(selected.length, 'Choose all or one of: ' + archive.map(row => row.key).join(', '));
assert(Number.isInteger(repeats) && repeats >= 1, 'Repetitions must be a positive integer.');
const workerModule = new URL('../dist/worker.js', import.meta.url).href;
const workerSource = `
import {parentPort, workerData} from 'node:worker_threads';
globalThis.self = {};
globalThis.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
await import(workerData.url);
self.onmessage({data: workerData.data});
`;

async function render({state, width, height, lanes}) {
  const workers = [], passes = new Map();
  let previewMs, mediumMs, totalMs, rgba;
  const start = performance.now();
  try {
    await Promise.all(Array.from({length: lanes}, (_, lane) => new Promise((resolve, reject) => {
      const data = {id: 1, state, width, height, iterations: state.iterations, lane, lanes};
      const worker = new Worker(workerSource, {eval: true, workerData: {url: workerModule, data}});
      workers.push(worker);
      worker.on('error', reject);
      worker.on('exit', code => reject(Error('Worker exited before its final pass: ' + code)));
      worker.on('message', message => {
        try {
          if (message.error) throw Error(message.error);
          const {step, width: w, height: h, values, done} = message;
          if (!passes.has(step)) passes.set(step, {count: 0, field: new Float64Array(w * h)});
          const pass = passes.get(step);
          for (let y = lane, offset = 0; y < h; y += lanes, offset += w) {
            pass.field.set(values.subarray(offset, offset + w), y * w);
          }
          if (++pass.count === lanes) {
            const pixels = colorize(pass.field, state.iterations, state.palette, state.shift, state.glowStart);
            const elapsed = performance.now() - start;
            if (done) {
              rgba = pixels;
              totalMs = elapsed;
            } else if (previewMs === undefined) previewMs = elapsed;
            else mediumMs = elapsed;
            passes.delete(step);
          }
          if (done) resolve();
        } catch (error) {
          reject(error);
        }
      });
    })));
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
  }
  assert.equal(rgba?.length, width * height * 4);
  return {previewMs, mediumMs, totalMs, quality: imageMetrics(rgba, width, height)};
}

function imageMetrics(rgba, w, h) {
  const groups = new Uint32Array(512);
  const tiles = Array.from({length: 12 * 8}, () => new Set());
  let edges = 0, background = 0;
  const sharp = (a, b) => Math.max(
    Math.abs(rgba[a] - rgba[b]), Math.abs(rgba[a + 1] - rgba[b + 1]),
    Math.abs(rgba[a + 2] - rgba[b + 2]),
  ) >= 24;
  for (let y = 0; y < h; ++y) for (let x = 0; x < w; ++x) {
    const p = 4 * (y * w + x), r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const bin = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    groups[bin]++;
    tiles[Math.floor(y * 8 / h) * 12 + Math.floor(x * 12 / w)].add(bin);
    if (r === 10 && g === 14 && b === 25) background++;
    if (x && sharp(p, p - 4)) edges++;
    if (y && sharp(p, p - 4 * w)) edges++;
  }
  const pixels = w * h;
  return {
    significantGroups: groups.filter(n => n >= .01 * pixels).length,
    dominantShare: Math.max(...groups) / pixels,
    variedTiles: tiles.filter(t => t.size >= 3).length,
    edgeShare: edges / (2 * pixels - w - h),
    backgroundShare: background / pixels,
  };
}

const rows = [];
for (const {key, state, log, width, height, lanes} of selected) {
  const trials = [];
  for (let i = 0; i < repeats; i++) trials.push(await render({state, width, height, lanes}));
  const sorted = [...trials].sort((a, b) => a.totalMs - b.totalMs);
  const median = sorted.length >> 1;
  const medianMs = (sorted[Math.floor((sorted.length - 1) / 2)].totalMs + sorted[median].totalMs) / 2;
  rows.push({key, log, width, height, lanes, iterations: state.iterations, medianMs, trials});
}
console.log(JSON.stringify({platform: process.platform, node: process.version,
  v8: process.versions.v8, cpu: cpus()[0]?.model, rows}, null, 2));
