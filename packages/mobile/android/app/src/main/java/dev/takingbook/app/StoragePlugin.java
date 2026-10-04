package dev.takingbook.app;

import android.os.StatFs;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports the free space where the app keeps its Books. No Capacitor plugin
 * exposes it, and the sync needs it to stop downloading when storage runs low.
 */
@CapacitorPlugin(name = "Storage")
public class StoragePlugin extends Plugin {

    @PluginMethod
    public void getFreeBytes(PluginCall call) {
        try {
            StatFs stat = new StatFs(getContext().getFilesDir().getAbsolutePath());
            JSObject result = new JSObject();
            // JavaScript numbers hold integers exactly up to 2^53, far beyond any phone's storage.
            result.put("freeBytes", stat.getAvailableBytes());
            call.resolve(result);
        } catch (IllegalArgumentException error) {
            call.reject("Could not read the free storage: " + error.getMessage());
        }
    }
}
