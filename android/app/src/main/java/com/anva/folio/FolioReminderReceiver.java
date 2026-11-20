package com.anva.folio;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class FolioReminderReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context,Intent intent){
    try{String action=intent.getAction();if(ReminderEngine.STOP.equals(action))ReminderEngine.disable(context);else if(ReminderEngine.FIRE.equals(action))ReminderEngine.deliver(context,intent.getIntExtra("kind",0),intent.getLongExtra("at",0));else if(Intent.ACTION_BOOT_COMPLETED.equals(action)||Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action)||Intent.ACTION_MY_PACKAGE_REPLACED.equals(action))ReminderEngine.reschedule(context);}catch(RuntimeException ignored){/* No vault access, service loop or repeated catch-up alert on an unavailable OS service. */}
  }
}
