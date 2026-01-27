// --- js/camera-service.js ---
// カメラ制御、画像加工、Cropperロジックを集約

// ==========================================
// 1. ライブチャット用カメラ制御
// ==========================================

// プレビュー開始
window.startPreviewCamera = async function(videoId = 'live-chat-video', containerId = 'live-chat-video-container') {
    const video = document.getElementById(videoId);
    const container = document.getElementById(containerId);
    if (!video || !container) return;

    try {
        // 既存のストリームがあれば停止
        if (window.previewStream) {
            window.previewStream.getTracks().forEach(t => t.stop());
        }
        
        try {
            window.previewStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" },
                audio: false 
            });
        } catch(e) {
            // バックカメラがなければフロントカメラ
            window.previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        
        video.srcObject = window.previewStream;
        await video.play();
        container.style.display = 'block';

    } catch (e) {
        console.warn("[Preview] Camera init failed:", e);
        alert("カメラが使えないにゃ…。");
    }
};

// プレビュー停止
window.stopPreviewCamera = function() {
    if (window.previewStream) {
        window.previewStream.getTracks().forEach(t => t.stop());
        window.previewStream = null;
    }
    // 全ての可能性のあるビデオ要素を停止 & クリア
    const videoIds = [
        'live-chat-video', 
        'live-chat-video-embedded', 
        'live-chat-video-simple', 
        'live-chat-video-free'
    ];
    videoIds.forEach(vid => {
        const v = document.getElementById(vid);
        if(v) v.srcObject = null;
    });

    const containerIds = [
        'live-chat-video-container', 
        'live-chat-video-container-embedded', 
        'live-chat-video-container-simple', 
        'live-chat-video-container-free'
    ];
    containerIds.forEach(cid => {
        const c = document.getElementById(cid);
        if(c) c.style.display = 'none';
    });
};

// ==========================================
// 2. 宿題用カメラモーダル制御
// ==========================================

window.startHomeworkWebcam = async function() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    const shutter = document.getElementById('camera-shutter-btn');
    const cancel = document.getElementById('camera-cancel-btn');
    
    if (!modal || !video) return;
    
    try {
        let constraints = { video: { facingMode: "environment" } };
        try { 
            window.homeworkStream = await navigator.mediaDevices.getUserMedia(constraints); 
        } catch (e) { 
            window.homeworkStream = await navigator.mediaDevices.getUserMedia({ video: true }); 
        }
        
        video.srcObject = window.homeworkStream;
        video.setAttribute('playsinline', true); 
        await video.play();
        modal.classList.remove('hidden');
        
        // シャッターボタン
        shutter.onclick = () => {
            const canvas = document.getElementById('camera-canvas');
            canvas.width = video.videoWidth; 
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob((blob) => {
                if(blob) {
                    const file = new File([blob], "homework_capture.jpg", { type: "image/jpeg" });
                    window.closeHomeworkCamera();
                    // ファイル処理へ (main.js等で定義されていることを期待)
                    if (window.handleFileUpload) {
                        window.handleFileUpload(file);
                    }
                }
            }, 'image/jpeg', 0.9);
        };
        
        cancel.onclick = window.closeHomeworkCamera;
        
    } catch (err) { 
        alert("カメラエラー: " + err.message); 
        window.closeHomeworkCamera(); 
    }
};

window.closeHomeworkCamera = function() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    
    if (window.homeworkStream) { 
        window.homeworkStream.getTracks().forEach(t => t.stop()); 
        window.homeworkStream = null; 
    }
    
    if (video) video.srcObject = null;
    if (modal) modal.classList.add('hidden');
};

// ==========================================
// 3. 画像加工ロジック
// ==========================================

// お宝図鑑用画像生成 (円形切り抜き・装飾)
window.createTreasureImage = function(sourceCanvas) {
    const OUTPUT_SIZE = 320; 
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    
    const size = Math.min(sourceCanvas.width, sourceCanvas.height);
    const sx = (sourceCanvas.width - size) / 2;
    const sy = (sourceCanvas.height - size) / 2;
    
    // 背景白
    ctx.fillStyle = "#ffffff";
    
    // 円形クリップ
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE/2, OUTPUT_SIZE/2, OUTPUT_SIZE/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // 画像描画
    ctx.drawImage(sourceCanvas, sx, sy, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.restore();
    
    // 金色の枠線
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE/2, OUTPUT_SIZE/2, OUTPUT_SIZE/2 - 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd700'; 
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();
    
    // 光沢エフェクト
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE*0.2, OUTPUT_SIZE*0.2, OUTPUT_SIZE*0.05, 0, Math.PI*2);
    ctx.fill();
    
    return canvas.toDataURL('image/jpeg', 0.8);
};

