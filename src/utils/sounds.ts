import {Platform} from 'react-native';

// react-native-sound resolves Android assets from res/raw by *resource name*,
// which cannot contain a dot. iOS resolves by full filename in the main bundle.
// Passing "voice_mute.mp3" on Android silently fails to load.
export type SoundName =
  | 'voice_mute'
  | 'voice_unmute'
  | 'beep_single'
  | 'beep_double'
  | 'inactivity_warning';

export function soundFile(name: SoundName): string {
  return Platform.OS === 'android' ? name : `${name}.mp3`;
}
