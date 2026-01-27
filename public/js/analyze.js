// --- js/analyze.js (v295.0: 統合完全版) ---
// カメラ・画像処理・メインロジック・タイマー・イベント処理を統合

// ==========================================
// 1. メインUI制御・モード選択
// ==========================================

window.selectMode = function(m) {
    try {
        window.currentMode = m; 
        window.chatSessionHistory = [];

        if (typeof window.switchScreen === 'function') {
            window.switchScreen('screen-main'); 
        } else {
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            document.getElementById('screen-main').classList.remove('hidden');
        }

        const ids = ['subject-selection-view', 'upload-controls', 'thinking-view', 'problem-selection-view', 'final-view', 'chalkboard', 'chat-view', 'simple-chat-view', 'chat-free-view', 'lunch-view', 'grade-sheet-container', 'hint-detail-container', 'embedded-chat-section'];
        ids.forEach(id => { 
            const el = document.getElementById(id); 
            if (el) el.classList.add('hidden'); 
        });
        
        document.getElementById('conversation-log').classList.add('hidden');
        document.getElementById('log-content').innerHTML = "";
        
        ['embedded-chalkboard', 'chalkboard-simple', 'chalkboard-free'].forEach(bid => {
            const embedBoard = document.getElementById(bid);
            if (embedBoard) {
                embedBoard.innerText = "";
                embedBoard.classList.add('hidden');
            }
        });

        ['embedded-text-input', 'simple-text-input', 'free-text-input'].forEach(iid => {
            const embedInput = document.getElementById(iid);
            if(embedInput) embedInput.value = "";
        });

        const backBtn = document.getElementById('main-back-btn');
        if (backBtn) { backBtn.classList.remove('hidden'); backBtn.onclick = window.backToLobby; }
        
        if(typeof window.stopAlwaysOnListening === 'function') window.stopAlwaysOnListening();
        if (typeof window.stopLiveChat === 'function') window.stopLiveChat();
        window.stopPreviewCamera(); 
        
        window.gameRunning = false;
        const icon = document.querySelector('.nell-avatar-wrap img'); 
        if(icon) icon.src = "assets/images/characters/nell-normal.png";
        
        const miniKarikari = document.getElementById('mini-karikari-display');
        if(miniKarikari) miniKarikari.classList.remove('hidden');
        if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
        
        if (m === 'chat') { 
            document.getElementById('chat-view').classList.remove('hidden'); 
            window.updateNellMessage("お宝を見せてにゃ！お話もできるにゃ！", "excited", false); 
            document.getElementById('conversation-log').classList.remove('hidden');
            if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();
        } 
        else if (m === 'simple-chat') {
            document.getElementById('simple-chat-view').classList.remove('hidden');
            window.updateNellMessage("今日はお話だけするにゃ？", "gentle", false);
            document.getElementById('conversation-log').classList.remove('hidden');
            if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();
        }
        else if (m === 'chat-free') {
            document.getElementById('chat-free-view').classList.remove('hidden');
            window.updateNellMessage("何でも話していいにゃ！", "happy", false);
        }
        else if (m === 'lunch') { 
            document.getElementById('lunch-view').classList.remove('hidden'); 
            window.updateNellMessage("お腹ペコペコだにゃ……", "thinking", false); 
        } 
        else if (m === 'review') { 
            window.renderMistakeSelection(); 
            document.getElementById('embedded-chat-section').classList.remove('hidden'); 
            document.getElementById('conversation-log').classList.remove('hidden');
            if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();
        } 
        else { 
            const subjectView = document.getElementById('subject-selection-view'); 
            if (subjectView) subjectView.classList.remove('hidden'); 
            window.updateNellMessage("どの教科にするのかにゃ？", "normal", false); 
            if (m === 'explain' || m === 'grade') {
                document.getElementById('embedded-chat-section').classList.remove('hidden');
                document.getElementById('conversation-log').classList.remove('hidden');
                if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();
            }
        }
    } catch (e) {
        console.error("selectMode Error:", e);
        alert("エラーが発生したにゃ。再読み込みしてにゃ。");
    }
};

// ==========================================
// 2. カメラ・画像処理 (旧 camera-service.js)
// ==========================================

