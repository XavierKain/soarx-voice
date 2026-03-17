# BLE Button via CoreBluetooth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace volume-based Bluetooth button detection with direct CoreBluetooth BLE connection to selfie remotes, enabling mute/unmute toggle without affecting system volume.

**Architecture:** Native Swift module `BLEButtonManager` uses CoreBluetooth to scan, connect, and subscribe to BLE device notifications. A new BLE setup screen lets users discover and pair devices. The existing `useBluetoothHID` hook is updated to use the new module while keeping the same `onHIDToggle` event interface so VoiceScreen requires no changes.

**Tech Stack:** CoreBluetooth (iOS), React Native NativeModules/NativeEventEmitter, AsyncStorage for device persistence.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `ios/BLEButtonManager.swift` | CoreBluetooth scan/connect/notify logic |
| Create | `ios/BLEButtonManager.m` | Objective-C bridge for React Native |
| Create | `src/hooks/useBLEScan.ts` | Hook wrapping BLE scan/connect for setup screen |
| Create | `src/screens/BLESetupScreen.tsx` | UI for discovering and connecting BLE devices |
| Modify | `ios/SoarXVoice/Info.plist` | Add NSBluetoothAlwaysUsageDescription |
| Modify | `src/hooks/useBluetoothHID.ts` | Switch from HIDModule to BLEButtonManager |
| Modify | `App.tsx` | Add 'bleSetup' screen to navigation state |
| Modify | `src/screens/HomeScreen.tsx` | Add BLE setup button |
| Modify | `ios/SoarXVoice/AppDelegate.swift` | Remove pressesBegan override |
| Sync | `ios/SoarXVoice/BLEButtonManager.swift` | Copy from ios/ root (Xcode compiles root) |
| Sync | `ios/SoarXVoice/BLEButtonManager.m` | Copy from ios/ root |

**Note:** Xcode compiles files from `ios/` root. Files in `ios/SoarXVoice/` are copies for project organization. After creating files at root, they must be added to Xcode project manually and copied to subfolder.

---

## Chunk 1: Native BLE Module

### Task 1: Add Bluetooth permission to Info.plist

**Files:**
- Modify: `ios/SoarXVoice/Info.plist`

- [ ] **Step 1: Add NSBluetoothAlwaysUsageDescription**

Add before the closing `</dict>`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>SoarX Voice utilise le Bluetooth pour connecter vos boutons de commande mute/unmute.</string>
```

- [ ] **Step 2: Commit**

```bash
git add ios/SoarXVoice/Info.plist
git commit -m "feat(ios): add Bluetooth usage description for CoreBluetooth"
```

---

### Task 2: Create BLEButtonManager native module

**Files:**
- Create: `ios/BLEButtonManager.swift`
- Create: `ios/BLEButtonManager.m`

- [ ] **Step 1: Create the Objective-C bridge file**

Create `ios/BLEButtonManager.m`:

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(BLEButtonManager, RCTEventEmitter)

RCT_EXTERN_METHOD(startScan)
RCT_EXTERN_METHOD(stopScan)
RCT_EXTERN_METHOD(connectToDevice:(NSString *)uuid)
RCT_EXTERN_METHOD(disconnectDevice)
RCT_EXTERN_METHOD(getSavedDeviceUUID:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
```

- [ ] **Step 2: Create the Swift implementation**

Create `ios/BLEButtonManager.swift`:

