// --- js/card-generator.js (v349.0: レイヤー順序変更・テキスト位置修正版) ---

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

    // 1. 背景（クリーム色）
    ctx.fillStyle = "#fffbe6"; 
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. 写真の描画 (★修正: フレームの下に敷く)
    try {
        const photoImg = await loadImage("data:image/jpeg;base64," + photoBase64);
        
        // 写真の配置ターゲット（フレームの透明窓の位置に合わせる）
        // 中心Y座標を下げて調整 (Y=300付近)
        const targetCenterX = 300;
        const targetCenterY = 300; 
        const targetSize = 340; // 円窓をカバーできる十分なサイズ

        // アスペクト比を維持して「cover」状態で描画するための計算
        const scale = Math.max(targetSize / photoImg.width, targetSize / photoImg.height);
        const w = photoImg.width * scale;
        const h = photoImg.height * scale;
        const x = targetCenterX - w / 2;
        const y = targetCenterY - h / 2;
        
        // クリッピング（切り抜き）は不要。そのまま描画。
        ctx.drawImage(photoImg, x, y, w, h);

    } catch (e) {
        console.warn("Card Photo Load Error", e);
    }

    // 3. 枠画像の描画 (★修正: 写真の上から被せる)
    try {
        const frameImg = await loadImage('assets/images/ui/card_frame.png');
        ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H);
    } catch (e) {
        console.error("枠画像の読み込み失敗", e);
        // 画像がない場合のフォールバック（円形マスクで写真を切り抜く必要があるが今回は省略）
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 20;
        ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // --- ここから文字情報の描画 (枠画像の上に描く) ---

    // 4. No. 番号 (左上)
    ctx.fillStyle = "#aaa";
    ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
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
    
    // アイテム名の位置 (写真の下、解説枠の上)
    ctx.fillText(itemData.itemName, 300, 455); 
    
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 6. ネル先生の解説テキスト
    const descX = 55;
    const descW = 490;
    // ★修正: テキスト開始位置を3行分(約80px)上げる
    // 元: 560 -> 新: 480
    const descY = 485;  
    
    ctx.fillStyle = "#5d4037"; 
    ctx.font = "17px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    
    let descText = itemData.description || "（解説なし）";
    descText = descText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");
    
    wrapText(ctx, descText, descX, descY, descW, 26);

    // 7. ほんとうのことテキスト
    const realX = 55;
    const realW = 490;
    // ★修正: テキスト開始位置を3行分(約80px)上げる
    // 元: 765 -> 新: 685
    const realY = 690;

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