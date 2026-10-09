#!/usr/bin/env python3
"""Harvest RhoInc renderer wiki pages into traceable Markdown requirement docs.

Bootstrap tool: it turns a wiki clone into a first-draft matrix under
`requirements/`. It reads `<renderer>.wiki/` directories beside this checkout —
set WIKI_ROOT to read them from somewhere else (a linked worktree needs that) —
and REQUIREMENTS_OUT to write the matrices somewhere other than `requirements/`.
The workflow around it is in `.claude/skills/port-a-renderer/harvesting.md`.

Existing matrices are never overwritten: they have been reviewed and extended
well past the raw harvest, and safety.viz CI compares them against committed
requirement extracts. Pass --force only to re-harvest a matrix you intend to
lose. After writing, run `npm run requirements` and commit the regenerated
extract with the matrix.
"""
from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = Path(os.environ.get("WIKI_ROOT", ROOT.parent))
OUT = Path(os.environ.get("REQUIREMENTS_OUT", ROOT / "requirements"))

RENDERERS = [
    ("safety-histogram", "SH"),
    ("aeexplorer", "AE"),
    ("ae-timelines", "AET"),
    ("safety-outlier-explorer", "SOE"),
    ("paneled-outlier-explorer", "POE"),
    ("safety-results-over-time", "SROT"),
    ("safety-shift-plot", "SSP"),
    ("safety-delta-delta", "SDD"),
    ("web-codebook", "WCB"),
]

SOURCE_PRIORITY = [
    "Technical-Documentation.md",
    "Data-Guidelines.md",
    "Configuration.md",
    "Explorer-Configuration.md",
    "API.md",
    "Home.md",
]

AREA_HINTS = [
    ("Regression", "REG"), ("User Requirement", "USER"), ("Functional", "FUNC"),
    ("Data", "DATA"), ("Configuration", "CFG"), ("API", "API"),
    ("Listing", "LIST"), ("Export", "EXPORT"), ("Filter", "CTRL"),
    ("Control", "CTRL"), ("Hover", "INT"), ("Brush", "INT"), ("Highlight", "INT"),
    ("Chart", "CHART"), ("Participant", "COUNT"), ("Column", "COUNT"), ("Row", "COUNT"),
]

SKIP_LINES = {"", "---"}

# A destination may hold one level of parentheses, as `javascript:alert(1)` does.
DEST = r"(?:[^()\s]|\([^()]*\))*"
IMAGE = re.compile(r"!\[([^\]]*)\]\(" + DEST + r"(?:\s[^)]*)?\)")
LINK = re.compile(r"\[([^\]]+)\]\((" + DEST + r")(?:\s[^)]*)?\)")
# Markdown also takes a destination in angle brackets, which may hold spaces and
# parentheses: `[label](<javascript:alert(1)>)`. The site build drops the brackets,
# and reads up to the last `>` before the closing parenthesis, so this does too.
ANGLED = re.compile(r"\[([^\]]+)\]\(\s*<([^\n]*?)>(?:\s[^)]*)?\)")
SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")

def safe_links(text: str) -> str:
    """Keep a link only when its destination is http(s) or relative (#238).

    A matrix row is published: the site build turns `[label](destination)` into a
    live link. Wiki text is not ours, so a destination with any other scheme is
    reduced to its label, and an image, which a requirement never needs, to its alt
    text. A destination in angle brackets is held to the same rule (#258).
    """
    def keep(m: re.Match) -> str:
        label, dest = m.group(1), m.group(2)
        # A browser reads a scheme through the spaces, tabs and line breaks an
        # author can put before and inside it. A stray `<` is not part of one.
        bare = re.sub(r"[\s\x00-\x1f<]+", "", dest)
        if SCHEME.match(bare) and not re.match(r"^https?://", bare, re.I):
            return label
        return m.group(0)

    # A link reduced to its label can leave a new link behind it, as
    # `[[x](data:a)](javascript:b)` does, so the text is read until it stops
    # changing. The site build holds the same rule on whatever reaches it.
    for _ in range(20):
        reduced = LINK.sub(keep, ANGLED.sub(keep, IMAGE.sub(lambda m: m.group(1), text)))
        if reduced == text:
            break
        text = reduced

    # Whatever is left that still reads `](` and then a scheme that is not
    # http(s) is pulled apart, so that the site build does not take it for a
    # link. A scheme written with an entity or a backslash, or an autolink in
    # angle brackets, is not looked for: the site build escapes those and
    # publishes none, and it holds this rule itself on every row.
    def apart(m: re.Match) -> str:
        bare = re.sub(r"[\s\x00-\x1f<]+", "", m.group(1))
        if SCHEME.match(bare) and not re.match(r"^https?://", bare, re.I):
            return "] ("
        return m.group(0)

    # Looked ahead at, not consumed: a link inside another's title is seen too.
    return re.sub(r"\]\((?=([^)]{0,80}))", apart, text)

def clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    text = safe_links(text)
    text = text.replace("|", "\\|")
    return text

def area_code(heading: str, source_name: str) -> str:
    hay = f"{heading} {source_name}".lower()
    for key, code in AREA_HINTS:
        if key.lower() in hay:
            return code
    return "REQ"

def iter_requirements(path: Path):
    heading_stack: list[str] = []
    in_code = False
    paragraph: list[str] = []

    def flush_para():
        nonlocal paragraph
        if paragraph:
            text = clean(" ".join(paragraph))
            paragraph = []
            if len(text) > 40 and not text.startswith("#"):
                yield (" > ".join(heading_stack) or path.stem, text)

    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.rstrip()
        if line.strip().startswith("```"):
            in_code = not in_code
            paragraph = []
            continue
        if in_code:
            continue
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            yield from flush_para()
            level = len(m.group(1))
            title = clean(m.group(2))
            heading_stack[:] = heading_stack[: level - 1]
            heading_stack.append(title)
            continue
        stripped = line.strip()
        if stripped in SKIP_LINES:
            yield from flush_para()
            continue
        bullet = re.match(r"^[-*+]\s+(.*)", stripped)
        numbered = re.match(r"^\d+[.)]\s+(.*)", stripped)
        if bullet or numbered:
            yield from flush_para()
            item = clean((bullet or numbered).group(1))
            if len(item) > 10:
                yield (" > ".join(heading_stack) or path.stem, item)
            continue
        # Treat table rows as source material only if they look descriptive.
        if stripped.startswith("|"):
            yield from flush_para()
            continue
        paragraph.append(stripped)
    yield from flush_para()

def write_renderer_doc(repo: str, prefix: str) -> None:
    wiki = PROJECTS / f"{repo}.wiki"
    out = OUT / f"{repo}.md"
    files = [wiki / name for name in SOURCE_PRIORITY if (wiki / name).exists()]
    files += sorted(p for p in wiki.glob("*.md") if p.name not in SOURCE_PRIORITY)

    rows = []
    counters: dict[str, int] = {}
    for source in files:
        for heading, req in iter_requirements(source):
            area = area_code(heading, source.name)
            counters[area] = counters.get(area, 0) + 1
            rid = f"{prefix}-{area}-{counters[area]:03d}"
            rows.append((rid, area, req, f"RhoInc/{repo}.wiki/{source.name}::{heading}", "planned", "TBD", "harvested", "Review before implementation; split further if needed."))

    lines = [
        f"# {repo} requirements matrix",
        "",
        "> Auto-harvested from the RhoInc wiki. Treat this as a source-backed starting matrix: review, de-duplicate, and refine before implementation.",
        "",
        "## Source inventory",
        "",
    ]
    lines += [f"- `{p.name}`" for p in files]
    lines += [
        "",
        "## Requirements",
        "",
        "| ID | Area | Requirement | Source | Evidence Type | Test/Evidence Link | Status | Notes |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        lines.append("| " + " | ".join(clean(x) for x in row) + " |")
    lines += [
        "",
        "## Next review tasks",
        "",
        "- Remove duplicate or non-behavioral rows.",
        "- Split compound requirements into separate rows where needed.",
        "- Map each requirement to automated, browser, visual, manual, or deferred evidence.",
        "- Add baseline and nextgen demo evidence links during implementation.",
    ]
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-harvest matrices that already exist, discarding the reviewed content",
    )
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Harvesting into {OUT}")
    for repo, prefix in RENDERERS:
        target = OUT / f"{repo}.md"
        if target.exists() and not args.force:
            print(f"· {repo}: matrix already exists — skipping (use --force to overwrite)")
            continue
        write_renderer_doc(repo, prefix)
    print("Run `npm run requirements` and commit the regenerated extracts.")

if __name__ == "__main__":
    main()
