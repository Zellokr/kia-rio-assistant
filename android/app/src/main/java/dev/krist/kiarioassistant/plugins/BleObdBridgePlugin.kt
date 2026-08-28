package dev.krist.kiarioassistant.plugins

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.UUID

/**
 * ELM-over-BLE byte pipe for the Android OBD transport.
 *
 * Deliberately separate from [GattInspectorPlugin]: inventory discovery never
 * writes, and this bridge never discovers on the inspector's behalf. Every UUID
 * is supplied by the caller from a reviewed Step 19 inventory; this plugin ships
 * no vendor default and refuses to guess one.
 *
 * The read-only command policy is enforced above this layer, in
 * `AndroidBleObdTransport.write`, and repeated here as defense in depth before
 * any decoded command bytes reach the GATT write characteristic.
 */
@CapacitorPlugin(
    name = "BleObdBridge",
    permissions = [
        Permission(
            alias = "bluetoothModern",
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            ]
        ),
        Permission(
            alias = "bluetoothLegacy",
            strings = [Manifest.permission.ACCESS_FINE_LOCATION]
        )
    ]
)
class BleObdBridgePlugin : Plugin() {
    private val handler = Handler(Looper.getMainLooper())
    private val scanResults = linkedMapOf<String, ScanResult>()
    private var activeScanCall: PluginCall? = null
    private var activeConnectCall: PluginCall? = null
    private var bluetoothGatt: BluetoothGatt? = null
    private var writeCharacteristic: BluetoothGattCharacteristic? = null
    private var notifyCharacteristic: BluetoothGattCharacteristic? = null
    private var pendingProfile: Profile? = null
    private var pendingWriteCall: PluginCall? = null

