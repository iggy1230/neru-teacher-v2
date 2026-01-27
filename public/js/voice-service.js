// --- js/voice-service.js ---
// 音声認識、WebSocket通信、TTS再生、音声再生ヘルパーを集約

// ==========================================
// 1. 音声再生ヘルパー
// ==========================================
window.safePlay = function(audioObj) {
    if (!audioObj) return Promise.resolve();
    try {
        audioObj.currentTime = 0;
        const playPromise = audioObj.play();
        if (playPromise !== undefined) {
            return playPromise.catch(error => {
                // ブラウザの自動再生ポリシー等でブロックされた場合はログのみ出力
                console.warn("Audio play failed (ignored):", error);
            });
        }
    } catch (e) { console.warn("Audio error:", e); }
    return Promise.resolve();
};

// AudioContextの初期化・再開ヘルパー
window.ensureAudioContext = async function() {
    try {
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (window.audioContext.state === 'suspended') {
            await window.audioContext.resume();
            console.log("AudioContext resumed");
        }
    } catch(e) {
        console.warn("AudioContext init/resume failed:", e);
    }
};

// ==========================================
// 2. TTS (Text-to-Speech) 再生機能
// ==========================================
let abortController = null; // 通信キャンセル用

// 読み上げ停止
window.cancelNellSpeech = function() {
    if (window.currentTtsSource) {
        try { window.currentTtsSource.stop(); } catch(e) {}
        window.currentTtsSource = null;
    }
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    window.isNellSpeaking = false;
};

// ネル先生の声を生成して再生 (HTTPモード用)
window.speakNell = async function(text, mood = "normal") {
    if (!text || text === "") return;

    // 前の音声を停止
    window.cancelNellSpeech();

    // 新しい通信用コントローラー
    abortController = new AbortController();
    const signal = abortController.signal;

    window.isNellSpeaking = false;

    // AudioContextの準備
    await window.ensureAudioContext();

    try {
        // 5秒のタイムアウトを設定
        const timeoutId = setTimeout(() => {
            if(abortController) abortController.abort();
        }, 5000);

        const res = await fetch('/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, mood }),
            signal: signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`TTS Error: ${res.status}`);
        const data = await res.json();
        
        if (signal.aborted) return;

        // Base64デコード
        const binary = window.atob(data.audioContent);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const buffer = await window.audioContext.decodeAudioData(bytes.buffer);
        
        if (signal.aborted) return;

        // 再生設定
        const source = window.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(window.audioContext.destination);
        window.currentTtsSource = source;
        
        window.isNellSpeaking = true;
        source.start(0);

        return new Promise(resolve => {
            source.onended = () => {
                if (window.currentTtsSource === source) {
                    window.isNellSpeaking = false;
                    window.currentTtsSource = null;
                }
                resolve();
            };
        });

    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error("Audio Playback Error:", e);
        }
        window.isNellSpeaking = false;
    }
};

// ==========================================
// 3. 常時聞き取り (HTTPモード用)
// ==========================================

