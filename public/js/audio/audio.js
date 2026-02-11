// --- js/audio/audio.js (v418.0: ブラウザ標準TTS 安定化版) ---
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

// ★修正1: 読み上げエラーの原因になる記号や絵文字を削除する
// 絵文字、特殊記号、括弧内の補足などを除去して、読み上げを安定させる
let cleanText = text;
cleanText = cleanText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); // 絵文字削除
cleanText = cleanText.replace(/[★☆✨♪！!？?]/g, ''); // 記号削除（イントネーションがおかしくなるのを防ぐ）
cleanText = cleanText.replace(/[\(（][^\)）]+[\)）]/g, ''); // カッコ書き削除

if (cleanText.trim() === "") return;

// 読み上げオブジェクト作成
const utterance = new SpeechSynthesisUtterance(cleanText);

// 音量設定 (Web Speech APIのvolumeは0.0-1.0)
utterance.volume = window.isMuted ? 0 : (window.appVolume || 0.5);

// 声の設定 (日本語を探す)
// ※Googleの音声があればそれを優先、なければシステムのデフォルト
const voices = window.speechSynthesis.getVoices();
let jpVoice = voices.find(v => v.lang === 'ja-JP' && v.name.includes('Google'));
if (!jpVoice) {
    jpVoice = voices.find(v => v.lang === 'ja-JP');
}
if (jpVoice) {
    utterance.voice = jpVoice;
}

// ★修正2: 感情パラメータをマイルドにする（震え防止）
// rate: 速度 (標準1.0), pitch: 高さ (標準1.0)
// 極端な値（1.5以上や0.5以下）はブラウザによってバグる原因になるため、範囲を狭める
let rate = 1.0; 
let pitch = 1.0; 

if (mood === "thinking") { 
    rate = 0.9;   // 少しゆっくり
    pitch = 0.9;  // 少し低く
} else if (mood === "gentle") { 
    rate = 0.95;  // ほんの少しゆっくり
    pitch = 1.05; // ほんの少し高く
} else if (mood === "excited") { 
    rate = 1.1;   // 少し速く
    pitch = 1.15; // 少し高く（上げすぎない）
} else if (mood === "sad") {
    rate = 0.9;   // 少しゆっくり
    pitch = 0.85; // 低く
}

utterance.rate = rate;
utterance.pitch = pitch;

// イベントリスナー
utterance.onstart = () => {
    window.isNellSpeaking = true;
};

utterance.onend = () => {
    window.isNellSpeaking = false;
    window.currentUtterance = null;
};

utterance.onerror = (e) => {
    console.error("TTS Error:", e);
    window.isNellSpeaking = false;
    window.currentUtterance = null;
};

// グローバル変数に入れてGCを防ぐ
window.currentUtterance = utterance;

// 少し遅延させて実行（ブラウザの競合回避）
setTimeout(() => {
    window.speechSynthesis.speak(utterance);
}, 10);
}
// 音声リストの読み込み完了を待つ（Chrome等の一部ブラウザ対策）
if ('speechSynthesis' in window) {
window.speechSynthesis.onvoiceschanged = () => {
console.log("Voices loaded");
};
}