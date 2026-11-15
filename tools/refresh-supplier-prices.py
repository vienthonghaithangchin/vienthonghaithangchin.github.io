"""Refresh only products with previously verified supplier URLs.

Unknown pages and model mismatches are never used to overwrite prices.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from html import unescape
from pathlib import Path
import json
import re
import urllib.request

import importlib.util

ROOT = Path(__file__).resolve().parents[1]
AUDIT = Path(r"C:\Users\Admin\Documents\Codex\2026-07-19\xay-dung-website-ban-hang\work\sieuthivienthong-prices.json")
OVERRIDES = ROOT / "data/price-overrides-20261030.json"
REPORT = ROOT / "data/supplier-price-refresh-report.json"
spec = importlib.util.spec_from_file_location("price_audit", Path(__file__).with_name("apply-current-price-audit.py"))
price_audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(price_audit)
exact_product_match = price_audit.exact_product_match


def clean(value):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]*>", " ", value))).strip()


def fetch(item):
    product_id, old = item
    url = old["sourceUrl"]
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=20) as response:
            page = response.read().decode("utf-8", "replace")
        title_match = re.search(r"<h1\b[^>]*>(.*?)</h1>", page, re.I | re.S)
        title = clean(title_match.group(1)) if title_match else ""
        price_match = re.search(r"<h4\b[^>]*class=[\"']price[\"'][^>]*>(.*?)</h4>", page, re.I | re.S)
        price_text = clean(price_match.group(1)) if price_match else ""
        if not title or not price_text:
            return product_id, {"status": "unparsed", "url": url}
        if "Vui lòng gọi" in price_text:
            return product_id, {"status": "contact", "sourceTitle": title, "sourceUrl": url}
        amount = re.search(r"([\d.]+)\s*VND", price_text, re.I)
        if not amount:
            return product_id, {"status": "unparsed", "url": url, "priceText": price_text[:100]}
        source_price = int(amount.group(1).replace(".", ""))
        return product_id, {"status": "priced", "sourceTitle": title, "sourceUrl": url,
                            "sourcePrice": source_price,
                            "vatIncluded": bool(re.search(r"Đã\s+bao\s+gồm\s+VAT", price_match.group(1), re.I))}
    except Exception as error:
        return product_id, {"status": "fetch_error", "url": url, "error": str(error)[:150]}


def main():
    old_audit = json.loads(AUDIT.read_text(encoding="utf-8"))["products"]
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    catalog = {}
    for name in ("products-index.json", "huawei-products.json", "products-import-20261030.json", "products-manual-20261102.json"):
        catalog.update(json.loads((ROOT / "data" / name).read_text(encoding="utf-8")))
    source_urls = {key: value["sourceUrl"] for key, value in old_audit.items()
                   if value.get("sourceUrl") and key in catalog}
    source_urls.update({key: value["priceSource"] for key, value in overrides.items()
                        if key in catalog and isinstance(value.get("priceSource"), str)
                        and value["priceSource"].startswith("https://www.sieuthivienthong.com/")})
    candidates = [(key, {"sourceUrl": url}) for key, url in source_urls.items()]
    results = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch, item) for item in candidates]
        for future in as_completed(futures):
            key, value = future.result()
            results[key] = value
    changed = []
    unchanged = []
    skipped = []
    checked_at = datetime.now(timezone(timedelta(hours=7))).isoformat(timespec="seconds")
    for key, result in results.items():
        if result["status"] not in ("priced", "contact") or not exact_product_match(key, catalog[key], result):
            skipped.append({"id": key, **result})
            continue
        row = dict(overrides.get(key, {}))
        previous = row.get("price", catalog[key].get("price"))
        if result["status"] == "priced":
            source_price = result["sourcePrice"]
            new_price = ((source_price * 108 + 500_000 - 1) // 1_000_000) * 10_000
            row.update(price=new_price, sourcePrice=source_price, priceMarkupPercent=8,
                       priceRounding=10_000, vatIncluded=result["vatIncluded"],
                       priceVatNote="Đã gồm VAT" if result["vatIncluded"] else "")
            if catalog[key].get("hidden") is not True:
                row["hidden"] = False
        else:
            new_price = "Vui lòng gọi"
            row.update(price=new_price, sourcePrice=None, priceMarkupPercent=None,
                       priceRounding=None, vatIncluded=False, priceVatNote="", hidden=True)
        row.update(priceSource=result["sourceUrl"], priceSourceTitle=result["sourceTitle"],
                   priceUpdatedAt=checked_at)
        if previous != new_price:
            if isinstance(previous, (int, float)):
                row["previousPrice"] = previous
            else:
                row.pop("previousPrice", None)
            changed.append({"id": key, "old": previous, "new": new_price, "sourcePrice": result.get("sourcePrice")})
        else:
            unchanged.append(key)
        overrides[key] = row
    OVERRIDES.write_text(json.dumps(overrides, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(json.dumps({"checkedAt": checked_at, "checked": len(candidates), "changed": changed,
                                  "unchanged": len(unchanged), "skipped": skipped}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"checked={len(candidates)} changed={len(changed)} unchanged={len(unchanged)} skipped={len(skipped)}")


if __name__ == "__main__":
    main()
