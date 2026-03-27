// --- START OF FILE audio.js ---

// --- js/audio/audio.js (v439.0: WebSpeech ネル先生チューニング版) ---
window.audioCtx = null;
window.masterGainNode = null; 
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
};

// ★修正: ブラウザ内蔵音声(Web Speech API)をネル先生風にチューニングしてメインにする
window.speakNell = function(text, mood = "normal") {
    return new Promise((resolve) => {
        if (!text || text === "") {
            resolve();
            return;
        }

        // まず再生中の音声をキャンセル
        window.cancelNellSpeech();

        let cleanText = text;
        // 読み上げエラーの原因になる絵文字や記号を削除
        cleanText = cleanText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); 
        cleanText = cleanText.replace(/[★☆✨♪！!？?🐾]/g, ''); 
        cleanText = cleanText.replace(/[\(（][^\)）]+[\)）]/g, ''); 

        if (cleanText.trim() === "") {
            resolve();
            return;
        }

        // ブラウザ内蔵音声の呼び出し
        if ('speechSynthesis' in window) {
            const msg = new SpeechSynthesisUtterance(cleanText);
            msg.lang = 'ja-JP';
            
            // ★ネル先生風チューニング
            // 少し高めの声にして子供っぽくする
            msg.pitch = 1.4; 
            // 少し早口にして元気さを出す
            msg.rate = 1.15; 
            
            // ミュート状態の確認
            const isMuted = (typeof window.isMuted !== 'undefined' && window.isMuted);
            msg.volume = isMuted ? 0 : 1.0; 

            // 口パクアニメーションとの連動
            msg.onstart = () => { window.isNellSpeaking = true; };
            msg.onend = () => { window.isNellSpeaking = false; resolve(); };
            msg.onerror = () => { window.isNellSpeaking = false; resolve(); };
            
            window.speechSynthesis.speak(msg);
        } else {
            console.warn("このブラウザは音声合成に対応してないにゃ...");
            resolve();
        }
    });
};

// （互換性維持用）グローバル空間にも関数を露出
if (typeof speakNell === 'undefined') {
    window.speakNell = window.speakNell;
}