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
  Share,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Sound from 'react-native-sound';
import {fonts, spacing, radius} from '../theme';
import {getLogs, clearLogs} from '../utils/logger';
import {useTheme} from '../contexts/ThemeContext';
import {soundFile} from '../utils/sounds';
import {APP_VERSION} from '../version';
import type {MuteFeedbackMode} from '../hooks/useMute';

const {BLEButtonManager} = NativeModules;
const FEEDBACK_KEY = '@soarx_mute_feedback';

interface BLEDevice {
  name: string;
  uuid: string;
  rssi: number;
}

interface SettingsScreenProps {
  onDone: () => void;
}

export function SettingsScreen({onDone}: SettingsScreenProps) {
  const {colors} = useTheme();

  // --- Debug ---
  const [logText, setLogText] = useState('');

  // --- Voice Announcements ---
  const [ttsEnabled, setTtsEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('@soarx_tts_enabled').then(val => {
      if (val !== null) setTtsEnabled(val !== 'false');
    });
  }, []);

  // --- Mute Feedback ---
  const [feedbackMode, setFeedbackMode] = useState<MuteFeedbackMode>('voice');

  useEffect(() => {
    AsyncStorage.getItem(FEEDBACK_KEY).then(val => {
      if (val === 'voice' || val === 'beeps') setFeedbackMode(val);
    });
  }, []);

  const changeFeedbackMode = useCallback((mode: MuteFeedbackMode) => {
    setFeedbackMode(mode);
    AsyncStorage.setItem(FEEDBACK_KEY, mode);
    // Preview sound
    const soundName = soundFile(mode === 'voice' ? 'voice_unmute' : 'beep_double');
    const preview = new Sound(soundName, Sound.MAIN_BUNDLE, (err) => {
      if (!err) preview.play(() => preview.release());
    });
  }, []);

  // --- BLE ---
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [, setConnectedDevice] = useState<string | null>(null);
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

        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onDone} activeOpacity={0.7} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, {color: colors.textSecondary}]}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.title, {color: colors.text}]}>Settings</Text>
          <View style={styles.closeButton} />
        </View>

        {/* --- Mute Feedback Section --- */}
        <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>MUTE FEEDBACK</Text>
        <View style={[styles.card, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder}]}>
          <Text style={[styles.cardDescription, {color: colors.textSecondary}]}>
            Audio feedback when you mute/unmute (plays in your earpiece)
          </Text>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                {borderColor: colors.cardBorder},
                feedbackMode === 'voice' && {backgroundColor: colors.primary, borderColor: colors.primary},
              ]}
              onPress={() => changeFeedbackMode('voice')}
              activeOpacity={0.7}>
              <Text style={[
                styles.segmentText,
                {color: colors.textSecondary},
                feedbackMode === 'voice' && {color: '#FFFFFF'},
              ]}>Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                {borderColor: colors.cardBorder},
                feedbackMode === 'beeps' && {backgroundColor: colors.primary, borderColor: colors.primary},
              ]}
              onPress={() => changeFeedbackMode('beeps')}
              activeOpacity={0.7}>
              <Text style={[
                styles.segmentText,
                {color: colors.textSecondary},
                feedbackMode === 'beeps' && {color: '#FFFFFF'},
              ]}>Beeps</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* --- Voice Announcements Section --- */}
        <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>VOICE ANNOUNCEMENTS</Text>
        <View style={[styles.card, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder}]}>
          <View style={styles.toggleRow}>
            <View style={{flex: 1}}>
              <Text style={[styles.toggleLabel, {color: colors.text}]}>Pilot joined / left</Text>
              <Text style={[styles.toggleHint, {color: colors.textMuted}]}>Announce when pilots connect or disconnect</Text>
            </View>
            <Switch
              value={ttsEnabled}
              onValueChange={(val) => {
                setTtsEnabled(val);
                AsyncStorage.setItem('@soarx_tts_enabled', String(val));
              }}
              trackColor={{false: colors.cardBorder, true: colors.primary}}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* --- Bluetooth Button Section --- */}
        <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>BLUETOOTH BUTTON</Text>
        <View style={[styles.card, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder}]}>
          <Text style={[styles.cardDescription, {color: colors.textSecondary}]}>
            Connect a BLE button to toggle mute during flight — works with screen locked
          </Text>

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
                      style={[styles.deviceRow, {backgroundColor: colors.bg, borderColor: colors.cardBorder, borderWidth: 1}]}
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

          <View style={[styles.tipBox, {borderColor: colors.cardBorder}]}>
            <Text style={[styles.tipTitle, {color: colors.text}]}>Compatible buttons</Text>
            <Text style={[styles.tipText, {color: colors.textSecondary}]}>
              iTag Bluetooth trackers (~7 EUR), ESP32 custom buttons, or any BLE device with FFE0/FFE1 service
            </Text>
          </View>
        </View>

        {/* --- About Section --- */}
        <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>ABOUT</Text>
        <View style={[styles.card, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder}]}>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, {color: colors.textSecondary}]}>Version</Text>
            <Text style={[styles.aboutValue, {color: colors.text}]}>{APP_VERSION}</Text>
          </View>
        </View>

        {/* --- Debug Logs Section --- */}
        <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>DEBUG LOGS</Text>
        <View style={[styles.card, {backgroundColor: colors.bgCard, borderColor: colors.cardBorder}]}>
          <TouchableOpacity
            style={[styles.scanButton, {backgroundColor: colors.primary}]}
            onPress={() => setLogText(getLogs().join('\n') || 'No logs yet')}
            activeOpacity={0.7}>
            <Text style={[styles.scanButtonText, {color: colors.bg}]}>Refresh Logs</Text>
          </TouchableOpacity>
          <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
            <TouchableOpacity
              style={[styles.changeButton, {backgroundColor: colors.cardBorder, flex: 1}]}
              onPress={() => {
                const text = getLogs().join('\n');
                Share.share({message: text});
              }}
              activeOpacity={0.7}>
              <Text style={[styles.changeButtonText, {color: colors.primary, textAlign: 'center'}]}>Share Logs</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.changeButton, {backgroundColor: colors.cardBorder, flex: 1}]}
              onPress={() => { clearLogs(); setLogText('Logs cleared'); }}
              activeOpacity={0.7}>
              <Text style={[styles.changeButtonText, {color: colors.primary, textAlign: 'center'}]}>Clear</Text>
            </TouchableOpacity>
          </View>
          {logText ? (
            <ScrollView style={{maxHeight: 300, marginTop: 12}} nestedScrollEnabled>
              <Text style={{color: colors.text, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'}}>{logText}</Text>
            </ScrollView>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.backButton, {backgroundColor: 'rgba(239, 68, 68, 0.10)', borderColor: 'rgba(239, 68, 68, 0.25)'}]}
          onPress={onDone}
          activeOpacity={0.7}>
          <Text style={[styles.backButtonText, {color: '#EF4444'}]}>Back</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: fonts.title,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: fonts.label,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.md,
  },

  // Segmented control
  segmentedControl: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentText: {
    fontWeight: '600',
    fontSize: 15,
  },

  // BLE
  connectedBox: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  connectedLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  connectedName: {
    fontWeight: '700',
    fontSize: 18,
    marginTop: 4,
  },
  connectedUUID: {
    fontSize: 12,
    marginTop: 2,
  },
  connectedButtons: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  changeButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  forgetButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  forgetButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scanButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scanButtonActive: {
    opacity: 0.7,
  },
  scanButtonText: {
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
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontWeight: '600',
    fontSize: 15,
  },
  deviceUUID: {
    fontSize: 11,
    marginTop: 2,
  },
  deviceRSSI: {
    fontSize: 12,
  },
  scanHint: {
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
    fontSize: 14,
  },
  tipBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  tipTitle: {
    fontWeight: '700',
    fontSize: 15,
    marginBottom: spacing.xs,
  },
  tipText: {
    fontSize: 13,
    lineHeight: 22,
  },

  // About
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleHint: {
    fontSize: 12,
    marginTop: 2,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutLabel: {
    fontSize: 15,
  },
  aboutValue: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 22,
    fontWeight: '300',
  },

  // Back button
  backButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
