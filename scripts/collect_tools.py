import argparse
import json
import os
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def read_json(path: str):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_tool(item):
    name = item.get("name", "").strip()
    slug = item.get("slug") or slugify(name)
    return {
        "id": item.get("id") or f"t_{slug}",
        "name": name,
        "slug": slug,
        "logoUrl": item.get("logoUrl", ""),
        "websiteUrl": item.get("websiteUrl", "").strip(),
        "pricingUrl": item.get("pricingUrl", "").strip(),
        "trialUrl": item.get("trialUrl", "").strip(),
        "categoryIds": item.get("categoryIds", []),
        "tags": item.get("tags", []),
        "priceModel": item.get("priceModel", ""),
        "pricePlans": item.get("pricePlans", []),
        "features": item.get("features", []),
        "platforms": item.get("platforms", []),
        "audiences": item.get("audiences", []),
        "updatedAt": item.get("updatedAt", ""),
        "sourceIds": item.get("sourceIds", []),
        "status": item.get("status", "active")
    }


def merge_tool(existing, incoming, updated_at):
    merged = existing.copy()
    for key, value in incoming.items():
        if value not in (None, "", []):
            merged[key] = value
    merged["updatedAt"] = updated_at
    return merged


def build_source_id(url: str) -> str:
    if not url:
        return ""
    host = urlparse(url).netloc.lower()
    host = host.replace("www.", "")
    return f"s_{slugify(host)}"


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.in_h1 = False
        self.title = []
        self.h1 = []
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "h1":
            self.in_h1 = True
        if tag == "meta":
            name = attrs_dict.get("name", "").lower()
            prop = attrs_dict.get("property", "").lower()
            content = attrs_dict.get("content", "")
            if name in ("description", "keywords"):
                self.meta[name] = content
            if prop in ("og:description", "og:title"):
                self.meta[prop] = content

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "h1":
            self.in_h1 = False

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return
        if self.in_title:
            self.title.append(text)
        if self.in_h1:
            self.h1.append(text)


def fetch_html(url: str, timeout: int):
    if not url:
        return ""
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read(1024 * 1024)
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="ignore")
    except (HTTPError, URLError, TimeoutError, ValueError):
        return ""


def parse_meta(html: str):
    if not html:
        return {"title": "", "description": "", "keywords": "", "h1": ""}
    parser = MetaParser()
    parser.feed(html)
    title = " ".join(parser.title).strip()
    h1 = " ".join(parser.h1).strip()
    description = parser.meta.get("description") or parser.meta.get("og:description", "")
    keywords = parser.meta.get("keywords", "")
    if not title:
        title = parser.meta.get("og:title", "")
    return {"title": title, "description": description, "keywords": keywords, "h1": h1}


def guess_name(title: str, h1: str):
    base = h1 or title
    if not base:
        return ""
    for sep in [" | ", " - ", " — ", " – ", "｜", "|", "—", "–", "-"]:
        if sep in base:
            return base.split(sep)[0].strip()
    return base.strip()


def split_features(text: str, max_items: int = 3):
    if not text:
        return []
    parts = re.split(r"[，,。;；/•·\n]+", text)
    cleaned = [p.strip() for p in parts if 2 <= len(p.strip()) <= 24]
    return cleaned[:max_items]


def detect_price_model(text: str):
    t = text.lower()
    if "free" in t and any(k in t for k in ["per month", "monthly", "/mo", "per year", "annual", "yearly", "pro"]):
        return "freemium"
    if "free" in t:
        return "free"
    if any(k in t for k in ["pay as you go", "usage", "per token", "per 1m"]):
        return "usage"
    if "enterprise" in t and any(k in t for k in ["contact", "sales"]):
        return "enterprise"
    if any(k in t for k in ["per month", "monthly", "per year", "annual", "yearly", "subscription"]):
        return "subscription"
    return ""


def detect_platforms(text: str, website_url: str):
    t = text.lower()
    platforms = []
    if website_url:
        platforms.append("web")
    if re.search(r"\bios\b|iphone|ipad", t):
        platforms.append("ios")
    if "android" in t:
        platforms.append("android")
    if "api" in t or "sdk" in t:
        platforms.append("api")
    if any(k in t for k in ["windows", "mac", "desktop", "linux"]):
        platforms.append("desktop")
    return list(dict.fromkeys(platforms))


def fill_from_web(normalized, timeout: int):
    website_html = fetch_html(normalized.get("websiteUrl", ""), timeout)
    pricing_html = fetch_html(normalized.get("pricingUrl", ""), timeout)
    meta = parse_meta(website_html)
    combined = " ".join([website_html, pricing_html]).strip()

    if not normalized.get("name"):
        normalized["name"] = guess_name(meta.get("title", ""), meta.get("h1", ""))
        normalized["slug"] = normalized.get("slug") or slugify(normalized["name"])
        normalized["id"] = normalized.get("id") or f"t_{normalized['slug']}"

    if not normalized.get("features"):
        normalized["features"] = split_features(meta.get("description", "")) or split_features(meta.get("h1", ""))

    if not normalized.get("tags"):
        normalized["tags"] = split_features(meta.get("keywords", ""))[:3]

    if not normalized.get("priceModel"):
        normalized["priceModel"] = detect_price_model(combined)

    if not normalized.get("platforms"):
        normalized["platforms"] = detect_platforms(combined, normalized.get("websiteUrl", ""))

    return normalized


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--timeout", type=int, default=8)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    input_data = read_json(args.input) or {}
    input_tools = input_data.get("tools", [])
    existing_data = read_json(args.output) or {}

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    existing_tools = existing_data.get("tools", [])
    tool_map = {t.get("slug"): t for t in existing_tools if t.get("slug")}

    sources = {s.get("id"): s for s in existing_data.get("sources", []) if s.get("id")}

    merged_tools = []
    for item in input_tools:
        normalized = normalize_tool(item)
        if args.fetch:
            normalized = fill_from_web(normalized, args.timeout)
        source_id = build_source_id(normalized.get("websiteUrl"))
        if source_id and source_id not in sources:
            sources[source_id] = {
                "id": source_id,
                "name": normalized.get("name", ""),
                "url": normalized.get("websiteUrl", ""),
                "type": "official"
            }
        if source_id and source_id not in normalized.get("sourceIds", []):
            normalized["sourceIds"] = list(dict.fromkeys(normalized.get("sourceIds", []) + [source_id]))

        existing = tool_map.get(normalized["slug"])
        if existing:
            merged = merge_tool(existing, normalized, updated_at)
        else:
            normalized["updatedAt"] = updated_at
            merged = normalized
        merged_tools.append(merged)

    existing_slugs = {t.get("slug") for t in merged_tools if t.get("slug")}
    for t in existing_tools:
        if t.get("slug") not in existing_slugs:
            merged_tools.append(t)

    output = {
        "generatedAt": now,
        "sources": list(sources.values()),
        "categories": existing_data.get("categories", input_data.get("categories", [])),
        "tools": merged_tools,
        "comparisons": existing_data.get("comparisons", input_data.get("comparisons", {"fields": []}))
    }

    if args.dry_run:
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return
    write_json(args.output, output)


if __name__ == "__main__":
    main()
