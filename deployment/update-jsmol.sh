#!/bin/bash
# Script to update JSmol to a specific version
# Usage: ./update-jsmol.sh [version]
# Example: ./update-jsmol.sh 16.2.7

set -e

VERSION="${1:-16.2.7}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JSMOL_DIR="$SCRIPT_DIR/../client/public/jsmol"
TEMP_DIR=$(mktemp -d)

echo "Updating JSmol to version $VERSION..."

# Download from SourceForge
# Note: SourceForge URLs can be tricky - this is the direct download pattern
DOWNLOAD_URL="https://sourceforge.net/projects/jmol/files/Jmol/Version%20${VERSION%.*}.${VERSION##*.}/Jmol%20${VERSION}/Jmol-${VERSION}-binary.zip/download"

echo "Downloading from: $DOWNLOAD_URL"
curl -L -o "$TEMP_DIR/jmol.zip" "$DOWNLOAD_URL"

echo "Extracting..."
unzip -q "$TEMP_DIR/jmol.zip" -d "$TEMP_DIR"

# Find the jsmol directory in the extracted files
JSMOL_SOURCE=$(find "$TEMP_DIR" -type d -name "jsmol" | head -1)

if [ -z "$JSMOL_SOURCE" ]; then
    echo "Error: Could not find jsmol directory in downloaded archive"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Found JSmol at: $JSMOL_SOURCE"

# Backup existing (optional)
if [ -d "$JSMOL_DIR" ]; then
    echo "Backing up existing JSmol..."
    mv "$JSMOL_DIR" "${JSMOL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
fi

# Create fresh directory and copy required files
mkdir -p "$JSMOL_DIR"

echo "Copying JSmol.min.js..."
cp "$JSMOL_SOURCE/JSmol.min.js" "$JSMOL_DIR/"

echo "Copying j2s directory..."
cp -r "$JSMOL_SOURCE/j2s" "$JSMOL_DIR/"

echo "Copying php directory..."
cp -r "$JSMOL_SOURCE/php" "$JSMOL_DIR/"

# Cleanup
rm -rf "$TEMP_DIR"

echo "Done! JSmol updated to version $VERSION"
echo "Please test the viewer to ensure compatibility."
