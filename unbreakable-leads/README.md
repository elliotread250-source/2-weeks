# Unbreakable Leads (Minecraft Bedrock add-on)

Leads never snap, however fast or far you go. Elytra, horses, minecarts, ender pearls, /tp and portals all work.

Install: open `UnbreakableLeads.mcpack`, then turn it on under Behavior Packs in your world settings. No experiments needed. Requires Bedrock 1.21.90 or newer.

How it works: a script watches every leashed mob. If it drifts more than 6 blocks from whatever holds the lead, it gets pulled back behind the holder (with a short slow-falling effect so it doesn't take fall damage). If the game snaps the lead anyway, the mob is re-tied instantly and the dropped lead item is removed. Taking a lead off on purpose (clicking the mob, shears, tying to a fence, breaking the fence knot) still works normally.

Rebuild: `cd BP && zip -r ../UnbreakableLeads.mcpack manifest.json scripts`
