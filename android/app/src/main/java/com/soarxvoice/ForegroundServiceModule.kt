package com.soarxvoice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.Arguments

class ForegroundServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val CHANNEL_ID = "soarx_voice_channel"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_TOGGLE_MUTE = "com.soarxvoice.TOGGLE_MUTE"
    }

    private var currentChannelName = ""
    private var currentIsMuted = false

    private val muteToggleReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_TOGGLE_MUTE) {
                val params = Arguments.createMap().apply { putString("source", "notification") }
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onHIDToggle", params)
            }
        }
    }

    override fun getName(): String = "ForegroundServiceModule"

    override fun initialize() {
        super.initialize()
        val filter = IntentFilter(ACTION_TOGGLE_MUTE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(muteToggleReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(muteToggleReceiver, filter)
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        reactApplicationContext.unregisterReceiver(muteToggleReceiver)
    }

    @ReactMethod
    fun startService(channelName: String) {
        currentChannelName = channelName
        currentIsMuted = false
        createNotificationChannel(reactApplicationContext)
        showNotification(reactApplicationContext, channelName, false)
    }

    @ReactMethod
    fun stopService() {
        val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID)
    }

    @ReactMethod
    fun updateMuteStatus(isMuted: Boolean, channelName: String) {
        currentIsMuted = isMuted
        currentChannelName = channelName
        showNotification(reactApplicationContext, channelName, isMuted)
    }

    private fun showNotification(context: Context, channelName: String, isMuted: Boolean) {
        val statusText = if (isMuted) "Micro coupé" else "Micro actif"
        val actionLabel = if (isMuted) "Réactiver micro" else "Couper micro"
        val actionIcon = if (isMuted) android.R.drawable.ic_lock_silent_mode_off else android.R.drawable.ic_lock_silent_mode

        val toggleIntent = Intent(ACTION_TOGGLE_MUTE)
        val togglePendingIntent = PendingIntent.getBroadcast(context, 0, toggleIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("SoarX Voice — $channelName")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(actionIcon, actionLabel, togglePendingIntent)
            .build()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "SoarX Voice", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Communication vocale en vol"
            }
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }
}
