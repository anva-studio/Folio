import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
let text = 'Folio third-party JavaScript notices\nGenerated from installed production dependencies. Electron also ships LICENSE and LICENSES.chromium.html.\n\n';
const visited = new Set();
function visit(name, parent) {
  let directory = parent;
  let target;
  while (true) {
    const candidate = path.join(directory, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) { target = candidate; break; }
    const next = path.dirname(directory);
    if (next === directory) throw new Error(`Missing dependency ${name}`);
    directory = next;
  }
  if (visited.has(target)) return;
  visited.add(target);
  const dep = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
  text += `\n===== ${dep.name} ${dep.version} (${dep.license || 'see license text'}) =====\n`;
  const licenses = fs.readdirSync(target).filter(file => /^(licen[sc]e|copying|notice)(\.|$)/i.test(file) && fs.statSync(path.join(target, file)).isFile());
  if (!licenses.length) throw new Error(`No license text for ${dep.name}`);
  for (const file of licenses) text += fs.readFileSync(path.join(target, file), 'utf8') + '\n';
  for (const dependency of Object.keys(dep.dependencies || {})) visit(dependency, target);
}
for (const name of Object.keys(pkg.dependencies)) visit(name, root);
fs.writeFileSync('THIRD-PARTY-NOTICES.txt', text);
fs.writeFileSync('src/application/thirdPartyNotices.ts', 'export const THIRD_PARTY_NOTICES = ' + JSON.stringify(text) + ';' );
fs.copyFileSync('THIRD-PARTY-NOTICES.txt', 'public/THIRD-PARTY-NOTICES.txt');
console.log(`License notices generated for ${visited.size} production packages.`);

