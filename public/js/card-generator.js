// --- js/card-generator.js (v347.0: 枠画像活用・位置調整版) ---

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

// テキストの自動改行処理 (行間調整機能付き)
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
    // 画像サイズ（枠画像の比率に合わせる: 600x880想定）
    const CANVAS_W = 600;
    const CANVAS_H = 880; 
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    // 1. 背景（クリーム色） - 透過PNG対策
    ctx.fillStyle = "#fffbe6"; 
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. 枠画像の読み込み
    // ※ index.htmlと同じ階層の assets/images/ui/card_frame.png を読み込みます
    try {
        const frameImg = await loadImage('assets/images/ui/card_frame.png');
        ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H);
    } catch (e) {
        console.error("枠画像の読み込みに失敗しました。パスを確認してください。", e);
        // 画像がない場合の緊急用枠線（デバッグ用）
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 10;
        ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 3. 写真の描画（上部の円に合わせて切り抜き）
    try {
        const photoImg = await loadImage("data:image/jpeg;base64," + photoBase64);
        
        // ★調整: 画像の黒丸エリアに合わせる座標
        // 枠画像のデザインに合わせて数値を微調整してください
        const photoCenterX = 300; 
        const photoCenterY = 225; // 円の中心Y座標
        const photoRadius = 145;  // 円の半径

        ctx.save();
        ctx.beginPath();
        ctx.arc(photoCenterX, photoCenterY, photoRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip(); // ここで円形にマスク

        // 写真をアスペクト比維持で中心に描画
        const scale = Math.max((photoRadius * 2) / photoImg.width, (photoRadius * 2) / photoImg.height);
        const w = photoImg.width * scale;
        const h = photoImg.height * scale;
        const x = photoCenterX - w / 2;
        const y = photoCenterY - h / 2;
        
        ctx.drawImage(photoImg, x, y, w, h);
        ctx.restore(); // マスク解除

    } catch (e) {
        console.warn("Card Photo Load Error", e);
    }

    // 4. No. 番号 (左上)
    ctx.fillStyle = "#aaa";
    ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    // 枠画像の「No.044」等の位置に重ねるか、システムで管理する場合は描画
    // 今回は枠画像に文字が入っていない前提で描画します
    // ctx.fillText("No.???", 60, 65); 

    // 5. アイテム名 (写真の下、中央)
    ctx.fillStyle = "#d84315"; // 濃いオレンジ
    ctx.font = "900 40px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "center";
    // 影をつけて視認性を上げる
    ctx.shadowColor = "white";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // 名前が長すぎる場合はフォントを小さくする自動調整
    let nameFontSize = 40;
    ctx.font = `900 ${nameFontSize}px 'M PLUS Rounded 1c', sans-serif`;
    while (ctx.measureText(itemData.itemName).width > 500 && nameFontSize > 20) {
        nameFontSize -= 2;
        ctx.font = `900 ${nameFontSize}px 'M PLUS Rounded 1c', sans-serif`;
    }
    // ★調整: 名前のY座標
    ctx.fillText(itemData.itemName, 300, 450);
    
    // 影リセット
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 6. ネル先生の解説テキスト
    // ★枠線の描画は削除し、文字だけを配置します
    const descX = 50;   // 左端
    const descY = 530;  // 開始Y座標
    const descW = 500;  // 折り返し幅
    
    ctx.fillStyle = "#5d4037"; // こげ茶色
    ctx.font = "17px 'M PLUS Rounded 1c', sans-serif"; // 少し丸文字で見やすく
    ctx.textAlign = "left";
    
    let descText = itemData.description || "（解説なし）";
    // 読み仮名の削除（スッキリさせるため）
    descText = descText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");
    
    wrapText(ctx, descText, descX, descY, descW, 26); // 行間26px

    // 7. ほんとうのことテキスト
    const realX = 50;
    const realY = 745; // 青い枠の開始位置に合わせて調整
    const realW = 500;

    ctx.fillStyle = "#01579b"; // 濃い青
    ctx.font = "16px 'Sawarabi Gothic', sans-serif"; // 少し真面目なフォント
    
    let realText = itemData.realDescription || "（情報なし）";
    realText = realText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");

    wrapText(ctx, realText, realX, realY, realW, 24); // 行間24px

    // 8. フッター (日付・名前)
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${today.getMonth()+1}/${today.getDate()}`;
    
    ctx.fillStyle = "#888";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "right";
    const footerText = `発見日: ${dateStr} | 発見者: ${userData ? userData.name : 'ゲスト'}`;
    // 右下に配置
    ctx.fillText(footerText, CANVAS_W - 30, CANVAS_H - 15);

    // 9. JPEG画像としてエクスポート (画質0.85)
    return canvas.toDataURL("image/jpeg", 0.85);
};