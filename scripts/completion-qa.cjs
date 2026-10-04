// Application integration/visual test. All inputs are synthetic and workspace-local.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
app.disableHardwareAcceleration();
app.setPath('userData',path.resolve(__dirname,'../../../work/visual-runtime-'+Date.now()));
require('../desktop/main.cjs');
const out=path.resolve(__dirname,'../../folio-completion/screenshots');const delay=ms=>new Promise(r=>setTimeout(r,ms));let win;const errors=[];
const evaluate=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(e){throw new Error(code+" :: "+e.message+" :: "+JSON.stringify(errors));}};
async function wait(code){for(let i=0;i<200;i++){if(await evaluate(code))return;await delay(50);}throw new Error('Timed out '+code);}
async function click(label){await evaluate(`{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&b.getBoundingClientRect().width&&!b.disabled);if(!button)throw new Error('Missing '+${JSON.stringify(label)});button.click();}`);await delay(80);}
async function fill(id,value){await evaluate(`{const input=document.getElementById(${JSON.stringify(id)});if(!input)throw new Error('Missing '+${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);}
async function choose(id,value){await evaluate(`{const input=document.getElementById(${JSON.stringify(id)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));}`);}
async function visit(label,mobile){if(mobile)await click('Menu');await click(label);await wait('!document.querySelector("[role=dialog]")');}
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true});while(!BrowserWindow.getAllWindows().length)await delay(20);win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.show();
 win.webContents.on('console-message',event=>{if(event.level==='error'||event.level==='warning')errors.push(event.message);});

 await wait('document.querySelector(".welcome-page")');
 for(const theme of ['dark','light'])for(const [width,height,mode] of [[1280,900,'desktop'],[390,844,'mobile'],[360,740,'narrow']]){
  win.setContentSize(width,height);await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme));await delay(200);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,'Welcome overflow');
  await fs.writeFile(path.join(out,theme+'-'+mode+'-welcome.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 win.setContentSize(1280,900);await click('OPEN YOUR FOLIO');await wait('document.getElementById("profile-label")');
 await fill('profile-label','Arjun Shah');await fill('profile-password','visual-only');await fill('profile-password-confirm','visual-only');await click('Create profile');await wait('document.querySelector(".screen-title")?.textContent==="Dashboard"');await click('Lock');await wait('document.getElementById("unlock-password")');
 for(const theme of ['dark','light'])for(const [width,height,mode] of [[1280,900,'desktop'],[390,844,'mobile'],[360,740,'narrow']]){
  win.setContentSize(width,height);await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme));await delay(180);
  await fs.writeFile(path.join(out,theme+'-'+mode+'-profile-selection.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 win.setContentSize(1280,900);await click('Explore Example Profile');await wait('document.querySelector(".example-indicator")');await wait('document.querySelector(".screen-title")?.textContent==="Dashboard"');
 const results=[];const contrast=[];
 for(const theme of ['Dark','Light']) {await visit('Settings',win.getContentSize()[0]<900);await click(theme);
 for(const [width,height,mode] of [[1280,900,'desktop'],[390,844,'mobile'],[360,740,'narrow']]){
  win.setContentSize(width,height);await delay(150);
  for(const label of ['Dashboard','Accounts','Transactions','Scheduled','Debt','Goals','Health checks','Planner','Reports','Settings','About & Contact','Help & FAQ']){
   console.log(theme,mode,label);await visit(label,width<900);if(label==='Health checks'||label==='Planner')await click('Try example figures');await evaluate('window.scrollTo(0,0)');await delay(180);
   const metrics=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector(".screen-title")?.textContent})');assert.ok(metrics.scroll<=metrics.width,`${label} overflow ${JSON.stringify(metrics)}`);results.push({theme,mode,label,...metrics});
   const checks=await evaluate(`(()=>{
     const parse=s=>{const a=s.match(/[0-9.]+/g)?.map(Number)??[0,0,0];return [a[0],a[1],a[2],a[3]??1]};
     const blend=(a,b)=>[a[0]*a[3]+b[0]*(1-a[3]),a[1]*a[3]+b[1]*(1-a[3]),a[2]*a[3]+b[2]*(1-a[3]),1];
     const bg=e=>e?blend(parse(getComputedStyle(e).backgroundColor),bg(e.parentElement)):[255,255,255,1];
     const lum=a=>{const b=a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*b[0]+.7152*b[1]+.0722*b[2]};
     return [...document.querySelectorAll('.scope-note,.field-help,.btn-primary,.nav-item.active,.btn-danger,.label')].filter(e=>e.getBoundingClientRect().width&&e.textContent.trim()).map(e=>{const b=bg(e);const x=lum(blend(parse(getComputedStyle(e).color),b)),y=lum(b);return {text:e.textContent.trim().slice(0,40),ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}});
   })()`);
   checks.forEach(check=>assert.ok(check.ratio>=4.5,`${theme} ${mode} ${label}: contrast ${JSON.stringify(check)}`));contrast.push({theme,mode,label,checks});
   await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-'+label.toLowerCase().replace(/[^a-z]+/g,'-')+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  }
  await visit('Transactions',width<900);await click('New transaction');await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-entry.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await click('Cancel');
 }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'visual-checks.json'),JSON.stringify({results,contrast,console:errors},null,2));console.log(JSON.stringify({result:'PASS',screens:results.length,viewports:3,themes:2,errors,out}));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});






