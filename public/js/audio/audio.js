// --- js/audio/audio.js (v420.0: 全体的な読み上げ速度向上版) ---

window.audioCtx = null;
window.masterGainNode = null; // 全体の音量制御用
// 【重要】ガベージコレクション対策のため、グローバル変数として保持する
window.currentUtterance = null;

window.isNellSpeaking = false;

window.initAudioContext = async function() {
    try {
        // コンテキストの初期化（効果音再生用に必要）
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

    // 前の音声をキャンセル
    window.cancelNellSpeech();

    // ★修正: 読み上げエラーの原因になる記号や絵文字を削除する
    let cleanText = text;
    cleanText = cleanText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); 
    cleanText = cleanText.replace(/[★☆✨♪！!？?]/g, ''); 
    cleanText = cleanText.replace(/[\(（][^\)）]+[\)）]/g, ''); 

    if (cleanText.trim() === "") return;

    // 読み上げオブジェクト作成
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // 音量設定
    utterance.volume = window.isMuted ? 0 : (window.appVolume || 0.5);
    
    // 声の設定 (日本語を探す)
    const voices = window.speechSynthesis.getVoices();
    let jpVoice = voices.find(v => v.lang === 'ja-JP' && v.name.includes('Google'));
    if (!jpVoice) {
        jpVoice = voices.find(v => v.lang === 'ja-JP');
    }
    if (jpVoice) {
        utterance.voice = jpVoice;
    }
    
    // ★修正: 全体的に読み上げ速度を速くする
    let rate = 1.2; // 標準速度を 1.0 -> 1.2 にアップ
    let pitch = 1.0; 

    if (mood === "thinking") { 
        rate = 1.0; pitch = 0.9;
    } else if (mood === "gentle") { 
        rate = 1.1; pitch = 1.05;
    } else if (mood === "excited") { 
        rate = 1.3; pitch = 1.15;
    } else if (mood === "sad") {
        rate = 1.0; pitch = 0.85;
    }

    utterance.rate = rate;
    utterance.pitch = pitch;

    // Promiseを返すように修正（読み上げ完了待ち用）
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
            if (e.error === 'interrupted' || e.error === 'canceled') {
                return;
            }
            console.error("TTS Error:", e);
            window.isNellSpeaking = false;
            window.currentUtterance = null;
            resolve(); // エラーでも完了扱いにして次に進める
        };

        window.currentUtterance = utterance;
        
        // 少し遅延させて実行
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 10);
    });
}

// 音声リストの読み込み完了を待つ
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        console.log("Voices loaded");
    };
}