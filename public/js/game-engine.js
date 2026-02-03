// --- js/game-engine.js (v365.0: 全ゲーム統合・完全版) ---

// ==========================================
// 既存ゲーム: カリカリキャッチ (ブロック崩し風)
// ==========================================

window.showGame = function() { 
    if (typeof window.switchScreen === 'function') {
        window.switchScreen('screen-game'); 
    } else {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById('screen-game').classList.remove('hidden');
    }
    
    document.getElementById('mini-karikari-display').classList.remove('hidden'); 
    if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari(); 
    
    window.initGame(); 
    window.fetchGameComment("start"); 
    
    const startBtn = document.getElementById('start-game-btn'); 
    if (startBtn) { 
        const newBtn = startBtn.cloneNode(true); 
        startBtn.parentNode.replaceChild(newBtn, startBtn); 
        newBtn.onclick = () => { 
            if (!window.gameRunning) { 
                window.initGame(); 
                window.gameRunning = true; 
                newBtn.disabled = true; 
                window.drawGame(); 
            } 
        }; 
    } 
};

window.fetchGameComment = function(type, score=0) { 
    if (!currentUser) return;
    fetch('/game-reaction', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ type, name: currentUser.name, score }) 
    })
    .then(r => r.json())
    .then(d => { 
        if(typeof window.updateNellMessage === 'function') {
            window.updateNellMessage(d.reply, d.mood || "excited", true); 
        }
    })
    .catch(e => { console.error("Game Comment Error:", e); }); 
};

window.initGame = function() {
    window.gameCanvas = document.getElementById('game-canvas');
    if(!window.gameCanvas) return;
    window.ctx = window.gameCanvas.getContext('2d');
    
    window.paddle = { x: window.gameCanvas.width / 2 - 40, y: window.gameCanvas.height - 30, w: 80, h: 10 };
    window.ball = { x: window.gameCanvas.width / 2, y: window.gameCanvas.height - 40, r: 8, dx: 4, dy: -4 };
    
    window.score = 0;
    const scoreEl = document.getElementById('game-score');
    if(scoreEl) scoreEl.innerText = window.score;
    
    window.bricks = [];
    for(let c = 0; c < 5; c++) {
        for(let r = 0; r < 4; r++) {
            window.bricks.push({ x: 30 + (c * 55), y: 30 + (r * 30), w: 40, h: 20, status: 1 });
        }
    }
    
    const movePaddle = (e) => {
        const rect = window.gameCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let relativeX = clientX - rect.left;
        if(relativeX > 0 && relativeX < window.gameCanvas.width) {
            window.paddle.x = relativeX - window.paddle.w/2;
        }
    };
    window.gameCanvas.onmousemove = movePaddle;
    window.gameCanvas.ontouchmove = (e) => { e.preventDefault(); movePaddle(e); };
};

window.giveGameReward = function(amount) {
    if (amount <= 0 || !currentUser) return;
    
    currentUser.karikari += amount;
    if(typeof window.saveAndSync === 'function') window.saveAndSync();
    if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
    if(typeof window.showKarikariEffect === 'function') window.showKarikariEffect(amount);
};

