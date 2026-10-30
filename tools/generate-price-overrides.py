from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(r"D:\Du-An29")
AUDIT = Path(os.environ.get("TEMP", r"C:\Windows\Temp")) / "vt29-price-audit-20261030.json"
OUTPUT = ROOT / "data/price-overrides-20261030.json"


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    current = {}
    for name in ("products.json", "huawei-products.json", "products-import-20261030.json"):
        path = ROOT / "data" / name
        if path.exists():
            current.update({key: value for key, value in json.loads(path.read_text(encoding="utf-8")).items() if isinstance(value, dict)})

    overrides = {}
    for product_id, result in audit["products"].items():
        product = current.get(product_id)
        if not product:
            continue
        status = result.get("status")
        if status == "contact":
            if product.get("price", "Liên hệ") == "Liên hệ":
                continue
            row = {
                "price": "Liên hệ",
                "previousPrice": product.get("price"),
                "sourcePrice": None,
                "priceSource": result.get("sourceUrl", ""),
                "priceSourceTitle": result.get("sourceTitle", ""),
                "priceMarkupPercent": None,
                "priceRounding": None,
                "priceUpdatedAt": audit["checkedAt"],
                "vatIncluded": False,
                "priceVatNote": "",
            }
        else:
            continue
        overrides[product_id] = row

    body = json.dumps(overrides, ensure_ascii=False, indent=2) + "\n"
    if OUTPUT.exists():
        old = OUTPUT.read_text(encoding="utf-8")
        patch = "*** Begin Patch\n*** Update File: data/price-overrides-20261030.json\n@@\n" + "".join("-" + line for line in old.splitlines(keepends=True)) + "".join("+" + line for line in body.splitlines(keepends=True)) + "*** End Patch"
    else:
        patch = "*** Begin Patch\n*** Add File: data/price-overrides-20261030.json\n" + "".join("+" + line for line in body.splitlines(keepends=True)) + "*** End Patch"
    print(patch)


if __name__ == "__main__":
    main()