```swift
import Foundation
import CoreBluetooth
import React

@objc(BLEButtonManager)
class BLEButtonManager: RCTEventEmitter, CBCentralManagerDelegate, CBPeripheralDelegate {

  private var centralManager: CBCentralManager?
  private var connectedPeripheral: CBPeripheral?
  private var discoveredPeripherals: [UUID: CBPeripheral] = [:]
  private var hasListeners = false
  private var lastToggleTime: TimeInterval = 0
  private let savedDeviceKey = "BLEButtonDeviceUUID"

  override init() {
    super.init()
    centralManager = CBCentralManager(delegate: self, queue: nil)
    NSLog("[BLE] Module initialized")
  }

  override func supportedEvents() -> [String]! {
    return ["onDeviceFound", "onDeviceConnected", "onDeviceDisconnected", "onHIDToggle", "onBLEState"]
  }

  override func startObserving() {
    hasListeners = true
    NSLog("[BLE] JS listeners attached")
  }

  override func stopObserving() {
    hasListeners = false
    NSLog("[BLE] JS listeners detached")
  }

  @objc override static func requiresMainQueueSetup() -> Bool { return true }

  // MARK: - JS Methods

  @objc func startScan() {
    guard let cm = centralManager, cm.state == .poweredOn else {
      NSLog("[BLE] Cannot scan - Bluetooth not ready (state: \(centralManager?.state.rawValue ?? -1))")
      return
    }
    discoveredPeripherals.removeAll()
    cm.scanForPeripherals(withServices: nil, options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: false
    ])
    NSLog("[BLE] Scanning started")
  }

  @objc func stopScan() {
    centralManager?.stopScan()
    NSLog("[BLE] Scanning stopped")
  }

  @objc func connectToDevice(_ uuid: String) {
    guard let deviceUUID = UUID(uuidString: uuid) else {
      NSLog("[BLE] Invalid UUID: \(uuid)")
      return
    }
    guard let peripheral = discoveredPeripherals[deviceUUID] else {
      // Try to retrieve known peripheral for auto-reconnect
      let peripherals = centralManager?.retrievePeripherals(withIdentifiers: [deviceUUID]) ?? []
      if let peripheral = peripherals.first {
        NSLog("[BLE] Retrieved known peripheral: \(peripheral.name ?? "unknown")")
        self.discoveredPeripherals[deviceUUID] = peripheral
        peripheral.delegate = self
        centralManager?.connect(peripheral, options: nil)
      } else {
        NSLog("[BLE] Device not found: \(uuid)")
      }
      return
    }
    NSLog("[BLE] Connecting to: \(peripheral.name ?? "unknown") (\(uuid))")
    peripheral.delegate = self
    centralManager?.connect(peripheral, options: nil)
  }

  @objc func disconnectDevice() {
    if let peripheral = connectedPeripheral {
      centralManager?.cancelPeripheralConnection(peripheral)
      NSLog("[BLE] Disconnecting from: \(peripheral.name ?? "unknown")")
    }
    UserDefaults.standard.removeObject(forKey: savedDeviceKey)
  }

  @objc func getSavedDeviceUUID(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let uuid = UserDefaults.standard.string(forKey: savedDeviceKey)
    resolve(uuid)
  }

  // MARK: - CBCentralManagerDelegate

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    NSLog("[BLE] Central state: \(central.state.rawValue)")
    if hasListeners {
      sendEvent(withName: "onBLEState", body: ["state": central.state.rawValue])
    }
    // Auto-reconnect if we have a saved device
    if central.state == .poweredOn {
      if let savedUUID = UserDefaults.standard.string(forKey: savedDeviceKey) {
        NSLog("[BLE] Auto-reconnecting to saved device: \(savedUUID)")
        connectToDevice(savedUUID)
      }
    }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                       advertisementData: [String: Any], rssi RSSI: NSNumber) {
    // Only report devices with a name
    guard let name = peripheral.name, !name.isEmpty else { return }

    let uuid = peripheral.identifier.uuidString
    discoveredPeripherals[peripheral.identifier] = peripheral

    NSLog("[BLE] Found: \(name) (\(uuid)) RSSI=\(RSSI)")

    if hasListeners {
      sendEvent(withName: "onDeviceFound", body: [
        "name": name,
        "uuid": uuid,
        "rssi": RSSI.intValue
      ])
    }
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    NSLog("[BLE] Connected to: \(peripheral.name ?? "unknown")")
    connectedPeripheral = peripheral
    stopScan()

    // Save for auto-reconnect
    let uuid = peripheral.identifier.uuidString
    UserDefaults.standard.set(uuid, forKey: savedDeviceKey)

    if hasListeners {
      sendEvent(withName: "onDeviceConnected", body: ["uuid": uuid, "name": peripheral.name ?? ""])
    }

    // Discover all services
    peripheral.discoverServices(nil)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    NSLog("[BLE] Failed to connect: \(error?.localizedDescription ?? "unknown")")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    NSLog("[BLE] Disconnected from: \(peripheral.name ?? "unknown")")
    let uuid = peripheral.identifier.uuidString

    if hasListeners {
      sendEvent(withName: "onDeviceDisconnected", body: ["uuid": uuid])
    }

    connectedPeripheral = nil

    // Auto-reconnect if we have a saved device
    if let savedUUID = UserDefaults.standard.string(forKey: savedDeviceKey),
       savedUUID == uuid {
      NSLog("[BLE] Will auto-reconnect in 1s...")
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
        self?.connectToDevice(savedUUID)
      }
    }
  }

  // MARK: - CBPeripheralDelegate

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let services = peripheral.services else {
      NSLog("[BLE] No services found")
      return
    }
    NSLog("[BLE] Found \(services.count) services:")
    for service in services {
      NSLog("[BLE]   Service: \(service.uuid)")
      peripheral.discoverCharacteristics(nil, for: service)
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let characteristics = service.characteristics else { return }

    NSLog("[BLE] Service \(service.uuid) has \(characteristics.count) characteristics:")
    for char in characteristics {
      let props = describeProperties(char.properties)
      NSLog("[BLE]     Char: \(char.uuid) props=[\(props)]")

      // Subscribe to any characteristic that supports notifications
      if char.properties.contains(.notify) || char.properties.contains(.indicate) {
        peripheral.setNotifyValue(true, for: char)
        NSLog("[BLE]     -> Subscribed to notifications")
      }
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      NSLog("[BLE] Characteristic \(characteristic.uuid) error: \(error.localizedDescription)")
      return
    }

    let hexValue = characteristic.value?.map { String(format: "%02x", $0) }.joined() ?? "nil"
    NSLog("[BLE] Characteristic \(characteristic.uuid) value changed: \(hexValue)")

    // Debounce: ignore events within 500ms
    let now = Date().timeIntervalSince1970
    if now - lastToggleTime < 0.5 {
      NSLog("[BLE] Debounced (too fast)")
      return
    }
    lastToggleTime = now

    // Emit toggle event
    if hasListeners {
      sendEvent(withName: "onHIDToggle", body: [
        "source": "ble-\(characteristic.uuid)",
        "value": hexValue
      ])
      NSLog("[BLE] Toggle emitted from characteristic \(characteristic.uuid)")
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      NSLog("[BLE] Notification state error for \(characteristic.uuid): \(error.localizedDescription)")
    } else {
      NSLog("[BLE] Notifications \(characteristic.isNotifying ? "ON" : "OFF") for \(characteristic.uuid)")
    }
  }

  // MARK: - Helpers

  private func describeProperties(_ props: CBCharacteristicProperties) -> String {
    var desc: [String] = []
    if props.contains(.read) { desc.append("read") }
    if props.contains(.write) { desc.append("write") }
    if props.contains(.writeWithoutResponse) { desc.append("writeNoResp") }
    if props.contains(.notify) { desc.append("notify") }
    if props.contains(.indicate) { desc.append("indicate") }
    if props.contains(.broadcast) { desc.append("broadcast") }
    return desc.joined(separator: ", ")
  }
}
```

