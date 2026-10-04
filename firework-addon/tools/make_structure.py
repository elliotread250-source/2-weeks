"""Writes the .mcstructure that holds one flight duration 3 firework rocket.

The Script API can't set a rocket's flight duration, but structures keep full item data.
The pack places this structure once, reads the rocket off the item entity and copies it.
Bedrock NBT is little-endian, so this writes it by hand instead of pulling in a library.
"""
import struct
import sys

END, BYTE, SHORT, INT, LONG, FLOAT, STRING, LIST, COMPOUND = 0, 1, 2, 3, 4, 5, 8, 9, 10


def name(n):
    b = n.encode()
    return struct.pack("<H", len(b)) + b


def payload(tag, value):
    if tag == BYTE:
        return struct.pack("<b", value)
    if tag == SHORT:
        return struct.pack("<h", value)
    if tag == INT:
        return struct.pack("<i", value)
    if tag == LONG:
        return struct.pack("<q", value)
    if tag == FLOAT:
        return struct.pack("<f", value)
    if tag == STRING:
        return name(value)
    if tag == LIST:
        item_tag, items = value
        return struct.pack("<bi", item_tag, len(items)) + b"".join(payload(item_tag, i) for i in items)
    if tag == COMPOUND:
        return b"".join(struct.pack("<b", t) + name(k) + payload(t, v) for k, (t, v) in value.items()) + b"\x00"
    raise ValueError(tag)


rocket = {
    "Name": (STRING, "minecraft:firework_rocket"),
    "Count": (BYTE, 1),
    "Damage": (SHORT, 0),
    "WasPickedUp": (BYTE, 0),
    "tag": (COMPOUND, {
        "Fireworks": (COMPOUND, {
            "Explosions": (LIST, (COMPOUND, [])),
            "Flight": (BYTE, 3),
        }),
    }),
}

item_entity = {
    "identifier": (STRING, "minecraft:item"),
    "Item": (COMPOUND, rocket),
    "Pos": (LIST, (FLOAT, [0.5, 0.1, 0.5])),
    "Rotation": (LIST, (FLOAT, [0.0, 0.0])),
    "Motion": (LIST, (FLOAT, [0.0, 0.0, 0.0])),
    "UniqueID": (LONG, -0x5E5E5E5E),
    "Age": (SHORT, 0),
    "Health": (SHORT, 5),
    "PickupDelay": (SHORT, 32767),
    "OnGround": (BYTE, 1),
    # Lets the script find this exact entity instead of some random rocket lying nearby.
    "Tags": (LIST, (STRING, ["skyultra_template"])),
}

structure = {
    "format_version": (INT, 1),
    "size": (LIST, (INT, [1, 1, 1])),
    "structure_world_origin": (LIST, (INT, [0, 0, 0])),
    "structure": (COMPOUND, {
        # -1 means "no block", so placing this never touches the world's blocks.
        "block_indices": (LIST, (LIST, [(INT, [-1]), (INT, [-1])])),
        "entities": (LIST, (COMPOUND, [item_entity])),
        "palette": (COMPOUND, {
            "default": (COMPOUND, {
                "block_palette": (LIST, (COMPOUND, [])),
                "block_position_data": (COMPOUND, {}),
            }),
        }),
    }),
}

with open(sys.argv[1], "wb") as f:
    f.write(struct.pack("<b", COMPOUND) + name("") + payload(COMPOUND, structure))
