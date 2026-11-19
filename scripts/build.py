"""把 src.html + data.json + assets/logo.jpg 組成單一檔案 index.html。"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


try:
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass


def build():
    src = (ROOT / "src.html").read_text(encoding="utf-8")
    rows = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    data = "const RAW=" + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";"
    logo = "data:image/jpeg;base64," + base64.b64encode((ROOT / "assets" / "logo.jpg").read_bytes()).decode()
    total = str(len(rows))
    out = src.replace("__DATA__", data).replace("__LOGO__", logo).replace("__TOTAL__", total)
    (ROOT / "index.html").write_text(out, encoding="utf-8")
    print(f"index.html 已產生：{len(rows)} 支影片，{len(out):,} bytes")


if __name__ == "__main__":
    build()
