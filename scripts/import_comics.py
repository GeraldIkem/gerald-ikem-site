"""Turn a CLZ Comics XML export into the JSON the shelf reads.

Usage:
    python scripts/import_comics.py path/to/export.xml [out.json]

Export from CLZ Comics with File > Export > XML. Re-run this whenever the
collection changes; the site picks up src/data/comics.json on the next build.
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "comics.json"

STATUS = {
    "In Collection": "shelf",
    "On Order": "ordered",
    "On Wish List": "wishlist",
    "Not in Collection": "read",
}

# CLZ "format" values, grouped by how thick the book sits on a shelf.
SIZE = {
    "Omnibus": "omnibus",
    "Absolute Edition": "absolute",
    "Deluxe edition": "deluxe",
    "Hardcover": "hardcover",
    "Collected edition": "trade",
    "Trade Paperback": "trade",
    "Comic": "trade",
}


def text(node: ET.Element | None, path: str) -> str:
    if node is None:
        return ""
    found = node.find(path)
    return (found.text or "").strip() if found is not None and found.text else ""


# Series names CLZ stores in catalogue shorthand.
TITLE_FIXES = {
    "Jeph Loeb & Tim Sale Hulk TP": "Hulk: Gray",
    "JLA: The Tower Of Babel - The Deluxe Edition": "JLA: The Tower of Babel — The Deluxe Edition",
    "Do A Powerbomb! TP": "Do a Powerbomb!",
}

# Books whose CLZ name leaves out which volume they are.
ID_TITLES = {
    "1115275": "Transformers: Book One — The Deluxe Edition",
    "394254": "Teenage Mutant Ninja Turtles: The IDW Collection Vol. 1",
}


# Series I own but leave off the site.
EXCLUDE = ("Something Is Killing the Children",)

# More books to leave off, listed in a local file that stays out of the repo: one CLZ id
# or title prefix per line, # for comments.
HIDDEN = Path(__file__).resolve().parent / "hidden-comics.txt"


def hidden() -> set[str]:
    if not HIDDEN.exists():
        return set()
    lines = (line.split("#", 1)[0].strip() for line in HIDDEN.read_text(encoding="utf-8").splitlines())
    return {line for line in lines if line}

# A title that lists issue numbers ("JLA #18-21, 32-33...") describes the contents, not the book.
CONTENTS = re.compile(r"#\d")


def title_of(comic: ET.Element) -> str:
    title = text(comic, "mainsection/title")
    series = text(comic, "mainsection/series/displayname")
    # CLZ sometimes stores a shortened name ("Superman", "Volume 1") or the contents as the
    # title; the series name is then the book's real title.
    if (
        not title
        or CONTENTS.search(title)
        or re.fullmatch(r"Volume \d+", title)
        or (series != title and series.lower().startswith(title.lower()))
    ):
        title = series or title
    return TITLE_FIXES.get(title, title)


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def size_of(title: str, fmt: str) -> str:
    lowered = title.lower()
    if "omnibus" in lowered or "omnibus" in fmt.lower() or "venomnibus" in lowered:
        return "omnibus"
    if "absolute" in lowered and fmt == "Absolute Edition":
        return "absolute"
    if "deluxe" in lowered:
        return "deluxe"
    return SIZE.get(fmt, "trade")


def cover_url(comic: ET.Element, side: str = "front") -> str | None:
    for path in (f"cover{side}default", f"cover{side}large", f"cover{side}"):
        url = text(comic, path)
        if url.startswith("https://"):
            return url
    return None


def clean_note(note: str) -> str:
    note = re.sub(r"\s+", " ", note).strip()
    return note


def year_of(comic: ET.Element) -> int | None:
    for path in ("releasedate/year/displayname", "publicationdate/year/displayname"):
        value = text(comic, path)
        if value.isdigit():
            return int(value)
    return None


def convert(xml_path: Path) -> list[dict]:
    root = ET.parse(xml_path).getroot()
    skip = hidden()
    books = []
    for comic in root.iter("comic"):
        status_label = text(comic, "collectionstatus")
        fmt = text(comic, "format/displayname")
        publisher = text(comic, "publisher/displayname")
        pages = text(comic, "mainsection/pagecount")
        title = title_of(comic)
        series = text(comic, "mainsection/series/displayname")
        if any(title.startswith(name) or series.startswith(name) for name in EXCLUDE):
            continue
        # Books added by hand in CLZ have no database id (it reads 0); name them instead, so no two share one.
        core_id = text(comic, "bpcomicid")
        if core_id in skip or any(
            title.lower().startswith(name.lower()) or series.lower().startswith(name.lower()) for name in skip
        ):
            continue
        title = ID_TITLES.get(core_id, title)
        books.append(
            {
                "id": core_id if core_id and core_id != "0" else f"x-{slug(title)}",
                "title": title,
                "publisher": publisher,
                "format": fmt,
                "size": size_of(title, fmt),
                "status": STATUS.get(status_label, "shelf"),
                "pages": int(pages) if pages.isdigit() and int(pages) > 0 else None,
                "year": year_of(comic),
                "note": clean_note(text(comic, "mainsection/notes")),
                "coverUrl": cover_url(comic),
            }
        )
        # Only in the export after "Update from Core" in CLZ with back covers switched on.
        back = cover_url(comic, "back")
        if back:
            books[-1]["backUrl"] = back
    order = {"shelf": 0, "ordered": 1, "read": 2, "wishlist": 3}
    books.sort(key=lambda b: (order[b["status"]], b["publisher"], b["title"].lower()))
    return books


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    xml_path = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    books = convert(xml_path)
    # Cover files and colours come from scripts/covers.mjs, spines and backs from
    # scripts/spines.mjs; keep them across re-imports.
    if out.exists():
        previous = {book["id"]: book for book in json.loads(out.read_text(encoding="utf-8"))}
        for book in books:
            for key in ("cover", "coverColor", "coverRatio", "spineImage", "spineRatio", "backImage"):
                if key in previous.get(book["id"], {}):
                    book[key] = previous[book["id"]][key]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(books, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for book in books:
        counts[book["status"]] = counts.get(book["status"], 0) + 1
    print(f"Wrote {len(books)} books to {out}: {counts}")


if __name__ == "__main__":
    main()
