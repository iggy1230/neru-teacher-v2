// --- js/audio.js (v301.0: AudioContext分離・安定版) ---

let audioCtx = null;
let currentSource = null;
let abortController = null; 

// ※ ttsGainNodeは voice-service.js 側とは共有せず、ここで独自に生成・破棄します

window.isNellSpeaking = false;

window.initAudioContext = async function() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
            console.log("AudioContext resumed (HTTP)");
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

    // 前の音声を停止
    window.cancelNellSpeech();

    abortController = new AbortController();
    const signal = abortController.signal;

    window.isNellSpeaking = false;

    // AudioContext準備
    await window.initAudioContext();

    try {
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
        
        // ★修正: ローカルなGainNodeを作成して接続 (Context不整合エラーの回避)
        const localGain = audioCtx.createGain();
        const currentVol = window.isMuted ? 0 : (window.appVolume !== undefined ? window.appVolume : 0.5);
        localGain.gain.value = currentVol;

        source.connect(localGain);
        localGain.connect(audioCtx.destination);
        
        currentSource = source;
        
        window.isNellSpeaking = true;
        source.start(0);

        return new Promise(resolve => {
            source.onended = () => {
                if (currentSource === source) {
                    window.isNellSpeaking = false;
                    currentSource = null;
                    // ガベージコレクションのために切断
                    try { source.disconnect(); localGain.disconnect(); } catch(e){}
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