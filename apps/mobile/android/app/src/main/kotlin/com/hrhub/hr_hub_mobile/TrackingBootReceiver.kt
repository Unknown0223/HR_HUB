package com.hrhub.hr_hub_mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts background GPS after a reboot or an app update if the user is still signed in. */
class TrackingBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                val prefs = context.getSharedPreferences(TrackingService.PREFS, Context.MODE_PRIVATE)
                if (prefs.getBoolean(TrackingService.KEY_ENABLED, false) &&
                    !prefs.getString(TrackingService.KEY_TOKEN, null).isNullOrBlank()
                ) {
                    try {
                        TrackingService.start(context)
                    } catch (_: Exception) {
                    }
                }
            }
        }
    }
}
