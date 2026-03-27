// --- START OF FILE audio.js ---

// --- js/audio/audio.js (v438.0: Google API裏ルート 高速安定版) ---
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

// ★修正: Google APIの裏ルート（gtx）を使用してブロックを回避する
window.speakNell = function(text, mood = "normal") {
    return new Promise((resolve) => {
        if (!text || text === "") {
            resolve();
            return;
        }

        window.cancelNellSpeech();

        let cleanText = text;
        // 読み上げエラーの原因になる絵文字や記号を削除
        cleanText = cleanText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); 
        cleanText = cleanText.replace(/[★☆✨♪！!？?]/g, ''); 
        cleanText = cleanText.replace(/[\(（][^\)）]+[\)）]/g, ''); 

        // Google TTS APIは一度に200文字程度が限界のため、長すぎる場合は内蔵音声に逃がす
        if (cleanText.trim() === "") {
            resolve();
            return;
        }
        if (cleanText.length > 200) {
            playFallbackTTS(cleanText, resolve);
            return;
        }

        // ----------------------------------------------------
        // Google TTS API (裏ルート: client=gtx)
        // ブロックされずに爆速で返ってきます
        // ----------------------------------------------------
        const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=ja&q=${encodeURIComponent(cleanText)}`;
        
        const audio = new Audio(url);
        window.currentNellAudio = audio;

        const vol = (typeof window.isMuted !== 'undefined' && window.isMuted) ? 0 : (window.appVolume || 0.5);
        audio.volume = vol;
        
        // 1.2〜1.3倍速くらいが可愛くて聞きやすいです
        audio.playbackRate = 1.25;

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

        audio.onerror = (e) => {
            console.error("Google TTS API Error:", e);
            window.isNellSpeaking = false;
            window.currentNellAudio = null;
            playFallbackTTS(cleanText, resolve);
        };

        audio.play().catch(e => {
            console.warn("Audio Play Failed / Blocked:", e);
            window.isNellSpeaking = false;
            window.currentNellAudio = null;
            playFallbackTTS(cleanText, resolve);
        });
    });
};

// 最終防衛ライン: ブラウザ内蔵音声
function playFallbackTTS(text, resolveCallback) {
    console.log("ブラウザ内蔵音声(TTS)に切り替えますにゃ。");
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'ja-JP';
        msg.rate = 1.2; 
        
        msg.onstart = () => { window.isNellSpeaking = true; };
        msg.onend = () => { window.isNellSpeaking = false; resolveCallback(); };
        msg.onerror = () => { window.isNellSpeaking = false; resolveCallback(); };
        
        window.speechSynthesis.speak(msg);
    } else {
        resolveCallback();
    }
}

// （互換性維持用）グローバル空間にも関数を露出
if (typeof speakNell === 'undefined') {
    window.speakNell = window.speakNell;
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {};
}