import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
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

const SETUP_STEPS = [
  {
    number: '1',
    title: 'Pair your button',
    description:
      'Go to Settings > Bluetooth and pair your button (e.g. ZL-01). It should appear under "My Devices".',
  },
  {
    number: '2',
    title: 'Enable AssistiveTouch',
    description:
      'Go to Settings > Accessibility > Touch > AssistiveTouch and turn it on.',
  },
  {
    number: '3',
    title: 'Configure the button',
    description:
      'In AssistiveTouch > Devices, select your button > Customize Additional Buttons. Press the physical button, then choose the action "Single Tap".',
  },
  {
    number: '4',
    title: 'Triple-click shortcut',
    description:
      'Go to Settings > Accessibility > Accessibility Shortcut and check AssistiveTouch. Triple-click the side button to quickly toggle it on/off before each flight.',
  },
];

export function BLESetupScreen({onDone}: BLESetupScreenProps) {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [savedUUID, setSavedUUID] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);

  // Load saved device on mount
  useEffect(() => {
    if (!BLEButtonManager) return;
    BLEButtonManager.getSavedDeviceUUID().then((uuid: string | null) => {
      setSavedUUID(uuid);
    });
  }, []);

  // Listen for BLE events
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
      setSavedUUID(data.uuid);
      setScanning(false);
      if (BLEButtonManager.stopScan) BLEButtonManager.stopScan();
    });

    const discSub = emitter.addListener('onDeviceDisconnected', () => {
      setConnectedDevice(null);
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
    // Stop scan after 10s
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
    setSavedUUID(null);
  }, []);

  const openAccessibilitySettings = () => {
    Linking.openURL('App-Prefs:ACCESSIBILITY').catch(() => {
      Linking.openURL('app-settings:');
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Mute Button Setup</Text>
        <Text style={styles.subtitle}>
          Configure a Bluetooth button to toggle mute during flight
        </Text>

        {/* BLE Direct Connection Section */}
        <View style={styles.bleSection}>
          <Text style={styles.sectionTitle}>BLE Button (recommended)</Text>
          <Text style={styles.bleDescription}>
            Connect a BLE button (iTag, etc.) directly. Works with screen locked and in background.
          </Text>

          {savedUUID && !showScan ? (
            <View style={styles.connectedBox}>
              <Text style={styles.connectedText}>
                {connectedDevice ? 'Connected' : 'Saved device'}
              </Text>
              <Text style={styles.connectedUUID}>{savedUUID.substring(0, 8)}...</Text>
              <View style={styles.connectedButtons}>
                <TouchableOpacity
                  style={styles.scanButtonSmall}
                  onPress={() => setShowScan(true)}
                  activeOpacity={0.7}>
                  <Text style={styles.scanButtonSmallText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.disconnectButton}
                  onPress={disconnectDevice}
                  activeOpacity={0.7}>
                  <Text style={styles.disconnectButtonText}>Forget</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
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
                  Press the button on your iTag to make it discoverable...
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
            </>
          )}
        </View>

        {/* AssistiveTouch Section */}
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>AssistiveTouch (alternative)</Text>
        <Text style={styles.altDescription}>
          For buttons like ZL-01 that appear as pointer devices. Only works with screen on.
        </Text>

        {SETUP_STEPS.map(step => (
          <View key={step.number} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{step.number}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={openAccessibilitySettings}
          activeOpacity={0.7}>
          <Text style={styles.settingsButtonText}>
            Open Accessibility Settings
          </Text>
        </TouchableOpacity>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>Before flying</Text>
          <Text style={styles.tipText}>
            1. Triple-click the side button to enable AssistiveTouch{'\n'}
            2. Open SoarXVoice and join a channel{'\n'}
            3. Click your button to test mute toggle{'\n'}
            4. You're ready!
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
  bleSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: spacing.sm,
  },
  bleDescription: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  altDescription: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  connectedBox: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.4)',
  },
  connectedText: {
    color: '#4CAF50',
    fontWeight: '700',
    fontSize: 15,
  },
  connectedUUID: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 4,
  },
  connectedButtons: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  scanButtonSmall: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  scanButtonSmallText: {
    color: colors.cyan,
    fontSize: 13,
    fontWeight: '600',
  },
  disconnectButton: {
    backgroundColor: 'rgba(244,67,54,0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  disconnectButtonText: {
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
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  stepNumberText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '800',
    fontSize: 14,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 4,
  },
  stepDescription: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
  },
  settingsButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  settingsButtonText: {
    color: colors.cyan,
    fontWeight: '600',
    fontSize: 15,
  },
  tipBox: {
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  tipTitle: {
    color: '#4CAF50',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  tipText: {
    color: 'rgba(255,255,255,0.7)',
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
