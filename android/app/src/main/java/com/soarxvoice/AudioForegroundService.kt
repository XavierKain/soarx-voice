package com.soarxvoice

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class AudioForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "soarx_voice_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_TOGGLE_MUTE = "com.soarxvoice.TOGGLE_MUTE"
        const val EXTRA_CHANNEL_NAME = "channelName"
        const val EXTRA_IS_MUTED = "isMuted"
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        // Acquire partial wake lock to keep audio alive
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SoarXVoice::AudioWakeLock")
        wakeLock?.acquire(4 * 60 * 60 * 1000L) // 4 hours max
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelName = intent?.getStringExtra(EXTRA_CHANNEL_NAME) ?: "SoarX"
        val isMuted = intent?.getBooleanExtra(EXTRA_IS_MUTED, false) ?: false
        startForeground(NOTIFICATION_ID, buildNotification(channelName, isMuted))
        return START_STICKY
    }

    override fun onDestroy() {
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(channelName: String, isMuted: Boolean): Notification {
        val statusText = if (isMuted) "Mic off" else "Mic on"
        val actionLabel = if (isMuted) "Unmute" else "Mute"
        val actionIcon = if (isMuted) android.R.drawable.ic_lock_silent_mode_off
            else android.R.drawable.ic_lock_silent_mode

        val toggleIntent = Intent(ACTION_TOGGLE_MUTE)
        val togglePI = PendingIntent.getBroadcast(
            this, 0, toggleIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Tap notification opens app
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val launchPI = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SoarX Voice - $channelName")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(launchPI)
            .addAction(actionIcon, actionLabel, togglePI)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SoarX Voice",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Active voice communication"
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }
}
