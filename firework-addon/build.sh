#!/usr/bin/env bash
# Packs the behavior pack into SkyKitUltra.mcaddon. Double-click that file to import it into Minecraft.
set -euo pipefail
cd "$(dirname "$0")"
rm -f SkyKitUltra.mcaddon
python3 tools/make_structure.py SkyKitUltra_BP/structures/skyultra/rocket3.mcstructure
python3 - <<'PY'
import os, zipfile
with zipfile.ZipFile("SkyKitUltra.mcaddon", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("SkyKitUltra_BP"):
        for f in files:
            path = os.path.join(root, f)
            z.write(path, path)
PY
echo "Built SkyKitUltra.mcaddon"
