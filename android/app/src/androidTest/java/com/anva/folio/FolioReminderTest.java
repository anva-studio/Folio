package com.anva.folio;
import static org.junit.Assert.*;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Calendar;
import java.util.TimeZone;
import java.util.Arrays;
import java.util.HashSet;

@RunWith(AndroidJUnit4.class)
public class FolioReminderTest {
  @Test public void weeklyWallClockSchedulingHasNoEarlyOrCatchUpSlot(){
    TimeZone prior=TimeZone.getDefault();try{TimeZone.setDefault(TimeZone.getTimeZone("UTC"));Calendar now=Calendar.getInstance();now.clear();now.set(2026,Calendar.NOVEMBER,1,18,0,0);long at=ReminderEngine.nextTime(now.getTimeInMillis(),0,18,0);Calendar next=Calendar.getInstance();next.setTimeInMillis(at);assertEquals(8,next.get(Calendar.DAY_OF_MONTH));assertEquals(18,next.get(Calendar.HOUR_OF_DAY));assertTrue(at>now.getTimeInMillis());
      assertThrows(IllegalArgumentException.class,()->ReminderEngine.nextTime(0,7,18,0));assertThrows(IllegalArgumentException.class,()->ReminderEngine.nextTime(0,0,24,0));
    }finally{TimeZone.setDefault(prior);}
  }
  @Test public void notificationsStayGenericDeduplicatedAndCancellable(){
    android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();NotificationManager manager=context.getSystemService(NotificationManager.class);
    try{
      ReminderEngine.disable(context);assertFalse(ReminderEngine.prefs(context).getBoolean("commitments",false));if(Build.VERSION.SDK_INT>=33)assertEquals(android.content.pm.PackageManager.PERMISSION_GRANTED,context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS));
      ReminderEngine.configure(context,true,false,0,18,0);long at=System.currentTimeMillis()-1000;ReminderEngine.prefs(context).edit().putLong("next_1",at).remove("last_1").commit();
      FolioReminderReceiver receiver=new FolioReminderReceiver();Intent fire=new Intent(context,FolioReminderReceiver.class).setAction(ReminderEngine.FIRE).putExtra("kind",1).putExtra("at",at);receiver.onReceive(context,fire);
      assertEquals(1,manager.getActiveNotifications().length);Notification notification=manager.getActiveNotifications()[0].getNotification();assertEquals("A moment for your plans",notification.extras.getString(Notification.EXTRA_TITLE));assertEquals("Open Folio when convenient to review your planned commitments. This is not a payment-status alert.",notification.extras.getString(Notification.EXTRA_TEXT));
      receiver.onReceive(context,fire);assertEquals(1,manager.getActiveNotifications().length);assertTrue(ReminderEngine.prefs(context).getLong("next_1",0)>System.currentTimeMillis());
      HashSet<String> allowed=new HashSet<>(Arrays.asList("commitments","backups","weekday","hour","minute","next_1","next_2","last_1","last_2"));assertTrue(allowed.containsAll(ReminderEngine.prefs(context).getAll().keySet()));
      receiver.onReceive(context,new Intent(context,FolioReminderReceiver.class).setAction(ReminderEngine.STOP));assertFalse(ReminderEngine.prefs(context).getBoolean("commitments",false));assertEquals(0,manager.getActiveNotifications().length);receiver.onReceive(context,fire);assertEquals(0,manager.getActiveNotifications().length);
    }finally{ReminderEngine.disable(context);}
  }
}
