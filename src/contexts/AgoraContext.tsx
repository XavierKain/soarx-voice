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
import {startForegroundService, stopForegroundService, updateForegroundMuteStatus} from '../services/AndroidForegroundService';

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

  // Send pilot name to all users in the channel via data stream
  const broadcastName = useCallback((engine: IRtcEngine) => {
    try {
      if (dataStreamIdRef.current === null) {
        const streamId = engine.createDataStream({syncWithAudio: false, ordered: true});
        dataStreamIdRef.current = streamId;
      }
      const msg = JSON.stringify({type: 'name', name: pilotNameRef.current});
      const encoder = new TextEncoder();
      const data = encoder.encode(msg);
      engine.sendStreamMessage(dataStreamIdRef.current!, data, data.length);
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
        return [...prev, {uid: remoteUid, name: `Pilot`, status: 'listening', audioVolume: 0}];
      });
      // Re-broadcast our name so the new user learns it
      setTimeout(() => broadcastName(engine), 500);
    });

    engine.addListener('onUserOffline', (connection, remoteUid) => {
      setRemotePilots(prev => prev.filter(p => p.uid !== remoteUid));
    });

    // Receive data stream messages (pilot names)
    engine.addListener('onStreamMessage', (connection, remoteUid, streamId, data) => {
      try {
        const decoder = new TextDecoder();
        const text = decoder.decode(data as ArrayBuffer);
        const msg = JSON.parse(text);
        if (msg.type === 'name' && msg.name) {
          setRemotePilots(prev =>
            prev.map(p => p.uid === remoteUid ? {...p, name: msg.name} : p),
          );
        }
      } catch {}
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
  }, [broadcastName]);

  const joinChannel = useCallback(async (config: ChannelConfig) => {
    setConnectionState('connecting');
    setChannelName(config.channelName);
    channelNameRef.current = config.channelName;
    pilotNameRef.current = config.pilotName;
    setRemotePilots([]);
    setIsMuted(false);
    isMutedRef.current = false;
    dataStreamIdRef.current = null;

    const engine = await initEngine();
    engine.joinChannel('', config.channelName, 0, {});
    engine.muteLocalAudioStream(false);
    startForegroundService(config.channelName);

    // Broadcast our name after joining (with delay to let connection settle)
    setTimeout(() => broadcastName(engine), 1500);
  }, [initEngine, broadcastName]);

  const leaveChannel = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) {
      engine.leaveChannel();
    }
    stopForegroundService();
    setConnectionState('disconnected');
    setRemotePilots([]);
    setChannelName('');
    channelNameRef.current = '';
    setIsMuted(false);
    isMutedRef.current = false;
    dataStreamIdRef.current = null;
  }, []);

  const toggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      const newMuted = !isMutedRef.current;
      engine.muteLocalAudioStream(newMuted);
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);
      updateForegroundMuteStatus(newMuted, channelNameRef.current);
    }
  }, []);

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