window.startPreviewCamera = async function(videoId = 'live-chat-video', containerId = 'live-chat-video-container') {
    const video = document.getElementById(videoId);
    const container = document.getElementById(containerId);
    if (!video || !container) return;

    try {
        if (window.previewStream) {
            window.previewStream.getTracks().forEach(t => t.stop());
        }
        try {
            window.previewStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" },
                audio: false 
            });
        } catch(e) {
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

window.stopPreviewCamera = function() {
    if (window.previewStream) {
        window.previewStream.getTracks().forEach(t => t.stop());
        window.previewStream = null;
    }
    ['live-chat-video', 'live-chat-video-embedded', 'live-chat-video-simple', 'live-chat-video-free'].forEach(vid => {
        const v = document.getElementById(vid);
        if(v) v.srcObject = null;
    });
    ['live-chat-video-container', 'live-chat-video-container-embedded', 'live-chat-video-container-simple', 'live-chat-video-container-free'].forEach(cid => {
        const c = document.getElementById(cid);
        if(c) c.style.display = 'none';
    });
};

window.toggleHttpCamera = function(context) {
    let videoId, containerId, btnId;
    if (context === 'embedded') {
        videoId = 'live-chat-video-embedded'; containerId = 'live-chat-video-container-embedded'; btnId = 'live-camera-btn-embedded';
    } else if (context === 'simple') {
        videoId = 'live-chat-video-simple'; containerId = 'live-chat-video-container-simple'; btnId = 'live-camera-btn-simple';
    } else return;

    const btn = document.getElementById(btnId);
    
    if (window.previewStream && window.previewStream.active) {
        if(typeof window.captureAndSendLiveImageHttp === 'function') window.captureAndSendLiveImageHttp(context);
    } else {
        window.startPreviewCamera(videoId, containerId).then(() => {
            if (btn) {
                btn.innerHTML = "<span>📸</span> 撮影して送信";
                btn.style.backgroundColor = "#ff5252"; 
            }
        });
    }
};

window.toggleEmbeddedCamera = function() { window.toggleHttpCamera('embedded'); };
window.toggleSimpleCamera = function() { window.toggleHttpCamera('simple'); };

window.toggleTreasureCamera = function() {
    const videoId = 'live-chat-video';
    const containerId = 'live-chat-video-container';
    const btnId = 'live-camera-btn';
    const btn = document.getElementById(btnId);
    
    if (window.previewStream && window.previewStream.active) {
        window.captureAndIdentifyItem();
    } else {
        window.startPreviewCamera(videoId, containerId).then(() => {
            if (btn) {
                btn.innerHTML = "<span>📸</span> 撮影する";
                btn.style.backgroundColor = "#ff5252"; 
            }
        });
    }
};

window.createTreasureImage = function(sourceCanvas) {
    const OUTPUT_SIZE = 320; 
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    
    const size = Math.min(sourceCanvas.width, sourceCanvas.height);
    const sx = (sourceCanvas.width - size) / 2;
    const sy = (sourceCanvas.height - size) / 2;
    
    ctx.fillStyle = "#ffffff";
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE/2, OUTPUT_SIZE/2, OUTPUT_SIZE/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(sourceCanvas, sx, sy, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.restore();
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE/2, OUTPUT_SIZE/2, OUTPUT_SIZE/2 - 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd700'; 
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE*0.2, OUTPUT_SIZE*0.2, OUTPUT_SIZE*0.05, 0, Math.PI*2);
    ctx.fill();
    
    return canvas.toDataURL('image/jpeg', 0.8);
};

window.captureAndIdentifyItem = async function() {
    if (window.isLiveImageSending) return;
    if (window.isAlwaysListening && window.continuousRecognition) {
        try { window.continuousRecognition.stop(); } catch(e){}
    }

    const video = document.getElementById('live-chat-video');
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...。");

    window.isLiveImageSending = true;
    const btn = document.getElementById('live-camera-btn');
    if (btn) {
        btn.innerHTML = "<span>📡</span> 解析中にゃ...";
        btn.style.backgroundColor = "#ccc";
        btn.disabled = true;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    const treasureDataUrl = window.createTreasureImage(canvas);

    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    try {
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("ん？どれどれ…", "thinking", false, true);

        const res = await fetch('/identify-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data, name: currentUser ? currentUser.name : "生徒" })
        });

        if (!res.ok) throw new Error("Server response not ok");
        const data = await res.json();
        
        if(typeof window.updateNellMessage === 'function') {
            if (data.speechText) await window.updateNellMessage(data.speechText, "happy", true, true);
            else if (data.text) await window.updateNellMessage(data.text, "happy", true, true); 
        }

        if (data.itemName && window.NellMemory) {
            const description = data.description || "（解説はないにゃ）";
            await window.NellMemory.addToCollection(currentUser.id, data.itemName, treasureDataUrl, description);
            
            const notif = document.createElement('div');
            notif.innerText = `📖 図鑑に「${data.itemName}」を登録したにゃ！`;
            notif.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.95); border:4px solid #00bcd4; color:#006064; padding:15px 25px; border-radius:30px; font-weight:900; z-index:10000; animation: popIn 0.5s ease; box-shadow:0 10px 25px rgba(0,0,0,0.3);";
            document.body.appendChild(notif);
            setTimeout(() => notif.remove(), 4000);
            if(window.safePlay) window.safePlay(window.sfxHirameku);
        }
    } catch (e) {
        console.error("Identify Error:", e);
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("よく見えなかったにゃ…もう一回お願いにゃ！", "thinking", false, true);
    } finally {
        window.isLiveImageSending = false;
        window.stopPreviewCamera(); 
        if (btn) {
            btn.innerHTML = "<span>📷</span> お宝を見せる（図鑑登録）";
            btn.style.backgroundColor = "#ff85a1"; 
            btn.disabled = false;
        }
        if (window.isAlwaysListening && window.currentMode === 'chat') {
            try { window.continuousRecognition.start(); } catch(e){}
        }
    }
};

window.startHomeworkWebcam = async function() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    const shutter = document.getElementById('camera-shutter-btn');
    const cancel = document.getElementById('camera-cancel-btn');
    if (!modal || !video) return;
    try {
        let constraints = { video: { facingMode: "environment" } };
        try { window.homeworkStream = await navigator.mediaDevices.getUserMedia(constraints); } 
        catch (e) { window.homeworkStream = await navigator.mediaDevices.getUserMedia({ video: true }); }
        video.srcObject = window.homeworkStream;
        video.setAttribute('playsinline', true); 
        await video.play();
        modal.classList.remove('hidden');
        shutter.onclick = () => {
            const canvas = document.getElementById('camera-canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if(blob) {
                    const file = new File([blob], "homework_capture.jpg", { type: "image/jpeg" });
                    window.closeHomeworkCamera();
                    window.handleFileUpload(file);
                }
            }, 'image/jpeg', 0.9);
        };
        cancel.onclick = window.closeHomeworkCamera;
    } catch (err) { alert("カメラエラー: " + err.message); window.closeHomeworkCamera(); }
};

window.closeHomeworkCamera = function() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    if (window.homeworkStream) { window.homeworkStream.getTracks().forEach(t => t.stop()); window.homeworkStream = null; }
    if (video) video.srcObject = null;
    if (modal) modal.classList.add('hidden');
};

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
            window.cropPoints = [ { x: w * 0.1, y: h * 0.1 }, { x: w * 0.9, y: h * 0.1 }, { x: w * 0.9, y: h * 0.9 }, { x: w * 0.1, y: h * 0.9 } ]; 
            canvas.style.opacity = '1'; 
            if(typeof window.updateNellMessage === 'function') window.updateNellMessage("ここを読み取るにゃ？", "normal"); 
            window.initCustomCropper(); 
        }; 
        window.cropImg.src = e.target.result; 
    }; 
    reader.readAsDataURL(file); 
};

