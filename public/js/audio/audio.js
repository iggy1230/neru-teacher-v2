// --- START OF FILE audio.js ---

// --- js/audio/audio.js (v436.0: APIダウン時の完全フォールバック対応版) ---
window.audioCtx = null;
window.masterGainNode = null; 
window.currentNellAudio = null;
window.isNellSpeaking = false;

window.initAudioContext = async function() {
    try {
        if (!window.audioCtx) {
            window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            window.masterGainNode = window.audioCtx.createGain();
            window.masterGainNode.connect(window.audioCtx.destination);

            const targetVol = (typeof window.isMuted !== 'undefined' && window.isMuted) ? 0 : (window.appVolume || 0.5);
            window.masterGainNode.gain.setValueAtTime(targetVol, window.audioCtx.currentTime);

            window.audioContext = window.audioCtx;
        }
        
        if (window.audioCtx.state === 'suspended') {
            await window.audioCtx.resume();
        }
    } catch(e) {
        console.warn("AudioContext init/resume failed:", e);
    }
};

window.cancelNellSpeech = function() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    if (window.currentNellAudio) {
        window.currentNellAudio.pause();
        window.currentNellAudio.currentTime = 0;
        window.currentNellAudio = null;
    }
    window.isNellSpeaking = false;
};

// ★修正: Promiseを返し、エラー時は自動でブラウザ内蔵TTSに切り替える
window.speakNell = function(text, mood = "normal") {
    return new Promise((resolve) => {
        if (!text || text === "") {
            resolve();
            return;
        }

        window.cancelNellSpeech();

        let cleanText = text;
        cleanText = cleanText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); 
        cleanText = cleanText.replace(/[★☆✨♪！!？?]/g, ''); 
        cleanText = cleanText.replace(/[\(（][^\)）]+[\)）]/g, ''); 

        if (cleanText.trim() === "") {
            resolve();
            return;
        }

        // =====================================
        // フォールバック（APIが死んでいる時の内蔵音声）
        // =====================================
        const playFallbackTTS = () => {
            console.log("APIエラーのため、ブラウザ内蔵音声(TTS)に切り替えますにゃ。");
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const msg = new SpeechSynthesisUtterance(cleanText);
                msg.lang = 'ja-JP';
                msg.rate = 1.2; // 少し早口
                
                msg.onstart = () => { window.isNellSpeaking = true; };
                msg.onend = () => { window.isNellSpeaking = false; resolve(); };
                msg.onerror = () => { window.isNellSpeaking = false; resolve(); };
                
                window.speechSynthesis.speak(msg);
            } else {
                resolve();
            }
        };

        // =====================================
        // メイン処理（ネル先生音声API）
        // =====================================
        const url = `https://iggy1230-neru-sensei.hf.space/speak?text=${encodeURIComponent(cleanText)}`;
        const audio = new Audio(url);
        window.currentNellAudio = audio;

        const vol = (typeof window.isMuted !== 'undefined' && window.isMuted) ? 0 : (window.appVolume || 0.5);
        audio.volume = vol;
        audio.playbackRate = 1.3;

        audio.onplay = () => {
            window.isNellSpeaking = true;
        };

        audio.onended = () => {
            window.isNellSpeaking = false;
            window.currentNellAudio = null;
            resolve();
        };

        audio.onpause = () => {
            window.isNellSpeaking = false;
        };

        // ★エラー発生時は即座にフォールバックへ
        audio.onerror = (e) => {
            console.error("Nell Audio API Error:", e);
            window.isNellSpeaking = false;
            window.currentNellAudio = null;
            playFallbackTTS();
        };

        // ★再生ブロック時や、ソースが見つからない場合もフォールバックへ
        audio.play().catch(e => {
            console.warn("Audio Play Failed / Blocked:", e);
            window.isNellSpeaking = false;
            window.currentNellAudio = null;
            playFallbackTTS();
        });
    });
};

// （互換性維持用）グローバル空間にも関数を露出
if (typeof speakNell === 'undefined') {
    window.speakNell = window.speakNell;
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {};
}