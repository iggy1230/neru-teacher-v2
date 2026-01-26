// --- analyze.js (完全版 v291.0: 定数定義修正・安定化版) ---

// ==========================================
// 0. 定数・リソース定義 (最優先)
// ==========================================

const subjectImages = {
    'こくご': { base: 'nell-kokugo.png', talk: 'nell-kokugo-talk.png' },
    'さんすう': { base: 'nell-sansu.png', talk: 'nell-sansu-talk.png' },
    'りか': { base: 'nell-rika.png', talk: 'nell-rika-talk.png' },
    'しゃかい': { base: 'nell-shakai.png', talk: 'nell-shakai-talk.png' },
    'おはなし': { base: 'nell-normal.png', talk: 'nell-talk.png' }
};
const defaultIcon = 'nell-normal.png'; 
const talkIcon = 'nell-talk.png';
const gameHitComments = ["うまいにゃ！", "すごいにゃ！", "さすがにゃ！", "がんばれにゃ！"];

// ==========================================
// 1. グローバル変数・初期化
// ==========================================

window.currentMode = ''; 
window.currentSubject = '';
window.isAnalyzing = false;
window.transcribedProblems = []; 
window.selectedProblem = null; 
window.hintIndex = 0; 
window.lunchCount = 0; 
window.analysisType = 'precision';
window.gradingTimer = null; 
window.isComposing = false;

// 音声・Socket関連変数
let liveSocket = null;
let audioContext = null;
let mediaStream = null;
let workletNode = null;
let stopSpeakingTimer = null;
let speakingStartTimer = null;
let currentTtsSource = null;
let chatTranscript = ""; 
let nextStartTime = 0;
let connectionTimeout = null;
let recognition = null;
let isRecognitionActive = false;
let liveAudioSources = []; 
let ignoreIncomingAudio = false;
let currentLiveAudioSource = null;
window.isLiveImageSending = false;
window.isMicMuted = false;
window.lastSentCollectionImage = null;
let activeChatContext = null; 
let streamTextBuffer = "";
let ttsTextBuffer = "";
let latestDetectedName = null;

// 常時聞き取り用のフラグ
let isAlwaysListening = false;
let continuousRecognition = null;
let wsRecognition = null;

// 履歴用配列の初期化
window.chatSessionHistory = [];

// ゲーム・Cropper関連
let gameCanvas, ctx, ball, paddle, bricks, score, gameRunning = false, gameAnimId = null;
let cropImg = new Image();
let cropPoints = [];
let activeHandle = -1;
let analysisTimers = [];
let homeworkStream = null;

// タイマー関連
let studyTimerValue = 0;
let studyTimerInterval = null;
let studyTimerRunning = false;
let studyTimerCheck = 0; 

// プレビューカメラ用
let previewStream = null;

// 口パクアニメーション開始 (定数定義後に実行)
function startMouthAnimation() {
    let toggle = false;
    setInterval(() => {
        const img = document.getElementById('nell-face') || document.querySelector('.nell-avatar-wrap img');
        if (!img) return;
        
        let baseImg = defaultIcon;
        let talkImg = talkIcon;
        
        if (currentSubject && subjectImages[currentSubject] && 
           (currentMode === 'explain' || currentMode === 'grade' || currentMode === 'review')) {
            baseImg = subjectImages[currentSubject].base;
            talkImg = subjectImages[currentSubject].talk;
        }
        
        if (window.isNellSpeaking) {
            img.src = toggle ? talkImg : baseImg;
        } else {
            // 話していない時はベース画像に戻す（瞬き等のために上書きし続ける）
            if(img.src.includes(talkImg)) img.src = baseImg;
        }
        toggle = !toggle;
    }, 150);
}
// ページ読み込み時に開始
startMouthAnimation();


// ==========================================
// 2. UI操作・モード選択関数
// ==========================================

