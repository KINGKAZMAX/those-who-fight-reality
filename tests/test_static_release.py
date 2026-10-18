"""Check the public build's two URL layouts without requiring a browser."""

import importlib.util
import json
import re
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_site", ROOT / "tools/build_site.py")
build_site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_site)


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag in {"script", "img"} and attributes.get("src"):
            self.urls.append(attributes["src"])
        if tag == "link" and attributes.get("href"):
            self.urls.append(attributes["href"])


class StaticReleaseTest(unittest.TestCase):
    def verify_layout(self, prefix):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "release"
            manifest = build_site.build(output, prefix, "https://github.com/example/reality-fighters")
            origin = "https://example.github.io"
            entry = origin + prefix + "play/"

            def exists(url):
                path = urlsplit(url).path
                self.assertTrue(path.startswith(prefix), "Resource escaped project Pages prefix: " + path)
                target = output / path[len(prefix):]
                self.assertTrue(target.is_file(), "Missing static dependency: " + path)

            page = (output / "play/index.html").read_text()
            parser = Resources()
            parser.feed(page)
            for resource in parser.urls:
                exists(urljoin(entry, resource))

            config = json.loads(re.search(r"<pre\b[^>]*id=['\"]flf-config['\"][^>]*>(.*?)</pre>", page, re.S)[1])
            engine_url = urljoin(entry, config["root"])
            exists(urljoin(engine_url, config["package"] + "/manifest.js"))
            # The application loads readable AMD modules from engine/ and play/.
            for directory_name in ("play", "engine/LF", "engine/core"):
                for script in (output / directory_name).glob("*.js"):
                    text = script.read_text()
                    for module in re.findall(r"['\"]((?:(?:core|LF|game|third_party)/)[A-Za-z0-9_./-]+)['\"]", text):
                        if module.endswith((".png", ".html", ".wav")):
                            continue
                        if module.startswith("game/"):
                            target = "../play/" + module[5:]
                        else:
                            target = module
                        if not target.endswith((".js", ".css")):
                            target += ".js"
                        exists(urljoin(engine_url, target))
            for css in (output / "play").glob("*.css"):
                for resource in re.findall(r"url\(['\"]?([^)'\"]+)['\"]?\)", css.read_text()):
                    if not resource.startswith("data:"):
                        exists(urljoin(entry + css.name, resource))
            self.assertGreater(manifest["artworkFiles"], 16)
            self.assertTrue(manifest["nativeArtwork"])
            self.assertNotIn("/Users/", (output / "play/native-animation-data.js").read_text())
            self.assertFalse((output / "play/native-animation-candidate.js").exists())
            self.assertFalse((output / "content/sound/soundpack.wav").exists())
            self.assertTrue((output / "play/fonts/BarlowCondensed-OFL.txt").exists())
            self.assertTrue((output / "play/fonts/NotoSansTC-OFL.txt").exists())
            self.assertLess(max(file["bytes"] for file in manifest["files"]), 100 * 1024 * 1024)

    def test_domain_root(self):
        self.verify_layout("/")

    def test_project_subdirectory(self):
        self.verify_layout("/those-who-fight-reality/")

    def test_path_validation(self):
        self.assertEqual(build_site.base_path("/a"), "/a/")
        for path in ("https://example.com/", "/../", "/repo?debug=1", "/repo/#page"):
            with self.assertRaises(Exception):
                build_site.base_path(path)

    def test_preserve_unrelated_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            sentinel = output / "keep.txt"
            sentinel.write_text("existing user file")
            with self.assertRaises(ValueError):
                build_site.build(output, "/", "")
            self.assertEqual(sentinel.read_text(), "existing user file")


if __name__ == "__main__":
    unittest.main()
