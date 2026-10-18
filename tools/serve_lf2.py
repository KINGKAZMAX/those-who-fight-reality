#!/usr/bin/env python3
"""Serve the local game with no external game requests."""
import argparse
import functools
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "vendor"
ENTRY = "/F.LF/game/game.html"


class LocalHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", ENTRY)
            self.end_headers()
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=18765)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}{ENTRY}"
    if not (ROOT / ENTRY.lstrip("/")).is_file():
        raise SystemExit("缺少 vendor/F.LF 游戏文件，请检查安装目录。")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), functools.partial(LocalHandler, directory=str(ROOT)))
    except OSError as error:
        raise SystemExit(f"无法启动本地服务器：{error}。可用 --port 指定其他端口。")
    print(f"與名為現實的怪物戰鬥的人們 · 本機體驗：{url}\n关闭此窗口或按 Ctrl+C 停止。", flush=True)
    if args.open:
        threading.Timer(0.3, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
