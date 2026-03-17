# SoarX Voice Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-duplex group voice communication app for paraglider pilots using React Native and Agora.io.

**Architecture:** Bare React Native (TypeScript) with 4 layers: UI (2 screens), State (React Context), Logic (hooks), Native (Agora SDK, CallKit, HID modules). Simple useState navigation between HomeScreen and VoiceScreen. Light theme with SoarX brand colors for outdoor visibility.

**Tech Stack:** React Native 0.76+, TypeScript strict, react-native-agora 4.x, react-native-callkeep, AsyncStorage, native modules in Swift (iOS) and Kotlin (Android).

**Spec:** `docs/superpowers/specs/2026-03-14-soarx-voice-design.md`

---

## Chunk 1: Project Scaffolding & Configuration

### Task 1: Initialize React Native project

**Files:**
- Create: project root (via CLI)
- Modify: `package.json`
- Create: `tsconfig.json` (generated)
- Create: `.env`
- Create: `.gitignore`

- [ ] **Step 1: Init bare React Native project with TypeScript**

```bash
cd "/Users/xavier/VSCode3/SoarX Voice"
npx @react-native-community/cli init SoarXVoice --template react-native-template-typescript --directory . --skip-git-init
```

Si le CLI refuse `--directory .` (répertoire non vide à cause de `docs/`), utiliser un répertoire temporaire puis déplacer :

```bash
cd /tmp
npx @react-native-community/cli init SoarXVoice --template react-native-template-typescript
# Copier le contenu dans le répertoire de travail
cp -r /tmp/SoarXVoice/* /tmp/SoarXVoice/.* "/Users/xavier/VSCode3/SoarX Voice/" 2>/dev/null
rm -rf /tmp/SoarXVoice
```

- [ ] **Step 2: Verify project builds**

