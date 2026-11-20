package com.anva.folio;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Calendar;
import java.util.Locale;

/** Device-wide review prompts only. No profile IDs, amounts, names or vault access. */
final class ReminderEngine {
  static final String PREFS="folio_review_reminders", CHANNEL="folio_private_review", FIRE="com.anva.folio.REVIEW_REMINDER", STOP="com.anva.folio.STOP_REVIEW_REMINDERS";
  static final int COMMITMENTS=1, BACKUPS=2;
  static SharedPreferences prefs(Context context){return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
  static String key(int kind){return kind==COMMITMENTS?"commitments":"backups";}
  static boolean validKind(int kind){return kind==COMMITMENTS||kind==BACKUPS;}
  static long nextTime(long now,int weekday,int hour,int minute){
    if(weekday<0||weekday>6||hour<0||hour>23||minute<0||minute>59)throw new IllegalArgumentException("Choose a valid weekly reminder time");
    Calendar time=Calendar.getInstance();time.setTimeInMillis(now);time.set(Calendar.HOUR_OF_DAY,hour);time.set(Calendar.MINUTE,minute);time.set(Calendar.SECOND,0);time.set(Calendar.MILLISECOND,0);
    int add=(weekday+1-time.get(Calendar.DAY_OF_WEEK)+7)%7;time.add(Calendar.DAY_OF_YEAR,add);if(time.getTimeInMillis()<=now)time.add(Calendar.DAY_OF_YEAR,7);return time.getTimeInMillis();
  }
  static PendingIntent alarm(Context context,int kind,long at){return PendingIntent.getBroadcast(context,kind,new Intent(context,FolioReminderReceiver.class).setAction(FIRE).putExtra("kind",kind).putExtra("at",at),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  static void channel(Context context){if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(CHANNEL,"Private Folio review reminders",NotificationManager.IMPORTANCE_DEFAULT);channel.setDescription("Optional generic prompts, without financial details");context.getSystemService(NotificationManager.class).createNotificationChannel(channel);}}
  static boolean notificationsAllowed(Context context){
    if(!NotificationManagerCompat.from(context).areNotificationsEnabled())return false;
    if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);if(channel!=null&&channel.getImportance()==NotificationManager.IMPORTANCE_NONE)return false;}return true;
  }
  static void schedule(Context context,int kind){
    SharedPreferences p=prefs(context);AlarmManager manager=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);PendingIntent intent=alarm(context,kind,0);manager.cancel(intent);
    if(!p.getBoolean(key(kind),false)){p.edit().remove("next_"+kind).apply();NotificationManagerCompat.from(context).cancel(kind);return;}
    long at=nextTime(System.currentTimeMillis(),p.getInt("weekday",0),p.getInt("hour",18),p.getInt("minute",0));
    if(!p.edit().putLong("next_"+kind,at).commit())throw new IllegalStateException("Could not save the reminder schedule");
    // Inexact one-hour window. No exact-alarm special access or persistent service.
    manager.setWindow(AlarmManager.RTC_WAKEUP,at,60L*60*1000,alarm(context,kind,at));
  }
  static void reschedule(Context context){schedule(context,COMMITMENTS);schedule(context,BACKUPS);}
  static void configure(Context context,boolean commitments,boolean backups,int weekday,int hour,int minute){
    nextTime(System.currentTimeMillis(),weekday,hour,minute);
    if(!prefs(context).edit().putBoolean("commitments",commitments).putBoolean("backups",backups).putInt("weekday",weekday).putInt("hour",hour).putInt("minute",minute).commit())throw new IllegalStateException("Could not save reminder preferences");
    try{if(commitments||backups)channel(context);reschedule(context);}catch(RuntimeException failure){disable(context);throw failure;}
  }
  static void disable(Context context){prefs(context).edit().putBoolean("commitments",false).putBoolean("backups",false).apply();for(int kind:new int[]{COMMITMENTS,BACKUPS}){((AlarmManager)context.getSystemService(Context.ALARM_SERVICE)).cancel(alarm(context,kind,0));NotificationManagerCompat.from(context).cancel(kind);}prefs(context).edit().remove("next_1").remove("next_2").apply();}
  static void deliver(Context context,int kind,long at){
    if(!validKind(kind))return;SharedPreferences p=prefs(context);
    if(!p.getBoolean(key(kind),false)||at<=0||p.getLong("next_"+kind,0)!=at||System.currentTimeMillis()<at)return;
    Calendar slot=Calendar.getInstance();slot.setTimeInMillis(at);String token=String.format(Locale.ROOT,"%04d-%02d-%02d",slot.get(Calendar.YEAR),slot.get(Calendar.MONTH)+1,slot.get(Calendar.DAY_OF_MONTH));
    if(!token.equals(p.getString("last_"+kind,""))&&notificationsAllowed(context)){
      channel(context);PendingIntent open=PendingIntent.getActivity(context,kind,new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      PendingIntent stop=PendingIntent.getBroadcast(context,20,new Intent(context,FolioReminderReceiver.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      String title=kind==COMMITMENTS?"A moment for your plans":"A moment for your backups";
      String body=kind==COMMITMENTS?"Open Folio when convenient to review your planned commitments. This is not a payment-status alert.":"Consider checking an encrypted Folio backup outside this device. Dismiss if you have already done so.";
      NotificationCompat.Builder notification=new NotificationCompat.Builder(context,CHANNEL).setSmallIcon(R.drawable.ic_folio_notification).setContentTitle(title).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).addAction(0,"Turn off reminders",stop);
      if(p.edit().putString("last_"+kind,token).commit())NotificationManagerCompat.from(context).notify(kind,notification.build());
    }
    schedule(context,kind);
  }
}
