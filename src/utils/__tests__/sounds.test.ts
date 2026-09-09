import {Platform} from 'react-native';
import {soundFile} from '../sounds';

describe('soundFile', () => {
  it('keeps the .mp3 extension on iOS (main bundle lookup)', () => {
    Platform.OS = 'ios';
    expect(soundFile('voice_mute')).toBe('voice_mute.mp3');
  });

  it('drops the extension on Android (res/raw resource name)', () => {
    Platform.OS = 'android';
    expect(soundFile('voice_mute')).toBe('voice_mute');
  });
});