window.selectMode = function(m) {
    try {
        console.log(`[UI] selectMode called: ${m}`);
        currentMode = m; 
        
        // 履歴をリセット
        window.chatSessionHistory = [];

        // 画面切り替え (ui.jsの関数)
        if (typeof window.switchScreen === 'function') {
            window.switchScreen('screen-main'); 
        } else {
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            document.getElementById('screen-main').classList.remove('hidden');
        }

        // 各種ビューの表示リセット
        const ids = ['subject-selection-view', 'upload-controls', 'thinking-view', 'problem-selection-view', 'final-view', 'chalkboard', 'chat-view', 'simple-chat-view', 'chat-free-view', 'lunch-view', 'grade-sheet-container', 'hint-detail-container', 'embedded-chat-section'];
        ids.forEach(id => { 
            const el = document.getElementById(id); 
            if (el) el.classList.add('hidden'); 
        });
        
        // ログエリア
        const logContainer = document.getElementById('conversation-log');
        if(logContainer) logContainer.classList.add('hidden');
        const logContent = document.getElementById('log-content');
        if(logContent) logContent.innerHTML = "";
        
        // 黒板リセット
        ['embedded-chalkboard', 'chalkboard-simple', 'chalkboard-free'].forEach(bid => {
            const embedBoard = document.getElementById(bid);
            if (embedBoard) {
                embedBoard.innerText = "";
                embedBoard.classList.add('hidden');
            }
        });

        // テキスト入力欄リセット
        ['embedded-text-input', 'simple-text-input', 'free-text-input'].forEach(iid => {
            const embedInput = document.getElementById(iid);
            if(embedInput) embedInput.value = "";
        });

        // 戻るボタン
        const backBtn = document.getElementById('main-back-btn');
        if (backBtn) { backBtn.classList.remove('hidden'); backBtn.onclick = window.backToLobby; }
        
        // モード切り替え時は既存の接続/カメラをクリア
        stopAlwaysOnListening();
        if (typeof window.stopLiveChat === 'function') window.stopLiveChat();
        stopPreviewCamera(); 
        
        gameRunning = false;
        const icon = document.querySelector('.nell-avatar-wrap img'); 
        if(icon) icon.src = defaultIcon; // ここでエラーにならない
        
        const miniKarikari = document.getElementById('mini-karikari-display');
        if(miniKarikari) miniKarikari.classList.remove('hidden');
        if(typeof updateMiniKarikari === 'function') updateMiniKarikari();
        
        // --- モード別表示制御 ---
        if (m === 'chat') { 
            // お宝図鑑モード
            document.getElementById('chat-view').classList.remove('hidden'); 
            window.updateNellMessage("お宝を見せてにゃ！お話もできるにゃ！", "excited", false); 
            if(logContainer) logContainer.classList.remove('hidden');
            startAlwaysOnListening();
        } 
        else if (m === 'simple-chat') {
            // ★ネル先生の個別指導 (HTTPモード)
            document.getElementById('simple-chat-view').classList.remove('hidden');
            window.updateNellMessage("今日はお話だけするにゃ？", "gentle", false);
            if(logContainer) logContainer.classList.remove('hidden');
            startAlwaysOnListening();
        }
        else if (m === 'chat-free') {
            // ★放課後おしゃべりタイム (WebSocketモード)
            document.getElementById('chat-free-view').classList.remove('hidden');
            // カメラは初期状態では非表示
            const vContainer = document.getElementById('live-chat-video-container-free');
            if(vContainer) vContainer.style.display = 'none';
            window.updateNellMessage("何でも話していいにゃ！", "happy", false);
        }
        else if (m === 'lunch') { 
            document.getElementById('lunch-view').classList.remove('hidden'); 
            window.updateNellMessage("お腹ペコペコだにゃ……", "thinking", false); 
        } 
        else if (m === 'review') { 
            renderMistakeSelection(); 
            document.getElementById('embedded-chat-section').classList.remove('hidden'); 
            if(logContainer) logContainer.classList.remove('hidden');
            startAlwaysOnListening();
        } 
        else { 
            const subjectView = document.getElementById('subject-selection-view'); 
            if (subjectView) subjectView.classList.remove('hidden'); 
            window.updateNellMessage("どの教科にするのかにゃ？", "normal", false); 
            if (m === 'explain' || m === 'grade') {
                document.getElementById('embedded-chat-section').classList.remove('hidden');
                if(logContainer) logContainer.classList.remove('hidden');
                startAlwaysOnListening();
            }
        }
    } catch (e) {
        console.error("[UI] selectMode Error:", e);
        alert("エラーが発生したにゃ。再読み込みしてにゃ。");
    }
};

// ==========================================
// 3. 音声認識機能 (HTTPチャット用)
// ==========================================

function startAlwaysOnListening() {
    if (!('webkitSpeechRecognition' in window)) {
        console.warn("Speech Recognition not supported.");
        return;
    }

    if (continuousRecognition) {
        try { continuousRecognition.stop(); } catch(e){}
    }

    isAlwaysListening = true;
    continuousRecognition = new webkitSpeechRecognition();
    continuousRecognition.lang = 'ja-JP';
    continuousRecognition.interimResults = false;
    continuousRecognition.maxAlternatives = 1;

    continuousRecognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        if (!text || text.trim() === "") return;

        // ★割り込み判定
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
        continuousRecognition.stop();
        
        // 音声認識結果を表示（各モード対応）
        let targetId = 'user-speech-text-embedded';
        if (currentMode === 'simple-chat') targetId = 'user-speech-text-simple';
        
        const embeddedText = document.getElementById(targetId);
        if (embeddedText) embeddedText.innerText = text;

        // ログ・履歴に追加
        addLogItem('user', text);
        addToSessionHistory('user', text);

        try {
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
                
                const speechText = data.speech || data.reply || "ごめんにゃ、よくわからなかったにゃ"; 
                addLogItem('nell', speechText);
                addToSessionHistory('nell', speechText);
                
                await window.updateNellMessage(speechText, "normal", true, true);
                
                // 黒板表示
                let boardId = 'embedded-chalkboard';
                if (currentMode === 'simple-chat') boardId = 'chalkboard-simple';
                const embedBoard = document.getElementById(boardId);
                
                if (embedBoard) {
                    if (data.board && data.board.trim() !== "") {
                        embedBoard.innerText = data.board;
                        embedBoard.classList.remove('hidden');
                    }
                }
            }
        } catch(e) {
            console.error("Chat Error:", e);
        } finally {
            if (isAlwaysListening && (currentMode === 'chat' || currentMode === 'explain' || currentMode === 'grade' || currentMode === 'review' || currentMode === 'simple-chat')) {
                try { continuousRecognition.start(); } catch(e){}
            }
        }
    };

    continuousRecognition.onend = () => {
        if (isAlwaysListening && (currentMode === 'chat' || currentMode === 'explain' || currentMode === 'grade' || currentMode === 'review' || currentMode === 'simple-chat') && !window.isNellSpeaking) {
            try { continuousRecognition.start(); } catch(e){}
        }
    };

    continuousRecognition.onerror = (event) => {
        if (isAlwaysListening) {
            setTimeout(() => { try { continuousRecognition.start(); } catch(e){} }, 1000);
        }
    };

    try { continuousRecognition.start(); } catch(e) { console.log("Rec start failed", e); }
}

