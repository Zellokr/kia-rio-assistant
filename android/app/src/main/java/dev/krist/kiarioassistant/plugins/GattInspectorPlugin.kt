package dev.krist.kiarioassistant.plugins

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "GattInspector",
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
class GattInspectorPlugin : Plugin() {
    private val handler = Handler(Looper.getMainLooper())
    private val scanResults = linkedMapOf<String, ScanResult>()
    private var activeScanCall: PluginCall? = null
    private var activeInspectionCall: PluginCall? = null
    private var bluetoothGatt: BluetoothGatt? = null

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
    fun scan(call: PluginCall) {
        if (!hasBleFeature(call)) return
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias(permissionAlias(), call, "scanPermissionCallback")
            return
        }
        startScan(call)
    }

    @PermissionCallback
    private fun scanPermissionCallback(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is required for GATT inspection")
            return
        }
        startScan(call)
    }

    @PluginMethod
    fun inspect(call: PluginCall) {
        if (!hasBleFeature(call)) return
        if (!hasBluetoothPermission()) {
            requestPermissionForAlias(permissionAlias(), call, "inspectPermissionCallback")
            return
        }
        startInspection(call)
    }

    @PermissionCallback
    private fun inspectPermissionCallback(call: PluginCall) {
        if (!hasBluetoothPermission()) {
            call.reject("Bluetooth permission is required for GATT inspection")
            return
        }
        startInspection(call)
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
            call.reject("Bluetooth is disabled")
            return
        }
        stopScan()
        closeGatt()
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

        val devices = JSArray()
        scanResults.values.forEach { result ->
            val device = JSObject()
            device.put("id", result.device.address)
            device.put("name", result.scanRecord?.deviceName ?: "VEEPEAK")
            device.put("rssi", result.rssi)
            devices.put(device)
        }
        val response = JSObject()
        response.put("devices", devices)
        call.resolve(response)
    }

    private fun finishScanWithError(message: String) {
        val call = activeScanCall ?: return
        stopNativeScan()
        activeScanCall = null
        call.reject(message)
    }

    private fun stopScan() {
        handler.removeCallbacksAndMessages(null)
        stopNativeScan()
        activeScanCall?.reject("BLE scan cancelled")
        activeScanCall = null
    }

    private fun stopNativeScan() {
        if (!hasBluetoothPermission()) return
        try {
            bluetoothAdapter(null)?.bluetoothLeScanner?.stopScan(scanCallback)
        } catch (_: SecurityException) {
            // Permission can be revoked while the application is active.
        }
    }

    private fun startInspection(call: PluginCall) {
        val deviceId = call.getString("deviceId")
        val result = deviceId?.let(scanResults::get)
        if (result == null) {
            call.reject("Select a VEEPEAK device from the latest scan")
            return
        }

        closeGatt()
        activeInspectionCall = call
        try {
            bluetoothGatt = result.device.connectGatt(
                context,
                false,
                inspectionCallback,
                BluetoothDevice.TRANSPORT_LE
            )
        } catch (error: SecurityException) {
            activeInspectionCall = null
            call.reject("Bluetooth permission was denied", null, error)
        }
    }

    private val inspectionCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failInspection("GATT connection failed with status $status")
                return
            }
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                try {
                    if (!gatt.discoverServices()) {
                        failInspection("GATT service discovery could not start")
                    }
                } catch (error: SecurityException) {
                    failInspection("Bluetooth permission was denied", error)
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                failInspection("GATT device disconnected before discovery completed")
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failInspection("GATT service discovery failed with status $status")
                return
            }

            val call = activeInspectionCall ?: return
            activeInspectionCall = null
            val response = inventoryJson(gatt)
            call.resolve(response)
        }
    }

    private fun inventoryJson(gatt: BluetoothGatt): JSObject {
        val response = JSObject()
        val device = JSObject()
        device.put("id", gatt.device.address)
        device.put("name", scanResults[gatt.device.address]?.scanRecord?.deviceName ?: "VEEPEAK")
        response.put("device", device)

        val services = JSArray()
        gatt.services.forEach { services.put(serviceJson(it)) }
        response.put("services", services)
        return response
    }

    private fun serviceJson(service: BluetoothGattService): JSObject {
        val result = JSObject()
        result.put("uuid", service.uuid.toString())
        val characteristics = JSArray()
        service.characteristics.forEach { characteristics.put(characteristicJson(it)) }
        result.put("characteristics", characteristics)
        return result
    }

    private fun characteristicJson(characteristic: BluetoothGattCharacteristic): JSObject {
        val result = JSObject()
        result.put("uuid", characteristic.uuid.toString())
        val flags = characteristic.properties
        val properties = JSObject()
        properties.put("read", flags and BluetoothGattCharacteristic.PROPERTY_READ != 0)
        properties.put("write", flags and BluetoothGattCharacteristic.PROPERTY_WRITE != 0)
        properties.put(
            "writeWithoutResponse",
            flags and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
        )
        properties.put("notify", flags and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0)
        properties.put("indicate", flags and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0)
        result.put("properties", properties)

        val descriptors = JSArray()
        characteristic.descriptors.forEach { descriptors.put(descriptorJson(it)) }
        result.put("descriptors", descriptors)
        return result
    }

    private fun descriptorJson(descriptor: BluetoothGattDescriptor): JSObject {
        val result = JSObject()
        result.put("uuid", descriptor.uuid.toString())
        return result
    }

    private fun failInspection(message: String, error: Exception? = null) {
        val call = activeInspectionCall
        activeInspectionCall = null
        closeGatt()
        if (error == null) call?.reject(message) else call?.reject(message, null, error)
    }

    private fun closeGatt() {
        activeInspectionCall?.reject("GATT inspection cancelled")
        activeInspectionCall = null
        try {
            bluetoothGatt?.disconnect()
        } catch (_: SecurityException) {
            // Closing must remain best-effort if permission is revoked.
        } finally {
            bluetoothGatt?.close()
            bluetoothGatt = null
        }
    }

    private fun hasBleFeature(call: PluginCall): Boolean {
        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            call.unavailable("Bluetooth LE is unavailable on this Android device")
            return false
        }
        return true
    }

    private fun hasBluetoothPermission(): Boolean =
        getPermissionState(permissionAlias()) == PermissionState.GRANTED

    private fun permissionAlias(): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetoothModern" else "bluetoothLegacy"

    private fun bluetoothAdapter(call: PluginCall?): BluetoothAdapter? {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = manager.adapter
        if (adapter == null) call?.unavailable("Bluetooth is unavailable on this Android device")
        return adapter
    }

    companion object {
        private const val SCAN_DURATION_MS = 5_000L
    }
}
