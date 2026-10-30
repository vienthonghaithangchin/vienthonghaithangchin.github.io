from __future__ import annotations

import concurrent.futures
import html
import importlib.util
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(r"D:\Du-An29")
SOURCE = Path(r"C:\Users\Admin\Documents\Codex\2026-07-19\xay-dung-website-ban-hang\work\scrape-sieuthivienthong-prices.py")
SPEC = importlib.util.spec_from_file_location("price_scraper", SOURCE)
scraper = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(scraper)

OUTPUT = Path(os.environ.get("TEMP", r"C:\Windows\Temp")) / "vt29-price-audit-20261030.json"


def source_urls(product: dict) -> list[str]:
    values = []
    for key in ("sourceUrl", "priceSource", "specificationsSource"):
        value = product.get(key)
        if not value:
            continue
        parsed = urlparse(value)
        if parsed.hostname and parsed.hostname.lower().removeprefix("www.") == "sieuthivienthong.com":
            values.append(value)
    return list(dict.fromkeys(values))


def main() -> None:
    products = json.loads((ROOT / "data/products.json").read_text(encoding="utf-8"))
    huawei = json.loads((ROOT / "data/huawei-products.json").read_text(encoding="utf-8"))
    imported_path = ROOT / "data/products-import-20261030.json"
    imported = json.loads(imported_path.read_text(encoding="utf-8")) if imported_path.exists() else {}
    data = {
        **{key: value for key, value in products.items() if isinstance(value, dict)},
        **{key: value for key, value in huawei.items() if isinstance(value, dict)},
        **{key: value for key, value in imported.items() if isinstance(value, dict)},
    }

    sitemap_urls = []
    for index in range(9):
        body, _ = scraper.fetch(f"https://www.sieuthivienthong.com/sitemaps/articleSitemap_{index}.xml")
        sitemap_urls.extend(html.unescape(value) for value in re.findall(r"<loc>(.*?)</loc>", body, re.I))
    sitemap_urls = list(dict.fromkeys(sitemap_urls))
    indexed_urls = [(scraper.page_slug(url), scraper.compact(scraper.page_slug(url)), url) for url in sitemap_urls]
    ngram_index = {}
    for row, (_, url_compact, _) in enumerate(indexed_urls):
        for gram in set(url_compact[i:i + 6] for i in range(max(0, len(url_compact) - 5))):
            ngram_index.setdefault(gram, []).append(row)

    jobs = []
    results = {}
    for product_id, product in data.items():
        direct_urls = source_urls(product)
        candidates = list(dict.fromkeys(direct_urls + scraper.candidates_for(product_id, product, indexed_urls, ngram_index)))
        if candidates:
            jobs.append((product_id, product, candidates, set(direct_urls)))
        else:
            results[product_id] = {"status": "not_found"}
    print(f"SITEMAP_URLS={len(sitemap_urls)} PRODUCTS={len(data)} CANDIDATES={len(jobs)}", flush=True)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(scraper.scrape_one, job) for job in jobs]
        for future in concurrent.futures.as_completed(futures):
            product_id, result = future.result()
            results[product_id] = result
            completed += 1
            if completed % 100 == 0:
                priced = sum(row.get("status") == "priced" for row in results.values())
                contact = sum(row.get("status") == "contact" for row in results.values())
                print(f"FETCHED={completed}/{len(jobs)} PRICED={priced} CONTACT={contact}", flush=True)

    payload = {
        "checkedAt": datetime.now(timezone(timedelta(hours=7))).isoformat(timespec="seconds"),
        "markupPercent": 8,
        "rounding": 10000,
        "products": results,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    counts = {status: sum(row.get("status") == status for row in results.values()) for status in ("priced", "contact", "not_found")}
    print(json.dumps({"output": str(OUTPUT), "counts": counts}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
