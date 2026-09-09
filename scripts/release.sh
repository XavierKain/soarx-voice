#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# SoarX Voice release
#
# Bumps every version location, verifies the changelog, then tags.
# Pushing the tag triggers .github/workflows/{ios-testflight,android-release}.
#
# The actual builds run in CI (iOS needs a macOS runner), so this script
# is portable and does not require Xcode or the Android SDK locally.
#
#   ./scripts/release.sh 2.0
#   ./scripts/release.sh 2.0 --no-push   # bump + commit + tag, push manually
# ============================================================

cd "$(dirname "$0")/.."

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { printf "${GREEN}[INFO]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
fail()  { printf "${RED}[ERROR]${NC} %s\n" "$1"; exit 1; }

VERSION="${1:-}"
PUSH=1
[ "${2:-}" = "--no-push" ] && PUSH=0

[ -z "$VERSION" ] && fail "Usage: ./scripts/release.sh <version> [--no-push]   e.g. 2.0 or 2.0.1"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || fail "Version must look like 2.0 or 2.0.1 (got '$VERSION')"

# --- changelog must document this version -------------------------------
NOTES=$(awk -v v="## v${VERSION}" '
  $0 == v {f=1; next}
  f && /^## v/ {exit}
  f && NF {print}
' CHANGELOG.md)
[ -z "$NOTES" ] && fail "No '## v${VERSION}' section in CHANGELOG.md. Add it first."

# --- clean tree ---------------------------------------------------------
[ -n "$(git status --porcelain)" ] && fail "Working tree is dirty. Commit or stash first."
git rev-parse "v${VERSION}" >/dev/null 2>&1 && fail "Tag v${VERSION} already exists."

info "Releasing v${VERSION}"
printf '\n%s\n\n' "$NOTES"

# --- build number: monotonic across both platforms ----------------------
CURRENT_BUILD=$(grep -m1 'CURRENT_PROJECT_VERSION' ios/SoarXVoice.xcodeproj/project.pbxproj \
  | tr -cd '0-9')
NEW_BUILD=$((CURRENT_BUILD + 1))

# --- bump: iOS ----------------------------------------------------------
perl -pi -e "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = ${VERSION};/g" \
  ios/SoarXVoice.xcodeproj/project.pbxproj
perl -pi -e "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = ${NEW_BUILD};/g" \
  ios/SoarXVoice.xcodeproj/project.pbxproj

# --- bump: Android ------------------------------------------------------
perl -pi -e "s/versionCode [0-9]+/versionCode ${NEW_BUILD}/" android/app/build.gradle
perl -pi -e "s/versionName \"[^\"]*\"/versionName \"${VERSION}\"/" android/app/build.gradle

# --- bump: JS single source of truth ------------------------------------
perl -pi -e "s/export const APP_VERSION = '[^']*';/export const APP_VERSION = '${VERSION}';/" \
  src/version.ts
perl -pi -e "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}.0\"/" package.json

info "iOS v${VERSION} (build ${NEW_BUILD}) | Android v${VERSION} (code ${NEW_BUILD})"

# --- verify -------------------------------------------------------------
info "Running checks..."
npm run typecheck
npm run lint
npm test

# --- commit + tag -------------------------------------------------------
git add -A
git commit -m "release: v${VERSION} (build ${NEW_BUILD})"
git tag -a "v${VERSION}" -m "v${VERSION}"

if [ "$PUSH" -eq 1 ]; then
  git push origin HEAD
  git push origin "v${VERSION}"
  info "Tag pushed — CI is building iOS (TestFlight) and Android (AAB + APK)."
  info "Watch: gh run watch"
else
  warn "Not pushed. Run: git push origin HEAD && git push origin v${VERSION}"
fi
