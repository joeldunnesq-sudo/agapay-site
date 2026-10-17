import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { uncheckedRuntimeParameters } from './lib/runtime-type-safety.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let parameters = 0;
const unchecked = [];
for (const name of ['worker', 'learn', 'browser', 'browser-workers']) {
  const configPath = path.join(root, `tsconfig.${name}.json`);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw new Error('Invalid TypeScript project: ' + name);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const result = uncheckedRuntimeParameters(program, root);
  parameters += result.parameters;
  unchecked.push(...result.unchecked.map((item) => ({ project: name, ...item })));
}
if (!parameters) throw new Error('No runtime parameters were audited.');
if (unchecked.length) {
  console.error('Unchecked runtime parameters (library-inferred any is not a checked contract):');
  for (const item of unchecked) console.error(`${item.file}:${item.line} ${item.name} (${item.project})`);
  process.exit(1);
}
console.log(
  `PASS - ${parameters} runtime parameter occurrences checked across four projects; no inferred-any parameters`
);
