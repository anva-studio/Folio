package com.anva.folio;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import android.os.SystemClock;

@RunWith(AndroidJUnit4.class)
public class FolioRuntimeTest {
    @Test public void periodReportExportsKeepScopeAndExampleIdentity() throws Exception {
        android.content.Context context=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);click(scenario,"EXPLORE EXAMPLE PROFILE");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");click(scenario,"Menu");click(scenario,"Reports");waitFor(scenario,"!!document.querySelector('.period-analysis')");
            evaluate(scenario,"document.querySelector('.period-analysis').open=true;'opened'");click(scenario,"Compare recorded periods");waitFor(scenario,"!!document.querySelector('.report-export')");evaluate(scenario,"document.querySelector('.report-export').open=true;'opened'");
            click(scenario,"Save printable report");long until=SystemClock.elapsedRealtime()+10000;java.io.File report=null;while(report==null&&SystemClock.elapsedRealtime()<until){report=findExport(context.getCacheDir(),".html","folio-period-");if(report==null)SystemClock.sleep(80);}assertNotNull("Printable report file was created",report);String html=new String(java.nio.file.Files.readAllBytes(report.toPath()),java.nio.charset.StandardCharsets.UTF_8);assertTrue(html.contains("EXAMPLE — fictional data"));assertTrue(html.contains("period-analysis/1"));assertTrue(html.contains("Currency</dt><dd>INR"));assertTrue(html.contains("Surplus is not verified savings"));assertFalse(html.contains("<script"));closeShareChooser();
            click(scenario,"Save report CSV");until=SystemClock.elapsedRealtime()+10000;java.io.File csv=null;while(csv==null&&SystemClock.elapsedRealtime()<until){csv=findExport(context.getCacheDir(),".csv","folio-period-");if(csv==null)SystemClock.sleep(80);}assertNotNull("Report CSV was created",csv);String text=new String(java.nio.file.Files.readAllBytes(csv.toPath()),java.nio.charset.StandardCharsets.UTF_8);assertTrue(text.contains("EXAMPLE — fictional data"));assertTrue(text.contains("Currency,INR"));assertTrue(text.contains("Review status"));closeShareChooser();
            evaluate(scenario,"document.querySelector('.report-export').scrollIntoView({block:'start',behavior:'instant'});'positioned'");savePolishScreen(scenario,"folio-native-report-export.png");
        }
    }
    private boolean clickPermissionNode(android.view.accessibility.AccessibilityNodeInfo node,String suffix){
        if(node==null)return false;String id=node.getViewIdResourceName();if(id!=null&&id.endsWith(suffix)&&node.isClickable())return node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK);
        for(int i=0;i<node.getChildCount();i++)if(clickPermissionNode(node.getChild(i),suffix))return true;return false;
    }
    private void permissionChoice(String suffix) throws Exception {
        android.app.Instrumentation instrumentation=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation();long until=SystemClock.elapsedRealtime()+10000;
        android.app.UiAutomation automation=instrumentation.getUiAutomation();
        android.accessibilityservice.AccessibilityServiceInfo info=automation.getServiceInfo();
        info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        automation.setServiceInfo(info);
        while(SystemClock.elapsedRealtime()<until){if(clickPermissionNode(automation.getRootInActiveWindow(),suffix))return;SystemClock.sleep(100);}
        android.graphics.Bitmap failureImage=automation.takeScreenshot();
        if(failureImage!=null){try(java.io.FileOutputStream output=new java.io.FileOutputStream(new java.io.File(instrumentation.getTargetContext().getFilesDir(),"folio-permission-failure.png"))){failureImage.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);}failureImage.recycle();}
        fail("Android permission choice did not appear: "+suffix+"; root="+automation.getRootInActiveWindow());
    }
    @Test public void reminderPermissionsAreExplicitAndCanBeDeniedOrCancelled() throws Exception {
        android.app.Instrumentation instrumentation=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation();android.content.Context context=instrumentation.getTargetContext();ReminderEngine.disable(context);
        if(android.os.Build.VERSION.SDK_INT>=33)assertEquals(android.content.pm.PackageManager.PERMISSION_DENIED,context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS));
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);click(scenario,"OPEN YOUR FOLIO");if(!"true".equals(evaluate(scenario,"!!document.getElementById('profile-label')")))click(scenario,"Create another profile");fill(scenario,"profile-label","Reminder QA "+SystemClock.elapsedRealtime());fill(scenario,"profile-password","native qa passphrase");fill(scenario,"profile-password-confirm","native qa passphrase");click(scenario,"Create profile");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");click(scenario,"Menu");click(scenario,"Settings");waitFor(scenario,"!!document.getElementById('reminder-time')&&!document.getElementById('reminder-time').closest('fieldset').disabled");assertFalse(ReminderEngine.prefs(context).getBoolean("commitments",false));
            evaluate(scenario,"[...document.querySelectorAll('label')].find(e=>e.textContent==='Planned commitments').querySelector('input').click();'selected'");click(scenario,"Save reminder preferences");
            if(android.os.Build.VERSION.SDK_INT>=33){permissionChoice("permission_deny_button");waitFor(scenario,"document.body.textContent.includes('Notifications were not allowed')");assertFalse(ReminderEngine.prefs(context).getBoolean("commitments",false));
                waitFor(scenario,"!document.getElementById('reminder-time').closest('fieldset').disabled");
                assertEquals("true",evaluate(scenario,"{const input=document.querySelector('.reminder-options input');input.click();input.checked}"));
                click(scenario,"Save reminder preferences");permissionChoice("permission_allow_button");}
            waitFor(scenario,"document.body.textContent.includes('Weekly review reminders scheduled on this device.')");assertTrue(ReminderEngine.prefs(context).getBoolean("commitments",false));evaluate(scenario,"document.getElementById('reminder-time').closest('section').scrollIntoView({block:'start',behavior:'instant'});'positioned'");assertEquals("true",evaluate(scenario,"(()=>{const rows=[...document.querySelectorAll('.reminder-options label')].map(e=>e.getBoundingClientRect());return rows.length===2&&rows[0].height>=48&&rows[1].height>=48&&rows[1].top-rows[0].bottom>=10})()"));savePolishScreen(scenario,"folio-native-reminder-settings.png");click(scenario,"Dark");savePolishScreen(scenario,"folio-native-reminder-settings-dark.png");click(scenario,"Turn off all reminders");waitFor(scenario,"document.body.textContent.includes('Local reminders are off.')");assertFalse(ReminderEngine.prefs(context).getBoolean("commitments",false));
        }finally{ReminderEngine.disable(context);}
    }
    private void chooseValue(ActivityScenario<MainActivity> scenario,String id,String value) throws Exception {
        waitFor(scenario,"!!document.getElementById("+org.json.JSONObject.quote(id)+")");
        evaluate(scenario,"{const e=document.getElementById("+org.json.JSONObject.quote(id)+");e.value="+org.json.JSONObject.quote(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));}'selected'");
        SystemClock.sleep(80);
    }
    private void chooseText(ActivityScenario<MainActivity> scenario,String id,String text) throws Exception {
        waitFor(scenario,"[...document.getElementById("+org.json.JSONObject.quote(id)+").options].some(o=>o.textContent.trim().startsWith("+org.json.JSONObject.quote(text)+"))");
        evaluate(scenario,"{const e=document.getElementById("+org.json.JSONObject.quote(id)+");e.value=[...e.options].find(o=>o.textContent.trim().startsWith("+org.json.JSONObject.quote(text)+")).value;e.dispatchEvent(new Event('change',{bubbles:true}));}'selected'");
        SystemClock.sleep(80);
    }
    @Test public void currencyDebtAndAllocationJourneyPersists() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);click(scenario,"OPEN YOUR FOLIO");
            if(!"true".equals(evaluate(scenario,"!!document.getElementById('profile-label')")))click(scenario,"Create another profile");
            String label="Accounting QA "+SystemClock.elapsedRealtime();
            fill(scenario,"profile-label",label);fill(scenario,"profile-password","native qa passphrase");fill(scenario,"profile-password-confirm","native qa passphrase");chooseValue(scenario,"profile-currency","JPY");click(scenario,"Create profile");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            click(scenario,"Accounts");click(scenario,"Add account");fill(scenario,"account-name","QA Bank");fill(scenario,"account-opening-balance","10000");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Add account");fill(scenario,"account-name","QA Liability");chooseValue(scenario,"account-type","credit");fill(scenario,"account-opening-balance","-1000");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Records");click(scenario,"New transaction");fill(scenario,"transaction-amount","100");click(scenario,"New");fill(scenario,"new-category-name","QA Living");click(scenario,"Create");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Menu");click(scenario,"Debt");click(scenario,"Add debt");fill(scenario,"debt-name","QA Loan");fill(scenario,"debt-balance","1000");fill(scenario,"debt-rate","0");fill(scenario,"debt-payment","100");click(scenario,"Save");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Payments & account");chooseText(scenario,"debt-liability-link","QA Liability");click(scenario,"Confirm account link");chooseText(scenario,"payment-account","QA Bank");fill(scenario,"payment-principal","500");fill(scenario,"payment-interest","10");chooseText(scenario,"interest-category","QA Living");click(scenario,"Record payment group");waitFor(scenario,"document.body.textContent.includes('Payment recorded as a single group.')");click(scenario,"Close");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Menu");click(scenario,"Goals");click(scenario,"Add goal");fill(scenario,"goal-name","QA Purchase");fill(scenario,"goal-targetAmount","8000");fill(scenario,"goal-monthlyContribution","500");click(scenario,"Save");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            evaluate(scenario,"{const e=document.querySelector('[id^=goal-funding-]');e.value='allocations';e.dispatchEvent(new Event('change',{bubbles:true}));}'funding'");
            evaluate(scenario,"[...document.querySelectorAll('summary')].find(e=>e.textContent==='Assign money to a purpose').click();'expanded'");chooseText(scenario,"allocation-account","QA Bank");fill(scenario,"allocation-purpose","QA purchase fund");fill(scenario,"allocation-amount","2000");chooseText(scenario,"allocation-goal","QA Purchase");click(scenario,"Save allocation");waitFor(scenario,"document.body.textContent.includes('funded in allocations')&&document.querySelector('.goal-plan progress')?.value===25");
            click(scenario,"Lock");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","native qa passphrase");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            click(scenario,"Accounts");assertEquals("true",evaluate(scenario,"document.body.textContent.includes('9,390')&&!document.body.textContent.includes('₹')"));
            click(scenario,"Menu");click(scenario,"Goals");assertEquals("true",evaluate(scenario,"document.querySelector('.goal-plan progress')?.value===25"));savePolishScreen(scenario,"folio-current-jpy-funded-goal.png");
            click(scenario,"Compare contributions");fill(scenario,"goal-compare-monthly","1000");fill(scenario,"goal-compare-additional","1000");evaluate(scenario,"document.querySelector('[role=dialog] button[type=submit]').click();'compared'");waitFor(scenario,"[...document.querySelectorAll('[role=dialog] h4')].some(e=>e.textContent==='Alternative contribution')");assertEquals("true",evaluate(scenario,"[...document.querySelectorAll('[role=dialog] h4')].find(e=>e.textContent==='Alternative contribution').parentElement.querySelectorAll('dd')[1].textContent==='5'"));click(scenario,"Close");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Menu");click(scenario,"Hide amounts");click(scenario,"Accounts");assertEquals("true",evaluate(scenario,"document.querySelector('.account-summary strong').textContent==='••••'"));click(scenario,"Menu");click(scenario,"Show amounts");assertEquals("false",evaluate(scenario,"document.querySelector('.account-summary strong').textContent==='••••'"));
            click(scenario,"Menu");click(scenario,"Settings");chooseValue(scenario,"week-start","0");click(scenario,"Scheduled");click(scenario,"Open financial timeline");waitFor(scenario,"!!document.querySelector('.month-calendar')");assertEquals("true",evaluate(scenario,"document.querySelector('.month-calendar th').textContent==='Sun'"));evaluate(scenario,"[...document.querySelectorAll('.month-calendar button[data-date]')].find(e=>e.getAttribute('aria-label').includes('3 recorded transactions')).click();'filtered'");waitFor(scenario,"[...document.querySelectorAll('button')].filter(e=>e.textContent==='View recorded transaction').length===3");savePolishScreen(scenario,"folio-current-jpy-calendar.png");
            click(scenario,"Menu");click(scenario,"Debt");click(scenario,"Compare payoff");fill(scenario,"compare-debt-monthly","200");fill(scenario,"compare-debt-once","100");fill(scenario,"compare-debt-rate","0");evaluate(scenario,"document.querySelector('[role=dialog] button[type=submit]').click();'compared'");waitFor(scenario,"document.querySelector('[role=dialog]').textContent.includes('Months saved: 3')");click(scenario,"Close");

        }
    }
    @Test public void recoveryCredentialPreservesNativeVault() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);click(scenario,"OPEN YOUR FOLIO");
            if(!"true".equals(evaluate(scenario,"!!document.getElementById('profile-label')")))click(scenario,"Create another profile");
            String label="Recovery QA "+SystemClock.elapsedRealtime();
            fill(scenario,"profile-label",label);fill(scenario,"profile-password","native old passphrase");fill(scenario,"profile-password-confirm","native old passphrase");click(scenario,"Create profile");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            click(scenario,"Accounts");click(scenario,"Add account");fill(scenario,"account-name","Recovery preserved bank");fill(scenario,"account-opening-balance","1234.56");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Menu");click(scenario,"Settings");click(scenario,"Set up recovery credential");fill(scenario,"recovery-auth-password","native old passphrase");click(scenario,"Prepare recovery credential");waitFor(scenario,"!!document.getElementById('recovery-secret')");
            String secret=new org.json.JSONArray("["+evaluate(scenario,"document.getElementById('recovery-secret').value")+"]").getString(0);
            evaluate(scenario,"document.querySelector('[role=dialog] input[type=checkbox]').click();'confirmed'");fill(scenario,"recovery-confirm-group",secret.substring(secret.lastIndexOf('-')+1));click(scenario,"Enable recovery and lock Folio");waitFor(scenario,"!!document.getElementById('unlock-password')");
            evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");click(scenario,"Use recovery credential");fill(scenario,"recovery-unlock-secret",secret);fill(scenario,"recovery-new-password","native new passphrase");fill(scenario,"recovery-repeat-password","native new passphrase");click(scenario,"Reset password using credential");waitFor(scenario,"document.body.textContent.includes('Password reset. Unlock with your new password.')");
            fill(scenario,"unlock-password","native old passphrase");click(scenario,"Unlock");waitFor(scenario,"!!document.querySelector('[role=alert]')");assertEquals("true",evaluate(scenario,"!!document.getElementById('unlock-password')"));
            fill(scenario,"unlock-password","native new passphrase");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");click(scenario,"Accounts");assertEquals("true",evaluate(scenario,"document.body.textContent.includes('Recovery preserved bank')&&document.body.textContent.includes('1,234.56')"));
            click(scenario,"Balance history");assertEquals("true",evaluate(scenario,"document.body.textContent.includes('No recorded movements yet.')"));click(scenario,"Close");
            click(scenario,"Lock");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","native new passphrase");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
        }
    }
    @Test public void largeProfileEntryRemainsFunctional() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);click(scenario,"OPEN YOUR FOLIO");click(scenario,"Restore from backup");
            android.util.Log.i("FolioLargeQA","Selecting the synthetic 50k backup");
            evaluate(scenario,"(async()=>{try{const response=await fetch('/performance-50000.folio',{cache:'no-store'});if(!response.ok)throw Error('Debug fixture HTTP '+response.status);const blob=await response.blob(),transfer=new DataTransfer();transfer.items.add(new File([blob],'synthetic-50000.folio',{type:'application/json'}));const input=document.getElementById('restore-verified-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));window.qaLargeImport='selected';}catch(error){window.qaLargeImport=String(error)}})();'started'");
            waitFor(scenario,"window.qaLargeImport!==undefined");assertEquals("\"selected\"",evaluate(scenario,"window.qaLargeImport"));fill(scenario,"restore-verified-secret","public-performance-password");click(scenario,"Verify backup");waitFor(scenario,"[...document.querySelectorAll('button')].some(b=>b.textContent==='Import verified profile')");click(scenario,"Import verified profile");waitFor(scenario,"[...document.querySelectorAll('.profile-row-btn')].some(e=>e.textContent.includes('Synthetic 50k performance'))");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes('Synthetic 50k performance')).click();window.qaLargeUnlockStart=performance.now();'selected'");fill(scenario,"unlock-password","public-performance-password");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");evaluate(scenario,"window.qaLargeUnlockMs=performance.now()-window.qaLargeUnlockStart;'timed'");
            android.util.Log.i("FolioLargeQA","Synthetic 50k profile unlocked; opening entry");
            click(scenario,"Records");click(scenario,"New transaction");waitFor(scenario,"!!document.getElementById('transaction-note')");
            evaluate(scenario,"(async()=>{const input=document.getElementById('transaction-note'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set,value='Synthetic Android performance probe',samples=[];for(let i=1;i<=value.length;i++){const start=performance.now();set.call(input,value.slice(0,i));input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);window.qaLargeEntry={transactions:50000,financialFormat:2,unlockUiMs:window.qaLargeUnlockMs,characters:value.length,medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.ceil(samples.length*.95)-1],maximumMs:samples.at(-1),usedJsHeapBytes:performance.memory?.usedJSHeapSize};})().catch(error=>window.qaLargeEntryError=String(error));'sampling'");
            waitFor(scenario,"window.qaLargeEntry!==undefined||window.qaLargeEntryError!==undefined");assertEquals("false",evaluate(scenario,"!!window.qaLargeEntryError"));System.out.println("FOLIO_QA_LARGE_PROFILE "+evaluate(scenario,"JSON.stringify(window.qaLargeEntry)"));
            fill(scenario,"transaction-amount","1");chooseValue(scenario,"transaction-category","food");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");fill(scenario,"history-search","Synthetic Android performance probe");waitFor(scenario,"document.body.textContent.includes('Showing 1 of 1 matching transactions')");
            click(scenario,"Lock");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes('Synthetic 50k performance')).click();'selected'");fill(scenario,"unlock-password","public-performance-password");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");click(scenario,"Records");fill(scenario,"history-search","Synthetic Android performance probe");waitFor(scenario,"document.body.textContent.includes('Showing 1 of 1 matching transactions')");
        }
    }
    @Test public void backgroundPrivacyAndOptionalCaptureProtection() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);click(scenario,"EXPLORE EXAMPLE PROFILE");
            waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            for(int cycle=0;cycle<3;cycle++){
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.STARTED);
                scenario.onActivity(activity->{
                    android.view.View cover=activity.getWindow().getDecorView().findViewWithTag("folio-privacy-cover");
                    assertNotNull(cover);
                    assertEquals(android.view.View.VISIBLE,cover.getVisibility());
                });
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
                resumeCurtain(scenario);
                assertEquals("true",evaluate(scenario,"document.documentElement.dataset.folioConcealed==='false'"));
                assertEquals("true",evaluate(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'"));
            }
            click(scenario,"Menu");click(scenario,"Settings");
            waitFor(scenario,"[...document.querySelectorAll('label')].some(e=>e.textContent.includes('Block screenshots')&&!e.querySelector('input').disabled)");
            evaluate(scenario,"[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Block screenshots')).querySelector('input').click();'enabled'");
            SystemClock.sleep(200);
            scenario.onActivity(activity->assertTrue((activity.getWindow().getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_SECURE)!=0));
            evaluate(scenario,"[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Block screenshots')).querySelector('input').click();'disabled'");
            SystemClock.sleep(200);
            scenario.onActivity(activity->assertEquals(0,activity.getWindow().getAttributes().flags & android.view.WindowManager.LayoutParams.FLAG_SECURE));
            evaluate(scenario,"(async()=>{window.qaKdf=[];for(const iterations of [310000,600000]){const ms=[];for(let n=0;n<3;n++){const start=performance.now();const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('public benchmark passphrase'),'PBKDF2',false,['deriveBits']);await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(16),iterations},key,512);ms.push(Math.round(performance.now()-start));}window.qaKdf.push({iterations,ms});}window.qaKdfDone=true;})() ; 'started'");
            waitFor(scenario,"window.qaKdfDone===true");
            android.util.Log.i("FolioKdfQA",evaluate(scenario,"JSON.stringify(window.qaKdf)"));
        }
    }

    private void waitFor(ActivityScenario<MainActivity> scenario,String condition) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+15_000;
        while(SystemClock.elapsedRealtime()<deadline){if("true".equals(evaluate(scenario,condition)))return;SystemClock.sleep(80);}
        fail("Timed out: "+condition+"; "+evaluate(scenario,"document.body.textContent"));
    }
    private void fill(ActivityScenario<MainActivity> scenario,String id,String value) throws Exception {
        resumeCurtain(scenario);
        evaluate(scenario,"{const e=document.getElementById("+org.json.JSONObject.quote(id)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+org.json.JSONObject.quote(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));} 'filled'");
    }
    private void resumeCurtain(ActivityScenario<MainActivity> scenario) throws Exception {
        evaluate(scenario,"{const b=[...document.querySelectorAll('.privacy-curtain button')].find(b=>b.textContent==='Continue'&&!b.disabled);if(b)b.click();} 'resumed'");
        SystemClock.sleep(80);
    }
    private void click(ActivityScenario<MainActivity> scenario,String label) throws Exception {
        if(!label.equals("Continue"))resumeCurtain(scenario);
        waitFor(scenario,"[...document.querySelectorAll('button')].some(b=>(b.textContent.trim()==="+org.json.JSONObject.quote(label)+"||b.getAttribute('aria-label')==="+org.json.JSONObject.quote(label)+")&&b.getBoundingClientRect().width&&!b.closest('[inert]')&&!b.disabled)");
        evaluate(scenario,"{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent.trim()==="+org.json.JSONObject.quote(label)+"||b.getAttribute('aria-label')==="+org.json.JSONObject.quote(label)+")&&b.getBoundingClientRect().width&&!b.closest('[inert]')&&!b.disabled);if(!b)throw Error('Button missing');b.click();} 'clicked'");
        SystemClock.sleep(80);
    }
    private java.io.File findExport(java.io.File root,String suffix,String needle){
        java.io.File[] files=root.listFiles();if(files==null)return null;
        for(java.io.File file:files){if(file.isDirectory()){java.io.File found=findExport(file,suffix,needle);if(found!=null)return found;}else if(file.getName().endsWith(suffix)&&file.getName().contains(needle))return file;}return null;
    }
    private void closeShareChooser() throws Exception {
        android.app.UiAutomation automation=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation();
        long deadline=SystemClock.elapsedRealtime()+10_000;boolean chooser=false;
        while(!chooser&&SystemClock.elapsedRealtime()<deadline){android.view.accessibility.AccessibilityNodeInfo root=automation.getRootInActiveWindow();String pkg=root==null?"":String.valueOf(root.getPackageName());chooser=pkg.contains("intentresolver")||pkg.equals("android");if(!chooser)SystemClock.sleep(80);}
        assertTrue("Android share chooser actually opened",chooser);
        assertTrue(automation.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK));
        deadline=SystemClock.elapsedRealtime()+10_000;boolean returned=false;
        while(!returned&&SystemClock.elapsedRealtime()<deadline){android.view.accessibility.AccessibilityNodeInfo root=automation.getRootInActiveWindow();returned=root!=null&&"com.anva.folio".equals(String.valueOf(root.getPackageName()));if(!returned)SystemClock.sleep(80);}
        assertTrue("Share chooser returned to Folio",returned);
    }
    private void checkKeyboardLayout(ActivityScenario<MainActivity> scenario) throws Exception {
        String raw=evaluate(scenario,"(()=>{const r=document.getElementById('transaction-amount').getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,width:innerWidth})})()");
        org.json.JSONObject rect=new org.json.JSONObject(new org.json.JSONArray("["+raw+"]").getString(0));
        AtomicReference<float[]> point=new AtomicReference<>();
        scenario.onActivity(a->{android.webkit.WebView w=a.getBridge().getWebView();int[] loc=new int[2];w.getLocationOnScreen(loc);float scale=w.getWidth()/(float)rect.optDouble("width");point.set(new float[]{loc[0]+(float)rect.optDouble("x")*scale,loc[1]+(float)rect.optDouble("y")*scale});});
        android.app.Instrumentation instrumentation=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation();long time=SystemClock.uptimeMillis();float[] p=point.get();
        instrumentation.sendPointerSync(android.view.MotionEvent.obtain(time,time,android.view.MotionEvent.ACTION_DOWN,p[0],p[1],0));instrumentation.sendPointerSync(android.view.MotionEvent.obtain(time,time+40,android.view.MotionEvent.ACTION_UP,p[0],p[1],0));
        AtomicReference<Boolean> visible=new AtomicReference<>(false);long deadline=SystemClock.elapsedRealtime()+10_000;
        while(!visible.get()&&SystemClock.elapsedRealtime()<deadline){scenario.onActivity(a->{androidx.core.view.WindowInsetsCompat insets=androidx.core.view.ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());visible.set(insets!=null&&insets.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime()));});SystemClock.sleep(80);}
        assertTrue("Actual Android keyboard opened",visible.get());
        // IME visibility arrives before its animation/layout settles. Compare with
        // native keyboard bounds, not merely WebView's reported viewport height.
        AtomicReference<Boolean> fits=new AtomicReference<>(false);deadline=SystemClock.elapsedRealtime()+5_000;
        while(!fits.get()&&SystemClock.elapsedRealtime()<deadline){
            double bottom=Double.parseDouble(evaluate(scenario,"document.querySelector('[role=dialog] .modal-footer').getBoundingClientRect().bottom"));
            double width=Double.parseDouble(evaluate(scenario,"innerWidth"));
            scenario.onActivity(a->{android.view.View decor=a.getWindow().getDecorView();android.webkit.WebView w=a.getBridge().getWebView();int[] loc=new int[2];w.getLocationOnScreen(loc);androidx.core.view.WindowInsetsCompat insets=androidx.core.view.ViewCompat.getRootWindowInsets(decor);int imeBottom=insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom;fits.set(loc[1]+bottom*w.getWidth()/width<=decor.getHeight()-imeBottom+2);});
            if(!fits.get())SystemClock.sleep(80);
        }
        assertTrue("Form actions are physically above the open keyboard",fits.get());
        assertEquals("true",evaluate(scenario,"(()=>{const r=document.querySelector('[role=dialog] .modal-footer').getBoundingClientRect();return r.top>=0&&r.height>0&&r.width>0})()"));
        waitFor(scenario,"(()=>{const input=document.getElementById('transaction-amount').getBoundingClientRect();const header=document.querySelector('[role=dialog] .modal-header').getBoundingClientRect();const footer=document.querySelector('[role=dialog] .modal-footer').getBoundingClientRect();return input.top>=header.bottom&&input.bottom<=footer.top})()");
        evaluate(scenario,"window.qaKeyboardPaint=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.qaKeyboardPaint=true));'painting'");waitFor(scenario,"window.qaKeyboardPaint===true");instrumentation.waitForIdleSync();SystemClock.sleep(500);
        System.out.println("FOLIO_QA_KEYBOARD "+evaluate(scenario,"JSON.stringify({footer:document.querySelector('[role=dialog] .modal-footer').getBoundingClientRect().toJSON(),innerHeight,visualHeight:visualViewport.height})"));
        android.graphics.Bitmap screenshot=instrumentation.getUiAutomation().takeScreenshot();assertNotNull(screenshot);
        AtomicReference<java.io.File> file=new AtomicReference<>();scenario.onActivity(a->file.set(new java.io.File(a.getFilesDir(),"folio-qa-keyboard.png")));
        try(java.io.FileOutputStream stream=new java.io.FileOutputStream(file.get())){assertTrue(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream));}screenshot.recycle();
        scenario.onActivity(a->{android.view.inputmethod.InputMethodManager ime=(android.view.inputmethod.InputMethodManager)a.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);ime.hideSoftInputFromWindow(a.getBridge().getWebView().getWindowToken(),0);});
    }
    @Test public void actualFinanceJourneyPersistsExportsAndRestores() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);
            click(scenario,"OPEN YOUR FOLIO");
            if(!"true".equals(evaluate(scenario,"!!document.getElementById('profile-label')")))click(scenario,"Create another profile");
            String label="Android journey "+SystemClock.elapsedRealtime();
            fill(scenario,"profile-label",label);fill(scenario,"profile-password","native qa passphrase");fill(scenario,"profile-password-confirm","native qa passphrase");click(scenario,"Create profile");
            waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            click(scenario,"Accounts");click(scenario,"Add account");fill(scenario,"account-name","ANDROID_PRIVATE_ACCOUNT");fill(scenario,"account-opening-balance","1000");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Records");click(scenario,"New transaction");checkKeyboardLayout(scenario);fill(scenario,"transaction-amount","20");click(scenario,"New");fill(scenario,"new-category-name","Food");click(scenario,"Create");click(scenario,"Save and add another");
            waitFor(scenario,"document.getElementById('transaction-amount')?.value===''");
            fill(scenario,"transaction-amount","30");evaluate(scenario,"{const e=document.getElementById('transaction-category');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));}'selected'");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            assertEquals("true",evaluate(scenario,"!!document.querySelector('.mobile-record')&&!document.querySelector('table')"));
            assertEquals("true",evaluate(scenario,"document.documentElement.scrollWidth<=innerWidth"));
            click(scenario,"Lock");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","native qa passphrase");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            assertEquals("true",evaluate(scenario,"document.body.textContent.includes('950.00')"));
            click(scenario,"Menu");click(scenario,"Settings");click(scenario,"Create encrypted backup");
            AtomicReference<java.io.File> exportRoot=new AtomicReference<>();scenario.onActivity(a->exportRoot.set(new java.io.File(a.getCacheDir(),"folio-exports")));
            long deadline=SystemClock.elapsedRealtime()+10_000;java.io.File backup;
            while((backup=findExport(exportRoot.get(),".folio",label))==null&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(80);
            assertNotNull("Backup file written through actual UI",backup);
            String text=new String(java.nio.file.Files.readAllBytes(backup.toPath()),java.nio.charset.StandardCharsets.UTF_8);
            org.json.JSONObject parsed=new org.json.JSONObject(text);assertEquals("folio-encrypted-backup",parsed.getString("format"));assertEquals(label,parsed.getJSONObject("profile").getJSONObject("index").getString("label"));assertFalse(text.contains("ANDROID_PRIVATE_ACCOUNT"));assertFalse(text.contains("native qa passphrase"));
            closeShareChooser();
            click(scenario,"Export accounts");deadline=SystemClock.elapsedRealtime()+10_000;java.io.File csv;
            while((csv=findExport(exportRoot.get(),".csv",label))==null&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(80);
            assertNotNull("CSV written through actual UI",csv);assertTrue(new String(java.nio.file.Files.readAllBytes(csv.toPath()),java.nio.charset.StandardCharsets.UTF_8).contains("ANDROID_PRIVATE_ACCOUNT"));
            closeShareChooser();
            click(scenario,"Restore from backup");
            evaluate(scenario,"{const dt=new DataTransfer();dt.items.add(new File(["+org.json.JSONObject.quote(text)+"],'qa.folio'));const e=document.getElementById('restore-verified-file');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}));}'restore'");
            fill(scenario,"restore-verified-secret","native qa passphrase");click(scenario,"Verify backup");
            waitFor(scenario,"!!document.getElementById('restore-verified-confirm')");fill(scenario,"restore-verified-confirm",label);click(scenario,"Replace verified profile");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","native qa passphrase");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");assertEquals("true",evaluate(scenario,"document.body.textContent.includes('950.00')"));
            // Model a suspended clock returning beyond the inactivity deadline.
            evaluate(scenario,"window.qaNow=Date.now;Date.now=()=>window.qaNow()+16*60*1000;window.dispatchEvent(new Event('focus'));'resumed'");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"Date.now=window.qaNow;'restored'");
            scenario.recreate();ready(scenario);click(scenario,"OPEN YOUR FOLIO");waitFor(scenario,"!!document.getElementById('unlock-password')");
            evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","native qa passphrase");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");assertEquals("true",evaluate(scenario,"document.body.textContent.includes('950.00')"));
            click(scenario,"Lock");waitFor(scenario,"!!document.getElementById('unlock-password')");
        }
    }
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView evaluation returned", done.await(5, TimeUnit.SECONDS));
        return result.get();
    }
    private void ready(ActivityScenario<MainActivity> scenario) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 10_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, "document.getElementById('root')?.textContent.includes('FOLIO') || document.getElementById('root')?.textContent.includes('Dashboard')"))) return;
            SystemClock.sleep(100);
        }
        fail("Bundled Folio UI did not load");
    }
    @Test public void nativeExportsUsePrivateCacheAndRestrictedFileProvider() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ready(scenario);
            evaluate(scenario,"(async()=>{try{await Capacitor.Plugins.Filesystem.writeFile({path:'folio-exports/native-qa.csv',data:'QA-export-bytes',directory:'CACHE',encoding:'utf8',recursive:true});window.qaExport='ok'}catch(e){window.qaExport=String(e)}})();'started'");
            long deadline = SystemClock.elapsedRealtime() + 5_000;
            while (!"\"ok\"".equals(evaluate(scenario,"window.qaExport")) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100);
            assertEquals("\"ok\"",evaluate(scenario,"window.qaExport"));
            scenario.onActivity(activity -> {
                java.io.File file = new java.io.File(activity.getCacheDir(),"folio-exports/native-qa.csv");
                assertTrue(file.isFile());
                try (java.io.FileInputStream input = new java.io.FileInputStream(file)) {
                    byte[] bytes = new byte[(int) file.length()];
                    assertEquals(bytes.length, input.read(bytes));
                    assertEquals("QA-export-bytes", new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
                } catch (java.io.IOException error) { throw new AssertionError(error); }
                android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(activity,activity.getPackageName()+".fileprovider",file);
                assertEquals("content",uri.getScheme());
                assertTrue(uri.toString().contains("folio_exports"));
                assertTrue(file.delete());
                try {
                    androidx.core.content.FileProvider.getUriForFile(activity,activity.getPackageName()+".fileprovider",new java.io.File(activity.getCacheDir(),"outside-export.csv"));
                    fail("FileProvider must not expose unrelated cache files");
                } catch (IllegalArgumentException expected) { }
            });
        }
    }
    @Test public void bundledAppHasSecureCryptoAndPersistenceAcrossRecreation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ready(scenario);
            assertEquals("true", evaluate(scenario, "isSecureContext && !!crypto.subtle && !!indexedDB"));
            assertEquals("\"https://localhost\"", evaluate(scenario, "location.origin"));
            evaluate(scenario, "localStorage.setItem('folio-runtime-qa', 'persisted')");
            evaluate(scenario, "(async()=>{try{const request=indexedDB.open('folio-runtime-qa',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');const db=await new Promise((r,j)=>{request.onsuccess=()=>r(request.result);request.onerror=()=>j(request.error)});const tx=db.transaction('records','readwrite');tx.objectStore('records').put('encrypted-test-record','vault');await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=j});db.close();window.qaWrite='ok';}catch(e){window.qaWrite=String(e)}})();'started'");
            long deadline = SystemClock.elapsedRealtime() + 5_000;
            while (!"\"ok\"".equals(evaluate(scenario,"window.qaWrite")) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100);
            assertEquals("\"ok\"", evaluate(scenario,"window.qaWrite"));
            evaluate(scenario,"(async()=>{try{const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('native-crypto-test'));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,encrypted);window.qaCrypto=new TextDecoder().decode(plain)}catch(e){window.qaCrypto=String(e)}})();'started'");
            deadline = SystemClock.elapsedRealtime() + 5_000;
            while (!"\"native-crypto-test\"".equals(evaluate(scenario,"window.qaCrypto")) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100);
            assertEquals("\"native-crypto-test\"", evaluate(scenario,"window.qaCrypto"));
            scenario.recreate();
            ready(scenario);
            assertEquals("\"persisted\"", evaluate(scenario,"localStorage.getItem('folio-runtime-qa')"));
            evaluate(scenario,"(async()=>{const request=indexedDB.open('folio-runtime-qa',1);const db=await new Promise(r=>request.onsuccess=()=>r(request.result));const tx=db.transaction('records');const get=tx.objectStore('records').get('vault');get.onsuccess=()=>{window.qaRead=get.result;db.close()};})();'started'");
            deadline = SystemClock.elapsedRealtime() + 5_000;
            while (!"\"encrypted-test-record\"".equals(evaluate(scenario,"window.qaRead")) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(100);
            assertEquals("\"encrypted-test-record\"", evaluate(scenario,"window.qaRead"));
            evaluate(scenario,"localStorage.removeItem('folio-runtime-qa');indexedDB.deleteDatabase('folio-runtime-qa');'cleaned'");
        }
    }

    @Test public void welcomeHelpAndExampleLifecycle() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);waitFor(scenario,"!!document.querySelector('.welcome-page')");
            click(scenario,"Help & FAQ");waitFor(scenario,"!!document.querySelector('input[type=search]')");
            evaluate(scenario,"{const e=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'recurring');e.dispatchEvent(new Event('input',{bubbles:true}));} 'searched'");waitFor(scenario,"document.body.textContent.includes('What is the difference between Recorded and Scheduled?')");
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);
            waitFor(scenario,"!!document.querySelector('.welcome-page')");
            evaluate(scenario,"localStorage.removeItem('folio:example-deleted');'ready'");click(scenario,"EXPLORE EXAMPLE PROFILE");waitFor(scenario,"document.body.textContent.includes('EXAMPLE · SAMPLE DATA')");
            click(scenario,"Menu");click(scenario,"Settings");waitFor(scenario,"document.body.textContent.includes('Profile identity')");
            assertEquals("false",evaluate(scenario,"[...document.querySelectorAll('button')].some(b=>b.textContent==='Create encrypted backup')"));
            click(scenario,"Reset Example Profile");click(scenario,"Reset example");waitFor(scenario,"!document.querySelector('[role=dialog]')&&document.body.textContent.includes('Meera Rao')");
            click(scenario,"Menu");click(scenario,"Settings");click(scenario,"Delete Example Profile");click(scenario,"Delete example");waitFor(scenario,"!!document.querySelector('.welcome-page')");
            scenario.recreate();ready(scenario);waitFor(scenario,"document.body.textContent.includes('RESTORE EXAMPLE PROFILE')");click(scenario,"RESTORE EXAMPLE PROFILE");waitFor(scenario,"document.body.textContent.includes('EXAMPLE · SAMPLE DATA')&&document.body.textContent.includes('Meera Rao')");
            assertEquals("false",evaluate(scenario,"document.documentElement.scrollWidth>innerWidth"));
            scenario.recreate();ready(scenario);waitFor(scenario,"!!document.querySelector('.welcome-page')");
        }
    }

    @Test public void publicContactClipboardAndAllowlist() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);
            evaluate(scenario,"(async()=>{try{await Capacitor.Plugins.FolioExternal.copy({kind:'email'});window.qaContact='copied'}catch(e){window.qaContact=String(e)}})();'started'");waitFor(scenario,"window.qaContact==='copied'");
            AtomicReference<String> text=new AtomicReference<>();scenario.onActivity(a->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)a.getSystemService(android.content.Context.CLIPBOARD_SERVICE);text.set(clipboard.getPrimaryClip().getItemAt(0).getText().toString());});assertEquals("Anvahq@gmail.com",text.get());
            evaluate(scenario,"(async()=>{try{await Capacitor.Plugins.FolioExternal.open({url:'file:///private'});window.qaContact='unexpected'}catch(e){window.qaContact=String(e)}})();'started'");waitFor(scenario,"String(window.qaContact).includes('Destination not supported')");
            evaluate(scenario,"(async()=>{await Capacitor.Plugins.FolioExternal.copy({kind:'app-info'});window.qaContact='info'})();'started'");waitFor(scenario,"window.qaContact==='info'");scenario.onActivity(a->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)a.getSystemService(android.content.Context.CLIPBOARD_SERVICE);text.set(clipboard.getPrimaryClip().getItemAt(0).getText().toString());});assertTrue(text.get().startsWith("Folio 1.1.1"));assertFalse(text.get().contains("Meera"));
        }
    }

    private void savePolishScreen(ActivityScenario<MainActivity> scenario,String name) throws Exception {
        SystemClock.sleep(500);android.app.Instrumentation instrumentation=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation();instrumentation.waitForIdleSync();android.graphics.Bitmap image=instrumentation.getUiAutomation().takeScreenshot();assertNotNull(image);AtomicReference<java.io.File> file=new AtomicReference<>();scenario.onActivity(a->file.set(new java.io.File(a.getFilesDir(),name)));try(java.io.FileOutputStream output=new java.io.FileOutputStream(file.get())){assertTrue(image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output));}image.recycle();
    }
    @Test public void mobileChromeProfileShortcutAndLargerText() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            ready(scenario);if("true".equals(evaluate(scenario,"document.body.textContent.includes('RESTORE EXAMPLE PROFILE')")))click(scenario,"RESTORE EXAMPLE PROFILE");else click(scenario,"EXPLORE EXAMPLE PROFILE");waitFor(scenario,"document.body.textContent.includes('EXAMPLE · SAMPLE DATA')");
            click(scenario,"Accounts");waitFor(scenario,"document.querySelector('.screen-title').textContent==='Accounts'");assertEquals("true",evaluate(scenario,"(()=>{const main=document.querySelector('.main').getBoundingClientRect(),nav=document.querySelector('.bottom-nav').getBoundingClientRect();return main.bottom<=nav.top+1&&nav.height>=70&&document.querySelectorAll('.bottom-nav button').length===5})()"));
            assertEquals("true",evaluate(scenario,"(()=>{const label=document.querySelector('.accounts-toolbar .checkbox-label'),box=label.querySelector('input').getBoundingClientRect(),text=label.querySelector('span').getBoundingClientRect();return text.left-box.right>=10&&label.getBoundingClientRect().height>=44&&getComputedStyle(document.querySelector('.example-indicator')).display==='none'})()"));
            evaluate(scenario,"document.querySelector('button[aria-label=\"Open profile settings\"]').click();'profile'");waitFor(scenario,"document.activeElement.id==='profile-identity-title'");click(scenario,"← Back to Accounts");waitFor(scenario,"document.querySelector('.screen-title').textContent==='Accounts'");
            click(scenario,"More");click(scenario,"Settings");click(scenario,"Dark");savePolishScreen(scenario,"folio-mobile-dark-settings.png");click(scenario,"More");click(scenario,"Accounts");savePolishScreen(scenario,"folio-mobile-dark-accounts.png");click(scenario,"More");savePolishScreen(scenario,"folio-mobile-dark-menu.png");click(scenario,"Close");
            scenario.onActivity(a->a.getBridge().getWebView().getSettings().setTextZoom(130));
            for(String label:new String[]{"Dashboard","Accounts","Transactions","Scheduled","Debt","Goals","Health checks","Planner","Reports","Settings","About & Contact","Help & FAQ"}){
                click(scenario,"More");click(scenario,label);waitFor(scenario,"document.querySelector('.screen-title').textContent==="+org.json.JSONObject.quote(label));assertEquals(label+" larger-text overflow","true",evaluate(scenario,"(()=>{const main=document.querySelector('.main');main.scrollTop=main.scrollHeight;return main.scrollWidth<=main.clientWidth&&main.scrollTop+main.clientHeight>=main.scrollHeight-2})()"));
            }
            click(scenario,"More");click(scenario,"Settings");click(scenario,"Light");SystemClock.sleep(500);AtomicReference<Boolean> lightBars=new AtomicReference<>(false);scenario.onActivity(a->lightBars.set(new androidx.core.view.WindowInsetsControllerCompat(a.getWindow(),a.getWindow().getDecorView()).isAppearanceLightStatusBars()));assertTrue("Android status bar follows light appearance",lightBars.get());
            click(scenario,"More");click(scenario,"Accounts");savePolishScreen(scenario,"folio-mobile-light-accounts-large-text.png");scenario.onActivity(a->a.getBridge().getWebView().getSettings().setTextZoom(100));
        }
    }
}