window.drawGame = function() {
    if(!window.gameRunning) return;
    
    window.ctx.clearRect(0, 0, window.gameCanvas.width, window.gameCanvas.height);
    
    window.ctx.beginPath();
    window.ctx.arc(window.ball.x, window.ball.y, window.ball.r, 0, Math.PI*2);
    window.ctx.fillStyle = "#ff5722";
    window.ctx.fill();
    window.ctx.closePath();
    
    window.ctx.beginPath();
    window.ctx.rect(window.paddle.x, window.paddle.y, window.paddle.w, window.paddle.h);
    window.ctx.fillStyle = "#8d6e63";
    window.ctx.fill();
    window.ctx.closePath();
    
    window.bricks.forEach(b => {
        if(b.status === 1) {
            window.ctx.beginPath();
            window.ctx.font = "20px sans-serif";
            window.ctx.textAlign = "center";
            window.ctx.textBaseline = "middle";
            window.ctx.fillText("🍖", b.x + b.w/2, b.y + b.h/2);
            window.ctx.closePath();
        }
    });
    
    window.ball.x += window.ball.dx;
    window.ball.y += window.ball.dy;
    
    if(window.ball.x + window.ball.dx > window.gameCanvas.width - window.ball.r || window.ball.x + window.ball.dx < window.ball.r) window.ball.dx = -window.ball.dx;
    if(window.ball.y + window.ball.dy < window.ball.r) window.ball.dy = -window.ball.dy;
    
    if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r - 30) {
        if(window.ball.x > window.paddle.x && window.ball.x < window.paddle.x + window.paddle.w) {
            window.ball.dy = -window.ball.dy;
            if(window.safePlay) window.safePlay(window.sfxPaddle);
        } else if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r) {
            window.gameRunning = false;
            if(window.safePlay) window.safePlay(window.sfxOver);
            
            if (window.score > 0) {
                window.giveGameReward(window.score);
                if(typeof window.updateNellMessage === 'function') window.updateNellMessage(`あ〜あ、落ちちゃったにゃ…。でも${window.score}個ゲットだにゃ！`, "sad");
            } else {
                if(typeof window.updateNellMessage === 'function') window.updateNellMessage("あ〜あ、落ちちゃったにゃ…", "sad");
            }

            window.fetchGameComment("end", window.score);
            
            const startBtn = document.getElementById('start-game-btn');
            if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
            return;
        }
    }
    
    let allCleared = true;
    window.bricks.forEach(b => {
        if(b.status === 1) {
            allCleared = false;
            if(window.ball.x > b.x && window.ball.x < b.x + b.w && window.ball.y > b.y && window.ball.y < b.y + b.h) {
                window.ball.dy = -window.ball.dy;
                b.status = 0;
                window.score += 10;
                const scoreEl = document.getElementById('game-score');
                if(scoreEl) scoreEl.innerText = window.score;
                
                if(window.safePlay) window.safePlay(window.sfxHit);
            }
        }
    });
    
    if (allCleared) {
        window.gameRunning = false;
        
        window.giveGameReward(window.score);
        
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage(`全部取ったにゃ！すごいにゃ！！${window.score}個ゲットだにゃ！`, "excited");
        
        window.fetchGameComment("end", window.score);
        
        const startBtn = document.getElementById('start-game-btn');
        if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
        return;
    }
    
    window.gameAnimId = requestAnimationFrame(window.drawGame);
};

// ==========================================
// VS ロボット掃除機 (弾幕ゲーム)
// ==========================================

let danmakuState = {
    running: false,
    ctx: null,
    canvas: null,
    width: 0,
    height: 0,
    score: 0,
    frame: 0,
    player: { x: 0, y: 0, r: 16 }, // エキゾ猫
    boss: { x: 0, y: 0, r: 24, angle: 0 }, // ロボット掃除機
    bullets: [], 
    touching: false
};

// エキゾ猫(ドット絵)定義
const catPixelArt = [
    [0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0,0,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,0,0,1,1,1,1,1,1],
    [0,1,1,1,1,4,4,1,1,1,1,4,4,1,1,1],
    [1,1,1,1,4,4,4,4,1,1,4,4,4,4,1,1],
    [1,1,1,3,5,5,3,1,1,1,3,5,5,3,1,1],
    [1,1,1,5,3,3,5,1,1,1,5,3,3,5,1,1],
    [1,1,1,3,5,5,3,1,1,1,3,5,5,3,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,2,2,2,3,3,2,2,2,1,1,1,1],
    [0,1,1,2,2,2,3,4,4,3,2,2,2,1,1,0],
    [0,0,1,2,2,2,4,4,4,4,2,2,2,1,0,0],
    [0,0,0,1,1,2,2,2,2,2,2,1,1,0,0,0],
    [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0],
    [0,0,0,0,4,4,4,4,4,4,4,4,0,0,0,0],
    [0,0,0,0,4,0,0,4,4,0,0,4,0,0,0,0]
];

