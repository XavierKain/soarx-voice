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
        private const val PREFS_KEY = "BLEButtonDeviceAddress"
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

    @ReactMethod
    fun startScan() {
        if (!hasPermissions()) {
            Log.w(TAG, "Missing BLE permissions")
            return
        }
        val scanner = bluetoothAdapter?.bluetoothLeScanner ?: return
        discoveredDevices.clear()
        scanner.startScan(scanCallback)
        Log.i(TAG, "Scanning started")

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
        getPrefs().edit().remove(PREFS_KEY).apply()
        savedDeviceAddress = null
        Log.i(TAG, "Disconnected and forgot device")
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
        if (savedDeviceAddress != null && connectedGatt == null) {
            connectToDevice(savedDeviceAddress!!)
        }
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
            val name = device.name ?: return
            if (name.isBlank()) return

            val address = device.address
            if (discoveredDevices.containsKey(address)) return
            discoveredDevices[address] = device

            Log.i(TAG, "Found: $name ($address) RSSI=${result.rssi}")
            emit("onDeviceFound", Arguments.createMap().apply {
                putString("name", name)
                putString("uuid", address)
                putInt("rssi", result.rssi)
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
                    getPrefs().edit().putString(PREFS_KEY, address).apply()

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

                    // Auto-reconnect
                    if (savedDeviceAddress != null) {
                        handler.postDelayed({
                            Log.i(TAG, "Auto-reconnecting...")
                            connectToDevice(savedDeviceAddress!!)
                        }, 1000)
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
