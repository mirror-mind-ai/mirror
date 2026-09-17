"""Generate the Python number-rendering golden (CV22.DS9.US2 plateau 2).

The one place `JSON.stringify` cannot reach: Python renders a float that happens
to be whole as `2.0` where JS renders `2`, and pads exponents to two digits
(`1e-07` where JS writes `1e-7`). JavaScript has no int/float distinction to
recover from, so `ts/src/mcp/payload.ts` carries float-ness at runtime and this
golden is what proves it renders as the oracle does.

Run:  uv run python ts/parity/generate_number_rendering_golden.py
"""

from __future__ import annotations

import json
import pathlib

CASES = [
    ("whole_float_one", True, 1.0),
    ("whole_float_two", True, 2.0),
    ("fractional", True, 0.85),
    ("float_artifact", True, 0.1 + 0.2),
    ("negative_zero_float", True, -0.0),
    ("large_float", True, 1e22),
    ("small_float", True, 1e-7),
    ("negative_float", True, -3.5),
    ("int_zero", False, 0),
    ("int_three", False, 3),
    ("int_negative", False, -42),
    ("exponent_positive_fractional", True, 1.5e30),
    ("exponent_negative_fractional", True, 2.5e-8),
]
out = [{"name": n, "float": f, "value": v, "python": json.dumps(v)} for n, f, v in CASES]
p = pathlib.Path("ts/test/goldens/python-number-rendering.golden.json")
p.write_text(json.dumps(out, indent=2) + "\n")
print("wrote", p, f"({len(out)} cases)")