- [ ] **Step 3: Copy files to SoarXVoice subfolder**

```bash
cp ios/BLEButtonManager.swift ios/SoarXVoice/BLEButtonManager.swift
cp ios/BLEButtonManager.m ios/SoarXVoice/BLEButtonManager.m
```

- [ ] **Step 4: Add files to Xcode project**

Open Xcode → right-click on the SoarXVoice group in the project navigator → "Add Files to SoarXVoice" → select `ios/BLEButtonManager.swift` and `ios/BLEButtonManager.m` → check "SoarXVoice" target → Add.

**IMPORTANT:** The user must do this step manually in Xcode since `project.pbxproj` is complex to edit programmatically.

- [ ] **Step 5: Commit**

```bash
git add ios/BLEButtonManager.swift ios/BLEButtonManager.m ios/SoarXVoice/BLEButtonManager.swift ios/SoarXVoice/BLEButtonManager.m
git commit -m "feat(ios): add BLEButtonManager CoreBluetooth native module"
```

---

### Task 3: Clean up AppDelegate and old HIDModule

**Files:**
- Modify: `ios/SoarXVoice/AppDelegate.swift`
- Modify: `ios/HIDModule.swift` (simplify, remove volume hack)

- [ ] **Step 1: Remove pressesBegan from AppDelegate**

