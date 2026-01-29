// --- js/voice-service.js (v306.0: テキストフィルタ分離・カメラ制御版) ---

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
                
                if(typeof window.addLogItem === 'function') window.addLogItem('nell', speechText);
                if(typeof window.addToSessionHistory === 'function') window.addToSessionHistory('nell', speechText);
                
                if(typeof window.updateNellMessage === 'function') {
                    await window.updateNellMessage(speechText, "normal", true, true);
                }
                
                // 黒板表示
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

    const btn = document.getElementById('live-camera-btn-free');
    const videoContainer = document.getElementById('live-chat-video-container-free');
    const videoId = 'live-chat-video-free';

    if (!window.previewStream || !window.previewStream.active) {
        if (window.isAlwaysListening && window.continuousRecognition) {
            try { window.continuousRecognition.stop(); } catch(e){}
        }
        
        window.startPreviewCamera(videoId, 'live-chat-video-container-free').then(() => {
            if (btn) {
                btn.innerHTML = "<span>📸</span> 撮影して送信";
                btn.style.backgroundColor = "#ff5252"; 
            }
        });
        return;
    }
    
    if (window.isLiveImageSending) return; 
    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...");

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
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    const flash = document.createElement('div');
    flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;";
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    if (videoContainer) {
        const oldPreview = document.getElementById('snapshot-preview-overlay');
        if(oldPreview) oldPreview.remove();
        const previewImg = document.createElement('img');
        previewImg.id = 'snapshot-preview-overlay';
        previewImg.src = canvas.toDataURL('image/jpeg', 0.8);
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
        if(typeof window.stopPreviewCamera === 'function') window.stopPreviewCamera(); 
        if (btn) {
             btn.innerHTML = "<span>📷</span> 写真を見せてお話";
             btn.style.backgroundColor = "#009688";
        }
    }, 3000);
    setTimeout(() => { window.ignoreIncomingAudio = false; }, 300);
};

window.captureAndSendLiveImageHttp = async function(context = 'embedded') {
    if (window.isLiveImageSending) return;
    if (window.isAlwaysListening && window.continuousRecognition) { try { window.continuousRecognition.stop(); } catch(e){} }
    
    let videoId, btnId, activeColor;
    if (context === 'embedded') { videoId = 'live-chat-video-embedded'; btnId = 'live-camera-btn-embedded'; activeColor = '#66bb6a'; }
    else if (context === 'simple') { videoId = 'live-chat-video-simple'; btnId = 'live-camera-btn-simple'; activeColor = '#66bb6a'; }

    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.active) return alert("カメラが動いてないにゃ...");
    
    window.isLiveImageSending = true;
    const btn = document.getElementById(btnId);
    if (btn) { btn.innerHTML = "<span>📡</span> 送信中にゃ..."; btn.style.backgroundColor = "#ccc"; }

    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    const flash = document.createElement('div'); flash.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; opacity:0.8; z-index:9999; pointer-events:none; transition:opacity 0.3s;"; document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = 0; setTimeout(() => flash.remove(), 300); }, 50);

    if(typeof window.addLogItem === 'function') window.addLogItem('user', '（画像送信）');

    try {
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("ん？どれどれ…", "thinking", false, true);
        const res = await fetch('/chat-dialogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64Data, text: "この問題を教えてください。", name: currentUser ? currentUser.name : "生徒", history: window.chatSessionHistory }) });
        if (!res.ok) throw new Error("Server response not ok");
        const data = await res.json();
        const speechText = data.speech || data.reply || "教えてあげるにゃ！";
        if(typeof window.addLogItem === 'function') window.addLogItem('nell', speechText);
        if(typeof window.addToSessionHistory === 'function') window.addToSessionHistory('nell', speechText);
        if(typeof window.updateNellMessage === 'function') await window.updateNellMessage(speechText, "happy", true, true);
        let boardId = (context === 'embedded') ? 'embedded-chalkboard' : 'chalkboard-simple';
        const embedBoard = document.getElementById(boardId);
        if (embedBoard && data.board && data.board.trim() !== "") { embedBoard.innerText = data.board; embedBoard.classList.remove('hidden'); }
    } catch(e) {
        console.error("HTTP Image Error:", e);
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("よく見えなかったにゃ…もう一回お願いにゃ！", "thinking", false, true);
    } finally {
        window.isLiveImageSending = false;
        if(typeof window.stopPreviewCamera === 'function') window.stopPreviewCamera(); 
        if (btn) { btn.innerHTML = "<span>📷</span> カメラで見せて質問"; btn.style.backgroundColor = activeColor; }
        if (window.isAlwaysListening) { try { window.continuousRecognition.start(); } catch(e){} }
    }
};

