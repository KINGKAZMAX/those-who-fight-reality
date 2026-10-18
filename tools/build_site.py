#!/usr/bin/env python3
"""Build a self-contained static release without changing the local demo tree."""

import argparse
import hashlib
import html
import json
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "vendor" / "F.LF"
CONTENT = ROOT / "vendor" / "LF2_19"
TEXT_EXTENSIONS = {".html", ".js", ".css", ".json", ".txt", ".md"}
RUNTIME_EXTENSIONS = TEXT_EXTENSIONS | {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".ogg", ".mp3", ".ac3", ".m4a", ".woff", ".woff2", ".ttf", ".otf"}
GAME_FILES = {
    "game.html", "game.js", "buildinfo.js", "mac-controls.js",
    "chapter-ui.css", "chapter-ui.js", "reality-art.js", "reality-chapter.js",
    "reality-skills.js", "reality-skills-ui.js", "reality-skills.css",
    "urban-ui.js", "urban-ui.css", "urban-hud.js", "urban-hud.css",
    "native-animation.js", "native-animation-data.js",
}
MARKER = ".reality-static-release"


def base_path(value):
    """Only accept URL path components, never an origin or traversal."""
    if not re.fullmatch(r"/[A-Za-z0-9_./-]*", value) or ".." in value.split("/"):
        raise argparse.ArgumentTypeError("base-path must be a URL path such as / or /reality-fighters/")
    return "/" + "/".join(part for part in value.split("/") if part) + ("/" if value.strip("/") else "")


def rewrite(text, base):
    return text.replace("/F.LF/game/", base + "play/").replace("/LF2_19/", base + "content/")


def copy_runtime(source, target, base):
    if source.is_symlink():
        raise ValueError("Runtime symlinks must be resolved explicitly: " + str(source.relative_to(ROOT)))
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix.lower() in TEXT_EXTENSIONS:
        target.write_text(rewrite(source.read_text(encoding="utf-8"), base), encoding="utf-8")
    else:
        shutil.copyfile(source, target)


def read_catalog():
    text = (ENGINE / "game/native-animation-data.js").read_text(encoding="utf-8")
    return json.loads(text[text.index("define(") + 7:text.rindex(")")])


def art_dependencies(game_texts, catalog):
    art = ENGINE / "game/art"
    files = set()
    for text in game_texts:
        for name in re.findall(r"['\"]([A-Za-z0-9_./-]+\.(?:png|webp|jpg|svg))['\"]", text):
            if not name.startswith("/") and (art / name).is_file():
                files.add(name)
    active_ids = set()
    for key, replacement in catalog.get("replacements", {}).items():
        if replacement.get("registered") or replacement.get("reviewed"):
            files.add(replacement["file"])
            active_ids.add(int(key.split(":", 1)[0]))
    for patch in catalog.get("patches", []):
        if patch["objectId"] in active_ids:
            files.add(patch["file"])
    for name in files:
        resolved = (art / name).resolve()
        if not resolved.is_relative_to(art.resolve()) or not resolved.is_file():
            raise ValueError("Missing or invalid runtime artwork: " + name)
    return sorted(files)


def public_catalog(catalog):
    """Generation provenance is local authoring metadata, not a game dependency."""
    if isinstance(catalog, dict):
        return {key: public_catalog(value) for key, value in catalog.items() if key not in {"generatedSource", "generatedSources"}}
    if isinstance(catalog, list):
        return [public_catalog(value) for value in catalog]
    return catalog


