// --- speechRecognition.js (v1.0.0: 音声認識ロジック分離版) ---

(function() {
    // --- 内部状態管理変数 ---
    let continuousRecognition = null;
    let isAlwaysListening = false;
    let simpleRecognition = null;

    // 割り込み停止ワード定義
    const STOP_KEYWORDS = ["違う", "ちがう", "待って", "まって", "ストップ", "やめて", "うるさい", "静か", "しずか"];

    /**
     * 常時音声認識 (HTTPチャットモード用) を開始します。
     * 
     * @param {Function} onResultCallback - 認識結果(確定テキスト)を受け取るコールバック関数
     * @param {Function} onInterruptCallback - 割り込み発生時(ストップ命令など)のコールバック関数
     * @param {Function} checkIsNellSpeaking - ネル先生が発話中か判定する関数 (return boolean)
     */
    window.startAlwaysOnListeningLogic = function(onResultCallback, onInterruptCallback, checkIsNellSpeaking) {
        if (!('webkitSpeechRecognition' in window)) {
            console.warn("Speech Recognition not supported.");
            return;
        }

        if (continuousRecognition) {
            try { continuousRecognition.stop(); } catch(e){}
        }

        isAlwaysListening = true;
        continuousRecognition = new webkitSpeechRecognition();
        continuousRecognition.lang = 'ja-JP';
        continuousRecognition.interimResults = false;
        continuousRecognition.maxAlternatives = 1;

        continuousRecognition.onresult = (event) => {
            // 認識結果の取得
            const text = event.results[0][0].transcript;
            if (!text || text.trim() === "") return;

            // 割り込み判定
            const isStopCommand = STOP_KEYWORDS.some(w => text.includes(w));
            const isLongEnough = text.length >= 10;

            // ネル先生が話している最中の処理
            if (checkIsNellSpeaking && checkIsNellSpeaking()) {
                if (isLongEnough || isStopCommand) {
                    console.log("[SpeechRec] Interruption detected.");
                    if (onInterruptCallback) onInterruptCallback(isStopCommand);
                }
                // 発話中はここでリターンし、テキスト処理（チャット送信）は行わない
                return;
            }
            
            console.log(`[SpeechRec] User Said: ${text}`);
            continuousRecognition.stop(); // 一旦停止して処理を行う

            if (onResultCallback) {
                onResultCallback(text);
            }
        };

        continuousRecognition.onend = () => {
            // 継続フラグが立っており、かつネル先生が話していない場合は再開
            if (isAlwaysListening && (!checkIsNellSpeaking || !checkIsNellSpeaking())) {
                try { continuousRecognition.start(); } catch(e){}
            }
        };

        continuousRecognition.onerror = (event) => {
            if (event.error !== 'no-speech') {
                console.error("[SpeechRec] Error:", event.error);
            }
            // エラー時も継続フラグがあれば少し待って再開
            if (isAlwaysListening) {
                setTimeout(() => {
                    try { continuousRecognition.start(); } catch(e){}
                }, 1000);
            }
        };

        try { 
            continuousRecognition.start(); 
        } catch(e) { 
            console.log("[SpeechRec] Start failed", e); 
        }
    };

    /**
     * 常時音声認識を停止します。
     */
    window.stopAlwaysOnListeningLogic = function() {
        isAlwaysListening = false;
        if (continuousRecognition) {
            try { continuousRecognition.stop(); } catch(e){}
            continuousRecognition = null;
        }
    };

    /**
     * 簡易音声認識 (WebSocketチャット/マイク入力用) を作成して開始します。
     * startMicrophone 内で使用されるロジックの一部です。
     * 
     * @param {Function} onFinalResultCallback - 確定したテキストを受け取るコールバック関数
     * @param {Function} onInterruptCallback - 割り込み発生時のコールバック関数
     * @param {Function} checkIsNellSpeaking - ネル先生が発話中か判定する関数
     * @returns {Object} 作成された recognition インスタンス (onendの上書きなどが可能)
     */
    window.createSimpleRecognition = function(onFinalResultCallback, onInterruptCallback, checkIsNellSpeaking) {
        if (!('webkitSpeechRecognition' in window)) return null;

        if (simpleRecognition) {
            try { simpleRecognition.stop(); } catch(e){}
        }

        simpleRecognition = new webkitSpeechRecognition();
        simpleRecognition.continuous = true;
        simpleRecognition.interimResults = true;
        simpleRecognition.lang = 'ja-JP';

        simpleRecognition.onresult = (event) => {
            let currentText = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                currentText += event.results[i][0].transcript;
            }
            const cleanText = currentText.trim();
            
            // 割り込み判定
            if (checkIsNellSpeaking && checkIsNellSpeaking() && cleanText.length > 0) {
                const isLongEnough = cleanText.length >= 10;
                const isStopCommand = STOP_KEYWORDS.some(w => cleanText.includes(w));
                if (isLongEnough || isStopCommand) {
                    if (onInterruptCallback) onInterruptCallback();
                }
            }

            // 確定結果の処理
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const userText = event.results[i][0].transcript;
                    if (onFinalResultCallback) onFinalResultCallback(userText);
                }
            }
        };

        try {
            simpleRecognition.start();
        } catch(e) {
            console.warn("[SpeechRec] Simple start failed", e);
        }

        return simpleRecognition;
    };

    /**
     * 簡易音声認識を停止します。
     */
    window.stopSimpleRecognition = function() {
        if (simpleRecognition) {
            try { simpleRecognition.stop(); } catch(e){}
            simpleRecognition = null;
        }
    };

})();