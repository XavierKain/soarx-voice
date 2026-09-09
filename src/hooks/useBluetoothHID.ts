import {useEffect, useRef} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';
import {appLog} from '../utils/logger';

const {BLEButtonManager, HIDModule} = NativeModules;

interface HIDEvent {
  source: string;
}

export function useBluetoothHID(onToggle: () => void) {
  // Use a ref so listeners are subscribed ONCE and always call the latest callback
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  // HID listener — subscribe once
  useEffect(() => {
    if (!HIDModule) {
      appLog('HID', 'HIDModule not available');
      return;
    }
    const emitter = new NativeEventEmitter(HIDModule);
    const subscription = emitter.addListener('onHIDToggle', (event: HIDEvent) => {
      appLog('HID', `onHIDToggle — source=${event.source}`);
      onToggleRef.current();
    });
    appLog('HID', 'Listener subscribed (stable)');
    return () => {
      appLog('HID', 'Listener unsubscribed');
      subscription.remove();
    };
  }, []); // empty deps — subscribe once

  // BLE listener — subscribe once
  useEffect(() => {
    if (!BLEButtonManager) return;
    const emitter = new NativeEventEmitter(BLEButtonManager);
    const subscription = emitter.addListener('onBLEToggle', (event: HIDEvent) => {
      appLog('BLE', `onBLEToggle — source=${event.source}`);
      onToggleRef.current();
    });
    appLog('BLE', 'Listener subscribed (stable)');
    return () => {
      appLog('BLE', 'Listener unsubscribed');
      subscription.remove();
    };
  }, []); // empty deps — subscribe once

  // Connect to whichever paired button the pilot brought today. Several can be
  // paired — one per wing — and only the one that is powered on will answer.
  useEffect(() => {
    if (!BLEButtonManager) return;
    if (BLEButtonManager.connectToAnySaved) {
      appLog('BLE', 'Looking for any paired button');
      BLEButtonManager.connectToAnySaved();
      return;
    }
    // Older native module: single saved button
    BLEButtonManager.getSavedDeviceUUID?.().then((uuid: string | null) => {
      if (uuid) {
        appLog('BLE', `Auto-reconnecting to ${uuid.substring(0, 8)}...`);
        BLEButtonManager.connectToDevice(uuid);
      }
    });
  }, []);
}