// AI解析用リサイズ (最大幅1600px)
window.processImageForAI = function(sourceCanvas) {
    const MAX_WIDTH = 1600; 
    let w = sourceCanvas.width; 
    let h = sourceCanvas.height; 
    
    if (w > MAX_WIDTH || h > MAX_WIDTH) { 
        if (w > h) { 
            h *= MAX_WIDTH / w; 
            w = MAX_WIDTH; 
        } else { 
            w *= MAX_WIDTH / h; 
            h = MAX_WIDTH; 
        } 
    } 
    
    const canvas = document.createElement('canvas'); 
    canvas.width = w; 
    canvas.height = h; 
    const ctx = canvas.getContext('2d'); 
    ctx.drawImage(sourceCanvas, 0, 0, w, h); 
    
    return canvas.toDataURL('image/jpeg', 0.9); 
};

// 4点座標に基づいた切り抜き（パース補正は簡易的）
window.performPerspectiveCrop = function(sourceCanvas, points) { 
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x)); 
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y)); 
    
    let w = maxX - minX;
    let h = maxY - minY; 
    if (w < 1) w = 1; 
    if (h < 1) h = 1; 
    
    const tempCv = document.createElement('canvas'); 
    tempCv.width = w; 
    tempCv.height = h; 
    const ctx = tempCv.getContext('2d'); 
    
    // 指定範囲を切り出して描画
    ctx.drawImage(sourceCanvas, minX, minY, w, h, 0, 0, w, h); 
    
    // AI用にリサイズしてBase64を返す (ヘッダ除去)
    return window.processImageForAI(tempCv).split(',')[1]; 
};

// ==========================================
// 4. Cropper (画像切り抜きUI) ロジック
// ==========================================

// Cropper初期化
window.initCustomCropper = function() { 
    const modal = document.getElementById('cropper-modal'); 
    modal.classList.remove('hidden'); 
    const canvas = document.getElementById('crop-canvas'); 
    
    const MAX_CANVAS_SIZE = 2500; 
    let w = window.cropImg.width; 
    let h = window.cropImg.height; 
    
    // キャンバスサイズが大きすぎないように調整
    if (w > MAX_CANVAS_SIZE || h > MAX_CANVAS_SIZE) { 
        const scale = Math.min(MAX_CANVAS_SIZE / w, MAX_CANVAS_SIZE / h); 
        w *= scale; 
        h *= scale; 
        // 座標もスケールに合わせて調整
        window.cropPoints = window.cropPoints.map(p => ({ x: p.x * scale, y: p.y * scale })); 
    } 
    
    canvas.width = w; 
    canvas.height = h; 
    canvas.style.width = '100%'; 
    canvas.style.height = '100%'; 
    canvas.style.objectFit = 'contain'; 
    
    const ctx = canvas.getContext('2d'); 
    ctx.drawImage(window.cropImg, 0, 0, w, h); 
    
    window.updateCropUI(canvas); 
    
    // ハンドルのドラッグイベント設定
    const handles = ['handle-tl', 'handle-tr', 'handle-br', 'handle-bl']; 
    handles.forEach((id, idx) => { 
        const el = document.getElementById(id); 
        const startDrag = (e) => { 
            e.preventDefault(); 
            window.activeHandle = idx; 
        }; 
        el.onmousedown = startDrag; 
        el.ontouchstart = startDrag; 
    }); 
    
    // マウス移動イベント
    const move = (e) => { 
        if (window.activeHandle === -1) return; 
        e.preventDefault(); 
        
        const rect = canvas.getBoundingClientRect(); 
        const imgRatio = canvas.width / canvas.height; 
        const rectRatio = rect.width / rect.height; 
        
        let drawX, drawY, drawW, drawH; 
        
        // object-fit: contain の表示領域計算
        if (imgRatio > rectRatio) { 
            drawW = rect.width; 
            drawH = rect.width / imgRatio; 
            drawX = 0; 
            drawY = (rect.height - drawH) / 2; 
        } else { 
            drawH = rect.height; 
            drawW = rect.height * imgRatio; 
            drawY = 0; 
            drawX = (rect.width - drawW) / 2; 
        } 
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX; 
        const clientY = e.touches ? e.touches[0].clientY : e.clientY; 
        
        let relX = (clientX - rect.left - drawX) / drawW; 
        let relY = (clientY - rect.top - drawY) / drawH; 
        
        relX = Math.max(0, Math.min(1, relX)); 
        relY = Math.max(0, Math.min(1, relY)); 
        
        window.cropPoints[window.activeHandle] = { x: relX * canvas.width, y: relY * canvas.height }; 
        window.updateCropUI(canvas); 
    }; 
    
    const end = () => { window.activeHandle = -1; }; 
    
    window.onmousemove = move; 
    window.ontouchmove = move; 
    window.onmouseup = end; 
    window.ontouchend = end; 
    
    // キャンセルボタン
    document.getElementById('cropper-cancel-btn').onclick = () => { 
        modal.classList.add('hidden'); 
        window.onmousemove = null; 
        window.ontouchmove = null; 
        document.getElementById('upload-controls').classList.remove('hidden'); 
    }; 
    
    // 決定ボタン
    document.getElementById('cropper-ok-btn').onclick = () => { 
        modal.classList.add('hidden'); 
        window.onmousemove = null; 
        window.ontouchmove = null; 
        
        const croppedBase64 = window.performPerspectiveCrop(canvas, window.cropPoints); 
        
        // main.js の startAnalysis を呼び出す
        if (window.startAnalysis) {
            window.startAnalysis(croppedBase64); 
        }
    }; 
};

