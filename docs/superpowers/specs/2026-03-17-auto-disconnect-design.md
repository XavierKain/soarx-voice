# Auto-Disconnect: Inactivity Guard for Agora Minutes

## Problem

Forgotten sessions consume Agora minutes (10,000/month quota). A 3-hour idle session = 180 minutes wasted.

## Two Rules

### Rule 1: Solo (alone in channel)
- **Trigger**: `remotePilots.length === 0` for 5 minutes
- **Warning**: Non-blocking banner + vibration — "You're alone in this channel. Disconnecting in 2 minutes."
- **Grace period**: 2 minutes
- **Auto-disconnect** if no activity within grace

### Rule 2: Silence (multiple people, nobody speaks)
- **Trigger**: No audio activity (volume > 30) from anyone for 1 hour
- **Warning**: Non-blocking banner + vibration + pre-recorded audio message — "No activity detected, disconnecting in 5 minutes"
- **Grace period**: 5 minutes
- **Auto-disconnect** if no activity within grace

## What Resets Timers

- Someone speaks (volume > 30 detected via `onAudioVolumeIndication`)
- A new pilot joins the channel
- Toggle mute/unmute (screen tap OR BLE button)
- Tap "Stay Connected" on the warning banner

## Architecture: All in AgoraContext

### New refs
- `lastActivityRef` — timestamp of last audio activity
- `aloneStartRef` — timestamp since alone (null if not alone)
- `warningStartRef` — timestamp when warning was shown
- `inactivityTimerRef` — setInterval reference (check every 30s)

### New state
- `inactivityWarning: null | 'solo' | 'silence'` — exposed to VoiceScreen

### New function
- `dismissWarning()` — resets all timers and clears warning state

### Timer logic (every 30s)
1. If warning active and grace expired → `leaveChannel()` + navigate to home
2. If `remotePilots.length === 0` and alone > 5 min → set warning 'solo'
3. If `Date.now() - lastActivityRef` > 1h → set warning 'silence'

### Activity tracking
- `onAudioVolumeIndication`: if any speaker volume > 30 → update `lastActivityRef`
- `onUserJoined`: reset `aloneStartRef` to null, update `lastActivityRef`
- `toggleMute()`: update `lastActivityRef` + dismiss warning if active

## VoiceScreen Changes

Non-blocking overlay banner (not Alert.alert modal) at top of screen:
- Solo: "You're alone. Disconnecting in 2:00" with countdown + "Stay Connected" button
- Silence: "No activity. Disconnecting in 5:00" with countdown + "Stay Connected" button
- Banner does NOT block mute/unmute or any other interaction

## Audio Warning

- File: `assets/sounds/inactivity-warning.mp3`
- Content: Voice saying "No activity detected, disconnecting in 5 minutes"
- Played only for silence rule, not solo rule
- Playback via `react-native-sound` or similar

## Safety: Never Cut Active Users

The mute/unmute toggle (including BLE button) always works and always resets timers. The warning banner is purely visual overlay — no modal blocking. In-flight safety is the top priority.
