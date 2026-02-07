// --- js/voice-service.js (完全版 v393.0: 会話フリーズ修正版) ---

// ==========================================
// 音声再生・停止
// ==========================================
window.stopAudioPlayback = function() {
    window.liveAudioSources.forEach(source => { try { source.stop(); } catch(e){} });
    window.liveAudioSources = [];
    if (window.audioContext && window.audioContext.state === 'running') window.nextStartTime = window.audioContext.currentTime + 0.05;
    
    // 強制的にフラグを下ろす
    window.isNellSpeaking = false;
    
    if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer);
    if(window.speakingStartTimer) clearTimeout(window.speakingStartTimer);
    if (window.cancelNellSpeech) window.cancelNellSpeech();
};

function shouldInterrupt(text) {
    if (!text) return false;
    const cleanText = text.trim();
    if (cleanText.length === 0) return false;
    
    // 現在のネル先生のセリフを取得（自己発話判定用）
    let currentNellText = "";
    const ids = ['nell-text', 'nell-text-game', 'nell-text-quiz', 'nell-text-riddle', 'nell-text-minitest'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.offsetParent !== null) { 
            currentNellText = el.innerText.replace(/\s+/g, "");
            break; 
        }
    }

    // 自己発話フィルター
    const cleanInput = cleanText.replace(/\s+/g, "");
    if (currentNellText.length > 0 && currentNellText.includes(cleanInput)) {
        console.log(`[Echo Cancel] Self-voice detected: "${cleanInput}"`);
        return false; 
    }

    const stopKeywords = [
        "違う", "ちがう", "待って", "まって", "ストップ", "やめて", "うるさい", "静か", "しずか",
        "ねえ", "ちょっと", "あの", "先生", "せんせい", "あのね", "stop", "wait"
    ];
    
    const isStopCommand = stopKeywords.some(w => cleanText.includes(w));
    
    // 15文字以上の長いフレーズなら割り込み許可
    const isLongEnough = cleanText.length >= 15;
    
    return isStopCommand || isLongEnough;
}

// 自己発話判定（会話送信用）
function isSelfEcho(text) {
    if (!text) return false;
    let currentNellText = "";
    const ids = ['nell-text', 'nell-text-game', 'nell-text-quiz', 'nell-text-riddle', 'nell-text-minitest'];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.offsetParent !== null) { 
            currentNellText = el.innerText.replace(/\s+/g, "");
            break; 
        }
    }
    const cleanInput = text.replace(/\s+/g, "");
    if (currentNellText.length > 0) {
        if (currentNellText.includes(cleanInput) || cleanInput.includes(currentNellText)) {
            return true;
        }
    }
    return false;
}

