"""Sample Map Editor extension. Read one JSON line from stdin, write one JSON line to stdout."""
import json
import sys

request = json.loads(sys.stdin.readline())
world = request.get("world") or {}
answer = {"type": "result", "message": f"Hello, {world.get('name', 'world')}!"}

if request["command"] == "glass-floor":
    sel = request.get("selection")
    if not sel:
        answer["message"] = "Select an area first."
    else:
        b = sel["box"]
        y = min(b["y1"], b["y2"])
        answer["message"] = f"Glass floor at y {y}."
        answer["ops"] = [{
            "op": "fill", "dimension": sel["dimension"], "block": "minecraft:glass",
            "box": {"x1": b["x1"], "y1": y, "z1": b["z1"], "x2": b["x2"], "y2": y, "z2": b["z2"]},
        }]

sys.stdout.write(json.dumps(answer) + "\n")
