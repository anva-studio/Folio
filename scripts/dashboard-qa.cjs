// Focused offline visual acceptance using only the synthetic Example profile.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('verification/goals/dashboard-responsive');
app.disableHardwareAcceleration();app.setPath('userData',path.join(root,'runtime-'+Date.now()));
require('../desktop/main.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));let win;const errors=[],results=[];
const evaluate=code=>win.webContents.executeJavaScript(code);
async function wait(code){for(let i=0;i<200;i++){if(await evaluate(code))return;await delay(50);}throw Error('Timed out: '+code);}
async function click(text){await evaluate(`{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getBoundingClientRect().width&&!e.disabled);if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click()}`);await delay(120);}
async function visit(name,mobile){if(mobile)await click('Menu');await click(name);await wait('document.querySelector(".screen-title")?.textContent==='+JSON.stringify(name));}
async function capture(name){await delay(180);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth||document.querySelector(".main").scrollWidth>document.querySelector(".main").clientWidth'),false,name+' overflow');await fs.writeFile(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());results.push(name);}
app.whenReady().then(async()=>{
 await fs.mkdir(root,{recursive:true});while(!BrowserWindow.getAllWindows().length)await delay(20);win=BrowserWindow.getAllWindows()[0];win.setMinimumSize(0,0);win.webContents.setBackgroundThrottling(false);
 win.webContents.on('console-message',event=>{if(event.level==='error'||event.level==='warning')errors.push(event.message);});
 await wait('!!document.querySelector(".welcome-page")');await click('EXPLORE EXAMPLE PROFILE');await wait('document.querySelector(".screen-title")?.textContent==="Dashboard"');
 for(const theme of ['Dark','Light']){
  await visit('Settings',win.getContentSize()[0]<900);await click(theme);
  for(const [width,height] of [[1280,900],[390,844],[360,740],[320,690],[600,360]]){
   win.setContentSize(width,height);await visit('Dashboard',width<900);await evaluate('document.querySelector(".main").scrollTop=0');assert.equal(await evaluate('innerWidth'),width);assert.equal(await evaluate('innerHeight'),height);await capture(theme+'-'+width+'-dashboard');
   await visit('Goals',width<900);await wait('!!document.querySelector(".goal-funding-history")');await evaluate('document.querySelector(".goal-funding-history").open=true;document.querySelector(".goal-funding-history").scrollIntoView({block:"start",behavior:"instant"})');await capture(theme+'-'+width+'-funding-snapshots');
   assert.equal(await evaluate('[...document.querySelectorAll(".goal-funding-history dd.amount")].every(e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)+1)'),true,'Captured amounts must stay together');
  }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'result.json'),JSON.stringify({result:'PASS',screens:results,errors},null,2));app.exit(0);
}).catch(async error=>{await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,'failure.txt'),String(error.stack));app.exit(1);});
