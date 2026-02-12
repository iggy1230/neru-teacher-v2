// --- js/audio/audio.js (v426.0: 無料版・安定化TTS) ---

window.audioCtx = null;
window.masterGainNode = null; 
window.currentUtterance = null; // GC対策

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
    window.isNellSpeaking = false;
    window.currentUtterance = null;
};

// ブラウザ標準TTSを使った読み上げ関数
async function speakNell(text, mood = "normal") {
    if (!text || text === "") return;
    if (!('speechSynthesis' in window)) return;

    window.cancelNellSpeech();

    // 読み上げエラー回避のため記号を削除
    let cleanText = text;
    cleanText = cleanText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); 
    cleanText = cleanText.replace(/[★☆✨♪！!？?]/g, ''); 
    cleanText = cleanText.replace(/[\(（][^\)）]+[\)）]/g, ''); 

    if (cleanText.trim() === "") return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.volume = window.isMuted ? 0 : (window.appVolume || 0.5);
    
    // 日本語音声の選択
    const voices = window.speechSynthesis.getVoices();
    let jpVoice = voices.find(v => v.lang === 'ja-JP' && v.name.includes('Google'));
    if (!jpVoice) {
        jpVoice = voices.find(v => v.lang === 'ja-JP');
    }
    if (jpVoice) {
        utterance.voice = jpVoice;
    }
    
    // 感情パラメータ（ブラウザTTS用にマイルドに調整）
    let rate = 1.1; 
    let pitch = 1.0; 

    if (mood === "thinking") { 
        rate = 0.95; pitch = 0.9;
    } else if (mood === "gentle") { 
        rate = 1.0; pitch = 1.05;
    } else if (mood === "excited") { 
        rate = 1.2; pitch = 1.1;
    } else if (mood === "sad") {
        rate = 0.9; pitch = 0.85;
    }

    utterance.rate = rate;
    utterance.pitch = pitch;

    // 非同期制御用Promise
    return new Promise((resolve) => {
        utterance.onstart = () => {
            window.isNellSpeaking = true;
        };
        
        utterance.onend = () => {
            window.isNellSpeaking = false;
            window.currentUtterance = null;
            resolve();
        };
        
        utterance.onerror = (e) => {
            // 中断はエラーではないので無視
            if (e.error === 'interrupted' || e.error === 'canceled') {
                return;
            }
            console.error("TTS Error:", e);
            window.isNellSpeaking = false;
            window.currentUtterance = null;
            resolve();
        };

        window.currentUtterance = utterance;
        
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 10);
    });
}

// 音声リスト読み込み待機
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        console.log("Voices loaded");
    };
}