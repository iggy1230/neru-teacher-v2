// --- js/voice-service.js (v328.0: 記憶コンテキスト連携対応版) ---

// 音声再生の停止
window.stopAudioPlayback = function() {
    window.liveAudioSources.forEach(source => { try { source.stop(); } catch(e){} });
    window.liveAudioSources = [];
    if (window.audioContext && window.audioContext.state === 'running') window.nextStartTime = window.audioContext.currentTime + 0.05;
    window.isNellSpeaking = false;
    if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer);
    if(window.speakingStartTimer) clearTimeout(window.speakingStartTimer);
    if (window.cancelNellSpeech) window.cancelNellSpeech();
};

// 常時聞き取り開始
window.startAlwaysOnListening = function() {
    if (!('webkitSpeechRecognition' in window)) {
        console.warn("Speech Recognition not supported.");
        return;
    }

    if (window.continuousRecognition) {
        try { window.continuousRecognition.stop(); } catch(e){}
    }

    window.isAlwaysListening = true;
    window.continuousRecognition = new webkitSpeechRecognition();
    window.continuousRecognition.lang = 'ja-JP';
    window.continuousRecognition.interimResults = false;
    window.continuousRecognition.maxAlternatives = 1;

    window.continuousRecognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        if (!text || text.trim() === "") return;

        // 割り込み判定
        const stopKeywords = ["違う", "ちがう", "待って", "まって", "ストップ", "やめて", "うるさい", "静か", "しずか"];
        const isStopCommand = stopKeywords.some(w => text.includes(w));
        const isLongEnough = text.length >= 10;

        if (window.isNellSpeaking) {
            if (isLongEnough || isStopCommand) {
                console.log("[Interruption] Stopping audio.");
                if (typeof window.cancelNellSpeech === 'function') window.cancelNellSpeech();
                if (isStopCommand) return; 
            } else {
                return;
            }
        }
        
        console.log(`[User Said] ${text}`);
        window.continuousRecognition.stop();
        
        // 音声認識結果を表示
        let targetId = 'user-speech-text-embedded';
        if (window.currentMode === 'simple-chat') targetId = 'user-speech-text-simple';
        
        const embeddedText = document.getElementById(targetId);
        if (embeddedText) embeddedText.innerText = text;

        if(typeof window.addLogItem === 'function') window.addLogItem('user', text);
        if(typeof window.addToSessionHistory === 'function') window.addToSessionHistory('user', text);

        // ★修正: 記憶データ取得
        let missingInfo = [];
        let memoryContext = "";
        if (window.NellMemory && currentUser) {
            try {
                const profile = await window.NellMemory.getUserProfile(currentUser.id);
                if (!profile.birthday) missingInfo.push("誕生日");
                if (!profile.likes || profile.likes.length === 0) missingInfo.push("好きなもの");
                if (!profile.weaknesses || profile.weaknesses.length === 0) missingInfo.push("苦手なもの");
                memoryContext = await window.NellMemory.generateContextString(currentUser.id);
            } catch(e) {}
        }

        try {
            const res = await fetch('/chat-dialogue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: text, 
                    name: currentUser ? currentUser.name : "生徒",
                    history: window.chatSessionHistory,
                    location: window.currentLocation,
                    address: window.currentAddress,
                    missingInfo: missingInfo,
                    memoryContext: memoryContext // ★送信
                })
            });
            
            if(res.ok) {
                const data = await res.json();
                const speechText = data.speech || data.reply || "ごめんにゃ、よくわからなかったにゃ"; 
                
                if(typeof window.addLogItem === 'function') window.addLogItem('nell', speechText);
                if(typeof window.addToSessionHistory === 'function') window.addToSessionHistory('nell', speechText);
                
                if(typeof window.updateNellMessage === 'function') {
                    await window.updateNellMessage(speechText, "normal", true, true);
                }
                
                let boardId = 'embedded-chalkboard';
                if (window.currentMode === 'simple-chat') boardId = 'chalkboard-simple';
                const embedBoard = document.getElementById(boardId);
                
                if (embedBoard && data.board && data.board.trim() !== "") {
                    embedBoard.innerText = data.board;
                    embedBoard.classList.remove('hidden');
                }
            }
        } catch(e) {
            console.error("Chat Error:", e);
        } finally {
            if (window.isAlwaysListening && (window.currentMode === 'chat' || window.currentMode === 'explain' || window.currentMode === 'grade' || window.currentMode === 'review' || window.currentMode === 'simple-chat')) {
                try { window.continuousRecognition.start(); } catch(e){}
            }
        }
    };

    window.continuousRecognition.onend = () => {
        if (window.isAlwaysListening && (window.currentMode === 'chat' || window.currentMode === 'explain' || window.currentMode === 'grade' || window.currentMode === 'review' || window.currentMode === 'simple-chat') && !window.isNellSpeaking) {
            try { window.continuousRecognition.start(); } catch(e){}
        }
    };

    window.continuousRecognition.onerror = (event) => {
        if (event.error !== 'no-speech') console.error("Rec Error:", event);
        if (window.isAlwaysListening) {
            setTimeout(() => { try { window.continuousRecognition.start(); } catch(e){} }, 1000);
        }
    };

    try { window.continuousRecognition.start(); } catch(e) { console.log("Rec start failed", e); }
};