// 認識結果のハンドリング (analyze.jsからロジック移動)
async function handleSpeechResult(text) {
    if (!text || text.trim() === "") return;

    // 割り込み判定
    const stopKeywords = ["違う", "ちがう", "待って", "まって", "ストップ", "やめて", "うるさい", "静か", "しずか"];
    const isStopCommand = stopKeywords.some(w => text.includes(w));
    const isLongEnough = text.length >= 10;

    if (window.isNellSpeaking) {
        if (isLongEnough || isStopCommand) {
            console.log("[Interruption] Stopping audio.");
            window.cancelNellSpeech();
            if (isStopCommand) return; 
        } else {
            return;
        }
    }
    
    console.log(`[User Said] ${text}`);
    
    // 一時停止
    window.stopAlwaysOnListening();
    
    // UI反映 (main.js側の要素IDに依存)
    let targetId = 'user-speech-text-embedded';
    if (window.currentMode === 'simple-chat') targetId = 'user-speech-text-simple';
    const embeddedText = document.getElementById(targetId);
    if (embeddedText) embeddedText.innerText = text;

    // ログ・履歴への追加は main.js 側の関数を利用するか、ここで処理するか
    // 依存関係を減らすため、一旦ここでも簡易的なログ処理を行うか、
    // グローバルの addLogItem が main.js で定義されていることを期待する
    if (typeof window.addLogItem === 'function') window.addLogItem('user', text);
    if (typeof window.addToSessionHistory === 'function') window.addToSessionHistory('user', text);

    try {
        // AIへの問い合わせ
        await window.updateNellMessage("ん？どれどれ…", "thinking", false, true);

        const res = await fetch('/chat-dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: text, 
                name: window.currentUser ? window.currentUser.name : "生徒",
                history: window.chatSessionHistory 
            })
        });
        
        if(res.ok) {
            const data = await res.json();
            const speechText = data.speech || data.reply || "ごめんにゃ、よくわからなかったにゃ"; 
            
            if (typeof window.addLogItem === 'function') window.addLogItem('nell', speechText);
            if (typeof window.addToSessionHistory === 'function') window.addToSessionHistory('nell', speechText);
            
            await window.updateNellMessage(speechText, "normal", true, true);
            
            // 黒板表示
            let boardId = 'embedded-chalkboard';
            if (window.currentMode === 'simple-chat') boardId = 'chalkboard-simple';
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
        window.updateNellMessage("ごめん、エラーが出ちゃったにゃ。", "thinking", false, true);
    } finally {
        // 再開条件
        const activeModes = ['chat', 'explain', 'grade', 'review', 'simple-chat'];
        if (activeModes.includes(window.currentMode)) {
            window.startAlwaysOnListening();
        }
    }
}

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

    window.continuousRecognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        handleSpeechResult(text);
    };

    window.continuousRecognition.onend = () => {
        if (window.isAlwaysListening && !window.isNellSpeaking) {
            try { window.continuousRecognition.start(); } catch(e){}
        }
    };

    window.continuousRecognition.onerror = (event) => {
        if (event.error !== 'no-speech') console.error("Rec Error:", event);
        if (window.isAlwaysListening) {
            setTimeout(() => {
                try { window.continuousRecognition.start(); } catch(e){}
            }, 1000);
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
// 4. WebSocket リアルタイム対話 (chat-free用)
// ==========================================

// 音声再生停止 (Realtime用)
function stopLiveAudioPlayback() {
    window.liveAudioSources.forEach(source => { try { source.stop(); } catch(e){} });
    window.liveAudioSources = [];
    if (window.audioContext && window.audioContext.state === 'running') {
        window.nextStartTime = window.audioContext.currentTime + 0.05;
    }
    window.isNellSpeaking = false;
    if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer);
    if(window.speakingStartTimer) clearTimeout(window.speakingStartTimer);
    window.cancelNellSpeech();
}

window.stopLiveChat = function() {
    if (window.NellMemory && window.chatTranscript && window.chatTranscript.length > 10) {
        window.NellMemory.updateProfileFromChat(window.currentUser.id, window.chatTranscript);
    }
    window.isRecognitionActive = false; 
    if (window.connectionTimeout) clearTimeout(window.connectionTimeout); 
    if (window.recognition) try{window.recognition.stop()}catch(e){} 
    if (window.mediaStream) window.mediaStream.getTracks().forEach(t=>t.stop()); 
    if (window.workletNode) { window.workletNode.port.postMessage('stop'); window.workletNode.disconnect(); } 
    if (window.liveSocket) window.liveSocket.close(); 
    if (window.audioContext && window.audioContext.state !== 'closed') window.audioContext.close(); 
    
    window.isNellSpeaking = false; 
    if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer); 
    if(window.speakingStartTimer) clearTimeout(window.speakingStartTimer); 
    
    // UIリセット
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
    
    // カメラ関連リセット
    const camBtnFree = document.getElementById('live-camera-btn-free');
    if (camBtnFree) { 
        camBtnFree.innerHTML = "<span>📷</span> 写真を見せてお話"; 
        camBtnFree.style.backgroundColor = "#009688"; 
    }
    window.isLiveImageSending = false;
    window.isMicMuted = false; 
    const videoFree = document.getElementById('live-chat-video-free');
    if(videoFree) videoFree.srcObject = null;
    const container = document.getElementById('live-chat-video-container-free');
    if(container) container.style.display = 'none';
};

