import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  NativeModules,
  NativeEventEmitter,
  ActivityIndicator,
} from 'react-native';
import {colors, fonts, spacing} from '../theme';

const {BLEButtonManager} = NativeModules;

interface BLEDevice {
  name: string;
  uuid: string;
  rssi: number;
}

interface BLESetupScreenProps {
  onDone: () => void;
}

export function BLESetupScreen({onDone}: BLESetupScreenProps) {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [savedUUID, setSavedUUID] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);

  useEffect(() => {
    if (!BLEButtonManager) return;
    BLEButtonManager.getSavedDeviceUUID().then((uuid: string | null) => {
      setSavedUUID(uuid);
    });
  }, []);

  useEffect(() => {
    if (!BLEButtonManager) return;
    const emitter = new NativeEventEmitter(BLEButtonManager);

    const foundSub = emitter.addListener('onDeviceFound', (device: BLEDevice) => {
      setDevices(prev => {
        if (prev.some(d => d.uuid === device.uuid)) return prev;
        return [...prev, device];
      });
    });

    const connSub = emitter.addListener('onDeviceConnected', (data: {uuid: string; name: string}) => {
      setConnectedDevice(data.uuid);
      setConnectedName(data.name);
      setSavedUUID(data.uuid);
      setScanning(false);
      setShowScan(false);
      if (BLEButtonManager.stopScan) BLEButtonManager.stopScan();
    });

    const discSub = emitter.addListener('onDeviceDisconnected', () => {
      setConnectedDevice(null);
      setConnectedName(null);
    });

    return () => {
      foundSub.remove();
      connSub.remove();
      discSub.remove();
    };
  }, []);

  const startScan = useCallback(() => {
    if (!BLEButtonManager) return;
    setDevices([]);
    setScanning(true);
    BLEButtonManager.startScan();
    setTimeout(() => {
      setScanning(false);
      if (BLEButtonManager.stopScan) BLEButtonManager.stopScan();
    }, 10000);
  }, []);

  const connectDevice = useCallback((uuid: string) => {
    if (!BLEButtonManager) return;
    BLEButtonManager.connectToDevice(uuid);
  }, []);

  const disconnectDevice = useCallback(() => {
    if (!BLEButtonManager) return;
    BLEButtonManager.disconnectDevice();
    setConnectedDevice(null);
    setConnectedName(null);
    setSavedUUID(null);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Mute Button Setup</Text>
        <Text style={styles.subtitle}>
          Connect a BLE button to toggle mute during flight
        </Text>

        <View style={styles.howItWorks}>
          <Text style={styles.howItWorksTitle}>How it works</Text>
          <Text style={styles.howItWorksText}>
            Pair a Bluetooth Low Energy button (like an iTag tracker). Press it
            to toggle mute — works even with your screen locked and phone in
            your pocket.
          </Text>
        </View>

        {savedUUID && !showScan ? (
          <View style={styles.connectedBox}>
            <Text style={styles.connectedLabel}>Connected button</Text>
            <Text style={styles.connectedName}>{connectedName || 'Saved device'}</Text>
            <Text style={styles.connectedUUID}>{savedUUID.substring(0, 8)}...</Text>
            <View style={styles.connectedButtons}>
              <TouchableOpacity
                style={styles.changeButton}
                onPress={() => setShowScan(true)}
                activeOpacity={0.7}>
                <Text style={styles.changeButtonText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgetButton}
                onPress={disconnectDevice}
                activeOpacity={0.7}>
                <Text style={styles.forgetButtonText}>Forget</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            <TouchableOpacity
              style={[styles.scanButton, scanning && styles.scanButtonActive]}
              onPress={startScan}
              disabled={scanning}
              activeOpacity={0.7}>
              {scanning ? (
                <View style={styles.scanningRow}>
                  <ActivityIndicator color={colors.navy} size="small" />
                  <Text style={styles.scanButtonText}>  Scanning...</Text>
                </View>
              ) : (
                <Text style={styles.scanButtonText}>Scan for BLE Buttons</Text>
              )}
            </TouchableOpacity>

            {devices.length > 0 && (
              <View style={styles.deviceList}>
                {devices.map(device => (
                  <TouchableOpacity
                    key={device.uuid}
                    style={styles.deviceRow}
                    onPress={() => connectDevice(device.uuid)}
                    activeOpacity={0.7}>
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>{device.name}</Text>
                      <Text style={styles.deviceUUID}>{device.uuid.substring(0, 8)}...</Text>
                    </View>
                    <Text style={styles.deviceRSSI}>{device.rssi} dBm</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {scanning && devices.length === 0 && (
              <Text style={styles.scanHint}>
                Press the button on your device to make it discoverable...
              </Text>
            )}

            {showScan && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowScan(false)}
                activeOpacity={0.7}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>Compatible buttons</Text>
          <Text style={styles.tipText}>
            Any BLE device with a button that sends GATT notifications:{'\n'}
            - iTag Bluetooth trackers (~7 EUR){'\n'}
            - ESP32-based custom buttons{'\n'}
            - Any BLE button with FFE0/FFE1 service
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.doneButton}
        onPress={onDone}
        activeOpacity={0.7}>
        <Text style={styles.doneButtonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: fonts.title,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  howItWorks: {
    backgroundColor: 'rgba(0,188,212,0.1)',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,188,212,0.3)',
  },
  howItWorksTitle: {
    color: colors.cyan,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  howItWorksText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 20,
  },
  connectedBox: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.4)',
  },
  connectedLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  connectedName: {
    color: '#4CAF50',
    fontWeight: '700',
    fontSize: 18,
    marginTop: 4,
  },
  connectedUUID: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  connectedButtons: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  changeButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeButtonText: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: '600',
  },
  forgetButton: {
    backgroundColor: 'rgba(244,67,54,0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  forgetButtonText: {
    color: '#F44336',
    fontSize: 13,
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: colors.cyan,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scanButtonActive: {
    opacity: 0.7,
  },
  scanButtonText: {
    color: colors.navy,
    fontWeight: '700',
    fontSize: 15,
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceList: {
    marginTop: spacing.sm,
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  deviceUUID: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  deviceRSSI: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  scanHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  cancelButton: {
    alignItems: 'center',
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  tipBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  tipTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  tipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 22,
  },
  doneButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    marginHorizontal: spacing.lg,
  },
  doneButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
});
