#!/usr/bin/env bash
# Packs the behavior pack into SkyKit.mcaddon. Double-click that file to import it into Minecraft.
set -euo pipefail
cd "$(dirname "$0")"
rm -f SkyKit.mcaddon
python3 tools/make_structure.py SkyKit_BP/structures/skykit/rocket3.mcstructure
python3 - <<'PY'
import os, zipfile
with zipfile.ZipFile("SkyKit.mcaddon", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("SkyKit_BP"):
        for f in files:
            path = os.path.join(root, f)
            z.write(path, path)
PY
echo "Built SkyKit.mcaddon"
