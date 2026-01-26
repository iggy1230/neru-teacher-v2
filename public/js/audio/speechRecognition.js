// public/js/audio/speechRecognition.js

const DEBUG = true;

// 内部状態を保持するクロージャ変数
let recognition = null;
let isListening = false;
let resultCallback = null;

// Web Speech API のコンストラクタ取得（標準またはベンダープレフィックス）
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * デバッグ用ログ出力
 */
const log = (...args) => {
  if (DEBUG) {
    console.log('[SpeechRecognition]', ...args);
  }
};

/**
 * 音声認識機能の初期化
 * ブラウザのサポート状況を確認します。
 * @returns {boolean} Web Speech API が利用可能な場合は true
 */
export function initSpeechRecognition() {
  if (!SpeechRecognition) {
    console.warn('[SpeechRecognition] This browser does not support Web Speech API.');
    return false;
  }
  log('Initialized.');
  return true;
}

/**
 * 音声認識(常時聞き取り)を開始する
 * 認識結果が得られるたびに callback が呼び出されます。
 * 音声認識が途切れた場合も、stopListening() が呼ばれるまで自動的に再開します。
 * 
 * @param {Function} callback - 認識されたテキスト(string)を受け取る関数
 */
export function startListening(callback) {
  if (!SpeechRecognition) return;

  // 既に動作中の場合はコールバックの更新のみ行う
  if (isListening) {
    resultCallback = callback;
    return;
  }

  isListening = true;
  resultCallback = callback;
  _startInstance();
}

/**
 * 音声認識を停止する
 * 自動再開ループも停止します。
 */
export function stopListening() {
  isListening = false;
  resultCallback = null;

  if (recognition) {
    try {
      // onend発火時の再開を防ぐためハンドラを解除してから止める手もあるが、
      // isListeningフラグで制御しているためそのままstopを呼ぶ
      recognition.stop();
    } catch (e) {
      // 既に停止している場合のエラーは無視
    }
    // インスタンス参照を破棄
    recognition = null;
  }
  log('Stopped listening.');
}

/**
 * 内部メソッド: 認識インスタンスの生成と開始
 * SpeechRecognitionのライフサイクルを管理します。
 */
function _startInstance() {
  // 停止フラグが立っていたら何もしない
  if (!isListening) return;

  // 既存のインスタンスがあればクリーンアップ
  if (recognition) {
    try {
      recognition.onend = null; // 予期せぬループ防止
      recognition.stop();
    } catch (e) {}
  }

  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false; // 確定した結果のみを取得
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (!event.results || event.results.length === 0) return;
      
      const transcript = event.results[0][0].transcript;
      if (transcript && transcript.trim() !== '') {
        log('Recognized:', transcript);
        if (typeof resultCallback === 'function') {
          resultCallback(transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' (無音) は通常のフロー内で再開すればよいためエラーログは抑制
      if (event.error !== 'no-speech') {
        console.error('[SpeechRecognition] Error:', event.error);
      }
    };

    recognition.onend = () => {
      // 意図的に停止された場合は再開しない
      if (!isListening) return;

      log('Instance ended. Restarting...');
      
      // ブラウザの負荷軽減とスタックオーバーフロー防止のため、微小な遅延を入れて再開
      setTimeout(() => {
        if (isListening) {
          _startInstance();
        }
      }, 100);
    };

    recognition.start();
    log('Instance started.');

  } catch (e) {
    console.error('[SpeechRecognition] Exception during start:', e);
    
    // インスタンス生成や開始に失敗した場合も、常時聞き取りを維持するためリトライを試みる
    if (isListening) {
      setTimeout(() => {
        if (isListening) _startInstance();
      }, 1000);
    }
  }
}