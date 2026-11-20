package com.anva.folio;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
 private android.widget.TextView privacyCover;
 @Override public void onCreate(android.os.Bundle state){
  registerPlugin(FolioExternalPlugin.class);registerPlugin(FolioAppearancePlugin.class);registerPlugin(FolioRemindersPlugin.class);
  super.onCreate(state);
  if(android.os.Build.VERSION.SDK_INT>=33)setRecentsScreenshotEnabled(false);
  applyCapturePreference();
  try{ReminderEngine.reschedule(this);}catch(RuntimeException ignored){/* Reminders must not prevent opening. */}
 }
 private void showPrivacyCover(){
  if(privacyCover==null){
   privacyCover=new android.widget.TextView(this);
   privacyCover.setTag("folio-privacy-cover");
   privacyCover.setText("Folio · Private");
   privacyCover.setGravity(android.view.Gravity.CENTER);
   privacyCover.setTextColor(android.graphics.Color.WHITE);
   privacyCover.setBackgroundColor(android.graphics.Color.rgb(21,30,43));
   privacyCover.setImportantForAccessibility(android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO);
   addContentView(privacyCover,new android.view.ViewGroup.LayoutParams(-1,-1));
  }
  privacyCover.setVisibility(android.view.View.VISIBLE);
  privacyCover.bringToFront();
 }
 @Override public void onWindowFocusChanged(boolean focused){
  super.onWindowFocusChanged(focused);
  if(!focused)showPrivacyCover();
  else if(privacyCover!=null)privacyCover.setVisibility(android.view.View.GONE);
 }
 @Override public void onPause(){showPrivacyCover();super.onPause();}
 public void applyCapturePreference(){
  boolean protect=getSharedPreferences("folio-privacy",MODE_PRIVATE).getBoolean("capture",false);
  if(protect)getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
  else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
 }
}
