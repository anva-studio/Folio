import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const serial=process.env.ANDROID_SERIAL;
if(!/^emulator-\d+$/.test(serial??'')||process.env.FOLIO_RESET_SYNTHETIC_DATA!=='1')throw new Error('Use an owned disposable emulator: set ANDROID_SERIAL=emulator-PORT and FOLIO_RESET_SYNTHETIC_DATA=1. This test resets com.anva.folio synthetic app data. Physical devices are deliberately refused.');
const sdk=process.env.ANDROID_HOME??process.env.ANDROID_SDK_ROOT??path.join(process.env.LOCALAPPDATA??'','Android/Sdk');
const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
if(!fs.existsSync(adb))throw new Error('Android platform-tools were not found.');
const out=path.resolve('verification/reminders','native-'+Date.now());fs.mkdirSync(out,{recursive:true});
function command(program,args,name,cwd=process.cwd(),shell=false){const result=spawnSync(program,args,{cwd,env:process.env,shell,encoding:'utf8',maxBuffer:32*1024*1024});const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(out,name+'.log'),output);if(result.status!==0){process.stderr.write(output.slice(-5000));throw new Error(name+' failed ('+result.status+')');}return output;}
const device=(args,name)=>command(adb,['-s',serial,...args],name);
const files=[];function scan(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())scan(file);else if(item.name.endsWith('.java'))files.push(file);}}scan('android/app/src/androidTest/java');
const groups=[{className:'com.anva.folio.FolioRuntimeTest',source:'FolioRuntimeTest.java',permission:'denied'},{className:'com.anva.folio.FolioReminderTest',source:'FolioReminderTest.java',permission:'granted'}];
for(const file of files)if(/@Test\b/.test(fs.readFileSync(file,'utf8'))&&!groups.some(g=>path.basename(file)===g.source))throw new Error('Assign all instrumented tests to a permission-safe batch: '+file);
command(process.platform==='win32'?'gradlew.bat':'./gradlew',[':app:assembleDebug',':app:assembleDebugAndroidTest'],'assemble',path.resolve('android'),process.platform==='win32');
device(['install','-r',path.resolve('android/app/build/outputs/apk/debug/app-debug.apk')],'install-app');
device(['install','-r',path.resolve('android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')],'install-tests');
console.log('Resetting only the synthetic Folio test app on '+serial+'.');
device(['shell','pm','clear','com.anva.folio'],'reset-synthetic-data');
const api=Number(device(['shell','getprop','ro.build.version.sdk'],'api').trim());if(!Number.isInteger(api)||api<24)throw new Error('Unsupported test emulator API');
const results=[];
for(const group of groups){
  if(api>=33){device(['shell','pm',group.permission==='granted'?'grant':'revoke','com.anva.folio','android.permission.POST_NOTIFICATIONS'],'permission-'+group.permission);if(group.permission==='denied')device(['shell','pm','clear-permission-flags','com.anva.folio','android.permission.POST_NOTIFICATIONS','user-set','user-fixed'],'clear-prompt-flags');}
  const source=files.find(file=>path.basename(file)===group.source);if(!source)throw new Error('Missing native test source');const expected=(fs.readFileSync(source,'utf8').match(/@Test\b/g)??[]).length;
  console.log('Running '+group.className+' ('+expected+' checks; permission '+group.permission+').');
  const output=device(['shell','am','instrument','-w','-r','-e','class',group.className,'com.anva.folio.test/androidx.test.runner.AndroidJUnitRunner'],group.source);
  if(!new RegExp('OK \\('+expected+' tests?\\)').test(output)){process.stderr.write(output.slice(-6000));throw new Error('Not every assertion passed in '+group.className);}
  results.push({className:group.className,checks:expected,permission:group.permission});
}
const evidence={result:'PASS',serial,api,totalChecks:results.reduce((n,g)=>n+g.checks,0),groups:results,scope:'Owned read-only emulator, not physical-device or installed-release acceptance. Permission setup runs outside instrumentation. No tests skipped.',out};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