function stopAlwaysOnListening() {
    isAlwaysListening = false;
    if (continuousRecognition) {
        try { continuousRecognition.stop(); } catch(e){}
        continuousRecognition = null;
    }
}

// ==========================================
// 4. 音声認識機能 (WebSocket用)
// ==========================================

function startWebSocketSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) return;
    stopWebSocketSpeechRecognition();

    wsRecognition = new webkitSpeechRecognition();
    wsRecognition.lang = 'ja-JP';
    wsRecognition.interimResults = true;
    wsRecognition.continuous = true;

    wsRecognition.onresult = (event) => {
        let currentText = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentText += event.results[i][0].transcript;
        }
        
        // 割り込みチェック
        if (window.isNellSpeaking) {
             const stopKeywords = ["違う", "ちがう", "待って", "まって", "ストップ", "やめて", "うるさい", "静か", "しずか"];
             const isStopCommand = stopKeywords.some(w => currentText.includes(w));
             const isLongEnough = currentText.length >= 10;
             if (isLongEnough || isStopCommand) {
                 if(window.stopAudioPlayback) window.stopAudioPlayback();
                 if(isStopCommand) return;
             }
        }

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const finalText = event.results[i][0].transcript;
                
                const el = document.getElementById('user-speech-text-free');
                if(el) el.innerText = finalText;
                
                saveToNellMemory('user', finalText);
                addLogItem('user', finalText);
                
                // WebSocketへトリガー送信
                if(liveSocket && liveSocket.readyState === WebSocket.OPEN) {
                    liveSocket.send(JSON.stringify({ trigger: true }));
                }
            }
        }
    };

    wsRecognition.onend = () => {
        if (isRecognitionActive && liveSocket && liveSocket.readyState === WebSocket.OPEN) {
            try { wsRecognition.start(); } catch(e){}
        }
    };

    try { wsRecognition.start(); } catch(e){}
}

function stopWebSocketSpeechRecognition() {
    if (wsRecognition) {
        try { wsRecognition.stop(); } catch(e){}
        wsRecognition = null;
    }
}

// ==========================================
// 5. 共通ヘルパー (ログ・履歴・メッセージ)
// ==========================================

