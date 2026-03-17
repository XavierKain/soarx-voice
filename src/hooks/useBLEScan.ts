import {useState, useEffect, useCallback} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

const {BLEButtonManager} = NativeModules;

export interface BLEDevice {
  name: string;
  uuid: string;
  rssi: number;
}

export function useBLEScan() {
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedUUID, setConnectedUUID] = useState<string | null>(null);

  useEffect(() => {
    if (!BLEButtonManager) return;

    const emitter = new NativeEventEmitter(BLEButtonManager);

    const subs = [
      emitter.addListener('onDeviceFound', (device: BLEDevice) => {
        setDevices(prev => {
          const exists = prev.find(d => d.uuid === device.uuid);
          if (exists) {
            return prev.map(d => (d.uuid === device.uuid ? device : d));
          }
          return [...prev, device];
        });
      }),
      emitter.addListener('onDeviceConnected', ({uuid}: {uuid: string}) => {
        setConnectedUUID(uuid);
        setIsScanning(false);
      }),
      emitter.addListener('onDeviceDisconnected', () => {
        setConnectedUUID(null);
      }),
    ];

    // Check if already connected
    BLEButtonManager.getSavedDeviceUUID().then((uuid: string | null) => {
      if (uuid) setConnectedUUID(uuid);
    });

    return () => subs.forEach(s => s.remove());
  }, []);

  const startScan = useCallback(() => {
    if (!BLEButtonManager) return;
    setDevices([]);
    setIsScanning(true);
    BLEButtonManager.startScan();
    // Auto-stop after 15s
    setTimeout(() => {
      BLEButtonManager.stopScan();
      setIsScanning(false);
    }, 15000);
  }, []);

  const stopScan = useCallback(() => {
    if (!BLEButtonManager) return;
    BLEButtonManager.stopScan();
    setIsScanning(false);
  }, []);

  const connectToDevice = useCallback((uuid: string) => {
    if (!BLEButtonManager) return;
    BLEButtonManager.connectToDevice(uuid);
  }, []);

  const disconnectDevice = useCallback(() => {
    if (!BLEButtonManager) return;
    BLEButtonManager.disconnectDevice();
    setConnectedUUID(null);
  }, []);

  return {devices, isScanning, connectedUUID, startScan, stopScan, connectToDevice, disconnectDevice};
}
