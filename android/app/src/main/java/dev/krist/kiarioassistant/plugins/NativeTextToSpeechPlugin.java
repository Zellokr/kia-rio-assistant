package dev.krist.kiarioassistant.plugins;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "NativeTextToSpeech")
public class NativeTextToSpeechPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private static final Locale SPANISH_LOCALE = Locale.forLanguageTag("es-ES");
    private static final long START_TIMEOUT_MS = 8000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech textToSpeech;
    private boolean initialized = false;
    private boolean initializationFailed = false;
    private final List<PluginCall> pendingSpeakCalls = new ArrayList<>();
    private PluginCall activeSpeakCall;
    private String activeUtteranceId;
    private Runnable activeStartTimeout;
    private Runnable initializationTimeout;

    @Override
    public void load() {
        textToSpeech = new TextToSpeech(getContext(), this);
        initializationTimeout = () -> {
            if (initialized || initializationFailed) {
                return;
            }

            initializationFailed = true;
            rejectPending("El motor de voz del dispositivo no respondió al iniciar.");

            if (textToSpeech != null) {
                textToSpeech.shutdown();
                textToSpeech = null;
            }
        };
        handler.postDelayed(initializationTimeout, START_TIMEOUT_MS);
    }

    @Override
    protected void handleOnDestroy() {
        clearInitializationTimeout();
        cancelActiveUtterance();

        if (textToSpeech != null) {
            textToSpeech.shutdown();
            textToSpeech = null;
        }

        super.handleOnDestroy();
    }

    @Override
    public void onInit(int status) {
        clearInitializationTimeout();

        if (initializationFailed) {
            return;
        }

        if (status != TextToSpeech.SUCCESS || textToSpeech == null) {
            initializationFailed = true;
            rejectPending("El motor de voz del dispositivo no está disponible.");
            return;
        }

        int languageStatus = textToSpeech.setLanguage(SPANISH_LOCALE);

        if (languageStatus == TextToSpeech.LANG_MISSING_DATA) {
            initializationFailed = true;
            rejectPending("Faltan datos de voz en español. Instala el paquete de voz en español en los ajustes del sistema.");
            return;
        }

        if (languageStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
            initializationFailed = true;
            rejectPending("El motor de voz no admite español. Instala o activa una voz en español en los ajustes del sistema.");
            return;
        }

        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                resolveIfActive(utteranceId);
            }

            @Override
            public void onDone(String utteranceId) {
                clearIfActive(utteranceId);
            }

            @Override
            @Deprecated
            public void onError(String utteranceId) {
                rejectIfActive(utteranceId, "El motor de voz falló antes de emitir audio.");
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                rejectIfActive(utteranceId, "El motor de voz falló antes de emitir audio (código " + errorCode + ").");
            }
        });

        initialized = true;
        drainPendingSpeakCalls();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");

        if (text == null || text.trim().isEmpty()) {
            call.reject("No hay texto para leer en voz alta.");
            return;
        }

        if (initializationFailed) {
            call.reject("El motor de voz del dispositivo no está disponible.");
            return;
        }

        if (!initialized) {
            pendingSpeakCalls.add(call);
            return;
        }

        speakNow(call, text);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        resolvePending();
        cancelActiveUtterance();
        call.resolve();
    }

    private void drainPendingSpeakCalls() {
        List<PluginCall> calls = new ArrayList<>(pendingSpeakCalls);
        pendingSpeakCalls.clear();

        for (PluginCall call : calls) {
            String text = call.getString("text");
            speakNow(call, text == null ? "" : text);
        }
    }

    private void speakNow(PluginCall call, String text) {
        if (textToSpeech == null) {
            call.reject("El motor de voz del dispositivo no está disponible.");
            return;
        }

        cancelActiveUtterance();

        String utteranceId = UUID.randomUUID().toString();
        activeSpeakCall = call;
        activeUtteranceId = utteranceId;

        activeStartTimeout = () -> rejectIfActive(
            utteranceId,
            "El motor de voz no emitió ningún sonido. Se da por no funcional."
        );
        handler.postDelayed(activeStartTimeout, START_TIMEOUT_MS);

        int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);

        if (result == TextToSpeech.ERROR) {
            rejectIfActive(utteranceId, "El motor de voz no pudo iniciar la lectura en voz alta.");
        }
    }

    private void resolveIfActive(String utteranceId) {
        PluginCall call = activeSpeakCall;

        if (call == null || !utteranceId.equals(activeUtteranceId)) {
            return;
        }

        clearActiveStartTimeout();
        activeSpeakCall = null;

        JSObject response = new JSObject();
        response.put("started", true);
        call.resolve(response);
    }

    private void rejectIfActive(String utteranceId, String message) {
        PluginCall call = activeSpeakCall;

        if (call == null || !utteranceId.equals(activeUtteranceId)) {
            return;
        }

        clearActiveStartTimeout();
        activeSpeakCall = null;
        activeUtteranceId = null;
        call.reject(message);
    }

    private void clearIfActive(String utteranceId) {
        if (utteranceId.equals(activeUtteranceId)) {
            clearActiveStartTimeout();
            activeSpeakCall = null;
            activeUtteranceId = null;
        }
    }

    private void cancelActiveUtterance() {
        if (textToSpeech != null) {
            textToSpeech.stop();
        }

        clearActiveStartTimeout();

        if (activeSpeakCall != null) {
            activeSpeakCall.resolve();
        }

        activeSpeakCall = null;
        activeUtteranceId = null;
    }

    private void clearActiveStartTimeout() {
        if (activeStartTimeout != null) {
            handler.removeCallbacks(activeStartTimeout);
            activeStartTimeout = null;
        }
    }

    private void clearInitializationTimeout() {
        if (initializationTimeout != null) {
            handler.removeCallbacks(initializationTimeout);
            initializationTimeout = null;
        }
    }

    private void rejectPending(String message) {
        for (PluginCall call : pendingSpeakCalls) {
            call.reject(message);
        }

        pendingSpeakCalls.clear();
    }

    private void resolvePending() {
        for (PluginCall call : pendingSpeakCalls) {
            call.resolve();
        }

        pendingSpeakCalls.clear();
    }
}
