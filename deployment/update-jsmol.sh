#!/bin/bash
# Script to update JSmol to the latest version
# Usage: ./update-jsmol.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JSMOL_DIR="$SCRIPT_DIR/../client/public/jsmol"
TEMP_DIR=$(mktemp -d)

echo "Updating JSmol to latest version..."

# Step 1: Download the outer Jmol archive
echo "Downloading from SourceForge..."
curl -L -o "$TEMP_DIR/jmol.zip" "https://sourceforge.net/projects/jmol/files/latest/download"

# Step 2: Extract outer zip -> produces jmol-[version]/ directory
echo "Extracting outer archive..."
unzip -q "$TEMP_DIR/jmol.zip" -d "$TEMP_DIR/outer"

# Step 3: Find and extract the nested jsmol.zip
INNER_ZIP=$(find "$TEMP_DIR/outer" -name "jsmol.zip" | head -1)
if [ -z "$INNER_ZIP" ]; then
    echo "Error: Could not find jsmol.zip inside downloaded archive"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Extracting jsmol.zip..."
unzip -q "$INNER_ZIP" -d "$TEMP_DIR/inner"

# Step 4: Find the jsmol directory
JSMOL_SOURCE=$(find "$TEMP_DIR/inner" -type d -name "jsmol" | head -1)
if [ -z "$JSMOL_SOURCE" ]; then
    echo "Error: Could not find jsmol directory inside jsmol.zip"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "Found JSmol at: $JSMOL_SOURCE"

# Backup existing
if [ -d "$JSMOL_DIR" ]; then
    echo "Backing up existing JSmol..."
    mv "$JSMOL_DIR" "${JSMOL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
fi

# Copy only the files the app actually uses
mkdir -p "$JSMOL_DIR"

echo "Copying JSmol.min.js..."
cp "$JSMOL_SOURCE/JSmol.min.js" "$JSMOL_DIR/"

echo "Copying j2s directory..."
cp -r "$JSMOL_SOURCE/j2s" "$JSMOL_DIR/"

# Cleanup
rm -rf "$TEMP_DIR"

echo "Done! JSmol updated to latest version."
echo "Please test the viewer to ensure compatibility."
