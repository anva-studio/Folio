package com.anva.folio;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
 @Override public void onCreate(android.os.Bundle state){registerPlugin(FolioExternalPlugin.class);super.onCreate(state);}
}