// ==========================================
// 常時聞き取り (Speech Recognition - PC/Android用)
// ==========================================
window.startAlwaysOnListening = function() {
    if (!('webkitSpeechRecognition' in window)) {
        console.warn("Speech Recognition not supported.");
        // iPhone警告
        if (window.currentMode === 'simple-chat' || window.currentMode === 'explain' || window.currentMode === 'grade' || window.currentMode === 'review') {
             if (!window.isNellSpeaking && !window.iosAlertShown) {
                 window.iosAlertShown = true; 
                 if(typeof window.updateNellMessage === 'function') {
                     window.updateNellMessage("iPhoneの人は、キーボードのマイクボタンを使って話しかけてにゃ！", "normal", false, true);
                 }
             }
        }
        return;
    }

    if (window.continuousRecognition) {
        return;
    }

    window.isAlwaysListening = true;
    window.continuousRecognition = new webkitSpeechRecognition();
    window.continuousRecognition.lang = 'ja-JP';
    window.continuousRecognition.interimResults = true;
    window.continuousRecognition.maxAlternatives = 1;

    window.continuousRecognition.onresult = async (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // PC/Android版: ネル先生が話している最中の処理
        if (window.isNellSpeaking) {
            const textToCheck = finalTranscript || interimTranscript;
            if (shouldInterrupt(textToCheck)) {
                console.log("[Interruption] Stopping audio.");
                if (typeof window.cancelNellSpeech === 'function') window.cancelNellSpeech();
                window.stopAudioPlayback();
            } else {
                return; // 割り込み条件を満たさないなら無視
            }
        }

        if (finalTranscript && finalTranscript.trim() !== "") {
            const text = finalTranscript;
            
            if (isSelfEcho(text)) {
                console.log(`[Ignored] Self-echo detected: ${text}`);
                return;
            }

            console.log(`[User Said] ${text}`);

            // ゲーム等のコマンド処理
            if (window.currentMode === 'quiz' && typeof window.checkQuizAnswer === 'function') {
                if (window.checkQuizAnswer(text)) return;
            }
            if (window.currentMode === 'kanji' && typeof window.checkKanjiReading === 'function') {
                if (window.checkKanjiReading(text)) return;
            }
            if (window.currentMode === 'riddle' && typeof window.checkRiddleAnswer === 'function') {
                if (window.checkRiddleAnswer(text)) return;
            }

            // --- 通常の会話・チャット処理 ---
            let targetId = 'user-speech-text-embedded';
            if (window.currentMode === 'simple-chat') targetId = 'user-speech-text-simple';
            
            const embeddedText = document.getElementById(targetId);
            if (embeddedText) embeddedText.innerText = text;

            if(typeof window.addLogItem === 'function') window.addLogItem('user', text);
            if(typeof window.addToSessionHistory === 'function') window.addToSessionHistory('user', text);

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
            
            let currentQuizData = null, currentRiddleData = null, currentMinitestData = null;
            if (window.currentMode === 'quiz') currentQuizData = window.currentQuiz;
            else if (window.currentMode === 'riddle') currentRiddleData = window.currentRiddle;
            else if (window.currentMode === 'minitest' || window.currentMode === 'kanji') currentMinitestData = window.currentMinitest;

            try {
                window.continuousRecognition.stop(); 
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
                        memoryContext: memoryContext,
                        currentQuizData: currentQuizData,
                        currentRiddleData: currentRiddleData, 
                        currentMinitestData: currentMinitestData
                    })
                });
                if(res.ok) {
                    const data = await res.json();
                    const speechText = data.speech || data.reply || "ごめんにゃ、よくわからなかったにゃ"; 
                    if(typeof window.addLogItem === 'function') window.addLogItem('nell', speechText);
                    if(typeof window.addToSessionHistory === 'function') window.addToSessionHistory('nell', speechText);
                    if(typeof window.updateNellMessage === 'function') await window.updateNellMessage(speechText, "normal", true, true);
                    
                    let boardId = (window.currentMode === 'simple-chat') ? 'chalkboard-simple' : 'embedded-chalkboard';
                    const embedBoard = document.getElementById(boardId);
                    if (embedBoard && data.board && data.board.trim() !== "") {
                        embedBoard.innerText = data.board;
                        embedBoard.classList.remove('hidden');
                    }
                }
            } catch(e) {
                console.error("Chat Error:", e);
            } finally {
                if (window.isAlwaysListening) {
                    try { window.continuousRecognition.start(); } catch(e){}
                }
            }
        }
    };

    window.continuousRecognition.onend = () => {
        if (window.isAlwaysListening) {
            setTimeout(() => { try { window.continuousRecognition.start(); } catch(e){} }, 300);
        } else {
            window.continuousRecognition = null;
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

window.stopAlwaysOnListening = function() {
    window.isAlwaysListening = false;
    if (window.continuousRecognition) {
        try { window.continuousRecognition.stop(); } catch(e){}
        window.continuousRecognition = null;
    }
};

// ==========================================
// リアルタイムチャット (WebSocket - iPhone/Safari用)
// ==========================================

window.stopLiveChat = function() {
    if (window.NellMemory && window.chatTranscript && window.chatTranscript.length > 10 && typeof currentUser !== 'undefined') {
        window.NellMemory.updateProfileFromChat(currentUser.id, window.chatTranscript);
    }
    window.isRecognitionActive = false; 
    window.isLiveChatManuallyStopped = true;

    if (window.connectionTimeout) clearTimeout(window.connectionTimeout); 
    if (window.recognition) try{window.recognition.stop()}catch(e){} 
    if (window.mediaStream) window.mediaStream.getTracks().forEach(t=>t.stop()); 
    if (window.workletNode) { window.workletNode.port.postMessage('stop'); window.workletNode.disconnect(); } 
    if (window.liveSocket) window.liveSocket.close(); 
    if (window.audioContext && window.audioContext.state !== 'closed') window.audioContext.close(); 
    window.audioContext = null;
    window.audioCtx = null; 

    window.isNellSpeaking = false; 
    if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer); 
    if(window.speakingStartTimer) clearTimeout(window.speakingStartTimer); 
    
    const btn = document.getElementById('mic-btn-free');
    if (btn) { 
        btn.innerText = "🎤 おはなしする"; 
        btn.style.background = "#4db6ac"; 
        btn.disabled = false; 
        btn.onclick = () => window.startLiveChat('free');
    }

    window.liveSocket = null; 
    window.activeChatContext = null;
    window.streamTextBuffer = "";
    window.ttsTextBuffer = "";
    
    const camBtnFree = document.getElementById('live-camera-btn-free');
    if (camBtnFree) { camBtnFree.innerHTML = "<span>📷</span> 写真を見せてお話"; camBtnFree.style.backgroundColor = "#009688"; }

    window.isLiveImageSending = false;
    window.isMicMuted = false; 

    const videoFree = document.getElementById('live-chat-video-free');
    if(videoFree) videoFree.srcObject = null;
    document.getElementById('live-chat-video-container-free').style.display = 'none';
};

window.startLiveChat = async function(context = 'main') { 
    if (context === 'main' && window.currentMode === 'chat-free') context = 'free';
    if (context !== 'free') return;

    window.isLiveChatManuallyStopped = false;
    window.activeChatContext = context;
    const btn = document.getElementById('mic-btn-free');
    
    if (window.liveSocket) window.liveSocket.close();
    
    try { 
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("ネル先生を呼んでるにゃ…", "thinking", false); 
        if(btn) btn.disabled = true; 
        
        let memoryContext = "";
        if (window.NellMemory) memoryContext = await window.NellMemory.generateContextString(currentUser.id);
        
        window.chatTranscript = ""; 
        window.streamTextBuffer = "";
        
        if (window.initAudioContext) await window.initAudioContext(); 
        if (!window.audioContext && window.audioCtx) window.audioContext = window.audioCtx;
        else if (!window.audioContext) window.audioContext = new (window.AudioContext || window.webkitAudioContext)(); 
        
        await window.audioContext.resume(); 
        window.nextStartTime = window.audioContext.currentTime; 
        
        const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'; 
        let statusSummary = `${currentUser.name}さんは今、お話しにきたにゃ。カリカリは${currentUser.karikari}個持ってるにゃ。`; 
        
        if (window.currentAddress) statusSummary += ` 現在地は${window.currentAddress}だにゃ。`;
        else if (window.currentLocation) statusSummary += ` 現在地は緯度${window.currentLocation.lat}、経度${window.currentLocation.lon}だにゃ。`;

        let missingInfo = [];
        if (window.NellMemory) {
            try {
                const profile = await window.NellMemory.getUserProfile(currentUser.id);
                if (!profile.birthday) missingInfo.push("誕生日");
                if (!profile.likes || profile.likes.length === 0) missingInfo.push("好きなもの");
                if (!profile.weaknesses || profile.weaknesses.length === 0) missingInfo.push("苦手なもの");
            } catch(e) {}
        }
        if (missingInfo.length > 0) statusSummary += `\n【重要】ユーザーの${missingInfo.join("、")}がまだ分かりません。会話の中で自然に聞いてみてください。`;

        const url = `${wsProto}//${location.host}?grade=${currentUser.grade}&name=${encodeURIComponent(currentUser.name)}&mode=chat-free`; 
        
        window.liveSocket = new WebSocket(url); 
        window.liveSocket.binaryType = "blob"; 
        
        window.connectionTimeout = setTimeout(() => { 
            if (window.liveSocket && window.liveSocket.readyState !== WebSocket.OPEN) { 
                if(typeof window.updateNellMessage === 'function') window.updateNellMessage("なかなかつながらないにゃ…", "thinking", false); 
                window.stopLiveChat(); 
            } 
        }, 10000); 
        
        window.lastSentCollectionImage = null;
        window.isLiveImageSending = false;

        window.liveSocket.onopen = () => { 
            window.liveSocket.send(JSON.stringify({
                type: "init",
                name: currentUser.name,
                grade: currentUser.grade,
                context: statusSummary + "\n" + memoryContext,
                mode: 'chat-free' 
            }));
        }; 
        
        window.liveSocket.onmessage = async (event) => { 
            try { 
                let rawData = event.data;
                if (rawData instanceof Blob) rawData = await rawData.text();
                const data = JSON.parse(rawData);

                if (data.type === "gemini_closed") return;

                if (data.type === "server_ready") {
                    clearTimeout(window.connectionTimeout); 
                    if(btn) { 
                        btn.innerText = "📞 つながった！(終了)"; 
                        btn.style.background = "#ff5252"; 
                        btn.disabled = false; 
                        btn.onclick = () => window.stopLiveChat();
                    } 
                    if(typeof window.updateNellMessage === 'function') window.updateNellMessage("お待たせ！なんでも話してにゃ！", "happy", false, false); 
                    window.startMicrophone(); 
                    return;
                }
                
                if (data.serverContent?.modelTurn?.parts) { 
                    data.serverContent.modelTurn.parts.forEach(p => { 
                        if (p.text) { 
                            window.streamTextBuffer += p.text;
                            if(typeof window.updateNellMessage === 'function') window.updateNellMessage(window.streamTextBuffer, "normal", false, false); 
                        } 
                        if (p.inlineData) window.playLivePcmAudio(p.inlineData.data); 
                    }); 
                }

                if (data.serverContent && data.serverContent.turnComplete) {
                    if(typeof window.saveToNellMemory === 'function') window.saveToNellMemory('nell', window.streamTextBuffer);
                    window.streamTextBuffer = "";
                }
            } catch (e) {} 
        }; 
        
        window.liveSocket.onclose = () => {
            if (!window.isLiveChatManuallyStopped) {
                if(typeof window.updateNellMessage === 'function') window.updateNellMessage("あれ？切れちゃったにゃ。つなぎ直すにゃ！", "thinking", false, false);
                if (window.mediaStream) window.mediaStream.getTracks().forEach(t=>t.stop());
                setTimeout(() => { if (window.currentMode === 'chat-free') window.startLiveChat('free'); }, 1500);
            } else {
                window.stopLiveChat();
            }
        }; 
        
    } catch (e) { 
        console.error("Start Live Chat Error:", e);
        window.stopLiveChat(); 
    } 
};

window.startMicrophone = async function() { 
    try { 
        window.mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { sampleRate: 16000, channelCount: 1 }, 
            video: false 
        }); 
        
        const processorCode = `class PcmProcessor extends AudioWorkletProcessor { constructor() { super(); this.bufferSize = 2048; this.buffer = new Float32Array(this.bufferSize); this.index = 0; } process(inputs, outputs, parameters) { const input = inputs[0]; if (input.length > 0) { const channel = input[0]; for (let i = 0; i < channel.length; i++) { this.buffer[this.index++] = channel[i]; if (this.index >= this.bufferSize) { this.port.postMessage(this.buffer); this.index = 0; } } } return true; } } registerProcessor('pcm-processor', PcmProcessor);`; 
        const blob = new Blob([processorCode], { type: 'application/javascript' }); 
        await window.audioContext.audioWorklet.addModule(URL.createObjectURL(blob)); 
        const source = window.audioContext.createMediaStreamSource(window.mediaStream); 
        window.workletNode = new AudioWorkletNode(window.audioContext, 'pcm-processor'); 
        source.connect(window.workletNode); 
        
        window.workletNode.port.onmessage = (event) => { 
            if (window.isMicMuted) return;
            if (!window.liveSocket || window.liveSocket.readyState !== WebSocket.OPEN) return; 
            
            // ★【iPhone対策】ネル先生が話している最中はデータを送らない (エコーバック防止)
            if (window.isNellSpeaking) {
                // コンソールログで状態確認可能にする
                // console.log("Blocking mic input while speaking");
                return;
            }

            // ノイズゲート処理
            const float32Data = event.data;
            let sum = 0;
            for (let i = 0; i < float32Data.length; i += 4) sum += float32Data[i] * float32Data[i];
            const rms = Math.sqrt(sum / (float32Data.length / 4));
            
            // 閾値（環境に合わせて調整）
            if (rms < 0.005) return; 

            const downsampled = window.downsampleBuffer(event.data, window.audioContext.sampleRate, 16000); 
            window.liveSocket.send(JSON.stringify({ base64Audio: window.arrayBufferToBase64(window.floatTo16BitPCM(downsampled)) })); 
        }; 
    } catch(e) {
        console.warn("Audio/Camera Error:", e);
    } 
};

