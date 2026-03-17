import {useEffect} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

const {BLEButtonManager, HIDModule} = NativeModules;

interface HIDEvent {
  source: string;
}

export function useBluetoothHID(onToggle: () => void) {
  // Use only HIDModule listener (volume detection + headset media buttons)
  // BLEButtonManager uses a different event name to avoid double-fire
  useEffect(() => {
    if (!HIDModule) {
      console.warn('[HID] HIDModule not available');
      return;
    }
    const emitter = new NativeEventEmitter(HIDModule);
    const subscription = emitter.addListener('onHIDToggle', (_event: HIDEvent) => {
      onToggle();
    });
    return () => subscription.remove();
  }, [onToggle]);

  // BLE button events use a separate event name
  useEffect(() => {
    if (!BLEButtonManager) return;
    const emitter = new NativeEventEmitter(BLEButtonManager);
    const subscription = emitter.addListener('onBLEToggle', (_event: HIDEvent) => {
      onToggle();
    });
    return () => subscription.remove();
  }, [onToggle]);

  // Auto-reconnect to saved BLE device on mount
  useEffect(() => {
    if (!BLEButtonManager) return;
    BLEButtonManager.getSavedDeviceUUID().then((uuid: string | null) => {
      if (uuid) {
        BLEButtonManager.connectToDevice(uuid);
      }
    });
  }, []);
}
