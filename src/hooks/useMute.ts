import {useCallback, useEffect, useRef} from 'react';
import {Vibration, Platform, NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Sound from 'react-native-sound';
import {useAgoraContext} from '../contexts/AgoraContext';
import {appLog} from '../utils/logger';
import {soundFile, SoundName} from '../utils/sounds';

const FEEDBACK_KEY = '@soarx_mute_feedback';
export type MuteFeedbackMode = 'voice' | 'beeps';

export function useMute() {
  const {isMuted, toggleMute, isConnected} = useAgoraContext();
  const feedbackModeRef = useRef<MuteFeedbackMode>('voice');
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  useEffect(() => {
    AsyncStorage.getItem(FEEDBACK_KEY).then(val => {
      if (val === 'voice' || val === 'beeps') {
        feedbackModeRef.current = val;
      }
    });
  }, []);

  const toggle = useCallback(() => {
    const connected = isConnected();
    const currentMuted = isMutedRef.current;
    appLog('Mute', `toggle() called — connected=${connected} isMuted=${currentMuted}`);

    if (!connected) {
      appLog('Mute', 'SKIPPED — not connected');
      return;
    }

    const willBeMuted = !currentMuted;
    appLog('Mute', `Playing feedback: willBeMuted=${willBeMuted} mode=${feedbackModeRef.current}`);

    try {
      if (Platform.OS === 'ios' && NativeModules.HapticManager) {
        willBeMuted ? NativeModules.HapticManager.singleTap() : NativeModules.HapticManager.doubleTap();
      } else {
        willBeMuted ? Vibration.vibrate(50) : Vibration.vibrate([0, 50, 100, 50]);
      }
    } catch {}

    // Create fresh Sound instance each time to avoid iOS double-play glitch
    try {
      const mode = feedbackModeRef.current;
      let name: SoundName;
      if (mode === 'voice') {
        name = willBeMuted ? 'voice_mute' : 'voice_unmute';
      } else {
        name = willBeMuted ? 'beep_single' : 'beep_double';
      }
      const s = new Sound(soundFile(name), Sound.MAIN_BUNDLE, (err) => {
        if (err) appLog('Sound', `Failed to load ${name}: ${err}`);
        else s.play(() => s.release());
      });
    } catch {}

    toggleMute();
    appLog('Mute', `toggleMute() done — new state will be muted=${willBeMuted}`);
  }, [toggleMute, isConnected]);

  return {isMuted, toggle};
}