function addLogItem(role, text) {
    const container = document.getElementById('log-content');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `log-item log-${role}`;
    const name = role === 'user' ? (currentUser ? currentUser.name : 'あなた') : 'ネル先生';
    div.innerHTML = `<span class="log-role">${name}:</span><span>${text}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

window.addToSessionHistory = function(role, text) {
    if (!window.chatSessionHistory) window.chatSessionHistory = []; 
    window.chatSessionHistory.push({ role: role, text: text });
    if (window.chatSessionHistory.length > 10) {
        window.chatSessionHistory.shift();
    }
};

window.updateNellMessage = async function(t, mood = "normal", saveToMemory = false, speak = true) {
    if (liveSocket && liveSocket.readyState === WebSocket.OPEN && currentMode !== 'chat' && currentMode !== 'simple-chat') {
        speak = false; // WebSocket中はTTSしない
    }

    const gameScreen = document.getElementById('screen-game');
    const isGameHidden = gameScreen ? gameScreen.classList.contains('hidden') : true;
    const targetId = isGameHidden ? 'nell-text' : 'nell-text-game';
    const el = document.getElementById(targetId);
    
    let displayText = t.replace(/(?:\[|\【)?DISPLAY[:：]\s*(.+?)(?:\]|\】)?/gi, "");
    if (el) el.innerText = displayText;
    
    if (t && t.includes("もぐもぐ")) { 
        if (window.playSE) window.playSE('boribori.mp3'); 
    }
    
    if (saveToMemory) { saveToNellMemory('nell', t); }
    
    if (speak && typeof speakNell === 'function') {
        let textForSpeech = displayText.replace(/【.*?】/g, "").trim();
        textForSpeech = textForSpeech.replace(/🐾/g, "");
        if (textForSpeech.length > 0) {
            await speakNell(textForSpeech, mood);
        }
    }
};

// ==========================================
// 6. カメラ機能 (プレビュー・HTTP送信共通)
// ==========================================

window.startPreviewCamera = async function(videoId = 'live-chat-video', containerId = 'live-chat-video-container') {
    const video = document.getElementById(videoId);
    const container = document.getElementById(containerId);
    if (!video || !container) return;

    try {
        if (previewStream) {
            previewStream.getTracks().forEach(t => t.stop());
        }
        try {
            previewStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" },
                audio: false 
            });
        } catch(e) {
            previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        video.srcObject = previewStream;
        await video.play();
        container.style.display = 'block';

    } catch (e) {
        console.warn("[Preview] Camera init failed:", e);
        alert("カメラが使えないにゃ…。");
    }
};

window.stopPreviewCamera = function() {
    if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
        previewStream = null;
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

// 汎用テキスト送信
window.sendHttpText = async function(context) {
    let inputId;
    if (context === 'embedded') inputId = 'embedded-text-input';
    else if (context === 'simple') inputId = 'simple-text-input';
    else return;

    const input = document.getElementById(inputId);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    stopAlwaysOnListening(); // 一時停止
    
    addLogItem('user', text);
    addToSessionHistory('user', text);

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
            addLogItem('nell', speechText);
            addToSessionHistory('nell', speechText);
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
        startAlwaysOnListening();
    }
};
window.sendEmbeddedText = function() { sendHttpText('embedded'); }
window.sendSimpleText = function() { sendHttpText('simple'); }

// 汎用カメラトグル
window.toggleHttpCamera = function(context) {
    let videoId, containerId, btnId, activeColor;
    if (context === 'embedded') {
        videoId = 'live-chat-video-embedded'; containerId = 'live-chat-video-container-embedded'; btnId = 'live-camera-btn-embedded'; activeColor = '#66bb6a';
    } else if (context === 'simple') {
        videoId = 'live-chat-video-simple'; containerId = 'live-chat-video-container-simple'; btnId = 'live-camera-btn-simple'; activeColor = '#66bb6a';
    } else return;

    const btn = document.getElementById(btnId);
    
    if (previewStream && previewStream.active) {
        captureAndSendLiveImageHttp(context);
    } else {
        startPreviewCamera(videoId, containerId).then(() => {
            if (btn) {
                btn.innerHTML = "<span>📸</span> 撮影して送信";
                btn.style.backgroundColor = "#ff5252"; 
            }
        });
    }
};
window.toggleEmbeddedCamera = function() { toggleHttpCamera('embedded'); }
window.toggleSimpleCamera = function() { toggleHttpCamera('simple'); }

// 放課後おしゃべりタイム用カメラ
window.toggleFreeCamera = function() {
    const videoId = 'live-chat-video-free';
    const containerId = 'live-chat-video-container-free';
    const btnId = 'live-camera-btn-free';
    const btn = document.getElementById(btnId);
    
    if (previewStream && previewStream.active) {
        captureAndSendLiveImage('free');
    } else {
        startPreviewCamera(videoId, containerId).then(() => {
            if (btn) { btn.innerHTML = "<span>📡</span> 送信中にゃ..."; btn.style.backgroundColor = "#ff5252"; }
        });
    }
};

// お宝カメラ
window.toggleTreasureCamera = function() {
    const videoId = 'live-chat-video';
    const containerId = 'live-chat-video-container';
    const btnId = 'live-camera-btn';
    const btn = document.getElementById(btnId);
    if (previewStream && previewStream.active) {
        captureAndIdentifyItem();
    } else {
        startPreviewCamera(videoId, containerId).then(() => {
            if (btn) { btn.innerHTML = "<span>📸</span> 撮影する"; btn.style.backgroundColor = "#ff5252"; }
        });
    }
};

function createTreasureImage(sourceCanvas) {
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
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 8; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE*0.2, OUTPUT_SIZE*0.2, OUTPUT_SIZE*0.05, 0, Math.PI*2);
    ctx.fill();
    return canvas.toDataURL('image/jpeg', 0.8);
}

// お宝登録処理
window.captureAndIdentifyItem = async function() {
    if (window.isLiveImageSending) return;
    stopAlwaysOnListening();

    const video = document.getElementById('live-chat-video');
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...。");

    window.isLiveImageSending = true;
    const btn = document.getElementById('live-camera-btn');
    if (btn) { btn.innerHTML = "<span>📡</span> 解析中にゃ..."; btn.style.backgroundColor = "#ccc"; btn.disabled = true; }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    const treasureDataUrl = createTreasureImage(canvas);
    
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    try {
        window.updateNellMessage("ん？どれどれ…", "thinking", false, true);
        const res = await fetch('/identify-item', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64Data, name: currentUser ? currentUser.name : "生徒" }) });
        if (!res.ok) throw new Error("Server response not ok");
        const data = await res.json();
        
        if (data.speechText) await window.updateNellMessage(data.speechText, "happy", true, true);
        else if (data.text) await window.updateNellMessage(data.text, "happy", true, true);
        
        if (data.itemName && window.NellMemory) {
            const description = data.description || "（解説はないにゃ）";
            await window.NellMemory.addToCollection(currentUser.id, data.itemName, treasureDataUrl, description);
            
            const notif = document.createElement('div');
            notif.innerText = `📖 図鑑に「${data.itemName}」を登録したにゃ！`;
            notif.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.95); border:4px solid #00bcd4; color:#006064; padding:15px 25px; border-radius:30px; font-weight:900; z-index:10000; animation: popIn 0.5s ease; box-shadow:0 10px 25px rgba(0,0,0,0.3);";
            document.body.appendChild(notif);
            setTimeout(() => notif.remove(), 4000);
            try { if(window.playSE) window.playSE('hirameku.mp3'); } catch(e){}
        }
    } catch (e) {
        console.error("Identify Error:", e);
        window.updateNellMessage("よく見えなかったにゃ…もう一回お願いにゃ！", "thinking", false, true);
    } finally {
        window.isLiveImageSending = false;
        stopPreviewCamera(); 
        if (btn) { btn.innerHTML = "<span>📷</span> お宝を見せる（図鑑登録）"; btn.style.backgroundColor = "#ff85a1"; btn.disabled = false; }
        if(currentMode === 'chat') startAlwaysOnListening();
    }
};

// HTTP画像送信 (個別指導)
async function captureAndSendLiveImageHttp(context = 'embedded') {
    if (window.isLiveImageSending) return;
    stopAlwaysOnListening();
    
    let videoId, btnId, activeColor;
    if (context === 'embedded') { videoId = 'live-chat-video-embedded'; btnId = 'live-camera-btn-embedded'; activeColor = '#66bb6a'; }
    else if (context === 'simple') { videoId = 'live-chat-video-simple'; btnId = 'live-camera-btn-simple'; activeColor = '#66bb6a'; }

    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...");
    
    window.isLiveImageSending = true;
    const btn = document.getElementById(btnId);
    if (btn) { btn.innerHTML = "<span>📡</span> 送信中にゃ..."; btn.style.backgroundColor = "#ccc"; }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);
    
    addLogItem('user', '（画像送信）');

    try {
        window.updateNellMessage("ん？どれどれ…", "thinking", false, true);
        const res = await fetch('/chat-dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data, text: "この問題を教えてください。", name: currentUser ? currentUser.name : "生徒", history: window.chatSessionHistory })
        });
        if (!res.ok) throw new Error("Server response not ok");
        const data = await res.json();
        const speechText = data.speech || data.reply || "教えてあげるにゃ！";
        addLogItem('nell', speechText);
        addToSessionHistory('nell', speechText);
        await window.updateNellMessage(speechText, "happy", true, true);
        
        let boardId = (context === 'embedded') ? 'embedded-chalkboard' : 'chalkboard-simple';
        const embedBoard = document.getElementById(boardId);
        if (embedBoard && data.board && data.board.trim() !== "") {
            embedBoard.innerText = data.board;
            embedBoard.classList.remove('hidden');
        }
    } catch(e) {
        console.error("HTTP Image Error:", e);
        window.updateNellMessage("よく見えなかったにゃ…もう一回お願いにゃ！", "thinking", false, true);
    } finally {
        window.isLiveImageSending = false;
        stopPreviewCamera(); 
        if (btn) { btn.innerHTML = "<span>📷</span> カメラで見せて質問"; btn.style.backgroundColor = activeColor; }
        startAlwaysOnListening();
    }
}

// ==========================================
// 7. WebSocket (Chat-Free)
// ==========================================

function stopWsAudio() {
    if(window.stopAudioPlayback) window.stopAudioPlayback();
    else if(window.cancelNellSpeech) window.cancelNellSpeech();
}

window.stopLiveChat = function() {
    if (window.NellMemory && chatTranscript && chatTranscript.length > 10) {
        window.NellMemory.updateProfileFromChat(currentUser.id, chatTranscript);
    }
    isRecognitionActive = false; 
    stopWebSocketSpeechRecognition();
    
    if (connectionTimeout) clearTimeout(connectionTimeout); 
    if (liveSocket) liveSocket.close(); 
    if (audioContext && audioContext.state !== 'closed') audioContext.close(); 
    window.isNellSpeaking = false; 
    
    const btn = document.getElementById('mic-btn-free');
    if (btn) { btn.innerText = "🎤 おはなしする"; btn.style.background = "#4db6ac"; btn.disabled = false; btn.onclick = () => startLiveChat('free'); }

    liveSocket = null; activeChatContext = null; streamTextBuffer = ""; ttsTextBuffer = "";
    
    const camBtnFree = document.getElementById('live-camera-btn-free');
    if (camBtnFree) { camBtnFree.innerHTML = "<span>📷</span> 写真を見せてお話"; camBtnFree.style.backgroundColor = "#009688"; }

    window.isLiveImageSending = false; window.isMicMuted = false; 
    const videoFree = document.getElementById('live-chat-video-free');
    if(videoFree) videoFree.srcObject = null;
    document.getElementById('live-chat-video-container-free').style.display = 'none';
};

async function startLiveChat(context = 'main') { 
    if (context === 'main' && currentMode === 'chat-free') context = 'free';
    if (context !== 'free') return;
    activeChatContext = context;
    
    const btnId = 'mic-btn-free';
    const btn = document.getElementById(btnId);
    if (liveSocket) { window.stopLiveChat(); return; } 
    
    try { 
        window.updateNellMessage("ネル先生を呼んでるにゃ…", "thinking", false); 
        if(btn) btn.disabled = true; 
        
        let memoryContext = "";
        if (window.NellMemory) memoryContext = await window.NellMemory.generateContextString(currentUser.id);
        
        chatTranscript = ""; streamTextBuffer = ""; ttsTextBuffer = "";
        
        if (window.initAudioContext) audioContext = await window.initAudioContext(); 
        else audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume(); 
        nextStartTime = audioContext.currentTime; 
        
        const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'; 
        let statusSummary = `${currentUser.name}さんは今、お話しにきたにゃ。カリカリは${currentUser.karikari}個持ってるにゃ。`; 
        let modeParam = 'chat-free';
        const url = `${wsProto}//${location.host}?grade=${currentUser.grade}&name=${encodeURIComponent(currentUser.name)}&mode=${modeParam}`; 
        
        liveSocket = new WebSocket(url); 
        liveSocket.binaryType = "blob"; 
        connectionTimeout = setTimeout(() => { if (liveSocket && liveSocket.readyState !== WebSocket.OPEN) { window.updateNellMessage("なかなかつながらないにゃ…", "thinking", false); window.stopLiveChat(); } }, 10000); 
        
        window.lastSentCollectionImage = null;
        window.isLiveImageSending = false;

        liveSocket.onopen = () => { 
            liveSocket.send(JSON.stringify({ type: "init", name: currentUser.name, grade: currentUser.grade, context: statusSummary + "\n" + memoryContext, mode: modeParam }));
        }; 
        
        liveSocket.onmessage = async (event) => { 
            try { 
                let rawData = event.data;
                if (rawData instanceof Blob) rawData = await rawData.text();
                const data = JSON.parse(rawData);

                if (data.type === "server_ready") {
                    clearTimeout(connectionTimeout); 
                    if(btn) { btn.innerText = "📞 つながった！(終了)"; btn.style.background = "#ff5252"; btn.disabled = false; } 
                    window.updateNellMessage("お待たせ！なんでも話してにゃ！", "happy", false, false); 
                    isRecognitionActive = true; 
                    startWebSocketSpeechRecognition();
                    return;
                }
                
                if (data.serverContent?.modelTurn?.parts) { 
                    data.serverContent.modelTurn.parts.forEach(p => { 
                        if (p.text) { 
                            streamTextBuffer += p.text;
                            window.updateNellMessage(streamTextBuffer, "normal", false, false); 
                        } 
                        if (p.inlineData) playLivePcmAudio(p.inlineData.data); 
                    }); 
                }
                if (data.serverContent && data.serverContent.turnComplete) {
                    saveToNellMemory('nell', streamTextBuffer);
                    streamTextBuffer = "";
                }
            } catch (e) {} 
        }; 
        liveSocket.onclose = () => window.stopLiveChat(); 
        liveSocket.onerror = () => window.stopLiveChat(); 
    } catch (e) { window.stopLiveChat(); } 
}

