package com.novastore.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "NovaCustomerSession")
public final class NovaCustomerSessionPlugin extends Plugin {
    private static final Object STORAGE_LOCK = new Object();
    private static final String KEYSTORE = "AndroidKeyStore";
    static final String KEY_ALIAS = "novastore_customer_session_v1";
    static final String PREFERENCES = "novastore_customer_session_secure";
    static final String ENVELOPE_KEY = "encrypted_envelope_v1";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final int MAX_CREDENTIAL_LENGTH = 8192;
    private static final Set<String> LEGACY_SESSION_KEYS = immutableSet("accessToken");
    private static final Set<String> COMPLETE_SESSION_KEYS = immutableSet(
        "accessToken",
        "refreshToken",
        "accessExpiresAt",
        "refreshExpiresAt",
        "sessionId"
    );

    private static Set<String> immutableSet(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }

    @PluginMethod
    public void load(PluginCall call) {
        try {
            call.resolve(resultFor(loadStoredEnvelope()));
        } catch (SessionStorageException failure) {
            call.reject(failure.code);
        } catch (Exception failure) {
            call.reject("CUSTOMER_SESSION_STORAGE_INVALID");
        }
    }

    @PluginMethod
    public void replace(PluginCall call) {
        try {
            call.resolve(resultFor(replaceStoredEnvelope(expectedGeneration(call), call.getObject("session"))));
        } catch (SessionStorageException failure) {
            call.reject(failure.code);
        } catch (Exception failure) {
            call.reject("CUSTOMER_SESSION_STORAGE_FAILED");
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            call.resolve(resultFor(clearStoredEnvelope(expectedGeneration(call))));
        } catch (SessionStorageException failure) {
            call.reject(failure.code);
        } catch (Exception failure) {
            call.reject("CUSTOMER_SESSION_STORAGE_FAILED");
        }
    }

    /** Package-private so Android instrumentation exercises the production storage path. */
    JSONObject loadStoredEnvelope() throws SessionStorageException {
        synchronized (STORAGE_LOCK) {
            try {
                return readEnvelope();
            } catch (Exception failure) {
                recoverCorruptEnvelope();
                throw new SessionStorageException("CUSTOMER_SESSION_STORAGE_INVALID", failure);
            }
        }
    }

    /** Package-private so Android instrumentation exercises the production CAS path. */
    JSONObject replaceStoredEnvelope(long expectedGeneration, JSONObject input) throws SessionStorageException {
        synchronized (STORAGE_LOCK) {
            try {
                if (expectedGeneration < 0) {
                    throw new SessionStorageException("CUSTOMER_SESSION_GENERATION_INVALID");
                }
                JSONObject current = readEnvelope();
                if (current.optLong("generation", -1L) != expectedGeneration) {
                    throw new SessionStorageException("CUSTOMER_SESSION_GENERATION_STALE");
                }
                JSONObject session = canonicalSession(input);
                if (session == null) {
                    throw new SessionStorageException("CUSTOMER_SESSION_STORAGE_INPUT_INVALID");
                }
                JSONObject replacement = new JSONObject();
                replacement.put("generation", Math.addExact(expectedGeneration, 1L));
                replacement.put("session", session);
                writeEnvelope(replacement);
                return replacement;
            } catch (SessionStorageException failure) {
                throw failure;
            } catch (ArithmeticException failure) {
                throw new SessionStorageException("CUSTOMER_SESSION_GENERATION_INVALID", failure);
            } catch (Exception failure) {
                throw new SessionStorageException("CUSTOMER_SESSION_STORAGE_FAILED", failure);
            }
        }
    }

    /** Package-private so Android instrumentation exercises the production tombstone path. */
    JSONObject clearStoredEnvelope(long expectedGeneration) throws SessionStorageException {
        synchronized (STORAGE_LOCK) {
            try {
                if (expectedGeneration < 0) {
                    throw new SessionStorageException("CUSTOMER_SESSION_GENERATION_INVALID");
                }
                JSONObject current = readEnvelope();
                if (current.optLong("generation", -1L) != expectedGeneration) {
                    throw new SessionStorageException("CUSTOMER_SESSION_GENERATION_STALE");
                }
                JSONObject tombstone = tombstoneEnvelope(Math.addExact(expectedGeneration, 1L));
                writeEnvelope(tombstone);
                return tombstone;
            } catch (SessionStorageException failure) {
                throw failure;
            } catch (ArithmeticException failure) {
                throw new SessionStorageException("CUSTOMER_SESSION_GENERATION_INVALID", failure);
            } catch (Exception failure) {
                throw new SessionStorageException("CUSTOMER_SESSION_STORAGE_FAILED", failure);
            }
        }
    }

    static final class SessionStorageException extends Exception {
        final String code;

        SessionStorageException(String code) {
            super(code);
            this.code = code;
        }

        SessionStorageException(String code, Throwable cause) {
            super(code, cause);
            this.code = code;
        }
    }

