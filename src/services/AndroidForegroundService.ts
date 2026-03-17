import {Platform, NativeModules} from 'react-native';

const {ForegroundServiceModule} = NativeModules;

export function startForegroundService(channelName: string): void {
  if (Platform.OS !== 'android' || !ForegroundServiceModule) return;
  ForegroundServiceModule.startService(channelName);
}

export function stopForegroundService(): void {
  if (Platform.OS !== 'android' || !ForegroundServiceModule) return;
  ForegroundServiceModule.stopService();
}

export function updateForegroundMuteStatus(isMuted: boolean, channelName: string): void {
  if (Platform.OS !== 'android' || !ForegroundServiceModule) return;
  ForegroundServiceModule.updateMuteStatus(isMuted, channelName);
}