In `ios/SoarXVoice/AppDelegate.swift`, remove the `pressesBegan` override and `import GameController`:

Revert AppDelegate to:

```swift
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "SoarXVoice",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
```

- [ ] **Step 2: Simplify HIDModule.swift**

Replace `ios/HIDModule.swift` with a minimal version that keeps MPRemoteCommandCenter for headset buttons but removes all volume hacks:

```swift
import Foundation
import MediaPlayer
import React

@objc(HIDModule)
class HIDModule: RCTEventEmitter {
  private var hasListeners = false

  override init() {
    super.init()
    setupRemoteCommandCenter()
    NSLog("[HID] Module initialized (headset-only mode)")
  }

  override func supportedEvents() -> [String]! {
    return ["onHIDToggle"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  private func setupRemoteCommandCenter() {
    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-togglePlayPause")
      return .success
    }
    commandCenter.playCommand.isEnabled = true
    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-play")
      return .success
    }
    commandCenter.pauseCommand.isEnabled = true
    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.emitToggle(source: "remoteCommand-pause")
      return .success
    }
  }

  private func emitToggle(source: String) {
    if hasListeners {
      sendEvent(withName: "onHIDToggle", body: ["source": source])
    }
  }

  @objc override static func requiresMainQueueSetup() -> Bool { return true }
}
```

- [ ] **Step 3: Sync files**

```bash
cp ios/HIDModule.swift ios/SoarXVoice/HIDModule.swift
```

- [ ] **Step 4: Commit**

```bash
git add ios/SoarXVoice/AppDelegate.swift ios/HIDModule.swift ios/SoarXVoice/HIDModule.swift
git commit -m "refactor(ios): simplify HIDModule, remove volume hack and pressesBegan"
```

---

## Chunk 2: JavaScript Hooks and UI

### Task 4: Update useBluetoothHID hook

**Files:**
- Modify: `src/hooks/useBluetoothHID.ts`

- [ ] **Step 1: Update hook to use BLEButtonManager**

Replace `src/hooks/useBluetoothHID.ts`:

```typescript
import {useEffect} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

const {BLEButtonManager, HIDModule} = NativeModules;

interface HIDEvent {
  source: string;
}

export function useBluetoothHID(onToggle: () => void) {
  useEffect(() => {
    const subscriptions: Array<{remove: () => void}> = [];

    // Listen to BLE button events (primary)
    if (BLEButtonManager) {
      const bleEmitter = new NativeEventEmitter(BLEButtonManager);
      subscriptions.push(
        bleEmitter.addListener('onHIDToggle', (_event: HIDEvent) => {
          onToggle();
        }),
      );
    }

    // Also listen to HIDModule for headset play/pause buttons (fallback)
    if (HIDModule) {
      const hidEmitter = new NativeEventEmitter(HIDModule);
      subscriptions.push(
        hidEmitter.addListener('onHIDToggle', (_event: HIDEvent) => {
          onToggle();
        }),
      );
    }

    if (subscriptions.length === 0) {
      console.warn('[BLE] No Bluetooth modules available');
    }

    return () => {
      subscriptions.forEach(sub => sub.remove());
    };
  }, [onToggle]);

  // Auto-reconnect to saved BLE device
  useEffect(() => {
    if (!BLEButtonManager) return;
    BLEButtonManager.getSavedDeviceUUID().then((uuid: string | null) => {
      if (uuid) {
        console.log('[BLE] Auto-reconnecting to saved device:', uuid);
        BLEButtonManager.connectToDevice(uuid);
      }
    });
  }, []);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBluetoothHID.ts
git commit -m "feat: update useBluetoothHID to use BLEButtonManager with HIDModule fallback"
```

