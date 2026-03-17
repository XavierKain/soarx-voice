package com.soarxvoice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class ForegroundServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val muteToggleReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioForegroundService.ACTION_TOGGLE_MUTE) {
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
        val filter = IntentFilter(AudioForegroundService.ACTION_TOGGLE_MUTE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(muteToggleReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(muteToggleReceiver, filter)
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try { reactApplicationContext.unregisterReceiver(muteToggleReceiver) } catch (_: Exception) {}
    }

    @ReactMethod
    fun startService(channelName: String) {
        val intent = Intent(reactApplicationContext, AudioForegroundService::class.java).apply {
            putExtra(AudioForegroundService.EXTRA_CHANNEL_NAME, channelName)
            putExtra(AudioForegroundService.EXTRA_IS_MUTED, false)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactApplicationContext, AudioForegroundService::class.java)
        reactApplicationContext.stopService(intent)
    }

    @ReactMethod
    fun updateMuteStatus(isMuted: Boolean, channelName: String) {
        val intent = Intent(reactApplicationContext, AudioForegroundService::class.java).apply {
            putExtra(AudioForegroundService.EXTRA_CHANNEL_NAME, channelName)
            putExtra(AudioForegroundService.EXTRA_IS_MUTED, isMuted)
        }
        reactApplicationContext.startService(intent)
    }
}
