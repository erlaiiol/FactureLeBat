#!/bin/sh
# iOS counterpart of `make android-bundle`: builds the production web bundle,
# syncs it into the Xcode project, bumps the build number, then produces a
# signed App Store archive (.xcarchive) and its exported .ipa — no clicking
# through Xcode's Product > Archive.
#
# Always the real API domain (facturele.net) — an App Store submission can
# only ever be the production build, so there's no LOCAL_HOST variant.
#
# Signing is Xcode's automatic signing (team A899CGSWX8, project.pbxproj)
# plus -allowProvisioningUpdates: xcodebuild reuses the Apple ID signed into
# Xcode > Settings > Accounts to fetch/create the App Store provisioning
# profile and distribution certificate (cloud-managed if none is in the
# local keychain). That account must therefore be signed in once in Xcode.
#
# UPLOAD=1 also sends the build straight to App Store Connect (export
# destination "upload") — it then shows up under TestFlight after Apple's
# processing (~5-15 min), ready to attach to a version and submit for
# review. Without it, the archive is opened in Xcode's Organizer so you can
# check it and click "Distribute App" yourself.
#
# App Store Connect rejects a build number (CFBundleVersion =
# CURRENT_PROJECT_VERSION) it has already seen for the same marketing
# version, so this bumps it in project.pbxproj first — a real edit to a
# committed file, commit it with the release (same as android-bundle).
# MARKETING_VERSION (the "1.3" users see) is left alone: change it by hand
# in Xcode when you want a new public version number.
#
#   sh scripts/archive-ios.sh            # archive + .ipa + open Organizer
#   UPLOAD=1 sh scripts/archive-ios.sh   # archive + upload to App Store Connect
set -eu

cd "$(dirname "$0")/.." # frontend/

case "$(xcode-select -p 2>/dev/null || true)" in
*CommandLineTools* | "")
	echo "==> Xcode complet requis (pas juste les Command Line Tools). sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
	exit 1
	;;
esac

PBXPROJ=ios/App/App.xcodeproj/project.pbxproj
PLIST=ios/App/App/Info.plist
RELEASES=ios/releases
ARCHIVE="$RELEASES/App.xcarchive"

# The dev-only ATS cleartext exception must never ship (see Info.plist and
# run-ios.sh) — refuse to archive if it's been left uncommented.
# The block ships wrapped in a standalone `<!--` line right above its key.
if ! grep -B1 "<key>NSAppTransportSecurity</key>" "$PLIST" | grep -q "^[[:space:]]*<!--[[:space:]]*$"; then
	echo "==> $PLIST contient l'exception ATS de dev non commentée — restaure-la (git checkout -- $PLIST) avant d'archiver." >&2
	exit 1
fi

echo "==> Build prod — API sur https://facturele.net"
npx ng build --configuration production
npx cap sync ios

current=$(sed -n 's/.*CURRENT_PROJECT_VERSION = \([0-9][0-9]*\);.*/\1/p' "$PBXPROJ" | sort -n | tail -n1)
if [ -z "$current" ]; then
	echo "==> CURRENT_PROJECT_VERSION introuvable dans $PBXPROJ" >&2
	exit 1
fi
next=$((current + 1))
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9][0-9]*;/CURRENT_PROJECT_VERSION = $next;/g" "$PBXPROJ"
marketing=$(sed -n 's/.*MARKETING_VERSION = \([^;]*\);.*/\1/p' "$PBXPROJ" | head -n1)
echo "==> Build number bumpé : $current -> $next (version $marketing)"

rm -rf "$ARCHIVE"
mkdir -p "$RELEASES"

echo "==> Archive (Release, generic/platform=iOS)"
xcodebuild \
	-project ios/App/App.xcodeproj \
	-scheme App \
	-configuration Release \
	-destination "generic/platform=iOS" \
	-archivePath "$ARCHIVE" \
	-allowProvisioningUpdates \
	archive

if [ "${UPLOAD:-}" = "1" ]; then
	DESTINATION=upload
else
	DESTINATION=export
fi

EXPORT_OPTIONS=$(mktemp -t ExportOptions).plist
trap 'rm -f "$EXPORT_OPTIONS"' EXIT
cat >"$EXPORT_OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>$DESTINATION</string>
	<key>teamID</key>
	<string>A899CGSWX8</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>uploadSymbols</key>
	<true/>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
</dict>
</plist>
EOF

echo "==> Export ($DESTINATION)"
xcodebuild \
	-exportArchive \
	-archivePath "$ARCHIVE" \
	-exportPath "$RELEASES" \
	-exportOptionsPlist "$EXPORT_OPTIONS" \
	-allowProvisioningUpdates

if [ "$DESTINATION" = "upload" ]; then
	echo "==> Build $marketing ($next) envoyé à App Store Connect — visible dans TestFlight après traitement, puis à rattacher à la version et soumettre en review."
else
	echo "==> Archive : frontend/$ARCHIVE"
	echo "==> .ipa    : frontend/$RELEASES/App.ipa"
	open "$ARCHIVE" # imports it into Xcode > Window > Organizer
	echo "==> Ouvert dans l'Organizer Xcode — « Distribute App » > App Store Connect pour l'envoyer (ou relance avec UPLOAD=1)."
fi