// WebSocket画像送信
window.captureAndSendLiveImage = function(context = 'main') {
    if (context === 'main') {
        if (currentMode === 'chat-free') context = 'free';
        else if (currentMode === 'simple-chat') context = 'simple';
    }
    if (context === 'simple' || context === 'embedded') {
        captureAndSendLiveImageHttp(context);
        return;
    }

    if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return alert("まずは「おはなしする」でネル先生とつながってにゃ！");
    if (window.isLiveImageSending) return; 
    
    const videoId = 'live-chat-video-free';
    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...");

    stopWsAudio();
    ignoreIncomingAudio = true; 
    window.isLiveImageSending = true;
    
    const btn = document.getElementById('live-camera-btn-free');
    if (btn) { btn.innerHTML = "<span>📡</span> 送信中にゃ..."; btn.style.backgroundColor = "#ccc"; }
    window.isMicMuted = true;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const notif = document.createElement('div');
    notif.innerText = `📝 問題を送ったにゃ！`;
    notif.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(255,255,255,0.95); border:4px solid #8bc34a; color:#558b2f; padding:10px 20px; border-radius:30px; font-weight:bold; z-index:10000; animation: popIn 0.5s ease; box-shadow:0 4px 10px rgba(0,0,0,0.2);";
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    const videoContainer = document.getElementById('live-chat-video-container-free');
    if (videoContainer) {
        const oldPreview = document.getElementById('snapshot-preview-overlay'); if(oldPreview) oldPreview.remove();
        const previewImg = document.createElement('img'); previewImg.id = 'snapshot-preview-overlay';
        previewImg.src = canvas.toDataURL('image/jpeg', 0.8);
        previewImg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:10; border:4px solid #ffeb3b; box-sizing:border-box; animation: fadeIn 0.2s;";
        videoContainer.style.position = "relative"; videoContainer.appendChild(previewImg);
        setTimeout(() => { if(previewImg && previewImg.parentNode) previewImg.remove(); }, 3000);
    }

    window.updateNellMessage("ん？どれどれ…", "thinking", false, false);
    if (liveSocket && liveSocket.readyState === WebSocket.OPEN) {
        let promptText = "（ユーザーが画像を見せました）この画像の内容を詳しく教えてください。";
        liveSocket.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [ { text: promptText }, { inlineData: { mime_type: "image/jpeg", data: base64Data } } ] }], turnComplete: true } }));
    }

    setTimeout(() => {
        window.isLiveImageSending = false; window.isMicMuted = false;
        if (btn) { btn.innerHTML = "<span>📷</span> 写真を見せてお話"; btn.style.backgroundColor = "#009688"; }
    }, 3000);
    setTimeout(() => { ignoreIncomingAudio = false; }, 300);
};

