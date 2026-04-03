import React, {createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode} from 'react';
import createAgoraRtcEngine, {
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  AudioProfileType,
  AudioScenarioType,
  AudioSessionOperationRestriction,
} from 'react-native-agora';
import {AGORA_APP_ID} from '@env';
import {AppState, AppStateStatus, Platform, NativeModules, NativeEventEmitter} from 'react-native';
import {Pilot, ConnectionState, ChannelConfig} from '../types';
import {startForegroundService, stopForegroundService, updateForegroundMuteStatus} from '../services/AndroidForegroundService';
import {appLog} from '../utils/logger';

export type InactivityWarning = null | 'solo' | 'silence';

interface AgoraContextValue {
  connectionState: ConnectionState;
  remotePilots: Pilot[];
  isMuted: boolean;
  isSpeakerOn: boolean;
  joinChannel: (config: ChannelConfig) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  channelName: string;
  inactivityWarning: InactivityWarning;
  warningSecondsLeft: number;
  dismissWarning: () => void;
  autoDisconnected: boolean;
  isConnected: () => boolean;
  isPausedForVideo: boolean;
  pauseForVideo: () => void;
  resumeFromVideo: () => void;
  isHeadphonesConnected: boolean;
  playEffect: (soundId: number, filePath: string) => void;
}

const AgoraContext = createContext<AgoraContextValue | null>(null);

