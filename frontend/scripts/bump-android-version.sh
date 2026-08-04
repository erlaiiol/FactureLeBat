#!/bin/sh
# Bumps android/app/build.gradle's versionCode by 1 and mirrors it into
# versionName, called by `make android-bundle` before every release build.
# Play Console permanently rejects re-uploading a versionCode it's already
# seen, and every android-bundle run produces a build meant to be uploaded —
# so "next build = next version" needs no separate manual step or judgment
# call. versionName mirroring versionCode (rather than its own semver, e.g.
# "1.2.3") is a deliberate simplicity choice: one counter, never out of
# sync, nothing to remember to bump by hand. Revisit only if a
# marketing-facing version string actually becomes necessary.
#
# Leaves build.gradle's bump as an uncommitted change — commit it as part of
# shipping that release, same as any other source change.
set -eu

cd "$(dirname "$0")/../android" # frontend/android/

GRADLE_FILE=app/build.gradle

current=$(sed -n 's/.*versionCode \([0-9][0-9]*\).*/\1/p' "$GRADLE_FILE")
if [ -z "$current" ]; then
	echo "==> Impossible de trouver versionCode dans $GRADLE_FILE" >&2
	exit 1
fi
next=$((current + 1))

sed -i '' "s/versionCode $current/versionCode $next/" "$GRADLE_FILE"
sed -i '' "s/versionName \"[^\"]*\"/versionName \"$next\"/" "$GRADLE_FILE"

echo "==> Version bumpée : versionCode=$next, versionName=$next"
