import {Platform} from 'react-native';
import RNCallKeep from 'react-native-callkeep';

const CALLKEEP_OPTIONS = {
  ios: {
    appName: 'SoarX Voice',
    supportsVideo: false,
    maximumCallGroups: 1,
    maximumCallsPerCallGroup: 1,
  },
  android: {
    alertTitle: 'Permissions Required',
    alertDescription: 'SoarX Voice needs permissions to manage calls.',
    cancelButton: 'Cancel',
    okButton: 'OK',
  },
};

let currentCallId: string | null = null;

export async function setupCallKit(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await RNCallKeep.setup(CALLKEEP_OPTIONS);
  } catch (error) {
    console.warn('[CallKit] Setup failed:', error);
  }
}

export function startCallKitSession(channelName: string): void {
  if (Platform.OS !== 'ios') return;
  currentCallId = generateUUID();
  RNCallKeep.startCall(currentCallId, channelName, `SoarX Voice - ${channelName}`, 'generic', false);
}

export function endCallKitSession(): void {
  if (Platform.OS !== 'ios' || !currentCallId) return;
  RNCallKeep.endCall(currentCallId);
  currentCallId = null;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