window.startLiveChat = async function(context = 'main') { 
    if (context === 'main' && window.currentMode === 'chat-free') context = 'free';
    if (context !== 'free') return;

    window.activeChatContext = context;
    const btn = document.getElementById('mic-btn-free');
    if (window.liveSocket) { window.stopLiveChat(); return; } 
    
    try { 
        window.updateNellMessage("ネル先生を呼んでるにゃ…", "thinking", false); 
        if(btn) btn.disabled = true; 
        
        let memoryContext = "";
        if (window.NellMemory && window.currentUser) {
            memoryContext = await window.NellMemory.generateContextString(window.currentUser.id);
        }
        
        window.chatTranscript = ""; 
        window.streamTextBuffer = "";
        
        await window.ensureAudioContext();
        window.nextStartTime = window.audioContext.currentTime; 
        
        const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'; 
        const uName = window.currentUser ? window.currentUser.name : "生徒";
        const uGrade = window.currentUser ? window.currentUser.grade : "1";
        const uKarikari = window.currentUser ? window.currentUser.karikari : 0;
        
        let statusSummary = `${uName}さんは今、お話しにきたにゃ。カリカリは${uKarikari}個持ってるにゃ。`; 
        let modeParam = 'chat-free';

        const url = `${wsProto}//${location.host}?grade=${uGrade}&name=${encodeURIComponent(uName)}&mode=${modeParam}`; 
        
        window.liveSocket = new WebSocket(url); 
        window.liveSocket.binaryType = "blob"; 
        
        window.connectionTimeout = setTimeout(() => { 
            if (window.liveSocket && window.liveSocket.readyState !== WebSocket.OPEN) { 
                window.updateNellMessage("なかなかつながらないにゃ…", "thinking", false); 
                window.stopLiveChat(); 
            } 
        }, 10000); 
        
        window.isLiveImageSending = false;

        window.liveSocket.onopen = () => { 
            window.liveSocket.send(JSON.stringify({
                type: "init",
                name: uName,
                grade: uGrade,
                context: statusSummary + "\n" + memoryContext,
                mode: modeParam 
            }));
        }; 
        
        window.liveSocket.onmessage = async (event) => { 
            try { 
                let rawData = event.data;
                if (rawData instanceof Blob) rawData = await rawData.text();
                const data = JSON.parse(rawData);

                if (data.type === "server_ready") {
                    clearTimeout(window.connectionTimeout); 
                    if(btn) { 
                        btn.innerText = "📞 つながった！(終了)"; 
                        btn.style.background = "#ff5252"; 
                        btn.disabled = false; 
                    } 
                    window.updateNellMessage("お待たせ！なんでも話してにゃ！", "happy", false, false); 
                    window.isRecognitionActive = true; 
                    startMicrophoneForWebSocket(); // マイク開始
                    return;
                }
                
                if (data.serverContent?.modelTurn?.parts) { 
                    data.serverContent.modelTurn.parts.forEach(p => { 
                        if (p.text) { 
                            window.streamTextBuffer += p.text;
                            window.updateNellMessage(window.streamTextBuffer, "normal", false, false); 
                        } 
                        if (p.inlineData) playLivePcmAudio(p.inlineData.data); 
                    }); 
                }

                if (data.serverContent && data.serverContent.turnComplete) {
                    // 発言完了時の処理（記憶への保存など）
                    if (typeof saveToNellMemory === 'function') saveToNellMemory('nell', window.streamTextBuffer);
                    window.streamTextBuffer = "";
                }
            } catch (e) {} 
        }; 
        window.liveSocket.onclose = () => window.stopLiveChat(); 
        window.liveSocket.onerror = () => window.stopLiveChat(); 
    } catch (e) { window.stopLiveChat(); } 
};

