// --- js/card-generator.js (v350.0: 新フレーム対応版) ---

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
    // 新フレームのサイズに合わせて調整 (例: 600x880)
    const CANVAS_W = 600;
    const CANVAS_H = 880; 
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    // 1. 背景（白または透過対策）
    ctx.fillStyle = "#ffffff"; 
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. 写真の描画（フレームの下に配置）
    try {
        const photoImg = await loadImage("data:image/jpeg;base64," + photoBase64);
        
        // 写真枠の位置（上部の角丸長方形エリア）
        // 座標は画像に合わせて微調整してください
        const photoX = 85;
        const photoY = 100;
        const photoW = 430;
        const photoH = 260;

        // アスペクト比を維持して「cover」状態で描画
        const scale = Math.max(photoW / photoImg.width, photoH / photoImg.height);
        const w = photoImg.width * scale;
        const h = photoImg.height * scale;
        const x = photoX + (photoW - w) / 2;
        const y = photoY + (photoH - h) / 2;
        
        ctx.save();
        // 角丸クリッピング
        ctx.beginPath();
        ctx.roundRect(photoX, photoY, photoW, photoH, 20); // 角丸半径20px
        ctx.clip();
        ctx.drawImage(photoImg, x, y, w, h);
        ctx.restore();

    } catch (e) {
        console.warn("Card Photo Load Error", e);
    }

    // 3. 枠画像の描画
    try {
        const frameImg = await loadImage('assets/images/ui/card_frame.png');
        ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H);
    } catch (e) {
        console.error("枠画像の読み込み失敗", e);
        // フォールバック描画
        ctx.strokeStyle = "gold";
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // --- テキスト描画設定 ---

    // 4. 登録No. (左上)
    // 実際はDBのIDなどを使うが、ここでは仮置き
    const regNo = "No.000"; 
    ctx.fillStyle = "#555"; 
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(regNo, 70, 50); // 左上の枠内

    // 5. 物体名 (上部中央)
    ctx.fillStyle = "#d32f2f"; // 赤
    ctx.font = "bold 32px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "center";
    // 長い名前はフォントサイズ縮小
    let nameFontSize = 32;
    while (ctx.measureText(itemData.itemName).width > 350 && nameFontSize > 20) {
        nameFontSize -= 2;
        ctx.font = `bold ${nameFontSize}px 'M PLUS Rounded 1c', sans-serif`;
    }
    ctx.fillText(itemData.itemName, 300, 60);

    // 6. レアリティ (左下)
    // 「レアリティ」の文字の右横に肉球マークを表示
    const rarity = itemData.rarity || 1;
    const pawX = 220; // 開始位置
    const pawY = 848;
    const pawSize = 30; // 肉球画像のサイズ
    
    // 肉球画像を読み込んで描画する関数 (簡易実装: 文字で代用も可だが画像推奨)
    // ここでは絵文字で代用しますが、画像がある場合はdrawImageを使用してください
    ctx.font = "24px sans-serif";
    ctx.textAlign = "left";
    let paws = "";
    for(let i=0; i<rarity; i++) paws += "🐾";
    ctx.fillStyle = "#ff8a80"; // ピンク色
    ctx.fillText(paws, pawX, pawY);

    // 7. 発見日 (右下)
    const today = new Date();
    const dateStr = `発見日: ${today.getFullYear()}/${today.getMonth()+1}/${today.getDate()}`;
    ctx.fillStyle = "#333";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(dateStr, 540, 848);

    // 8. ネル先生の解説 (中央枠)
    const descX = 60;
    const descY = 460;
    const descW = 480;
    
    ctx.fillStyle = "#5d4037"; // 茶色
    ctx.font = "18px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    
    let descText = itemData.description || "";
    descText = descText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, ""); // 読み仮名削除
    wrapText(ctx, descText, descX, descY, descW, 28);

    // 9. ほんとうのこと (下部枠)
    const realX = 60;
    const realY = 690;
    
    ctx.fillStyle = "#ffffff"; // 白文字 (青背景の場合) または濃い青
    // 背景が薄い青なら濃い文字にする
    ctx.fillStyle = "#0d47a1"; 
    ctx.font = "16px 'Sawarabi Gothic', sans-serif";
    
    let realText = itemData.realDescription || "";
    realText = realText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");
    wrapText(ctx, realText, realX, realY, descW, 26);

    // 画像エクスポート
    return canvas.toDataURL("image/jpeg", 0.9);
};