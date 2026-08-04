package fr.facturele.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // See ApiPassthroughWebViewClient's own comment for why this
        // replacement is necessary. Must run after super.onCreate(), which
        // is what actually constructs the Bridge/WebView this reads.
        getBridge().setWebViewClient(new ApiPassthroughWebViewClient(getBridge()));
    }
}
