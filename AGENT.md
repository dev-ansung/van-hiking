# AGENT.md — vanhiking 維護手冊

這份文件是給接手維護這個 repo 的 Claude agent 看的。**先讀完這份文件再動手。** 有任何地方跟使用者的決定牴觸，以使用者的決定為準；不確定的事先問他，不要自己改掉。

## 專案總覽

- 網站：https://vanhiking.vercel.app（長青健行社 Evergreen Hiking Club，溫哥華華人健行社團的地圖網站）
- 數據看板：https://vanhiking.vercel.app/dashboard
- 內容：202 趟已走過的健行路線（2019 年至今，總計約 992 公里），每一趟都連結到 Facebook 專頁當天的照片／影片貼文。
- **這個 repo 只有前端。** API worker 的原始碼在 `~/workspace/vanhiking-api/`，不在這個 repo 裡。
- 維護者：An Sung。使用者（他的父母）是 Claude agent 的操作者，他們會請你繼續更新維護這個 repo。

## 後端（不在這個 repo，但前端依賴它）

- API：https://vanhiking-api.ansung.dev — Cloudflare Worker `vanhiking-api`，資料庫是共用的 D1 `SharedDB`。
- GET 是公開的，POST 要 Bearer gate password（存在 worker secret 裡，**絕對不要寫進 repo、不要寫進任何檔案、不要貼在對話裡**）。
- 主要端點：
  - `GET /hikes` — 健行路線（欄位含 `post_ids`、`meeting_point`、`geometry`、`distance_km`、`est_duration_min`）
  - `GET /posts` — Facebook 貼文
  - `GET /posts/:id` — 單則貼文（含 `post_type`，給前端標示照片／影片連結用）
  - `GET /snapshots` — 每日 insights 快照
  - `GET /audience` — 受眾資料
  - `GET /stats` — 總數統計
- 資料表：`social_accounts`、`social_daily_snapshots`、`social_posts`、`social_audience`、`social_hikes`。
- Facebook Page：長青健行社，page_id `775427925912036`，https://www.facebook.com/VancouverEvergreenHiking，1,894 位追蹤者。
- 貼文連結格式：`https://www.facebook.com/775427925912036/posts/{platform_post_id}`。

## 技術棧

- Next.js 14 App Router、React 18、Recharts、next-themes（淺色／深色切換）。
- 地圖：mapcn（MapLibre GL 封裝，CARTO 底圖；衛星圖用 Esri World Imagery，不用 key）。
- UI：ReUI Timeline、shadcn Select、shadcn Drawer（Vaul，手機底部抽屜）。
- 重要檔案：
  - `app/page.js` — 首頁地圖 + 路線詳細卡片（含 Facebook 連結）
  - `app/hike-map.jsx` — 地圖元件（pins、路線動畫、衛星切換）
  - `app/dashboard/page.js` — 數據看板（KPI、每月觸及趨勢、貼文、受眾）
  - `app/header.jsx` — 頂欄、主題切換
  - `app/globals.css` — 全域樣式（含 `.hike-pin`、`.hike-item` 選取狀態）
  - `components/` — shadcn / ReUI 元件

## 部署

- 前端部署：`python3 ~/workspace/custom-connectors/custom.legacy-vercel/bin/deploy_nextjs.py ~/workspace/vanhiking --name vanhiking`
- **永遠用 https://vanhiking.vercel.app 驗證** — 部署專屬網址會 302 到 Vercel SSO，不能用。
- 部署 body 上限 10 MB：`.records/` 裡的 backfill 紀錄 JSON（約 8 MB）不要放進部署，deploy script 會跳過 dot 目錄。
- Worker 部署：`~/workspace/vanhiking-api/deploy.py`（走 Cloudflare API multipart PUT；wrangler CLI 在這個環境無法認證，不要用）。
- 改 worker 前先看 `~/workspace/vanhiking-api/src/index.js` 現有的寫法：async handler 一定要 `return await ...`（bare `return promise` 會讓 catch 抓不到錯誤，曾經造成全站 1101）。
- Scripted 呼叫 worker 一律帶瀏覽器 User-Agent（例如 `Mozilla/5.0 ... Chrome/120.0`），否則 Cloudflare 會回 1010。

## 版本控制

