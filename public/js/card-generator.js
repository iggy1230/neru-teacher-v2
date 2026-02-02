// --- js/card-generator.js (v346.0: トレーディングカード生成機能) ---

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
    const CANVAS_H = 900;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    // 1. 背景（クリーム色）
    ctx.fillStyle = "#fffbe6"; 
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. 枠画像の読み込み（もしあれば使用、なければ描画）
    try {
        // ※実際のファイルパスに合わせてください。ない場合はcatchに落ちて手動描画します。
        const frameImg = await loadImage('assets/images/ui/card_frame.png');
        ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H);
    } catch (e) {
        // 枠画像がない場合のフォールバック描画
        ctx.strokeStyle = "#e6c15c";
        ctx.lineWidth = 15;
        ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
        
        // 内側の白枠
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(20, 20, CANVAS_W - 40, CANVAS_H - 40);
        
        // 上部円形エリア（写真用背景）
        ctx.beginPath();
        ctx.arc(300, 240, 170, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe082";
        ctx.fill();
        ctx.strokeStyle = "#ffca28";
        ctx.lineWidth = 8;
        ctx.stroke();
    }

    // 3. 写真の描画（円形切り抜き）
    try {
        const photoImg = await loadImage("data:image/jpeg;base64," + photoBase64);
        
        // 写真の位置とサイズ
        const photoX = 300;
        const photoY = 240;
        const photoR = 160;

        ctx.save();
        ctx.beginPath();
        ctx.arc(photoX, photoY, photoR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // 画像のアスペクト比を維持して中央に配置
        const scale = Math.max((photoR * 2) / photoImg.width, (photoR * 2) / photoImg.height);
        const w = photoImg.width * scale;
        const h = photoImg.height * scale;
        const x = photoX - w / 2;
        const y = photoY - h / 2;
        
        ctx.drawImage(photoImg, x, y, w, h);
        ctx.restore();
        
        // 写真の縁取り
        ctx.beginPath();
        ctx.arc(photoX, photoY, photoR, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffd54f"; // ゴールドっぽい色
        ctx.lineWidth = 10;
        ctx.stroke();

    } catch (e) {
        console.warn("Card Photo Load Error", e);
    }

    // 4. 通し番号 (左上)
    ctx.fillStyle = "#aaa";
    ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    // 暫定的な番号（本来はDBから取得した番号を使いたいが、新規登録時は不明なので日付等で代用か、AIのレスポンスには含まれないため空欄または仮）
    // ここでは日付を表示
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${today.getMonth()+1}/${today.getDate()}`;
    // ctx.fillText("No.???", 40, 60); 

    // 5. レアリティ (肉球マーク)
    const rarity = itemData.rarity || 1;
    ctx.font = "30px sans-serif";
    ctx.textAlign = "center";
    let paws = "";
    for(let i=0; i<rarity; i++) paws += "🐾";
    
    // 写真の下、名前の上
    ctx.fillStyle = "#8d6e63";
    ctx.fillText(paws, 300, 440);

    // 6. アイテム名 (中央大きく)
    ctx.fillStyle = "#d84315"; // 濃いオレンジ
    ctx.font = "900 36px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
    ctx.shadowBlur = 4;
    
    // 名前が長すぎる場合はフォントを小さくする
    let nameFontSize = 36;
    while (ctx.measureText(itemData.itemName).width > 500 && nameFontSize > 20) {
        nameFontSize -= 2;
        ctx.font = `900 ${nameFontSize}px 'M PLUS Rounded 1c', sans-serif`;
    }
    ctx.fillText(itemData.itemName, 300, 480);
    ctx.shadowBlur = 0; // 影リセット

    // 7. ネル先生の解説枠 (オレンジ)
    const boxX = 30;
    const boxW = 540;
    const descBoxY = 510;
    const descBoxH = 160;

    // 背景
    ctx.fillStyle = "#fff3e0";
    ctx.strokeStyle = "#ffb74d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(boxX, descBoxY, boxW, descBoxH, 15);
    ctx.fill();
    ctx.stroke();

    // ラベル
    ctx.fillStyle = "#ef6c00";
    ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("🐱 ネル先生の解説", boxX + 15, descBoxY + 30);

    // 本文
    ctx.fillStyle = "#5d4037";
    ctx.font = "18px 'Sawarabi Gothic', sans-serif";
    const descText = itemData.description || "（解説なし）";
    // 括弧書きの読み仮名を削除してスッキリさせる処理 (任意)
    const cleanDesc = descText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");
    wrapText(ctx, cleanDesc, boxX + 15, descBoxY + 60, boxW - 30, 26);

    // 8. ほんとうのこと枠 (青)
    const realBoxY = 690;
    const realBoxH = 160;

    // 背景
    ctx.fillStyle = "#e3f2fd";
    ctx.strokeStyle = "#64b5f6";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(boxX, realBoxY, boxW, realBoxH, 15);
    ctx.fill();
    ctx.stroke();

    // ラベル
    ctx.fillStyle = "#1565c0";
    ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("💡 ほんとうのこと", boxX + 15, realBoxY + 30);

    // 本文
    ctx.fillStyle = "#0d47a1";
    ctx.font = "18px 'Sawarabi Gothic', sans-serif";
    const realText = itemData.realDescription || "（情報なし）";
    const cleanReal = realText.replace(/[\(（][ぁ-んァ-ンー\s　]+[\)）]/g, "");
    wrapText(ctx, cleanReal, boxX + 15, realBoxY + 60, boxW - 30, 26);

    // 9. フッター (日付・名前)
    ctx.fillStyle = "#888";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "right";
    const footerText = `発見日: ${dateStr} | 発見者: ${userData ? userData.name : 'ゲスト'}`;
    ctx.fillText(footerText, CANVAS_W - 30, CANVAS_H - 15);

    // 10. JPEG画像としてエクスポート (画質0.8)
    return canvas.toDataURL("image/jpeg", 0.8);
};