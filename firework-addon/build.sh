#!/usr/bin/env bash
# Packs the behavior pack into SkyKitMax.mcaddon. Double-click that file to import it into Minecraft.
set -euo pipefail
cd "$(dirname "$0")"
rm -f SkyKitMax.mcaddon
python3 tools/make_structure.py SkyKitMax_BP/structures/skymax/rocket3.mcstructure
python3 - <<'PY'
import os, zipfile
with zipfile.ZipFile("SkyKitMax.mcaddon", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("SkyKitMax_BP"):
        for f in files:
            path = os.path.join(root, f)
            z.write(path, path)
PY
echo "Built SkyKitMax.mcaddon"
