# SoarX Voice — Design Spec

## Résumé

Module de communication vocale groupe full-duplex pour pilotes de parapente. App standalone React Native (bare workflow) cross-platform iOS + Android, utilisant Agora.io pour l'audio temps réel. Conçu pour un usage mains libres en vol avec AirPods et bouton Bluetooth HID physique.

## Décisions de design

| Décision | Choix | Raison |
|----------|-------|--------|
| Framework | Bare React Native (TypeScript) | Contrôle total sur le natif (CallKit, HID, foreground service) |
| Audio temps réel | Agora.io SDK direct (`react-native-agora`) | Fiable, faible latence, gratuit 10k min/mois, bonne doc RN |
| Navigation | État simple (`useState` dans App.tsx) | 2 écrans seulement, pas besoin de React Navigation |
| Gestion d'état | React Context (AgoraContext + UserContext) | Natif React, zéro dépendance, suffisant pour cette taille d'app |
| Thème | Clair, palette SoarX (bleu marine + cyan) | Lisibilité en plein soleil, cohérence avec la marque SoarX |
| Cible proto | iOS prioritaire pour les tests, Android inclus en phase 1 | L'équipe est majoritairement iOS, un ami est sur Android |

## Architecture

### Couches

```
┌─────────────────────────────────────────────────┐
│  COUCHE UI (React)                              │
│  HomeScreen, VoiceScreen, MuteButton, PilotList │
├─────────────────────────────────────────────────┤
│  COUCHE ÉTAT (React Context)                    │
│  AgoraContext, UserContext                      │
├─────────────────────────────────────────────────┤
│  COUCHE LOGIQUE (Hooks)                         │
│  useAgora, useBluetoothHID, useMute             │
├─────────────────────────────────────────────────┤
│  COUCHE NATIVE (Modules natifs)                 │
│  react-native-agora, CallKit, ForegroundService,│
│  HID Module (Swift + Kotlin)                    │
├─────────────────────────────────────────────────┤
│  EXTERNE                                        │
│  Agora.io Cloud, AsyncStorage                   │
└─────────────────────────────────────────────────┘
```

### Flux de données

- **Mute via UI** : MuteButton → AgoraContext.toggleMute() → useAgora.muteLocalAudio() → Agora SDK
- **Mute via BT HID** : HID Module natif → useBluetoothHID → AgoraContext.toggleMute() → Agora SDK
- **Pilote rejoint** : Agora callback (userJoined) → useAgora → AgoraContext.pilots[] → PilotList (re-render)

### Structure des fichiers

```
soarx-voice/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   └── VoiceScreen.tsx
│   ├── hooks/
│   │   ├── useAgora.ts
│   │   ├── useBluetoothHID.ts
│   │   └── useMute.ts
│   ├── components/
│   │   ├── MuteButton.tsx
│   │   ├── PilotList.tsx
│   │   └── ChannelBadge.tsx
│   ├── contexts/
│   │   ├── AgoraContext.tsx
│   │   └── UserContext.tsx
│   ├── services/
│   │   ├── AgoraService.ts
│   │   └── CallKitService.ts
│   ├── utils/
│   │   └── channelGenerator.ts
│   └── App.tsx
├── ios/
│   └── SoarXVoice/
│       ├── HIDModule.swift          # Bouton BT HID iOS
│       └── HIDModule.m              # Bridge Obj-C
├── android/
│   └── app/src/main/java/.../
│       ├── HIDModule.kt             # Bouton BT HID Android
│       └── ForegroundServiceModule.kt
└── package.json
```

## Écrans

### HomeScreen — Rejoindre un vol

