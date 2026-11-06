from __future__ import annotations

import csv
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(r"D:\Du-An29")
WORK = Path(r"C:\Users\Admin\Documents\Codex\2026-07-19\xay-dung-website-ban-hang\work")
AUDIT = WORK / "sieuthivienthong-prices.json"
OVERRIDES = ROOT / "data/price-overrides-20261030.json"
REPORT = WORK / "sieuthivienthong-price-report.csv"
ROUNDING = 10_000


def exact_product_match(product_id: str, product: dict, result: dict) -> bool:
    """Reject near-match pages for distinct model variants or unrelated short IDs."""
    model = str(product.get("model") or product_id).strip()
    title = str(result.get("sourceTitle") or "")
    match = re.search(r"(?<![A-Za-z0-9])" + re.escape(model) + r"(?![A-Za-z0-9])", title, re.I)
    if not match:
        return False
    # A suffix such as -VN, /SL, /16P, -4G or " Max" identifies a different variant.
    if title[match.end():].strip().strip(" .,:;)]}"):
        return False

    def normalized(value: str) -> str:
        ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
        return re.sub(r"[^a-z0-9]+", " ", ascii_value).strip()

    product_name = normalized(str(product.get("name") or ""))
    source_name = normalized(title)
    # A base unit is not the same item as an accessory/card that merely cites its model.
    if re.search(r"\bcard\b", product_name) and not re.search(r"\bcard\b", source_name):
        return False
    similarity = SequenceMatcher(None, product_name, source_name).ratio()
    return similarity >= 0.70


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    sources = (
        ROOT / "data/products-index.json",
        ROOT / "data/huawei-products.json",
        ROOT / "data/products-import-20261030.json",
        ROOT / "data/products-manual-20261102.json",
    )
    catalog: dict[str, dict] = {}
    for path in sources:
        if path.exists():
            catalog.update({key: value for key, value in json.loads(path.read_text(encoding="utf-8")).items()
                            if isinstance(value, dict)})

    checked_at = audit["checkedAt"]
    updated_priced = updated_contact = unchanged = not_found = skipped_mismatch = 0
    for product_id, result in audit["products"].items():
        product = catalog.get(product_id)
        if not product:
            continue
        status = result.get("status")
        if status in {"priced", "contact"} and not exact_product_match(product_id, product, result):
            skipped_mismatch += 1
            continue
        old_price = overrides.get(product_id, {}).get("price", product.get("price", "Liên hệ"))
        row = dict(overrides.get(product_id, {}))

        if status == "priced":
            source_price = int(result["sourcePrice"])
            price = round(source_price * 1.08 / ROUNDING) * ROUNDING
            if result.get("price") != price:
                raise ValueError(f"Audit price mismatch for {product_id}")
            if old_price == price:
                unchanged += 1
            else:
                updated_priced += 1
            row.update({
                "price": price,
                "sourcePrice": source_price,
                "priceSource": result["sourceUrl"],
                "priceSourceTitle": result["sourceTitle"],
                "priceMarkupPercent": 8,
                "priceRounding": ROUNDING,
                "priceUpdatedAt": checked_at,
                "vatIncluded": bool(result.get("vatIncluded")),
                "priceVatNote": "Đã gồm VAT" if result.get("vatIncluded") else "",
            })
            if old_price != price and isinstance(old_price, (int, float)):
                row["previousPrice"] = old_price
            row.pop("priceValidUntil", None)
            overrides[product_id] = row
        elif status == "contact":
            if old_price != "Liên hệ":
                updated_contact += 1
                if isinstance(old_price, (int, float)):
                    row["previousPrice"] = old_price
            else:
                unchanged += 1
            row.update({
                "price": "Liên hệ",
                "sourcePrice": None,
                "priceSource": result.get("sourceUrl", ""),
                "priceSourceTitle": result.get("sourceTitle", ""),
                "priceMarkupPercent": None,
                "priceRounding": None,
                "priceUpdatedAt": checked_at,
                "vatIncluded": False,
                "priceVatNote": "",
            })
            row.pop("priceValidUntil", None)
            overrides[product_id] = row
        else:
            not_found += 1

    OVERRIDES.write_text(json.dumps(overrides, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with REPORT.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["Model", "Tên sản phẩm", "Trạng thái nguồn", "Giá nguồn", "Giá website (+8%, làm tròn)",
                         "Đã gồm VAT", "URL nguồn", "Thời điểm kiểm tra"])
        for product_id, product in catalog.items():
            result = audit["products"].get(product_id, {"status": "not_found"})
            writer.writerow([product_id, product.get("name", ""), result.get("status", "not_found"),
                             result.get("sourcePrice", ""), result.get("price", ""),
                             "Có" if result.get("vatIncluded") else "", result.get("sourceUrl", ""), checked_at])

    print(f"CHECKED_AT={checked_at} PRODUCTS={len(catalog)} PRICED={updated_priced} "
          f"CONTACT={updated_contact} UNCHANGED={unchanged} NOT_FOUND_LEFT_UNCHANGED={not_found} "
          f"SKIPPED_NEAR_MATCH={skipped_mismatch} "
          f"OVERRIDES={len(overrides)}")


if __name__ == "__main__":
    main()