window.stopLiveChat = function() {
    if (window.NellMemory && window.chatTranscript && window.chatTranscript.length > 10) { window.NellMemory.updateProfileFromChat(currentUser.id, window.chatTranscript); }
    window.isRecognitionActive = false; if (window.connectionTimeout) clearTimeout(window.connectionTimeout); if (window.recognition) try{window.recognition.stop()}catch(e){} if (window.mediaStream) window.mediaStream.getTracks().forEach(t=>t.stop()); if (window.workletNode) { window.workletNode.port.postMessage('stop'); window.workletNode.disconnect(); } if (window.liveSocket) window.liveSocket.close(); if (window.audioContext && window.audioContext.state !== 'closed') window.audioContext.close(); window.isNellSpeaking = false; if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer); if(window.speakingStartTimer) clearTimeout(window.speakingStartTimer); 
    if(typeof window.stopPreviewCamera === 'function') window.stopPreviewCamera();
    const btn = document.getElementById('mic-btn-free'); if (btn) { btn.innerText = "🎤 おはなしする"; btn.style.background = "#4db6ac"; btn.disabled = false; btn.onclick = () => window.startLiveChat('free'); }
    window.liveSocket = null; window.activeChatContext = null; window.streamTextBuffer = ""; window.ttsTextBuffer = "";
    const camBtnSimple = document.getElementById('live-camera-btn-simple'); if (camBtnSimple) { camBtnSimple.innerHTML = "<span>📷</span> カメラで見せて質問"; camBtnSimple.style.backgroundColor = "#66bb6a"; }
    const camBtnEmbedded = document.getElementById('live-camera-btn-embedded'); if (camBtnEmbedded) { camBtnEmbedded.innerHTML = "<span>📷</span> カメラで見せて質問"; camBtnEmbedded.style.backgroundColor = "#66bb6a"; }
    const camBtnFree = document.getElementById('live-camera-btn-free'); if (camBtnFree) { camBtnFree.innerHTML = "<span>📷</span> 写真を見せてお話"; camBtnFree.style.backgroundColor = "#009688"; }
    window.isLiveImageSending = false; window.isMicMuted = false; 
    const videoFree = document.getElementById('live-chat-video-free'); if(videoFree) videoFree.srcObject = null; document.getElementById('live-chat-video-container-free').style.display = 'none';
};

window.startLiveChat = async function(context = 'main') { 
    if (context === 'main' && window.currentMode === 'chat-free') context = 'free'; if (context !== 'free') return;
    window.activeChatContext = context; const btnId = 'mic-btn-free'; const btn = document.getElementById(btnId); if (window.liveSocket) { window.stopLiveChat(); return; } 
    try { 
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("ネル先生を呼んでるにゃ…", "thinking", false); 
        if(btn) btn.disabled = true; 
        let memoryContext = ""; if (window.NellMemory) { memoryContext = await window.NellMemory.generateContextString(currentUser.id); }
        window.chatTranscript = ""; window.streamTextBuffer = ""; window.ttsTextBuffer = "";
        if (window.initAudioContext) await window.initAudioContext(); window.audioContext = new (window.AudioContext || window.webkitAudioContext)(); await window.audioContext.resume(); window.nextStartTime = window.audioContext.currentTime; 
        const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'; 
        let statusSummary = `${currentUser.name}さんは今、お話しにきたにゃ。カリカリは${currentUser.karikari}個持ってるにゃ。`; let modeParam = 'chat-free';
        const url = `${wsProto}//${location.host}?grade=${currentUser.grade}&name=${encodeURIComponent(currentUser.name)}&mode=${modeParam}`; 
        window.liveSocket = new WebSocket(url); window.liveSocket.binaryType = "blob"; 
        window.connectionTimeout = setTimeout(() => { if (window.liveSocket && window.liveSocket.readyState !== WebSocket.OPEN) { if(typeof window.updateNellMessage === 'function') window.updateNellMessage("なかなかつながらないにゃ…", "thinking", false); window.stopLiveChat(); } }, 10000); 
        window.lastSentCollectionImage = null; window.isLiveImageSending = false;
        window.liveSocket.onopen = () => { window.liveSocket.send(JSON.stringify({ type: "init", name: currentUser.name, grade: currentUser.grade, context: statusSummary + "\n" + memoryContext, mode: modeParam })); }; 
        window.liveSocket.onmessage = async (event) => { 
            try { 
                let rawData = event.data; if (rawData instanceof Blob) rawData = await rawData.text(); const data = JSON.parse(rawData);
                if (data.type === "server_ready") { clearTimeout(window.connectionTimeout); if(btn) { btn.innerText = "📞 つながった！(終了)"; btn.style.background = "#ff5252"; btn.disabled = false; } if(typeof window.updateNellMessage === 'function') window.updateNellMessage("お待たせ！なんでも話してにゃ！", "happy", false, false); window.isRecognitionActive = true; window.startMicrophone(); return; }
                if (data.serverContent?.modelTurn?.parts) { 
                    data.serverContent.modelTurn.parts.forEach(p => { 
                        if (p.text) { 
                            // ★修正: フィルタリング判定を先に行い、結果に応じてテキスト表示をスキップするが
                            // 音声再生(inlineData)の処理はブロックしないようにする
                            const text = p.text;
                            let isValid = true;

                            if (/^\*\*(Analyzing|Describing|Image|Analysis)/i.test(text)) isValid = false;
                            if (/^(I received an image|The image (shows|depicts|features)|It looks like|This is an image)/i.test(text)) isValid = false;
                            
                            const ignorePatterns = [/^User.*:/i, /^Model.*:/i, /^System.*:/i, /^Instructions?:/i];
                            if (ignorePatterns.some(regex => regex.test(text))) isValid = false;

                            if (/^(\(|\[|【|（).+?(\)|\]|】|）)$/.test(text.trim())) isValid = false;
                            
                            const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
                            const hasEnglishChars = /[a-zA-Z]/.test(text);
                            if (!hasJapanese && hasEnglishChars && text.length > 15) isValid = false;
                            
                            if (isValid) {
                                window.streamTextBuffer += text;
                                if(typeof window.updateNellMessage === 'function') window.updateNellMessage(window.streamTextBuffer, "normal", false, false); 
                            }
                        } 
                        // テキストが不適切でも音声は再生する
                        if (p.inlineData) window.playLivePcmAudio(p.inlineData.data); 
                    }); 
                }
                if (data.serverContent && data.serverContent.turnComplete) { if(typeof window.saveToNellMemory === 'function') window.saveToNellMemory('nell', window.streamTextBuffer); window.streamTextBuffer = ""; }
            } catch (e) {} 
        }; 
        window.liveSocket.onclose = () => window.stopLiveChat(); window.liveSocket.onerror = () => window.stopLiveChat(); 
    } catch (e) { window.stopLiveChat(); } 
};

