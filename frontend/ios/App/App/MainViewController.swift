import Capacitor

// Phase 1.7: registers StoreKitPurchasePlugin manually. Capacitor's
// autoRegisterPlugins mechanism (CapacitorBridge.registerPlugins(), see
// node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift)
// only ever discovers plugin classes from `capacitor.config.json`'s
// packageClassList — a list @capacitor/cli's `cap sync` step builds by
// scanning each *npm-installed* Capacitor plugin's own declared iOS source
// directory (see @capacitor/cli/dist/util/iosplugin.js's getPluginFiles/
// findPluginClasses). It never scans this app's own ios/App/App/ source
// tree at all, so a local, hand-written plugin like StoreKitPurchasePlugin
// — correctly `@objc`-named and CAPBridgedPlugin-conformant, but not an
// npm package — is never added to that list and never auto-registered,
// however correct its own code is. Confirmed empirically: its load()
// never fired, and Console.app showed zero output from it at all, even
// though `App.xcodeproj` compiled and ran it fine.
//
// `registerPluginInstance(_:)` (CapacitorBridge.swift) is the one
// registration path with no autoRegisterPlugins guard — the officially
// documented way to add an extra plugin instance alongside the
// auto-registered ones, called from capacitorDidLoad() (CAPBridgeViewController's
// own documented override point, called once from viewDidLoad() after the
// bridge itself is constructed).
//
// Requires Main.storyboard's root view controller's customClass to be
// changed from Capacitor's stock CAPBridgeViewController to this class —
// done alongside this file. @objc(MainViewController) pins the Objective-C
// runtime name explicitly (same reasoning StoreKitPurchasePlugin.swift
// already has) so Interface Builder's class lookup doesn't depend on
// getting the Swift module name right in customModule — which is
// "FactureLe" here (PRODUCT_NAME in project.pbxproj), not "App" (the Xcode
// target's own name); confusing the two produced a real "Unknown class" IB
// failure (black screen) the first time this was wired up without this
// annotation.
@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StoreKitPurchasePlugin())
    }
}