// ==========================================
// 8. 共通機能 (宿題・ゲーム・給食・タイマー)
// ==========================================

// 初期化
window.addEventListener('DOMContentLoaded', () => {
    const camIn = document.getElementById('hw-input-camera'); 
    const albIn = document.getElementById('hw-input-album'); 
    if(camIn) camIn.addEventListener('change', (e) => { handleFileUpload(e.target.files[0]); e.target.value=''; });
    if(albIn) albIn.addEventListener('change', (e) => { handleFileUpload(e.target.files[0]); e.target.value=''; });
    const startCamBtn = document.getElementById('start-webcam-btn');
    if (startCamBtn) startCamBtn.onclick = startHomeworkWebcam;
});

async function saveToNellMemory(role, text) {
    if (!currentUser || !currentUser.id) return;
    const trimmed = text.trim();
    if (trimmed.length <= 1) return;
    chatTranscript += `${role === 'user' ? '生徒' : 'ネル'}: ${trimmed}\n`;
    const newItem = { role: role, text: trimmed, time: new Date().toISOString() };
    try {
        const memoryKey = `nell_raw_chat_log_${currentUser.id}`;
        let history = JSON.parse(localStorage.getItem(memoryKey) || '[]');
        if (history.length > 0 && history[history.length - 1].text === trimmed) return;
        history.push(newItem);
        if (history.length > 50) history.shift(); 
        localStorage.setItem(memoryKey, JSON.stringify(history));
    } catch(e) {}
}