// 常時聞き取り停止
window.stopAlwaysOnListening = function() {
    window.isAlwaysListening = false;
    if (window.continuousRecognition) {
        try { window.continuousRecognition.stop(); } catch(e){}
        window.continuousRecognition = null;
    }
};

// WebSocketチャット用画像送信
window.captureAndSendLiveImage = function(context = 'main') {
    if (context === 'main') {
        if (window.currentMode === 'chat-free') context = 'free';
        else if (window.activeChatContext === 'embedded') context = 'embedded';
        else if (window.currentMode === 'simple-chat') context = 'simple';
    }
    
    if (context === 'embedded' || context === 'simple') {
        window.captureAndSendLiveImageHttp(context);
        return;
    }

    if (!window.liveSocket || window.liveSocket.readyState !== WebSocket.OPEN) {
        return alert("まずは「おはなしする」でネル先生とつながってにゃ！");
    }
    if (window.isLiveImageSending) return; 
    
    let videoId = 'live-chat-video-free';
    let containerId = 'live-chat-video-container-free';
    const video = document.getElementById(videoId);
    const btn = document.getElementById('live-camera-btn-free');

    // カメラがまだ動いていない場合は起動する（マイク通話中でない場合など）
    if (!video || !video.srcObject || !video.srcObject.active) {
        if (typeof window.startPreviewCamera === 'function') {
            window.startPreviewCamera(videoId, containerId).then(() => {
                if (btn) {
                    btn.innerHTML = "<span>📸</span> 撮影して送信";
                    btn.style.backgroundColor = "#ff5252";
                }
            });
        } else {
            alert("カメラ機能が読み込まれていないにゃ...");
        }
        return;
    }

    window.stopAudioPlayback();
    window.ignoreIncomingAudio = true; 
    window.isLiveImageSending = true;
    
    if (btn) {
        btn.innerHTML = "<span>📡</span> 送信中にゃ...";
        btn.style.backgroundColor = "#ccc";
    }
    window.isMicMuted = true;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // 通知
    const notif = document.createElement('div');
    notif.innerText = `📝 問題を送ったにゃ！`;
    notif.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.95); border:4px solid #8bc34a; color:#558b2f; padding:10px 20px; border-radius:30px; font-weight:bold; z-index:10000; animation: popIn 0.5s ease; box-shadow:0 4px 10px rgba(0,0,0,0.2);";
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
    
    // ★修正: 圧縮処理を通す
    const compressedDataUrl = window.processImageForAI(canvas);
    const base64Data = compressedDataUrl.split(',')[1];
    
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    const videoContainer = document.getElementById('live-chat-video-container-free');
    if (videoContainer) {
        const oldPreview = document.getElementById('snapshot-preview-overlay');
        if(oldPreview) oldPreview.remove();
        const previewImg = document.createElement('img');
        previewImg.id = 'snapshot-preview-overlay';
        previewImg.src = compressedDataUrl;
        previewImg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:10; border:4px solid #ffeb3b; box-sizing:border-box; animation: fadeIn 0.2s;";
        videoContainer.style.position = "relative"; 
        videoContainer.appendChild(previewImg);
        setTimeout(() => { if(previewImg && previewImg.parentNode) previewImg.remove(); }, 3000);
    }

    if(typeof window.updateNellMessage === 'function') window.updateNellMessage("ん？どれどれ…", "thinking", false, false);
    
    if (window.liveSocket && window.liveSocket.readyState === WebSocket.OPEN) {
        let promptText = "（ユーザーが勉強の問題や画像を見せました）この画像の内容を詳しく、子供にもわかるように丁寧に教えてください。図鑑登録は不要です。";
        window.liveSocket.send(JSON.stringify({ 
            clientContent: { 
                turns: [{ role: "user", parts: [ { text: promptText }, { inlineData: { mime_type: "image/jpeg", data: base64Data } } ] }],
                turnComplete: true 
            } 
        }));
    }

    setTimeout(() => {
        window.isLiveImageSending = false;
        window.isMicMuted = false;
        
        if (typeof window.stopPreviewCamera === 'function') {
            window.stopPreviewCamera();
        }
        
        if (btn) {
             btn.innerHTML = "<span>📷</span> 写真を見せてお話";
             btn.style.backgroundColor = "#009688";
        }
    }, 3000);
    setTimeout(() => { window.ignoreIncomingAudio = false; }, 300);
};