---

### Task 5: Create useBLEScan hook

**Files:**
- Create: `src/hooks/useBLEScan.ts`

- [ ] **Step 1: Create the hook**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useBLEScan.ts
git commit -m "feat: add useBLEScan hook for BLE device discovery"
```

---

### Task 6: Create BLESetupScreen

**Files:**
- Create: `src/screens/BLESetupScreen.tsx`

- [ ] **Step 1: Create the screen**

```tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useBLEScan, BLEDevice} from '../hooks/useBLEScan';
import {COLORS, FONTS, SPACING} from '../theme';

interface BLESetupScreenProps {
  onDone: () => void;
}

export function BLESetupScreen({onDone}: BLESetupScreenProps) {
  const insets = useSafeAreaInsets();
  const {devices, isScanning, connectedUUID, startScan, stopScan, connectToDevice, disconnectDevice} = useBLEScan();

  const renderDevice = ({item}: {item: BLEDevice}) => {
    const isConnected = item.uuid === connectedUUID;
    return (
      <TouchableOpacity
        style={[styles.deviceRow, isConnected && styles.deviceRowConnected]}
        onPress={() => isConnected ? disconnectDevice() : connectToDevice(item.uuid)}
        activeOpacity={0.7}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
          <Text style={styles.deviceRssi}>Signal: {item.rssi} dBm</Text>
        </View>
        <Text style={[styles.deviceStatus, isConnected && styles.deviceStatusConnected]}>
          {isConnected ? 'CONNECTE' : 'CONNECTER'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, {paddingTop: insets.top + SPACING.md}]}>
      <Text style={styles.title}>Bouton Bluetooth</Text>
      <Text style={styles.subtitle}>
        Associez un bouton BLE pour le mute/unmute
      </Text>

      {connectedUUID ? (
        <View style={styles.connectedBanner}>
          <Text style={styles.connectedText}>Bouton connecte</Text>
          <TouchableOpacity onPress={disconnectDevice}>
            <Text style={styles.disconnectText}>Deconnecter</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.scanButton, isScanning && styles.scanButtonActive]}
        onPress={isScanning ? stopScan : startScan}
        activeOpacity={0.7}>
        {isScanning ? (
          <ActivityIndicator color={COLORS.navy} size="small" />
        ) : null}
        <Text style={styles.scanButtonText}>
          {isScanning ? 'Recherche en cours...' : 'Rechercher des appareils'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={item => item.uuid}
        renderItem={renderDevice}
        style={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isScanning
              ? 'Appuyez sur votre bouton Bluetooth pour le rendre visible...'
              : 'Appuyez sur Rechercher pour scanner'}
          </Text>
        }
      />

      <TouchableOpacity
        style={styles.doneButton}
        onPress={onDone}
        activeOpacity={0.7}>
        <Text style={styles.doneButtonText}>Retour</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
    paddingHorizontal: SPACING.lg,
  },
  title: {
    fontSize: FONTS.title,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  connectedBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,188,212,0.15)',
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.cyan,
  },
  connectedText: {
    color: COLORS.cyan,
    fontWeight: '600',
    fontSize: 16,
  },
  disconnectText: {
    color: COLORS.red,
    fontSize: 14,
  },
  scanButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.cyan,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
  },
  scanButtonActive: {
    backgroundColor: 'rgba(0,188,212,0.3)',
  },
  scanButtonText: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 16,
  },
  list: {
    flex: 1,
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  deviceRowConnected: {
    borderWidth: 1,
    borderColor: COLORS.cyan,
    backgroundColor: 'rgba(0,188,212,0.1)',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceRssi: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  deviceStatus: {
    color: COLORS.cyan,
    fontWeight: '600',
    fontSize: 14,
  },
  deviceStatusConnected: {
    color: COLORS.cyan,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: SPACING.xxl,
    fontSize: 14,
  },
  doneButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? SPACING.lg : SPACING.md,
  },
  doneButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/BLESetupScreen.tsx
git commit -m "feat: add BLE setup screen for Bluetooth button pairing"
```

---

### Task 7: Wire BLE setup into navigation

**Files:**
- Modify: `App.tsx`
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add bleSetup screen to App.tsx**

In `App.tsx`, update the Screen type and AppContent:

Change the Screen type:
```typescript
type Screen = 'home' | 'voice' | 'bleSetup';
```

Add the BLESetupScreen import:
```typescript
import {BLESetupScreen} from './src/screens/BLESetupScreen';
```

Add the screen case in AppContent's render (alongside existing home/voice):
```typescript
{screen === 'bleSetup' && (
  <BLESetupScreen onDone={() => setScreen('home')} />
)}
```

Pass `onBLESetup` to HomeScreen:
```typescript
{screen === 'home' && (
  <HomeScreen
    onJoined={() => setScreen('voice')}
    onBLESetup={() => setScreen('bleSetup')}
  />
)}
```

- [ ] **Step 2: Add BLE button to HomeScreen**

In `src/screens/HomeScreen.tsx`:

Add `onBLESetup` to the props interface:
```typescript
interface HomeScreenProps {
  onJoined: () => void;
  onBLESetup: () => void;
}
```

Update the destructured props:
```typescript
export function HomeScreen({onJoined, onBLESetup}: HomeScreenProps) {
```

Add a Bluetooth setup button below the version footer (or above the join section):
```tsx
<TouchableOpacity
  style={styles.bleButton}
  onPress={onBLESetup}
  activeOpacity={0.7}>
  <Text style={styles.bleButtonText}>Bouton Bluetooth</Text>
</TouchableOpacity>
```

Add styles:
```typescript
bleButton: {
  paddingVertical: SPACING.sm,
  paddingHorizontal: SPACING.md,
  alignSelf: 'center',
  marginTop: SPACING.md,
},
bleButtonText: {
  color: COLORS.cyan,
  fontSize: 14,
  textDecorationLine: 'underline',
},
```

- [ ] **Step 3: Commit**

```bash
git add App.tsx src/screens/HomeScreen.tsx
git commit -m "feat: wire BLE setup screen into app navigation"
```

---

## Chunk 3: Testing and Verification

### Task 8: Build and verify

- [ ] **Step 1: Verify the project compiles**

Build in Xcode (after adding BLEButtonManager files to the project).

Expected: No build errors.

- [ ] **Step 2: Test BLE scan**

1. Open app on iPhone
2. Make sure selfie remotes are NOT paired in iOS Settings > Bluetooth
3. Navigate to "Bouton Bluetooth" screen
4. Tap "Rechercher des appareils"
5. Press/wake up the selfie remotes
6. Verify devices appear in the list

Check Xcode console for `[BLE]` logs:
- `[BLE] Scanning started`
- `[BLE] Found: <device name> (<uuid>) RSSI=<value>`

- [ ] **Step 3: Test BLE connect and service discovery**

1. Tap on a discovered device
2. Check Xcode console for:
   - `[BLE] Connected to: <name>`
   - `[BLE] Found N services:`
   - `[BLE] Service: <uuid>` (list of all services)
   - `[BLE] Char: <uuid> props=[...]`
   - `[BLE] -> Subscribed to notifications` (for characteristics with notify)

**This is the critical diagnostic step.** The logs will tell us:
- What services the device exposes
- Whether iOS blocks the HID service (0x1812)
- Which characteristics we can subscribe to

- [ ] **Step 4: Test button press detection**

1. With device connected, press the selfie remote button
2. Check Xcode console for:
   - `[BLE] Characteristic <uuid> value changed: <hex>`
   - `[BLE] Toggle emitted from characteristic <uuid>`
3. Check if the mute toggles in the app

- [ ] **Step 5: Test auto-reconnect**

1. Kill and restart the app
2. Check logs for: `[BLE] Auto-reconnecting to saved device: <uuid>`
3. Verify it reconnects automatically

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete BLE button integration via CoreBluetooth"
```
