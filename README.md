# 光痕 Lutrace

**網站：https://lutrace.yucheng208.net**

把生活氛圍，變成屬於你的個性邊框：MP3 播放器、黑膠、卡帶、拍立得、CCD、Y2K、雜誌、票根、鎖定畫面…共 30 種，每種 10 款配色。
全部在瀏覽器中處理，檔案不會上傳；不使用任何 AI 服務或付費 API。介面支援繁體中文、English、日本語。

## 功能

- **30 種模板 × 10 款配色**：音樂封面 9 種（MP3、播放中、黑膠、CD、照片＋播放列、卡帶、歌單、歌詞卡、音樂小工具）、底片相機 8 種、趣味 13 種；配色有月光白、午夜黑、雲母銀、櫻花霧、遠峰藍、鼠尾草、燕麥奶、薰衣草、深海藍、隨光色。
- **從音樂帶入**：貼上 Spotify／Apple Music／YouTube／KKBOX 等連結，或直接搜尋歌名，自動帶入封面、歌名、歌手與專輯（Apple Music 公開搜尋與各平台公開資訊，不下載音源）。輸出 MP4 時可加入自己的背景音樂。
- **會動的播放器**：音樂模板的秒數、進度條、黑膠與卡帶捲軸會動；照片可輸出 GIF 或 MP4，影片會逐格合成並保留聲音。
- **小語錄**：依照片色調、天氣與拍攝時間判斷氣氛（夕陽、藍天、夜色、雨天…），從內建句庫挑一句；「歌詞風」是原創的歌詞調句子，音樂模板自動使用。純本機計算，不呼叫 AI。
- **鎖定畫面／天氣卡**：時間字型、粗細、顏色，以及液態玻璃、毛玻璃、霧化、漸層、實色面板。
- **資訊**：日期、時間、天氣、溫度、地點、相機參數，可個別開關或手動修改。
- **格式**：JPG、PNG、WebP、SVG、HEIC、RAW、GIF、MP4、MOV、MKV、AVI、WMV、WebM。

## 本機開發

不需要安裝套件，直接用 Node.js 18 以上執行（靜態檔案＋`/api/*` 都會運作）：

```bash
npm start
```

開啟 http://localhost:8787 。也可以用 `npx wrangler dev` 在 Cloudflare 的執行環境中測試。

## 部署到 Cloudflare

```bash
npx wrangler login
npm run deploy
```

Worker 綁定在自訂網域 `lutrace.yucheng208.net`（設定在 `wrangler.jsonc` 的 `routes`）。

## 結構

```
public/
  index.html
  assets/
    app.js             主程式
    templates.js       模板引擎與第 1–12 款模板
    templates-more.js  第 13–30 款模板
    quotes.js          照片風格分析與語錄／歌詞風句庫
    i18n.js            繁中／英文／日文
    exif.js decode.js media.js geo.js crop.js   來自 Lumark
  vendor/              ffmpeg.wasm、heic-to、libraw-wasm
src/worker.js          /api/fetch（網址匯入）、/api/music（音樂連結）、/api/search（搜尋歌曲）
scripts/dev-server.mjs 本機預覽伺服器
```

## 授權

程式碼以 MIT 授權釋出（見 `LICENSE`）。部分模組（格式解碼、地點天氣、影片處理）來自同作者的 [Lumark](https://github.com/Yucheng0208/Lumark)。字型來自 Google Fonts。各平台名稱與封面圖片的權利屬於原權利人。
