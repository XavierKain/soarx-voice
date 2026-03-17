import {useCallback} from 'react';
import {Vibration, Platform} from 'react-native';
import {useAgoraContext} from '../contexts/AgoraContext';

/**
 * Hook gérant l'état muet avec retour haptique.
 * Durée de vibration adaptée selon la plateforme (iOS : 10ms, Android : 50ms).
 */
export function useMute() {
  const {isMuted, toggleMute} = useAgoraContext();

  const toggle = useCallback(() => {
    try {
      if (Platform.OS === 'ios') {
        Vibration.vibrate(10);
      } else {
        Vibration.vibrate(50);
      }
    } catch {}
    toggleMute();
  }, [toggleMute]);

  return {isMuted, toggle};
}
