# Changelog

## v2.0
- Voice announcements now work on Android (new native TTS module, routed through the call audio path like iOS)
- Fixed accented pilot names ("Frédéric", "Loïc") arriving garbled to other pilots
- Fixed mute/unmute audio feedback being silent on Android
- Video pause now really releases the microphone on iOS — the audio session module was never compiled into the app
- Failed connections now report an error instead of hanging on an empty channel
- A pilot leaving is announced even if their name had not arrived yet
- Lower battery use: the pilot list no longer re-renders 4x per second
- Light theme fixes on the home screen
- Android: release builds are signed, minified and shippable as an App Bundle
- Android: notification permission requested on Android 13+ so the in-flight status is visible

## v1.6.1
- Settings UI polish, TTS toggle, pilot name fix

## v1.6
- Voice announcements for pilot join/leave, settings toggle, UI improvements

## v1.5.2
- TTS voice announcements for pilot join/leave

## v1.5.1
- Haptic feedback, AirPods indicator, auto video pause

## v1.5
- Audio feedback on mute/unmute: voice ("Mute"/"Unmute") or beeps (configurable in Settings)
- Differentiated vibration patterns: single for mute, double for unmute
- Video pause button: releases mic so Camera can record video, auto-resumes on return
- New Settings screen with mute feedback toggle, Bluetooth button config, debug logs
- Fixed phantom mute sounds on speaker toggle and channel leave
- Auto-disconnect on inactivity (5 min alone, 1h silence)

## v1.4
- Auto-disconnect when alone in channel for 5 min (saves Agora minutes)
- Auto-disconnect after 1 hour of silence with audio warning
- Warning banner with countdown and "Stay Connected" button
- BLE mute/unmute resets inactivity timers (safe for in-flight use)
- Keyboard dismiss on tap outside text fields
- Speaker label fix
- Branded splash screen (SOARX VOICE)
- Pilot name display via Agora Data Stream

## v1.0
- Initial release: voice channels, BLE mute button, dark/light theme
