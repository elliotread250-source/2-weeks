#!/usr/bin/env bash
# Packs the behavior pack into FireworkCommand.mcaddon. Double-click that file to import it into Minecraft.
set -euo pipefail
cd "$(dirname "$0")"
rm -f FireworkCommand.mcaddon
python3 - <<'PY'
import os, zipfile
with zipfile.ZipFile("FireworkCommand.mcaddon", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("FireworkCommand_BP"):
        for f in files:
            path = os.path.join(root, f)
            z.write(path, path)
PY
echo "Built FireworkCommand.mcaddon"
