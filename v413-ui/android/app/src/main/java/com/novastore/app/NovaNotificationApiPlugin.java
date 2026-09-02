package com.novastore.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.Locale;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONTokener;

@CapacitorPlugin(name = "NovaNotificationApi")
public final class NovaNotificationApiPlugin extends Plugin {
    private static final Pattern READ_ONE = Pattern.compile("^/api/notifications/[1-9][0-9]*/read$");
    private static final Pattern CUSTOMER_ORDER_LIST = Pattern.compile("^/api/orders/user/[1-9][0-9]*$");
    private static final Pattern CUSTOMER_ORDER_CANCEL = Pattern.compile("^/api/orders/[1-9][0-9]*/cancel$");
    private static final Pattern CUSTOMER_RETURN = Pattern.compile("^/api/returns/[1-9][0-9]*$");
    private static final Pattern CUSTOMER_REVIEW_LIST = Pattern.compile("^/api/reviews/user/[1-9][0-9]*$");
    private static final Pattern CUSTOMER_SUPPORT_HISTORY = Pattern.compile("^/api/messages/history/[1-9][0-9]*$");
    private static final Pattern CUSTOMER_ADDRESS = Pattern.compile("^/api/addresses/[1-9][0-9]*$");
    private static final Pattern CUSTOMER_ADDRESS_DEFAULT = Pattern.compile("^/api/addresses/[1-9][0-9]*/default$");
    private static final Pattern PUBLIC_PRODUCT = Pattern.compile("^/api/products/[1-9][0-9]*$");
    private static final Pattern SAFE_CURSOR = Pattern.compile("^[A-Za-z0-9_-]{1,1024}$");
    private static final Pattern SAFE_PAYMENT_REF = Pattern.compile("^[A-Za-z0-9._:-]{1,160}$");
    private static final Pattern SAFE_POSITIVE_ID = Pattern.compile("^[1-9][0-9]{0,18}$");
    private static final Set<String> EXACT_GET = immutableSet(
        "/api/users/me",
        "/api/users/security-status",
        "/api/addresses",
        "/api/payments/capability",
        "/api/payments/status",
        "/api/returns/mine",
        "/api/questions/user",
        "/api/notifications/unread-count"
    );
    private static final Set<String> EXACT_POST = immutableSet(
        "/api/users/login",
        "/api/users/refresh",
        "/api/users/register",
        "/api/users/logout",
        "/api/users/change-password",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
        "/api/addresses",
        "/api/payments/agreements/preview",
        "/api/payments/initialize",
        "/api/returns",
        "/api/messages/send",
        "/api/notifications/android-push/tokens"
    );
    private static final Set<String> EXACT_PATCH = immutableSet(
        "/api/notifications/read-all",
        "/api/users/me"
    );
    private static final Set<String> EXACT_DELETE = immutableSet(
        "/api/notifications/android-push/tokens",
        "/api/notifications/android-push/tokens/session"
    );
    private static final Set<String> UNAUTHENTICATED_POST = immutableSet(
        "/api/users/login",
        "/api/users/refresh",
        "/api/users/register",
        "/api/auth/forgot-password",
        "/api/auth/reset-password"
    );
    private static final Set<String> SUPPORTED_METHODS = immutableSet("GET", "POST", "PUT", "PATCH", "DELETE");
    private static final Set<String> REFRESH_BODY_KEYS = immutableSet("refreshToken", "sessionId");
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;
    private static final int MAX_REQUEST_BYTES = 32 * 1024;

    @PluginMethod
    public void request(PluginCall call) {
        String path = canonicalPath(call.getString("path"));
        String method = canonicalMethod(call.getString("method"));
        if (path == null || method == null || !allowed(path, method)) {
            call.reject("CUSTOMER_NOTIFICATION_PATH_FORBIDDEN");
            return;
        }
        String token = canonicalToken(call.getString("token"));
        boolean authenticated = !("POST".equals(method) && UNAUTHENTICATED_POST.contains(path));
        if (authenticated && token == null) {
            call.reject("CUSTOMER_SESSION_MISSING");
            return;
        }
        JSObject body = call.getObject("body");
        if ("/api/users/refresh".equals(path) && (token != null || !validRefreshBody(body))) {
            call.reject("AUTH_REFRESH_REQUEST_INVALID");
            return;
        }
        if ("GET".equals(method) && body != null) {
            call.reject("CUSTOMER_NOTIFICATION_BODY_FORBIDDEN");
            return;
        }
        getBridge().execute(() -> execute(call, path, method, token, body));
    }

