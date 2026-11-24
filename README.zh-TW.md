# van-hiking — 長青健行社健行地圖與數據看板

[English](./README.md)

溫哥華**長青健行社（Evergreen Hiking Club）**的全端健行路線地圖、社群數據看板與 Cloudflare Worker API，收錄 2019 年以來所有已走過的社團健行紀錄、路線軌跡、集合地點、估算距離與時間，以及當天 Facebook 專頁的照片與影片連結。

- **健行地圖**：https://vanhiking.vercel.app
- **數據看板**：https://vanhiking.vercel.app/dashboard
- **API 文件（Swagger UI）**：https://vanhiking-api.ansung.dev/docs

---

## 主要功能

- **互動式路線地圖**：每趟健行以集合地點標記於地圖上；點擊圖釘即可繪製該趟健行路線，並自動捲動至對應的紀錄卡片。
- **地圖／衛星圖切換**：採用 MapLibre GL（`mapcn`），支援 CARTO 地圖（跟隨淺色／深色主題）與 Esri World Imagery 衛星圖切換。
- **搜尋與篩選**：支援依年份、ISO 週數與地名關鍵字搜尋；預設顯示最近 3 個月紀錄，每次載入 10 筆。
- **Facebook 貼文連動**：透過 `GET /posts/:id` 取得貼文類型，自動將連結標示為「照片」或「影片」，直接開啟當天專頁貼文。
- **行動裝置優先設計**：桌面版固定顯示左側清單；手機版使用可拖曳的底部抽屜（Drawer）。
- **社群數據看板（`/dashboard`）**：提供月度觸及人數與互動率趨勢圖（Recharts）、貼文表現與受眾分析。
- **後端 Worker API（`api/`）**：基於 Cloudflare Worker 與 D1（`SharedDB`），支援自動產生 OpenAPI 3 文件（`/docs`）。

---

## 本地開發

```bash
git clone https://github.com/dev-ansung/van-hiking.git
cd van-hiking
npm install
npm test
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 即可預覽。建置正式版本請執行：

```bash
npm run build
npm run start
```

後端 Worker 部署與說明請見 [`api/README.md`](./api/README.md)。

---

## 資料與設計說明

- **距離與時間為估算值**：路線依據步道軌跡重建，時間以每小時 4 公里估算；實際健行時間顯示為「待回報」。
- **僅收錄歷史紀錄**：本社團已停止對外活動，網站僅記錄已完成的健行，不公布任何未來行程。
- **開發與維護規範**：修改程式碼前，請先閱讀 [`AGENTS.md`](./AGENTS.md)。