window.showDanmakuGame = function() {
    window.switchScreen('screen-danmaku');
    document.getElementById('mini-karikari-display').classList.remove('hidden');
    if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
    
    const canvas = document.getElementById('danmaku-canvas');
    danmakuState.canvas = canvas;
    danmakuState.ctx = canvas.getContext('2d');
    danmakuState.width = canvas.width;
    danmakuState.height = canvas.height;
    
    danmakuState.running = false;
    danmakuState.score = 0;
    document.getElementById('danmaku-score').innerText = "0";
    
    const startBtn = document.getElementById('start-danmaku-btn');
    startBtn.disabled = false;
    startBtn.innerText = "スタート！";
    
    window.updateNellMessage("ロボット掃除機からカリカリを守るにゃ！茶色は取って、他は避けるにゃ！", "excited", false);
    
    const moveHandler = (e) => {
        if (!danmakuState.running) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        let x = clientX - rect.left;
        let y = clientY - rect.top;
        
        x = Math.max(danmakuState.player.r, Math.min(danmakuState.width - danmakuState.player.r, x));
        y = Math.max(danmakuState.player.r, Math.min(danmakuState.height - danmakuState.player.r, y));
        
        danmakuState.player.x = x;
        danmakuState.player.y = y;
    };
    
    canvas.onmousedown = (e) => { danmakuState.touching = true; moveHandler(e); };
    canvas.onmousemove = (e) => { if(danmakuState.touching) moveHandler(e); };
    canvas.onmouseup = () => { danmakuState.touching = false; };
    canvas.onmouseleave = () => { danmakuState.touching = false; };
    
    canvas.ontouchstart = (e) => { danmakuState.touching = true; moveHandler(e); };
    canvas.ontouchmove = moveHandler;
    canvas.ontouchend = () => { danmakuState.touching = false; };
    
    initDanmakuEntities();
    drawDanmakuFrame();
};

function initDanmakuEntities() {
    danmakuState.player.x = danmakuState.width / 2;
    danmakuState.player.y = danmakuState.height - 50;
    
    danmakuState.boss.x = danmakuState.width / 2;
    danmakuState.boss.y = 100;
    
    danmakuState.bullets = [];
    danmakuState.frame = 0;
}

window.startDanmakuGame = function() {
    if (danmakuState.running) return;
    initDanmakuEntities();
    danmakuState.score = 0;
    document.getElementById('danmaku-score').innerText = "0";
    danmakuState.running = true;
    document.getElementById('start-danmaku-btn').disabled = true;
    
    loopDanmakuGame();
};

window.stopDanmakuGame = function() {
    danmakuState.running = false;
};

function loopDanmakuGame() {
    if (!danmakuState.running) return;
    
    updateDanmaku();
    drawDanmakuFrame();
    
    requestAnimationFrame(loopDanmakuGame);
}

function updateDanmaku() {
    danmakuState.frame++;
    
    danmakuState.boss.x = (danmakuState.width / 2) + Math.sin(danmakuState.frame * 0.02) * 100;
    danmakuState.boss.angle += 0.05; 
    
    let spawnRate = Math.max(10, 60 - Math.floor(danmakuState.score / 50));
    
    if (danmakuState.frame % spawnRate === 0) {
        spawnBullet();
    }
    
    for (let i = danmakuState.bullets.length - 1; i >= 0; i--) {
        let b = danmakuState.bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        
        if (b.y > danmakuState.height + 20 || b.x < -20 || b.x > danmakuState.width + 20 || b.y < -20) {
            danmakuState.bullets.splice(i, 1);
            continue;
        }
        
        let dx = b.x - danmakuState.player.x;
        let dy = b.y - danmakuState.player.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        
        // 当たり判定
        if (dist < danmakuState.player.r + b.r - 4) {
            if (b.type === 'good') {
                danmakuState.score += 10;
                document.getElementById('danmaku-score').innerText = danmakuState.score;
                if(window.safePlay) window.safePlay(window.sfxHit);
                danmakuState.bullets.splice(i, 1);
            } else {
                gameOverDanmaku();
                return; 
            }
        }
    }
}

function spawnBullet() {
    // 50%でお邪魔
    let type = Math.random() < 0.5 ? 'good' : 'bad';
    
    let content = '🍖';
    if (type === 'bad') {
        const bads = ['🐭', '⚽', '⚾'];
        content = bads[Math.floor(Math.random() * bads.length)];
    }
    
    let angle = Math.atan2(danmakuState.player.y - danmakuState.boss.y, danmakuState.player.x - danmakuState.boss.x);
    angle += (Math.random() - 0.5) * 1.0; 
    
    let speed = 2 + Math.random() * 2 + (danmakuState.score / 500); 
    
    danmakuState.bullets.push({
        x: danmakuState.boss.x,
        y: danmakuState.boss.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 12,
        type: type,
        content: content
    });
}

