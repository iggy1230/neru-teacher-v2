// --- START OF FILE audio.js ---

// --- js/audio/audio.js (v440.0: Google TTS 文字数制限突破版) ---
window.audioCtx = null;
window.masterGainNode = null; 
window.currentNellAudio = null;
window.isNellSpeaking = false;
window.speechQueue =[]; // 長文を分割して順番に再生するためのキュー

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
    window.isNellSpeaking = false;
    window.speechQueue =[]; // キューを空にする
    if (window.currentNellAudio) {
        window.currentNellAudio.pause();
        window.currentNellAudio.currentTime = 0;
        window.currentNellAudio = null;
    }
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};

window.speakNell = function(text, mood = "normal") {
    return new Promise((resolve) => {
        if (!text || text === "") {
            resolve();
            return;
        }

        // まず再生中の音声をキャンセル
        window.cancelNellSpeech();

        let cleanText = text;
        // 読み上げエラーの原因になる絵文字や記号を徹底的に削除
        cleanText = cleanText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); 
        cleanText = cleanText.replace(/[★☆✨♪！!？?🐾]/g, ''); 
        cleanText = cleanText.replace(/[\(（][^\)）]+[\)）]/g, ''); 

        if (cleanText.trim() === "") {
            resolve();
            return;
        }

        // ----------------------------------------------------
        // ★文字数制限対策：文章を「。！？」「、，」などで分割してキューに入れる
        // ----------------------------------------------------
        // 1. まず句点で分割
        let sentences = cleanText.match(/[^。！？.!?]+[。！？.!?]*/g) || [cleanText];
        let queue =[];
        
        // 2. 1文が長すぎる場合（60文字以上）は読点でさらに分割
        sentences.forEach(s => {
            if (s.length > 60) {
                let parts = s.match(/[^、，,]+[、，,]*/g) || [s];
                queue.push(...parts);
            } else {
                queue.push(s);
            }
        });

        window.speechQueue = queue.map(s => s.trim()).filter(s => s.length > 0);

        // 順番に再生する関数
        function playNext() {
            // キューが空になったら終了
            if (window.speechQueue.length === 0) {
                window.isNellSpeaking = false;
                window.currentNellAudio = null;
                resolve();
                return;
            }

            // 次の文章を取り出す
            const sentence = window.speechQueue.shift();
            
            // 安定の Google TTS (client=tw-ob)
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(sentence)}`;
            
            const audio = new Audio(url);
            window.currentNellAudio = audio;

            const vol = (typeof window.isMuted !== 'undefined' && window.isMuted) ? 0 : (window.appVolume || 0.5);
            audio.volume = vol;
            
            // 1.25倍速で少し元気な声にする
            audio.playbackRate = 1.25;

            audio.onplay = () => { window.isNellSpeaking = true; };
            
            // ★1つ終わったら次の文章を再生
            audio.onended = () => { playNext(); };

            // 万が一Googleがブロックした場合は残りの文章を内蔵音声に逃がす
            audio.onerror = (e) => {
                console.warn("Google TTS API Error on chunk:", sentence);
                const remainingText = sentence + " " + window.speechQueue.join(" ");
                window.speechQueue =[];
                playFallbackTTS(remainingText, resolve);
            };

            audio.play().catch(e => {
                console.warn("Audio Play Failed / Blocked:", e);
                const remainingText = sentence + " " + window.speechQueue.join(" ");
                window.speechQueue =