- **Fond** : dégradé bleu givré (#eaf4fb) → blanc
- **Titre** : "SOARX" en bleu marine (#1a2744), "X" en dégradé cyan, "VOICE" en cyan (#00acc1)
- **Champ nom du pilote** : fond blanc, bordure cyan subtile, sauvegardé en AsyncStorage
- **Champ canal** : code court (ex: TARIFA-01) + bouton 🎲 pour générer un code aléatoire
- **Bouton "Rejoindre le vol"** : dégradé cyan (#00bcd4 → #0097a7), texte blanc, grisé si champs vides
- **Validation** : les deux champs sont requis
- **Nom de canal** : alphanumérique + tiret, max 30 caractères (limite Agora : 64 bytes)

### VoiceScreen — Écran de vol

- **Header** : nom du canal (grande taille, 22px, bold) + badge "Live" vert
- **Liste pilotes** : cartes avec avatar (initiale), nom, statut temps réel
  - **Parle** : bordure cyan, barres audio animées
  - **En écoute** : bordure neutre, icône casque
  - **Muté** : bordure neutre, icône muet
  - **Soi-même** : mis en évidence (cyan si actif, rouge si muté)
- **Bouton mute central** : 120x120px, rond
  - **Actif** : dégradé cyan, icône micro, ombre cyan, texte "ACTIF"
  - **Muté** : dégradé rouge (#e53935 → #c62828), icône muet, ombre rouge, texte "MUTÉ"
  - Feedback haptique à chaque toggle
- **Bouton "Quitter le vol"** : texte rouge, en bas de l'écran

## Palette de couleurs

| Couleur | Hex | Usage |
|---------|-----|-------|
| Bleu marine | #1a2744 | Texte principal, titres |
| Cyan | #00bcd4 | Accent principal, boutons, bordures actives |
| Cyan foncé | #0097a7 | Dégradés boutons |
| Fond clair | #eaf4fb | Fond d'écran (haut du dégradé) |
| Blanc | #ffffff | Fond champs, cartes pilotes |
| Vert | #00C853 | Badge "Live" |
| Rouge | #e53935 | État muté, bouton quitter |
| Gris | #78909c | Avatars pilotes inactifs |

## Modules natifs

### CallKit (iOS)

- Déclarer un appel VoIP fictif à la connexion au canal Agora
- Affiche "SoarX Voice - {channelName}" dans la barre d'appel iOS
- Garantit micro + audio actifs écran verrouillé
- Utiliser `react-native-callkeep`
- Terminer l'appel CallKit à la déconnexion

### Foreground Service (Android)

- Service foreground avec notification persistante à la connexion
- Notification affiche : nom du canal + statut micro + bouton toggle mute
- Module natif Kotlin minimaliste ou lib existante

### Bouton Bluetooth HID — iOS (phase 1)

- Module natif Swift
- Écoute `MPRemoteCommandCenter.shared().togglePlayPauseCommand`
- Émet événement RN `onHIDToggle`
- Intercepté par le hook `useBluetoothHID` → toggle mute
- Fonctionne en background grâce à la session audio CallKit

### Bouton Bluetooth HID — Android (phase 1)

- Module natif Kotlin
- Interception de `KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE` ou `KEYCODE_HEADSETHOOK` dans l'Activity
- Émet événement RN `onHIDToggle` (même interface que iOS)
- Test prévu directement en conditions réelles

## Configuration Agora

```typescript
const AGORA_APP_ID = process.env.AGORA_APP_ID; // Stocker dans .env (exclu du VCS)

const agoraConfig = {
  appId: AGORA_APP_ID,
  channelName: channelId,
  uid: 0,            // auto-généré par Agora
  token: null,       // mode sans token (proto uniquement)
};

// Profil audio optimisé parapente (bruit de vent)
// AudioProfile: SPEECH_STANDARD
// AudioScenario: CHATROOM
```

## Permissions

### iOS (Info.plist)

- `NSMicrophoneUsageDescription` : "SoarX Voice utilise le micro pour la communication entre pilotes en vol."
- `UIBackgroundModes` : `audio`, `voip`

### Android (AndroidManifest.xml)

- `RECORD_AUDIO`
- `FOREGROUND_SERVICE`
- `INTERNET`
- `BLUETOOTH`
- `BLUETOOTH_CONNECT` (requis Android 12+ / API 31+)

## Dépendances

| Package | Usage |
|---------|-------|
| `react-native-agora` ^4.x | SDK audio Agora |
| `@react-native-async-storage/async-storage` ^1.x | Persistance nom pilote |
| `react-native-callkeep` | CallKit iOS (background audio) |

## Gestion d'erreurs (proto)

- **Perte réseau** : Agora tente la reconnexion automatique. Afficher un indicateur "Reconnexion..." sur le VoiceScreen.
- **Échec connexion Agora** : afficher une alerte et revenir au HomeScreen
- **Refus permission micro** : afficher un message explicatif et bloquer le bouton "Rejoindre le vol"

## Hors scope (proto)

- Authentification / comptes utilisateur
- Chiffrement audio (prod uniquement)
- Historique des sessions
- Intégration SoarX existante (vario, GPS)
- Tracking GPS / carte des pilotes
- Token Agora (mode sans token pour le proto)
