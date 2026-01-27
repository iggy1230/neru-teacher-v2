// --- js/constants.js ---
// 全てのファイルからアクセスできるように window オブジェクトに紐付けます

// ==========================================
// 1. 基本ステータス変数 (analyze.js由来)
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

// ==========================================
// 2. 音声・通信関連の状態 (analyze.js由来)
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

// 常時聞き取り用のフラグ
window.isAlwaysListening = false;
window.continuousRecognition = null;

// 履歴用配列
window.chatSessionHistory = [];

// ==========================================
// 3. ゲーム・画像加工関連 (analyze.js由来)
// ==========================================
// ゲーム関連変数 (初期化は game-engine.js で実施)
window.gameCanvas = null;
window.ctx = null;
window.ball = null;
window.paddle = null;
window.bricks = null;
window.score = 0;
window.gameRunning = false;
window.gameAnimId = null;

// Cropper (画像切り抜き) 関連
window.cropImg = new Image();
window.cropPoints = [];
window.activeHandle = -1;
window.analysisTimers = [];
window.homeworkStream = null;

// ==========================================
// 4. タイマー・カメラ関連 (analyze.js由来)
// ==========================================
window.studyTimerValue = 0;
window.studyTimerInterval = null;
window.studyTimerRunning = false;
window.studyTimerCheck = 0; 

window.previewStream = null;

// ==========================================
// 5. 画像リソース・定数
// ==========================================
window.subjectImages = {
    'こくご': { base: 'assets/images/characters/nell-kokugo.png', talk: 'assets/images/characters/nell-kokugo-talk.png' },
    'さんすう': { base: 'assets/images/characters/nell-sansu.png', talk: 'assets/images/characters/nell-sansu-talk.png' },
    'りか': { base: 'assets/images/characters/nell-rika.png', talk: 'assets/images/characters/nell-rika-talk.png' },
    'しゃかい': { base: 'assets/images/characters/nell-shakai.png', talk: 'assets/images/characters/nell-shakai-talk.png' },
    'おはなし': { base: 'assets/images/characters/nell-normal.png', talk: 'assets/images/characters/nell-talk.png' }
};
window.defaultIcon = 'assets/images/characters/nell-normal.png'; 
window.talkIcon = 'assets/images/characters/nell-talk.png';

window.gameHitComments = ["うまいにゃ！", "すごいにゃ！", "さすがにゃ！", "がんばれにゃ！"];

// ==========================================
// 6. 効果音の定義 (集約)
// ==========================================

// analyze.js 由来の効果音
window.sfxBori = new Audio('assets/sounds/ui/boribori.mp3');
window.sfxHit = new Audio('assets/sounds/voice/cat1c.mp3');
window.sfxPaddle = new Audio('assets/sounds/ui/poka02.mp3'); 
window.sfxOver = new Audio('assets/sounds/system/gameover.mp3');
window.sfxBunseki = new Audio('assets/sounds/system/bunseki.mp3'); 
window.sfxBunseki.volume = 0.05; 
window.sfxHirameku = new Audio('assets/sounds/voice/hirameku.mp3'); 
window.sfxMaru = new Audio('assets/sounds/ui/maru.mp3');
window.sfxBatu = new Audio('assets/sounds/ui/batu.mp3');

// ui.js 由来の効果音
window.sfxChime = new Audio('assets/sounds/system/jpn_sch_chime.mp3');
window.sfxBtn = new Audio('assets/sounds/ui/botan1.mp3'); 

// user.js 由来の効果音
window.sfxDoor = new Audio('assets/sounds/system/class_door1.mp3');

console.log("✅ constants.js loaded.");