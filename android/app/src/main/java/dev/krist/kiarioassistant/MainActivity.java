package dev.krist.kiarioassistant;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import dev.krist.kiarioassistant.plugins.BleObdBridgePlugin;
import dev.krist.kiarioassistant.plugins.GattInspectorPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GattInspectorPlugin.class);
        registerPlugin(BleObdBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
