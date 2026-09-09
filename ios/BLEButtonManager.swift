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
  private let savedDeviceKey = "BLEButtonDeviceUUID"      // legacy single value
  private let savedDevicesKey = "BLEButtonDevices"         // [[uuid, name]]
  private var lookingForAnySaved = false

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

  // A scan requested before the radio is ready is remembered and run on poweredOn.
  private var scanPending = false
  private var reconnectAttempts = 0
  private let maxReconnectAttempts = 6

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

  // MARK: - Saved buttons
  //
  // A pilot carries one button per wing, so several are remembered and whichever
  // is powered on at the time is the one we connect to.

  private func savedDevices() -> [[String: String]] {
    if let list = UserDefaults.standard.array(forKey: savedDevicesKey) as? [[String: String]] {
      return list
    }
    // Migrate the single button remembered by earlier versions.
    if let legacy = UserDefaults.standard.string(forKey: savedDeviceKey) {
      let migrated = [["uuid": legacy, "name": "Saved button"]]
      UserDefaults.standard.set(migrated, forKey: savedDevicesKey)
      return migrated
    }
    return []
  }

  private func isSaved(_ uuid: String) -> Bool {
    return savedDevices().contains { $0["uuid"] == uuid }
  }

  private func saveDevice(_ uuid: String, name: String) {
    var list = savedDevices()
    if let idx = list.firstIndex(where: { $0["uuid"] == uuid }) {
      list[idx]["name"] = name
    } else {
      list.append(["uuid": uuid, "name": name])
    }
    UserDefaults.standard.set(list, forKey: savedDevicesKey)
    UserDefaults.standard.set(uuid, forKey: savedDeviceKey) // keep legacy key in step
    NSLog("[BLE] Saved buttons: \(list.count)")
  }

  // MARK: - JS Methods

  /// Human-readable reason a scan cannot run, or nil when the radio is ready.
  private func unavailableReason(_ state: CBManagerState) -> String? {
    switch state {
    case .poweredOn:   return nil
    case .poweredOff:  return "bluetooth-off"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    case .resetting:   return "resetting"
    case .unknown:     return "unknown"
    @unknown default:  return "unknown"
    }
  }

  private func emitState() {
    guard hasListeners, let cm = centralManager else { return }
    let reason = unavailableReason(cm.state)
    sendEvent(withName: "onBLEState", body: [
      "state": cm.state.rawValue,
      "ready": reason == nil,
      "reason": reason ?? "ready"
    ])
  }

  @objc func startScan() {
    guard let cm = centralManager else { return }

    // Right after launch the state is still .unknown, and the permission prompt
    // has not been answered yet. Silently returning here made the scan look
    // broken: the UI span for ten seconds and listed nothing.
    if let reason = unavailableReason(cm.state) {
      NSLog("[BLE] Scan requested but radio not ready (\(reason)) — queued")
      scanPending = true
      emitState()
      return
    }

    scanPending = false
    discoveredPeripherals.removeAll()
    cm.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    NSLog("[BLE] Scanning started")
    emitState()
  }

  /// Lets JS ask for the current radio state without starting a scan.
  @objc func getState(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let state = centralManager?.state ?? .unknown
    let reason = unavailableReason(state)
    resolve([
      "state": state.rawValue,
      "ready": reason == nil,
      "reason": reason ?? "ready"
    ])
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
      } else {
        // The button is asleep and not in the system cache. Scanning wakes our
        // knowledge of it; didDiscover will retry the connection.
        NSLog("[BLE] Peripheral unknown — scanning to find it again")
        centralManager?.scanForPeripherals(withServices: nil, options: nil)
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
  }

  @objc func getSavedDevices(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let connected = connectedPeripheral?.identifier.uuidString
    resolve(savedDevices().map { d -> [String: Any] in
      ["uuid": d["uuid"] ?? "", "name": d["name"] ?? "", "connected": d["uuid"] == connected]
    })
  }

  @objc func forgetDevice(_ uuid: String) {
    var list = savedDevices().filter { $0["uuid"] != uuid }
    UserDefaults.standard.set(list, forKey: savedDevicesKey)
    if UserDefaults.standard.string(forKey: savedDeviceKey) == uuid {
      UserDefaults.standard.removeObject(forKey: savedDeviceKey)
    }
    if connectedPeripheral?.identifier.uuidString == uuid, let p = connectedPeripheral {
      userInitiatedDisconnect = true
      centralManager?.cancelPeripheralConnection(p)
    }
    NSLog("[BLE] Forgot \(uuid.prefix(8)) — \(list.count) button(s) left")
    list = []
  }

  /// Scan and connect to whichever remembered button is powered on right now.
  @objc func connectToAnySaved() {
    let saved = savedDevices()
    guard !saved.isEmpty else { return }
    guard let cm = centralManager, unavailableReason(cm.state) == nil else {
      scanPending = true
      return
    }
    if connectedPeripheral != nil { return }

    // Try the system cache first — instant when the button is already awake.
    for d in saved {
      guard let uuidStr = d["uuid"], let id = UUID(uuidString: uuidStr) else { continue }
      if let p = cm.retrievePeripherals(withIdentifiers: [id]).first {
        discoveredPeripherals[id] = p
        p.delegate = self
        cm.connect(p, options: nil)
      }
    }

    // And scan, so a button that wakes up later is picked up too.
    lookingForAnySaved = true
    cm.scanForPeripherals(withServices: nil, options: nil)
    NSLog("[BLE] Looking for any of \(saved.count) saved button(s)")
  }

  @objc func getSavedDeviceUUID(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(UserDefaults.standard.string(forKey: savedDeviceKey))
  }

  @objc func probeDevice() {
    NSLog("[BLE] Probe: \(buttonCharacteristics.count) button characteristics registered")
  }

  /// Switch to scan-based mode: disconnect and monitor advertisements
  @objc func enableScanMode() {
    guard let saved = connectedPeripheral?.identifier.uuidString
            ?? savedDevices().first?["uuid"] else { return }
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
    connectToAnySaved()
  }

  // MARK: - CBCentralManagerDelegate

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    NSLog("[BLE] Central state: \(central.state.rawValue) (\(unavailableReason(central.state) ?? "ready"))")
    emitState()

    guard central.state == .poweredOn else { return }

    // A scan asked for before the user answered the permission prompt runs now.
    if scanPending {
      NSLog("[BLE] Radio ready — running the queued scan")
      startScan()
    }
    connectToAnySaved()
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

    // Any remembered button that appears is the one the pilot is carrying today.
    if !scanModeActive, isSaved(uuid), connectedPeripheral == nil {
      NSLog("[BLE] Saved button in range — connecting to \(peripheral.name ?? uuid)")
      discoveredPeripherals[peripheral.identifier] = peripheral
      if lookingForAnySaved {
        lookingForAnySaved = false
        centralManager?.stopScan()
      }
      peripheral.delegate = self
      centralManager?.connect(peripheral, options: nil)
      return
    }

    // Normal scan mode: discover devices. Unnamed peripherals used to be
    // dropped, which hid buttons that only advertise a name once connected.
    let rawName = peripheral.name ?? ""
    let name = rawName.isEmpty ? "Unnamed device" : rawName
    let isITag = rawName.lowercased().contains("itag")
    discoveredPeripherals[peripheral.identifier] = peripheral
    NSLog("[BLE] Found: \(name) (\(uuid)) RSSI=\(RSSI) itag=\(isITag)")
    if hasListeners {
      sendEvent(withName: "onDeviceFound", body: [
        "name": name,
        "uuid": uuid,
        "rssi": RSSI.intValue,
        "isNamed": !rawName.isEmpty,
        "isITag": isITag
      ])
    }
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    NSLog("[BLE] Connected to: \(peripheral.name ?? "unknown")")
    connectedPeripheral = peripheral
    buttonCharacteristics.removeAll()
    connectionTime = Date().timeIntervalSince1970
    userInitiatedDisconnect = false
    reconnectAttempts = 0
    stopScan()

    let uuid = peripheral.identifier.uuidString
    saveDevice(uuid, name: peripheral.name ?? "Saved button")
    lookingForAnySaved = false
    if hasListeners {
      sendEvent(withName: "onDeviceConnected", body: ["uuid": uuid, "name": peripheral.name ?? ""])
    }
    peripheral.discoverServices(nil)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    NSLog("[BLE] Failed to connect: \(error?.localizedDescription ?? "unknown")")
    // Without a retry here a single failed reconnection left the button dead
    // until it was power-cycled — the press-disconnect-reconnect loop never
    // recovered on its own.
    scheduleReconnect(peripheral.identifier.uuidString)
  }

  /// Retry a reconnection with backoff, then fall back to scanning.
  private func scheduleReconnect(_ uuid: String) {
    guard isSaved(uuid) else { return }
    guard reconnectAttempts < maxReconnectAttempts else {
      // This button may be off — the pilot may have switched wing. Look for any.
      NSLog("[BLE] Giving up on \(uuid.prefix(8)) after \(reconnectAttempts) tries — looking for any saved button")
      reconnectAttempts = 0
      connectToAnySaved()
      return
    }
    reconnectAttempts += 1
    let delay = min(0.5 * Double(reconnectAttempts), 3.0)
    NSLog("[BLE] Reconnect attempt \(reconnectAttempts) in \(delay)s")
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      self?.connectToDevice(uuid)
    }
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
    // - Connected long enough that this is a press, not a failed connection.
    //   This was 2s, but reconnection takes ~0.5s, so any press within ~2.5s of
    //   the previous one was silently swallowed.
    // - Debounce against duplicate disconnect callbacks
    if !userInitiatedDisconnect && connectedDuration > 0.8 && (now - lastToggleTime) > 0.6 {
      NSLog("[BLE] ★ BUTTON PRESS (disconnect pattern) from \(name)")
      lastToggleTime = now
      if hasListeners {
        sendEvent(withName: "onBLEToggle", body: ["source": "ble-disconnect-\(name)", "value": "disconnect"])
        NSLog("[BLE] ★ Toggle event sent to JS")
      }
    }

    connectedPeripheral = nil
    buttonCharacteristics.removeAll()

    // Auto-reconnect to the same button, with retries if it does not take
    if isSaved(uuid) && !userInitiatedDisconnect {
      reconnectAttempts = 0
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
        self?.connectToDevice(uuid)
      }
      // If the reconnection never lands, didFailToConnect may not fire either;
      // check back and restart the retry ladder.
      DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
        guard let self = self, self.connectedPeripheral == nil else { return }
        NSLog("[BLE] Reconnect did not land after 3s — retrying")
        self.scheduleReconnect(uuid)
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
    if error != nil { return }

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

    // Debounce duplicate notifications from the same press
    if now - lastToggleTime < 0.4 { return }
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
