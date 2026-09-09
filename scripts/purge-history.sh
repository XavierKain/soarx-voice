#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Rewrites git history to remove the credentials that were committed
# to this PUBLIC repository:
#
#   - android/app/src/main/assets/index.android.bundle
#     (a generated JS bundle with AGORA_APP_ID inlined)
#   - the Agora App ID string
#   - the old release keystore password from android/app/build.gradle
#
# READ THIS FIRST
# ---------------
# Rewriting history does NOT un-leak these values. The repo has been public;
# GitHub keeps unreferenced commits reachable for a while, forks keep their own
# copies, and anyone could already have cloned it.
#
# The only real remediation is to ROTATE the Agora App ID: create a new project
# in the Agora console, put the new ID in .env and in the AGORA_APP_ID secret,
# and disable the old one.
#
# The old keystore password is already moot: v2.0 ships a new keystore that was
# never committed, with a random password.
#
# This script force-pushes and rewrites every commit SHA. Everyone with a clone
# must re-clone. A backup bundle is written first.
# ============================================================

cd "$(dirname "$0")/.."

command -v git-filter-repo >/dev/null || {
  echo "git-filter-repo is required: pip3 install git-filter-repo"; exit 1; }

[ -n "$(git status --porcelain)" ] && { echo "Working tree is dirty."; exit 1; }

BACKUP=~/soarx-backups/pre-purge-$(date +%Y%m%d-%H%M%S).bundle
mkdir -p ~/soarx-backups
git bundle create "$BACKUP" --all
echo "Backup: $BACKUP"

read -rp "Rewrite history and force-push? [y/N] " ok
[ "$ok" = "y" ] || exit 1

REMOTE=$(git remote get-url origin)

cat > /tmp/soarx-replacements.txt <<'REPL'
96bf5034a3ec4957a5d4b0099f4c7eea==>AGORA_APP_ID_REDACTED
soarxvoice2026==>KEYSTORE_PASSWORD_REDACTED
REPL

git filter-repo --force \
  --invert-paths --path android/app/src/main/assets/index.android.bundle \
  --replace-text /tmp/soarx-replacements.txt

rm -f /tmp/soarx-replacements.txt

git remote add origin "$REMOTE" 2>/dev/null || git remote set-url origin "$REMOTE"
git push --force --all origin
git push --force --tags origin

echo
echo "History rewritten. Now, in this order:"
echo "  1. Rotate the Agora App ID at https://console.agora.io"
echo "  2. gh secret set AGORA_APP_ID   (with the NEW id)"
echo "  3. Update .env locally with the NEW id"
echo "  4. Ask GitHub Support to garbage-collect unreferenced commits, or"
echo "     accept that the old ID stays reachable and rely on the rotation."
