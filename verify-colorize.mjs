import assert from 'node:assert/strict';
import {colorize} from './dist/colorize.js';
import {colorAt,palettes,parseDecimal} from './dist/math.js';
import {RenderCache} from './dist/render-cache.js';
const memory=new RenderCache({maxBytes:900});const old={width:10,height:10,field:new Float64Array(10)},next={width:10,height:10,field:new Float64Array(10)};memory.set('old',old);memory.set('next',next);assert.equal(memory.bytes,480);assert.equal(old.field,null);assert.equal(old.width,0);
const values=new Float64Array([-3.6,0,.01,1.23456789,31.125,99.99,599.9,600,900,...Array.from({length:500},(_,i)=>(i*1.714823)%600)]);
for(const palette of Object.keys(palettes))for(const phase of [0,1,31,123,359,360]){const rgba=colorize(values,600,palette,phase);for(let i=0;i<values.length;i++)assert.deepEqual(Array.from(rgba.slice(i*4,i*4+4)),[...colorAt(values[i],600,palette,phase),255]);}
let messages=[];globalThis.self={};globalThis.postMessage=m=>messages.push(m);await import('./dist/worker.js');
const state={digits:40,cx:parseDecimal('-.7453',40).toString(),cy:parseDecimal('.1127',40).toString(),span:parseDecimal('.012',40).toString(),jr:-.745,ji:.186,type:'mandelbrot',palette:'aurora',shift:0};
function calculate(s){messages=[];self.onmessage({data:{id:1,state:s,width:32,height:24,iterations:400}});assert(!messages.some(m=>m.error));assert(messages.at(-1).done);assert(messages.every(m=>m.values instanceof Float64Array&&!('pixels'in m)));return messages.at(-1).values;}
for(const type of ['mandelbrot','julia','ship'])assert.deepEqual(calculate({...state,type}),calculate({...state,type,palette:'ember',shift:250}));
const big=new Float64Array(1920*1427);for(let i=0;i<big.length;i++)big[i]=(i*.1234567)%600;const start=performance.now();colorize(big,600,'ocean',123);console.log('1920 x 1427 recolor:',Math.round(performance.now()-start)+' ms');
console.log('Color checks passed: exact RGBA parity for every palette/phase, Float64 escape fields, and palette-independent math for all three fractals.');
