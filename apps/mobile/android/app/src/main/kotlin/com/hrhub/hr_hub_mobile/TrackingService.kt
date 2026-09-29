package com.hrhub.hr_hub_mobile

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/**
 * Streams the employee's position to the server during working hours only.
 * Runs as a location foreground service so it survives the app being closed;
 * the server decides the working window (schedule, rest days, absences).
 */
class TrackingService : Service() {

    companion object {
        const val PREFS = "hrhub_tracking"
        const val KEY_BASE_URL = "baseUrl"
        const val KEY_TOKEN = "token"
        const val KEY_ENABLED = "enabled"
        const val KEY_STATE = "state"
        const val KEY_LAST_SENT = "lastSentAt"
        const val KEY_LAST_FIX = "lastFixAt"
        const val KEY_SENT_TOTAL = "sentTotal"
        const val KEY_WINDOW_REASON = "windowReason"

        private const val CHANNEL_ID = "hrhub_tracking"
        private const val NOTIFICATION_ID = 7201
        private const val QUEUE_FILE = "tracking_queue.json"
        private const val MAX_QUEUE = 3000
        private const val FLUSH_EVERY_MS = 60_000L
        private const val FLUSH_BATCH = 5
        private const val OFFLINE_RETRY_MS = 2 * 60_000L
        private const val MAX_RECHECK_MS = 15 * 60_000L
        private const val GPS_FRESH_MS = 60_000L
        private const val MOCK_SCAN_EVERY_MS = 10 * 60_000L

        @Volatile
        var running = false
            private set

        fun start(context: Context) {
            val intent = Intent(context, TrackingService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
            else context.startService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackingService::class.java))
        }
    }

    private data class Profile(val intervalMs: Long, val minDistanceM: Float)

    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private lateinit var locationManager: LocationManager

    private val queue = ArrayList<JSONObject>()
    private var windowActive: Boolean? = null
    private var windowReason: String? = null
    private var updatesOn = false
    private var profile: Profile? = null
    private var lastGpsFixAt = 0L
    private var lastFlushAt = 0L
    /** The last upload could not reach the server, so fixes are going into the offline queue. */
    @Volatile private var uplinkDown = false
    private var lastMockScanAt = 0L
    private var activeMockApp: String? = null
    private val recent = ArrayDeque<Location>()

    private val windowCheck = Runnable { checkWindow() }

    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) = onFix(location)
        override fun onProviderEnabled(provider: String) = refreshNotification()
        override fun onProviderDisabled(provider: String) = refreshNotification()
        @Deprecated("Required on API < 29")
        override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        thread = HandlerThread("hrhub-tracking").apply { start() }
        handler = Handler(thread.looper)
        createChannel()
        loadQueue()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification("Ish vaqti tekshirilmoqda…")
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            // Missing location permission or background-start restriction: nothing we can do from here.
            prefs.edit().putString(KEY_STATE, "no_permission").apply()
            stopSelf()
            return START_NOT_STICKY
        }
        if (token() == null || !prefs.getBoolean(KEY_ENABLED, false)) {
            stopSelf()
            return START_NOT_STICKY
        }
        handler.removeCallbacks(windowCheck)
        handler.post(windowCheck)
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Some OEM builds stop the service with the task; ask the system to bring it back.
        if (prefs.getBoolean(KEY_ENABLED, false) && Build.VERSION.SDK_INT >= 26) {
            val restart = PendingIntent.getForegroundService(
                this, 1, Intent(this, TrackingService::class.java),
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE,
            )
            val alarm = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarm.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 3_000, restart)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        running = false
        stopUpdates()
        handler.removeCallbacksAndMessages(null)
        saveQueue()
        thread.quitSafely()
        io.shutdown()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- window

    private fun checkWindow() {
        io.execute {
            val res = request("GET", "/tracking/window", null)
            handler.post {
                when {
                    res == null -> {
                        // Offline: keep collecting (the server filters by schedule on upload).
                        if (windowActive == null) applyWindow(true, "offline")
                        schedule(OFFLINE_RETRY_MS)
                    }
                    res.optInt("_status") == 401 -> revokedByServer()
                    else -> {
                        applyWindow(res.optBoolean("active"), res.optString("reason"))
                        schedule(untilRecheck(res.optString("recheckAt")))
                    }
                }
            }
        }
    }

    private fun untilRecheck(iso: String): Long {
        val at = parseIso(iso) ?: return MAX_RECHECK_MS
        return (at - System.currentTimeMillis()).coerceIn(30_000L, MAX_RECHECK_MS)
    }

    private fun schedule(delayMs: Long) {
        handler.removeCallbacks(windowCheck)
        handler.postDelayed(windowCheck, delayMs)
    }

    private fun applyWindow(active: Boolean, reason: String?) {
        windowActive = active
        windowReason = reason
        prefs.edit().putString(KEY_WINDOW_REASON, reason).apply()
        if (active) startUpdates() else {
            stopUpdates()
            flush(force = true)
        }
        refreshNotification()
    }

    private fun revokedByServer() {
        prefs.edit().putBoolean(KEY_ENABLED, false).remove(KEY_TOKEN).putString(KEY_STATE, "paused").apply()
        queue.clear()
        saveQueue()
        stopSelf()
    }

    // -------------------------------------------------------------- location

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun gpsEnabled(): Boolean =
        try { locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) } catch (e: Exception) { false }

    /** Faster sampling while charging or moving; slower on low battery or when standing still. */
    private fun currentProfile(): Profile {
        val (battery, charging) = battery()
        var profile = when {
            charging -> Profile(15_000, 10f)
            battery >= 50 -> Profile(30_000, 15f)
            battery >= 20 -> Profile(60_000, 25f)
            else -> Profile(180_000, 50f)
        }
        if (isStationary()) profile = Profile((profile.intervalMs * 2).coerceAtMost(300_000), profile.minDistanceM)
        return profile
    }

    private fun isStationary(): Boolean {
        if (recent.size < 3) return false
        val last = recent.last()
        return recent.all { it.distanceTo(last) < 20f } && (last.hasSpeed().not() || last.speed < 0.6f)
    }

    private fun startUpdates() {
        if (!hasLocationPermission()) {
            prefs.edit().putString(KEY_STATE, "no_permission").apply()
            return
        }
        val next = currentProfile()
        if (updatesOn && next == profile) return
        stopUpdates()
        profile = next
        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER, next.intervalMs, next.minDistanceM, listener, thread.looper,
            )
            if (locationManager.allProviders.contains(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER, next.intervalMs, next.minDistanceM, listener, thread.looper,
                )
            }
            updatesOn = true
        } catch (e: SecurityException) {
            prefs.edit().putString(KEY_STATE, "no_permission").apply()
        }
    }

    private fun stopUpdates() {
        if (!updatesOn) return
        try { locationManager.removeUpdates(listener) } catch (_: Exception) {}
        updatesOn = false
    }

    private fun onFix(location: Location) {
        val now = System.currentTimeMillis()
        val isGps = location.provider == LocationManager.GPS_PROVIDER
        if (isGps) lastGpsFixAt = now
        else if (now - lastGpsFixAt < GPS_FRESH_MS) return

        recent.addLast(location)
        while (recent.size > 5) recent.removeFirst()

        val (battery, charging) = battery()
        val mock = if (Build.VERSION.SDK_INT >= 31) location.isMock
        else @Suppress("DEPRECATION") location.isFromMockProvider

        val point = JSONObject()
            .put("lat", location.latitude)
            .put("lng", location.longitude)
            .put("provider", location.provider ?: "unknown")
            .put("mock", mock)
            .put("offline", uplinkDown || !internetAvailable())
            .put("battery", battery)
            .put("charging", charging)
            .put("recordedAt", iso(location.time.takeIf { it > 0 } ?: now))
        if (location.hasAccuracy()) point.put("accuracy", location.accuracy.toDouble())
        if (location.hasSpeed()) point.put("speed", location.speed.toDouble())
        if (location.hasBearing()) point.put("heading", location.bearing.toDouble())
        if (location.hasAltitude()) point.put("altitude", location.altitude)

        queue.add(point)
        while (queue.size > MAX_QUEUE) queue.removeAt(0)
        prefs.edit().putLong(KEY_LAST_FIX, now).apply()

        flush(force = false)
        if (windowActive == true) startUpdates()
    }

    // ---------------------------------------------------------------- upload

    private fun flush(force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && queue.size < FLUSH_BATCH && now - lastFlushAt < FLUSH_EVERY_MS) return
        lastFlushAt = now
        val batch = ArrayList(queue.take(500))
        val (battery, charging) = battery()
        val body = JSONObject()
            .put("points", JSONArray(batch))
            .put("battery", battery)
            .put("charging", charging)
            .put("state", currentState())
            .put("permissions", JSONObject()
                .put("location", hasLocationPermission())
                .put("backgroundLocation", Build.VERSION.SDK_INT < 29 ||
                    checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED)
                .put("gps", gpsEnabled())
                .put("batteryOptimizationIgnored", batteryOptimizationIgnored()))
        io.execute {
            mockAppNow()?.let { body.put("activeMockApp", it) }
            val res = request("POST", "/tracking/pings", body)
            uplinkDown = res == null
            handler.post {
                when {
                    res == null -> saveQueue()
                    res.optInt("_status") == 401 -> revokedByServer()
                    res.optInt("_status") in 200..299 -> {
                        queue.removeAll(batch.toSet())
                        saveQueue()
                        prefs.edit()
                            .putLong(KEY_LAST_SENT, System.currentTimeMillis())
                            .putLong(KEY_SENT_TOTAL, prefs.getLong(KEY_SENT_TOTAL, 0) + res.optInt("accepted"))
                            .apply()
                        res.optJSONObject("window")?.let {
                            val active = it.optBoolean("active")
                            if (active != windowActive) applyWindow(active, it.optString("reason"))
                        }
                    }
                    // Validation error: drop the batch rather than retrying it forever.
                    res.optInt("_status") in 400..499 -> {
                        queue.removeAll(batch.toSet())
                        saveQueue()
                    }
                }
            }
        }
    }

    private fun currentState(): String = when {
        !hasLocationPermission() -> "no_permission"
        !gpsEnabled() -> "gps_off"
        windowActive == true -> "tracking"
        else -> "off_hours"
    }.also { prefs.edit().putString(KEY_STATE, it).apply() }

    private fun request(method: String, path: String, body: JSONObject?): JSONObject? {
        val base = prefs.getString(KEY_BASE_URL, null)?.trimEnd('/') ?: return null
        val token = token() ?: return null
        return try {
            val conn = URL(base + path).openConnection() as HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("X-Tracking-Token", token)
            conn.setRequestProperty("Accept", "application/json")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()
            (if (text.startsWith("{")) JSONObject(text) else JSONObject()).put("_status", status)
        } catch (e: Exception) {
            null
        }
    }

    // ------------------------------------------------------------ helpers

    private fun token(): String? = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() }

    /** A network the system has verified actually reaches the internet (not just Wi-Fi without uplink). */
    private fun internetAvailable(): Boolean = try {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        caps != null &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    } catch (e: Exception) {
        true
    }

    /** Runs on the io thread: listing installed packages is too slow for the location looper. */
    private fun mockAppNow(): String? {
        val now = System.currentTimeMillis()
        if (now - lastMockScanAt >= MOCK_SCAN_EVERY_MS) {
            lastMockScanAt = now
            activeMockApp = try {
                MockLocationScanner.scan(this)["activeMockApp"] as String?
            } catch (e: Exception) {
                null
            }
        }
        return activeMockApp
    }

    private fun battery(): Pair<Int, Boolean> {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).coerceIn(0, 100)
        val status = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        return level to charging
    }

    private fun batteryOptimizationIgnored(): Boolean {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun iso(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(ms))
    }

    private fun parseIso(iso: String): Long? = try {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        f.parse(iso)?.time
    } catch (e: Exception) {
        null
    }

    private fun loadQueue() {
        try {
            val file = File(filesDir, QUEUE_FILE)
            if (!file.exists()) return
            val arr = JSONArray(file.readText())
            for (i in 0 until arr.length()) queue.add(arr.getJSONObject(i))
        } catch (_: Exception) {}
    }

    private fun saveQueue() {
        try {
            File(filesDir, QUEUE_FILE).writeText(JSONArray(queue).toString())
        } catch (_: Exception) {}
    }

    // ------------------------------------------------------- notification

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(CHANNEL_ID, "GPS kuzatuv", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Ish vaqtida joylashuv uzatilishi"
        channel.setShowBadge(false)
        nm.createNotificationChannel(channel)
    }

    private fun refreshNotification() {
        val text = when {
            !hasLocationPermission() -> "Joylashuv ruxsati yo‘q — ilovani oching"
            !gpsEnabled() -> "GPS o‘chirilgan — yoqing"
            windowActive == true -> "Ish vaqti: joylashuv uzatilmoqda"
            windowReason == "day_off" || windowReason == "holiday" -> "Dam olish kuni — kuzatuv o‘chirilgan"
            windowReason == "absence" -> "Ta’til / ruxsat — kuzatuv o‘chirilgan"
            else -> "Ish vaqtidan tashqari — kuzatuv to‘xtatilgan"
        }
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        return builder
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("HR HUB · GPS")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .build()
    }
}