```bash
cd "/Users/xavier/VSCode3/SoarX Voice"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Create .env file for Agora credentials**

Create `.env` :

```
AGORA_APP_ID=your_app_id_here
```

- [ ] **Step 4: Update .gitignore**

Ajouter à `.gitignore` :

```
.env
.superpowers/
```

- [ ] **Step 5: Init git and commit**

```bash
cd "/Users/xavier/VSCode3/SoarX Voice"
git init
git add -A
git commit -m "chore: init React Native bare project with TypeScript"
```

---

### Task 2: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `ios/Podfile`

- [ ] **Step 1: Install npm dependencies**

```bash
npm install react-native-agora @react-native-async-storage/async-storage react-native-callkeep react-native-dotenv
```

- [ ] **Step 2: Install iOS pods**

```bash
cd ios && pod install && cd ..
```

- [ ] **Step 3: Configure react-native-dotenv in babel.config.js**

Modifier `babel.config.js` :

```javascript
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['module:react-native-dotenv', {
      envName: 'APP_ENV',
      moduleName: '@env',
      path: '.env',
    }],
  ],
};
```

- [ ] **Step 4: Create TypeScript env declaration**

Créer `src/types/env.d.ts` :

```typescript
declare module '@env' {
  export const AGORA_APP_ID: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json ios/Podfile.lock babel.config.js src/types/env.d.ts
git commit -m "chore: install dependencies (agora, async-storage, callkeep, dotenv)"
```

---

### Task 3: Configure iOS permissions and background modes

**Files:**
- Modify: `ios/SoarXVoice/Info.plist`

- [ ] **Step 1: Add microphone permission and background modes to Info.plist**

Ajouter dans `<dict>` de `Info.plist` :

```xml
<key>NSMicrophoneUsageDescription</key>
<string>SoarX Voice utilise le micro pour la communication entre pilotes en vol.</string>
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
  <string>voip</string>
</array>
```

- [ ] **Step 2: Commit**

```bash
git add ios/SoarXVoice/Info.plist
git commit -m "chore(ios): add microphone permission and background audio modes"
```

---

### Task 4: Configure Android permissions

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add permissions to AndroidManifest.xml**

Ajouter dans `<manifest>` avant `<application>` :

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

- [ ] **Step 2: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "chore(android): add audio, bluetooth, and foreground service permissions"
```

---

### Task 5: Create source directory structure

**Files:**
- Create: `src/` directory tree

- [ ] **Step 1: Create all directories**

```bash
mkdir -p src/{screens,hooks,components,contexts,services,utils,types}
```

- [ ] **Step 2: Create placeholder index for type checking**

Créer `src/types/index.ts` :

```typescript
// Types partagés pour SoarX Voice

/** Statut d'un pilote dans le canal */
export type PilotStatus = 'speaking' | 'listening' | 'muted';

/** Représentation d'un pilote connecté */
export interface Pilot {
  /** UID Agora unique */
  uid: number;
  /** Nom affiché */
  name: string;
  /** Statut actuel */
  status: PilotStatus;
  /** Volume audio (0-255, pour détecter "speaking") */
  audioVolume: number;
}

/** État de connexion au canal */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Paramètres de connexion */
export interface ChannelConfig {
  channelName: string;
  pilotName: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/
git commit -m "chore: create source directory structure and shared types"
```

---

## Chunk 2: Core Logic — Utils, Contexts & Hooks

### Task 6: Channel name generator utility

**Files:**
- Create: `src/utils/channelGenerator.ts`
- Create: `src/utils/__tests__/channelGenerator.test.ts`

- [ ] **Step 1: Write failing tests**

Créer `src/utils/__tests__/channelGenerator.test.ts` :

```typescript
import {generateChannelName, isValidChannelName} from '../channelGenerator';

describe('generateChannelName', () => {
  it('retourne un code au format XXXX-NN', () => {
    const name = generateChannelName();
    expect(name).toMatch(/^[A-Z]{3,5}-\d{2}$/);
  });

  it('génère des codes différents à chaque appel', () => {
    const names = new Set(Array.from({length: 20}, () => generateChannelName()));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('isValidChannelName', () => {
  it('accepte un code alphanumérique avec tiret', () => {
    expect(isValidChannelName('TARIFA-01')).toBe(true);
  });

  it('accepte des lettres minuscules', () => {
    expect(isValidChannelName('vol-42')).toBe(true);
  });

  it('refuse un code vide', () => {
    expect(isValidChannelName('')).toBe(false);
  });

  it('refuse un code de plus de 30 caractères', () => {
    expect(isValidChannelName('A'.repeat(31))).toBe(false);
  });

  it('refuse les caractères spéciaux', () => {
    expect(isValidChannelName('canal@#!')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/utils/__tests__/channelGenerator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Créer `src/utils/channelGenerator.ts` :

```typescript
// Préfixes inspirés du vocabulaire parapente
const PREFIXES = ['VOL', 'FLY', 'SOAR', 'AILE', 'VENT', 'CIEL'];

/** Génère un nom de canal aléatoire au format PRÉFIXE-NN */
export function generateChannelName(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const number = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
  return `${prefix}-${number}`;
}

/** Valide un nom de canal : alphanumérique + tiret, max 30 caractères */
export function isValidChannelName(name: string): boolean {
  if (name.length === 0 || name.length > 30) {
    return false;
  }
  return /^[a-zA-Z0-9-]+$/.test(name);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/utils/__tests__/channelGenerator.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/channelGenerator.ts src/utils/__tests__/channelGenerator.test.ts
git commit -m "feat: add channel name generator with validation"
```

---

### Task 7: UserContext — persistance du nom pilote

**Files:**
- Create: `src/contexts/UserContext.tsx`

- [ ] **Step 1: Write UserContext**

Créer `src/contexts/UserContext.tsx` :

```typescript
import React, {createContext, useContext, useState, useEffect, useCallback, ReactNode} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@soarx_pilot_name';

interface UserContextValue {
  /** Nom du pilote */
  pilotName: string;
  /** Met à jour et persiste le nom du pilote */
  setPilotName: (name: string) => void;
  /** true tant que le nom est en cours de chargement depuis AsyncStorage */
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({children}: {children: ReactNode}) {
  const [pilotName, setPilotNameState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Charger le nom sauvegardé au lancement
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved) {
          setPilotNameState(saved);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setPilotName = useCallback((name: string) => {
    setPilotNameState(name);
    AsyncStorage.setItem(STORAGE_KEY, name);
  }, []);

  return (
    <UserContext.Provider value={{pilotName, setPilotName, isLoading}}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser doit être utilisé dans un UserProvider');
  }
  return context;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/UserContext.tsx
git commit -m "feat: add UserContext with AsyncStorage persistence"
```

---

### Task 8: AgoraContext — état central audio

**Files:**
- Create: `src/contexts/AgoraContext.tsx`

- [ ] **Step 1: Write AgoraContext**

Créer `src/contexts/AgoraContext.tsx` :

```typescript
import React, {createContext, useContext, useState, useCallback, useRef, ReactNode} from 'react';
import createAgoraRtcEngine, {
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  AudioProfileType,
  AudioScenarioType,
} from 'react-native-agora';
import {AGORA_APP_ID} from '@env';
import {Pilot, ConnectionState, ChannelConfig} from '../types';

interface AgoraContextValue {
  /** État de connexion au canal */
  connectionState: ConnectionState;
  /** Liste des pilotes connectés (sans soi-même) */
  remotePilots: Pilot[];
  /** true si le micro local est muté */
  isMuted: boolean;
  /** Rejoint un canal audio */
  joinChannel: (config: ChannelConfig) => Promise<void>;
  /** Quitte le canal */
  leaveChannel: () => Promise<void>;
  /** Toggle mute/unmute du micro local */
  toggleMute: () => void;
  /** Nom du canal actif */
  channelName: string;
}

const AgoraContext = createContext<AgoraContextValue | null>(null);

export function AgoraProvider({children}: {children: ReactNode}) {
  const engineRef = useRef<IRtcEngine | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [remotePilots, setRemotePilots] = useState<Pilot[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [channelName, setChannelName] = useState('');

  const initEngine = useCallback(async () => {
    if (engineRef.current) {
      return engineRef.current;
    }
    const engine = createAgoraRtcEngine();
    engine.initialize({appId: AGORA_APP_ID});
    engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
    engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
    engine.setAudioProfile(
      AudioProfileType.AudioProfileSpeechStandard,
      AudioScenarioType.AudioScenarioChatroom,
    );

    // Callbacks Agora
    engine.addListener('onUserJoined', (connection, remoteUid) => {
      setRemotePilots(prev => {
        if (prev.find(p => p.uid === remoteUid)) {
          return prev;
        }
        return [...prev, {uid: remoteUid, name: `Pilote ${remoteUid}`, status: 'listening', audioVolume: 0}];
      });
    });

    engine.addListener('onUserOffline', (connection, remoteUid) => {
      setRemotePilots(prev => prev.filter(p => p.uid !== remoteUid));
    });

    engine.addListener('onAudioVolumeIndication', (connection, speakers, totalVolume) => {
      setRemotePilots(prev =>
        prev.map(pilot => {
          const speaker = speakers.find(s => s.uid === pilot.uid);
          if (speaker) {
            const volume = speaker.volume ?? 0;
            return {
              ...pilot,
              audioVolume: volume,
              status: volume > 30 ? 'speaking' : 'listening',
            };
          }
          return pilot;
        }),
      );
    });

    engine.addListener('onConnectionStateChanged', (connection, state) => {
      // state: 1=disconnected, 2=connecting, 3=connected, 4=reconnecting, 5=failed
      const stateMap: Record<number, ConnectionState> = {
        1: 'disconnected',
        2: 'connecting',
        3: 'connected',
        4: 'reconnecting',
      };
      setConnectionState(stateMap[state] ?? 'disconnected');
    });

    // Activer l'indication de volume (intervalle 250ms, seuil par défaut)
    engine.enableAudioVolumeIndication(250, 3, true);

    engineRef.current = engine;
    return engine;
  }, []);

  const joinChannel = useCallback(async (config: ChannelConfig) => {
    setConnectionState('connecting');
    setChannelName(config.channelName);
    setRemotePilots([]);
    setIsMuted(false);
    isMutedRef.current = false;

    const engine = await initEngine();
    engine.joinChannel('', config.channelName, 0, {});
    // Micro ouvert par défaut
    engine.muteLocalAudioStream(false);
  }, [initEngine]);

  const leaveChannel = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) {
      engine.leaveChannel();
    }
    setConnectionState('disconnected');
    setRemotePilots([]);
    setChannelName('');
    setIsMuted(false);
    isMutedRef.current = false;
  }, []);

  const isMutedRef = useRef(false);

  const toggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const newMuted = !isMutedRef.current;
      engine.muteLocalAudioStream(newMuted);
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);
    }
  }, []);

  return (
    <AgoraContext.Provider
      value={{
        connectionState,
        remotePilots,
        isMuted,
        joinChannel,
        leaveChannel,
        toggleMute,
        channelName,
      }}>
      {children}
    </AgoraContext.Provider>
  );
}

