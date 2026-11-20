// Application integration/visual test. All inputs are synthetic and workspace-local.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
app.disableHardwareAcceleration();
app.setPath('userData',process.env.FOLIO_QA_ROOT?path.resolve(process.env.FOLIO_QA_ROOT,'runtime-'+Date.now()):path.resolve(__dirname,'../../../work/visual-runtime-'+Date.now()));
require('../desktop/main.cjs');
const out=process.env.FOLIO_QA_ROOT?path.resolve(process.env.FOLIO_QA_ROOT,'screenshots'):path.resolve(__dirname,'../../folio-mobile-polish/screenshots');const delay=ms=>new Promise(r=>setTimeout(r,ms));let win;const errors=[];
const evaluate=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(e){throw new Error(code+" :: "+e.message+" :: "+JSON.stringify(errors));}};
async function wait(code){for(let i=0;i<200;i++){if(await evaluate(code))return;await delay(50);}throw new Error('Timed out '+code);}
async function click(label){await evaluate(`{const button=[...document.querySelectorAll('button')].find(b=>(b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)})&&b.getBoundingClientRect().width&&!b.disabled);if(!button)throw new Error('Missing '+${JSON.stringify(label)});button.click();}`);await delay(80);}
async function fill(id,value){await evaluate(`{const input=document.getElementById(${JSON.stringify(id)});if(!input)throw new Error('Missing '+${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);}
async function choose(id,value){await evaluate(`{const input=document.getElementById(${JSON.stringify(id)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));}`);}
async function visit(label,mobile){if(mobile)await click('Menu');await click(label);await wait('!document.querySelector("[role=dialog]")');await wait('document.querySelector(".screen-title")?.textContent==='+JSON.stringify(label));}
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true});while(!BrowserWindow.getAllWindows().length)await delay(20);win=BrowserWindow.getAllWindows()[0];win.setMinimumSize(0,0);win.webContents.setBackgroundThrottling(false);win.show();
 win.webContents.on('console-message',event=>{if(event.level==='error'||event.level==='warning')errors.push(event.message);});

 await wait('document.querySelector(".welcome-page")');
 for(const theme of ['dark','light'])for(const [width,height,mode] of [[1280,900,'desktop'],[390,844,'mobile'],[360,740,'narrow'],[320,690,'small'],[600,360,'landscape']]){
  win.setContentSize(width,height);await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme));await delay(200);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,'Welcome overflow');
  await fs.writeFile(path.join(out,theme+'-'+mode+'-welcome.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 win.setContentSize(1280,900);await click('OPEN YOUR FOLIO');await wait('document.getElementById("profile-label")');
 await fill('profile-label','Arjun Shah');await fill('profile-password','visual-only');await fill('profile-password-confirm','visual-only');await click('Create profile');await wait('document.querySelector(".screen-title")?.textContent==="Dashboard"');await click('Lock');await wait('document.getElementById("unlock-password")');
 for(const theme of ['dark','light'])for(const [width,height,mode] of [[1280,900,'desktop'],[390,844,'mobile'],[360,740,'narrow'],[320,690,'small'],[600,360,'landscape']]){
  win.setContentSize(width,height);await evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme));await delay(180);
  assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth'),false,'Profile selection overflow');
  await fs.writeFile(path.join(out,theme+'-'+mode+'-profile-selection.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 win.setContentSize(1280,900);await click('Explore Example Profile');await wait('document.querySelector(".example-indicator")');await wait('document.querySelector(".screen-title")?.textContent==="Dashboard"');
 const results=[];const contrast=[];
 for(const theme of ['Dark','Light']) {await visit('Settings',win.getContentSize()[0]<900);await click(theme);
 for(const [width,height,mode] of [[1280,900,'desktop'],[390,844,'mobile'],[360,740,'narrow'],[320,690,'small'],[600,360,'landscape']]){
  win.setContentSize(width,height);await delay(150);
  for(const label of ['Dashboard','Accounts','Transactions','Scheduled','Debt','Goals','Health checks','Planner','Reports','Settings','About & Contact','Help & FAQ']){
   console.log(theme,mode,label);await visit(label,width<900);if(label==='Health checks'||label==='Planner')await click('Try example figures');await evaluate('document.querySelector(\".main\").scrollTop=0;window.scrollTo(0,0)');await delay(180);
   const metrics=await evaluate('({mainOverflow:document.querySelector(\".main\").scrollWidth>document.querySelector(\".main\").clientWidth,width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector(".screen-title")?.textContent})');assert.ok(metrics.scroll<=metrics.width,`${label} overflow ${JSON.stringify(metrics)}`);assert.equal(metrics.mainOverflow,false,`${label} inner overflow`);assert.equal(metrics.width,width,'Requested viewport width');assert.equal(await evaluate('innerHeight'),height,'Requested viewport height');results.push({theme,mode,label,...metrics});
   if(width<900){const geometry=await evaluate('(()=>{const main=document.querySelector(".main").getBoundingClientRect(),nav=document.querySelector(".bottom-nav").getBoundingClientRect();return {mainBottom:main.bottom,navTop:nav.top,navHeight:nav.height,badge:getComputedStyle(document.querySelector(".example-indicator")).display}})()');assert.ok(geometry.mainBottom<=geometry.navTop+1,JSON.stringify(geometry));assert.ok(geometry.navHeight>=70);assert.equal(geometry.badge,"none");}
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
  await visit('Reports',width<900);await evaluate(`[...document.querySelectorAll('summary')].find(e=>e.textContent==='Compare periods and explore history').click()`);await wait('!!document.getElementById("period-from")');
  const previousMonth=await evaluate(`(()=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')})()`);
  await fill('period-from',previousMonth);await fill('period-to',previousMonth);await click('Compare recorded periods');await wait('!!document.querySelector(".period-analysis section[aria-label]")');await delay(160);
  assert.equal(await evaluate('document.querySelector(".main").scrollWidth>document.querySelector(".main").clientWidth'),false,'Period analysis overflow');
  assert.equal(await evaluate('document.querySelectorAll(".period-chart-row").length'),2,'Two one-month periods');
  await evaluate('document.querySelector(".period-analysis section[aria-label]").scrollIntoView({block:"start",behavior:"instant"})');await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-period-comparison.png'),(await win.webContents.capturePage()).toPNG());
  await evaluate('document.querySelector(".period-chart").scrollIntoView({block:"start",behavior:"instant"})');await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-period-chart.png'),(await win.webContents.capturePage()).toPNG());
  await visit('Scheduled',width<900);await click('Open financial timeline');await wait('!!document.querySelector(".month-calendar")');await delay(220);
  assert.equal(await evaluate('document.querySelector(".main").scrollWidth>document.querySelector(".main").clientWidth'),false,'Financial calendar overflow');
  assert.ok(await evaluate('[...document.querySelectorAll(".month-calendar button[data-date]")].every(b=>b.getBoundingClientRect().height>=48)'),'Calendar day height');
  await evaluate('document.querySelector(".month-calendar").scrollIntoView({block:"start",behavior:"instant"})');await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-financial-calendar.png'),(await win.webContents.capturePage()).toPNG());
  await visit('Goals',width<900);await click('Compare contributions');await fill('goal-compare-monthly','5000');await fill('goal-compare-additional','1000');await evaluate('document.querySelector("[role=dialog] button[type=submit]").click()');await wait(`[...document.querySelectorAll('[role=dialog] h3')].some(e=>e.textContent==='Contribution comparison')`);await delay(240);
  assert.equal(await evaluate('(()=>{const d=document.querySelector("[role=dialog]");return d.scrollWidth>d.clientWidth})()'),false,'Goal comparison dialog overflow');
  await evaluate(`[...document.querySelectorAll('[role=dialog] h3')].find(e=>e.textContent==='Contribution comparison').scrollIntoView({block:'start',behavior:'instant'})`);await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-goal-comparison.png'),(await win.webContents.capturePage()).toPNG());await click('Close');
  await visit('Debt',width<900);await click('Compare payoff');await fill('compare-debt-monthly','5000');await fill('compare-debt-once','1000');await fill('compare-debt-rate','12');await evaluate('document.querySelector("[role=dialog] button[type=submit]").click()');await wait(`[...document.querySelectorAll('[role=dialog] h3')].some(e=>e.textContent==='Payoff comparison')`);await delay(240);
  assert.equal(await evaluate('(()=>{const d=document.querySelector("[role=dialog]");return d.scrollWidth>d.clientWidth})()'),false,'Debt comparison dialog overflow');
  await evaluate(`[...document.querySelectorAll('[role=dialog] h3')].find(e=>e.textContent==='Payoff comparison').scrollIntoView({block:'start',behavior:'instant'})`);await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-debt-comparison.png'),(await win.webContents.capturePage()).toPNG());await click('Close');
  await visit('Health checks',width<900);await evaluate(`[...document.querySelectorAll('summary')].find(e=>e.textContent==='What your recorded history shows').click()`);await wait('!!document.querySelector(".history-insight-periods")');await delay(220);
  assert.equal(await evaluate('document.querySelector(".main").scrollWidth>document.querySelector(".main").clientWidth'),false,'History insights overflow');
  await evaluate('document.querySelector(".history-insights").scrollIntoView({block:"start",behavior:"instant"})');await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-history-insights.png'),(await win.webContents.capturePage()).toPNG());
  await fill('health-planning-amount','5000');await evaluate(`[...document.querySelectorAll('summary')].find(e=>e.textContent==='Data confidence and optional summary').click();[...document.querySelectorAll('.planning-health label')].find(e=>e.textContent==='Show an overall planning summary').querySelector('input').click()`);await wait(`[...document.querySelectorAll('.planning-health h3')].some(e=>e.textContent==='More information needed')`);
  assert.equal(await evaluate('document.querySelector(".main").scrollWidth>document.querySelector(".main").clientWidth'),false,'Health context overflow');
  assert.ok(await evaluate('[...document.querySelectorAll(".planning-health dd.amount")].every(e=>e.getBoundingClientRect().height<=parseFloat(getComputedStyle(e).lineHeight)+1)'),'Health amounts must stay on one line');
  await evaluate('document.querySelector(".planning-health").scrollIntoView({block:"start",behavior:"instant"})');await delay(160);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-planning-health.png'),(await win.webContents.capturePage()).toPNG());
  await visit('Planner',width<900);await evaluate(`[...document.querySelectorAll('summary')].find(e=>e.textContent==='Explore a savings split').click()`);
  for(const [id,value] of [['monthlyBudget','500'],['obligations','0'],['emergencyGap','2400'],['emergencyMonths','12'],['nearTermGap','8000'],['nearTermMonths','16']])await fill('savings-'+id,value);
  await choose('savings-purpose','accessible');await click('Compare savings splits');await wait(`[...document.querySelectorAll('h3')].some(e=>e.textContent==='Reserve first')`);await delay(220);
  assert.equal(await evaluate('document.querySelector(".main").scrollWidth>document.querySelector(".main").clientWidth'),false,'Savings split overflow');
  await evaluate(`[...document.querySelectorAll('h3')].find(e=>e.textContent==='Reserve first').scrollIntoView({block:'start',behavior:'instant'})`);await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-savings-split.png'),(await win.webContents.capturePage()).toPNG());
  const comparisonName='QA '+theme+' '+mode+' savings';const comparisonNameId=await evaluate(`[...document.querySelectorAll('label')].find(e=>e.textContent==='Comparison name').htmlFor`);await fill(comparisonNameId,comparisonName);await click('Save named comparison');await wait(`[...document.querySelectorAll('button')].some(e=>e.textContent==='Comparison saved')`);await click('Open '+comparisonName);await wait('!!document.querySelector(".saved-comparison")');
  await fill('saved-comparison-budget','600');await click('Recalculate snapshot');await click('Save comparison changes');await wait('!!document.querySelector(".saved-comparison [role=status]")');await delay(180);
  assert.equal(await evaluate('(()=>{const d=document.querySelector("[role=dialog]");return d.scrollWidth>d.clientWidth})()'),false,'Saved comparison overflow');
  await evaluate('document.querySelector(".saved-comparison .plan-summary").scrollIntoView({block:"start",behavior:"instant"})');await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-saved-comparison.png'),(await win.webContents.capturePage()).toPNG());await click('Close');await wait('!document.querySelector("[role=dialog]")');
  await visit('Accounts',width<900);await click('Balance history');await wait(`document.querySelector('[aria-label="Recorded balance history"]')`);
  await wait('getComputedStyle(document.querySelector(".modal")).opacity==="1"');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,'Balance history page overflow');
  assert.equal(await evaluate('(()=>{const d=document.querySelector("[role=dialog]");return d.scrollWidth>d.clientWidth})()'),false,'Balance history dialog overflow');
  assert.ok(await evaluate('!!document.querySelector("[role=dialog] table caption")&&!!document.querySelector("[role=dialog] .balance-history-mobile dl")'),'Balance history requires accessible table');
  await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-balance-history.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await click('Close');
  await visit('Transactions',width<900);await click('New transaction');await delay(100);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-entry.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());await click('Cancel');
  if(width<900){await click('More');await delay(200);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-navigation.png'),(await win.webContents.capturePage()).toPNG());await click('Close');await evaluate("document.querySelector('button[aria-label=\"Open profile settings\"]').click()");await wait("document.activeElement.id==='profile-identity-title'");await delay(200);await fs.writeFile(path.join(out,theme.toLowerCase()+'-'+mode+'-profile-shortcut.png'),(await win.webContents.capturePage()).toPNG());await click('← Back to Transactions');}

 }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'visual-checks.json'),JSON.stringify({results,contrast,console:errors},null,2));console.log(JSON.stringify({result:'PASS',screens:results.length,viewports:5,themes:2,errors,out}));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});






