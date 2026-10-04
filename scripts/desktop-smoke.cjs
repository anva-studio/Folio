// Tests the actual packaged app, using only disposable workspace-local data.
const { app, BrowserWindow, shell, clipboard } = require('electron');
// This harness runs with Electron's CLI app metadata; use Folio's packaged manifest version.
app.getVersion=()=>require('../package.json').version;
const opened=[];shell.openExternal=async url=>{opened.push(url);};
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const fixture = path.resolve(__dirname, '../../../work/windows-runtime-' + Date.now());
app.setPath('userData', fixture);
app.on('browser-window-created', (_event, window) => { window.hide(); });
require(path.join(process.env.FOLIO_INSTALLED_RESOURCES || path.resolve(__dirname,'../release/windows/win-unpacked/resources'),'app.asar/desktop/main.cjs'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
let errors = [];let originalDownloadName;
async function evaluate(code) {
  try { return await win.webContents.executeJavaScript(code); }
  catch (error) { throw new Error(`Renderer test failed for ${code}: ${error.message}; console: ${JSON.stringify(errors)}`); }
}
async function wait(code, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) { if (await evaluate(code)) return; await delay(50); }
  throw new Error('Timed out: ' + label+'; '+await evaluate('document.body.textContent')+'; console: '+JSON.stringify(errors));
}
async function fill(id, value) {
  await evaluate(`{const el=document.getElementById(${JSON.stringify(id)});if(!el)throw new Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));}`);
}
async function click(label) {
  await evaluate(`{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().replace(/^•\s*/,'')===${JSON.stringify(label)}&&!b.disabled&&b.getBoundingClientRect().width);if(!b)throw new Error('Missing button '+${JSON.stringify(label)});b.click();}`);
}
async function download(label, filename) {
  let received;
  const done = new Promise((resolve,reject) => {
    win.webContents.session.once('will-download', (_event,item) => {
      originalDownloadName=item.getFilename(); received = path.join(fixture,filename); item.setSavePath(received);
      item.once('done', (_event,state) => state==='completed' ? resolve(received) : reject(new Error(state)));
    });
  });
  await click(label);
  return Promise.race([done,delay(10_000).then(()=>{throw new Error('Download did not finish')})]);
}
app.whenReady().then(async () => {
  await fs.mkdir(fixture,{recursive:true});
  while (!BrowserWindow.getAllWindows().length) await delay(20);
  win = BrowserWindow.getAllWindows()[0];
  win.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  await wait("!!document.querySelector('.welcome-page')",'fresh launch welcome');await click('OPEN YOUR FOLIO');
  await wait("!!document.getElementById('profile-label')",'fresh profile form');
  assert.equal(await evaluate('isSecureContext && !!crypto.subtle && !!indexedDB'),true);
  await fill('profile-label','Windows QA');
  await fill('profile-password','disposable-windows-qa');
  await fill('profile-password-confirm','disposable-windows-qa');
  await click('Create profile');
  await wait("document.querySelector('.screen-title')?.textContent==='Dashboard'",'created profile');
  await click('Accounts'); await click('Add account');
  await fill('account-name','PRIVATE_QA_ACCOUNT'); await fill('account-opening-balance','1234.56'); await click('Create');
  await wait("document.body.textContent.includes('PRIVATE_QA_ACCOUNT')&&!document.querySelector('[role=dialog]')",'account saved');
  await click('Transactions');await click('New transaction');await fill('transaction-amount','20');await click('New');await fill('new-category-name','Food');await click('Create');await click('Save and add another');
  await wait("document.getElementById('transaction-amount')?.value===''",'next entry reset');await fill('transaction-amount','30');
  await evaluate("{const el=document.getElementById('transaction-category');el.value=el.options[1].value;el.dispatchEvent(new Event('change',{bubbles:true}));}");await click('Create');await wait("!document.querySelector('[role=dialog]')",'second entry saved');
  await click('Lock');
  await wait("!!document.getElementById('unlock-password')",'locked profile');
  await evaluate("document.querySelector('.profile-row-btn').click()");
  await fill('unlock-password','wrong'); await click('Unlock');
  await wait("document.body.textContent.includes('Incorrect password')",'wrong password rejected');
  await evaluate("document.querySelector('.profile-row-btn').click()");await fill('unlock-password','disposable-windows-qa'); await click('Unlock');
  await wait("document.querySelector('.screen-title')?.textContent==='Dashboard'",'unlock persisted profile');
  assert.equal(await evaluate("document.body.textContent.includes('PRIVATE_QA_ACCOUNT')"),true);
  assert.equal(await evaluate("document.body.textContent.includes('1,184.56')"),true);
  await click('Settings');
  await wait("!!document.querySelector('input[type=file][accept*=image]')",'profile identity ready');
  // Actual Chromium image decoding, square crop and encrypted restoration.
  const image=await fs.readFile(path.resolve(__dirname,'../public/example-meera.webp'));
  await evaluate(`{const bytes=Uint8Array.from(atob(${JSON.stringify(image.toString('base64'))}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'portrait.webp',{type:'image/webp'}));const el=document.querySelector('input[type=file][accept*=image]');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Use this photo')",'local photo preview');await click('Use this photo');
  await wait("!!document.querySelector('.current-identity img')",'saved photo identity');
  const photo=await evaluate("document.querySelector('.current-identity img').src");assert.ok(photo.startsWith('data:image/jpeg;base64,'));assert.ok(photo.length<150000);
  const size=await evaluate("new Promise(resolve=>{const i=new Image();i.onload=()=>resolve([i.width,i.height]);i.src=document.querySelector('.current-identity img').src})");assert.deepEqual(size,[256,256]);
  const backupPath = await download('Create encrypted backup','qa.folio');
  const backupText = await fs.readFile(backupPath,'utf8');
  const backup = JSON.parse(backupText);
  assert.equal(backup.format,'folio-encrypted-backup');
  assert.equal(backupText.includes('PRIVATE_QA_ACCOUNT'),false);
  assert.equal(backupText.includes('disposable-windows-qa'),false);
  const csvPath = await download('Export accounts','qa.csv');
  assert.equal((await fs.readFile(csvPath,'utf8')).includes('PRIVATE_QA_ACCOUNT'),true);
  await evaluate(`{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(backupText)}],'qa.folio'));const el=document.getElementById('restore-input');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await wait("!!document.getElementById('replace-confirm')",'restore collision confirmation');await fill('replace-confirm','Windows QA');await click('Replace');await wait("!!document.getElementById('unlock-password')",'restore returns locked');
  await evaluate("document.querySelector('.profile-row-btn').click()");await fill('unlock-password','disposable-windows-qa');await click('Unlock');await wait("document.querySelector('.screen-title')?.textContent==='Dashboard'",'restored profile');assert.equal(await evaluate("document.body.textContent.includes('1,184.56')"),true);
  // Reloading the production origin starts locked and keeps the vault.
  win.webContents.reload();
  await wait("!!document.querySelector('.welcome-page')",'returning fresh welcome');await click('OPEN YOUR FOLIO');
  await wait("!!document.getElementById('unlock-password')",'reload locked');
  assert.equal(await evaluate("document.body.textContent.includes('Windows QA')"),true);
  await evaluate("document.querySelector('.profile-row-btn').click()");await fill('unlock-password','disposable-windows-qa');await click('Unlock');await wait("document.querySelector('.screen-title')?.textContent==='Dashboard'",'reloaded profile unlock');
  assert.equal(await evaluate("!!document.querySelector('.current-identity img')"),true);
  await click('Help & FAQ');await wait("!!document.getElementById('help-search')||!!document.querySelector('input[type=search]')",'bundled Help');
  await click('Email ANVA');await click('Visit ANVA');await click('Send feedback');await click('Copy email');await delay(150);assert.equal((await clipboard.readText()),'Anvahq@gmail.com');await click('Copy app information');await delay(150);assert.match((await clipboard.readText()),/Folio 1.0.0/);assert.ok(!(await clipboard.readText()).includes('PRIVATE_QA_ACCOUNT'));
  assert.deepEqual(opened,['mailto:Anvahq@gmail.com','https://anva-studio.github.io/','https://forms.gle/W7qtQRmqxgkZkLtS9']);
  await click('Welcome to Folio');await wait("!!document.querySelector('.welcome-page')",'return Welcome');await click('EXPLORE EXAMPLE PROFILE');await wait("document.body.textContent.includes('EXAMPLE · SAMPLE DATA')",'sample opened');await click('Settings');
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Create encrypted backup')"),false);
  const sampleCsv=await download('Export accounts','example-accounts.csv');assert.ok(originalDownloadName.startsWith('FOLIO-EXAMPLE-'));assert.ok((await fs.readFile(sampleCsv,'utf8')).includes('Everyday'));
  await click('Rename');await wait("!!document.querySelector('[role=dialog] input')",'example rename');await evaluate("{const el=document.querySelector('[role=dialog] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Sandbox experiment');el.dispatchEvent(new Event('input',{bubbles:true}));}");await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Rename').click()");await wait("document.body.textContent.includes('Sandbox experiment')&&!document.querySelector('[role=dialog]')",'sample edit');
  await click('Reset Example Profile');await click('Reset example');await wait("document.body.textContent.includes('Meera Rao')&&!document.querySelector('[role=dialog]')",'sample reset');await click('Settings');await click('Delete Example Profile');await click('Delete example');await wait("!!document.querySelector('.welcome-page')",'sample deletion');
  win.webContents.reload();await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='RESTORE EXAMPLE PROFILE')",'deleted example stays deleted');await click('RESTORE EXAMPLE PROFILE');await wait("document.body.textContent.includes('Meera Rao')&&document.body.textContent.includes('EXAMPLE · SAMPLE DATA')",'explicit restore');
  await click('Switch profile');await wait("!!document.getElementById('unlock-password')",'personal remains');assert.equal(await evaluate("document.querySelectorAll('.profile-row-btn').length"),1);await fill('unlock-password','disposable-windows-qa');await click('Unlock');await wait("document.querySelector('.screen-title')?.textContent==='Dashboard'",'personal preserved');assert.equal(await evaluate("document.body.textContent.includes('1,184.56')"),true);assert.equal(await evaluate("!!document.querySelector('.current-identity img')"),true);
  await click('Transactions');await click('New transaction');await fill('transaction-amount','42');win.close();
  await wait("document.body.textContent.includes('Discard unfinished entry?')",'desktop close guarded');await click('Keep editing');assert.equal(win.isDestroyed(),false);assert.equal(await evaluate("document.getElementById('transaction-amount').value"),'42');
  // Re-request close and explicitly discard only the unsubmitted form.
  win.close();await wait("document.body.textContent.includes('Discard unfinished entry?')",'desktop close re-request');
  assert.deepEqual(errors,[]);
  const closed=new Promise(resolve=>win.once('closed',resolve));await click('Discard entry');await Promise.race([closed,delay(10_000).then(()=>{throw Error('Normal close failed')})]);
  console.log(JSON.stringify({result:'PASS',origin:'folio://app',checks:['secure context + WebCrypto + IndexedDB','fresh profile','account save','two transactions + save/add','lock flush','wrong password','persisted unlock','encrypted backup download','plaintext CSV download','restore collision + exact balance','fresh Welcome on reopen','real Chromium photo crop + encrypted backup restore','native contact allowlist + clipboard','Example edit/reset/delete/restore + personal isolation','dirty form guards desktop close','normal close flush'],fixture,resources:process.env.FOLIO_INSTALLED_RESOURCES||'win-unpacked/resources'}));
}).catch(error => { console.error(error);app.exit(1); });




