package com.anva.folio;
import android.content.Intent;
import android.net.Uri;
import android.content.ActivityNotFoundException;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="FolioExternal")
public class FolioExternalPlugin extends Plugin {
 @PluginMethod public void copy(PluginCall call){
  String kind=call.getString("kind","");
  if(!kind.equals("email")&&!kind.equals("app-info")){call.reject("Copy action not supported");return;}
  android.content.ClipboardManager clipboard=(android.content.ClipboardManager)getContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
  String text=kind.equals("email")?"Anvahq@gmail.com":"Folio 1.0.0\nPlatform: Android\nAndroid: "+android.os.Build.VERSION.RELEASE;
  clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Folio",text));call.resolve();
 }
 @PluginMethod public void open(PluginCall call) {
  String url=call.getString("url","");
  if(!url.equals("https://anva-studio.github.io/")&&!url.equals("https://forms.gle/W7qtQRmqxgkZkLtS9")&&!url.equals("https://buymeacoffee.com/anva")&&!url.equals("mailto:Anvahq@gmail.com")){call.reject("Destination not supported");return;}
  try{Intent intent=new Intent(url.startsWith("mailto:")?Intent.ACTION_SENDTO:Intent.ACTION_VIEW,Uri.parse(url));getActivity().startActivity(intent);call.resolve();}
  catch(ActivityNotFoundException error){call.reject("No application available. Copy the address instead.");}
  catch(Exception error){call.reject("Could not open external application.");}
 }
}