// ==========================================
// HTTPチャット用画像送信 (圧縮版)
// ==========================================
window.captureAndSendLiveImageHttp = async function(context = 'embedded') {
    if (window.isLiveImageSending) return;
    
    if (window.isAlwaysListening && window.continuousRecognition) {
        try { window.continuousRecognition.stop(); } catch(e){}
    }
    
    let videoId, btnId, activeColor;
    if (context === 'embedded') { videoId = 'live-chat-video-embedded'; btnId = 'live-camera-btn-embedded'; activeColor = '#66bb6a'; }
    else if (context === 'simple') { videoId = 'live-chat-video-simple'; btnId = 'live-camera-btn-simple'; activeColor = '#66bb6a'; }

    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...");
    
    window.isLiveImageSending = true;
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.innerHTML = "<span>📡</span> 送信中にゃ...";
        btn.style.backgroundColor = "#ccc";
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const compressedDataUrl = window.processImageForAI(canvas);
    const base64Data = compressedDataUrl.split(',')[1];
    
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    if(typeof window.addLogItem === 'function') window.addLogItem('user', '（画像送信）');

    // ★修正: 記憶コンテキスト取得
    let memoryContext = "";
    if (window.NellMemory && currentUser) {
        try {
            memoryContext = await window.NellMemory.generateContextString(currentUser.id);
        } catch(e) {}
    }

    try {
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("ん？どれどれ…", "thinking", false, true);

        const res = await fetch('/chat-dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image: base64Data, 
                text: "この問題を教えてください。",
                name: currentUser ? currentUser.name : "生徒",
                history: window.chatSessionHistory,
                location: window.currentLocation,
                address: window.currentAddress,
                memoryContext: memoryContext // ★送信
            })
        });

        if (!res.ok) throw new Error("Server response not ok");
        const data = await res.json();
        
        const speechText = data.speech || data.reply || "教えてあげるにゃ！";
        
        if(typeof window.addLogItem === 'function') window.addLogItem('nell', speechText);
        if(typeof window.addToSessionHistory === 'function') window.addToSessionHistory('nell', speechText);
        
        if(typeof window.updateNellMessage === 'function') await window.updateNellMessage(speechText, "happy", true, true);
        
        let boardId = (context === 'embedded') ? 'embedded-chalkboard' : 'chalkboard-simple';
        const embedBoard = document.getElementById(boardId);
        if (embedBoard && data.board && data.board.trim() !== "") {
            embedBoard.innerText = data.board;
            embedBoard.classList.remove('hidden');
        }

    } catch(e) {
        console.error("HTTP Image Error:", e);
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("よく見えなかったにゃ…もう一回お願いにゃ！", "thinking", false, true);
    } finally {
        window.isLiveImageSending = false;
        
        if(typeof window.stopPreviewCamera === 'function') window.stopPreviewCamera(); 
        if (btn) {
            btn.innerHTML = "<span>📷</span> カメラで見せて質問";
            btn.style.backgroundColor = activeColor;
        }
        
        if (window.isAlwaysListening) {
             try { window.continuousRecognition.start(); } catch(e){}
        }
    }
};