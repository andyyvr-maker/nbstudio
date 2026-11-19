"""從 YouTube 公開 RSS 抓頻道與播放清單的最新影片，合併進 data.json，再重新產生 index.html。

- 不需要 API 金鑰。每個 RSS 只提供最新 15 支，每天跑一次足夠。
- 新影片加在最前面；既有影片只更新觀看次數與播放清單歸屬。
- 新建立的播放清單請手動加進 playlists.json（index 依序往下編）。
- 任何網路錯誤都只略過該來源，不會破壞既有資料。
"""
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import build  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CHANNEL_ID = "UC1oxk7580wDZ9sRW7IcTf1Q"
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
      "media": "http://search.yahoo.com/mrss/"}
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass
UA = {"User-Agent": "Mozilla/5.0 (nbstudio-site updater)"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def feed(kind, value):
    """回傳自己頻道的 [(video_id, title, views)]，失敗回傳 None。"""
    try:
        root = ET.fromstring(fetch(f"https://www.youtube.com/feeds/videos.xml?{kind}={value}"))
    except Exception as e:  # noqa: BLE001
        print(f"  ! 無法讀取 {kind}={value}：{e}")
        return None
    out = []
    for ent in root.findall("a:entry", NS):
        if ent.findtext("yt:channelId", namespaces=NS) != CHANNEL_ID:
            continue  # 播放清單裡收藏的其他頻道影片不列入
        vid = ent.findtext("yt:videoId", namespaces=NS)
        title = ent.findtext("a:title", default="", namespaces=NS)
        stat = ent.find("media:group/media:community/media:statistics", NS)
        views = int(stat.get("views", 0)) if stat is not None else 0
        out.append((vid, title, views))
    return out


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def is_short(vid):
    """/shorts/ID 回 200 代表是 Shorts；一般影片會被 303 轉址。"""
    opener = urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(urllib.request.Request(f"https://www.youtube.com/shorts/{vid}", headers=UA, method="HEAD"), timeout=20)
        return r.status == 200
    except urllib.error.HTTPError as e:
        return False if e.code in (301, 302, 303, 307, 308) else True
    except Exception:  # noqa: BLE001
        return True


def clean(title):
    t = re.sub(r"#\S+", "", title)
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"[\s\-–—:：]+$", "", t)


def main():
    data_path = ROOT / "data.json"
    rows = json.loads(data_path.read_text(encoding="utf-8"))
    playlists = json.loads((ROOT / "playlists.json").read_text(encoding="utf-8"))
    by_id = {r[0]: r for r in rows}
    before = json.dumps(rows, ensure_ascii=False)
    new_rows = []

    print("讀取頻道最新影片…")
    for vid, title, views in feed("channel_id", CHANNEL_ID) or []:
        if vid in by_id:
            by_id[vid][3] = max(by_id[vid][3], views)
        else:
            row = [vid, clean(title), 1 if is_short(vid) else 0, views, []]
            new_rows.append(row)
            by_id[vid] = row
            print(f"  + 新影片：{row[1]}（{'Shorts' if row[2] else '影片'}）")

    print("讀取播放清單…")
    for pl in playlists:
        items = feed("playlist_id", pl["id"])
        if items is None:
            continue
        for vid, title, views in items:
            row = by_id.get(vid)
            if row is None:  # 清單裡有、但不在頻道最新 15 支內的舊影片
                row = [vid, clean(title), 1 if is_short(vid) else 0, views, []]
                new_rows.append(row)
                by_id[vid] = row
                print(f"  + 從清單補入：{row[1]}")
            if pl["index"] not in row[4]:
                row[4].append(pl["index"])
                row[4].sort()
                print(f"  ~ {row[1][:30]} 加入「{pl['name']}」")

    rows = new_rows + rows
    after = json.dumps(rows, ensure_ascii=False)
    if after == before:
        print("沒有變更。")
        return
    data_path.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"data.json 已更新：共 {len(rows)} 支，新增 {len(new_rows)} 支。")
    build()


if __name__ == "__main__":
    main()
