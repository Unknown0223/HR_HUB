package com.hrhub.hr_hub_mobile

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    /** Route carried by a tapped inbox notification; Flutter takes it once on resume. */
    private var pendingRoute: String? = null

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        pendingRoute = intent?.getStringExtra("route")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("route")?.let { pendingRoute = it }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "hrhub/system")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "notify" -> {
                        AppNotifier.show(
                            this,
                            call.argument<Int>("id") ?: 0,
                            call.argument<String>("title") ?: "HR HUB",
                            call.argument<String>("body"),
                        )
                        result.success(true)
                    }
                    "notificationsEnabled" -> result.success(AppNotifier.enabled(this))
                    "openNotificationSettings" -> {
                        AppNotifier.openNotificationSettings(this)
                        result.success(true)
                    }
                    "openBiometricEnroll" -> {
                        AppNotifier.openBiometricEnroll(this)
                        result.success(true)
                    }
                    "takeLaunchRoute" -> {
                        result.success(pendingRoute)
                        pendingRoute = null
                    }
                    else -> result.notImplemented()
                }
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "hrhub/location_integrity")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "scan" -> try {
                        result.success(MockLocationScanner.scan(this))
                    } catch (e: Exception) {
                        result.error("scan_failed", e.message, null)
                    }
                    else -> result.notImplemented()
                }
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "hrhub/tracking")
            .setMethodCallHandler { call, result ->
                val prefs = getSharedPreferences(TrackingService.PREFS, Context.MODE_PRIVATE)
                when (call.method) {
                    "start" -> try {
                        val edit = prefs.edit()
                            .putString(TrackingService.KEY_BASE_URL, call.argument<String>("baseUrl"))
                            .putBoolean(TrackingService.KEY_ENABLED, true)
                        call.argument<String>("token")?.let { edit.putString(TrackingService.KEY_TOKEN, it) }
                        edit.apply()
                        TrackingService.start(this)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("start_failed", e.message, null)
                    }
                    "stop" -> {
                        prefs.edit()
                            .putBoolean(TrackingService.KEY_ENABLED, false)
                            .remove(TrackingService.KEY_TOKEN)
                            .apply()
                        TrackingService.stop(this)
                        result.success(true)
                    }
                    "status" -> result.success(
                        mapOf(
                            "running" to TrackingService.running,
                            "enabled" to prefs.getBoolean(TrackingService.KEY_ENABLED, false),
                            "hasToken" to !prefs.getString(TrackingService.KEY_TOKEN, null).isNullOrBlank(),
                            "state" to prefs.getString(TrackingService.KEY_STATE, null),
                            "windowReason" to prefs.getString(TrackingService.KEY_WINDOW_REASON, null),
                            "lastSentAt" to prefs.getLong(TrackingService.KEY_LAST_SENT, 0L),
                            "lastFixAt" to prefs.getLong(TrackingService.KEY_LAST_FIX, 0L),
                            "sentTotal" to prefs.getLong(TrackingService.KEY_SENT_TOTAL, 0L),
                            "model" to "${Build.MANUFACTURER} ${Build.MODEL}",
                            "batteryOptimizationIgnored" to
                                (getSystemService(Context.POWER_SERVICE) as PowerManager)
                                    .isIgnoringBatteryOptimizations(packageName),
                        ),
                    )
                    "openAutostartSettings" -> result.success(openAutostartSettings())
                    else -> result.notImplemented()
                }
            }
    }

    /** Xiaomi/Oppo/Vivo/Huawei keep their own "autostart" switch that kills background services. */
    private fun openAutostartSettings(): Boolean {
        val candidates = listOf(
            ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        )
        for (component in candidates) {
            try {
                startActivity(Intent().setComponent(component).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (_: Exception) {
            }
        }
        return false
    }
}
