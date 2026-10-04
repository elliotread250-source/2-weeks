#!/usr/bin/env bash
# Packs the behavior pack into SKRockets.mcaddon. Double-click that file to import it into Minecraft.
set -euo pipefail
cd "$(dirname "$0")"
rm -f SKRockets.mcaddon
python3 tools/make_structure.py SKRockets_BP/structures/skrockets/rocket3.mcstructure
python3 - <<'PY'
import os, zipfile
with zipfile.ZipFile("SKRockets.mcaddon", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("SKRockets_BP"):
        for f in files:
            path = os.path.join(root, f)
            z.write(path, path)
PY
echo "Built SKRockets.mcaddon"
