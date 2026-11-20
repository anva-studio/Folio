package com.anva.folio;
import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name="FolioReminders",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public final class FolioRemindersPlugin extends Plugin {
  private JSObject state(){SharedPreferences p=ReminderEngine.prefs(getContext());JSObject value=new JSObject();value.put("commitments",p.getBoolean("commitments",false));value.put("backups",p.getBoolean("backups",false));value.put("weekday",p.getInt("weekday",0));value.put("hour",p.getInt("hour",18));value.put("minute",p.getInt("minute",0));value.put("notificationsAllowed",ReminderEngine.notificationsAllowed(getContext()));return value;}
  @PluginMethod public void read(PluginCall call){call.resolve(state());}
  private int integer(PluginCall call,String key,int maximum){Object value=call.getData().opt(key);if(!(value instanceof Number)||((Number)value).doubleValue()!=((Number)value).intValue())throw new IllegalArgumentException("Choose a valid reminder time");int n=((Number)value).intValue();if(n<0||n>maximum)throw new IllegalArgumentException("Choose a valid reminder time");return n;}
  private boolean enabled(PluginCall call,String key){Object value=call.getData().opt(key);if(!(value instanceof Boolean))throw new IllegalArgumentException("Choose reminder preferences explicitly");return (Boolean)value;}
  @PluginMethod public void configure(PluginCall call){
    try{boolean wanted=enabled(call,"commitments")|enabled(call,"backups");integer(call,"weekday",6);integer(call,"hour",23);integer(call,"minute",59);
      if(wanted&&Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"permissionResult");return;}apply(call);
    }catch(RuntimeException error){call.reject(error.getMessage());}
  }
  @PermissionCallback private void permissionResult(PluginCall call){if(getPermissionState("notifications")==PermissionState.GRANTED)apply(call);else call.reject("Notifications were not allowed. Reminder preferences were not enabled.");}
  private void apply(PluginCall call){try{boolean commitments=enabled(call,"commitments"),backups=enabled(call,"backups");if((commitments||backups)&&!ReminderEngine.notificationsAllowed(getContext())){call.reject("Android is blocking notifications. Allow them in Android notification settings or keep reminders off.");return;}ReminderEngine.configure(getContext(),commitments,backups,integer(call,"weekday",6),integer(call,"hour",23),integer(call,"minute",59));call.resolve(state());}catch(RuntimeException error){call.reject("Reminder settings could not be completed. Check their current state. "+error.getMessage());}}
  @PluginMethod public void openSettings(PluginCall call){try{Intent intent=Build.VERSION.SDK_INT>=26?new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName()):new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.fromParts("package",getContext().getPackageName(),null));getActivity().startActivity(intent);call.resolve();}catch(RuntimeException error){call.reject("Android notification settings could not open");}}
}
