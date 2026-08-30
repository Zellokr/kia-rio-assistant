package dev.krist.kiarioassistant;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import dev.krist.kiarioassistant.plugins.BleObdBridgePlugin;
import dev.krist.kiarioassistant.plugins.NativeTextToSpeechPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BleObdBridgePlugin.class);
        registerPlugin(NativeTextToSpeechPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
