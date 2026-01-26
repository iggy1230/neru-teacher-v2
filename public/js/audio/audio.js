// --- audio.js (完全版 v291.0: AudioContext再開処理強化) ---

let audioCtx = null;
let currentSource = null;
let abortController = null; // 通信キャンセル用

// 口パク管理用グローバル変数
window.isNellSpeaking = false;

// 外部から初期化・再開するための関数
window.initAudioContext = async function() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // サスペンド状態なら再開を試みる（ユーザー操作直後に呼ぶ必要がある）
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
            console.log("AudioContext resumed");
        }
    } catch(e) {
        console.warn("AudioContext init/resume failed:", e);
    }
};

// 通常のTTSを強制停止する関数
window.cancelNellSpeech = function() {
    if (currentSource) {
        try { currentSource.stop(); } catch(e) {}
        currentSource = null;
    }
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    window.isNellSpeaking = false;
};

async function speakNell(text, mood = "normal") {
    if (!text || text === "") return;

    // 1. 前の音声を停止
    window.cancelNellSpeech();

    // 2. 新しい通信用コントローラー
    abortController = new AbortController();
    const signal = abortController.signal;

    window.isNellSpeaking = false;

    // AudioContextの準備
    await window.initAudioContext();

    try {
        // タイムアウト設定 (5秒)
        const timeoutId = setTimeout(() => abortController.abort(), 5000);

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

        const binary = window.atob(data.audioContent);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const buffer = await audioCtx.decodeAudioData(bytes.buffer);
        
        if (signal.aborted) return;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        currentSource = source;
        
        window.isNellSpeaking = true;
        source.start(0);

        return new Promise(resolve => {
            source.onended = () => {
                if (currentSource === source) {
                    window.isNellSpeaking = false;
                    currentSource = null;
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
}