function gameOverDanmaku() {
    danmakuState.running = false;
    if(window.safePlay) window.safePlay(window.sfxOver);
    
    if (danmakuState.score > 0) {
        window.giveGameReward(danmakuState.score);
        window.updateNellMessage(`あぶにゃい！ぶつかったにゃ！でも${danmakuState.score}個ゲットだにゃ！`, "sad");
    } else {
        window.updateNellMessage("すぐにぶつかっちゃったにゃ…", "sad");
    }
    
    const startBtn = document.getElementById('start-danmaku-btn');
    startBtn.disabled = false;
    startBtn.innerText = "もう一回！";
}

function drawDanmakuFrame() {
    const ctx = danmakuState.ctx;
    const w = danmakuState.width;
    const h = danmakuState.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // 背景
    ctx.fillStyle = "#f5deb3";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#deb887";
    ctx.lineWidth = 2;
    for(let i=0; i<h; i+=40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    
    // ボス
    ctx.save();
    ctx.translate(danmakuState.boss.x, danmakuState.boss.y);
    ctx.rotate(danmakuState.boss.angle);
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI*2);
    ctx.fillStyle = "#333";
    ctx.fill();
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -10, 4, 0, Math.PI*2);
    ctx.fillStyle = "#0f0";
    ctx.fill();
    ctx.restore();
    
    // 自キャラ
    ctx.save();
    ctx.translate(danmakuState.player.x, danmakuState.player.y);
    const pixelSize = 2; 
    const catW = 16 * pixelSize;
    const catH = 16 * pixelSize;
    const drawX = -catW / 2;
    const drawY = -catH / 2;

    const colors = [
        null,        // 0
        "#ffb74d",   // 1
        "#ffffff",   // 2
        "#000000",   // 3
        "#5d4037",   // 4
        "#fdd835"    // 5
    ];

    for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) {
            const colorIndex = catPixelArt[r][c];
            if (colorIndex !== 0) {
                ctx.fillStyle = colors[colorIndex];
                ctx.fillRect(drawX + c * pixelSize, drawY + r * pixelSize, pixelSize, pixelSize);
            }
        }
    }
    ctx.restore();
    
    // 弾丸 (文字色を黒に明示)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "24px sans-serif";
    ctx.fillStyle = "#000000";
    
    danmakuState.bullets.forEach(b => {
        ctx.fillText(b.content, b.x, b.y);
    });
}

// ==========================================
// ネル先生ウルトラクイズ
// ==========================================

window.currentQuiz = null;

window.showQuizGame = function() {
    window.switchScreen('screen-quiz');
    window.currentMode = 'quiz';
    window.currentQuiz = null;
    document.getElementById('quiz-question-text').innerText = "スタートボタンを押してにゃ！";
    document.getElementById('quiz-mic-status').innerText = "";
    document.getElementById('quiz-controls').style.display = 'none';
    document.getElementById('start-quiz-btn').style.display = 'inline-block';
    document.getElementById('start-quiz-btn').innerText = "問題スタート！";
    document.getElementById('quiz-answer-display').classList.add('hidden');
    
    // 音声入力を許可
    if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();
};

window.startQuiz = async function() {
    const btn = document.getElementById('start-quiz-btn');
    const qText = document.getElementById('quiz-question-text');
    const controls = document.getElementById('quiz-controls');
    const ansDisplay = document.getElementById('quiz-answer-display');

    btn.disabled = true;
    qText.innerText = "問題を作ってるにゃ…";
    window.updateNellMessage("問題を作ってるにゃ…", "thinking");
    ansDisplay.classList.add('hidden');

    try {
        const res = await fetch('/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grade: currentUser ? currentUser.grade : "1" })
        });
        const data = await res.json();
        
        if (data.question) {
            window.currentQuiz = data;
            qText.innerText = data.question;
            window.updateNellMessage(data.question, "normal", false, true);
            
            btn.style.display = 'none'; // スタートボタン隠す
            controls.style.display = 'flex'; // ヒント・ギブアップ表示
            btn.disabled = false;
        } else {
            throw new Error("Quiz data invalid");
        }
    } catch (e) {
        console.error(e);
        qText.innerText = "問題が作れなかったにゃ…";
        btn.disabled = false;
    }
};