def add_notices(output, source_url):
    shutil.copyfile(ENGINE / "LICENSE", output / "LICENSE")
    notice = """Third-party notices / 第三方聲明

This distribution retains the following upstream components and notices.
Product branding does not change authorship or the licenses of these components.

Engine: Project F (F.LF), an open source implementation of Little Fighter 2.
Source: https://github.com/Project-F/F.LF
License: GNU General Public License v3.0. See LICENSE in this distribution.
The engine JavaScript is distributed as readable source in engine/.

Game data, source sprites and sounds: Project-F/LF2_19.
Source: https://github.com/Project-F/LF2_19
Original work by Marti Wong and Starsky Wong, 1999–2005, all rights reserved.
These original assets retain their original copyright; the engine GPL does not
relicense them. Original source artwork remains in content/ where used by the
animation runtime. New school-world artwork is distributed in play/art/.

RequireJS: Copyright (c) 2010–2012 The Dojo Foundation; MIT or new BSD license.
License notices remain in engine/third_party/require.js.
Other third-party code retains its inline copyright and license notices.

Fonts: local font licenses and source notes are included beside each font in
play/fonts/. The type treatment does not reproduce another game's logo.
"""
    if source_url:
        notice += "\nThis modified distribution's source: " + source_url + "\n"
    (output / "NOTICE.txt").write_text(notice, encoding="utf-8")
    (output / "NOTICE.html").write_text(
        '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>第三方聲明</title><style>body{max-width:850px;margin:40px auto;padding:20px;font:16px/1.7 system-ui;white-space:pre-wrap}a{color:#a82424}</style>'
        '<a href="./play/">返回遊戲</a><pre style="white-space:pre-wrap">' + html.escape(notice) + '</pre><a href="./LICENSE">完整授權條文</a></html>',
        encoding="utf-8",
    )


def validate(output, base, artwork, catalog):
    required = ["index.html", "play/index.html", "play/game.js", "engine/third_party/require.js", "content/manifest.js", "LICENSE", "NOTICE.txt"]
    required += ["play/art/" + name for name in artwork]
    required += ["content/" + sheet["source"] for obj in catalog["objects"] for sheet in obj["sheets"]]
    required += ["content/sound/soundpack." + ext for ext in ("js", "mp3", "ogg", "m4a", "ac3")]
    for name in required:
        if not (output / name).is_file():
            raise ValueError("Release is missing a required resource: " + name)
    for path in output.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(output)
        if any(part in {".git", "node_modules", "__pycache__"} or part.startswith(".env") for part in relative.parts):
            raise ValueError("Private or development file entered release: " + str(relative))
        if path.suffix in {".js", ".css", ".html"}:
            text = path.read_text(encoding="utf-8")
            # These URL forms must not escape a repository's Pages subdirectory.
            if re.search(r"['\"]/(?:F\.LF|LF2_19)/", text):
                raise ValueError("Unmapped legacy root URL in " + str(relative))
            for target in re.findall(r"['\"](" + re.escape(base) + r"(?:play|content)/[^'\"?\s]+\.(?:png|jpg|webp|svg))['\"]", text):
                if not (output / target[len(base):]).is_file():
                    raise ValueError("Missing absolute resource in " + str(relative) + ": " + target)
    return len(set(required))


