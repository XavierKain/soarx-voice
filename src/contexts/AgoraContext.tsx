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
// CallKit disabled: it intercepts Bluetooth HID button events during active calls
// Background audio is maintained via UIBackgroundModes (audio, voip) in Info.plist
// import {setupCallKit, startCallKitSession, endCallKitSession} from '../services/CallKitService';
import {startForegroundService, stopForegroundService, updateForegroundMuteStatus} from '../services/AndroidForegroundService';

interface AgoraContextValue {
  connectionState: ConnectionState;
  remotePilots: Pilot[];
  isMuted: boolean;
  joinChannel: (config: ChannelConfig) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMute: () => void;
  channelName: string;
}

const AgoraContext = createContext<AgoraContextValue | null>(null);

export function AgoraProvider({children}: {children: ReactNode}) {
  const engineRef = useRef<IRtcEngine | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [remotePilots, setRemotePilots] = useState<Pilot[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [channelName, setChannelName] = useState('');
  const isMutedRef = useRef(false);
  const channelNameRef = useRef('');

  // useEffect(() => { setupCallKit(); }, []);

  // Initialise le moteur Agora RTC avec le profil audio optimisé pour les communications
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

    // Ajout d'un pilote distant à la liste lors de sa connexion
    engine.addListener('onUserJoined', (connection, remoteUid) => {
      setRemotePilots(prev => {
        if (prev.find(p => p.uid === remoteUid)) {
          return prev;
        }
        return [...prev, {uid: remoteUid, name: `Pilot ${remoteUid}`, status: 'listening', audioVolume: 0}];
      });
    });

    // Suppression d'un pilote distant de la liste lors de sa déconnexion
    engine.addListener('onUserOffline', (connection, remoteUid) => {
      setRemotePilots(prev => prev.filter(p => p.uid !== remoteUid));
    });

    // Mise à jour du volume audio et du statut des pilotes distants
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

    // Suivi de l'état de connexion au canal
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
  }, []);

  // Rejoindre un canal audio avec la configuration fournie
  const joinChannel = useCallback(async (config: ChannelConfig) => {
    setConnectionState('connecting');
    setChannelName(config.channelName);
    channelNameRef.current = config.channelName;
    setRemotePilots([]);
    setIsMuted(false);
    isMutedRef.current = false;

    const engine = await initEngine();
    engine.joinChannel('', config.channelName, 0, {});
    engine.muteLocalAudioStream(false);
    // startCallKitSession(config.channelName);
    startForegroundService(config.channelName);
  }, [initEngine]);

  // Quitter le canal audio et réinitialiser l'état
  const leaveChannel = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) {
      engine.leaveChannel();
    }
    // endCallKitSession();
    stopForegroundService();
    setConnectionState('disconnected');
    setRemotePilots([]);
    setChannelName('');
    channelNameRef.current = '';
    setIsMuted(false);
    isMutedRef.current = false;
  }, []);

  // Basculer l'état muet du microphone local
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
    throw new Error('useAgoraContext must be used within an AgoraProvider');
  }
  return context;
}
