// Synthetic Example only: trusted keyboard input plus affected responsive views.
const {app,BrowserWindow}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('verification/workspace-polish/renderer');app.disableHardwareAcceleration();app.setPath('userData',path.join(root,'runtime-'+Date.now()));require('../desktop/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));let win;const errors=[],captures=[];
const evaluate=code=>win.webContents.executeJavaScript(code);
async function wait(code){for(let i=0;i<200;i++){if(await evaluate(code))return;await delay(50);}throw Error('Timed out '+code);}
async function click(text){await evaluate(`{const b=[...document.querySelectorAll('button')].find(e=>(e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)})&&e.getBoundingClientRect().width&&!e.disabled);if(!b)throw Error('Missing '+${JSON.stringify(text)});b.click()}`);await delay(100);}
async function visit(name){if(win.getContentSize()[0]<900)await click('Menu');await click(name);await wait('document.querySelector(".screen-title")?.textContent==='+JSON.stringify(name));}
async function key(keyCode,modifiers){win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await delay(120);}
async function capture(name){await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth||document.querySelector(".main").scrollWidth>document.querySelector(".main").clientWidth'),false,name+' overflow');await fs.writeFile(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());captures.push(name);}
app.whenReady().then(async()=>{
 await fs.mkdir(root,{recursive:true});while(!BrowserWindow.getAllWindows().length)await delay(20);win=BrowserWindow.getAllWindows()[0];win.setMinimumSize(0,0);win.webContents.setBackgroundThrottling(false);win.show();win.focus();win.webContents.on('console-message',e=>{if(e.level==='error'||e.level==='warning')errors.push(e.message);});
 await wait('!!document.querySelector(".welcome-page")');await click('EXPLORE EXAMPLE PROFILE');await wait('document.querySelector(".screen-title")?.textContent==="Dashboard"');
 for(const theme of ['Dark','Light']){
  await visit('Settings');await click(theme);
  for(const [width,height]of [[1280,900],[390,844],[360,740],[320,690],[600,360]]){
   win.setContentSize(width,height);await visit('Reports');await evaluate('document.querySelector(".main").scrollTop=0');await capture(theme+'-'+width+'-reports');
   await key('K',['control']);await wait('document.activeElement?.id==="history-search"');assert.equal(await evaluate('document.querySelector(".txn-filters summary").textContent'),'Filters · All transactions');await capture(theme+'-'+width+'-search');
   await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="New transaction").focus()');await key('N',['control','alt']);await wait('!!document.querySelector("[role=dialog] #transaction-amount")');await capture(theme+'-'+width+'-entry');
   assert.equal(await evaluate('(()=>{const d=document.querySelector("[role=dialog]");return d.scrollWidth>d.clientWidth})()'),false,'Entry dialog overflow');await key('K',['control']);assert.equal(await evaluate('!!document.querySelector("[role=dialog] #transaction-amount")'),true,'Search must not replace entry dialog');await click('Cancel');await wait('!document.querySelector("[role=dialog]")');
  }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'result.json'),JSON.stringify({result:'PASS',captures,checks:['Trusted Ctrl+K focuses clean all-history search','Trusted Ctrl+Alt+N opens entry','Open dialog preserved','No page/main/dialog horizontal overflow'],errors},null,2));app.exit(0);
}).catch(async e=>{await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'failure.txt'),e.stack);app.exit(1);});
