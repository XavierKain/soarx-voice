package com.soarxvoice

import android.media.AudioAttributes
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/**
 * Android counterpart of the iOS TTSManager. Registered under the same JS name
 * ("TTSManager") so AgoraContext can call it without a platform branch.
 *
 * Routed through USAGE_VOICE_COMMUNICATION so announcements come out of the
 * same earpiece / Bluetooth headset as the Agora call instead of the speaker.
 */
class TTSModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var tts: TextToSpeech? = null
    private var ready = false
    private var pending: String? = null

    override fun getName(): String = "TTSManager"

    override fun initialize() {
        super.initialize()
        tts = TextToSpeech(reactApplicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.US
                tts?.setSpeechRate(1.1f)
                tts?.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                ready = true
                Log.i("TTS", "Engine ready")
                pending?.let { speakNow(it) }
                pending = null
            } else {
                Log.w("TTS", "Engine init failed: $status")
            }
        }
    }

    @ReactMethod
    fun speak(text: String) {
        if (!ready) {
            // Engine still warming up — remember the last announcement
            pending = text
            return
        }
        speakNow(text)
    }

    private fun speakNow(text: String) {
        val params = Bundle().apply {
            putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.8f)
        }
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, "soarx-$text")
        Log.i("TTS", "Speaking: $text")
    }

    override fun invalidate() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
        super.invalidate()
    }
}