def build(output, base, source_url):
    if output == ROOT or output in ROOT.parents or output.is_relative_to(ENGINE) or output.is_relative_to(CONTENT):
        raise ValueError("Choose a separate output directory; source directories cannot be replaced")
    if output.exists() and any(output.iterdir()) and not (output / MARKER).exists():
        raise ValueError("Refusing to overwrite a non-release directory: " + str(output))
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=".reality-release-", dir=output.parent))
    try:
        for folder in ("LF", "core", "third_party"):
            for source in sorted((ENGINE / folder).iterdir()):
                if source.is_file() and source.suffix.lower() in RUNTIME_EXTENSIONS:
                    copy_runtime(source, temp / "engine" / folder / source.name, base)
        catalog = read_catalog()
        game_texts = []
        game_files = GAME_FILES | {path.name for path in (ENGINE / "game").glob("*.css")}
        for name in sorted(game_files):
            source = ENGINE / "game" / name
            text = rewrite(source.read_text(encoding="utf-8"), base)
            if name != "native-animation-data.js":
                game_texts.append(text)
            if name == "game.html":
                config = json.dumps({"root": "../engine/", "package": "../content"}, separators=(",", ":"))
                text, count = re.subn(r"(<pre\b[^>]*id=['\"]flf-config['\"][^>]*>).*?(</pre>)", lambda match: match[1] + "\n" + config + "\n" + match[2], text, flags=re.S)
                if count != 1:
                    raise ValueError("Expected exactly one game loader configuration")
                text = text.replace('src="../third_party/require.js"', 'src="../engine/third_party/require.js"')
                text = text.replace("</head>", '<link rel="license" href="../NOTICE.html">\n</head>')
                name = "index.html"
            elif name == "game.js":
                text, count = re.subn(r"paths:\s*\{\s*\}", "paths: { game: '../play' }", text, count=1)
                if count != 1:
                    raise ValueError("Expected the existing RequireJS path configuration")
            elif name == "native-animation-data.js":
                text = "/* Runtime animation catalog; authoring provenance omitted. */\ndefine(" + json.dumps(public_catalog(catalog), ensure_ascii=False, indent=2) + ");\n"
            target = temp / "play" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        fonts = ENGINE / "game/fonts"
        if fonts.exists():
            for source in fonts.rglob("*"):
                if source.is_file() and not any(part.startswith(".") for part in source.relative_to(fonts).parts):
                    if source.suffix.lower() in RUNTIME_EXTENSIONS or source.name.upper().startswith(("LICENSE", "OFL", "NOTICE")):
                        copy_runtime(source, temp / "play/fonts" / source.relative_to(fonts), base)
        artwork = art_dependencies(game_texts, catalog)
        for name in artwork:
            copy_runtime(ENGINE / "game/art" / name, temp / "play/art" / name, base)
        for source in sorted(CONTENT.rglob("*")):
            relative = source.relative_to(CONTENT)
            if source.is_file() and not any(part.startswith(".") for part in relative.parts) and source.suffix.lower() in RUNTIME_EXTENSIONS:
                if source.name in {"soundsprite.html", "Crusher.diff.txt"}:
                    continue
                copy_runtime(source, temp / "content" / relative, base)
        # Obsolete mirrors are neither required nor contacted by this release.
        (temp / "content/resourcemap.js").write_text("define({condition:'location contain http at 0',resource:{}});\n", encoding="utf-8")
        entry = (temp / "play/index.html").read_text(encoding="utf-8")
        title_match = re.search(r"<title>(.*?)</title>", entry, re.S)
        title = title_match[1] if title_match else "與名為現實的怪物戰鬥的人們"
        (temp / "index.html").write_text(
            '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta http-equiv="refresh" content="0;url=./play/"><title>' + title + '</title>'
            '<style>body{background:#090b10;color:#fff;font:700 20px system-ui;display:grid;place-items:center;min-height:95vh}a{color:inherit}</style>'
            '<a href="./play/">' + title + ' · 進入遊戲</a></html>\n', encoding="utf-8")
        (temp / ".nojekyll").touch()
        (temp / MARKER).write_text("Generated by tools/build_site.py. Safe to rebuild.\n", encoding="utf-8")
        add_notices(temp, source_url)
        checked = validate(temp, base, artwork, catalog)
        files = [{"path": str(path.relative_to(temp)), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(temp.rglob("*")) if path.is_file()]
        manifest = {"basePath": base, "entry": base + "play/", "source": source_url or None, "artworkFiles": len(artwork), "nativeArtwork": [name for name in artwork if name.startswith("animation/")], "requiredResourcesChecked": checked, "files": files, "totalBytes": sum(item["bytes"] for item in files)}
        (temp / "release-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        temp.rename(output)
        return manifest
    finally:
        if temp.exists():
            shutil.rmtree(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--base-path", type=base_path, default="/", help="Deployment prefix, e.g. /reality-fighters/ for GitHub project Pages")
    parser.add_argument("--source-url", default="", help="Public repository URL for this modified source distribution")
    args = parser.parse_args()
    if args.source_url and (urlsplit(args.source_url).scheme != "https" or not urlsplit(args.source_url).netloc):
        parser.error("source-url must be an HTTPS repository URL")
    try:
        manifest = build(args.output.resolve(), args.base_path, args.source_url)
    except (ValueError, OSError) as error:
        parser.exit(1, "Build failed: " + str(error) + "\n")
    print(json.dumps({"output": str(args.output.resolve()), "entry": manifest["entry"], "files": len(manifest["files"]), "artworkFiles": manifest["artworkFiles"], "bytes": manifest["totalBytes"], "megabytes": round(manifest["totalBytes"] / 1024 / 1024, 2), "requiredResourcesChecked": manifest["requiredResourcesChecked"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
