# SoarX Voice

Push-to-talk voice channels for paraglider pilots. Built on Agora RTC, with a
Bluetooth mute button so you can talk without taking your hands off the brakes.

- **iOS** — TestFlight (bundle `com.xavier.soarxvoice`)
- **Android** — signed AAB / APK (`com.soarxvoice`, minSdk 24)

## Features

- Named voice channels, joinable with a short code (`TARIFA-01`)
- BLE button (iTag, ESP32, any FFE0/FFE1 device) toggles mute with the screen locked
- Spoken announcements when a pilot joins or leaves
- Audio + haptic feedback on mute/unmute (voice or beeps)
- Video mode: releases the mic so the Camera app can record
- Auto-disconnect when alone for 5 min, or after 1 h of silence — saves Agora minutes
- Dark and light themes

## Setup

Requires Node 22+.

```sh
npm install
cp .env.example .env      # then fill in AGORA_APP_ID
```

**iOS** (macOS only):

```sh
bundle install
bundle exec pod install --project-directory=ios
npm run ios
```

**Android**:

```sh
npm run android
```

## Checks

```sh
npm run typecheck
npm run lint
npm test
```

## Releasing

Builds run in GitHub Actions — iOS needs a macOS runner, so releases are not cut
from a developer machine.

1. Add a `## v<version>` section to `CHANGELOG.md`.
2. Run `./scripts/release.sh <version>`.

The script bumps every version location (Xcode `MARKETING_VERSION` /
`CURRENT_PROJECT_VERSION`, Gradle `versionName` / `versionCode`, `src/version.ts`,
`package.json`), runs the checks, commits and pushes a `v<version>` tag. The tag
triggers both release workflows.

You can also run either workflow manually from the Actions tab
(`workflow_dispatch`).

### Required repository secrets

| Secret | Used by | What it is |
|---|---|---|
| `AGORA_APP_ID` | both | Agora RTC App ID |
| `ASC_KEY_ID` | iOS | App Store Connect API key ID |
| `ASC_ISSUER_ID` | iOS | App Store Connect issuer UUID |
| `ASC_KEY_P8_BASE64` | iOS | `base64 -w0 AuthKey_XXXX.p8` |
| `APPLE_TEAM_ID` | iOS | Apple Developer team ID |
| `MATCH_PASSWORD` | iOS | Passphrase encrypting the shared match storage |
| `MATCH_GIT_URL` | iOS | `https://github.com/xavierkain-apps/apple-certs.git` |
| `MATCH_GIT_TOKEN` | iOS | PAT with write access to that repository |
| `ANDROID_KEYSTORE_BASE64` | Android | `base64 -w0 soarxvoice-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Android | Keystore password |
| `ANDROID_KEY_ALIAS` | Android | Key alias (`soarxvoice`) |
| `ANDROID_KEY_PASSWORD` | Android | Key password |

The canonical repository is `xavierkain-apps/soarx-voice` (public, so that
organization secrets apply on the GitHub Free plan).

Current state of the secrets on that repository:

- `APPLE_TEAM_ID` — inherited from the **organization**, already resolving
- `AGORA_APP_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and all four `ANDROID_*` — set
  at the **repository** level
- `ASC_KEY_P8_BASE64` and `MATCH_PASSWORD` — **still to be set**

Those last two are the same values already in use on `XavierKain/livexwind`.
**GitHub never exposes a secret's value once set** — not through the API, not to
the account owner — so they cannot be copied between repositories. Supply them
from the original source:

```sh
gh secret set ASC_KEY_P8_BASE64 -R xavierkain-apps/soarx-voice \
  --body "$(base64 -w0 ~/.appstoreconnect/AuthKey_73PNP8Z93X.p8)"
gh secret set MATCH_PASSWORD -R xavierkain-apps/soarx-voice
```

Promoting both to organization secrets instead would let every iOS app in the
account share them.

Signing uses **fastlane match** (`type: appstore`). The encrypted certificates
live in **`xavierkain-apps/apple-certs`**, shared by every iOS app in the
account: Apple caps distribution certificates at 3 per team, and giving each app
its own is what exhausted that cap. match reads the shared identity from there
and creates only the provisioning profile this bundle ID needs.

`MATCH_GIT_TOKEN` must be a PAT with `Contents: read and write` on
`xavierkain-apps/apple-certs` — a workflow's built-in `GITHUB_TOKEN` is scoped to
its own repository and cannot reach it. The App Store Connect key needs the
**App Manager** role.

## Signing

Release signing credentials are never committed. Gradle resolves them from
`android/keystore.properties` (gitignored, for local builds) and falls back to
environment variables (for CI). A checkout without either still builds — it just
falls back to debug signing.

> **Back up `android/app/soarxvoice-release.keystore`.** Losing it means the app
> can never be updated on Google Play under the same package name.

## Architecture

```
src/
  contexts/     AgoraContext (RTC engine, channel state), Theme, User
  hooks/        useMute (feedback + toggle), useBluetoothHID
  screens/      Home, Voice, Settings
  components/   MuteButton, PilotList, ChannelBadge
  utils/        encoding (UTF-8 for the data stream), sounds, logger

ios/            Swift native modules: AudioSession, BLEButton, HID, Haptics, TTS
android/        Kotlin equivalents: BLEButtonManager, HIDModule, TTSModule,
                AudioForegroundService
```

Pilot names are exchanged over an Agora data stream, UTF-8 encoded by hand
(Hermes has no `TextEncoder`).

## Known limitations

- Channels are joined with an empty Agora token, so the App ID alone grants
  access to any channel. A token server is the next security step.
- R8 minification is disabled on Android release builds until the beta has been
  device-tested; keep rules are already in `proguard-rules.pro`.