export function useAgoraContext(): AgoraContextValue {
  const context = useContext(AgoraContext);
  if (!context) {
    throw new Error('useAgoraContext doit être utilisé dans un AgoraProvider');
  }
  return context;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AgoraContext.tsx
git commit -m "feat: add AgoraContext with full-duplex audio management"
```

---

### Task 9: useMute hook — état mute avec haptique

**Files:**
- Create: `src/hooks/useMute.ts`

- [ ] **Step 1: Write useMute hook**

Créer `src/hooks/useMute.ts` :

```typescript
import {useCallback} from 'react';
import {Vibration, Platform} from 'react-native';
import {useAgoraContext} from '../contexts/AgoraContext';

/** Hook qui encapsule le toggle mute avec feedback haptique */
export function useMute() {
  const {isMuted, toggleMute} = useAgoraContext();

  const toggle = useCallback(() => {
    // Feedback haptique court
    if (Platform.OS === 'ios') {
      // Sur iOS, on utilise une vibration courte de style impact
      Vibration.vibrate(10);
    } else {
      Vibration.vibrate(50);
    }
    toggleMute();
  }, [toggleMute]);

  return {isMuted, toggle};
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMute.ts
git commit -m "feat: add useMute hook with haptic feedback"
```

---

## Chunk 3: UI Components & Screens

### Task 10: Theme constants

**Files:**
- Create: `src/theme.ts`

- [ ] **Step 1: Write theme constants**

Créer `src/theme.ts` :

```typescript
// Palette SoarX — thème clair pour usage en extérieur
export const colors = {
  /** Bleu marine — texte principal, titres */
  navy: '#1a2744',
  /** Cyan — accent principal, boutons, bordures actives */
  cyan: '#00bcd4',
  /** Cyan foncé — dégradés boutons */
  cyanDark: '#0097a7',
  /** Cyan transparent — bordures, fonds subtils */
  cyanLight: 'rgba(0, 188, 212, 0.08)',
  cyanBorder: 'rgba(0, 188, 212, 0.2)',
  /** Fond d'écran — haut du dégradé */
  backgroundTop: '#eaf4fb',
  backgroundBottom: '#ffffff',
  /** Blanc */
  white: '#ffffff',
  /** Vert — badge Live */
  green: '#00C853',
  /** Rouge — état muté, bouton quitter */
  red: '#e53935',
  redDark: '#c62828',
  /** Gris — avatars inactifs */
  grey: '#78909c',
  /** Texte secondaire */
  textSecondary: 'rgba(26, 39, 68, 0.45)',
  textTertiary: 'rgba(26, 39, 68, 0.35)',
} as const;

export const fonts = {
  /** Taille minimum pour lisibilité en vol */
  body: 16,
  input: 17,
  button: 18,
  title: 22,
  logo: 36,
  label: 13,
  small: 12,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 40,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/theme.ts
git commit -m "feat: add SoarX light theme constants"
```

---

### Task 11: ChannelBadge component

**Files:**
- Create: `src/components/ChannelBadge.tsx`

- [ ] **Step 1: Write ChannelBadge**

Créer `src/components/ChannelBadge.tsx` :

```typescript
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, fonts} from '../theme';

/** Badge "Live" vert affiché dans le header du VoiceScreen */
export function ChannelBadge() {
  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text style={styles.text}>Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  text: {
    fontSize: fonts.label,
    fontWeight: '700',
    color: colors.green,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ChannelBadge.tsx
git commit -m "feat: add ChannelBadge component"
```

---

### Task 12: MuteButton component

**Files:**
- Create: `src/components/MuteButton.tsx`

- [ ] **Step 1: Write MuteButton**

Créer `src/components/MuteButton.tsx` :

```typescript
import React from 'react';
import {TouchableOpacity, Text, View, StyleSheet} from 'react-native';
import {colors} from '../theme';

interface MuteButtonProps {
  isMuted: boolean;
  onPress: () => void;
}

/** Gros bouton central (120x120) pour toggle mute — très visible avec des gants */
export function MuteButton({isMuted, onPress}: MuteButtonProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isMuted ? styles.muted : styles.active]}
        onPress={onPress}
        activeOpacity={0.8}>
        <Text style={styles.icon}>{isMuted ? '🔇' : '🎙️'}</Text>
        <Text style={styles.label}>{isMuted ? 'MUTÉ' : 'ACTIF'}</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        {isMuted ? 'Appuyer pour réactiver' : 'Appuyer pour couper'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    backgroundColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 4,
    borderColor: 'rgba(0, 188, 212, 0.3)',
  },
  muted: {
    backgroundColor: colors.red,
    shadowColor: colors.red,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 4,
    borderColor: 'rgba(229, 57, 53, 0.3)',
  },
  icon: {
    fontSize: 32,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MuteButton.tsx
git commit -m "feat: add MuteButton component (120x120, cyan/red states)"
```

---

### Task 13: PilotList component

**Files:**
- Create: `src/components/PilotList.tsx`

- [ ] **Step 1: Write PilotList**

Créer `src/components/PilotList.tsx` :

```typescript
import React from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {Pilot} from '../types';
import {colors, fonts, spacing} from '../theme';

interface PilotListProps {
  /** Pilotes distants */
  remotePilots: Pilot[];
  /** Info du pilote local */
  localPilotName: string;
  /** true si le micro local est muté */
  isMuted: boolean;
}

/** Liste des pilotes connectés avec statut temps réel */
export function PilotList({remotePilots, localPilotName, isMuted}: PilotListProps) {
  const localStatus = isMuted ? 'muted' : 'speaking';

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Pilotes connectés ({remotePilots.length + 1})
      </Text>

      {/* Pilote local en premier */}
      <PilotCard
        name={localPilotName}
        status={localStatus}
        isLocal
        audioVolume={0}
      />

      {/* Pilotes distants */}
      <FlatList
        data={remotePilots}
        keyExtractor={item => String(item.uid)}
        renderItem={({item}) => (
          <PilotCard
            name={item.name}
            status={item.status}
            isLocal={false}
            audioVolume={item.audioVolume}
          />
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

interface PilotCardProps {
  name: string;
  status: 'speaking' | 'listening' | 'muted';
  isLocal: boolean;
  audioVolume: number;
}

function PilotCard({name, status, isLocal}: PilotCardProps) {
  const initial = name.charAt(0).toUpperCase();
  const isSpeaking = status === 'speaking';
  const isMutedStatus = status === 'muted';

  return (
    <View
      style={[
        styles.card,
        isSpeaking && styles.cardSpeaking,
        isLocal && isMutedStatus && styles.cardMutedLocal,
      ]}>
      <View
        style={[
          styles.avatar,
          isSpeaking && styles.avatarSpeaking,
          isMutedStatus && styles.avatarMuted,
        ]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName}>{name}</Text>
        <Text
          style={[
            styles.cardStatus,
            isSpeaking && styles.statusSpeaking,
            isLocal && isMutedStatus && styles.statusMuted,
          ]}>
          {isLocal && !isMutedStatus
            ? 'Toi'
            : isLocal && isMutedStatus
              ? 'Micro coupé'
              : isSpeaking
                ? 'Parle...'
                : isMutedStatus
                  ? 'Muté'
                  : 'En écoute'}
        </Text>
      </View>
      <Text style={styles.statusIcon}>
        {isSpeaking ? '🎤' : isMutedStatus ? '🔇' : '🎧'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    flex: 1,
  },
  header: {
    fontSize: fonts.label,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: 'rgba(26, 39, 68, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: spacing.sm,
  },
  cardSpeaking: {
    backgroundColor: colors.cyanLight,
    borderColor: colors.cyanBorder,
  },
  cardMutedLocal: {
    backgroundColor: 'rgba(229, 57, 53, 0.06)',
    borderColor: 'rgba(229, 57, 53, 0.15)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSpeaking: {
    backgroundColor: colors.cyan,
  },
  avatarMuted: {
    backgroundColor: colors.grey,
  },
  avatarText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardName: {
    fontWeight: '700',
    fontSize: 16,
    color: colors.navy,
  },
  cardStatus: {
    fontSize: fonts.small,
    color: colors.textSecondary,
  },
  statusSpeaking: {
    color: colors.cyan,
    fontWeight: '600',
  },
  statusMuted: {
    color: colors.red,
    fontWeight: '600',
  },
  statusIcon: {
    fontSize: 18,
    opacity: 0.3,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PilotList.tsx
git commit -m "feat: add PilotList component with real-time status display"
```

---

### Task 14: HomeScreen

**Files:**
- Create: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Write HomeScreen**

Créer `src/screens/HomeScreen.tsx` :

```typescript
import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import {useUser} from '../contexts/UserContext';
import {generateChannelName, isValidChannelName} from '../utils/channelGenerator';
import {useAgoraContext} from '../contexts/AgoraContext';
import {colors, fonts, spacing} from '../theme';

interface HomeScreenProps {
  onJoined: () => void;
}

/** Écran d'accueil — saisie nom pilote + canal */
export function HomeScreen({onJoined}: HomeScreenProps) {
  const {pilotName, setPilotName} = useUser();
  const {joinChannel} = useAgoraContext();
  const [channel, setChannel] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const canJoin = pilotName.trim().length > 0 && isValidChannelName(channel);

  const handleGenerateChannel = () => {
    setChannel(generateChannelName());
  };

  const requestMicPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Permission Microphone',
          message: 'SoarX Voice a besoin du micro pour la communication en vol.',
          buttonPositive: 'Autoriser',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    // iOS : la permission est demandée automatiquement par Agora
    return true;
  };

  const handleJoin = async () => {
    if (!canJoin || isJoining) {
      return;
    }

    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission requise',
        'SoarX Voice a besoin du microphone pour fonctionner. Activez-le dans les réglages.',
      );
      return;
    }

    setIsJoining(true);
    try {
      await joinChannel({channelName: channel, pilotName});
      onJoined();
    } catch (error) {
      Alert.alert('Erreur de connexion', 'Impossible de rejoindre le canal. Vérifiez votre connexion.');
      setIsJoining(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Titre */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          SOAR<Text style={styles.titleX}>X</Text>
        </Text>
        <Text style={styles.subtitle}>VOICE</Text>
      </View>

      {/* Champ nom */}
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>NOM DU PILOTE</Text>
        <TextInput
          style={styles.input}
          value={pilotName}
          onChangeText={setPilotName}
          placeholder="Votre nom"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </View>

      {/* Champ canal */}
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>CANAL</Text>
        <View style={styles.channelRow}>
          <TextInput
            style={[styles.input, styles.channelInput]}
            value={channel}
            onChangeText={text => setChannel(text.toUpperCase())}
            placeholder="TARIFA-01"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            maxLength={30}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.generateButton} onPress={handleGenerateChannel}>
            <Text style={styles.generateIcon}>🎲</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Partagez ce code avec votre groupe</Text>
      </View>

      {/* Spacer */}
      <View style={styles.spacer} />

      {/* Bouton rejoindre */}
      <TouchableOpacity
        style={[styles.joinButton, !canJoin && styles.joinButtonDisabled]}
        onPress={handleJoin}
        disabled={!canJoin || isJoining}
        activeOpacity={0.8}>
        <Text style={styles.joinText}>
          {isJoining ? 'Connexion...' : 'Rejoindre le vol'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.version}>v0.1.0 — Proto</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl + 20,
    paddingBottom: spacing.xxl,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: fonts.logo,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.navy,
  },
  titleX: {
    color: colors.cyan,
  },
  subtitle: {
    fontSize: 16,
    color: colors.cyan,
    marginTop: 4,
    letterSpacing: 4,
    fontWeight: '600',
  },
  fieldBlock: {
    marginBottom: spacing.xxl,
  },
  label: {
    fontSize: fonts.label,
    color: colors.textSecondary,
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.cyanBorder,
    borderRadius: 12,
    padding: spacing.lg,
    fontSize: fonts.input,
    color: colors.navy,
    fontWeight: '500',
  },
  channelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  channelInput: {
    flex: 1,
  },
  generateButton: {
    backgroundColor: colors.cyanLight,
    borderWidth: 2,
    borderColor: 'rgba(0, 188, 212, 0.25)',
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  generateIcon: {
    fontSize: 20,
  },
  hint: {
    fontSize: fonts.small,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  joinButton: {
    backgroundColor: colors.cyan,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: colors.cyan,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  joinButtonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  joinText: {
    fontSize: fonts.button,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.5,
  },
  version: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: 11,
    color: 'rgba(26, 39, 68, 0.2)',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: add HomeScreen with pilot name and channel input"
```

---

### Task 15: VoiceScreen

**Files:**
- Create: `src/screens/VoiceScreen.tsx`

- [ ] **Step 1: Write VoiceScreen**

Créer `src/screens/VoiceScreen.tsx` :

```typescript
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {useAgoraContext} from '../contexts/AgoraContext';
import {useUser} from '../contexts/UserContext';
import {useMute} from '../hooks/useMute';
import {MuteButton} from '../components/MuteButton';
import {PilotList} from '../components/PilotList';
import {ChannelBadge} from '../components/ChannelBadge';
import {colors, fonts, spacing} from '../theme';

interface VoiceScreenProps {
  onLeft: () => void;
}

/** Écran de vol — canal actif avec liste pilotes et bouton mute */
export function VoiceScreen({onLeft}: VoiceScreenProps) {
  const {channelName, remotePilots, leaveChannel, connectionState} = useAgoraContext();
  const {pilotName} = useUser();
  const {isMuted, toggle} = useMute();

  const handleLeave = () => {
    Alert.alert(
      'Quitter le vol',
      'Voulez-vous vraiment quitter le canal ?',
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: async () => {
            await leaveChannel();
            onLeft();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.channelLabel}>Canal</Text>
          <Text style={styles.channelName}>{channelName}</Text>
        </View>
        {connectionState === 'connected' && <ChannelBadge />}
        {connectionState === 'reconnecting' && (
          <Text style={styles.reconnecting}>Reconnexion...</Text>
        )}
      </View>

      {/* Liste des pilotes */}
      <PilotList
        remotePilots={remotePilots}
        localPilotName={pilotName}
        isMuted={isMuted}
      />

      {/* Bouton mute */}
      <MuteButton isMuted={isMuted} onPress={toggle} />

      {/* Bouton quitter */}
      <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
        <Text style={styles.leaveText}>Quitter le vol</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  channelLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  channelName: {
    fontSize: fonts.title,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.navy,
  },
  reconnecting: {
    fontSize: fonts.label,
    fontWeight: '600',
    color: '#ff9800',
  },
  leaveButton: {
    padding: spacing.md,
    marginBottom: spacing.xxl,
  },
  leaveText: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: colors.red,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/VoiceScreen.tsx
git commit -m "feat: add VoiceScreen with pilot list, mute button, and leave action"
```

---

### Task 16: App.tsx — wiring everything

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Write App.tsx**

Remplacer le contenu de `App.tsx` :

```typescript
import React, {useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {UserProvider} from './src/contexts/UserContext';
import {AgoraProvider} from './src/contexts/AgoraContext';
import {HomeScreen} from './src/screens/HomeScreen';
import {VoiceScreen} from './src/screens/VoiceScreen';
import {colors} from './src/theme';

type Screen = 'home' | 'voice';

function AppContent() {
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.backgroundTop} />
      {screen === 'home' ? (
        <HomeScreen onJoined={() => setScreen('voice')} />
      ) : (
        <VoiceScreen onLeft={() => setScreen('home')} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <UserProvider>
      <AgoraProvider>
        <AppContent />
      </AgoraProvider>
    </UserProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundTop,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Build and run on iOS simulator**

```bash
npx react-native run-ios
```

Expected: l'app s'ouvre sur le HomeScreen avec le thème clair SoarX.

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat: wire App.tsx with navigation, contexts, and both screens"
```

---

## Chunk 4: Native Modules — CallKit, HID, Foreground Service

### Task 17: CallKit integration (iOS)

**Files:**
- Create: `src/services/CallKitService.ts`

- [ ] **Step 1: Write CallKitService**

Créer `src/services/CallKitService.ts` :

```typescript
import {Platform} from 'react-native';
import RNCallKeep from 'react-native-callkeep';

const CALLKEEP_OPTIONS = {
  ios: {
    appName: 'SoarX Voice',
    supportsVideo: false,
    maximumCallGroups: 1,
    maximumCallsPerCallGroup: 1,
  },
  android: {
    alertTitle: 'Permissions requises',
    alertDescription: 'SoarX Voice a besoin des permissions pour gérer les appels.',
    cancelButton: 'Annuler',
    okButton: 'OK',
  },
};

let currentCallId: string | null = null;

/** Initialise CallKeep (à appeler une fois au démarrage) */
export async function setupCallKit(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }
  try {
    await RNCallKeep.setup(CALLKEEP_OPTIONS);
  } catch (error) {
    console.warn('[CallKit] Setup failed:', error);
  }
}

/** Démarre un appel VoIP fictif pour maintenir l'audio en background */
export function startCallKitSession(channelName: string): void {
  if (Platform.OS !== 'ios') {
    return;
  }
  // Générer un UUID pour l'appel
  currentCallId = generateUUID();
  RNCallKeep.startCall(currentCallId, channelName, `SoarX Voice - ${channelName}`, 'generic', false);
}

/** Termine l'appel VoIP fictif */
export function endCallKitSession(): void {
  if (Platform.OS !== 'ios' || !currentCallId) {
    return;
  }
  RNCallKeep.endCall(currentCallId);
  currentCallId = null;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

- [ ] **Step 2: Intégrer CallKit dans AgoraContext**

Modifier `src/contexts/AgoraContext.tsx` — ajouter en haut :

```typescript
import {setupCallKit, startCallKitSession, endCallKitSession} from '../services/CallKitService';
```

Dans `joinChannel`, après `engine.muteLocalAudioStream(false);` ajouter :

```typescript
startCallKitSession(config.channelName);
```

Dans `leaveChannel`, avant `setConnectionState('disconnected');` ajouter :

```typescript
endCallKitSession();
```

Dans `AgoraProvider`, ajouter un `useEffect` pour le setup initial :

```typescript
useEffect(() => {
  setupCallKit();
}, []);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/CallKitService.ts src/contexts/AgoraContext.tsx
git commit -m "feat(ios): add CallKit integration for background audio"
```

---

### Task 18: HID Bluetooth module — iOS (Swift)

**Files:**
- Create: `ios/SoarXVoice/HIDModule.swift`
- Create: `ios/SoarXVoice/HIDModule.m`

- [ ] **Step 1: Write Swift native module**

Créer `ios/SoarXVoice/HIDModule.swift` :

```swift
import Foundation
import MediaPlayer

@objc(HIDModule)
class HIDModule: RCTEventEmitter {

  private var hasListeners = false

  override init() {
    super.init()
    setupRemoteCommandCenter()
  }

  override func supportedEvents() -> [String]! {
    return ["onHIDToggle"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  private func setupRemoteCommandCenter() {
    let commandCenter = MPRemoteCommandCenter.shared()

    // Bouton play/pause — keycode le plus courant des télécommandes BT selfie
    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.emitToggle()
      return .success
    }

    // Certaines télécommandes envoient play ou pause séparément
    commandCenter.playCommand.isEnabled = true
    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.emitToggle()
      return .success
    }

    commandCenter.pauseCommand.isEnabled = true
    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.emitToggle()
      return .success
    }
  }

  private func emitToggle() {
    if hasListeners {
      sendEvent(withName: "onHIDToggle", body: ["source": "bluetooth"])
    }
  }

  @objc override static func requiresMainQueueSetup() -> Bool {
    return true
  }
}
```

- [ ] **Step 2: Write Objective-C bridge**

Créer `ios/SoarXVoice/HIDModule.m` :

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(HIDModule, RCTEventEmitter)
@end
```

- [ ] **Step 3: Vérifier que le bridging header existe**

Si `ios/SoarXVoice/SoarXVoice-Bridging-Header.h` n'existe pas, le créer :

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
```

Et vérifier dans Xcode que `Build Settings > Swift Compiler > Objective-C Bridging Header` pointe vers ce fichier.

- [ ] **Step 4: Commit**

```bash
git add ios/SoarXVoice/HIDModule.swift ios/SoarXVoice/HIDModule.m
git commit -m "feat(ios): add HID Bluetooth native module for remote button"
```

---

### Task 19: HID Bluetooth module — Android (Kotlin)

**Files:**
- Create: `android/app/src/main/java/com/soarxvoice/HIDModule.kt`
- Create: `android/app/src/main/java/com/soarxvoice/HIDPackage.kt`
- Modify: `android/app/src/main/java/com/soarxvoice/MainApplication.kt`
- Modify: `android/app/src/main/java/com/soarxvoice/MainActivity.kt`

- [ ] **Step 1: Write HIDModule.kt**

Créer `android/app/src/main/java/com/soarxvoice/HIDModule.kt` :

```kotlin
package com.soarxvoice

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class HIDModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HIDModule"

    /**
     * Appelé depuis MainActivity quand un keycode media est intercepté.
     */
    fun emitToggle() {
        val params = Arguments.createMap().apply {
            putString("source", "bluetooth")
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onHIDToggle", params)
    }
}
```

- [ ] **Step 2: Write HIDPackage.kt**

Créer `android/app/src/main/java/com/soarxvoice/HIDPackage.kt` :

```kotlin
package com.soarxvoice

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class HIDPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(HIDModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<View, ReactShadowNode<*>>> {
        return emptyList()
    }
}
```

- [ ] **Step 3: Register package in MainApplication**

Modifier `android/app/src/main/java/com/soarxvoice/MainApplication.kt` — dans la méthode `getPackages()`, ajouter :

```kotlin
packages.add(HIDPackage())
```

- [ ] **Step 4: Intercept key events in MainActivity**

Modifier `android/app/src/main/java/com/soarxvoice/MainActivity.kt` — ajouter la méthode `onKeyDown` :

```kotlin
import android.view.KeyEvent

override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
        keyCode == KeyEvent.KEYCODE_HEADSETHOOK) {
        // Trouver le HIDModule et émettre l'événement
        val hidModule = reactInstanceManager?.currentReactContext
            ?.getNativeModule(HIDModule::class.java)
        hidModule?.emitToggle()
        return true
    }
    return super.onKeyDown(keyCode, event)
}
```

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/soarxvoice/
git commit -m "feat(android): add HID Bluetooth native module for remote button"
```

---

### Task 20: Foreground Service module — Android

**Files:**
- Create: `android/app/src/main/java/com/soarxvoice/ForegroundServiceModule.kt`
- Modify: `android/app/src/main/java/com/soarxvoice/HIDPackage.kt`

- [ ] **Step 1: Write ForegroundServiceModule.kt**

Créer `android/app/src/main/java/com/soarxvoice/ForegroundServiceModule.kt` :

```kotlin
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
                // Émettre un événement JS pour toggler le mute
                val params = Arguments.createMap().apply {
                    putString("source", "notification")
                }
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
        val context = reactApplicationContext
        createNotificationChannel(context)
        showNotification(context, channelName, false)
    }

    @ReactMethod
    fun stopService() {
        val notificationManager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID)
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

        // PendingIntent pour le bouton toggle mute dans la notification
        val toggleIntent = Intent(ACTION_TOGGLE_MUTE)
        val togglePendingIntent = PendingIntent.getBroadcast(
            context, 0, toggleIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("SoarX Voice — $channelName")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(actionIcon, actionLabel, togglePendingIntent)
            .build()

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SoarX Voice",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Communication vocale en vol"
            }
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
```

- [ ] **Step 2: Register in HIDPackage**

Modifier `android/app/src/main/java/com/soarxvoice/HIDPackage.kt` — dans `createNativeModules` :

```kotlin
return listOf(HIDModule(reactContext), ForegroundServiceModule(reactContext))
```

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/soarxvoice/ForegroundServiceModule.kt android/app/src/main/java/com/soarxvoice/HIDPackage.kt
git commit -m "feat(android): add foreground service for persistent audio notification"
```

---

### Task 21: useBluetoothHID hook — JS side

**Files:**
- Create: `src/hooks/useBluetoothHID.ts`

- [ ] **Step 1: Write useBluetoothHID hook**

Créer `src/hooks/useBluetoothHID.ts` :

```typescript
import {useEffect} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

const {HIDModule} = NativeModules;

interface HIDEvent {
  source: string;
}

/**
 * Hook qui écoute les événements du bouton Bluetooth HID
 * et appelle onToggle à chaque appui.
 */
export function useBluetoothHID(onToggle: () => void) {
  useEffect(() => {
    if (!HIDModule) {
      console.warn('[HID] Module natif HIDModule non disponible');
      return;
    }

    const eventEmitter = new NativeEventEmitter(HIDModule);
    const subscription = eventEmitter.addListener('onHIDToggle', (_event: HIDEvent) => {
      onToggle();
    });

    return () => {
      subscription.remove();
    };
  }, [onToggle]);
}
```

- [ ] **Step 2: Intégrer dans VoiceScreen**

Modifier `src/screens/VoiceScreen.tsx` — ajouter l'import :

```typescript
import {useBluetoothHID} from '../hooks/useBluetoothHID';
```

Et dans le composant `VoiceScreen`, après la ligne `const {isMuted, toggle} = useMute();` :

```typescript
// Écouter le bouton Bluetooth HID pour toggle mute
useBluetoothHID(toggle);
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBluetoothHID.ts src/screens/VoiceScreen.tsx
git commit -m "feat: add useBluetoothHID hook and wire to VoiceScreen"
```

---

### Task 22: Android foreground service integration

**Files:**
- Create: `src/services/AndroidForegroundService.ts`
- Modify: `src/contexts/AgoraContext.tsx`

- [ ] **Step 1: Write AndroidForegroundService wrapper**

Créer `src/services/AndroidForegroundService.ts` :

```typescript
import {Platform, NativeModules} from 'react-native';

const {ForegroundServiceModule} = NativeModules;

/** Démarre la notification persistante Android */
export function startForegroundService(channelName: string): void {
  if (Platform.OS !== 'android' || !ForegroundServiceModule) {
    return;
  }
  ForegroundServiceModule.startService(channelName);
}

/** Arrête la notification persistante Android */
export function stopForegroundService(): void {
  if (Platform.OS !== 'android' || !ForegroundServiceModule) {
    return;
  }
  ForegroundServiceModule.stopService();
}

/** Met à jour le statut mute dans la notification */
export function updateForegroundMuteStatus(isMuted: boolean, channelName: string): void {
  if (Platform.OS !== 'android' || !ForegroundServiceModule) {
    return;
  }
  ForegroundServiceModule.updateMuteStatus(isMuted, channelName);
}
```

- [ ] **Step 2: Intégrer dans AgoraContext**

Modifier `src/contexts/AgoraContext.tsx` — ajouter l'import :

```typescript
import {startForegroundService, stopForegroundService, updateForegroundMuteStatus} from '../services/AndroidForegroundService';
```

Dans `joinChannel`, après `startCallKitSession(config.channelName);` ajouter :

```typescript
startForegroundService(config.channelName);
```

Dans `leaveChannel`, après `endCallKitSession();` ajouter :

```typescript
stopForegroundService();
```

Dans `toggleMute`, après `setIsMuted(newMuted);` ajouter :

```typescript
updateForegroundMuteStatus(newMuted, channelName);
```

- [ ] **Step 3: Commit**

```bash
git add src/services/AndroidForegroundService.ts src/contexts/AgoraContext.tsx
git commit -m "feat(android): integrate foreground service with AgoraContext"
```

---

## Chunk 5: Final Integration & Testing

### Task 23: Build and test on iOS device

- [ ] **Step 1: Set Agora App ID**

Créer un compte sur console.agora.io, créer un projet, copier l'App ID dans `.env` :

```
AGORA_APP_ID=ton_vrai_app_id
```

- [ ] **Step 2: Build for iOS device**

```bash
npx react-native run-ios --device
```

- [ ] **Step 3: Test manual — HomeScreen**

Vérifier :
- Saisie du nom et du canal fonctionne
- Le bouton 🎲 génère un code
- Le nom est pré-rempli après redémarrage de l'app
- Le bouton "Rejoindre le vol" est grisé si champs vides

- [ ] **Step 4: Test manual — VoiceScreen**

Avec un 2e appareil connecté au même canal :
- Les deux pilotes apparaissent dans la liste
- L'audio full-duplex fonctionne (les deux s'entendent)
- Le bouton mute coupe/réactive le micro
- Le feedback haptique fonctionne
- Le statut du pilote change en temps réel (parle/écoute/muté)

- [ ] **Step 5: Test manual — Background audio**

- Verrouiller l'écran → l'audio continue
- L'appel apparaît dans la barre d'appel iOS (CallKit)
- Le micro reste actif en background

- [ ] **Step 6: Test manual — Bouton Bluetooth HID**

- Connecter une télécommande selfie BT
- Appuyer → toggle mute/unmute
- Tester écran verrouillé

- [ ] **Step 7: Commit final si ajustements**

```bash
git add -A
git commit -m "fix: adjustments from device testing"
```

---

### Task 24: Test cross-platform iOS ↔ Android

- [ ] **Step 1: Build for Android** (si appareil disponible)

```bash
npx react-native run-android
```

- [ ] **Step 2: Test canal partagé**

Avec un iPhone et un Android sur le même canal :
- Les deux s'entendent
- La liste des pilotes affiche les deux
- Le mute fonctionne des deux côtés

- [ ] **Step 3: Tag version proto**

```bash
git tag v0.1.0-proto
git log --oneline
```
