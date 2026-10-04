package dev.takingbook.app;

import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

/**
 * Receives files other apps share to Taking Book (ACTION_SEND and ACTION_SEND_MULTIPLE).
 * The files are only described here (content URI, display name, MIME type); the web side
 * decides what is a PDF and reads the bytes, so sharing goes through the same import as
 * the file picker.
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {
    private static final String TAG = "ShareIntentPlugin";
    private static final String EVENT_RECEIVED = "sharesReceived";

    private final List<JSObject> pending = new ArrayList<>();

    @Override
    public void load() {
        // A share that cold-starts the app arrives as the launch intent, before any listener exists.
        collect(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (collect(intent)) {
            notifyListeners(EVENT_RECEIVED, new JSObject(), true);
        }
    }

    /** Returns the files shared since the last call, and forgets them. */
    @PluginMethod
    public void takePendingShares(PluginCall call) {
        JSArray files = new JSArray();
        synchronized (pending) {
            for (JSObject file : pending) files.put(file);
            pending.clear();
        }
        JSObject result = new JSObject();
        result.put("files", files);
        call.resolve(result);
    }

    private boolean collect(Intent intent) {
        if (intent == null) return false;
        List<Uri> uris = urisOf(intent);
        if (uris.isEmpty()) return false;
        synchronized (pending) {
            for (Uri uri : uris) pending.add(describe(uri, intent));
        }
        // getIntent() keeps returning this intent; neutralising it stops a recreated activity from adding the share again.
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.setClipData(null);
        return true;
    }

    @SuppressWarnings("deprecation")
    private List<Uri> urisOf(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return uris;
        ClipData clip = intent.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) uris.add(uri);
            }
        }
        if (uris.isEmpty()) {
            Uri single = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (single != null) uris.add(single);
        }
        return uris;
    }

    private JSObject describe(Uri uri, Intent intent) {
        JSObject file = new JSObject();
        file.put("uri", uri.toString());
        file.put("name", displayNameOf(uri));
        String mimeType = getContext().getContentResolver().getType(uri);
        if (mimeType == null && Intent.ACTION_SEND.equals(intent.getAction())) mimeType = intent.getType();
        file.put("mimeType", mimeType);
        return file;
    }

    private String displayNameOf(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null) return name;
            }
        } catch (RuntimeException error) {
            Log.e(TAG, "Could not read the name of " + uri + ": " + error);
        }
        String last = uri.getLastPathSegment();
        return last == null ? "shared-file" : last;
    }
}
