import React, {createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode} from 'react';
import createAgoraRtcEngine, {
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  AudioProfileType,
  AudioScenarioType,
} from 'react-native-agora';
import {AGORA_APP_ID} from '@env';
import {Pilot, ConnectionState, ChannelConfig} from '../types';
import {startForegroundService, stopForegroundService, updateForegroundMuteStatus} from '../services/AndroidForegroundService';

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
  const leaveChannelRef = useRef<() => Promise<void>>(async () => {});

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
    const engine = createAgoraRtcEngine();
    engine.initialize({appId: AGORA_APP_ID});
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
      setConnectionState(stateMap[state] ?? 'disconnected');
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
    setAutoDisconnected(false);
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
    stopInactivityTimer();
    const engine = engineRef.current;
    if (engine) {
      engine.leaveChannel();
    }
    stopForegroundService();
    setConnectionState('disconnected');
    setRemotePilots([]);
    remotePilotsRef.current = [];
    setChannelName('');
    channelNameRef.current = '';
    setIsMuted(false);
    isMutedRef.current = false;
    dataStreamIdRef.current = null;
  }, []);

  // Keep ref in sync so the inactivity timer can call leaveChannel without circular deps
  leaveChannelRef.current = leaveChannel;

  const toggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const newMuted = !isMutedRef.current;
      engine.muteLocalAudioStream(newMuted);
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);
      updateForegroundMuteStatus(newMuted, channelNameRef.current);
      // Any mute/unmute action = user is active → full reset (like "Stay Connected")
      dismissWarning();
    }
  }, [dismissWarning]);

  const toggleSpeaker = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const newSpeaker = !isSpeakerOn;
      engine.setEnableSpeakerphone(newSpeaker);
      setIsSpeakerOn(newSpeaker);
    }
  }, [isSpeakerOn]);

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