window.checkQuizAnswer = function(userSpeech) {
    if (!window.currentQuiz || window.currentMode !== 'quiz') return false; 
    
    const correct = window.currentQuiz.answer;
    const accepted = window.currentQuiz.accepted_answers || [];
    const userAnswer = userSpeech.trim();
    
    // 簡易判定
    const isCorrect = userAnswer.includes(correct) || accepted.some(a => userAnswer.includes(a));
    
    const status = document.getElementById('quiz-mic-status');
    status.innerText = `「${userAnswer}」？`;

    if (isCorrect) {
        if(window.safePlay) window.safePlay(window.sfxMaru);
        window.updateNellMessage(`ピンポン！正解だにゃ！答えは「${correct}」！カリカリ30個あげるにゃ！`, "excited", false, true);
        window.giveGameReward(30);
        window.finishQuiz(true);
        return true; 
    } 
    return false; // 不正解（チャットへ）
};

window.requestQuizHint = function() {
    if (!window.currentQuiz) return;
    window.sendHttpTextInternal("ヒントを教えて");
};

window.giveUpQuiz = function() {
    if (!window.currentQuiz) return;
    window.updateNellMessage(`残念だにゃ～。正解は「${window.currentQuiz.answer}」だったにゃ！`, "gentle", false, true);
    if(window.safePlay) window.safePlay(window.sfxBatu);
    window.finishQuiz(false);
};

window.finishQuiz = function(isWin) {
    const controls = document.getElementById('quiz-controls');
    const startBtn = document.getElementById('start-quiz-btn');
    const ansDisplay = document.getElementById('quiz-answer-display');
    const ansText = document.getElementById('quiz-answer-text');

    controls.style.display = 'none';
    startBtn.style.display = 'inline-block';
    startBtn.innerText = "次の問題";
    
    if (window.currentQuiz) {
        ansText.innerText = window.currentQuiz.answer;
        ansDisplay.classList.remove('hidden');
    }
    
    window.currentQuiz = null;
};

// ==========================================
// ネル先生の漢字ドリル
// ==========================================

let kanjiState = {
    data: null,
    canvas: null,
    ctx: null,
    isDrawing: false
};

window.showKanjiGame = function() {
    window.switchScreen('screen-kanji');
    window.currentMode = 'kanji';
    
    const canvas = document.getElementById('kanji-canvas');
    kanjiState.canvas = canvas;
    kanjiState.ctx = canvas.getContext('2d');
    
    kanjiState.ctx.lineCap = 'round';
    kanjiState.ctx.lineJoin = 'round';
    kanjiState.ctx.lineWidth = 12;
    kanjiState.ctx.strokeStyle = '#000000';
    
    const startDraw = (e) => {
        kanjiState.isDrawing = true;
        const pos = getPos(e);
        kanjiState.ctx.beginPath();
        kanjiState.ctx.moveTo(pos.x, pos.y);
        e.preventDefault();
    };
    const draw = (e) => {
        if (!kanjiState.isDrawing) return;
        const pos = getPos(e);
        kanjiState.ctx.lineTo(pos.x, pos.y);
        kanjiState.ctx.stroke();
        e.preventDefault();
    };
    const endDraw = () => { kanjiState.isDrawing = false; };
    
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    canvas.onmousedown = startDraw; canvas.onmousemove = draw; canvas.onmouseup = endDraw;
    canvas.ontouchstart = startDraw; canvas.ontouchmove = draw; canvas.ontouchend = endDraw;
    
    if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();

    window.startKanji();
};

window.startKanji = async function() {
    document.getElementById('kanji-controls').style.display = 'none';
    document.getElementById('next-kanji-btn').style.display = 'none';
    document.getElementById('kanji-answer-display').classList.add('hidden');
    
    const qText = document.getElementById('kanji-question-text');
    qText.innerText = "問題を探してるにゃ…";
    window.updateNellMessage("問題を探してるにゃ…", "thinking");
    
    try {
        const res = await fetch('/generate-kanji', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grade: currentUser ? currentUser.grade : "1" })
        });
        const data = await res.json();
        
        if (data.kanji) {
            kanjiState.data = data;
            
            qText.innerText = data.question_display;
            window.updateNellMessage(data.question_speech, "normal", false, true);

            const cvs = document.getElementById('kanji-canvas');
            const mic = document.getElementById('kanji-mic-container');
            const checkBtn = document.getElementById('check-kanji-btn');
            const clearBtn = document.getElementById('clear-kanji-btn');
            
            if (data.type === 'writing') {
                cvs.classList.remove('hidden');
                mic.classList.add('hidden');
                checkBtn.style.display = 'inline-block'; 
                clearBtn.style.display = 'inline-block';
                window.clearKanjiCanvas();
            } else {
                cvs.classList.add('hidden');
                mic.classList.remove('hidden');
                checkBtn.style.display = 'none'; 
                clearBtn.style.display = 'none';
            }
            
            document.getElementById('kanji-controls').style.display = 'flex';
        }
    } catch (e) {
        console.error(e);
        qText.innerText = "問題が出せないにゃ…";
    }
};

