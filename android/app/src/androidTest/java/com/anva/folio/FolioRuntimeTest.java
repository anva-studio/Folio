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
    private void waitFor(ActivityScenario<MainActivity> scenario,String condition) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+15_000;
        while(SystemClock.elapsedRealtime()<deadline){if("true".equals(evaluate(scenario,condition)))return;SystemClock.sleep(80);}
        fail("Timed out: "+condition+"; "+evaluate(scenario,"document.body.textContent"));
    }
    private void fill(ActivityScenario<MainActivity> scenario,String id,String value) throws Exception {
        evaluate(scenario,"{const e=document.getElementById("+org.json.JSONObject.quote(id)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+org.json.JSONObject.quote(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));} 'filled'");
    }
    private void click(ActivityScenario<MainActivity> scenario,String label) throws Exception {
        evaluate(scenario,"{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==="+org.json.JSONObject.quote(label)+"&&b.getBoundingClientRect().width&&!b.disabled);if(!b)throw Error('Button missing');b.click();} 'clicked'");
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
            fill(scenario,"profile-label",label);fill(scenario,"profile-password","qa-only");fill(scenario,"profile-password-confirm","qa-only");click(scenario,"Create profile");
            waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            click(scenario,"Accounts");click(scenario,"Add account");fill(scenario,"account-name","ANDROID_PRIVATE_ACCOUNT");fill(scenario,"account-opening-balance","1000");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            click(scenario,"Transactions");click(scenario,"New transaction");checkKeyboardLayout(scenario);fill(scenario,"transaction-amount","20");click(scenario,"New");fill(scenario,"new-category-name","Food");click(scenario,"Create");click(scenario,"Save and add another");
            waitFor(scenario,"document.getElementById('transaction-amount')?.value===''");
            fill(scenario,"transaction-amount","30");evaluate(scenario,"{const e=document.getElementById('transaction-category');e.value=e.options[1].value;e.dispatchEvent(new Event('change',{bubbles:true}));}'selected'");click(scenario,"Create");waitFor(scenario,"!document.querySelector('[role=dialog]')");
            assertEquals("true",evaluate(scenario,"!!document.querySelector('.mobile-record')&&!document.querySelector('table')"));
            assertEquals("true",evaluate(scenario,"document.documentElement.scrollWidth<=innerWidth"));
            click(scenario,"Lock");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","qa-only");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");
            assertEquals("true",evaluate(scenario,"document.body.textContent.includes('950.00')"));
            click(scenario,"Menu");click(scenario,"Settings");click(scenario,"Create encrypted backup");
            AtomicReference<java.io.File> exportRoot=new AtomicReference<>();scenario.onActivity(a->exportRoot.set(new java.io.File(a.getCacheDir(),"folio-exports")));
            long deadline=SystemClock.elapsedRealtime()+10_000;java.io.File backup;
            while((backup=findExport(exportRoot.get(),".folio",label))==null&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(80);
            assertNotNull("Backup file written through actual UI",backup);
            String text=new String(java.nio.file.Files.readAllBytes(backup.toPath()),java.nio.charset.StandardCharsets.UTF_8);
            org.json.JSONObject parsed=new org.json.JSONObject(text);assertEquals("folio-encrypted-backup",parsed.getString("format"));assertEquals(label,parsed.getJSONObject("profile").getJSONObject("index").getString("label"));assertFalse(text.contains("ANDROID_PRIVATE_ACCOUNT"));assertFalse(text.contains("qa-only"));
            closeShareChooser();
            click(scenario,"Export accounts");deadline=SystemClock.elapsedRealtime()+10_000;java.io.File csv;
            while((csv=findExport(exportRoot.get(),".csv",label))==null&&SystemClock.elapsedRealtime()<deadline)SystemClock.sleep(80);
            assertNotNull("CSV written through actual UI",csv);assertTrue(new String(java.nio.file.Files.readAllBytes(csv.toPath()),java.nio.charset.StandardCharsets.UTF_8).contains("ANDROID_PRIVATE_ACCOUNT"));
            closeShareChooser();
            evaluate(scenario,"{const dt=new DataTransfer();dt.items.add(new File(["+org.json.JSONObject.quote(text)+"],'qa.folio'));const e=document.getElementById('restore-input');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}));}'restore'");
            waitFor(scenario,"!!document.getElementById('replace-confirm')");fill(scenario,"replace-confirm",label);click(scenario,"Replace");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","qa-only");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");assertEquals("true",evaluate(scenario,"document.body.textContent.includes('950.00')"));
            // Model a suspended clock returning beyond the inactivity deadline.
            evaluate(scenario,"window.qaNow=Date.now;Date.now=()=>window.qaNow()+16*60*1000;window.dispatchEvent(new Event('focus'));'resumed'");waitFor(scenario,"!!document.getElementById('unlock-password')");evaluate(scenario,"Date.now=window.qaNow;'restored'");
            scenario.recreate();ready(scenario);click(scenario,"OPEN YOUR FOLIO");waitFor(scenario,"!!document.getElementById('unlock-password')");
            evaluate(scenario,"[...document.querySelectorAll('.profile-row-btn')].find(e=>e.textContent.includes("+org.json.JSONObject.quote(label)+")).click();'selected'");fill(scenario,"unlock-password","qa-only");click(scenario,"Unlock");waitFor(scenario,"document.querySelector('.screen-title')?.textContent==='Dashboard'");assertEquals("true",evaluate(scenario,"document.body.textContent.includes('950.00')"));
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
            evaluate(scenario,"(async()=>{await Capacitor.Plugins.FolioExternal.copy({kind:'app-info'});window.qaContact='info'})();'started'");waitFor(scenario,"window.qaContact==='info'");scenario.onActivity(a->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)a.getSystemService(android.content.Context.CLIPBOARD_SERVICE);text.set(clipboard.getPrimaryClip().getItemAt(0).getText().toString());});assertTrue(text.get().startsWith("Folio 1.0.0"));assertFalse(text.get().contains("Meera"));
        }
    }
}




