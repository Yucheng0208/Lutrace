/* 依照片風格產生小語錄：分析色調（亮度、飽和度、主色相）＋天氣＋時間，挑出情境，再從語錄庫抽一句
 * 全部在瀏覽器裡完成，不需要網路或 API 金鑰。
 */
(function () {
  'use strict';

  const BANK = {
    'zh-Hant': {
      night: ['城市睡了，我還醒著。', '今晚的星星有點吵。', '把晚風存檔，明天再播放。', '夜色剛好，心事剛好。', '熬夜不是壞習慣，是在等月亮。', '路燈是夜晚的字幕。', '關掉手機，打開宇宙。', '晚安這兩個字，今天先不說。'],
      rain: ['下雨天，適合想念。', '雨聲是免費的 lo-fi。', '傘下的世界剛好兩個人。', '讓雨替我把煩惱沖掉。', '天氣陰陰的，心情要晴晴的。', '窗上的雨滴在排隊下班。', '沒帶傘，就當作淋一場青春。', '雨停之前，先別說再見。'],
      snow: ['世界按下了靜音鍵。', '雪是冬天寄來的明信片。', '冷是冷，但心是熱的。', '把今天裹成一顆雪球。', '白色的日子，留給溫柔的人。', '呼出的白霧，都是想說的話。'],
      mono: ['褪去顏色，留下故事。', '黑白，是最誠實的濾鏡。', '有些日子不需要顏色。', '安靜的畫面，最吵的心情。', '灰色也是一種溫柔。', '把時間調成黑白模式。'],
      sunset: ['今天的晚霞，值得一個暫停。', '太陽下班了，換我們發光。', '橘子汽水色的傍晚。', '把夕陽收進口袋，回家慢慢看。', '黃昏是一天最溫柔的時候。', '天空在偷偷調色。', '餘暉剛好，晚風剛好，你也剛好。', '一起把今天看完再走。'],
      blue: ['藍得像沒寫完的夏天。', '把煩惱丟進海裡，換一片天空。', '今天的天空，是限定款。', '心情 #87CEEB。', '海風說：慢慢來。', '抬頭就有答案。', '藍色是自由的顏色。', '去有風的地方。'],
      green: ['深呼吸，世界正在長大。', '綠色是充電中的顏色。', '做一棵不慌不忙的樹。', '讓葉子替我曬太陽。', '森林模式已開啟。', '慢慢生長也是一種勇敢。', '把喧囂留給城市。'],
      dreamy: ['像夢一樣，但是真的。', '粉紅色的泡泡，裝滿今天。', '生活偶爾需要一點濾鏡。', '浪漫是一種日常練習。', '今天也是被宇宙寵愛的一天。', '在糖果色的世界裡迷路。', '心動不需要理由。'],
      soft: ['日子平平淡淡，也閃閃發光。', '溫柔的光，溫柔的我。', '今天沒什麼特別，所以特別。', '把簡單過成喜歡的樣子。', '光線剛好，心情也剛好。', '留白，是給快樂的位置。'],
      vivid: ['青春就是要大聲一點。', '今天的我，飽和度拉滿。', '不想被定義，只想被記住。', '這一秒，值得被放大。', '熱烈地活著，就是最好的濾鏡。', '別人看風景，我們是風景。', 'Vibe 對了，一切都對了。'],
      daily: ['平凡的一天，也值得被收藏。', '記錄一下，此刻的我們。', '生活是一首隨機播放的歌。', '不急，慢慢走，好好看。', '今天的快樂，存檔完成。', '有些瞬間，只想按下暫停。', '這是我們的日常 BGM。', '把今天，做成一張封面。'],
    },
    en: {
      night: ['The city sleeps, I don’t.', 'Saving the night breeze for later.', 'Streetlights are the night’s subtitles.', 'Phone off, universe on.', 'Midnight thoughts, on repeat.', 'Waiting up for the moon.'],
      rain: ['Rain is free lo-fi.', 'A good day to miss someone.', 'Puddles full of sky.', 'Let the rain wash it out.', 'Grey skies, bright mood.', 'No umbrella, no regrets.'],
      snow: ['The world hit mute.', 'Cold hands, warm heart.', 'Winter sent a postcard.', 'Every breath is a little cloud.', 'Soft days for soft people.'],
      mono: ['Colors faded, stories stayed.', 'Black & white never lies.', 'Some days don’t need color.', 'Quiet frame, loud heart.', 'Grey is a kind of gentle.'],
      sunset: ['The sky is editing itself.', 'Sun clocked out, we glow now.', 'Orange soda evenings.', 'Pocketed the sunset.', 'Golden hour, golden us.', 'Staying till the last light.'],
      blue: ['Blue like an unfinished summer.', 'Today’s sky is a limited edition.', 'Mood: #87CEEB.', 'The sea says: slow down.', 'Look up, there’s your answer.', 'Go where the wind is.'],
      green: ['Breathe in, the world is growing.', 'Green means recharging.', 'Be a tree in no hurry.', 'Forest mode: on.', 'Growing slowly is still growing.'],
      dreamy: ['Like a dream, but real.', 'Bubblegum skies, cotton candy thoughts.', 'Romance is a daily practice.', 'Lost in a candy-colored world.', 'Butterflies need no reason.'],
      soft: ['Simple days, still glowing.', 'Soft light, soft me.', 'Nothing special, that’s why it’s special.', 'Leaving room for joy.', 'Light just right, mood just right.'],
      vivid: ['Youth should be loud.', 'Saturation: maxed out.', 'Not defined, just remembered.', 'This second deserves a zoom-in.', 'We are the view.', 'Right vibe, right time.'],
      daily: ['An ordinary day, worth keeping.', 'Life on shuffle.', 'No rush, just look.', 'Today’s joy: saved.', 'Pause this moment, please.', 'Our everyday soundtrack.', 'Making today a cover.'],
    },
  };

  // 日文語錄
  BANK.ja = {
    night: ['街が眠っても、私はまだ起きてる。', '夜風を保存して、明日また再生しよう。', '街灯は夜の字幕。', 'スマホを閉じて、宇宙を開く。', '今日はまだ「おやすみ」を言わない。'],
    rain: ['雨の日は、誰かを想うのにちょうどいい。', '雨音は無料の lo-fi。', '傘の下はふたりだけの世界。', '雨が悩みを流してくれる。', '曇り空でも、心は晴れ。'],
    snow: ['世界がミュートになった。', '雪は冬からの絵はがき。', '寒いけど、心はあたたかい。', '白い息は、言えなかった言葉。'],
    mono: ['色は消えても、物語は残る。', 'モノクロは一番正直なフィルター。', '色のいらない日もある。', '静かな写真、にぎやかな心。'],
    sunset: ['今日の夕焼けは、ひと休みの価値あり。', '太陽が帰ったら、私たちが光る番。', 'オレンジソーダ色の夕方。', '夕日をポケットにしまって帰ろう。', '空がこっそり色を変えてる。'],
    blue: ['終わらない夏みたいな青。', '今日の空は限定品。', '気分は #87CEEB。', '海風が「ゆっくりでいいよ」って。', '見上げれば答えがある。'],
    green: ['深呼吸、世界が育ってる。', '緑は充電中の色。', '急がない木になりたい。', 'フォレストモード、オン。'],
    dreamy: ['夢みたい、でも本当。', 'ピンクの泡で今日をいっぱいに。', 'ロマンチックは毎日の練習。', 'キャンディ色の世界で迷子。'],
    soft: ['平凡な毎日も、きらきらしてる。', 'やさしい光、やさしい私。', '特別じゃない、だから特別。', '光もちょうどいい、気分もちょうどいい。'],
    vivid: ['青春はちょっと大きな声で。', '今日の私、彩度マックス。', '定義されたくない、覚えていてほしい。', '私たちが景色になる。'],
    daily: ['ふつうの一日も、保存する価値がある。', '人生はシャッフル再生。', '急がず、ゆっくり、ちゃんと見る。', '今日の幸せ、保存完了。', '今日を、一枚のジャケットに。'],
  };

  // 歌詞風（自作の歌詞調短句；不使用任何真實歌曲的歌詞）
  const LYRICS = {
    'zh-Hant': {
      night: ['路燈一盞一盞亮起　替我數著想你的次數', '整座城市都睡了　只剩我和月亮在對望', '把今晚調成單曲循環　不想讓它結束', '星星太吵　我假裝聽不見心跳'],
      rain: ['雨落在窗台　像你沒說完的那句話', '傘下的距離　剛好是一首歌的長度', '讓雨聲當伴奏　我來唱想你的部分', '濕掉的街道　倒映著我們的影子'],
      snow: ['雪慢慢落下　把世界寫成白色的信', '呼出的白霧裡　藏著不敢說的喜歡', '冬天很冷　但你的手剛好溫暖'],
      mono: ['褪色的畫面裡　你的笑還是那麼亮', '黑白電影的結局　我想重新剪一次', '沒有顏色也沒關係　回憶自己會發光'],
      sunset: ['夕陽把天空寫成情書　每一句都是橘色', '餘暉落在你肩上　我捨不得按下暫停', '風吹過海邊　帶走今天也帶來明天', '我們追著落日跑　好像能把時間留住'],
      blue: ['把心事丟進海裡　換一整片藍色天空', '風在耳邊唱著歌　夏天還沒寫完', '抬頭看見的藍　是我最喜歡的副歌', '陪你去有風的地方　把煩惱都吹散'],
      green: ['樹影在地上跳舞　陽光在葉子間唱歌', '深呼吸　把整座森林都裝進心裡', '慢慢長大也沒關係　我們有的是時間'],
      dreamy: ['粉紅色的泡泡　一顆一顆飄向你', '像在夢裡散步　每一步都踩著糖果', '心動是一首歌　前奏就讓人臉紅'],
      soft: ['平凡的日子裡　你是最溫柔的旋律', '光灑在桌上　時間走得好慢好慢', '沒什麼特別的今天　因為有你而特別'],
      vivid: ['把音量開到最大　讓整個夏天都聽見', '青春就是要大聲唱　唱到喉嚨都沙啞', '我們是彼此的主打歌　永遠不會下架'],
      daily: ['生活是首隨機播放的歌　每天都有新的副歌', '把今天收進歌單裡　想你的時候就播放', '走在熟悉的街上　耳機裡都是你', '這一秒很普通　卻是我想重播的片段'],
    },
    en: {
      night: ['Streetlights counting every time I think of you', 'The whole town is sleeping, just me and the moon', 'Put tonight on repeat, I don’t want it to end'],
      rain: ['Rain on the window like words you never said', 'Under one umbrella, the length of a song', 'Let the rain play the beat, I’ll sing the rest'],
      snow: ['Snow writing the world a letter in white', 'Every breath a cloud of words I can’t say'],
      mono: ['In a faded frame your smile still shines', 'No color needed, memories glow on their own'],
      sunset: ['The sky writes love letters, every line in orange', 'Golden light on your shoulder, don’t press pause', 'Chasing the sunset like we could keep the time'],
      blue: ['Throw your worries in the sea, take the whole blue sky', 'The wind is singing, summer isn’t over yet'],
      green: ['Shadows dancing, sunlight singing in the leaves', 'Breathe in deep, keep the whole forest in your heart'],
      dreamy: ['Pink bubbles floating one by one to you', 'Walking in a dream on candy-colored streets'],
      soft: ['On ordinary days you’re the softest melody', 'Light on the table, time moving slow'],
      vivid: ['Turn it all the way up, let the summer hear', 'We’re each other’s hit song, never out of print'],
      daily: ['Life’s a song on shuffle, a new chorus every day', 'Saving today to the playlist, play it when I miss you'],
    },
    ja: {
      night: ['街灯がひとつずつ灯る　君を想った数だけ', '街が眠っても　月と僕だけが起きてる', '今夜をリピートにして　終わらせたくない'],
      rain: ['窓に落ちる雨は　君が言いかけた言葉', '傘の下の距離は　ちょうど一曲ぶん'],
      snow: ['雪がゆっくり降って　世界を白い手紙にする', '白い息の中に　言えない好きを隠した'],
      mono: ['色あせた写真でも　君の笑顔はまぶしい', '色がなくても大丈夫　思い出が光るから'],
      sunset: ['夕焼けが空にラブレターを書く　全部オレンジ色', '君の肩に落ちる光　一時停止はしたくない'],
      blue: ['悩みは海に投げて　青い空をまるごともらう', '風が歌ってる　夏はまだ終わらない'],
      green: ['木漏れ日が踊って　葉っぱの間で歌ってる', '深呼吸して　森ごと心にしまう'],
      dreamy: ['ピンクの泡がひとつずつ　君のほうへ', '夢の中を歩くみたい　キャンディの道'],
      soft: ['ふつうの日々の中で　君はいちばんやさしいメロディ', '机に光がこぼれて　時間がゆっくり流れる'],
      vivid: ['ボリュームを最大にして　夏じゅうに聞かせよう', '僕らはお互いのヒット曲　ずっと廃盤にならない'],
      daily: ['人生はシャッフル再生　毎日新しいサビ', '今日をプレイリストに保存　会いたいときに再生'],
    },
  };

  const LABELS = {
    'zh-Hant': { night: '🌙 夜色', rain: '🌧 雨天', snow: '❄️ 雪白', mono: '🖤 黑白低調', sunset: '🌇 暖色夕陽', blue: '🌊 藍色天空海', green: '🌿 綠意自然', dreamy: '🫧 粉紫夢幻', soft: '☁️ 明亮柔和', vivid: '🔥 高飽和', daily: '📷 日常' },
    ja: { night: '🌙 夜', rain: '🌧 雨', snow: '❄️ 雪', mono: '🖤 モノクロ', sunset: '🌇 夕焼け', blue: '🌊 青い空と海', green: '🌿 緑', dreamy: '🫧 パステル', soft: '☁️ 明るくやわらか', vivid: '🔥 ビビッド', daily: '📷 日常' },
    en: { night: '🌙 Night', rain: '🌧 Rainy', snow: '❄️ Snowy', mono: '🖤 Monochrome', sunset: '🌇 Warm sunset', blue: '🌊 Blue sky & sea', green: '🌿 Green & natural', dreamy: '🫧 Pastel dream', soft: '☁️ Bright & soft', vivid: '🔥 Vivid', daily: '📷 Everyday' },
  };

  function toHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }

  /**
   * 分析照片色調
   * @param src 圖片或畫布
   * @returns { lum, sat, hue, dominant, accent, topLum, hues: {warm, blue, green, pink} }
   */
  function analyze(src) {
    const N = 48;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, N, N);
    let data;
    try { data = ctx.getImageData(0, 0, N, N).data; } catch (e) { return null; }
    let L = 0, S = 0, topL = 0, topN = 0;
    const bins = new Array(12).fill(0);
    const binRgb = Array.from({ length: 12 }, () => [0, 0, 0, 0]);
    const hues = { warm: 0, blue: 0, green: 0, pink: 0 };
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      L += l; S += s; n++;
      if (i / 4 < N * N * 0.25) { topL += l; topN++; }
      const w = s * (1 - Math.abs(l - 0.5) * 1.6);
      if (w <= 0.05) continue;
      const bi = Math.floor(h / 30) % 12;
      bins[bi] += w;
      const br = binRgb[bi]; br[0] += r * w; br[1] += g * w; br[2] += b * w; br[3] += w;
      if (h < 50 || h >= 340) hues.warm += w;
      else if (h >= 175 && h < 255) hues.blue += w;
      else if (h >= 70 && h < 170) hues.green += w;
      else if (h >= 255 && h < 340) hues.pink += w;
    }
    const total = bins.reduce((a, b) => a + b, 0) || 1;
    Object.keys(hues).forEach((k) => { hues[k] /= total; });
    const top = bins.indexOf(Math.max(...bins));
    const br = binRgb[top];
    let accent = br[3] ? toHex(br[0] / br[3], br[1] / br[3], br[2] / br[3]) : '#ff5c8a';
    // 主色太灰或太暗時，給一個活潑的預設色
    const [ah, as, al] = rgbToHsl(...[1, 3, 5].map((o) => parseInt(accent.substr(o, 2), 16)));
    if (as < 0.18 || total / n < 0.04) accent = '#ff5c8a';
    else accent = hslHex(ah, Math.max(as, 0.55), Math.min(Math.max(al, 0.45), 0.6));
    return { lum: L / n, sat: S / n, hue: top * 30 + 15, accent, topLum: topN ? topL / topN : L / n, hues, colorful: total / n };
  }

  function hslHex(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }

  /** 判斷情境 */
  function moodOf(a, { weatherKey, hour } = {}) {
    if (weatherKey === 'rain' || weatherKey === 'drizzle' || weatherKey === 'thunder') return 'rain';
    if (weatherKey === 'snow') return 'snow';
    if (!a) return 'daily';
    const night = hour != null && (hour >= 19 || hour < 5);
    if (a.lum < 0.2 || (night && a.lum < 0.36)) return 'night';
    if (a.sat < 0.09 || a.colorful < 0.02) return 'mono';
    const { warm, blue, green, pink } = a.hues;
    const evening = hour != null && hour >= 16 && hour < 20;
    if (warm > 0.45 && (evening || a.sat > 0.35)) return 'sunset';
    if (blue > 0.4) return 'blue';
    if (green > 0.4) return 'green';
    if (pink > 0.3) return 'dreamy';
    if (a.lum > 0.66 && a.sat < 0.35) return 'soft';
    if (a.sat > 0.45) return 'vivid';
    return 'daily';
  }

  function bankFor(lang, style) {
    const src = style === 'lyric' ? LYRICS : BANK;
    return src[lang] || src['zh-Hant'];
  }

  /** 抽一句（避開目前這句）；style：quote 語錄、lyric 歌詞風 */
  function pick(mood, lang, current, style) {
    const list = bankFor(lang, style)[mood] || bankFor(lang, style).daily;
    const pool = list.filter((q) => q !== current);
    return pool[Math.floor(Math.random() * pool.length)] || list[0];
  }

  function label(mood, lang) { return (LABELS[lang] || LABELS['zh-Hant'])[mood] || ''; }

  window.Quotes = { analyze, moodOf, pick, label };
})();
