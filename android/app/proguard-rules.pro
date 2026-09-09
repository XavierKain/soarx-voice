# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# --- SoarX Voice keep rules (staged for when minification is enabled) ---

# Agora RTC SDK relies on JNI + reflection
-keep class io.agora.**{ *; }
-dontwarn io.agora.**

# Our React Native bridge modules are resolved by name from JS
-keep class com.soarxvoice.** { *; }

# React Native / Hermes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep,includedescriptorclasses class com.facebook.jni.** { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