window.startMicrophone = async function() { 
    try { 
        if ('webkitSpeechRecognition' in window) { 
            window.recognition = new webkitSpeechRecognition(); window.recognition.continuous = true; window.recognition.interimResults = true; window.recognition.lang = 'ja-JP'; 
            window.recognition.onresult = (event) => { 
                let currentText = ""; for (let i = event.resultIndex; i < event.results.length; ++i) { currentText += event.results[i][0].transcript; }
                const cleanText = currentText.trim(); const stopKeywords = ["違う", "ちがう", "待って", "まって", "ストップ", "やめて", "うるさい", "静か", "しずか"];
                if (window.isNellSpeaking && cleanText.length > 0) { const isLongEnough = cleanText.length >= 10; const isStopCommand = stopKeywords.some(w => cleanText.includes(w)); if (isLongEnough || isStopCommand) window.stopAudioPlayback(); }
                for (let i = event.resultIndex; i < event.results.length; ++i) { if (event.results[i].isFinal) { const userText = event.results[i][0].transcript; if(typeof window.saveToNellMemory === 'function') window.saveToNellMemory('user', userText); window.streamTextBuffer = ""; const el = document.getElementById('user-speech-text-free'); if(el) el.innerText = userText; } } 
            }; 
            window.recognition.onend = () => { if (window.isRecognitionActive && window.liveSocket && window.liveSocket.readyState === WebSocket.OPEN) try{window.recognition.start()}catch(e){} }; window.recognition.start(); 
        } 
        window.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 }, video: false }); 
        const processorCode = `class PcmProcessor extends AudioWorkletProcessor { constructor() { super(); this.bufferSize = 2048; this.buffer = new Float32Array(this.bufferSize); this.index = 0; } process(inputs, outputs, parameters) { const input = inputs[0]; if (input.length > 0) { const channel = input[0]; for (let i = 0; i < channel.length; i++) { this.buffer[this.index++] = channel[i]; if (this.index >= this.bufferSize) { this.port.postMessage(this.buffer); this.index = 0; } } } return true; } } registerProcessor('pcm-processor', PcmProcessor);`; 
        const blob = new Blob([processorCode], { type: 'application/javascript' }); await window.audioContext.audioWorklet.addModule(URL.createObjectURL(blob)); 
        const source = window.audioContext.createMediaStreamSource(window.mediaStream); window.workletNode = new AudioWorkletNode(window.audioContext, 'pcm-processor'); source.connect(window.workletNode); 
        window.workletNode.port.onmessage = (event) => { if (window.isMicMuted) return; if (!window.liveSocket || window.liveSocket.readyState !== WebSocket.OPEN) return; const downsampled = window.downsampleBuffer(event.data, window.audioContext.sampleRate, 16000); window.liveSocket.send(JSON.stringify({ base64Audio: window.arrayBufferToBase64(window.floatTo16BitPCM(downsampled)) })); }; 
    } catch(e) { console.warn("Audio/Camera Error:", e); } 
};