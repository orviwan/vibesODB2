"""
The PWA (pwa/js/uds.js) and the CLI (vibesodb2/adapter/elm327.py) must address modules with
identical CAN IDs. Two diverging tables previously sent the CLI's ABS/airbag requests to the
wrong arbitration IDs.
"""
import re
from pathlib import Path

from vibesodb2.adapter.elm327 import MODULE_REGISTRY

ROOT = Path(__file__).resolve().parent.parent


def _js_verified_modules():
    src = (ROOT / "pwa" / "js" / "uds.js").read_text(encoding="utf-8")
    block = src[src.index("export const MODULE_ARBITRATION"):src.index("export const STANDARD_SCAN_MODULES")]
    entries = re.findall(r"'0x([0-9A-Fa-f]{2})':\s*\{\s*tx:\s*'([0-9A-F]{3})',\s*rx:\s*'([0-9A-F]{3})'.*?verified:\s*(true|false)", block)
    return {int(a, 16): (tx, rx) for a, tx, rx, v in entries if v == "true"}


def test_python_registry_matches_verified_js_table():
    js = _js_verified_modules()
    assert js, "could not parse MODULE_ARBITRATION from uds.js"
    py = {addr: (cfg.tx_header, cfg.rx_filter) for addr, cfg in MODULE_REGISTRY.items()}
    assert py == js


def test_registry_has_no_duplicate_can_ids():
    pairs = [(cfg.tx_header, cfg.rx_filter) for cfg in MODULE_REGISTRY.values()]
    assert len(pairs) == len(set(pairs))
