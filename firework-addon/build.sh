#!/usr/bin/env bash
# Packs the behavior pack into SkyKitPro.mcaddon. Double-click that file to import it into Minecraft.
set -euo pipefail
cd "$(dirname "$0")"
rm -f SkyKitPro.mcaddon
python3 tools/make_structure.py SkyKitPro_BP/structures/skypro/rocket3.mcstructure
python3 - <<'PY'
import os, zipfile
with zipfile.ZipFile("SkyKitPro.mcaddon", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("SkyKitPro_BP"):
        for f in files:
            path = os.path.join(root, f)
            z.write(path, path)
PY
echo "Built SkyKitPro.mcaddon"