    @PluginMethod
    public void getNotificationCapability(PluginCall call) {
        int identifier = getContext().getResources().getIdentifier(
            "google_app_id",
            "string",
            getContext().getPackageName()
        );
        JSObject result = new JSObject();
        result.put("providerConfigured", identifier != 0);
        result.put("notificationsEnabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        result.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .setData(Uri.parse("package:" + getContext().getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openApprovedPaymentUrl(PluginCall call) {
        String value = call.getString("url");
        if (!isApprovedPaymentUrl(value)) {
            call.reject("PAYMENT_PROVIDER_URL_FORBIDDEN");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(value))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException failure) {
            call.reject("PAYMENT_PROVIDER_SURFACE_UNAVAILABLE");
        }
    }

    private void execute(PluginCall call, String path, String method, String token, JSObject body) {
        HttpURLConnection connection = null;
        try {
            URI base = validatedApiBase();
            URL endpoint = base.resolve(path.substring(1)).toURL();
            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setDoInput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                byte[] requestBytes = body.toString().getBytes(StandardCharsets.UTF_8);
                if (requestBytes.length > MAX_REQUEST_BYTES) throw new IOException("REQUEST_TOO_LARGE");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setFixedLengthStreamingMode(requestBytes.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(requestBytes);
                }
            }

            int status = connection.getResponseCode();
            String contentType = connection.getContentType();
            InputStream stream = status >= 200 && status < 400
                ? connection.getInputStream()
                : connection.getErrorStream();
            String responseBody = stream == null ? "" : readBounded(stream);
            if (!responseBody.isEmpty() && (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("application/json"))) {
                throw new IOException("CONTENT_TYPE_INVALID");
            }
            JSObject result = new JSObject();
            result.put("status", status);
            result.put("payload", responseBody.isEmpty() ? new JSObject() : new JSONTokener(responseBody).nextValue());
            call.resolve(result);
        } catch (IOException | JSONException | IllegalArgumentException failure) {
            call.reject("CUSTOMER_NOTIFICATION_REQUEST_FAILED");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private URI validatedApiBase() {
        URI base = URI.create(BuildConfig.NOVASTORE_API_BASE_URL);
        if (!NovaPublicStorePlugin.isApprovedApiBase(
            base,
            BuildConfig.DEBUG,
            BuildConfig.NOVASTORE_LOCAL_UAT
        )) {
            throw new IllegalArgumentException("CUSTOMER_NOTIFICATION_API_ORIGIN_INVALID");
        }
        return base;
    }

    static String canonicalMethod(String value) {
        if (value == null) return null;
        String method = value.trim().toUpperCase(Locale.ROOT);
        return SUPPORTED_METHODS.contains(method) ? method : null;
    }

    static String canonicalPath(String value) {
        if (value == null || value.length() < 1 || value.length() > 2048 || !value.startsWith("/") || value.startsWith("//")) return null;
        if (value.indexOf('\\') >= 0 || value.indexOf('#') >= 0 || value.indexOf('%') >= 0 || value.chars().anyMatch(character -> character < 0x20 || character == 0x7f)) return null;
        try {
            URI parsed = URI.create("https://novastore.invalid" + value);
            if (!"novastore.invalid".equals(parsed.getHost()) || parsed.getRawUserInfo() != null || parsed.getRawFragment() != null) return null;
            if (!parsed.normalize().equals(parsed)) return null;
            String path = parsed.getPath();
            if ("/api/notifications".equals(path)) {
                String query = parsed.getRawQuery();
                if (query == null || query.isEmpty()) return path;
                Set<String> seen = new HashSet<>();
                for (String item : query.split("&")) {
                    String[] pair = item.split("=", 2);
                    if (pair.length != 2) return null;
                    if (!seen.add(pair[0])) return null;
                    if ("limit".equals(pair[0])) {
                        int limit = Integer.parseInt(pair[1]);
                        if (limit < 1 || limit > 100) return null;
                    } else if ("cursor".equals(pair[0])) {
                        if (!SAFE_CURSOR.matcher(pair[1]).matches()) return null;
                    } else return null;
                }
                return path + "?" + query;
            }
            if ("/api/payments/status".equals(path)) {
                String query = parsed.getRawQuery();
                if (query == null || query.isEmpty()) return null;
                Set<String> seen = new HashSet<>();
                for (String item : query.split("&")) {
                    String[] pair = item.split("=", 2);
                    if (pair.length != 2 || !seen.add(pair[0])) return null;
                    if ("paymentRef".equals(pair[0])) {
                        if (!SAFE_PAYMENT_REF.matcher(pair[1]).matches()) return null;
                    } else if ("orderId".equals(pair[0])) {
                        if (!SAFE_POSITIVE_ID.matcher(pair[1]).matches()) return null;
                    } else return null;
                }
                if (!seen.contains("paymentRef") || seen.size() > 2) return null;
                return path + "?" + query;
            }
            return parsed.getRawQuery() == null ? path : null;
        } catch (IllegalArgumentException failure) {
            return null;
        }
    }

    static boolean allowed(String pathWithQuery, String method) {
        String path = pathWithQuery.split("\\?", 2)[0];
        if ("GET".equals(method) && (
            EXACT_GET.contains(path)
                || "/api/notifications".equals(path)
                || CUSTOMER_ORDER_LIST.matcher(path).matches()
                || CUSTOMER_RETURN.matcher(path).matches()
                || CUSTOMER_REVIEW_LIST.matcher(path).matches()
                || CUSTOMER_SUPPORT_HISTORY.matcher(path).matches()
                || PUBLIC_PRODUCT.matcher(path).matches()
        )) return true;
        if ("POST".equals(method) && EXACT_POST.contains(path)) return true;
        if ("POST".equals(method) && CUSTOMER_ORDER_CANCEL.matcher(path).matches()) return true;
        if ("PUT".equals(method) && CUSTOMER_ADDRESS.matcher(path).matches()) return true;
        if ("PATCH".equals(method) && (EXACT_PATCH.contains(path) || READ_ONE.matcher(path).matches() || CUSTOMER_ADDRESS_DEFAULT.matcher(path).matches())) return true;
        return "DELETE".equals(method) && (EXACT_DELETE.contains(path) || CUSTOMER_ADDRESS.matcher(path).matches());
    }

    static boolean validRefreshBody(JSObject body) {
        if (body == null) return false;
        Set<String> keys = new HashSet<>();
        Iterator<String> iterator = body.keys();
        while (iterator.hasNext()) keys.add(iterator.next());
        return validRefreshEnvelope(keys, body.optString("refreshToken", null), body.opt("sessionId"));
    }

    static boolean validRefreshEnvelope(Set<String> keys, String refreshToken, Object rawSessionId) {
        if (!keys.equals(REFRESH_BODY_KEYS) || canonicalToken(refreshToken) == null) return false;
        if (!(rawSessionId instanceof Number)) return false;
        long sessionId = ((Number) rawSessionId).longValue();
        return sessionId > 0 && ((Number) rawSessionId).doubleValue() == (double) sessionId;
    }

    private static Set<String> immutableSet(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }

    static String canonicalToken(String value) {
        if (value == null) return null;
        String token = value.trim();
        if (token.length() < 16 || token.length() > 8192 || token.chars().anyMatch(Character::isWhitespace)) return null;
        return token;
    }

    static boolean isApprovedPaymentUrl(String value) {
        if (value == null || value.length() < 1 || value.length() > 4096) return false;
        try {
            URI uri = URI.create(value.trim());
            String path = uri.getRawPath();
            return "https".equalsIgnoreCase(uri.getScheme())
                && "www.paytr.com".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null
                && uri.getRawFragment() == null
                && path != null
                && path.startsWith("/odeme/guvenli/")
                && path.length() > "/odeme/guvenli/".length();
        } catch (IllegalArgumentException failure) {
            return false;
        }
    }

    private String readBounded(InputStream input) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = source.read(buffer)) != -1) {
                total += read;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("RESPONSE_TOO_LARGE");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