- **沒有本地 git repo** — GitHub（dev-ansung/van-hiking，private）是唯一有版本紀錄的地方。
- 更新方式：`PYTHONPATH=/opt/muse/skills/custom-connector-setup/bin python3 ~/workspace/custom-connectors/custom.legacy-github/bin/commit_files.py dev-ansung/van-hiking main "<message>" <localpath:remotepath> [...]`
  （`push_repo.py` 內建的 sys.path 指向不存在的路徑，一定要用上面的 PYTHONPATH；git SSH push 在這個環境被擋，不要用。）
- **每次 push 前先 grep 檢查**：repo 裡不能有 gate password、Facebook/Graph token、API key 或任何 bearer 值。密碼和 token 只存在 Secure Vault / worker secret。
- Push 後用 GitHub API 驗證檔案真的上去了（`GET /repos/dev-ansung/van-hiking/commits`、`GET /repos/dev-ansung/van-hiking/contents/<path>`）。

## 使用者定下的設計規則（沒有他同意，不要反轉）

- **只寫 glue code**：優先用現成套件（mapcn、ReUI、shadcn），不要自己手寫複雜元件；**絕對不要改套件內部程式碼**，套件不合用就換套件。
- **Mobile-first**：使用者主要是手機。
- **簡潔專業，不要大字高對比**：他明確反對過大字／高對比的長輩版設計。
- 只參考 Facebook 的 **layout 架構**（頂欄、卡片列表），不要用 Facebook 的品牌或配色。
- **不要 collapsible sidebar**：桌面左側面板永遠固定顯示；手機用可拖曳的底部抽屜（shadcn Drawer，snap points）。
- **不要地圖 clustering**：他曾經要求做過，同一天晚上又要求拆掉。現在是每趟一個獨立圖釘；點圖釘時清單會 filter 到那趟的 ISO 週並捲動到該項目，取消選取時恢復原本的 filter。
- Muted pins（未選取的圖釘）保持淡淡的灰色 — 他拒絕過調高對比度的提議，不要再提。
- 預設只顯示**最近 3 個月**的健行；清單每次顯示 10 趟，按「載入更多」再顯示 10 趟。
- 距離和時間都是**估算**：路線用 Valhalla pedestrian 重算過（OSRM 會走車道，不能用），時間用每小時 4 公里換算，UI 上標「估算」；實際時間一律顯示「待回報」。
- 資料每頁要全數載入：`GET /hikes` 要用 limit=100 分頁抓到 `total` 為止（之前只抓 50 筆的 bug 已經修掉，不要再犯）。

## 資料規則

- **社團是 CLOSED**：只記錄已經走過的路線，**絕對不要**發布或顯示未來的行程。
- **絕對不要加使用者的個人 Instagram / Threads 帳號**：之前加過一次，他當場要求刪掉。這個網站只是長青健行社的頁面。
- Dashboard 的趨勢圖是**每月彙總**每日 snapshots（長條＝每月觸及，折線＝互動率，右軸％），並且**排除 2026-11-21 那筆 LAST_28D 彙總**（那不是每日數值）；2024-08 以前沒有每日觸及紀錄，圖上顯示空白，**絕對不要畫成零**。
- 2021 年社團完全沒有貼文（暫停活動），不是資料缺失。

## 改完要驗證

1. `npm run build` 通過。
2. 首頁和 /dashboard 在 https://vanhiking.vercel.app 都是 HTTP 200。
3. 用真實瀏覽器、hard refresh 檢查（production HTML 有 `s-maxage=31536000` 快取，不 hard refresh 會看到舊版）。
4. 檢查的項目：pin 點擊、路線動畫、年／週 filter、搜尋、清單分頁、手機底部抽屜、淺色／深色切換、Facebook 連結標示（照片／影片）。

## 已知待辦（使用者沒說要做之前，不要動手）

- 每日 07:00 自動抓取還沒排程（`~/workspace/vanhiking-api/pull-fb.py` 已寫好、smoke-tested；gate password 要從環境變數讀，不要寫進 cron）。
- Dashboard 貼文區只顯示 50 則，總數是 368 則（要不要分頁，等他決定）。
- 手機 ~390px 版面還沒用真機確認過。
- 管理員自動發文到 Facebook（純文字或含照片）和管理頁的登入方式都還沒決定。
- 五區導覽（主頁／地圖／路線／數據／管理）只是討論，沒有要做。
- 社團官網上的行程 PDF（約 60 趟、2019–2020 年的計畫表）還沒爬；注意那是「計畫」不是「已走過的紀錄」。
