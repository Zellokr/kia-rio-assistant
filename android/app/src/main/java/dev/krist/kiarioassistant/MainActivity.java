package dev.krist.kiarioassistant;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import dev.krist.kiarioassistant.plugins.BleObdBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BleObdBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
