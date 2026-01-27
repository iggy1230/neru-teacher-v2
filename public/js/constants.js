// --- js/constants.js (v293.0: 変数・定数定義) ---
// ==========================================
// グローバル変数・状態フラグ
// ==========================================
window.currentMode = '';
window.currentSubject = '';
window.isAnalyzing = false;
window.transcribedProblems = [];
window.selectedProblem = null;
window.hintIndex = 0;
window.lunchCount = 0;
window.analysisType = 'precision';
window.gradingTimer = null;
window.isComposing = false;
// 履歴用配列
window.chatSessionHistory = [];
// ==========================================
// 音声・通信・認識関連
// ==========================================
window.liveSocket = null;
window.audioContext = null;
window.mediaStream = null;
window.workletNode = null;
window.stopSpeakingTimer = null;
window.speakingStartTimer = null;
window.currentTtsSource = null;
window.chatTranscript = "";
window.nextStartTime = 0;
window.connectionTimeout = null;
window.recognition = null;
window.isRecognitionActive = false;
window.liveAudioSources = [];
window.ignoreIncomingAudio = false;
window.currentLiveAudioSource = null;
window.isLiveImageSending = false;
window.isMicMuted = false;
window.lastSentCollectionImage = null;
window.activeChatContext = null;
window.streamTextBuffer = "";
window.ttsTextBuffer = "";
window.latestDetectedName = null;
// 常時聞き取り用
window.isAlwaysListening = false;
window.continuousRecognition = null;
// ==========================================
// ゲーム・Cropper・タイマー関連
// ==========================================
// ゲーム
window.gameCanvas = null;
window.ctx = null;
window.ball = null;
window.paddle = null;
window.bricks = null;
window.score = 0;
window.gameRunning = false;
window.gameAnimId = null;
// Cropper
window.cropImg = new Image();
window.cropPoints = [];
window.activeHandle = -1;
window.analysisTimers = [];
window.homeworkStream = null;
// タイマー
window.studyTimerValue = 0;
window.studyTimerInterval = null;
window.studyTimerRunning = false;
window.studyTimerCheck = 0;
// プレビューカメラ
window.previewStream = null;
// ==========================================
// リソース定義 (Audio, Images)
// ==========================================
// 効果音
window.sfxBori = new Audio('assets/sounds/ui/boribori.mp3');
window.sfxHit = new Audio('assets/sounds/voice/cat1c.mp3');
window.sfxPaddle = new Audio('assets/sounds/ui/poka02.mp3');
window.sfxOver = new Audio('assets/sounds/system/gameover.mp3');
window.sfxBunseki = new Audio('assets/sounds/system/bunseki.mp3');
window.sfxBunseki.volume = 0.05;
window.sfxHirameku = new Audio('assets/sounds/voice/hirameku.mp3');
window.sfxMaru = new Audio('assets/sounds/ui/maru.mp3');
window.sfxBatu = new Audio('assets/sounds/ui/batu.mp3');
// ゲーム用コメント
window.gameHitComments = ["うまいにゃ！", "すごいにゃ！", "さすがにゃ！", "がんばれにゃ！"];
// 画像リソース
window.subjectImages = {
'こくご': { base: 'assets/images/characters/nell-kokugo.png', talk: 'assets/images/characters/nell-kokugo-talk.png' },
'さんすう': { base: 'assets/images/characters/nell-sansu.png', talk: 'assets/images/characters/nell-sansu-talk.png' },
'りか': { base: 'assets/images/characters/nell-rika.png', talk: 'assets/images/characters/nell-rika-talk.png' },
'しゃかい': { base: 'assets/images/characters/nell-shakai.png', talk: 'assets/images/characters/nell-shakai-talk.png' },
'おはなし': { base: 'assets/images/characters/nell-normal.png', talk: 'assets/images/characters/nell-talk.png' }
};
window.defaultIcon = 'assets/images/characters/nell-normal.png';
window.talkIcon = 'assets/images/characters/nell-talk.png';
// ==========================================
// 共通ヘルパー関数
// ==========================================
window.safePlay = function(audioObj) {
if (!audioObj) return Promise.resolve();
try {
audioObj.currentTime = 0;
const playPromise = audioObj.play();
if (playPromise !== undefined) {
return playPromise.catch(error => {
console.warn("Audio play failed (ignored):", error);
});
}
} catch (e) { console.warn("Audio error:", e); }
return Promise.resolve();
};