window.setSubject = function(s) { 
    currentSubject = s; 
    const icon = document.querySelector('.nell-avatar-wrap img'); if(icon&&subjectImages[s]){icon.src=subjectImages[s].base; icon.onerror=()=>{icon.src=defaultIcon;};} 
    document.getElementById('subject-selection-view').classList.add('hidden'); 
    document.getElementById('upload-controls').classList.remove('hidden'); 
    window.updateNellMessage(`${currentSubject}の問題をみせてにゃ！`, "happy", false); 
    const btnFast = document.getElementById('mode-btn-fast');
    const btnPrec = document.getElementById('mode-btn-precision');
    if (btnFast) { btnFast.innerText = "📷 ネル先生に宿題を見せる"; btnFast.className = "main-btn"; btnFast.style.background = "#ff85a1"; btnFast.style.width = "100%"; btnFast.onclick = null; }
    if (btnPrec) btnPrec.style.display = "none";
};

window.setAnalyzeMode = function(type) { analysisType = 'precision'; };

// タイマー
window.openTimerModal = function() { document.getElementById('timer-modal').classList.remove('hidden'); updateTimerDisplay(); };
window.closeTimerModal = function() { document.getElementById('timer-modal').classList.add('hidden'); };
window.setTimer = function(minutes) { if (studyTimerRunning) return; studyTimerValue += minutes * 60; updateTimerDisplay(); };
window.resetTimer = function() {
    if (studyTimerRunning) { clearInterval(studyTimerInterval); studyTimerRunning = false; document.getElementById('timer-toggle-btn').innerText = "スタート！"; document.getElementById('timer-toggle-btn').className = "main-btn pink-btn"; }
    studyTimerValue = 0; studyTimerCheck = 0; updateTimerDisplay(); document.getElementById('mini-timer-display').classList.add('hidden');
};
window.toggleTimer = function() {
    if (studyTimerRunning) { clearInterval(studyTimerInterval); studyTimerRunning = false; document.getElementById('timer-toggle-btn').innerText = "再開する"; document.getElementById('timer-toggle-btn').className = "main-btn blue-btn"; } 
    else {
        if (studyTimerValue <= 0) return alert("時間をセットしてにゃ！");
        studyTimerRunning = true; studyTimerCheck = 0;
        document.getElementById('timer-toggle-btn').innerText = "一時停止"; document.getElementById('timer-toggle-btn').className = "main-btn gray-btn";
        document.getElementById('mini-timer-display').classList.remove('hidden'); closeTimerModal();
        window.updateNellMessage("今からネル先生が時間を計ってやるにゃ", "normal", false, true);
        studyTimerInterval = setInterval(() => {
            if (studyTimerValue > 0) {
                studyTimerValue--; studyTimerCheck++; updateTimerDisplay();
                if (studyTimerValue === 600) window.updateNellMessage("10分前だにゃ〜。お茶でも飲んで落ち着くにゃ。", "gentle", false, true);
                else if (studyTimerValue === 300) window.updateNellMessage("あと5分。一歩ずつ、一歩ずつだにゃ〜。", "normal", false, true);
                else if (studyTimerValue === 180) window.updateNellMessage("3分前。深呼吸して、もうひと踏ん張りだにゃ。", "excited", false, true);
                else if (studyTimerValue === 60) window.updateNellMessage("あと1分だにゃ。最後までネル先生が見守ってるにゃ。", "excited", false, true);
            } else {
                clearInterval(studyTimerInterval); studyTimerRunning = false;
                document.getElementById('timer-toggle-btn').innerText = "スタート！"; document.getElementById('timer-toggle-btn').className = "main-btn pink-btn";
                try { if(window.playSE) window.playSE('Jpn_sch_chime.mp3'); } catch(e){}
                window.updateNellMessage("時間だにゃ！お疲れ様だにゃ〜。さ、ゆっくり休むにゃ。", "happy", false, true);
                document.getElementById('mini-timer-display').classList.add('hidden'); openTimerModal();
            }
        }, 1000);
    }
};
function updateTimerDisplay() {
    const m = Math.floor(studyTimerValue / 60).toString().padStart(2, '0'); const s = (studyTimerValue % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    const modalDisplay = document.getElementById('modal-timer-display'); if(modalDisplay) modalDisplay.innerText = timeStr;
    const miniDisplay = document.getElementById('mini-timer-text'); if(miniDisplay) miniDisplay.innerText = timeStr;
}

// 宿題カメラ
async function startHomeworkWebcam() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    const shutter = document.getElementById('camera-shutter-btn');
    const cancel = document.getElementById('camera-cancel-btn');
    if (!modal || !video) return;
    try {
        let constraints = { video: { facingMode: "environment" } };
        try { homeworkStream = await navigator.mediaDevices.getUserMedia(constraints); } 
        catch (e) { homeworkStream = await navigator.mediaDevices.getUserMedia({ video: true }); }
        video.srcObject = homeworkStream;
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
                    closeHomeworkCamera();
                    handleFileUpload(file);
                }
            }, 'image/jpeg', 0.9);
        };
        cancel.onclick = closeHomeworkCamera;
    } catch (err) { alert("カメラエラー: " + err.message); closeHomeworkCamera(); }
}
function closeHomeworkCamera() {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    if (homeworkStream) { homeworkStream.getTracks().forEach(t => t.stop()); homeworkStream = null; }
    if (video) video.srcObject = null;
    if (modal) modal.classList.add('hidden');
}

