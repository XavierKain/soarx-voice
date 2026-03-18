#!/bin/bash
set -e

# ============================================================
# SoarXVoice Release Script
# Automates: version bump, build, TestFlight upload with notes
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# --- Config (App Store Connect API) ---
ASC_KEY_ID="${ASC_KEY_ID:-}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-}"
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/AuthKey_73PNP8Z93X.p8}"
BUNDLE_ID="com.xavier.soarxvoice"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Parse version from argument or CHANGELOG ---
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo ""
    echo "Usage: ./scripts/release.sh <version>"
    echo "  e.g. ./scripts/release.sh 1.5"
    echo ""
    exit 1
fi

# --- Extract changelog for this version ---
extract_changelog() {
    local ver="$1"
    local in_section=0
    local notes=""
    while IFS= read -r line; do
        if echo "$line" | grep -q "^## v${ver}"; then
            in_section=1
            continue
        fi
        if [ $in_section -eq 1 ] && echo "$line" | grep -q "^## v"; then
            break
        fi
        if [ $in_section -eq 1 ] && [ -n "$line" ]; then
            notes="${notes}${line}\n"
        fi
    done < CHANGELOG.md
    echo -e "$notes"
}

CHANGELOG_NOTES=$(extract_changelog "$VERSION")
if [ -z "$CHANGELOG_NOTES" ]; then
    error "No changelog entry found for v${VERSION} in CHANGELOG.md. Add it first!"
fi

info "Releasing v${VERSION}"
echo ""
echo "Changelog:"
echo "$CHANGELOG_NOTES"
echo ""

# --- Bump version numbers ---
info "Bumping version to ${VERSION}..."

# iOS: project.pbxproj
sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = ${VERSION};/g" \
    ios/SoarXVoice.xcodeproj/project.pbxproj

# Increment build number
CURRENT_BUILD=$(grep -m1 'CURRENT_PROJECT_VERSION' ios/SoarXVoice.xcodeproj/project.pbxproj | sed 's/[^0-9]//g')
NEW_BUILD=$((CURRENT_BUILD + 1))
sed -i '' "s/CURRENT_PROJECT_VERSION = ${CURRENT_BUILD};/CURRENT_PROJECT_VERSION = ${NEW_BUILD};/g" \
    ios/SoarXVoice.xcodeproj/project.pbxproj

# Android: build.gradle
CURRENT_VCODE=$(grep 'versionCode' android/app/build.gradle | sed 's/[^0-9]//g')
NEW_VCODE=$((CURRENT_VCODE + 1))
sed -i '' "s/versionCode ${CURRENT_VCODE}/versionCode ${NEW_VCODE}/" android/app/build.gradle
sed -i '' "s/versionName \"[^\"]*\"/versionName \"${VERSION}\"/" android/app/build.gradle

# HomeScreen version display
sed -i '' "s/v[0-9][0-9]*\.[0-9][0-9]*/v${VERSION}/" src/screens/HomeScreen.tsx

info "iOS: v${VERSION} (build ${NEW_BUILD}) | Android: v${VERSION} (code ${NEW_VCODE})"

# --- Build Android APK ---
info "Building Android APK..."
npx react-native bundle --platform android --dev false \
    --entry-file index.js \
    --bundle-output android/app/src/main/assets/index.android.bundle \
    --assets-dest android/app/src/main/res 2>&1 | tail -2

cd android
PATH="/opt/homebrew/opt/node@20/bin:$PATH" \
JAVA_HOME=$(/usr/libexec/java_home -v 17) \
./gradlew assembleRelease 2>&1 | tail -3
cd "$PROJECT_DIR"
info "Android APK ready: android/app/build/outputs/apk/release/app-release.apk"

# --- Build iOS Archive ---
info "Archiving iOS..."
cd ios
xcodebuild -workspace SoarXVoice.xcworkspace \
    -scheme SoarXVoice \
    -sdk iphoneos \
    -configuration Release \
    -archivePath /tmp/SoarXVoice.xcarchive \
    archive 2>&1 | grep -E "ARCHIVE (SUCCEEDED|FAILED)" || true
cd "$PROJECT_DIR"

# --- Export & Upload to TestFlight ---
info "Uploading to TestFlight..."
cat > /tmp/ExportOptions.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>S96H22CQ8W</string>
    <key>uploadSymbols</key>
    <true/>
    <key>destination</key>
    <string>upload</string>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
    -archivePath /tmp/SoarXVoice.xcarchive \
    -exportOptionsPlist /tmp/ExportOptions.plist \
    -exportPath /tmp/SoarXVoiceExport \
    -allowProvisioningUpdates 2>&1 | grep -E "EXPORT (SUCCEEDED|FAILED)|Uploaded" || true

# --- Set TestFlight "What to Test" via App Store Connect API ---
set_testflight_notes() {
    info "Setting TestFlight 'What to Test' notes..."
    python3 "$PROJECT_DIR/scripts/set-testflight-notes.py" "$NEW_BUILD" "$CHANGELOG_NOTES"
}

set_testflight_notes

# --- Summary ---
echo ""
echo "========================================="
info "Release v${VERSION} complete!"
echo "========================================="
echo "  iOS:     v${VERSION} (build ${NEW_BUILD}) — uploaded to TestFlight"
echo "  Android: v${VERSION} (code ${NEW_VCODE}) — android/app/build/outputs/apk/release/app-release.apk"
echo ""
