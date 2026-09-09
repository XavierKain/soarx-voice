package com.soarxvoice

import android.Manifest
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID

class BLEButtonManager(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        private const val TAG = "BLE"
        private const val PREFS_KEY = "BLEButtonDeviceAddress"   // legacy single value
        private const val PREFS_LIST_KEY = "BLEButtonDevices"     // "addr|name|custom" entries
        // Standard services to ignore
        private val STANDARD_SERVICES = setOf(
            "00001800-0000-1000-8000-00805f9b34fb", // Generic Access
            "00001801-0000-1000-8000-00805f9b34fb", // Generic Attribute
            "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
            "0000180f-0000-1000-8000-00805f9b34fb"  // Battery
        )
        // Client Characteristic Configuration Descriptor
        private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    private val handler = Handler(Looper.getMainLooper())
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var connectedGatt: BluetoothGatt? = null
    private var savedDeviceAddress: String? = null
    private var lastToggleTime: Long = 0
    private var hasListeners = false
    private val buttonCharacteristics = mutableSetOf<String>()
    private val discoveredDevices = mutableMapOf<String, BluetoothDevice>()

    override fun getName(): String = "BLEButtonManager"

    override fun initialize() {
        super.initialize()
        reactContext.addLifecycleEventListener(this)
        val bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter
        savedDeviceAddress = getPrefs().getString(PREFS_KEY, null)
        Log.i(TAG, "Module initialized, saved=$savedDeviceAddress")
    }

    private fun getPrefs() = reactContext.getSharedPreferences("BLEButton", Context.MODE_PRIVATE)

    // A pilot carries one button per wing, so several are remembered and whichever
    // is powered on at the time is the one we connect to.

    private data class SavedButton(val address: String, val name: String, val custom: Boolean)

    private fun savedDevices(): MutableList<SavedButton> {
        val stored = getPrefs().getStringSet(PREFS_LIST_KEY, null)
        if (stored != null) {
            return stored.mapNotNull {
                val parts = it.split("|")
                if (parts.size >= 2) SavedButton(parts[0], parts[1], parts.getOrNull(2) == "1")
                else null
            }.toMutableList()
        }
        // Migrate the single button remembered by earlier versions.
        val legacy = getPrefs().getString(PREFS_KEY, null)
        return if (legacy != null) mutableListOf(SavedButton(legacy, "Saved button", false))
               else mutableListOf()
    }

    private fun persist(list: List<SavedButton>) {
        getPrefs().edit()
            .putStringSet(
                PREFS_LIST_KEY,
                list.map { "${it.address}|${it.name}|${if (it.custom) "1" else "0"}" }.toSet()
            )
            .apply()
    }

    private fun isSaved(address: String) = savedDevices().any { it.address == address }

    private fun saveDevice(address: String, name: String) {
        val list = savedDevices()
        val idx = list.indexOfFirst { it.address == address }
        if (idx >= 0) {
            // A name the pilot chose must survive reconnections, which would
            // otherwise overwrite it with the advertised name ("iTag").
            if (!list[idx].custom) list[idx] = list[idx].copy(name = name)
        } else {
            list.add(SavedButton(address, name, false))
        }
        persist(list)
        getPrefs().edit().putString(PREFS_KEY, address).apply()
        Log.i(TAG, "Saved buttons: ${list.size}")
    }

    private fun hasPermissions(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
                   ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    private fun emit(eventName: String, params: WritableMap) {
        if (hasListeners) {
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    // MARK: - JS Methods

    /** Why a scan cannot run, or null when the radio is ready. */
    private fun unavailableReason(): String? {
        val adapter = bluetoothAdapter ?: return "unsupported"
        if (!hasPermissions()) return "unauthorized"
        if (!adapter.isEnabled) return "bluetooth-off"
        if (adapter.bluetoothLeScanner == null) return "unsupported"
        return null
    }

    private fun emitState() {
        val reason = unavailableReason()
        emit("onBLEState", Arguments.createMap().apply {
            putBoolean("ready", reason == null)
            putString("reason", reason ?: "ready")
        })
    }

    @ReactMethod
    fun getState(promise: Promise) {
        val reason = unavailableReason()
        promise.resolve(Arguments.createMap().apply {
            putBoolean("ready", reason == null)
            putString("reason", reason ?: "ready")
        })
    }

    @ReactMethod
    fun startScan() {
        // Returning silently here made the scan look broken: the UI span for ten
        // seconds and listed nothing, with no way to tell that the permission was
        // missing or the radio was off.
        val reason = unavailableReason()
        if (reason != null) {
            Log.w(TAG, "Scan requested but radio not ready ($reason)")
            emitState()
            return
        }
        val scanner = bluetoothAdapter!!.bluetoothLeScanner
        discoveredDevices.clear()
        scanner.startScan(scanCallback)
        Log.i(TAG, "Scanning started")
        emitState()

        // Stop after 10s
        handler.postDelayed({ stopScan() }, 10000)
    }

    @ReactMethod
    fun stopScan() {
        try {
            bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (e: Exception) {
            Log.w(TAG, "stopScan error: ${e.message}")
        }
    }

    @ReactMethod
    fun connectToDevice(address: String) {
        if (!hasPermissions()) return
        Log.i(TAG, "Connecting to: $address")

        // Disconnect existing
        connectedGatt?.close()
        connectedGatt = null
        buttonCharacteristics.clear()

        val device = discoveredDevices[address]
            ?: bluetoothAdapter?.getRemoteDevice(address)
            ?: run {
                Log.w(TAG, "Device not found: $address")
                return
            }

        device.connectGatt(reactContext, true, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    @ReactMethod
    fun disconnectDevice() {
        connectedGatt?.disconnect()
        connectedGatt?.close()
        connectedGatt = null
        Log.i(TAG, "Disconnected")
    }

    @ReactMethod
    fun getSavedDevices(promise: Promise) {
        val connected = connectedGatt?.device?.address
        val arr = Arguments.createArray()
        savedDevices().forEach { btn ->
            arr.pushMap(Arguments.createMap().apply {
                putString("uuid", btn.address)
                putString("name", btn.name)
                putBoolean("connected", btn.address == connected)
            })
        }
        promise.resolve(arr)
    }

    @ReactMethod
    fun renameDevice(address: String, name: String) {
        val list = savedDevices()
        val idx = list.indexOfFirst { it.address == address }
        if (idx < 0) return
        val trimmed = name.trim()
        list[idx] = if (trimmed.isEmpty()) {
            // Clearing the name hands control back to the advertised one.
            list[idx].copy(name = "Saved button", custom = false)
        } else {
            list[idx].copy(name = trimmed, custom = true)
        }
        persist(list)
        Log.i(TAG, "Renamed $address to ${list[idx].name}")
    }

    @ReactMethod
    fun forgetDevice(address: String) {
        val list = savedDevices().filter { it.address != address }
        persist(list)
        if (getPrefs().getString(PREFS_KEY, null) == address) {
            getPrefs().edit().remove(PREFS_KEY).apply()
        }
        if (connectedGatt?.device?.address == address) {
            connectedGatt?.disconnect(); connectedGatt?.close(); connectedGatt = null
        }
        savedDeviceAddress = list.firstOrNull()?.address
        Log.i(TAG, "Forgot $address — ${list.size} button(s) left")
    }

    /** Connect to whichever remembered button is powered on right now. */
    @ReactMethod
    fun connectToAnySaved() {
        val saved = savedDevices()
        if (saved.isEmpty() || connectedGatt != null) return
        if (unavailableReason() != null) return
        // Scanning finds whichever button the pilot actually brought today.
        bluetoothAdapter?.bluetoothLeScanner?.startScan(scanCallback)
        Log.i(TAG, "Looking for any of ${saved.size} saved button(s)")
        handler.postDelayed({ stopScan() }, 15000)
    }

    @ReactMethod
    fun getSavedDeviceUUID(promise: Promise) {
        promise.resolve(savedDeviceAddress)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        hasListeners = true
        Log.i(TAG, "JS listeners attached")

        // Auto-reconnect when listeners attach
        connectToAnySaved()
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        hasListeners = false
        Log.i(TAG, "JS listeners detached")
    }

    // Unused but required for API parity
    @ReactMethod fun probeDevice() {}
    @ReactMethod fun enableScanMode() {}
    @ReactMethod fun disableScanMode() {}

    // MARK: - Scan Callback

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            // Unnamed peripherals used to be dropped, which hid buttons that only
            // advertise a name once connected.
            val rawName = try { device.name ?: "" } catch (e: SecurityException) { "" }
            val name = if (rawName.isBlank()) "Unnamed device" else rawName
            val isITag = rawName.lowercase().contains("itag")

            val address = device.address
            if (discoveredDevices.containsKey(address)) return
            discoveredDevices[address] = device

            if (isSaved(address) && connectedGatt == null) {
                Log.i(TAG, "Saved button in range — connecting to $name")
                stopScan()
                connectToDevice(address)
                return
            }

            Log.i(TAG, "Found: $name ($address) RSSI=${result.rssi} itag=$isITag")
            emit("onDeviceFound", Arguments.createMap().apply {
                putString("name", name)
                putString("uuid", address)
                putInt("rssi", result.rssi)
                putBoolean("isNamed", rawName.isNotBlank())
                putBoolean("isITag", isITag)
            })
        }

        override fun onScanFailed(errorCode: Int) {
            Log.w(TAG, "Scan failed: $errorCode")
            emit("onBLEState", Arguments.createMap().apply {
                putBoolean("ready", false)
                putString("reason", "scan-failed-$errorCode")
            })
        }
    }

    // MARK: - GATT Callback

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val name = gatt.device.name ?: "unknown"
            when (newState) {
                BluetoothGatt.STATE_CONNECTED -> {
                    Log.i(TAG, "Connected to: $name")
                    connectedGatt = gatt

                    // Save device
                    val address = gatt.device.address
                    savedDeviceAddress = address
                    saveDevice(address, name)
                    stopScan()

                    emit("onDeviceConnected", Arguments.createMap().apply {
                        putString("uuid", address)
                        putString("name", name)
                    })

                    // Discover services
                    gatt.discoverServices()
                }
                BluetoothGatt.STATE_DISCONNECTED -> {
                    Log.i(TAG, "Disconnected from: $name")
                    emit("onDeviceDisconnected", Arguments.createMap().apply {
                        putString("uuid", gatt.device.address)
                    })

                    connectedGatt = null
                    buttonCharacteristics.clear()

                    // Auto-reconnect to the same button; if it stays away the
                    // pilot may have switched wing, so look for any saved one.
                    val addr = gatt.device.address
                    if (isSaved(addr)) {
                        handler.postDelayed({
                            Log.i(TAG, "Auto-reconnecting to $addr")
                            connectToDevice(addr)
                        }, 800)
                        handler.postDelayed({
                            if (connectedGatt == null) {
                                Log.i(TAG, "Still not connected — looking for any saved button")
                                connectToAnySaved()
                            }
                        }, 5000)
                    }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) return

            val services = gatt.services
            Log.i(TAG, "Discovered ${services.size} services")

            for (service in services) {
                val serviceUUID = service.uuid.toString().lowercase()
                val isStandard = STANDARD_SERVICES.contains(serviceUUID)
                Log.i(TAG, "Service $serviceUUID (standard=$isStandard)")

                for (char in service.characteristics) {
                    val charUUID = char.uuid.toString().uppercase()
                    val props = char.properties

                    // Skip standard services
                    if (isStandard) continue

                    // Subscribe to notifiable characteristics
                    if (props and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 ||
                        props and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0) {

                        gatt.setCharacteristicNotification(char, true)

                        // Write to CCCD to enable notifications
                        val descriptor = char.getDescriptor(CCCD_UUID)
                        if (descriptor != null) {
                            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                            gatt.writeDescriptor(descriptor)
                        }

                        buttonCharacteristics.add(charUUID)
                        Log.i(TAG, "  $charUUID — SUBSCRIBED as button candidate")
                    } else {
                        Log.i(TAG, "  $charUUID — props=$props (skipped)")
                    }
                }
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            val charUUID = characteristic.uuid.toString().uppercase()
            val value = characteristic.value
            val hex = value?.joinToString("") { String.format("%02x", it) } ?: "nil"

            if (!buttonCharacteristics.contains(charUUID)) {
                Log.i(TAG, "Notification from unknown char $charUUID: $hex")
                return
            }

            // BUTTON PRESS!
            val now = System.currentTimeMillis()
            Log.i(TAG, "★ BUTTON PRESS from $charUUID: $hex (${value?.size ?: 0} bytes)")

            // Debounce 500ms
            if (now - lastToggleTime < 500) return
            lastToggleTime = now

            emit("onBLEToggle", Arguments.createMap().apply {
                putString("source", "ble-$charUUID")
                putString("value", hex)
            })
            Log.i(TAG, "★ Toggle event sent to JS")
        }
    }

    // MARK: - Lifecycle

    override fun onHostResume() {
        if (savedDeviceAddress != null && connectedGatt == null) {
            handler.postDelayed({ connectToDevice(savedDeviceAddress!!) }, 1000)
        }
    }

    override fun onHostPause() {}
    override fun onHostDestroy() {
        connectedGatt?.close()
    }
}
