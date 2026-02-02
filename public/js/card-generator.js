// --- js/card-generator.js (v348.1: 座標・サイズ微調整版) ---

window.CardGenerator = {};

// 画像読み込みヘルパー
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = src;
    });
}

// テキストの自動改行処理
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split('');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n];
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n];
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
}

// ★カード生成メイン関数
window.generateTradingCard = async function(photoBase64, itemData, userData) {
    const CANVAS_W = 600;
    const CANVAS_H = 880; 
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    // 1. 背景
    ctx.fillStyle = "#fffbe6"; 
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. 枠画像の読み込み
    try {
        const frameImg = await loadImage('assets/images/ui/card_frame.png');
        ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H);
    } catch (e) {
        console.error("枠画像の読み込み失敗", e);
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 3. 写真の描画（位置とサイズを微調整）
    try {
        const photoImg = await loadImage("data:image/jpeg;base64," + photoBase64);
        
        // ★調整: 写真を枠の円の中に収める
        const photoCenterX = 300; 
        const photoCenterY = 230; // 少し下げて円の中心に合わせる
        const photoRadius = 135;  // 半径を小さくして枠内に収める

        ctx.save();
        ctx.beginPath();
        ctx.arc(photoCenterX, photoCenterY, photoRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip(); 

        const scale = Math.max((photoRadius * 2) / photoImg.width, (photoRadius * 2) / photoImg.height);
        const w = photoImg.width * scale;
        const h = photoImg.height * scale;
        const x = photoCenterX - w / 2;
        const y = photoCenterY - h / 2;
        
        ctx.drawImage(photoImg, x, y, w, h);
        ctx.restore();

    } catch (e) {
        console.warn("Card Photo Load Error", e);
    }

    // 4. No. 番号 (左上)
    ctx.fillStyle = "#aaa";
    ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    // 枠画像に番号欄がある場合は位置を合わせる（必要なければコメントアウト）
    // ctx.fillText("No.???", 60, 65); 

    // 5. アイテム名
    ctx.fillStyle = "#d84315"; 
    ctx.font = "900 40px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "white";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // フォントサイズ自動調整
    let nameFontSize = 40;
    ctx.font = `900 ${nameFontSize}px 'M PLUS Rounded 1c', sans-serif`;
    while (ctx.measureText(itemData.itemName).width > 520 && nameFontSize > 20) {
        nameFontSize -= 2;
        ctx.font = `900 ${nameFontSize}px 'M PLUS Rounded 1c', sans-serif`;
    }
    
    // ★調整: 解説枠に被らないよう、Y座標を上に上げる
    ctx.fillText(itemData.itemName, 300, 420); 
    
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 6. ネル先生の解説テキスト
    // ★調整: 見出し帯（オレンジ）を避けて、本文エリアから書き始める
    const descX = 55;   // 左端（アイコンを避けるため少し右へ）
    const descY = 560;  // 開始Y座標（帯の下へ移動）
    const descW = 490;  // 幅調整
    
    ctx.fillStyle = "#5d4037"; 
    ctx.font = "17px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    
    let descText = itemData.description || "（解説なし）";
    descText = descText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");
    
    wrapText(ctx, descText, descX, descY, descW, 26);

    // 7. ほんとうのことテキスト
    // ★調整: 見出し帯（青）を避けて、本文エリアから書き始める
    const realX = 55;
    const realY = 765; // 開始Y座標（帯の下へ移動）
    const realW = 490;

    ctx.fillStyle = "#01579b";
    ctx.font = "16px 'Sawarabi Gothic', sans-serif";
    
    let realText = itemData.realDescription || "（情報なし）";
    realText = realText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");

    wrapText(ctx, realText, realX, realY, realW, 24);

    // 8. フッター
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${today.getMonth()+1}/${today.getDate()}`;
    
    ctx.fillStyle = "#888";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    const footerText = `発見日: ${dateStr} | 発見者: ${userData ? userData.name : 'ゲスト'}`;
    ctx.fillText(footerText, CANVAS_W - 30, CANVAS_H - 12);

    return canvas.toDataURL("image/jpeg", 0.85);
};