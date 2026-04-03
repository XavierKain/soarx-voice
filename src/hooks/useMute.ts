import {useCallback, useEffect, useRef} from 'react';
import {Vibration, Platform, NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Sound from 'react-native-sound';
import {useAgoraContext} from '../contexts/AgoraContext';
import {appLog} from '../utils/logger';

const FEEDBACK_KEY = '@soarx_mute_feedback';
export type MuteFeedbackMode = 'voice' | 'beeps';

function loadSound(name: string): Sound {
  return new Sound(name, Sound.MAIN_BUNDLE, (error) => {
    if (error) appLog('Sound', `Failed to load ${name}: ${error}`);
  });
}

const sounds = {
  voiceMute: loadSound('voice_mute.mp3'),
  voiceUnmute: loadSound('voice_unmute.mp3'),
  beepSingle: loadSound('beep_single.mp3'),
  beepDouble: loadSound('beep_double.mp3'),
};

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
      let fileName: string;
      if (mode === 'voice') {
        fileName = willBeMuted ? 'voice_mute.mp3' : 'voice_unmute.mp3';
      } else {
        fileName = willBeMuted ? 'beep_single.mp3' : 'beep_double.mp3';
      }
      const s = new Sound(fileName, Sound.MAIN_BUNDLE, (err) => {
        if (!err) s.play(() => s.release());
      });
    } catch {}

    toggleMute();
    appLog('Mute', `toggleMute() done — new state will be muted=${willBeMuted}`);
  }, [toggleMute, isConnected]);

  return {isMuted, toggle};
}
