import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
function run(args){
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
for(const name of readdirSync(new URL('../dist/',import.meta.url)).filter(name=>name.endsWith('.js'))){run(['--check',`dist/${name}`]);}
for(const name of readdirSync(root).filter(name=>/^verify(?:-[\w-]+)?\.mjs$/.test(name)).sort()){run([name]);}
console.log('All checks passed.');