window.initCustomCropper = function() { 
    const modal = document.getElementById('cropper-modal'); 
    modal.classList.remove('hidden'); 
    const canvas = document.getElementById('crop-canvas'); 
    const MAX_CANVAS_SIZE = 2500; 
    let w = window.cropImg.width; 
    let h = window.cropImg.height; 
    if (w > MAX_CANVAS_SIZE || h > MAX_CANVAS_SIZE) { 
        const scale = Math.min(MAX_CANVAS_SIZE / w, MAX_CANVAS_SIZE / h); 
        w *= scale; h *= scale; 
        window.cropPoints = window.cropPoints.map(p => ({ x: p.x * scale, y: p.y * scale })); 
    } 
    canvas.width = w; canvas.height = h; 
    canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.objectFit = 'contain'; 
    const ctx = canvas.getContext('2d'); 
    ctx.drawImage(window.cropImg, 0, 0, w, h); 
    window.updateCropUI(canvas); 
    const handles = ['handle-tl', 'handle-tr', 'handle-br', 'handle-bl']; 
    handles.forEach((id, idx) => { 
        const el = document.getElementById(id); 
        const startDrag = (e) => { e.preventDefault(); window.activeHandle = idx; }; 
        el.onmousedown = startDrag; el.ontouchstart = startDrag; 
    }); 
    const move = (e) => { 
        if (window.activeHandle === -1) return; 
        e.preventDefault(); 
        const rect = canvas.getBoundingClientRect(); 
        const imgRatio = canvas.width / canvas.height; 
        const rectRatio = rect.width / rect.height; 
        let drawX, drawY, drawW, drawH; 
        if (imgRatio > rectRatio) { 
            drawW = rect.width; drawH = rect.width / imgRatio; drawX = 0; drawY = (rect.height - drawH) / 2; 
        } else { 
            drawH = rect.height; drawW = rect.height * imgRatio; drawY = 0; drawX = (rect.width - drawW) / 2; 
        } 
        const clientX = e.touches ? e.touches[0].clientX : e.clientX; 
        const clientY = e.touches ? e.touches[0].clientY : e.clientY; 
        let relX = (clientX - rect.left - drawX) / drawW; 
        let relY = (clientY - rect.top - drawY) / drawH; 
        relX = Math.max(0, Math.min(1, relX)); relY = Math.max(0, Math.min(1, relY)); 
        window.cropPoints[window.activeHandle] = { x: relX * canvas.width, y: relY * canvas.height }; 
        window.updateCropUI(canvas); 
    }; 
    const end = () => { window.activeHandle = -1; }; 
    window.onmousemove = move; window.ontouchmove = move; window.onmouseup = end; window.ontouchend = end; 
    document.getElementById('cropper-cancel-btn').onclick = () => { 
        modal.classList.add('hidden'); 
        window.onmousemove = null; window.ontouchmove = null; 
        document.getElementById('upload-controls').classList.remove('hidden'); 
    }; 
    document.getElementById('cropper-ok-btn').onclick = () => { 
        modal.classList.add('hidden'); 
        window.onmousemove = null; window.ontouchmove = null; 
        const croppedBase64 = window.performPerspectiveCrop(canvas, window.cropPoints); 
        window.startAnalysis(croppedBase64); 
    }; 
};

window.updateCropUI = function(canvas) { 
    const handles = ['handle-tl', 'handle-tr', 'handle-br', 'handle-bl']; 
    const rect = canvas.getBoundingClientRect(); 
    const imgRatio = canvas.width / canvas.height; 
    const rectRatio = rect.width / rect.height; 
    let drawX, drawY, drawW, drawH; 
    if (imgRatio > rectRatio) { 
        drawW = rect.width; drawH = rect.width / imgRatio; drawX = 0; drawY = (rect.height - drawH) / 2; 
    } else { 
        drawH = rect.height; drawW = rect.height * imgRatio; drawY = 0; drawX = (rect.width - drawW) / 2; 
    } 
    const toScreen = (p) => ({ x: (p.x / canvas.width) * drawW + drawX + canvas.offsetLeft, y: (p.y / canvas.height) * drawH + drawY + canvas.offsetTop }); 
    const screenPoints = window.cropPoints.map(toScreen); 
    handles.forEach((id, i) => { 
        const el = document.getElementById(id); 
        el.style.left = screenPoints[i].x + 'px'; el.style.top = screenPoints[i].y + 'px'; 
    }); 
    const svg = document.getElementById('crop-lines'); 
    svg.style.left = canvas.offsetLeft + 'px'; svg.style.top = canvas.offsetTop + 'px'; svg.style.width = canvas.offsetWidth + 'px'; svg.style.height = canvas.offsetHeight + 'px'; 
    const toSvg = (p) => ({ x: (p.x / canvas.width) * drawW + drawX, y: (p.y / canvas.height) * drawH + drawY }); 
    const svgPts = window.cropPoints.map(toSvg); 
    const ptsStr = svgPts.map(p => `${p.x},${p.y}`).join(' '); 
    svg.innerHTML = `<polyline points="${ptsStr} ${svgPts[0].x},${svgPts[0].y}" style="fill:rgba(255,255,255,0.2);stroke:#ff4081;stroke-width:2;stroke-dasharray:5" />`; 
};

window.processImageForAI = function(sourceCanvas) { 
    const MAX_WIDTH = 1600; 
    let w = sourceCanvas.width; let h = sourceCanvas.height; 
    if (w > MAX_WIDTH || h > MAX_WIDTH) { 
        if (w > h) { h *= MAX_WIDTH / w; w = MAX_WIDTH; } else { w *= MAX_WIDTH / h; h = MAX_WIDTH; } 
    } 
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; 
    const ctx = canvas.getContext('2d'); ctx.drawImage(sourceCanvas, 0, 0, w, h); 
    return canvas.toDataURL('image/jpeg', 0.9); 
};

window.performPerspectiveCrop = function(sourceCanvas, points) { 
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x)); 
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y)); 
    let w = maxX - minX, h = maxY - minY; 
    if (w < 1) w = 1; if (h < 1) h = 1; 
    const tempCv = document.createElement('canvas'); tempCv.width = w; tempCv.height = h; 
    const ctx = tempCv.getContext('2d'); ctx.drawImage(sourceCanvas, minX, minY, w, h, 0, 0, w, h); 
    return window.processImageForAI(tempCv).split(',')[1]; 
};

