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

  // Known standard services to IGNORE (not button presses)
  private let standardServiceUUIDs: Set<String> = [
    "180A", // Device Information
    "180F", // Battery
    "1800", // Generic Access
    "1801", // Generic Attribute
  ]

  // Track which characteristics are "button" candidates
  private var buttonCharacteristics: Set<String> = []

  // Track connection time to detect disconnect-as-button-press (iTag pattern)
  private var connectionTime: TimeInterval = 0
  private var userInitiatedDisconnect = false

  // Scan-based detection: track advertisement changes for devices like iTag
  private var scanModeDeviceUUID: String?
  private var lastSeenAdvertData: Data?
  private var scanModeActive = false

  override init() {
    super.init()
    centralManager = CBCentralManager(delegate: self, queue: nil)
    NSLog("[BLE] Module initialized")
  }

  override func supportedEvents() -> [String]! {
    return ["onDeviceFound", "onDeviceConnected", "onDeviceDisconnected", "onBLEToggle", "onBLEState"]
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
    guard let cm = centralManager, cm.state == .poweredOn else { return }
    discoveredPeripherals.removeAll()
    cm.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    NSLog("[BLE] Scanning started")
  }

  @objc func stopScan() {
    centralManager?.stopScan()
  }

  @objc func connectToDevice(_ uuid: String) {
    guard let deviceUUID = UUID(uuidString: uuid) else { return }
    guard let peripheral = discoveredPeripherals[deviceUUID] else {
      let peripherals = centralManager?.retrievePeripherals(withIdentifiers: [deviceUUID]) ?? []
      if let peripheral = peripherals.first {
        NSLog("[BLE] Retrieved known peripheral: \(peripheral.name ?? "unknown")")
        self.discoveredPeripherals[deviceUUID] = peripheral
        peripheral.delegate = self
        centralManager?.connect(peripheral, options: nil)
      }
      return
    }
    peripheral.delegate = self
    centralManager?.connect(peripheral, options: nil)
  }

  @objc func disconnectDevice() {
    userInitiatedDisconnect = true
    if let peripheral = connectedPeripheral {
      centralManager?.cancelPeripheralConnection(peripheral)
    }
    UserDefaults.standard.removeObject(forKey: savedDeviceKey)
  }

  @objc func getSavedDeviceUUID(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(UserDefaults.standard.string(forKey: savedDeviceKey))
  }

  @objc func probeDevice() {
    NSLog("[BLE] Probe: \(buttonCharacteristics.count) button characteristics registered")
  }

  /// Switch to scan-based mode: disconnect and monitor advertisements
  @objc func enableScanMode() {
    guard let saved = UserDefaults.standard.string(forKey: savedDeviceKey) else { return }
    scanModeDeviceUUID = saved
    scanModeActive = true
    lastSeenAdvertData = nil

    // Disconnect current connection
    if let peripheral = connectedPeripheral {
      userInitiatedDisconnect = true
      centralManager?.cancelPeripheralConnection(peripheral)
    }

    // Start scanning with duplicates allowed (to see every advertisement)
    centralManager?.scanForPeripherals(withServices: nil, options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: true
    ])
    NSLog("[BLE] SCAN MODE enabled — monitoring advertisements for \(saved.prefix(8))")
  }

  @objc func disableScanMode() {
    scanModeActive = false
    scanModeDeviceUUID = nil
    centralManager?.stopScan()
    NSLog("[BLE] SCAN MODE disabled")

    // Reconnect
    if let saved = UserDefaults.standard.string(forKey: savedDeviceKey) {
      connectToDevice(saved)
    }
  }

  // MARK: - CBCentralManagerDelegate

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    NSLog("[BLE] Central state: \(central.state.rawValue)")
    if hasListeners {
      sendEvent(withName: "onBLEState", body: ["state": central.state.rawValue])
    }
    if central.state == .poweredOn {
      if let savedUUID = UserDefaults.standard.string(forKey: savedDeviceKey) {
        connectToDevice(savedUUID)
      }
    }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                       advertisementData: [String: Any], rssi RSSI: NSNumber) {
    let uuid = peripheral.identifier.uuidString

    // SCAN MODE: monitor advertisement changes for saved device
    if scanModeActive, uuid == scanModeDeviceUUID {
      // Serialize the manufacturer data or raw advertisement for comparison
      let mfgData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data
      let serviceData = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data]
      let txPower = advertisementData[CBAdvertisementDataTxPowerLevelKey] as? NSNumber

      // Build a fingerprint of the current advertisement
      var fingerprint = Data()
      if let d = mfgData { fingerprint.append(d) }
      if let sd = serviceData { for (_, v) in sd { fingerprint.append(v) } }

      // Log every Nth advertisement to avoid spam
      let now = Date().timeIntervalSince1970
      if Int(now * 10) % 50 == 0 {  // ~every 5s
        NSLog("[BLE] SCAN: \(peripheral.name ?? "?") RSSI=\(RSSI) mfg=\(mfgData?.count ?? 0)B tx=\(txPower ?? -1)")
      }

      if let lastData = lastSeenAdvertData {
        if fingerprint != lastData && fingerprint.count > 0 {
          NSLog("[BLE] ★ ADVERTISEMENT CHANGED for \(peripheral.name ?? "?")")
          NSLog("[BLE] ★ Old: \(lastSeenAdvertData?.map { String(format: "%02x", $0) }.joined() ?? "nil")")
          NSLog("[BLE] ★ New: \(fingerprint.map { String(format: "%02x", $0) }.joined())")

          if (now - lastToggleTime) > 1.0 {
            lastToggleTime = now
            if hasListeners {
              sendEvent(withName: "onBLEToggle", body: ["source": "ble-advert-change", "value": "scan"])
              NSLog("[BLE] ★ Toggle event sent (advertisement change)")
            }
          }
        }
      }
      lastSeenAdvertData = fingerprint.count > 0 ? fingerprint : lastSeenAdvertData
      return
    }

    // Normal scan mode: discover devices
    guard let name = peripheral.name, !name.isEmpty else { return }
    discoveredPeripherals[peripheral.identifier] = peripheral
    NSLog("[BLE] Found: \(name) (\(uuid)) RSSI=\(RSSI)")
    if hasListeners {
      sendEvent(withName: "onDeviceFound", body: ["name": name, "uuid": uuid, "rssi": RSSI.intValue])
    }
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    NSLog("[BLE] Connected to: \(peripheral.name ?? "unknown")")
    connectedPeripheral = peripheral
    buttonCharacteristics.removeAll()
    connectionTime = Date().timeIntervalSince1970
    userInitiatedDisconnect = false
    stopScan()

    let uuid = peripheral.identifier.uuidString
    UserDefaults.standard.set(uuid, forKey: savedDeviceKey)
    if hasListeners {
      sendEvent(withName: "onDeviceConnected", body: ["uuid": uuid, "name": peripheral.name ?? ""])
    }
    peripheral.discoverServices(nil)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    NSLog("[BLE] Failed to connect: \(error?.localizedDescription ?? "unknown")")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    let name = peripheral.name ?? "unknown"
    let uuid = peripheral.identifier.uuidString
    let now = Date().timeIntervalSince1970
    let connectedDuration = now - connectionTime

    NSLog("[BLE] Disconnected from: \(name) (after \(String(format: "%.1f", connectedDuration))s, userInitiated=\(userInitiatedDisconnect))")

    if hasListeners {
      sendEvent(withName: "onDeviceDisconnected", body: ["uuid": uuid])
    }

    // Detect disconnect-as-button-press (iTag pattern):
    // - Not user-initiated (not "Forget" button)
    // - Was connected for at least 2 seconds (not a failed connection)
    // - Debounce: at least 1s since last toggle
    if !userInitiatedDisconnect && connectedDuration > 2.0 && (now - lastToggleTime) > 1.0 {
      NSLog("[BLE] ★ BUTTON PRESS (disconnect pattern) from \(name)")
      lastToggleTime = now
      if hasListeners {
        sendEvent(withName: "onBLEToggle", body: ["source": "ble-disconnect-\(name)", "value": "disconnect"])
        NSLog("[BLE] ★ Toggle event sent to JS")
      }
    }

    connectedPeripheral = nil
    buttonCharacteristics.removeAll()

    // Auto-reconnect to saved device
    if let savedUUID = UserDefaults.standard.string(forKey: savedDeviceKey), savedUUID == uuid {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        self?.connectToDevice(savedUUID)
      }
    }
  }

  // MARK: - CBPeripheralDelegate

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let services = peripheral.services else { return }
    let serviceUUIDs = services.map { $0.uuid.uuidString }
    NSLog("[BLE] Discovered \(services.count) services: \(serviceUUIDs)")
    for service in services {
      peripheral.discoverCharacteristics(nil, for: service)
    }

    // After 3s, check if any button characteristics were found
    // If not, switch to scan mode (iTag-style device)
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
      guard let self = self, !self.scanModeActive else { return }
      if self.buttonCharacteristics.isEmpty && self.connectedPeripheral != nil {
        NSLog("[BLE] No button characteristics found — switching to SCAN MODE")
        self.enableScanMode()
      }
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let characteristics = service.characteristics else { return }
    let serviceUUID = service.uuid.uuidString.uppercased()
    let isStandard = standardServiceUUIDs.contains(serviceUUID)

    NSLog("[BLE] Service \(serviceUUID) has \(characteristics.count) chars (standard=\(isStandard))")

    for char in characteristics {
      let charUUID = char.uuid.uuidString.uppercased()
      let props = char.properties

      // Battery level — read + subscribe
      if char.uuid == CBUUID(string: "2A19") {
        peripheral.setNotifyValue(true, for: char)
        peripheral.readValue(for: char)
        NSLog("[BLE]   Battery char — subscribing")
        continue
      }

      // Skip standard service characteristics
      if isStandard { continue }

      // Subscribe to ALL notifiable characteristics from non-standard services
      if props.contains(.notify) || props.contains(.indicate) {
        peripheral.setNotifyValue(true, for: char)
        buttonCharacteristics.insert(charUUID)
        NSLog("[BLE]   \(charUUID) — SUBSCRIBED as button candidate (notify)")
      } else {
        NSLog("[BLE]   \(charUUID) — props=[\(props.rawValue)] (skipped)")
      }
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error { return }

    let charUUID = characteristic.uuid.uuidString.uppercased()
    let hexValue = characteristic.value?.map { String(format: "%02x", $0) }.joined() ?? "nil"
    let bytes = characteristic.value?.map { $0 } ?? []

    // Battery
    if charUUID == "2A19" {
      let level = bytes.first ?? 0
      NSLog("[BLE] Battery: \(level)%")
      return
    }

    // Is this a registered button characteristic?
    guard buttonCharacteristics.contains(charUUID) else {
      NSLog("[BLE] Notification from unknown char \(charUUID): \(hexValue)")
      return
    }

    // BUTTON PRESS detected!
    let now = Date().timeIntervalSince1970
    NSLog("[BLE] ★ BUTTON PRESS from \(charUUID): \(hexValue) (\(bytes.count) bytes)")

    // Debounce
    if now - lastToggleTime < 0.5 { return }
    lastToggleTime = now

    if hasListeners {
      sendEvent(withName: "onBLEToggle", body: ["source": "ble-\(charUUID)", "value": hexValue])
      NSLog("[BLE] ★ Toggle event sent to JS")
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      NSLog("[BLE] Notification error for \(characteristic.uuid): \(error.localizedDescription)")
    } else {
      NSLog("[BLE] Notifications \(characteristic.isNotifying ? "ON" : "OFF") for \(characteristic.uuid)")
    }
  }
}
