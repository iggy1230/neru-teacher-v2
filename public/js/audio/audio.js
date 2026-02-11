// --- js/audio/audio.js (v417.0: ブラウザ標準TTS対応版) ---

window.audioCtx = null;
window.masterGainNode = null; // 全体の音量制御用
let currentUtterance = null; // 現在の読み上げオブジェクト

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
    currentUtterance = null;
};

// ブラウザ標準TTSを使った読み上げ関数
async function speakNell(text, mood = "normal") {
    if (!text || text === "") return;
    if (!('speechSynthesis' in window)) return;

    window.cancelNellSpeech();

    // 読み上げオブジェクト作成
    const utterance = new SpeechSynthesisUtterance(text);
    
    // 音量設定 (Web Speech APIのvolumeは0.0-1.0)
    utterance.volume = window.isMuted ? 0 : (window.appVolume || 0.5);
    
    // 声の設定 (日本語を探す)
    const voices = window.speechSynthesis.getVoices();
    const jpVoice = voices.find(v => v.lang === 'ja-JP' && v.name.includes('Google')) || voices.find(v => v.lang === 'ja-JP');
    if (jpVoice) {
        utterance.voice = jpVoice;
    }
    
    // 感情(mood)によるパラメータ調整
    // rate: 速度 (0.1 - 10), pitch: 高さ (0 - 2)
    let rate = 1.1; 
    let pitch = 1.2; 

    if (mood === "thinking") { 
        rate = 0.9; 
        pitch = 1.0; 
    } else if (mood === "gentle") { 
        rate = 0.95; 
        pitch = 1.1; 
    } else if (mood === "excited") { 
        rate = 1.2; 
        pitch = 1.4; 
    } else if (mood === "sad") {
        rate = 0.85;
        pitch = 0.9;
    }

    utterance.rate = rate;
    utterance.pitch = pitch;

    // イベントリスナー
    utterance.onstart = () => {
        window.isNellSpeaking = true;
    };
    
    utterance.onend = () => {
        window.isNellSpeaking = false;
        currentUtterance = null;
    };
    
    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        window.isNellSpeaking = false;
        currentUtterance = null;
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    
    // Promiseを返すとawaitで待てるが、標準TTSは非同期イベントベースなので完全なawaitは難しい。
    // ここでは発話開始をトリガーするまでとする。
}

// 音声リストの読み込み完了を待つ（Chrome等の一部ブラウザ対策）
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        // 声リスト更新
        console.log("Voices loaded");
    };
}