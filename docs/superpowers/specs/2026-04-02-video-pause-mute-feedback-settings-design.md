# Video Pause, Mute Feedback & Settings Screen

## Feature 1: Auto-pause mic for video recording

### Problem
When SoarX Voice holds the microphone via Agora, iOS Camera app cannot record video. Users need to be able to film while in a voice channel, especially during flight.

### Solution
Listen to Agora's `onLocalAudioStateChanged` callback. When iOS interrupts the audio session (another app takes the mic), release the mic via `enableLocalAudio(false)`. When the interruption ends, reclaim with `enableLocalAudio(true)`. Stay in the channel throughout.

### Implementation in AgoraContext.tsx

**New listener:**
```typescript
engine.addListener('onLocalAudioStateChanged', (connection, state, reason) => {
  if (reason === 8) { // Interrupted
    engine.enableLocalAudio(false);
    // Suspend inactivity timer
  }
  if (reason === 0 && state === 1) { // Ok + Recording
    engine.enableLocalAudio(true);
    // Resume inactivity timer
  }
});
```

**Backup:** AppState listener — when app returns to `active` and audio was interrupted, call `enableLocalAudio(true)` as safety net.

**Inactivity guard:** Suspend timers during audio interruption (don't auto-disconnect while filming).

### What users experience
1. In voice channel (background or foreground)
2. Open Camera > Video — mic is released automatically
3. Film video normally
4. Close Camera / return to SoarX Voice — mic reclaimed automatically
5. Never left the channel, other pilots see nothing

---

## Feature 2: Mute/unmute audio feedback

### Problem
In flight, pilots can't see their phone screen. When pressing the BLE button to mute/unmute, they have no way to know the current state.

### Solution
Play audio feedback through the earpiece/speaker when mute state changes, plus differentiated vibration patterns.

### Two modes (user preference)

| Mode | Mute | Unmute |
|------|------|--------|
| **Voice** (default) | "Mute" voice clip | "Unmute" voice clip |
| **Beeps** | 1 short beep | 2 short beeps |

### Vibration (always active)

| Action | Pattern |
|--------|---------|
| Mute | 1 vibration (50ms) |
| Unmute | 2 vibrations (50ms, 100ms pause, 50ms) |

### Audio files
- `assets/sounds/voice-mute.mp3` — voice saying "Mute"
- `assets/sounds/voice-unmute.mp3` — voice saying "Unmute"
- `assets/sounds/beep-single.mp3` — single short beep
- `assets/sounds/beep-double.mp3` — double short beep

Generated with macOS `say` command (Samantha en_US voice) for voice clips.

### Implementation in useMute.ts
- Read preference from AsyncStorage (`@soarx_mute_feedback`)
- On toggle: play appropriate sound via react-native-sound + vibrate with correct pattern
- Default mode: `'voice'`

### Persistence
- Key: `@soarx_mute_feedback`
- Values: `'voice' | 'beeps'`
- Default: `'voice'`

---

## Feature 3: Settings screen

### Problem
No settings screen exists. BLE setup is a standalone screen. Need a place for mute feedback preference and future settings.

### Navigation change
- Current: `home | voice | bleSetup`
- New: `home | voice | settings`
- HomeScreen: "Mute Button Setup" link becomes "Settings" (gear icon)
- BLE setup content moves into Settings screen as a section

### Settings screen sections

1. **Mute Feedback**
   - Segmented control or toggle: "Voice" / "Beeps"
   - Preview: tap to hear the selected feedback

2. **Bluetooth Button**
   - Existing BLESetupScreen content (scan, connect, device info, change, forget)
   - Moved into a section within Settings

3. **About**
   - App version display

### Files affected
- `App.tsx` — change screen state machine
- `src/screens/HomeScreen.tsx` — change button text/action
- `src/screens/SettingsScreen.tsx` — NEW, contains all settings
- `src/screens/BLESetupScreen.tsx` — content extracted into SettingsScreen, file can be deleted or kept as component