window.clearKanjiCanvas = function() {
    if (!kanjiState.ctx) return;
    kanjiState.ctx.clearRect(0, 0, kanjiState.canvas.width, kanjiState.canvas.height);
    kanjiState.ctx.save();
    kanjiState.ctx.strokeStyle = '#eee';
    kanjiState.ctx.lineWidth = 2;
    kanjiState.ctx.setLineDash([5, 5]);
    kanjiState.ctx.beginPath();
    kanjiState.ctx.moveTo(150, 0); kanjiState.ctx.lineTo(150, 300);
    kanjiState.ctx.moveTo(0, 150); kanjiState.ctx.lineTo(300, 150);
    kanjiState.ctx.stroke();
    kanjiState.ctx.restore();
};

window.checkKanji = async function() {
    if (!kanjiState.data || kanjiState.data.type !== 'writing') return;
    
    window.updateNellMessage("採点するにゃ…じーっ…", "thinking");
    const dataUrl = kanjiState.canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    
    try {
        const res = await fetch('/check-kanji', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, targetKanji: kanjiState.data.kanji })
        });
        const data = await res.json();
        
        window.updateNellMessage(data.comment, data.is_correct ? "happy" : "gentle", false, true);
        
        if (data.is_correct) {
            if(window.safePlay) window.safePlay(window.sfxMaru);
            window.giveGameReward(10);
            window.finishKanji(true);
        } else {
            if(window.safePlay) window.safePlay(window.sfxBatu);
        }
        
    } catch(e) {
        window.updateNellMessage("よくわからなかったにゃ…", "thinking");
    }
};

window.checkKanjiReading = function(text) {
    if (!kanjiState.data || kanjiState.data.type !== 'reading') return false;
    
    const correct = kanjiState.data.reading;
    const user = text.trim();
    
    if (user.includes(correct)) {
        if(window.safePlay) window.safePlay(window.sfxMaru);
        window.updateNellMessage(`正解だにゃ！「${correct}」だにゃ！カリカリ10個あげるにゃ！`, "excited", false, true);
        window.giveGameReward(10);
        window.finishKanji(true);
        return true;
    }
    return false;
};

window.giveUpKanji = function() {
    if (!kanjiState.data) return;
    let ans = kanjiState.data.type === 'writing' ? kanjiState.data.kanji : kanjiState.data.reading;
    window.updateNellMessage(`正解は「${ans}」だにゃ。次は頑張るにゃ！`, "gentle", false, true);
    if(window.safePlay) window.safePlay(window.sfxBatu);
    window.finishKanji(false);
};

window.finishKanji = function(isWin) {
    document.getElementById('kanji-controls').style.display = 'none';
    document.getElementById('next-kanji-btn').style.display = 'inline-block';
    
    const ansDisplay = document.getElementById('kanji-answer-display');
    const ansText = document.getElementById('kanji-answer-text');
    
    let ans = kanjiState.data.type === 'writing' ? kanjiState.data.kanji : kanjiState.data.reading;
    ansText.innerText = ans;
    ansDisplay.classList.remove('hidden');
    
    kanjiState.data = null;
};

window.sendHttpTextInternal = function(text) {
    let memoryContext = ""; 
    // ※NellMemoryやcurrentUserが使える前提
    
    fetch('/chat-dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            text: text, 
            name: currentUser ? currentUser.name : "生徒",
            history: window.chatSessionHistory,
            location: window.currentLocation,
            currentQuizData: window.currentQuiz 
        })
    }).then(res => res.json()).then(data => {
        const speechText = data.speech || data.reply;
        if(typeof window.updateNellMessage === 'function') {
            window.updateNellMessage(speechText, "normal", true, true);
        }
    });
};