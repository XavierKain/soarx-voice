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
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey.p8}"
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
    if [ -z "$ASC_KEY_ID" ] || [ -z "$ASC_ISSUER_ID" ] || [ ! -f "$ASC_KEY_PATH" ]; then
        warn "App Store Connect API not configured. Skipping auto-notes."
        warn "To enable, set: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH"
        warn "See: https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api"
        return 1
    fi

    info "Setting TestFlight 'What to Test' notes..."

    # Generate JWT
    local HEADER=$(printf '{"alg":"ES256","kid":"%s","typ":"JWT"}' "$ASC_KEY_ID" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
    local NOW=$(date +%s)
    local EXP=$((NOW + 1200))
    local PAYLOAD=$(printf '{"iss":"%s","iat":%d,"exp":%d,"aud":"appstoreconnect-v1"}' "$ASC_ISSUER_ID" "$NOW" "$EXP" | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
    local SIGNATURE=$(printf '%s.%s' "$HEADER" "$PAYLOAD" | openssl dgst -sha256 -sign "$ASC_KEY_PATH" -binary | openssl base64 -e -A | tr '+/' '-_' | tr -d '=')
    local JWT="${HEADER}.${PAYLOAD}.${SIGNATURE}"

    # Find the build
    local BUILDS_RESPONSE=$(curl -s -H "Authorization: Bearer $JWT" \
        "https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${BUNDLE_ID}&filter[version]=${NEW_BUILD}&sort=-uploadedDate&limit=1")

    local BUILD_ID=$(echo "$BUILDS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null)

    if [ -z "$BUILD_ID" ]; then
        warn "Could not find build ${NEW_BUILD} in App Store Connect (may still be processing)."
        warn "Notes to paste manually:"
        echo "$CHANGELOG_NOTES"
        return 1
    fi

    # Check for existing localization
    local LOC_RESPONSE=$(curl -s -H "Authorization: Bearer $JWT" \
        "https://api.appstoreconnect.apple.com/v1/builds/${BUILD_ID}/betaBuildLocalizations")

    local LOC_ID=$(echo "$LOC_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null)

    local ESCAPED_NOTES=$(echo "$CHANGELOG_NOTES" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")

    if [ -n "$LOC_ID" ]; then
        # Update existing
        curl -s -X PATCH -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
            "https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations/${LOC_ID}" \
            -d "{\"data\":{\"type\":\"betaBuildLocalizations\",\"id\":\"${LOC_ID}\",\"attributes\":{\"whatsNew\":${ESCAPED_NOTES}}}}" > /dev/null
    else
        # Create new
        curl -s -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
            "https://api.appstoreconnect.apple.com/v1/betaBuildLocalizations" \
            -d "{\"data\":{\"type\":\"betaBuildLocalizations\",\"attributes\":{\"locale\":\"en-US\",\"whatsNew\":${ESCAPED_NOTES}},\"relationships\":{\"build\":{\"data\":{\"type\":\"builds\",\"id\":\"${BUILD_ID}\"}}}}}" > /dev/null
    fi

    info "TestFlight notes set successfully!"
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