window.playLivePcmAudio = function(base64) { 
    if (!window.audioContext) window.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const binary = window.atob(base64); 
    const bytes = new Uint8Array(binary.length); 
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); 
    const float32 = new Float32Array(bytes.length / 2); 
    const view = new DataView(bytes.buffer); 
    for (let i = 0; i < float32.length; i++) float32[i] = view.getInt16(i * 2, true) / 32768.0; 
    const buffer = window.audioContext.createBuffer(1, float32.length, 24000); 
    buffer.copyToChannel(float32, 0); 
    const source = window.audioContext.createBufferSource(); 
    source.buffer = buffer; 
    
    if (window.masterGainNode) source.connect(window.masterGainNode);
    else source.connect(window.audioContext.destination);
    
    window.liveAudioSources.push(source);
    
    // ★重要: 再生終了時に確実にフラグを下ろす
    source.onended = () => { 
        window.liveAudioSources = window.liveAudioSources.filter(s => s !== source);
        if (window.liveAudioSources.length === 0) {
            window.isNellSpeaking = false;
        }
    };
    
    const now = window.audioContext.currentTime; 
    if (window.nextStartTime < now) window.nextStartTime = now; 
    source.start(window.nextStartTime); 
    
    // フラグ管理
    const startDelay = (window.nextStartTime - now) * 1000; 
    const duration = buffer.duration * 1000; 
    
    if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer); 
    
    window.speakingStartTimer = setTimeout(() => { window.isNellSpeaking = true; }, startDelay); 
    
    // ★バックアップ: onendedが発火しなかった場合のためのタイマー
    window.stopSpeakingTimer = setTimeout(() => { 
        window.isNellSpeaking = false; 
    }, startDelay + duration + 300); // 余裕を持って+300ms
    
    window.nextStartTime += buffer.duration; 
};

window.floatTo16BitPCM = function(float32Array) { const buffer = new ArrayBuffer(float32Array.length * 2); const view = new DataView(buffer); let offset = 0; for (let i = 0; i < float32Array.length; i++, offset += 2) { let s = Math.max(-1, Math.min(1, float32Array[i])); view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); } return buffer; };
window.downsampleBuffer = function(buffer, sampleRate, outSampleRate) { if (outSampleRate >= sampleRate) return buffer; const ratio = sampleRate / outSampleRate; const newLength = Math.round(buffer.length / ratio); const result = new Float32Array(newLength); let offsetResult = 0, offsetBuffer = 0; while (offsetResult < result.length) { const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio); let accum = 0, count = 0; for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) { accum += buffer[i]; count++; } result[offsetResult] = accum / count; offsetResult++; offsetBuffer = nextOffsetBuffer; } return result; };
window.arrayBufferToBase64 = function(buffer) { let binary = ''; const bytes = new Uint8Array(buffer); for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); } return window.btoa(binary); };