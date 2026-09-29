package com.hrhub.hr_hub_mobile

import android.app.AppOpsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

/**
 * Apps that request ACCESS_MOCK_LOCATION, and the one currently granted the
 * mock-location app-op (the app picked in Developer options → "Select mock location app").
 */
object MockLocationScanner {
    fun scan(context: Context): Map<String, Any?> {
        val pm = context.packageManager
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val packages: List<PackageInfo> = if (Build.VERSION.SDK_INT >= 33) {
            pm.getInstalledPackages(
                PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()),
            )
        } else {
            @Suppress("DEPRECATION")
            pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)
        }

        val mockApps = mutableListOf<String>()
        var activeMockApp: String? = null
        for (info in packages) {
            if (info.packageName == context.packageName) continue
            val requested = info.requestedPermissions ?: continue
            if (!requested.contains("android.permission.ACCESS_MOCK_LOCATION")) continue
            val appInfo = info.applicationInfo ?: continue
            val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
            if (!isSystem) mockApps.add(info.packageName)
            val mode = try {
                if (Build.VERSION.SDK_INT >= 29) {
                    appOps.unsafeCheckOpNoThrow(
                        AppOpsManager.OPSTR_MOCK_LOCATION, appInfo.uid, info.packageName,
                    )
                } else {
                    @Suppress("DEPRECATION")
                    appOps.checkOpNoThrow(
                        AppOpsManager.OPSTR_MOCK_LOCATION, appInfo.uid, info.packageName,
                    )
                }
            } catch (e: Exception) {
                AppOpsManager.MODE_ERRORED
            }
            if (mode == AppOpsManager.MODE_ALLOWED) activeMockApp = info.packageName
        }

        val resolver = context.contentResolver
        val developerOptions = Settings.Global.getInt(
            resolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0,
        ) == 1
        @Suppress("DEPRECATION")
        val legacyMockSetting = Settings.Secure.getString(
            resolver, Settings.Secure.ALLOW_MOCK_LOCATION,
        ) == "1"

        return mapOf(
            "mockApps" to mockApps,
            "activeMockApp" to activeMockApp,
            "developerOptions" to developerOptions,
            "legacyMockSetting" to legacyMockSetting,
        )
    }
}