    private long expectedGeneration(PluginCall call) {
        Object raw = call.getData().opt("expectedGeneration");
        if (!(raw instanceof Number)) throw new IllegalArgumentException("GENERATION_MISSING");
        long generation = ((Number) raw).longValue();
        if (generation < 0 || ((Number) raw).doubleValue() != (double) generation) {
            throw new IllegalArgumentException("GENERATION_INVALID");
        }
        return generation;
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private JSONObject emptyEnvelope() throws Exception {
        return tombstoneEnvelope(0L);
    }

    private JSONObject tombstoneEnvelope(long generation) throws Exception {
        JSONObject envelope = new JSONObject();
        envelope.put("generation", generation);
        envelope.put("session", JSONObject.NULL);
        return envelope;
    }

    private void recoverCorruptEnvelope() {
        try {
            // Generation zero means a virgin store and permits one-time legacy
            // migration. A recovered store must never regain that meaning.
            writeEnvelope(tombstoneEnvelope(1L));
        } catch (Exception ignored) {
            // Keep the original corrupt ciphertext fail-closed when the
            // keystore cannot encrypt a recovery tombstone.
        }
    }

    private JSONObject readEnvelope() throws Exception {
        String encoded = preferences().getString(ENVELOPE_KEY, null);
        if (encoded == null || encoded.isEmpty()) return emptyEnvelope();
        byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
        if (packed.length <= IV_BYTES) throw new IllegalArgumentException("ENVELOPE_TRUNCATED");
        byte[] iv = new byte[IV_BYTES];
        byte[] ciphertext = new byte[packed.length - IV_BYTES];
        ByteBuffer.wrap(packed).get(iv).get(ciphertext);
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        JSONObject envelope = new JSONObject(new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
        long generation = envelope.optLong("generation", -1L);
        if (generation < 0) throw new IllegalArgumentException("GENERATION_INVALID");
        Object rawSession = envelope.opt("session");
        if (rawSession != null && rawSession != JSONObject.NULL) {
            if (!(rawSession instanceof JSONObject) || canonicalSession((JSONObject) rawSession) == null) {
                throw new IllegalArgumentException("SESSION_INVALID");
            }
        }
        return envelope;
    }

    private void writeEnvelope(JSONObject envelope) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_BYTES) throw new IllegalStateException("IV_INVALID");
        byte[] ciphertext = cipher.doFinal(envelope.toString().getBytes(StandardCharsets.UTF_8));
        ByteBuffer packed = ByteBuffer.allocate(iv.length + ciphertext.length).put(iv).put(ciphertext);
        String encoded = Base64.encodeToString(packed.array(), Base64.NO_WRAP);
        if (!preferences().edit().putString(ENVELOPE_KEY, encoded).commit()) {
            throw new IllegalStateException("PERSIST_FAILED");
        }
    }

    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private JSObject resultFor(JSONObject envelope) throws Exception {
        JSObject result = new JSObject();
        result.put("generation", envelope.getLong("generation"));
        Object session = envelope.opt("session");
        result.put("session", session == null ? JSONObject.NULL : session);
        return result;
    }

    static JSONObject canonicalSession(JSONObject input) {
        if (input == null) return null;
        String accessToken = canonicalCredential(nullableString(input, "accessToken"));
        if (accessToken == null) return null;
        boolean hasRefresh = hasNonNull(input, "refreshToken")
            || hasNonNull(input, "accessExpiresAt")
            || hasNonNull(input, "refreshExpiresAt")
            || hasNonNull(input, "sessionId");
        Set<String> actualKeys = new HashSet<>();
        Iterator<String> keys = input.keys();
        while (keys.hasNext()) actualKeys.add(keys.next());
        String refreshToken = nullableString(input, "refreshToken");
        String accessExpiresAt = nullableString(input, "accessExpiresAt");
        String refreshExpiresAt = nullableString(input, "refreshExpiresAt");
        Object sessionValue = input.opt("sessionId");
        if (!validSessionEnvelope(actualKeys, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, sessionValue)) return null;

        JSONObject normalized = new JSONObject();
        try {
            normalized.put("accessToken", accessToken);
            if (!hasRefresh) return normalized;
            long sessionId = ((Number) sessionValue).longValue();
            normalized.put("refreshToken", canonicalCredential(refreshToken));
            normalized.put("accessExpiresAt", canonicalTimestamp(accessExpiresAt));
            normalized.put("refreshExpiresAt", canonicalTimestamp(refreshExpiresAt));
            normalized.put("sessionId", sessionId);
            return normalized;
        } catch (Exception failure) {
            return null;
        }
    }

    static boolean validSessionEnvelope(
        Set<String> actualKeys,
        String accessToken,
        String refreshToken,
        String accessExpiresAt,
        String refreshExpiresAt,
        Object sessionValue
    ) {
        if (canonicalCredential(accessToken) == null) return false;
        boolean hasRefresh = actualKeys.stream().anyMatch(key -> !"accessToken".equals(key));
        if (!hasRefresh) return actualKeys.equals(LEGACY_SESSION_KEYS);
        if (!actualKeys.equals(COMPLETE_SESSION_KEYS)) return false;
        if (canonicalCredential(refreshToken) == null || canonicalTimestamp(accessExpiresAt) == null || canonicalTimestamp(refreshExpiresAt) == null) return false;
        if (!(sessionValue instanceof Number)) return false;
        long sessionId = ((Number) sessionValue).longValue();
        return sessionId > 0 && ((Number) sessionValue).doubleValue() == (double) sessionId;
    }

    private static boolean hasNonNull(JSONObject source, String key) {
        return source.has(key) && !source.isNull(key);
    }

    private static String nullableString(JSONObject source, String key) {
        Object value = source.opt(key);
        return value instanceof String ? ((String) value).trim() : "";
    }

    static String canonicalCredential(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.length() < 16 || normalized.length() > MAX_CREDENTIAL_LENGTH) return null;
        return normalized.chars().anyMatch(Character::isWhitespace) ? null : normalized;
    }

    static String canonicalTimestamp(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.length() < 20 || normalized.length() > 64) return null;
        return normalized.matches("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?$") ? normalized : null;
    }
}