    private data class Profile(
        val service: UUID,
        val write: UUID,
        val notify: UUID
    )

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val name = result.scanRecord?.deviceName ?: return
            if (!name.contains("VEEPEAK", ignoreCase = true)) return
            scanResults[result.device.address] = result
        }

        override fun onScanFailed(errorCode: Int) {
            finishScanWithError("BLE scan failed with code $errorCode")
        }
    }

    @PluginMethod
    fun requestDevice(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias(permissionAlias(), call, "requestDevicePermissionCallback")
            return
        }
        startScan(call)
    }

    @PermissionCallback
    private fun requestDevicePermissionCallback(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is required to reach the adapter")
            return
        }
        startScan(call)
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val deviceId = call.getString("deviceId")
        if (deviceId.isNullOrBlank()) {
            call.reject("deviceId is required")
            return
        }

        val profile = readProfile(call) ?: return

        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is required to connect")
            return
        }

        val result = scanResults[deviceId]
        if (result == null) {
            call.reject("Select the adapter from a fresh scan before connecting")
            return
        }

        closeGatt()
        pendingProfile = profile
        activeConnectCall = call

        try {
            bluetoothGatt = result.device.connectGatt(
                context,
                false,
                gattCallback,
                android.bluetooth.BluetoothDevice.TRANSPORT_LE
            )
        } catch (error: SecurityException) {
            activeConnectCall = null
            pendingProfile = null
            call.reject("Bluetooth permission was denied", null, error)
        }
    }

    /**
     * Reads the three reviewed UUIDs. All three are mandatory: a partially
     * specified profile is how bytes end up on an unreviewed characteristic.
     */
    private fun readProfile(call: PluginCall): Profile? {
        val service = call.getString("serviceUuid")
        val write = call.getString("writeCharacteristicUuid")
        val notify = call.getString("notifyCharacteristicUuid")

        if (service.isNullOrBlank() || write.isNullOrBlank() || notify.isNullOrBlank()) {
            call.reject(
                "serviceUuid, writeCharacteristicUuid and notifyCharacteristicUuid are all required; supply them from a reviewed GATT inventory"
            )
            return null
        }

        return try {
            Profile(UUID.fromString(service), UUID.fromString(write), UUID.fromString(notify))
        } catch (error: IllegalArgumentException) {
            call.reject("Profile UUIDs must be full 128-bit UUID strings", null, error)
            null
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failConnect("GATT connection failed with status $status")
                return
            }
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                try {
                    if (!gatt.discoverServices()) {
                        failConnect("GATT service discovery could not start")
                    }
                } catch (error: SecurityException) {
                    failConnect("Bluetooth permission was denied", error)
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                notifyListeners("disconnected", JSObject())
                failConnect("GATT device disconnected")
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failConnect("GATT service discovery failed with status $status")
                return
            }

            val profile = pendingProfile ?: return
            val service = gatt.getService(profile.service)
                ?: return failConnect("Service ${profile.service} is absent on this adapter")

            val write = service.getCharacteristic(profile.write)
                ?: return failConnect("Write characteristic ${profile.write} is absent")
            val notify = service.getCharacteristic(profile.notify)
                ?: return failConnect("Notify characteristic ${profile.notify} is absent")

            // Refuse a profile whose channels cannot do their job. A "write"
            // characteristic that cannot be written is a reviewed-inventory
            // mistake, and finding out mid-command is far worse than here.
            val canWrite = write.properties and (
                BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE
                ) != 0
            if (!canWrite) {
                return failConnect("Characteristic ${profile.write} exposes no write property")
            }
            if (notify.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY == 0) {
                return failConnect("Characteristic ${profile.notify} exposes no notify property")
            }

            writeCharacteristic = write
            notifyCharacteristic = notify

            if (!enableNotifications(gatt, notify)) {
                return failConnect("Could not subscribe to ${profile.notify}")
            }
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int
        ) {
            if (descriptor.uuid != CCCD_UUID) return

            if (status != BluetoothGatt.GATT_SUCCESS) {
                failConnect("Enabling notifications failed with status $status")
                return
            }

            // The pipe is only usable once the CCCD is actually written, so
            // connect resolves here and not at service discovery.
            val call = activeConnectCall ?: return
            activeConnectCall = null
            call.resolve()
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            val call = pendingWriteCall ?: return
            pendingWriteCall = null

            if (status == BluetoothGatt.GATT_SUCCESS) {
                call.resolve()
            } else {
                call.reject("Characteristic write failed with status $status")
            }
        }

        @Deprecated("Required for API < 33; the typed overload below handles newer devices")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            @Suppress("DEPRECATION")
            emitRx(characteristic.uuid, characteristic.value)
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            emitRx(characteristic.uuid, value)
        }
    }

    /**
     * Forwards one RX chunk. Chunks are not reassembled here: the ELM prompt
     * parser upstream already owns fragmentation, and duplicating that logic
     * natively would give two sources of truth for framing.
     */
    private fun emitRx(uuid: UUID, value: ByteArray?) {
        if (uuid != notifyCharacteristic?.uuid) return
        val bytes = value ?: return
        if (bytes.isEmpty()) return

        val payload = JSObject()
        payload.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        notifyListeners("rx", payload)
    }

    private fun enableNotifications(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic
    ): Boolean {
        return try {
            if (!gatt.setCharacteristicNotification(characteristic, true)) {
                return false
            }

            val descriptor = characteristic.getDescriptor(CCCD_UUID) ?: return false
            val enable = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeDescriptor(descriptor, enable) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                run {
                    descriptor.value = enable
                    gatt.writeDescriptor(descriptor)
                }
            }
        } catch (_: SecurityException) {
            false
        }
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val encoded = call.getString("data")
        if (encoded.isNullOrEmpty()) {
            call.reject("data is required")
            return
        }

        val gatt = bluetoothGatt
        val characteristic = writeCharacteristic
        if (gatt == null || characteristic == null) {
            call.reject("Connect the BLE OBD bridge before writing")
            return
        }
        if (pendingWriteCall != null) {
            call.reject("A characteristic write is already in flight")
            return
        }

        val bytes = try {
            Base64.decode(encoded, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            call.reject("data must be base64 encoded", null, error)
            return
        }

        val command = normalizeElmCommand(bytes)
        if (!isPhysicalCommandAllowed(command)) {
            call.reject("Physical command \"$command\" is not allowed on this read-only transport")
            return
        }

        // Prefer an acknowledged write when the characteristic offers one: the
        // ELM327 needs flow control, and a silent no-response write that never
        // lands is indistinguishable from an adapter that simply said nothing.
        val writeType = if (
            characteristic.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0
        ) {
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        }

        pendingWriteCall = call

        try {
            val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt.writeCharacteristic(characteristic, bytes, writeType) ==
                    BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                run {
                    characteristic.writeType = writeType
                    characteristic.value = bytes
                    gatt.writeCharacteristic(characteristic)
                }
            }

            if (!started) {
                pendingWriteCall = null
                call.reject("Characteristic write could not be started")
                return
            }

            if (writeType == BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) {
                // No onCharacteristicWrite callback arrives for this type.
                pendingWriteCall = null
                call.resolve()
            }
        } catch (error: SecurityException) {
            pendingWriteCall = null
            call.reject("Bluetooth permission was denied", null, error)
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        stopScan()
        closeGatt()
        call.resolve()
    }

    override fun handleOnDestroy() {
        stopScan()
        closeGatt()
        super.handleOnDestroy()
    }

    private fun startScan(call: PluginCall) {
        val adapter = bluetoothAdapter(call) ?: return
        if (!adapter.isEnabled) {
            call.reject("Enable Bluetooth before reaching the adapter")
            return
        }

        stopScan()
        scanResults.clear()
        activeScanCall = call

        try {
            adapter.bluetoothLeScanner.startScan(scanCallback)
            handler.postDelayed({ finishScan() }, SCAN_DURATION_MS)
        } catch (error: SecurityException) {
            activeScanCall = null
            call.reject("Bluetooth permission was denied", null, error)
        }
    }

    private fun finishScan() {
        val call = activeScanCall ?: return
        stopNativeScan()
        activeScanCall = null

        val first = scanResults.values.firstOrNull()
        if (first == null) {
            call.reject("No VEEPEAK adapter was found in range")
            return
        }

        val response = JSObject()
        response.put("id", first.device.address)
        response.put("name", first.scanRecord?.deviceName ?: "VEEPEAK")
        call.resolve(response)
    }

    private fun finishScanWithError(message: String) {
        val call = activeScanCall ?: return
        stopNativeScan()
        activeScanCall = null
        call.reject(message)
    }

    private fun stopScan() {
        if (activeScanCall == null) return
        stopNativeScan()
        activeScanCall?.reject("BLE scan cancelled")
        activeScanCall = null
    }

    private fun stopNativeScan() {
        handler.removeCallbacksAndMessages(null)
        try {
            bluetoothAdapter(null)?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (_: SecurityException) {
            // Stopping must remain best-effort if permission is revoked.
        }
    }

    private fun failConnect(message: String, error: Exception? = null) {
        val call = activeConnectCall
        activeConnectCall = null
        pendingProfile = null
        closeGatt()
        if (error == null) call?.reject(message) else call?.reject(message, null, error)
    }

    private fun closeGatt() {
        activeConnectCall?.reject("BLE OBD bridge connection cancelled")
        activeConnectCall = null
        pendingWriteCall?.reject("BLE OBD bridge disconnected before the write completed")
        pendingWriteCall = null
        pendingProfile = null
        writeCharacteristic = null
        notifyCharacteristic = null

        try {
            bluetoothGatt?.disconnect()
        } catch (_: SecurityException) {
            // Closing must remain best-effort if permission is revoked.
        } finally {
            bluetoothGatt?.close()
            bluetoothGatt = null
        }
    }

    private fun bluetoothAdapter(call: PluginCall?): BluetoothAdapter? {
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            call?.reject("This device does not support Bluetooth LE")
            return null
        }

        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = manager?.adapter

        if (adapter == null) {
            call?.reject("Bluetooth is unavailable on this device")
            return null
        }

        return adapter
    }

    private fun permissionAlias(): String = if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    ) {
        "bluetoothModern"
    } else {
        "bluetoothLegacy"
    }

    private fun hasBluetoothPermission(): Boolean =
        getPermissionState(permissionAlias()) == PermissionState.GRANTED

    private fun normalizeElmCommand(bytes: ByteArray): String {
        return String(bytes, StandardCharsets.US_ASCII)
            .replace(ELM_COMMAND_WHITESPACE, "")
            .uppercase(Locale.ROOT)
    }

    private fun isPhysicalCommandAllowed(command: String): Boolean {
        if (command.startsWith(MODE_04_PREFIX)) return false
        return PHYSICAL_ALLOWED_COMMANDS.contains(command)
    }

    private companion object {
        const val SCAN_DURATION_MS = 5_000L
        const val MODE_04_PREFIX = "04"
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        val ELM_COMMAND_WHITESPACE = Regex("\\s+")
        // Mirrors core/obd/policy/PhysicalObdCommandPolicy.ts so the native
        // bridge also fails closed if a caller bypasses AndroidBleObdTransport.
        val PHYSICAL_ALLOWED_COMMANDS = setOf(
            "ATZ",
            "ATE0",
            "ATL0",
            "ATS0",
            "ATH0",
            "ATSP0",
            "0100",
            "0120",
            "0140",
            "0160",
            "0180",
            "01A0",
            "01C0",
            "010C",
            "0105",
            "03",
            "07",
            "0A"
        )
    }
}
