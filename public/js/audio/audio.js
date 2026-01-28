// --- js/audio.js (完全版 v302.0: AudioContext同期修正版) ---

// グローバルな window.audioContext を正として扱うため、
// ファイルスコープの audioCtx 変数は廃止します。
let currentSource = null;
let abortController = null; 
// window.ttsGainNode はグローバルで共有

window.isNellSpeaking = false;

window.initAudioContext = async function() {
    try {
        // window.audioContext がなければ作成、あればそれを使う
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // GainNode がなければ、現在の Context に紐づけて作成
        // (voice-service.js で Context がリセットされた場合、GainNode も作り直す必要があるためチェック)
        if (!window.ttsGainNode || window.ttsGainNode.context !== window.audioContext) {
            window.ttsGainNode = window.audioContext.createGain();
            window.ttsGainNode.connect(window.audioContext.destination);
            
            // 現在の音量を適用
            const targetVol = window.isMuted ? 0 : (window.appVolume || 0.5);
            window.ttsGainNode.gain.value = targetVol;
        }
        
        if (window.audioContext.state === 'suspended') {
            await window.audioContext.resume();
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

    // 最新のコンテキストを準備
    await window.initAudioContext();
    const ctx = window.audioContext; // 最新のコンテキストを取得

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

        // 必ず最新の ctx でデコードする
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        
        if (signal.aborted) return;

        // 必ず最新の ctx でソースを作成する
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        // GainNodeを経由して接続
        // エラー回避: Source と GainNode のコンテキストが一致しているか確認
        if (window.ttsGainNode && window.ttsGainNode.context === ctx) {
            source.connect(window.ttsGainNode);
            // 再生直前にも念のため音量同期
            const currentVol = window.isMuted ? 0 : (window.appVolume || 0.5);
            window.ttsGainNode.gain.setValueAtTime(currentVol, ctx.currentTime);
        } else {
            // もしコンテキストが一致しない場合は、安全策として destination に直結
            // (通常 initAudioContext で同期されるためここは通らないはずだが、念のため)
            console.warn("TTS GainNode context mismatch. Connecting to destination directly.");
            source.connect(ctx.destination);
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