window.startAnalysis = async function(b64) {
    if (window.isAnalyzing) return;
    window.isAnalyzing = true; 
    document.getElementById('cropper-modal').classList.add('hidden'); 
    document.getElementById('thinking-view').classList.remove('hidden'); 
    document.getElementById('upload-controls').classList.add('hidden'); 
    const backBtn = document.getElementById('main-back-btn'); if(backBtn) backBtn.classList.add('hidden');
    try { 
        if(window.safePlay) window.safePlay(window.sfxHirameku); 
        window.sfxBunseki.currentTime = 0; 
        window.sfxBunseki.loop = true;
        if(window.safePlay) window.safePlay(window.sfxBunseki);
    } catch(e){}
    
    let p = 0; 
    const timer = setInterval(() => { 
        if (!window.isAnalyzing) { clearInterval(timer); return; } 
        if (p < 30) p += 1; else if (p < 80) p += 0.4; else if (p < 95) p += 0.1; 
        if(typeof window.updateProgress === 'function') window.updateProgress(p); 
    }, 300);
    
    const performAnalysisNarration = async () => {
        const msgs = [ { text: "じーっと見て、問題を書き写してるにゃ…", mood: "thinking" }, { text: "ふむふむ…この問題、なかなか手強いにゃ…", mood: "thinking" }, { text: "しっぽの先まで集中して考え中だにゃ…", mood: "thinking" }, { text: "ネル先生のピピピッ！と光るヒゲが、正解をバッチリ受信してるにゃ！", mood: "thinking" } ];
        for (const item of msgs) { 
            if (!window.isAnalyzing) return; 
            if(typeof window.updateNellMessage === 'function') await window.updateNellMessage(item.text, item.mood, false); 
            if (!window.isAnalyzing) return; 
            await new Promise(r => setTimeout(r, 1500)); 
        }
    };
    performAnalysisNarration();
    
    try {
        const res = await fetch('/analyze', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ image: b64, mode: window.currentMode, grade: currentUser.grade, subject: window.currentSubject, name: currentUser.name }) 
        });
        if (!res.ok) throw new Error("Server Error"); 
        const data = await res.json();
        if (!data || !Array.isArray(data) || data.length === 0) throw new Error("データが空か、正しい形式ではありませんでした。");
        
        window.transcribedProblems = data.map((prob, index) => {
            let studentArr = Array.isArray(prob.student_answer) ? prob.student_answer : (prob.student_answer ? [prob.student_answer] : []);
            let correctArr = Array.isArray(prob.correct_answer) ? prob.correct_answer : (prob.correct_answer ? [prob.correct_answer] : []);
            return { ...prob, id: index + 1, student_answer: studentArr, correct_answer: correctArr, status: (studentArr.length > 0 && studentArr[0] !== "") ? "answered" : "unanswered", currentHintLevel: 1, maxUnlockedHintLevel: 0 };
        });
        
        window.isAnalyzing = false; clearInterval(timer); 
        if(typeof window.updateProgress === 'function') window.updateProgress(100); 
        window.cleanupAnalysis();
        
        if(window.safePlay) window.safePlay(window.sfxHirameku);
        
        setTimeout(() => { 
            document.getElementById('thinking-view').classList.add('hidden'); 
            const doneMsg = "読めたにゃ！"; 
            if (window.currentMode === 'grade') { 
                if(typeof window.showGradingView === 'function') window.showGradingView(true); 
                if(typeof window.updateNellMessage === 'function') window.updateNellMessage(doneMsg, "happy", false).then(() => setTimeout(window.updateGradingMessage, 1500)); 
            } else { 
                if(typeof window.renderProblemSelection === 'function') window.renderProblemSelection(); 
                if(typeof window.updateNellMessage === 'function') window.updateNellMessage(doneMsg, "happy", false); 
            } 
        }, 1500); 
    } catch (err) { 
        console.error("Analysis Error:", err); 
        window.isAnalyzing = false; window.cleanupAnalysis(); clearInterval(timer); 
        document.getElementById('thinking-view').classList.add('hidden'); document.getElementById('upload-controls').classList.remove('hidden'); 
        if(backBtn) backBtn.classList.remove('hidden'); 
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("うまく読めなかったにゃ…もう一度お願いにゃ！", "thinking", false); 
    }
};

window.cleanupAnalysis = function() { 
    window.isAnalyzing = false; 
    window.sfxBunseki.pause(); 
    if(typeof window.analysisTimers !== 'undefined' && window.analysisTimers) { 
        window.analysisTimers.forEach(t => clearTimeout(t)); 
        window.analysisTimers = []; 
    } 
};

// ==========================================
// 3. 汎用テキスト送信
// ==========================================

window.sendHttpText = async function(context) {
    let inputId;
    if (context === 'embedded') { inputId = 'embedded-text-input'; }
    else if (context === 'simple') { inputId = 'simple-text-input'; }
    else return;

    const input = document.getElementById(inputId);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    if (window.isAlwaysListening && window.continuousRecognition) {
        try { window.continuousRecognition.stop(); } catch(e){}
    }
    
    window.addLogItem('user', text);
    window.addToSessionHistory('user', text);

    try {
        window.updateNellMessage("ん？どれどれ…", "thinking", false, true);
        
        const res = await fetch('/chat-dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: text, 
                name: currentUser ? currentUser.name : "生徒",
                history: window.chatSessionHistory
            })
        });

        if(res.ok) {
            const data = await res.json();
            const speechText = data.speech || data.reply || "教えてあげるにゃ！";
            window.addLogItem('nell', speechText);
            window.addToSessionHistory('nell', speechText);
            await window.updateNellMessage(speechText, "happy", true, true);
            
            let boardId = (context === 'embedded') ? 'embedded-chalkboard' : 'chalkboard-simple';
            const embedBoard = document.getElementById(boardId);
            if (embedBoard && data.board && data.board.trim() !== "") {
                embedBoard.innerText = data.board;
                embedBoard.classList.remove('hidden');
            }
            input.value = ""; 
        }
    } catch(e) {
        console.error("Text Chat Error:", e);
        window.updateNellMessage("ごめん、ちょっとわからなかったにゃ。", "thinking", false, true);
    } finally {
        if (window.isAlwaysListening) {
             try { window.continuousRecognition.start(); } catch(e){}
        }
    }
};

window.sendEmbeddedText = function() { window.sendHttpText('embedded'); }
window.sendSimpleText = function() { window.sendHttpText('simple'); }

// ==========================================
// 4. その他共通機能・初期化
// ==========================================

window.startMouthAnimation = function() {
    let toggle = false;
    setInterval(() => {
        const img = document.getElementById('nell-face') || document.querySelector('.nell-avatar-wrap img');
        if (!img) return;
        let baseImg = window.defaultIcon;
        let talkImg = window.talkIcon;
        if (window.currentSubject && window.subjectImages[window.currentSubject] && 
           (window.currentMode === 'explain' || window.currentMode === 'grade' || window.currentMode === 'review')) {
            baseImg = window.subjectImages[window.currentSubject].base;
            talkImg = window.subjectImages[window.currentSubject].talk;
        }
        if (window.isNellSpeaking) img.src = toggle ? talkImg : baseImg;
        else img.src = baseImg;
        toggle = !toggle;
    }, 150);
};
window.startMouthAnimation();

window.saveToNellMemory = function(role, text) {
    if (!currentUser || !currentUser.id) return;
    const trimmed = text.trim();
    if (trimmed.length <= 1) return;
    
    window.chatTranscript += `${role === 'user' ? '生徒' : 'ネル'}: ${trimmed}\n`;
    const newItem = { role: role, text: trimmed, time: new Date().toISOString() };
    try {
        const memoryKey = `nell_raw_chat_log_${currentUser.id}`;
        let history = JSON.parse(localStorage.getItem(memoryKey) || '[]');
        if (history.length > 0 && history[history.length - 1].text === trimmed) return;
        history.push(newItem);
        if (history.length > 50) history.shift(); 
        localStorage.setItem(memoryKey, JSON.stringify(history));
    } catch(e) {}
};

