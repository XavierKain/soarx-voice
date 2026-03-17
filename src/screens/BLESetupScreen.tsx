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
import {colors as defaultColors, fonts, spacing} from '../theme';
import {useTheme} from '../contexts/ThemeContext';

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
  const {colors} = useTheme();
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
    <View style={[styles.container, {backgroundColor: colors.bg}]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, {color: colors.text}]}>Mute Button Setup</Text>
        <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
          Connect a BLE button to toggle mute during flight
        </Text>

        <View style={[styles.howItWorks, {backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder}]}>
          <Text style={[styles.howItWorksTitle, {color: colors.primary}]}>How it works</Text>
          <Text style={[styles.howItWorksText, {color: colors.textSecondary}]}>
            Pair a Bluetooth Low Energy button (like an iTag tracker). Press it
            to toggle mute — works even with your screen locked and phone in
            your pocket.
          </Text>
        </View>

        {savedUUID && !showScan ? (
          <View style={[styles.connectedBox, {backgroundColor: colors.greenLight, borderColor: colors.green + '66'}]}>
            <Text style={[styles.connectedLabel, {color: colors.textMuted}]}>Connected button</Text>
            <Text style={[styles.connectedName, {color: colors.green}]}>{connectedName || 'Saved device'}</Text>
            <Text style={[styles.connectedUUID, {color: colors.textMuted}]}>{savedUUID.substring(0, 8)}...</Text>
            <View style={styles.connectedButtons}>
              <TouchableOpacity
                style={[styles.changeButton, {backgroundColor: colors.cardBorder}]}
                onPress={() => setShowScan(true)}
                activeOpacity={0.7}>
                <Text style={[styles.changeButtonText, {color: colors.primary}]}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.forgetButton, {backgroundColor: colors.redLight}]}
                onPress={disconnectDevice}
                activeOpacity={0.7}>
                <Text style={[styles.forgetButtonText, {color: colors.red}]}>Forget</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View>
            <TouchableOpacity
              style={[styles.scanButton, {backgroundColor: colors.primary}, scanning && styles.scanButtonActive]}
              onPress={startScan}
              disabled={scanning}
              activeOpacity={0.7}>
              {scanning ? (
                <View style={styles.scanningRow}>
                  <ActivityIndicator color={colors.bg} size="small" />
                  <Text style={[styles.scanButtonText, {color: colors.bg}]}>  Scanning...</Text>
                </View>
              ) : (
                <Text style={[styles.scanButtonText, {color: colors.bg}]}>Scan for BLE Buttons</Text>
              )}
            </TouchableOpacity>

            {devices.length > 0 && (
              <View style={styles.deviceList}>
                {devices.map(device => (
                  <TouchableOpacity
                    key={device.uuid}
                    style={[styles.deviceRow, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder, borderWidth: 1}]}
                    onPress={() => connectDevice(device.uuid)}
                    activeOpacity={0.7}>
                    <View style={styles.deviceInfo}>
                      <Text style={[styles.deviceName, {color: colors.text}]}>{device.name}</Text>
                      <Text style={[styles.deviceUUID, {color: colors.textMuted}]}>{device.uuid.substring(0, 8)}...</Text>
                    </View>
                    <Text style={[styles.deviceRSSI, {color: colors.textMuted}]}>{device.rssi} dBm</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {scanning && devices.length === 0 && (
              <Text style={[styles.scanHint, {color: colors.textMuted}]}>
                Press the button on your device to make it discoverable...
              </Text>
            )}

            {showScan && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowScan(false)}
                activeOpacity={0.7}>
                <Text style={[styles.cancelButtonText, {color: colors.textMuted}]}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={[styles.tipBox, {backgroundColor: colors.greenLight, borderColor: colors.cardBorder, borderWidth: 1}]}>
          <Text style={[styles.tipTitle, {color: colors.text}]}>Compatible buttons</Text>
          <Text style={[styles.tipText, {color: colors.textSecondary}]}>
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
        <Text style={[styles.doneButtonText, {color: colors.textSecondary}]}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: defaultColors.bg,
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
    color: defaultColors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: defaultColors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  howItWorks: {
    backgroundColor: defaultColors.primaryLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: defaultColors.primaryBorder,
  },
  howItWorksTitle: {
    color: defaultColors.primary,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  howItWorksText: {
    color: defaultColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  connectedBox: {
    backgroundColor: defaultColors.greenLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: defaultColors.green,
  },
  connectedLabel: {
    color: defaultColors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  connectedName: {
    color: defaultColors.green,
    fontWeight: '700',
    fontSize: 18,
    marginTop: 4,
  },
  connectedUUID: {
    color: defaultColors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  connectedButtons: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  changeButton: {
    backgroundColor: defaultColors.cardBorder,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeButtonText: {
    color: defaultColors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  forgetButton: {
    backgroundColor: defaultColors.redLight,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  forgetButtonText: {
    color: defaultColors.red,
    fontSize: 13,
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: defaultColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scanButtonActive: {
    opacity: 0.7,
  },
  scanButtonText: {
    color: defaultColors.bg,
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
    backgroundColor: defaultColors.bgCard,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: defaultColors.text,
    fontWeight: '600',
    fontSize: 15,
  },
  deviceUUID: {
    color: defaultColors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  deviceRSSI: {
    color: defaultColors.textMuted,
    fontSize: 12,
  },
  scanHint: {
    color: defaultColors.textMuted,
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
    color: defaultColors.textMuted,
    fontSize: 14,
  },
  tipBox: {
    backgroundColor: defaultColors.greenLight,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  tipTitle: {
    color: defaultColors.text,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  tipText: {
    color: defaultColors.textSecondary,
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
    color: defaultColors.textSecondary,
    fontSize: 16,
  },
});