// 給食機能
window.giveLunch = function() { 
    if (currentUser.karikari < 1) return window.updateNellMessage("カリカリがないにゃ……", "thinking", false); 
    window.updateNellMessage("もぐもぐ……", "normal", false); 
    currentUser.karikari--; 
    if(typeof saveAndSync === 'function') saveAndSync(); 
    updateMiniKarikari(); 
    showKarikariEffect(-1); 
    window.lunchCount++; 
    fetch('/lunch-reaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: window.lunchCount, name: currentUser.name }) })
        .then(r => r.json())
        .then(d => { setTimeout(() => { window.updateNellMessage(d.reply || "おいしいにゃ！", d.isSpecial ? "excited" : "happy", true); }, 1500); })
        .catch(e => { setTimeout(() => { window.updateNellMessage("おいしいにゃ！", "happy", false); }, 1500); }); 
};

// ゲーム機能
window.showGame = function() { 
    if(typeof switchScreen === 'function') switchScreen('screen-game'); 
    else document.getElementById('screen-game').classList.remove('hidden');
    
    document.getElementById('mini-karikari-display').classList.remove('hidden'); 
    updateMiniKarikari(); 
    initGame(); 
    fetchGameComment("start"); 
    const startBtn = document.getElementById('start-game-btn'); 
    if (startBtn) { 
        const newBtn = startBtn.cloneNode(true); 
        startBtn.parentNode.replaceChild(newBtn, startBtn); 
        newBtn.onclick = () => { if (!gameRunning) { initGame(); gameRunning = true; newBtn.disabled = true; drawGame(); } }; 
    } 
};
function fetchGameComment(type, score=0) { fetch('/game-reaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name: currentUser.name, score }) }).then(r=>r.json()).then(d=>{ window.updateNellMessage(d.reply, d.mood || "excited", true); }).catch(e=>{}); }

// ゲームロジック
function initGame() {
    gameCanvas = document.getElementById('game-canvas');
    if(!gameCanvas) return;
    ctx = gameCanvas.getContext('2d');
    
    paddle = { x: gameCanvas.width / 2 - 40, y: gameCanvas.height - 30, w: 80, h: 10 };
    ball = { x: gameCanvas.width / 2, y: gameCanvas.height - 40, r: 8, dx: 4, dy: -4 };
    score = 0;
    document.getElementById('game-score').innerText = score;
    
    bricks = [];
    for(let c=0; c<5; c++) {
        for(let r=0; r<4; r++) {
            bricks.push({ x: 30 + c*55, y: 30 + r*30, w: 40, h: 20, status: 1 });
        }
    }
    
    const movePaddle = (e) => {
        const rect = gameCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let relativeX = clientX - rect.left;
        if(relativeX > 0 && relativeX < gameCanvas.width) {
            paddle.x = relativeX - paddle.w/2;
        }
    };
    gameCanvas.onmousemove = movePaddle;
    gameCanvas.ontouchmove = (e) => { e.preventDefault(); movePaddle(e); };
}

function drawGame() {
    if(!gameRunning) return;
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
    ctx.fillStyle = "#ff5722";
    ctx.fill();
    ctx.closePath();
    
    ctx.beginPath();
    ctx.rect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.fillStyle = "#8d6e63";
    ctx.fill();
    ctx.closePath();
    
    ctx.font = "20px serif"; 
    bricks.forEach(b => {
        if(b.status === 1) {
            ctx.fillText("🍖", b.x + 5, b.y + 18);
        }
    });
    
    ball.x += ball.dx;
    ball.y += ball.dy;
    
    if(ball.x + ball.dx > gameCanvas.width - ball.r || ball.x + ball.dx < ball.r) ball.dx = -ball.dx;
    if(ball.y + ball.dy < ball.r) ball.dy = -ball.dy;
    
    if(ball.y + ball.dy > gameCanvas.height - ball.r - 30) {
        if(ball.x > paddle.x && ball.x < paddle.x + paddle.w) {
            ball.dy = -ball.dy;
            try{ if(window.playSE) window.playSE('poka02.mp3'); } catch(e){}
        } else if(ball.y + ball.dy > gameCanvas.height - ball.r) {
            gameRunning = false;
            try{ if(window.playSE) window.playSE('gameover.mp3'); } catch(e){}
            window.updateNellMessage("あ〜あ、落ちちゃったにゃ…", "sad");
            fetchGameComment("end", score);
            const startBtn = document.getElementById('start-game-btn');
            if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
            return;
        }
    }
    
    let allCleared = true;
    bricks.forEach(b => {
        if(b.status === 1) {
            allCleared = false;
            if(ball.x > b.x && ball.x < b.x + b.w && ball.y > b.y && ball.y < b.y + b.h) {
                ball.dy = -ball.dy;
                b.status = 0;
                score += 10;
                document.getElementById('game-score').innerText = score;
                try{ if(window.playSE) window.playSE('cat1c.mp3'); } catch(e){}
                
                if (score % 50 === 0) {
                    const comment = gameHitComments[Math.floor(Math.random() * gameHitComments.length)];
                    window.updateNellMessage(comment, "excited", false, false);
                }
            }
        }
    });
    
    if (allCleared) {
        gameRunning = false;
        window.updateNellMessage("全部取ったにゃ！すごいにゃ！！", "excited");
        currentUser.karikari += 50; 
        saveAndSync();
        updateMiniKarikari();
        showKarikariEffect(50);
        fetchGameComment("end", score);
        const startBtn = document.getElementById('start-game-btn');
        if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
        return;
    }
    
    gameAnimId = requestAnimationFrame(drawGame);
}

// 復元: 復習ノート
window.renderMistakeSelection = function() { 
    if (!currentUser.mistakes || currentUser.mistakes.length === 0) { 
        window.updateNellMessage("ノートは空っぽにゃ！", "happy", false); 
        setTimeout(window.backToLobby, 2000); 
        return; 
    } 
    transcribedProblems = currentUser.mistakes; 
    renderProblemSelection(); 
    window.updateNellMessage("復習するにゃ？", "excited", false); 
};