// Cropper UI更新 (ハンドルと枠線の描画)
window.updateCropUI = function(canvas) { 
    const handles = ['handle-tl', 'handle-tr', 'handle-br', 'handle-bl']; 
    const rect = canvas.getBoundingClientRect(); 
    const imgRatio = canvas.width / canvas.height; 
    const rectRatio = rect.width / rect.height; 
    
    let drawX, drawY, drawW, drawH; 
    if (imgRatio > rectRatio) { 
        drawW = rect.width; 
        drawH = rect.width / imgRatio; 
        drawX = 0; 
        drawY = (rect.height - drawH) / 2; 
    } else { 
        drawH = rect.height; 
        drawW = rect.height * imgRatio; 
        drawY = 0; 
        drawX = (rect.width - drawW) / 2; 
    } 
    
    const toScreen = (p) => ({ 
        x: (p.x / canvas.width) * drawW + drawX + canvas.offsetLeft, 
        y: (p.y / canvas.height) * drawH + drawY + canvas.offsetTop 
    }); 
    
    const screenPoints = window.cropPoints.map(toScreen); 
    
    handles.forEach((id, i) => { 
        const el = document.getElementById(id); 
        if(el) {
            el.style.left = screenPoints[i].x + 'px'; 
            el.style.top = screenPoints[i].y + 'px'; 
        }
    }); 
    
    const svg = document.getElementById('crop-lines'); 
    if (svg) {
        svg.style.left = canvas.offsetLeft + 'px'; 
        svg.style.top = canvas.offsetTop + 'px'; 
        svg.style.width = canvas.offsetWidth + 'px'; 
        svg.style.height = canvas.offsetHeight + 'px'; 
        
        const toSvg = (p) => ({ 
            x: (p.x / canvas.width) * drawW + drawX, 
            y: (p.y / canvas.height) * drawH + drawY 
        }); 
        
        const svgPts = window.cropPoints.map(toSvg); 
        const ptsStr = svgPts.map(p => `${p.x},${p.y}`).join(' '); 
        
        svg.innerHTML = `<polyline points="${ptsStr} ${svgPts[0].x},${svgPts[0].y}" style="fill:rgba(255,255,255,0.2);stroke:#ff4081;stroke-width:2;stroke-dasharray:5" />`; 
    }
};

// 画像アップロード時のハンドラ
window.handleFileUpload = async function(file) { 
    if (window.isAnalyzing || !file) return; 
    
    document.getElementById('upload-controls').classList.add('hidden'); 
    document.getElementById('cropper-modal').classList.remove('hidden'); 
    
    const canvas = document.getElementById('crop-canvas'); 
    canvas.style.opacity = '0'; 
    
    const reader = new FileReader(); 
    reader.onload = async (e) => { 
        window.cropImg = new Image(); 
        window.cropImg.onload = async () => { 
            const w = window.cropImg.width; 
            const h = window.cropImg.height; 
            
            // 初期クロップ範囲設定 (少し内側)
            window.cropPoints = [ 
                { x: w * 0.1, y: h * 0.1 }, 
                { x: w * 0.9, y: h * 0.1 }, 
                { x: w * 0.9, y: h * 0.9 }, 
                { x: w * 0.1, y: h * 0.9 } 
            ]; 
            
            canvas.style.opacity = '1'; 
            if (window.updateNellMessage) {
                window.updateNellMessage("ここを読み取るにゃ？", "normal"); 
            }
            window.initCustomCropper(); 
        }; 
        window.cropImg.src = e.target.result; 
    }; 
    reader.readAsDataURL(file); 
};
// --- js/camera-service.js に追記 ---

// 切り抜き実行＆分析開始
window.performPerspectiveCrop = function() {
    if (!window.cropper) {
        console.error("Cropper not initialized");
        return;
    }

    // クロップデータを取得
    const canvas = window.cropper.getCroppedCanvas();
    if (!canvas) return;

    // Blobに変換して送信
    canvas.toBlob(function(blob) {
        // モーダルを閉じる
        const modal = document.getElementById('cropper-modal');
        if(modal) modal.classList.add('hidden');
        
        // クリーンアップ
        if (window.cropImg) {
            window.cropImg.src = '';
            window.cropImg = null;
        }
        if (window.cropper) {
            window.cropper.destroy();
            window.cropper = null;
        }
        
        // main.js の分析関数を呼び出す
        if (window.startAnalysis) {
            window.startAnalysis(blob);
        } else {
            console.error("startAnalysis is missing!");
            alert("エラー：分析機能が見つかりません(main.jsを確認してにゃ)");
        }
    }, 'image/jpeg', 0.9);
};

// Cropperの初期化 (もし足りていなければ)
window.initCustomCropper = function(imageElement, points) {
    if(window.cropper) window.cropper.destroy();
    
    window.cropper = new Cropper(imageElement, {
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        ready: function() {
            // 必要なら初期範囲を設定
        }
    });
};
console.log("✅ camera-service.js loaded.");