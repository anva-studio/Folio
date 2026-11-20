package com.anva.folio;
import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="FolioAppearance")
public class FolioAppearancePlugin extends Plugin {
 @PluginMethod public void captureProtection(PluginCall call){
  Boolean enabled=call.getBoolean("enabled");
  if(enabled!=null)getContext().getSharedPreferences("folio-privacy",0).edit().putBoolean("capture",enabled).apply();
  getActivity().runOnUiThread(()->{
   ((MainActivity)getActivity()).applyCapturePreference();
   com.getcapacitor.JSObject result=new com.getcapacitor.JSObject();
   result.put("enabled",getContext().getSharedPreferences("folio-privacy",0).getBoolean("capture",false));
   call.resolve(result);
  });
 }
 @PluginMethod public void apply(PluginCall call){
  String theme=call.getString("theme","");
  if(!theme.equals("light")&&!theme.equals("dark")){call.reject("Appearance not supported");return;}
  getActivity().runOnUiThread(()->{
   boolean light=theme.equals("light");Window window=getActivity().getWindow();int surface=Color.parseColor(light?"#FFFEFA":"#151E2B");
   window.getDecorView().setBackgroundColor(surface);
   window.setStatusBarColor(surface);window.setNavigationBarColor(surface);
   if(Build.VERSION.SDK_INT>=29)window.setNavigationBarContrastEnforced(false);
   WindowInsetsControllerCompat insets=new WindowInsetsControllerCompat(window,window.getDecorView());
   insets.setAppearanceLightStatusBars(light);insets.setAppearanceLightNavigationBars(light);
   call.resolve();
  });
 }
}
