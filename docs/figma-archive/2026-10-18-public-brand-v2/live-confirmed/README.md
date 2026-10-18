# 與名為現實的怪物戰鬥的人們

**THOSE WHO FIGHT THE MONSTER CALLED REALITY**

中式荒誕 × 魔幻現實主義的同屏合作格鬥遊戲。

課本、考試、排名與選擇，成了橫在眼前的怪物。從小學一路走向畢業，我們不斷倒下，再拉著彼此站起來。

**[進入線上體驗](https://kingkazmax.github.io/those-who-fight-reality/)**

## 現在可以玩

- 6 位夥伴：小一、林夏、周齊、陳野、唐梨、沈舟，合計 27 項技能。
- 5 處場景：实验小学校門、排名廣場、大學校門、午後教室與高中考場。
- 3 種怪物：紙卷怪、訂正獵手、催促鐘怪，可指定或混合編隊。
- 第一章「不要掉隊」包含兩段戰鬥、雙人援護、檢查點與合照收藏。
- 自由對戰支援 1–2 位玩家、1–6 隻怪物，最多 8 人同屏。

完整升學故事與後續章節仍在製作。這是鍵盤操作的桌面體驗版，推薦在電腦瀏覽器遊玩。

## 一台電腦，兩個人一起玩

| 操作 | 玩家一 | 玩家二 |
| --- | --- | --- |
| 移動 | W / A / S / D | 方向鍵 |
| 攻擊／拾取 | F | J |
| 跳躍 | G | K |
| 防禦 | H | L |

按 **P** 暫停，按 **Esc** 返回選角；主選單可修改並保存鍵位。在「全技能出招表」查閱各角色組合。技能需要依次輸入，例如防禦 → 方向 → 攻擊；不必同時按住。

故事模式中，靠近倒下的同伴並按住自己的防禦鍵 1.5 秒可扶起。檢查點只保存在目前裝置與瀏覽器中；公開網站和本機測試的進度各自獨立。

## 本機運行與建置

需要 Python 3.10+；程式測試需要 Node.js 20+。

```sh
python3 tools/serve_game.py --open
```

製作公開版本：

```sh
python3 tools/build_site.py --base-path /those-who-fight-reality/ --source-url https://github.com/KINGKAZMAX/those-who-fight-reality
```

輸出位於 `dist/`，根頁會進入 `play/`。如果部署在獨立域名根目錄，使用 `--base-path /`。詳見 [公開部署說明](docs/公開部署.md)。

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_static_release.py'
```

瀏覽器驗收可使用 `npm install`、`npx playwright install chromium`，再執行 `GAME_TEST_URL="網址" node tools/verify_public_release.cjs`。

目前公開版本的提交、實機畫面及測試範圍見 [公開上線驗收](docs/verification/公開上線驗收.md)。

## 專案內容

- `vendor/`：遊戲程式、動作資料、圖片、音效與本地字型。
- `assets/`：概念圖、來源記錄與資產清單。
- `docs/`：世界觀、操作、技能及驗收記錄；歷史文件保留各版本的實際狀態。
- `tools/`、`tests/`：本機服務、靜態建置及驗證工具。

中文與英文字標採用可重新分發的本地字型，配合厚重斜體、金屬字面與暗紅排版。字型授權位於字型目錄。遊戲程式與繼承素材的來源、作者及適用授權見 [第三方聲明](THIRD_PARTY_NOTICES.md) 與 [LICENSE](LICENSE)；各素材的原有權利保留。