export function AgoraProvider({children}: {children: ReactNode}) {
  const engineRef = useRef<IRtcEngine | null>(null);
  const dataStreamIdRef = useRef<number | null>(null);
  const pilotNameRef = useRef('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [remotePilots, setRemotePilots] = useState<Pilot[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [channelName, setChannelName] = useState('');
  const isMutedRef = useRef(false);
  const channelNameRef = useRef('');
  const connectionStateRef = useRef<ConnectionState>('disconnected');
  const leaveChannelRef = useRef<() => Promise<void>>(async () => {});
  const audioInterruptedRef = useRef(false);

  // Inactivity guard
  const SOLO_TIMEOUT = 5 * 60 * 1000;      // 5 min alone → warning
  const SOLO_GRACE = 2 * 60 * 1000;         // 2 min grace after solo warning
  const SILENCE_TIMEOUT = 60 * 60 * 1000;   // 1h no audio → warning
  const SILENCE_GRACE = 5 * 60 * 1000;      // 5 min grace after silence warning
  const CHECK_INTERVAL = 1000;               // check every 1s for accurate countdown

  const lastActivityRef = useRef<number>(Date.now());
  const aloneStartRef = useRef<number | null>(null);
  const warningStartRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remotePilotsRef = useRef<Pilot[]>([]);
  const [inactivityWarning, setInactivityWarning] = useState<InactivityWarning>(null);
  const inactivityWarningRef = useRef<InactivityWarning>(null);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(0);
  const [autoDisconnected, setAutoDisconnected] = useState(false);
  const [isPausedForVideo, setIsPausedForVideo] = useState(false);
  const [isHeadphonesConnected, setIsHeadphonesConnected] = useState(false);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (inactivityWarningRef.current) {
      warningStartRef.current = null;
      inactivityWarningRef.current = null;
      setInactivityWarning(null);
      setWarningSecondsLeft(0);
    }
  }, []);

  const dismissWarning = useCallback(() => {
    resetActivity();
    // Also reset alone timer so solo doesn't re-trigger immediately
    aloneStartRef.current = remotePilotsRef.current.length === 0 ? Date.now() : null;
  }, [resetActivity]);

  // Encode string to Uint8Array (Hermes-compatible, no TextEncoder needed)
  const strToBytes = (str: string): Uint8Array => {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
    return arr;
  };
  const bytesToStr = (buf: any): string => {
    const bytes = new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return str;
  };

  // Send pilot name to all users in the channel via data stream
  const broadcastName = useCallback((engine: IRtcEngine) => {
    try {
      if (dataStreamIdRef.current === null) {
        const streamId = engine.createDataStream({syncWithAudio: false, ordered: true});
        dataStreamIdRef.current = streamId;
      }
      const msg = JSON.stringify({type: 'name', name: pilotNameRef.current});
      const data = strToBytes(msg);
      engine.sendStreamMessage(dataStreamIdRef.current!, data, data.length);
      console.log('[Agora] Broadcast name:', pilotNameRef.current);
    } catch (e) {
      console.warn('[Agora] broadcastName error:', e);
    }
  }, []);

  const initEngine = useCallback(async () => {
    if (engineRef.current) {
      return engineRef.current;
    }
    // 1. Configure AVAudioSession OURSELVES first, before Agora touches it
    if (Platform.OS === 'ios' && NativeModules.AudioSessionManager) {
      NativeModules.AudioSessionManager.configureAudioSession();
      appLog('Agora', 'Audio session configured by us before Agora init');
    }

    const engine = createAgoraRtcEngine();
    engine.initialize({appId: AGORA_APP_ID});

    // 2. Tell Agora: you can configure the session, but you CANNOT deactivate it
    // This lets us control deactivation for Camera video recording
    if (Platform.OS === 'ios') {
      engine.setAudioSessionOperationRestriction(
        AudioSessionOperationRestriction.AudioSessionOperationRestrictionDeactivateSession,
      );
      appLog('Agora', 'Restriction(DeactivateSession) — we control deactivation');
    }

    engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
    engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
    engine.setAudioProfile(
      AudioProfileType.AudioProfileSpeechStandard,
      AudioScenarioType.AudioScenarioChatroom,
    );

    // Remote user joined — add with temporary name, then broadcast our name
    engine.addListener('onUserJoined', (connection, remoteUid) => {
      setRemotePilots(prev => {
        if (prev.find(p => p.uid === remoteUid)) return prev;
        const updated = [...prev, {uid: remoteUid, name: `Pilot`, status: 'listening' as const, audioVolume: 0}];
        remotePilotsRef.current = updated;
        return updated;
      });
      // Someone joined → reset activity & no longer alone
      aloneStartRef.current = null;
      resetActivity();
      // Re-broadcast our name so the new user learns it
      setTimeout(() => broadcastName(engine), 500);
    });

    engine.addListener('onUserOffline', (connection, remoteUid) => {
      setRemotePilots(prev => {
        const updated = prev.filter(p => p.uid !== remoteUid);
        remotePilotsRef.current = updated;
        // If now alone, start tracking
        if (updated.length === 0) {
          aloneStartRef.current = Date.now();
        }
        return updated;
      });
    });

    // Receive data stream messages (pilot names)
    engine.addListener('onStreamMessage', (connection, remoteUid, streamId, data) => {
      try {
        const text = bytesToStr(data);
        const msg = JSON.parse(text);
        console.log('[Agora] Received name from', remoteUid, ':', msg.name);
        if (msg.type === 'name' && msg.name) {
          setRemotePilots(prev =>
            prev.map(p => p.uid === remoteUid ? {...p, name: msg.name} : p),
          );
        }
      } catch (e) {
        console.warn('[Agora] onStreamMessage parse error:', e);
      }
    });

    engine.addListener('onAudioVolumeIndication', (connection, speakers, totalVolume) => {
      // Detect any audio activity (someone speaking) → reset inactivity
      const hasActivity = speakers.some(s => (s.volume ?? 0) > 30);
      if (hasActivity) {
        lastActivityRef.current = Date.now();
        if (inactivityWarningRef.current === 'silence') {
          warningStartRef.current = null;
          inactivityWarningRef.current = null;
          setInactivityWarning(null);
          setWarningSecondsLeft(0);
        }
      }

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
      const stateMap: Record<number, ConnectionState> = {
        1: 'disconnected',
        2: 'connecting',
        3: 'connected',
        4: 'reconnecting',
      };
      const mapped = stateMap[state] ?? 'disconnected';
      connectionStateRef.current = mapped;
      setConnectionState(mapped);
    });

    // Audio interruption handling (e.g. Camera app takes mic for video recording)
    engine.addListener('onLocalAudioStateChanged', (_connection: any, state: number, reason: number) => {
      appLog('Agora', `onLocalAudioStateChanged state=${state} reason=${reason}`);
      if (reason === 8) {
        // Another app took the mic (Camera video, phone call, etc.)
        appLog('Agora', 'Audio interrupted — auto-pausing for video');
        audioInterruptedRef.current = true;
        setIsPausedForVideo(true);
        engine.disableAudio();
      } else if (reason === 0 && audioInterruptedRef.current) {
        appLog('Agora', 'Audio interruption ended — auto-resuming');
        audioInterruptedRef.current = false;
        engine.enableAudio();
        engine.muteLocalAudioStream(isMutedRef.current);
        setIsPausedForVideo(false);
      }
    });

    // Detect headphones/AirPods connection via audio route changes
    // Agora AudioRoute enum: -1=Default, 0=Headset, 1=Earpiece,
    // 2=HeadsetNoMic, 3=Speakerphone, 4=Loudspeaker,
    // 5=BluetoothHFP, 6=USB, 7=HDMI, 10=BluetoothA2DP
    engine.addListener('onAudioRoutingChanged', (_routing: number) => {
      const headphoneRoutes = [0, 2, 5, 10]; // Headset, HeadsetNoMic, BluetoothHFP, BluetoothA2DP
      const isHP = headphoneRoutes.includes(_routing);
      setIsHeadphonesConnected(isHP);
      appLog('Agora', `Audio route changed: ${_routing} headphones=${isHP}`);
    });

    engine.enableAudioVolumeIndication(250, 3, true);
    engineRef.current = engine;
    return engine;
  }, [broadcastName, resetActivity]);

  const stopInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearInterval(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    warningStartRef.current = null;
    inactivityWarningRef.current = null;
    setInactivityWarning(null);
    setWarningSecondsLeft(0);
  };

  const startInactivityTimer = () => {
    stopInactivityTimer();
    lastActivityRef.current = Date.now();
    aloneStartRef.current = Date.now(); // start alone until someone joins
    warningStartRef.current = null;
    inactivityWarningRef.current = null;
    setInactivityWarning(null);
    setWarningSecondsLeft(0);

    inactivityTimerRef.current = setInterval(() => {
      const now = Date.now();
      const pilotCount = remotePilotsRef.current.length;
      const currentWarning = inactivityWarningRef.current;

      // If warning is active, check grace period
      if (currentWarning && warningStartRef.current) {
        const grace = currentWarning === 'solo' ? SOLO_GRACE : SILENCE_GRACE;
        const elapsed = now - warningStartRef.current;
        const remaining = Math.max(0, Math.ceil((grace - elapsed) / 1000));
        setWarningSecondsLeft(remaining);
        if (elapsed >= grace) {
          // Grace expired → auto-disconnect
          console.log('[Agora] Inactivity auto-disconnect:', currentWarning);
          setAutoDisconnected(true);
          leaveChannelRef.current();
          return;
        }
        return;
      }

      // Check solo: alone for more than SOLO_TIMEOUT
      if (pilotCount === 0 && aloneStartRef.current) {
        if (now - aloneStartRef.current >= SOLO_TIMEOUT) {
          console.log('[Agora] Solo timeout reached, showing warning');
          warningStartRef.current = now;
          inactivityWarningRef.current = 'solo';
          setInactivityWarning('solo');
          setWarningSecondsLeft(Math.ceil(SOLO_GRACE / 1000));
          return;
        }
      }

      // Check silence: no audio activity for SILENCE_TIMEOUT
      if (pilotCount > 0 && now - lastActivityRef.current >= SILENCE_TIMEOUT) {
        console.log('[Agora] Silence timeout reached, showing warning');
        warningStartRef.current = now;
        inactivityWarningRef.current = 'silence';
        setInactivityWarning('silence');
        setWarningSecondsLeft(Math.ceil(SILENCE_GRACE / 1000));
      }
    }, CHECK_INTERVAL);
  };

  const joinChannel = useCallback(async (config: ChannelConfig) => {
    setConnectionState('connecting');
    connectionStateRef.current = 'connecting';
    setAutoDisconnected(false);
    setIsSpeakerOn(false);
    setChannelName(config.channelName);
    channelNameRef.current = config.channelName;
    pilotNameRef.current = config.pilotName;
    setRemotePilots([]);
    remotePilotsRef.current = [];
    setIsMuted(false);
    isMutedRef.current = false;
    dataStreamIdRef.current = null;

    const engine = await initEngine();
    engine.joinChannel('', config.channelName, 0, {});
    engine.muteLocalAudioStream(false);
    startForegroundService(config.channelName);
    startInactivityTimer();

    // Broadcast our name multiple times after joining (reliability)
    setTimeout(() => broadcastName(engine), 1000);
    setTimeout(() => broadcastName(engine), 3000);
    setTimeout(() => broadcastName(engine), 6000);
  }, [initEngine, broadcastName]);

  const leaveChannel = useCallback(async () => {
    appLog('Agora', 'leaveChannel() START');
    setConnectionState('disconnected');
    connectionStateRef.current = 'disconnected';
    appLog('Agora', 'connectionState set to disconnected');
    stopInactivityTimer();
    const engine = engineRef.current;
    if (engine) {
      appLog('Agora', 'calling engine.leaveChannel()');
      engine.leaveChannel();
      appLog('Agora', 'engine.leaveChannel() done');
    }
    stopForegroundService();
    setRemotePilots([]);
    remotePilotsRef.current = [];
    setChannelName('');
    channelNameRef.current = '';
    setIsMuted(false);
    isMutedRef.current = false;
    dataStreamIdRef.current = null;
    appLog('Agora', 'leaveChannel() END');
  }, []);

  // Keep ref in sync so the inactivity timer can call leaveChannel without circular deps
  leaveChannelRef.current = leaveChannel;

  // Listen for native audio session interruptions (Camera video, phone calls, etc.)
  useEffect(() => {
    if (Platform.OS !== 'ios' || !NativeModules.AudioSessionManager) return;

    const emitter = new NativeEventEmitter(NativeModules.AudioSessionManager);

    const interruptSub = emitter.addListener('onAudioInterrupted', (event) => {
      appLog('AudioSession', `INTERRUPTED reason=${event.reason}`);
      const engine = engineRef.current;
      if (engine && connectionStateRef.current === 'connected') {
        // Mute our mic but keep receiving remote audio
        engine.muteLocalAudioStream(true);
        setIsPausedForVideo(true);
        appLog('AudioSession', 'Mic muted — Camera can record video');
      }
    });

    const resumeSub = emitter.addListener('onAudioResumed', (event) => {
      appLog('AudioSession', `RESUMED reason=${event.reason}`);
      const engine = engineRef.current;
      if (engine && connectionStateRef.current === 'connected') {
        // Restore mute state to what it was before interruption
        engine.muteLocalAudioStream(isMutedRef.current);
        setIsPausedForVideo(false);
        appLog('AudioSession', `Mic restored to muted=${isMutedRef.current}`);
      }
    });

    appLog('AudioSession', 'Native interruption listeners registered');

    return () => {
      interruptSub.remove();
      resumeSub.remove();
    };
  }, []);

  // AppState backup: reclaim mic when app returns to foreground after audio interruption
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && audioInterruptedRef.current && engineRef.current) {
        console.log('[Agora] AppState active — reclaiming mic after interruption');
        audioInterruptedRef.current = false;
        engineRef.current.enableLocalAudio(true);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  const toggleMute = useCallback(() => {
    appLog('Agora', `toggleMute() called — current=${isMutedRef.current} connState=${connectionStateRef.current}`);
    const engine = engineRef.current;
    if (engine) {
      const newMuted = !isMutedRef.current;
      engine.muteLocalAudioStream(newMuted);
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);
      updateForegroundMuteStatus(newMuted, channelNameRef.current);
      dismissWarning();
      appLog('Agora', `toggleMute() done — new=${newMuted}`);
    } else {
      appLog('Agora', 'toggleMute() — no engine');
    }
  }, [dismissWarning]);

  const toggleSpeaker = useCallback(() => {
    appLog('Agora', `toggleSpeaker() called — current=${isSpeakerOn}`);
    const engine = engineRef.current;
    if (engine) {
      const newSpeaker = !isSpeakerOn;
      engine.setEnableSpeakerphone(newSpeaker);
      setIsSpeakerOn(newSpeaker);
      appLog('Agora', `toggleSpeaker() done — new=${newSpeaker}`);
    }
  }, [isSpeakerOn]);

  // Pause audio for video recording — releases mic so Camera can use it
  // Manual video pause: mute mic + deactivate session so Camera can record
  const pauseForVideo = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    appLog('Agora', 'pauseForVideo — muting mic + deactivating session');
    engine.muteLocalAudioStream(true);
    setIsPausedForVideo(true);
    if (Platform.OS === 'ios' && NativeModules.AudioSessionManager) {
      NativeModules.AudioSessionManager.deactivateAudioSession();
    }
  }, []);

  // Resume after video: reactivate session + restore mic state
  const resumeFromVideo = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    appLog('Agora', 'resumeFromVideo — reactivating session');
    if (Platform.OS === 'ios' && NativeModules.AudioSessionManager) {
      NativeModules.AudioSessionManager.configureAudioSession();
    }
    // Small delay to let session reactivate before unmuting
    setTimeout(() => {
      engine.muteLocalAudioStream(isMutedRef.current);
      setIsPausedForVideo(false);
      appLog('Agora', `resumeFromVideo done — muted=${isMutedRef.current}`);
    }, 500);
    setIsPausedForVideo(false);
    appLog('Agora', 'resumeFromVideo — done');
  }, []);

  // Auto-resume when app returns to foreground after video pause
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isPausedForVideo) {
        resumeFromVideo();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [isPausedForVideo, resumeFromVideo]);

  const playEffectSound = useCallback((soundId: number, fileName: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      // On iOS, Agora accepts the filename directly if it's in the main bundle
      // On Android, use the resource name without extension from res/raw/
      const filePath = Platform.OS === 'android'
        ? `/assets/${fileName}`
        : fileName;
      engine.playEffect(soundId, filePath, 0, 1.0, 0, 100, false, 0);
    } catch (e) {
      console.warn('[Agora] playEffect error:', e);
    }
  }, []);

  return (
    <AgoraContext.Provider
      value={{
        connectionState,
        remotePilots,
        isMuted,
        isSpeakerOn,
        joinChannel,
        leaveChannel,
        toggleMute,
        toggleSpeaker,
        channelName,
        inactivityWarning,
        warningSecondsLeft,
        dismissWarning,
        autoDisconnected,
        isConnected: () => connectionStateRef.current === 'connected',
        isPausedForVideo,
        pauseForVideo,
        resumeFromVideo,
        isHeadphonesConnected,
        playEffect: playEffectSound,
      }}>
      {children}
    </AgoraContext.Provider>
  );
}

export function useAgoraContext(): AgoraContextValue {
  const context = useContext(AgoraContext);
  if (!context) {
    throw new Error('useAgoraContext must be used within an AgoraProvider');
  }
  return context;
}
