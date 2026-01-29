// --- js/audio/audio.js (完全版 v303.0: Master GainNode導入版) ---

window.audioCtx = null;
window.masterGainNode = null; // 全体の音量制御用
let currentSource = null;
let abortController = null; 

window.isNellSpeaking = false;

window.initAudioContext = async function() {
    try {
        if (!window.audioCtx) {
            window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Master Gain Node 作成
            window.masterGainNode = window.audioCtx.createGain();
            window.masterGainNode.connect(window.audioCtx.destination);
            
            // 初期音量を適用
            const targetVol = window.isMuted ? 0 : (window.appVolume || 0.5);
            window.masterGainNode.gain.setValueAtTime(targetVol, window.audioCtx.currentTime);
        }
        
        if (window.audioCtx.state === 'suspended') {
            await window.audioCtx.resume();
            console.log("AudioContext resumed");
        }
    } catch(e) {
        console.warn("AudioContext init/resume failed:", e);
    }
};

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

    window.cancelNellSpeech();

    abortController = new AbortController();
    const signal = abortController.signal;

    window.isNellSpeaking = false;

    await window.initAudioContext();

    try {
        const timeoutId = setTimeout(() => abortController.abort(), 10000);

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

        const buffer = await window.audioCtx.decodeAudioData(bytes.buffer);
        
        if (signal.aborted) return;

        const source = window.audioCtx.createBufferSource();
        source.buffer = buffer;
        
        // Master Gain Node に接続して音量制御を有効化
        if (window.masterGainNode) {
            source.connect(window.masterGainNode);
        } else {
            source.connect(window.audioCtx.destination);
        }
        
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