// WebSocket用マイク入力処理
async function startMicrophoneForWebSocket() { 
    try { 
        // ブラウザ標準の音声認識（テキスト化用）
        if ('webkitSpeechRecognition' in window) { 
            window.recognition = new webkitSpeechRecognition(); 
            window.recognition.continuous = true; 
            window.recognition.interimResults = true; 
            window.recognition.lang = 'ja-JP'; 
            
            window.recognition.onresult = (event) => { 
                let currentText = "";
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    currentText += event.results[i][0].transcript;
                }
                const cleanText = currentText.trim();
                const stopKeywords = ["違う", "ちがう", "待って", "まって", "ストップ", "やめて", "うるさい", "静か", "しずか"];
                
                if (window.isNellSpeaking && cleanText.length > 0) {
                    const isLongEnough = cleanText.length >= 10;
                    const isStopCommand = stopKeywords.some(w => cleanText.includes(w));
                    if (isLongEnough || isStopCommand) stopLiveAudioPlayback();
                }

                // 確定結果の処理
                for (let i = event.resultIndex; i < event.results.length; ++i) { 
                    if (event.results[i].isFinal) { 
                        const userText = event.results[i][0].transcript;
                        if(typeof saveToNellMemory === 'function') saveToNellMemory('user', userText); 
                        window.streamTextBuffer = ""; 
                        const el = document.getElementById('user-speech-text-free'); 
                        if(el) el.innerText = userText; 
                    }
                } 
            }; 
            window.recognition.onend = () => { 
                if (window.isRecognitionActive && window.liveSocket && window.liveSocket.readyState === WebSocket.OPEN) {
                    try{window.recognition.start()}catch(e){} 
                }
            }; 
            window.recognition.start(); 
        } 
        
        // 音声データ送信用 (AudioWorklet)
        const useVideo = true;
        window.mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { sampleRate: 16000, channelCount: 1 }, 
            video: useVideo ? { facingMode: "environment" } : false 
        }); 
        
        if (useVideo) {
            const video = document.getElementById('live-chat-video-free');
            if (video) {
                video.srcObject = window.mediaStream;
                video.play();
                const container = document.getElementById('live-chat-video-container-free');
                if(container) container.style.display = 'block';
            }
        }

        const processorCode = `class PcmProcessor extends AudioWorkletProcessor { constructor() { super(); this.bufferSize = 2048; this.buffer = new Float32Array(this.bufferSize); this.index = 0; } process(inputs, outputs, parameters) { const input = inputs[0]; if (input.length > 0) { const channel = input[0]; for (let i = 0; i < channel.length; i++) { this.buffer[this.index++] = channel[i]; if (this.index >= this.bufferSize) { this.port.postMessage(this.buffer); this.index = 0; } } } return true; } } registerProcessor('pcm-processor', PcmProcessor);`; 
        const blob = new Blob([processorCode], { type: 'application/javascript' }); 
        await window.audioContext.audioWorklet.addModule(URL.createObjectURL(blob)); 
        
        const source = window.audioContext.createMediaStreamSource(window.mediaStream); 
        window.workletNode = new AudioWorkletNode(window.audioContext, 'pcm-processor'); 
        source.connect(window.workletNode); 
        
        window.workletNode.port.onmessage = (event) => { 
            if (window.isMicMuted) return;
            if (!window.liveSocket || window.liveSocket.readyState !== WebSocket.OPEN) return; 
            const downsampled = downsampleBuffer(event.data, window.audioContext.sampleRate, 16000); 
            window.liveSocket.send(JSON.stringify({ base64Audio: arrayBufferToBase64(floatTo16BitPCM(downsampled)) })); 
        }; 
    } catch(e) {
        console.warn("Audio/Camera Error:", e);
    } 
}

// リアルタイム音声再生 (PCM)
function playLivePcmAudio(base64) { 
    if (!window.audioContext || window.ignoreIncomingAudio) return; 
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
    source.connect(window.audioContext.destination); 
    
    window.liveAudioSources.push(source);
    source.onended = () => { window.liveAudioSources = window.liveAudioSources.filter(s => s !== source); };
    
    const now = window.audioContext.currentTime; 
    if (window.nextStartTime < now) window.nextStartTime = now; 
    source.start(window.nextStartTime); 
    
    const startDelay = (window.nextStartTime - now) * 1000; 
    const duration = buffer.duration * 1000; 
    
    if(window.stopSpeakingTimer) clearTimeout(window.stopSpeakingTimer); 
    window.speakingStartTimer = setTimeout(() => { window.isNellSpeaking = true; }, startDelay); 
    window.stopSpeakingTimer = setTimeout(() => { window.isNellSpeaking = false; }, startDelay + duration + 100); 
    
    window.nextStartTime += buffer.duration; 
}

// 音声処理ユーティリティ
function floatTo16BitPCM(float32Array) { const buffer = new ArrayBuffer(float32Array.length * 2); const view = new DataView(buffer); let offset = 0; for (let i = 0; i < float32Array.length; i++, offset += 2) { let s = Math.max(-1, Math.min(1, float32Array[i])); view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); } return buffer; }
function downsampleBuffer(buffer, sampleRate, outSampleRate) { if (outSampleRate >= sampleRate) return buffer; const ratio = sampleRate / outSampleRate; const newLength = Math.round(buffer.length / ratio); const result = new Float32Array(newLength); let offsetResult = 0, offsetBuffer = 0; while (offsetResult < result.length) { const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio); let accum = 0, count = 0; for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) { accum += buffer[i]; count++; } result[offsetResult] = accum / count; offsetResult++; offsetBuffer = nextOffsetBuffer; } return result; }
function arrayBufferToBase64(buffer) { let binary = ''; const bytes = new Uint8Array(buffer); for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); } return window.btoa(binary); }

console.log("✅ voice-service.js loaded.");