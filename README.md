# N. B. Studio 品牌網站

YouTube 頻道 [N. B. Studio](https://www.youtube.com/@n.b.studio4666) 的品牌形象網站：WebGL 水波首屏，往下捲一鏡到底看完所有影片。

## 自動更新

GitHub Actions 每天台灣時間早上 6:00 執行 `scripts/update.py`：

1. 讀取頻道與 `playlists.json` 裡每個播放清單的公開 RSS（不需要 API 金鑰）。
2. 新影片加進 `data.json`，順便更新觀看次數與播放清單歸屬。
3. 重新產生 `index.html` 並提交，GitHub Pages 會自動發布。

想立刻更新：到 repo 的 **Actions → 每日更新頻道影片 → Run workflow**。

## 新增播放清單

在 `playlists.json` 最後加一筆（`index` 接著往下編號），再到 `src.html` 的 `CATS` 與 `classify()` 決定它屬於哪個主題站。

## 檔案

| 檔案 | 用途 |
|---|---|
| `src.html` | 版面、樣式與 3D 程式（模板） |
| `data.json` | 影片資料：`[id, 標題, 是否Shorts, 觀看次數, [播放清單index]]` |
| `playlists.json` | 要追蹤的播放清單 |
| `assets/logo.jpg` | 頻道 logo |
| `scripts/build.py` | 組成單一檔案 `index.html` |
| `scripts/update.py` | 從 RSS 抓新影片 |
| `index.html` | 產生出來的網站（不要直接改） |