window.setSubject = function(s) { 
    window.currentSubject = s; 
    const icon = document.querySelector('.nell-avatar-wrap img'); if(icon&&window.subjectImages[s]){icon.src=window.subjectImages[s].base; icon.onerror=()=>{icon.src=window.defaultIcon;};} 
    document.getElementById('subject-selection-view').classList.add('hidden'); 
    document.getElementById('upload-controls').classList.remove('hidden'); 
    window.updateNellMessage(`${window.currentSubject}の問題をみせてにゃ！`, "happy", false); 
    const btnFast = document.getElementById('mode-btn-fast');
    const btnPrec = document.getElementById('mode-btn-precision');
    if (btnFast) { btnFast.innerText = "📷 ネル先生に宿題を見せる"; btnFast.className = "main-btn"; btnFast.style.background = "#ff85a1"; btnFast.style.width = "100%"; btnFast.onclick = null; }
    if (btnPrec) btnPrec.style.display = "none";
};

window.setAnalyzeMode = function(type) { window.analysisType = 'precision'; };

// タイマー関連
window.openTimerModal = function() {
    document.getElementById('timer-modal').classList.remove('hidden');
    window.updateTimerDisplay(); 
};
window.closeTimerModal = function() {
    document.getElementById('timer-modal').classList.add('hidden');
};
window.setTimer = function(minutes) {
    if (window.studyTimerRunning) return;
    window.studyTimerValue += minutes * 60;
    window.updateTimerDisplay();
};
window.resetTimer = function() {
    if (window.studyTimerRunning) {
        clearInterval(window.studyTimerInterval);
        window.studyTimerRunning = false;
        document.getElementById('timer-toggle-btn').innerText = "スタート！";
        document.getElementById('timer-toggle-btn').className = "main-btn pink-btn";
    }
    window.studyTimerValue = 0;
    window.studyTimerCheck = 0;
    window.updateTimerDisplay();
    document.getElementById('mini-timer-display').classList.add('hidden');
};
window.toggleTimer = function() {
    if (window.studyTimerRunning) {
        clearInterval(window.studyTimerInterval);
        window.studyTimerRunning = false;
        document.getElementById('timer-toggle-btn').innerText = "再開する";
        document.getElementById('timer-toggle-btn').className = "main-btn blue-btn";
    } else {
        if (window.studyTimerValue <= 0) return alert("時間をセットしてにゃ！");
        window.studyTimerRunning = true;
        window.studyTimerCheck = 0;
        document.getElementById('timer-toggle-btn').innerText = "一時停止";
        document.getElementById('timer-toggle-btn').className = "main-btn gray-btn";
        document.getElementById('mini-timer-display').classList.remove('hidden');
        window.closeTimerModal();
        
        window.updateNellMessage("今からネル先生が時間を計ってやるにゃ", "normal", false, true);
        
        window.studyTimerInterval = setInterval(() => {
            if (window.studyTimerValue > 0) {
                window.studyTimerValue--;
                window.studyTimerCheck++;
                window.updateTimerDisplay();
                
                if (window.studyTimerValue === 600) window.updateNellMessage("10分前だにゃ〜。お茶でも飲んで落ち着くにゃ。", "gentle", false, true);
                else if (window.studyTimerValue === 300) window.updateNellMessage("あと5分。一歩ずつ、一歩ずつだにゃ〜。", "normal", false, true);
                else if (window.studyTimerValue === 180) window.updateNellMessage("3分前。深呼吸して、もうひと踏ん張りだにゃ。", "excited", false, true);
                else if (window.studyTimerValue === 60) window.updateNellMessage("あと1分だにゃ。最後までネル先生が見守ってるにゃ。", "excited", false, true);
            } else {
                clearInterval(window.studyTimerInterval);
                window.studyTimerRunning = false;
                document.getElementById('timer-toggle-btn').innerText = "スタート！";
                document.getElementById('timer-toggle-btn').className = "main-btn pink-btn";
                if(window.safePlay) window.safePlay(window.sfxChime); 
                window.updateNellMessage("時間だにゃ！お疲れ様だにゃ〜。さ、ゆっくり休むにゃ。", "happy", false, true);
                document.getElementById('mini-timer-display').classList.add('hidden');
                window.openTimerModal();
            }
        }, 1000);
    }
};
window.updateTimerDisplay = function() {
    const m = Math.floor(window.studyTimerValue / 60).toString().padStart(2, '0');
    const s = (window.studyTimerValue % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    const modalDisplay = document.getElementById('modal-timer-display');
    if(modalDisplay) modalDisplay.innerText = timeStr;
    const miniDisplay = document.getElementById('mini-timer-text');
    if(miniDisplay) miniDisplay.innerText = timeStr;
};

window.updateMiniKarikari = function() { if(currentUser) { const el = document.getElementById('mini-karikari-count'); if(el) el.innerText = currentUser.karikari; const el2 = document.getElementById('karikari-count'); if(el2) el2.innerText = currentUser.karikari; } };
window.showKarikariEffect = function(amount) { const container = document.querySelector('.nell-avatar-wrap'); if(container) { const floatText = document.createElement('div'); floatText.className = 'floating-text'; floatText.innerText = amount > 0 ? `+${amount}` : `${amount}`; floatText.style.color = amount > 0 ? '#ff9100' : '#ff5252'; floatText.style.right = '0px'; floatText.style.top = '0px'; container.appendChild(floatText); setTimeout(() => floatText.remove(), 1500); } };

window.giveLunch = function() { 
    if (currentUser.karikari < 1) return window.updateNellMessage("カリカリがないにゃ……", "thinking", false); 
    window.updateNellMessage("もぐもぐ……", "normal", false); 
    currentUser.karikari--; 
    if(typeof saveAndSync === 'function') saveAndSync(); 
    window.updateMiniKarikari(); 
    window.showKarikariEffect(-1); 
    window.lunchCount++; 
    fetch('/lunch-reaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: window.lunchCount, name: currentUser.name }) })
        .then(r => r.json())
        .then(d => { setTimeout(() => { window.updateNellMessage(d.reply || "おいしいにゃ！", d.isSpecial ? "excited" : "happy", true); }, 1500); })
        .catch(e => { setTimeout(() => { window.updateNellMessage("おいしいにゃ！", "happy", false); }, 1500); }); 
}; 

window.showGame = function() { 
    window.switchScreen('screen-game'); 
    document.getElementById('mini-karikari-display').classList.remove('hidden'); 
    window.updateMiniKarikari(); 
    window.initGame(); 
    window.fetchGameComment("start"); 
    const startBtn = document.getElementById('start-game-btn'); 
    if (startBtn) { 
        const newBtn = startBtn.cloneNode(true); 
        startBtn.parentNode.replaceChild(newBtn, startBtn); 
        newBtn.onclick = () => { if (!window.gameRunning) { window.initGame(); window.gameRunning = true; newBtn.disabled = true; window.drawGame(); } }; 
    } 
};
window.fetchGameComment = function(type, score=0) { fetch('/game-reaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name: currentUser.name, score }) }).then(r=>r.json()).then(d=>{ window.updateNellMessage(d.reply, d.mood || "excited", true); }).catch(e=>{}); };

window.renderMistakeSelection = function() { 
    if (!currentUser.mistakes || currentUser.mistakes.length === 0) { 
        window.updateNellMessage("ノートは空っぽにゃ！", "happy", false); 
        setTimeout(window.backToLobby, 2000); 
        return; 
    } 
    window.transcribedProblems = currentUser.mistakes; 
    window.renderProblemSelection(); 
    window.updateNellMessage("復習するにゃ？", "excited", false); 
};

window.startHint = function(id) {
    if (window.initAudioContext) window.initAudioContext().catch(e=>{});
    window.selectedProblem = window.transcribedProblems.find(p => p.id == id); 
    if (!window.selectedProblem) return window.updateNellMessage("データエラーだにゃ", "thinking", false);
    if (!window.selectedProblem.currentHintLevel) window.selectedProblem.currentHintLevel = 1;
    if (window.selectedProblem.maxUnlockedHintLevel === undefined) window.selectedProblem.maxUnlockedHintLevel = 0;
    ['problem-selection-view', 'grade-sheet-container', 'answer-display-area', 'chalkboard'].forEach(i => { const el = document.getElementById(i); if(el) el.classList.add('hidden'); });
    document.getElementById('final-view').classList.remove('hidden'); document.getElementById('hint-detail-container').classList.remove('hidden');
    const board = document.getElementById('chalkboard'); if(board) { board.innerText = window.selectedProblem.question; board.classList.remove('hidden'); }
    document.getElementById('main-back-btn').classList.add('hidden');
    window.updateNellMessage("ヒントを見るにゃ？", "thinking", false);
    window.renderHintUI();
    window.scrollTo({ top: 0, behavior: 'instant' });
};
window.renderHintUI = function() {
    const p = window.selectedProblem; const maxUnlocked = p.maxUnlockedHintLevel;
    const hintBtnsContainer = document.querySelector('.hint-btns');
    hintBtnsContainer.innerHTML = `<div class="hint-step-badge" id="hint-step-label">考え方</div>`;
    let nextCost = 0, nextLabel = ""; let nextLevel = maxUnlocked + 1;
    if (nextLevel === 1) { nextCost = 5; nextLabel = "カリカリ(×5)でヒントをもらう"; }
    else if (nextLevel === 2) { nextCost = 5; nextLabel = "カリカリ(×5)でさらにヒントをもらう"; }
    else if (nextLevel === 3) { nextCost = 10; nextLabel = "カリカリ(×10)で大ヒントをもらう"; }
    if (nextLevel <= 3) {
        const unlockBtn = document.createElement('button'); unlockBtn.className = "main-btn blue-btn"; unlockBtn.innerText = nextLabel; unlockBtn.onclick = () => window.unlockNextHint(nextLevel, nextCost); hintBtnsContainer.appendChild(unlockBtn);
    } else {
        const revealBtn = document.createElement('button'); revealBtn.className = "main-btn orange-btn"; revealBtn.innerText = "答えを見る"; revealBtn.onclick = window.revealAnswer; hintBtnsContainer.appendChild(revealBtn);
    }
    if (maxUnlocked > 0) {
        const reviewContainer = document.createElement('div'); reviewContainer.style.display = "flex"; reviewContainer.style.gap = "5px"; reviewContainer.style.marginTop = "10px"; reviewContainer.style.flexWrap = "wrap";
        for (let i = 1; i <= maxUnlocked; i++) { const btn = document.createElement('button'); btn.className = "main-btn gray-btn"; btn.style.fontSize = "0.9rem"; btn.style.padding = "8px"; btn.style.flex = "1"; btn.innerText = `ヒント${i}を見る`; btn.onclick = () => window.showHintText(i); reviewContainer.appendChild(btn); }
        hintBtnsContainer.appendChild(reviewContainer);
    }
    const ansDiv = document.createElement('div'); ansDiv.id = "answer-display-area"; ansDiv.className = "answer-box hidden"; ansDiv.innerHTML = `ネル先生の答え：<br><span id="final-answer-text"></span>`; hintBtnsContainer.appendChild(ansDiv);
};
window.unlockNextHint = function(level, cost) {
    if (window.initAudioContext) window.initAudioContext();
    if (currentUser.karikari < cost) return window.updateNellMessage(`カリカリが足りないにゃ…あと${cost}個！`, "thinking", false);
    currentUser.karikari -= cost; saveAndSync(); window.updateMiniKarikari(); window.showKarikariEffect(-cost);
    window.selectedProblem.maxUnlockedHintLevel = level;
    window.showHintText(level); window.renderHintUI();
};
window.showHintText = function(level) {
    const hints = window.selectedProblem.hints || []; const text = hints[level - 1] || "ヒントが見つからないにゃ...";
    window.updateNellMessage(text, "thinking", false);
    const hl = document.getElementById('hint-step-label'); if(hl) hl.innerText = `ヒント Lv.${level}`; 
};
window.revealAnswer = function() {
    const ansArea = document.getElementById('answer-display-area'); const finalTxt = document.getElementById('final-answer-text');
    const correctArr = Array.isArray(window.selectedProblem.correct_answer) ? window.selectedProblem.correct_answer : [window.selectedProblem.correct_answer];
    let displayAnswer = correctArr.map(part => part.split('|')[0]).join(', ');
    if (ansArea && finalTxt) { finalTxt.innerText = displayAnswer; ansArea.classList.remove('hidden'); ansArea.style.display = "block"; }
    const btns = document.querySelectorAll('.hint-btns button.orange-btn'); btns.forEach(b => b.classList.add('hidden'));
    window.updateNellMessage(`答えは「${displayAnswer}」だにゃ！`, "gentle", false); 
};
function createProblemItem(p, mode) {
    const isGradeMode = (mode === 'grade'); let markHtml = "", bgStyle = "background:white;";
    let correctList = Array.isArray(p.correct_answer) ? p.correct_answer : [String(p.correct_answer)];
    correctList = correctList.map(s => String(s).trim()).filter(s => s !== ""); 
    let studentList = Array.isArray(p.student_answer) ? p.student_answer : [String(p.student_answer)];
    if (isGradeMode) {
        let isCorrect = p.is_correct;
        if (isCorrect === undefined) { if (correctList.length !== studentList.length) isCorrect = false; else { isCorrect = true; for(let i=0; i<correctList.length; i++) { if (!window.isMatch(studentList[i] || "", correctList[i])) { isCorrect = false; break; } } } }
        const mark = isCorrect ? "⭕" : "❌"; const markColor = isCorrect ? "#ff5252" : "#4a90e2"; bgStyle = isCorrect ? "background:#fff5f5;" : "background:#f0f8ff;";
        markHtml = `<div id="mark-${p.id}" style="font-weight:900; color:${markColor}; font-size:2rem; width:50px; text-align:center; flex-shrink:0;">${mark}</div>`;
    } else { markHtml = `<div id="mark-${p.id}" style="font-weight:900; color:#4a90e2; font-size:2rem; width:50px; text-align:center; flex-shrink:0;"></div>`; }
    let inputHtml = "";
    if (correctList.length > 1) {
        inputHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; width:100%;">`;
        for (let i = 0; i < correctList.length; i++) { let val = studentList[i] || ""; const onInput = isGradeMode ? `oninput="window.checkMultiAnswer(${p.id}, event)"` : ""; inputHtml += `<input type="text" value="${val}" class="multi-input-${p.id}" ${onInput} style="width:100%; padding:8px; border:2px solid #ddd; border-radius:8px; font-size:1rem; font-weight:bold; color:#333; min-width:0; box-sizing:border-box;">`; }
        inputHtml += `</div>`;
    } else {
        const val = studentList[0] || ""; const onInput = isGradeMode ? `oninput="window.checkAnswerDynamically(${p.id}, this, event)"` : ""; const idAttr = isGradeMode ? "" : `id="single-input-${p.id}"`;
        inputHtml = `<div style="width:100%;"><input type="text" ${idAttr} value="${val}" ${onInput} style="width:100%; padding:8px; border:2px solid #ddd; border-radius:8px; font-size:1rem; font-weight:bold; color:#333; box-sizing:border-box;"></div>`;
    }
    let buttonsHtml = "";
    if (isGradeMode) { buttonsHtml = `<div style="display:flex; flex-direction:column; gap:5px; width:80px; flex-shrink:0; justify-content:center; margin-left:auto;"><button class="mini-teach-btn" onclick="window.startHint(${p.id})" style="width:100%;">教えて</button></div>`; } 
    else { buttonsHtml = `<div style="display:flex; flex-direction:column; gap:5px; width:80px; flex-shrink:0; margin-left:auto;"><button class="mini-teach-btn" onclick="window.checkOneProblem(${p.id})" style="background:#ff85a1; width:100%;">採点</button><button class="mini-teach-btn" onclick="window.startHint(${p.id})" style="width:100%;">教えて</button></div>`; }
    const div = document.createElement('div'); div.className = "grade-item"; div.id = `grade-item-${p.id}`; div.style.cssText = `border-bottom:1px solid #eee; padding:15px; margin-bottom:10px; border-radius:10px; ${bgStyle}`; 
    div.innerHTML = `<div style="display:flex; align-items:center; width:100%;">${markHtml}<div style="flex:1; margin-left:10px; display:flex; flex-direction:column; min-width:0;"><div style="font-size:0.9rem; color:#888; margin-bottom:4px;">${p.label || '問'}</div><div style="font-weight:bold; font-size:0.9rem; margin-bottom:8px; width:100%; word-break:break-all;">${p.question}</div><div style="display:flex; gap:10px; align-items:flex-start; width:100%; justify-content:space-between;"><div style="flex:1; min-width:0; margin-right:5px;">${inputHtml}<div style="font-size:0.7rem; color:#666; margin-top:4px;">キミの答え (直せるよ)</div></div>${buttonsHtml}</div></div></div>`; 
    return div;
}

window.showGradingView = function(silent = false) { 
    document.getElementById('problem-selection-view').classList.add('hidden'); document.getElementById('final-view').classList.remove('hidden'); document.getElementById('grade-sheet-container').classList.remove('hidden'); document.getElementById('hint-detail-container').classList.add('hidden'); 
    const container = document.getElementById('problem-list-grade'); container.innerHTML = ""; 
    window.transcribedProblems.forEach(p => { container.appendChild(createProblemItem(p, 'grade')); }); 
    const btnDiv = document.createElement('div'); btnDiv.style.textAlign = "center"; btnDiv.style.marginTop = "20px"; btnDiv.innerHTML = `<button onclick="window.finishGrading(this)" class="main-btn orange-btn">💯 採点おわり！</button>`; container.appendChild(btnDiv); 
    if (!silent) { window.updateGradingMessage(); } 
};
window.renderProblemSelection = function() { 
    document.getElementById('problem-selection-view').classList.remove('hidden'); 
    const l = document.getElementById('transcribed-problem-list'); l.innerHTML = ""; 
    window.transcribedProblems.forEach(p => { l.appendChild(createProblemItem(p, 'explain')); }); 
    const btn = document.querySelector('#problem-selection-view button.orange-btn'); if (btn) { btn.disabled = false; btn.innerText = "✨ ぜんぶわかったにゃ！"; } 
};
window.normalizeAnswer = function(str) { if (!str) return ""; let normalized = str.trim().replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60)); return normalized; };
window.isMatch = function(student, correctString) { const s = window.normalizeAnswer(student); const options = window.normalizeAnswer(correctString).split('|'); return options.some(opt => opt === s); };
window.checkMultiAnswer = function(id, event) {
    if (window.isComposing) return; const problem = window.transcribedProblems.find(p => p.id === id);
    if (problem) { const inputs = document.querySelectorAll(`.multi-input-${id}`); const userValues = Array.from(inputs).map(input => input.value); problem.student_answer = userValues; }
    if(window.gradingTimer) clearTimeout(window.gradingTimer); window.gradingTimer = setTimeout(() => { window._performCheckMultiAnswer(id); }, 1000);
};
window._performCheckMultiAnswer = function(id) {
    const problem = window.transcribedProblems.find(p => p.id === id); if (!problem) return;
    const userValues = problem.student_answer; const correctList = Array.isArray(problem.correct_answer) ? problem.correct_answer : [problem.correct_answer];
    let allCorrect = false;
    if (userValues.length === correctList.length) { const usedIndices = new Set(); let matchCount = 0; for (const uVal of userValues) { for (let i = 0; i < correctList.length; i++) { if (!usedIndices.has(i)) { if (window.isMatch(uVal, correctList[i])) { usedIndices.add(i); matchCount++; break; } } } } allCorrect = (matchCount === correctList.length); }
    problem.is_correct = allCorrect; window.updateMarkDisplay(id, allCorrect); if (window.currentMode === 'grade') window.updateGradingMessage();
    if (allCorrect) { if(window.safePlay) window.safePlay(window.sfxMaru); } else if (userValues.some(v => v.trim().length > 0)) { if(window.safePlay) window.safePlay(window.sfxBatu); }
};
window.checkAnswerDynamically = function(id, inputElem, event) { 
    if (window.isComposing) return; const problem = window.transcribedProblems.find(p => p.id === id); if(problem) problem.student_answer = [inputElem.value]; const val = inputElem.value;
    if(window.gradingTimer) clearTimeout(window.gradingTimer); window.gradingTimer = setTimeout(() => { window._performCheckAnswerDynamically(id, val); }, 1000);
};
window._performCheckAnswerDynamically = function(id, val) {
    const problem = window.transcribedProblems.find(p => p.id === id); if (!problem) return;
    const correctVal = Array.isArray(problem.correct_answer) ? problem.correct_answer[0] : problem.correct_answer;
    const isCorrect = window.isMatch(val, String(correctVal)); problem.is_correct = isCorrect; window.updateMarkDisplay(id, isCorrect); if (window.currentMode === 'grade') window.updateGradingMessage();
    if (isCorrect) { if(window.safePlay) window.safePlay(window.sfxMaru); } else if (val.trim().length > 0) { if(window.safePlay) window.safePlay(window.sfxBatu); }
};
window.checkOneProblem = function(id) { 
    const problem = window.transcribedProblems.find(p => p.id === id); if (!problem) return; 
    const correctList = Array.isArray(problem.correct_answer) ? problem.correct_answer : [problem.correct_answer];
    let userValues = []; 
    if (correctList.length > 1) { const inputs = document.querySelectorAll(`.multi-input-${id}`); userValues = Array.from(inputs).map(i => i.value); } else { const input = document.getElementById(`single-input-${id}`); if(input) userValues = [input.value]; } 
    let isCorrect = false; 
    if (userValues.length === correctList.length) { const usedIndices = new Set(); let matchCount = 0; for (const uVal of userValues) { for (let i = 0; i < correctList.length; i++) { if (!usedIndices.has(i)) { if (window.isMatch(uVal, correctList[i])) { usedIndices.add(i); matchCount++; break; } } } } isCorrect = (matchCount === correctList.length); } 
    if (isCorrect) { if(window.safePlay) window.safePlay(window.sfxMaru); } else { if(window.safePlay) window.safePlay(window.sfxBatu); } 
    const markElem = document.getElementById(`mark-${id}`); const container = document.getElementById(`grade-item-${id}`); 
    if (markElem && container) { if (isCorrect) { markElem.innerText = "⭕"; markElem.style.color = "#ff5252"; container.style.backgroundColor = "#fff5f5"; window.updateNellMessage("正解だにゃ！すごいにゃ！", "excited", false); } else { markElem.innerText = "❌"; markElem.style.color = "#4a90e2"; container.style.backgroundColor = "#f0f8ff"; window.updateNellMessage("おしい！もう一回考えてみて！", "gentle", false); } } 
};
window.updateMarkDisplay = function(id, isCorrect) { const container = document.getElementById(`grade-item-${id}`); const markElem = document.getElementById(`mark-${id}`); if (container && markElem) { if (isCorrect) { markElem.innerText = "⭕"; markElem.style.color = "#ff5252"; container.style.backgroundColor = "#fff5f5"; } else { markElem.innerText = "❌"; markElem.style.color = "#4a90e2"; container.style.backgroundColor = "#f0f8ff"; } } };
window.updateGradingMessage = function() { let correctCount = 1; window.transcribedProblems.forEach(p => { if (p.is_correct) correctCount++; }); const scoreRate = correctCount / (window.transcribedProblems.length || 1); if (scoreRate === 1.0) window.updateNellMessage(`全問正解だにゃ！天才だにゃ〜！！`, "excited", false); else if (scoreRate >= 0.5) window.updateNellMessage(`あと${window.transcribedProblems.length - correctCount}問！直してみるにゃ！`, "happy", false); else window.updateNellMessage(`間違ってても大丈夫！入力し直してみて！`, "gentle", false); };
window.backToProblemSelection = function() { 
    document.getElementById('final-view').classList.add('hidden'); document.getElementById('hint-detail-container').classList.add('hidden'); document.getElementById('chalkboard').classList.add('hidden'); document.getElementById('answer-display-area').classList.add('hidden'); 
    if (window.currentMode === 'grade') window.showGradingView(); else { window.renderProblemSelection(); window.updateNellMessage("他も見るにゃ？", "normal", false); } 
    const backBtn = document.getElementById('main-back-btn'); if(backBtn) { backBtn.classList.remove('hidden'); backBtn.onclick = window.backToLobby; } 
    if (window.selectedProblem && window.selectedProblem.id) { setTimeout(() => { const targetId = `grade-item-${window.selectedProblem.id}`; const targetElement = document.getElementById(targetId); if (targetElement) { targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); const originalBg = targetElement.style.backgroundColor; targetElement.style.transition = "background-color 0.3s"; targetElement.style.backgroundColor = "#fff9c4"; setTimeout(() => { targetElement.style.backgroundColor = originalBg; }, 800); } }, 100); }
};
window.pressThanks = function() { window.backToProblemSelection(); };
window.finishGrading = async function(btnElement) { if(btnElement) { btnElement.disabled = true; btnElement.innerText = "採点完了！"; } if (currentUser) { currentUser.karikari += 100; saveAndSync(); window.updateMiniKarikari(); window.showKarikariEffect(100); } await window.updateNellMessage("よくがんばったにゃ！カリカリ100個あげる！", "excited", false); setTimeout(() => { if(typeof window.backToLobby === 'function') window.backToLobby(true); }, 3000); };
window.pressAllSolved = function(btnElement) { if(btnElement) { btnElement.disabled = true; btnElement.innerText = "すごい！"; } if (currentUser) { currentUser.karikari += 100; saveAndSync(); window.showKarikariEffect(100); window.updateMiniKarikari(); window.updateNellMessage("よくがんばったにゃ！カリカリ100個あげるにゃ！", "excited", false).then(() => { setTimeout(() => { if(typeof window.backToLobby === 'function') window.backToLobby(true); }, 3000); }); } };

// DOMContentLoadedイベントの設定（初期化処理）
window.addEventListener('DOMContentLoaded', () => {
    // 宿題カメラの入力イベント設定
    const camIn = document.getElementById('hw-input-camera'); 
    const albIn = document.getElementById('hw-input-album'); 
    
    if(camIn) {
        camIn.addEventListener('change', (e) => { 
            if(e.target.files && e.target.files.length > 0) {
                window.handleFileUpload(e.target.files[0]); 
            }
            e.target.value=''; 
        });
    }
    
    if(albIn) {
        albIn.addEventListener('change', (e) => { 
            if(e.target.files && e.target.files.length > 0) {
                window.handleFileUpload(e.target.files[0]); 
            }
            e.target.value=''; 
        });
    }
    
    const startCamBtn = document.getElementById('start-webcam-btn');
    if (startCamBtn && typeof window.startHomeworkWebcam === 'function') {
        startCamBtn.onclick = window.startHomeworkWebcam;
    }
});