from __future__ import annotations

import argparse
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(r"D:\Du-An29")
SOURCE = Path(r"C:\Users\Admin\Documents\Codex\2026-07-19\xay-dung-website-ban-hang\work\import-missing-priced-brands.py")
SPEC = importlib.util.spec_from_file_location("brand_import", SOURCE)
module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(module)


def build_plan() -> list[tuple[str, dict]]:
    cache = json.loads(module.CACHE.read_text(encoding="utf-8"))["products"]
    data = json.loads((ROOT / "data/products.json").read_text(encoding="utf-8"))
    existing = {key: value for key, value in data.items() if isinstance(value, dict)}
    existing_urls = {url.casefold() for product in existing.values() for url in module.all_source_urls(product)}
    existing_ids = {module.source_id(url) for url in existing_urls if module.source_id(url)}
    existing_keys = {module.normal(key) for key in existing}
    existing_names = [module.normal(product.get("name", "")) for product in existing.values()]
    existing_codes = {str(product.get("code", "")) for product in existing.values()}
    candidates = []
    seen_models = set()
    for item in cache:
        if item.get("sourcePrice", 0) <= 0 or not module.brand_is_valid(item):
            continue
        sid = module.source_id(item["url"])
        if item["url"].casefold() in existing_urls or sid in existing_ids:
            continue
        model = module.extract_model(item["name"], item["brand"])
        model_norm = module.normal(model)
        duplicate = model_norm in existing_keys or (len(model_norm) >= 6 and any(model_norm in name for name in existing_names))
        if duplicate or model_norm in seen_models:
            continue
        seen_models.add(model_norm)
        candidates.append((item, model))

    counters: dict[str, int] = {}
    keys = {key.casefold() for key in data}
    plan = []
    for item, model in candidates:
        category, product_type, industry, code_prefix, path_pair = module.paths_for(item, model)
        link, _ = path_pair.split("|")
        if code_prefix not in counters:
            values = [int(match.group(1)) for code in existing_codes if (match := re.fullmatch(re.escape(code_prefix) + r"-(\d{4})", code))]
            counters[code_prefix] = max(values, default=0)
        counters[code_prefix] += 1
        code = f"{code_prefix}-{counters[code_prefix]:04d}"
        key = model
        if key.casefold() in keys:
            key = f"{model}-{item['sourceId']}"
        keys.add(key.casefold())
        source_price = int(item["sourcePrice"])
        price = round(source_price * 1.08 / 10000) * 10000
        image_url = item.get("imageUrl", "")
        product = {
            "name": item["name"], "code": code, "price": price,
            "warranty": "24 tháng" if module.BRANDS[item["brand"]]["kind"] == "camera" else "12 tháng",
            "category": category, "brand": item["brand"], "link": link, "image": image_url,
            "thumbnail": image_url, "description": module.safe_lines(item, category),
            "descriptionStatus": "specification-derived", "productType": product_type, "industry": industry,
            "specifications": item.get("specifications", []), "specificationsSource": item["url"],
            "specificationsChecked": module.TODAY, "sourceUrl": item["url"], "sourceImage": image_url,
            "sourcePrice": source_price, "priceSource": item["url"], "priceSourceTitle": item["name"],
            "priceMarkupPercent": 8, "priceRounding": 10000, "priceUpdatedAt": module.STAMP,
            "vatIncluded": bool(item.get("vatIncluded")),
            "priceVatNote": "Đã gồm VAT" if item.get("vatIncluded") else "Nguồn chưa ghi rõ VAT",
        }
        plan.append((key, product))
    return plan


def page_html(key: str, product: dict) -> str:
    document = module.page_html(key, product)
    embedded = json.dumps({"id": key, "product": product}, ensure_ascii=False).replace("</", "<\\/")
    return re.sub(r'(<script id="product-data" type="application/json">).*?(</script>)', rf"\g<1>{embedded}\g<2>", document, flags=re.S)


def patch_line(value: str) -> str:
    return "+" + value


def build_patch(batch: list[tuple[str, dict]]) -> str:
    parts = []
    index_path = ROOT / "data/products-import-20261030.json"
    new_lines = [json.dumps(key, ensure_ascii=False) + ":" + json.dumps(product, ensure_ascii=False, separators=(",", ":")) for key, product in batch]
    if not index_path.exists():
        parts.extend(["*** Add File: data/products-import-20261030.json", "+{"])
        for pos, line in enumerate(new_lines):
            parts.append(patch_line(line + ("," if pos < len(new_lines) - 1 else "")))
        parts.append("+}")
    else:
        lines = index_path.read_text(encoding="utf-8").splitlines()
        previous = lines[-2]
        parts.extend(["*** Update File: data/products-import-20261030.json", "@@", "-" + previous, "-}", "+" + previous + ","])
        for pos, line in enumerate(new_lines):
            parts.append(patch_line(line + ("," if pos < len(new_lines) - 1 else "")))
        parts.append("+}")

    for key, product in batch:
        relative = product["link"].lstrip("/")
        parts.append(f"*** Add File: {relative}")
        for line in page_html(key, product).splitlines():
            parts.append(patch_line(line))

    for sitemap_name, lastmod in (("sitemap.xml", False), ("sitemap-priority.xml", True)):
        parts.extend([f"*** Update File: {sitemap_name}", "@@", "-</urlset>"])
        for _, product in batch:
            parts.extend(["+  <url>", f"+    <loc>{module.BASE_SITE}{product['link']}</loc>"])
            if lastmod:
                parts.append(f"+    <lastmod>{module.TODAY}</lastmod>")
            parts.append("+  </url>")
        parts.append("+</urlset>")
    return "*** Begin Patch\n" + "\n".join(parts) + "\n*** End Patch"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--size", type=int, default=5)
    parser.add_argument("--summary", action="store_true")
    args = parser.parse_args()
    plan = build_plan()
    if args.summary:
        print(json.dumps({"total": len(plan), "byBrand": Counter(p["brand"] for _, p in plan)}, ensure_ascii=False))
        return
    batch = plan[args.start:args.start + args.size]
    if batch:
        print(build_patch(batch))


if __name__ == "__main__":
    main()
