// --- js/game-engine.js (完全版 v373.0: なぞなぞモード実装版) ---

// ==========================================
// 1. カリカリキャッチ
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
    window.ctx.beginPath(); window.ctx.arc(window.ball.x, window.ball.y, window.ball.r, 0, Math.PI*2); window.ctx.fillStyle = "#ff5722"; window.ctx.fill(); window.ctx.closePath();
    window.ctx.beginPath(); window.ctx.rect(window.paddle.x, window.paddle.y, window.paddle.w, window.paddle.h); window.ctx.fillStyle = "#8d6e63"; window.ctx.fill(); window.ctx.closePath();
    window.bricks.forEach(b => {
        if(b.status === 1) {
            window.ctx.beginPath(); window.ctx.font = "20px sans-serif"; window.ctx.textAlign = "center"; window.ctx.textBaseline = "middle"; window.ctx.fillText("🍖", b.x + b.w/2, b.y + b.h/2); window.ctx.closePath();
        }
    });
    window.ball.x += window.ball.dx; window.ball.y += window.ball.dy;
    if(window.ball.x + window.ball.dx > window.gameCanvas.width - window.ball.r || window.ball.x + window.ball.dx < window.ball.r) window.ball.dx = -window.ball.dx;
    if(window.ball.y + window.ball.dy < window.ball.r) window.ball.dy = -window.ball.dy;
    if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r - 30) {
        if(window.ball.x > window.paddle.x && window.ball.x < window.paddle.x + window.paddle.w) {
            window.ball.dy = -window.ball.dy; if(window.safePlay) window.safePlay(window.sfxPaddle);
        } else if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r) {
            window.gameRunning = false; if(window.safePlay) window.safePlay(window.sfxOver);
            if (window.score > 0) { window.giveGameReward(window.score); if(typeof window.updateNellMessage === 'function') window.updateNellMessage(`あ〜あ、落ちちゃったにゃ…。でも${window.score}個ゲットだにゃ！`, "sad"); } else { if(typeof window.updateNellMessage === 'function') window.updateNellMessage("あ〜あ、落ちちゃったにゃ…", "sad"); }
            window.fetchGameComment("end", window.score);
            const startBtn = document.getElementById('start-game-btn'); if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
            return;
        }
    }
    let allCleared = true;
    window.bricks.forEach(b => {
        if(b.status === 1) {
            allCleared = false;
            if(window.ball.x > b.x && window.ball.x < b.x + b.w && window.ball.y > b.y && window.ball.y < b.y + b.h) {
                window.ball.dy = -window.ball.dy; b.status = 0; window.score += 10;
                const scoreEl = document.getElementById('game-score'); if(scoreEl) scoreEl.innerText = window.score;
                if(window.safePlay) window.safePlay(window.sfxHit);
            }
        }
    });
    if (allCleared) {
        window.gameRunning = false; window.giveGameReward(window.score);
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage(`全部取ったにゃ！すごいにゃ！！${window.score}個ゲットだにゃ！`, "excited");
        window.fetchGameComment("end", window.score);
        const startBtn = document.getElementById('start-game-btn'); if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
        return;
    }
    window.gameAnimId = requestAnimationFrame(window.drawGame);
};

// ==========================================
// 2. VS ロボット掃除機
// ==========================================
let danmakuState = { running: false, ctx: null, canvas: null, width: 0, height: 0, score: 0, frame: 0, player: { x: 0, y: 0, r: 16 }, boss: { x: 0, y: 0, r: 24, angle: 0 }, bullets: [], touching: false };
const catPixelArt = [ [0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0], [0,0,0,1,1,1,1,0,0,0,0,1,1,1,1,0], [0,0,1,1,1,1,1,1,0,0,1,1,1,1,1,1], [0,1,1,1,1,4,4,1,1,1,1,4,4,1,1,1], [1,1,1,1,4,4,4,4,1,1,4,4,4,4,1,1], [1,1,1,3,5,5,3,1,1,1,3,5,5,3,1,1], [1,1,1,5,3,3,5,1,1,1,5,3,3,5,1,1], [1,1,1,3,5,5,3,1,1,1,3,5,5,3,1,1], [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], [1,1,1,1,2,2,2,3,3,2,2,2,1,1,1,1], [0,1,1,2,2,2,3,4,4,3,2,2,2,1,1,0], [0,0,1,2,2,2,4,4,4,4,2,2,2,1,0,0], [0,0,0,1,1,2,2,2,2,2,2,1,1,0,0,0], [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], [0,0,0,0,4,4,4,4,4,4,4,4,0,0,0,0], [0,0,0,0,4,0,0,4,4,0,0,4,0,0,0,0] ];
window.showDanmakuGame = function() {
    window.switchScreen('screen-danmaku'); document.getElementById('mini-karikari-display').classList.remove('hidden');
    if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
    const canvas = document.getElementById('danmaku-canvas'); danmakuState.canvas = canvas; danmakuState.ctx = canvas.getContext('2d'); danmakuState.width = canvas.width; danmakuState.height = canvas.height;
    danmakuState.running = false; danmakuState.score = 0; document.getElementById('danmaku-score').innerText = "0";
    const startBtn = document.getElementById('start-danmaku-btn'); startBtn.disabled = false; startBtn.innerText = "スタート！";
    window.updateNellMessage("ロボット掃除機からカリカリを守るにゃ！茶色は取って、他は避けるにゃ！", "excited", false);
    const moveHandler = (e) => { if (!danmakuState.running) return; e.preventDefault(); const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; let x = clientX - rect.left; let y = clientY - rect.top; x = Math.max(danmakuState.player.r, Math.min(danmakuState.width - danmakuState.player.r, x)); y = Math.max(danmakuState.player.r, Math.min(danmakuState.height - danmakuState.player.r, y)); danmakuState.player.x = x; danmakuState.player.y = y; };
    canvas.onmousedown = (e) => { danmakuState.touching = true; moveHandler(e); }; canvas.onmousemove = (e) => { if(danmakuState.touching) moveHandler(e); }; canvas.onmouseup = () => { danmakuState.touching = false; }; canvas.onmouseleave = () => { danmakuState.touching = false; }; canvas.ontouchstart = (e) => { danmakuState.touching = true; moveHandler(e); }; canvas.ontouchmove = moveHandler; canvas.ontouchend = () => { danmakuState.touching = false; };
    initDanmakuEntities(); drawDanmakuFrame();
};
function initDanmakuEntities() { danmakuState.player.x = danmakuState.width / 2; danmakuState.player.y = danmakuState.height - 50; danmakuState.boss.x = danmakuState.width / 2; danmakuState.boss.y = 100; danmakuState.bullets = []; danmakuState.frame = 0; }
window.startDanmakuGame = function() { if (danmakuState.running) return; initDanmakuEntities(); danmakuState.score = 0; document.getElementById('danmaku-score').innerText = "0"; danmakuState.running = true; document.getElementById('start-danmaku-btn').disabled = true; loopDanmakuGame(); };
window.stopDanmakuGame = function() { danmakuState.running = false; };
function loopDanmakuGame() { if (!danmakuState.running) return; updateDanmaku(); drawDanmakuFrame(); requestAnimationFrame(loopDanmakuGame); }
function updateDanmaku() {
    danmakuState.frame++; danmakuState.boss.x = (danmakuState.width / 2) + Math.sin(danmakuState.frame * 0.02) * 100; danmakuState.boss.angle += 0.05; 
    let spawnRate = Math.max(10, 60 - Math.floor(danmakuState.score / 50)); if (danmakuState.frame % spawnRate === 0) spawnBullet();
    for (let i = danmakuState.bullets.length - 1; i >= 0; i--) {
        let b = danmakuState.bullets[i]; b.x += b.vx; b.y += b.vy;
        if (b.y > danmakuState.height + 20 || b.x < -20 || b.x > danmakuState.width + 20 || b.y < -20) { danmakuState.bullets.splice(i, 1); continue; }
        let dx = b.x - danmakuState.player.x; let dy = b.y - danmakuState.player.y; let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < danmakuState.player.r + b.r - 4) {
            if (b.type === 'good') { danmakuState.score += 10; document.getElementById('danmaku-score').innerText = danmakuState.score; if(window.safePlay) window.safePlay(window.sfxHit); danmakuState.bullets.splice(i, 1); } 
            else { gameOverDanmaku(); return; }
        }
    }
}
function spawnBullet() {
    let type = Math.random() < 0.5 ? 'good' : 'bad'; let content = '🍖';
    if (type === 'bad') { const bads = ['🐭', '⚽', '⚾']; content = bads[Math.floor(Math.random() * bads.length)]; }
    let angle = Math.atan2(danmakuState.player.y - danmakuState.boss.y, danmakuState.player.x - danmakuState.boss.x); angle += (Math.random() - 0.5) * 1.0; 
    let speed = 2 + Math.random() * 2 + (danmakuState.score / 500); 
    danmakuState.bullets.push({ x: danmakuState.boss.x, y: danmakuState.boss.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 12, type: type, content: content });
}
function gameOverDanmaku() {
    danmakuState.running = false; if(window.safePlay) window.safePlay(window.sfxOver);
    if (danmakuState.score > 0) { window.giveGameReward(danmakuState.score); window.updateNellMessage(`あぶにゃい！ぶつかったにゃ！でも${danmakuState.score}個ゲットだにゃ！`, "sad"); } 
    else { window.updateNellMessage("すぐにぶつかっちゃったにゃ…", "sad"); }
    const startBtn = document.getElementById('start-danmaku-btn'); startBtn.disabled = false; startBtn.innerText = "もう一回！";
}
function drawDanmakuFrame() {
    const ctx = danmakuState.ctx; const w = danmakuState.width; const h = danmakuState.height; ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f5deb3"; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = "#deb887"; ctx.lineWidth = 2; for(let i=0; i<h; i+=40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    ctx.save(); ctx.translate(danmakuState.boss.x, danmakuState.boss.y); ctx.rotate(danmakuState.boss.angle);
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI*2); ctx.fillStyle = "#333"; ctx.fill(); ctx.strokeStyle = "#ccc"; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -10, 4, 0, Math.PI*2); ctx.fillStyle = "#0f0"; ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(danmakuState.player.x, danmakuState.player.y);
    const pixelSize = 2; const catW = 16 * pixelSize; const catH = 16 * pixelSize; const drawX = -catW / 2; const drawY = -catH / 2;
    const colors = [null, "#ffb74d", "#ffffff", "#000000", "#5d4037", "#fdd835"];
    for (let r = 0; r < 16; r++) { for (let c = 0; c < 16; c++) { const colorIndex = catPixelArt[r][c]; if (colorIndex !== 0) { ctx.fillStyle = colors[colorIndex]; ctx.fillRect(drawX + c * pixelSize, drawY + r * pixelSize, pixelSize, pixelSize); } } }
    ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "24px sans-serif"; ctx.fillStyle = "#000000";
    danmakuState.bullets.forEach(b => { ctx.fillText(b.content, b.x, b.y); });
}

// ==========================================
// 3. ウルトラクイズ
// ==========================================

let quizState = {
    currentQuestionIndex: 0,
    maxQuestions: 5,
    score: 0,
    currentQuizData: null,
    nextQuizData: null,
    genre: "全ジャンル",
    isFinished: false
};

async function fetchQuizData(genre) {
    const res = await fetch('/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            grade: currentUser ? currentUser.grade : "1",
            genre: genre 
        })
    });
    return await res.json();
}

window.showQuizGame = function() {
    window.switchScreen('screen-quiz');
    window.currentMode = 'quiz';
    
    // UI初期化
    document.getElementById('quiz-genre-select').classList.remove('hidden');
    document.getElementById('quiz-game-area').classList.add('hidden');
    window.updateNellMessage("どのジャンルに挑戦するにゃ？", "normal");
};

window.startQuizSet = async function(genre) {
    quizState.genre = genre;
    quizState.currentQuestionIndex = 0;
    quizState.score = 0;
    quizState.isFinished = false;
    quizState.currentQuizData = null;
    quizState.nextQuizData = null;

    document.getElementById('quiz-genre-select').classList.add('hidden');
    document.getElementById('quiz-game-area').classList.remove('hidden');
    document.getElementById('quiz-genre-label').innerText = genre;

    // 音声認識開始
    if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();

    // 最初の問題へ
    window.nextQuiz();
};

window.nextQuiz = async function() {
    if (quizState.currentQuestionIndex >= quizState.maxQuestions) {
        window.finishQuizSet();
        return;
    }

    quizState.currentQuestionIndex++;
    document.getElementById('quiz-progress').innerText = `${quizState.currentQuestionIndex}/${quizState.maxQuestions} 問目`;
    
    // UIリセット
    const qText = document.getElementById('quiz-question-text');
    const controls = document.getElementById('quiz-controls');
    const nextBtn = document.getElementById('next-quiz-btn');
    const ansDisplay = document.getElementById('quiz-answer-display');
    const micStatus = document.getElementById('quiz-mic-status');

    qText.innerText = "問題を作ってるにゃ…";
    window.updateNellMessage("問題を作ってるにゃ…", "thinking");
    micStatus.innerText = "";
    ansDisplay.classList.add('hidden');
    controls.style.display = 'none';
    nextBtn.classList.add('hidden');
    
    // データ取得 (プリフェッチがあればそれを使う)
    let quizData = null;
    if (quizState.nextQuizData) {
        quizData = quizState.nextQuizData;
        quizState.nextQuizData = null;
    } else {
        try {
            quizData = await fetchQuizData(quizState.genre);
        } catch (e) {
            console.error(e);
            qText.innerText = "問題が作れなかったにゃ…";
            setTimeout(() => window.showQuizGame(), 2000);
            return;
        }
    }

    if (quizData && quizData.question) {
        window.currentQuiz = quizData; 
        quizState.currentQuizData = quizData;
        
        qText.innerText = quizData.question;
        window.updateNellMessage(quizData.question, "normal", false, true);
        
        controls.style.display = 'flex';
        
        // 次の問題を裏で取得
        fetchQuizData(quizState.genre).then(data => { quizState.nextQuizData = data; }).catch(err => console.warn("Pre-fetch failed", err));
    } else {
        qText.innerText = "エラーだにゃ…";
    }
};

window.checkQuizAnswer = function(userSpeech) {
    if (!window.currentQuiz || window.currentMode !== 'quiz') return false; 
    if (!document.getElementById('quiz-answer-display').classList.contains('hidden')) return false;

    const correct = window.currentQuiz.answer;
    const accepted = window.currentQuiz.accepted_answers || [];
    const userAnswer = userSpeech.trim();
    const isCorrect = userAnswer.includes(correct) || accepted.some(a => userAnswer.includes(a));
    
    const status = document.getElementById('quiz-mic-status');
    status.innerText = `「${userAnswer}」？`;
    
    if (isCorrect) {
        if(window.safePlay) window.safePlay(window.sfxMaru);
        window.updateNellMessage(`ピンポン！正解だにゃ！答えは「${correct}」！`, "excited", false, true);
        quizState.score += 20; 
        window.showQuizResult(true);
        return true; 
    } 
    return false; 
};

window.requestQuizHint = function() {
    if (!window.currentQuiz) return;
    window.sendHttpTextInternal("ヒントを教えて");
};

window.giveUpQuiz = function() {
    if (!window.currentQuiz) return;
    if(window.safePlay) window.safePlay(window.sfxBatu);
    window.updateNellMessage(`残念だにゃ～。正解は「${window.currentQuiz.answer}」だったにゃ！`, "gentle", false, true);
    window.showQuizResult(false);
};

window.showQuizResult = function(isWin) {
    const controls = document.getElementById('quiz-controls');
    const nextBtn = document.getElementById('next-quiz-btn');
    const ansDisplay = document.getElementById('quiz-answer-display');
    const ansText = document.getElementById('quiz-answer-text');

    const btns = controls.querySelectorAll('button:not(#next-quiz-btn)');
    btns.forEach(b => b.classList.add('hidden'));
    
    nextBtn.classList.remove('hidden');
    controls.style.display = 'flex';

    if (window.currentQuiz) {
        ansText.innerText = window.currentQuiz.answer;
        ansDisplay.classList.remove('hidden');
    }
};

window.finishQuizSet = function() {
    quizState.isFinished = true;
    window.currentQuiz = null;

    let msg = "";
    let mood = "normal";
    if (quizState.score === 100) {
        msg = "全問正解！天才だにゃ！！カリカリ100個あげるにゃ！";
        mood = "excited";
        window.giveGameReward(100);
    } else if (quizState.score >= 60) {
        msg = `${quizState.score}点！よくがんばったにゃ！カリカリ${quizState.score}個あげるにゃ！`;
        mood = "happy";
        window.giveGameReward(quizState.score);
    } else {
        msg = `${quizState.score}点だったにゃ。次はもっとがんばるにゃ！カリカリ10個あげるにゃ。`;
        mood = "gentle";
        window.giveGameReward(10);
    }

    window.updateNellMessage(msg, mood, false, true);
    alert(msg);
    
    window.showQuizGame();
};

// ==========================================
// 4. ★新規: ネル先生のなぞなぞ
// ==========================================

let riddleState = {
    currentRiddle: null,
    nextRiddle: null,
    isFinished: false
};

async function fetchRiddleData() {
    const res = await fetch('/generate-riddle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            grade: currentUser ? currentUser.grade : "1"
        })
    });
    return await res.json();
}

window.showRiddleGame = function() {
    if(typeof window.selectMode === 'function') window.selectMode('riddle');
    else {
        // フォールバック
        window.switchScreen('screen-riddle');
        window.currentMode = 'riddle';
    }
};

window.startRiddle = async function() {
    const startBtn = document.getElementById('start-riddle-btn');
    startBtn.style.display = 'none';
    
    document.getElementById('riddle-controls').style.display = 'flex';
    document.getElementById('riddle-answer-display').classList.add('hidden');
    
    // 音声認識開始
    if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();
    
    window.nextRiddle();
};

window.nextRiddle = async function() {
    // UIリセット
    const qText = document.getElementById('riddle-question-text');
    const controls = document.getElementById('riddle-controls');
    const nextBtn = document.getElementById('next-riddle-btn');
    const ansDisplay = document.getElementById('riddle-answer-display');
    const micStatus = document.getElementById('riddle-mic-status');
    const giveUpBtn = controls.querySelector('button.gray-btn'); // 答えを見るボタン

    qText.innerText = "なぞなぞを考えてるにゃ…";
    window.updateNellMessage("なぞなぞを考えてるにゃ…", "thinking");
    micStatus.innerText = "";
    ansDisplay.classList.add('hidden');
    nextBtn.classList.add('hidden');
    if(giveUpBtn) giveUpBtn.classList.remove('hidden');
    
    let riddleData = null;
    if (riddleState.nextRiddle) {
        riddleData = riddleState.nextRiddle;
        riddleState.nextRiddle = null;
    } else {
        try {
            riddleData = await fetchRiddleData();
        } catch (e) {
            console.error(e);
            qText.innerText = "なぞなぞが作れなかったにゃ…";
            setTimeout(() => {
                document.getElementById('start-riddle-btn').style.display = 'inline-block';
                controls.style.display = 'none';
            }, 2000);
            return;
        }
    }

    if (riddleData && riddleData.question) {
        riddleState.currentRiddle = riddleData;
        // グローバル変数にも入れる（音声認識用）
        window.currentRiddle = riddleData; 
        
        qText.innerText = riddleData.question;
        window.updateNellMessage(riddleData.question, "normal", false, true);
        
        // 次のなぞなぞを裏で取得
        fetchRiddleData().then(data => { riddleState.nextRiddle = data; }).catch(err => console.warn("Pre-fetch failed", err));
    } else {
        qText.innerText = "エラーだにゃ…";
    }
};

window.checkRiddleAnswer = function(userSpeech) {
    if (!riddleState.currentRiddle || window.currentMode !== 'riddle') return false; 
    
    // すでに回答済みなら無視
    if (!document.getElementById('riddle-answer-display').classList.contains('hidden')) return false;

    const correct = riddleState.currentRiddle.answer;
    const accepted = riddleState.currentRiddle.accepted_answers || [];
    const userAnswer = userSpeech.trim();
    
    // 部分一致で判定（なぞなぞは言い回しが多様なため）
    const isCorrect = userAnswer.includes(correct) || accepted.some(a => userAnswer.includes(a));
    
    const status = document.getElementById('riddle-mic-status');
    status.innerText = `「${userAnswer}」？`;
    
    if (isCorrect) {
        if(window.safePlay) window.safePlay(window.sfxMaru);
        window.updateNellMessage(`大正解だにゃ！答えは「${correct}」！カリカリ20個あげるにゃ！`, "excited", false, true);
        window.giveGameReward(20);
        window.showRiddleResult(true);
        return true; 
    } 
    return false; 
};

window.giveUpRiddle = function() {
    if (!riddleState.currentRiddle) return;
    if(window.safePlay) window.safePlay(window.sfxBatu);
    window.updateNellMessage(`答えは「${riddleState.currentRiddle.answer}」だったにゃ！`, "gentle", false, true);
    window.showRiddleResult(false);
};

window.showRiddleResult = function(isWin) {
    const controls = document.getElementById('riddle-controls');
    const nextBtn = document.getElementById('next-riddle-btn');
    const ansDisplay = document.getElementById('riddle-answer-display');
    const ansText = document.getElementById('riddle-answer-text');
    const giveUpBtn = controls.querySelector('button.gray-btn');

    if(giveUpBtn) giveUpBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');

    if (riddleState.currentRiddle) {
        ansText.innerText = riddleState.currentRiddle.answer;
        ansDisplay.classList.remove('hidden');
    }
};

// ==========================================
// 5. ネル先生の漢字ドリル
// ==========================================
let kanjiState = { data: null, canvas: null, ctx: null, isDrawing: false, mode: 'writing', questionCount: 0, maxQuestions: 5 };

window.showKanjiMenu = function() {
    window.switchScreen('screen-kanji');
    document.getElementById('kanji-menu-container').classList.remove('hidden');
    document.getElementById('kanji-game-container').classList.add('hidden');
    document.getElementById('kanji-menu-container').style.display = 'block';
};

window.startKanjiSet = function(mode) {
    window.currentMode = 'kanji';
    kanjiState.mode = mode;
    kanjiState.questionCount = 0;
    document.getElementById('kanji-menu-container').style.display = 'none';
    document.getElementById('kanji-game-container').classList.remove('hidden');
    const canvas = document.getElementById('kanji-canvas');
    kanjiState.canvas = canvas; kanjiState.ctx = canvas.getContext('2d');
    kanjiState.ctx.lineCap = 'round'; kanjiState.ctx.lineJoin = 'round'; kanjiState.ctx.lineWidth = 12; kanjiState.ctx.strokeStyle = '#000000';
    const startDraw = (e) => { kanjiState.isDrawing = true; const pos = getPos(e); kanjiState.ctx.beginPath(); kanjiState.ctx.moveTo(pos.x, pos.y); e.preventDefault(); };
    const draw = (e) => { if (!kanjiState.isDrawing) return; const pos = getPos(e); kanjiState.ctx.lineTo(pos.x, pos.y); kanjiState.ctx.stroke(); e.preventDefault(); };
    const endDraw = () => { kanjiState.isDrawing = false; };
    const getPos = (e) => { const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: clientX - rect.left, y: clientY - rect.top }; };
    canvas.onmousedown = startDraw; canvas.onmousemove = draw; canvas.onmouseup = endDraw;
    canvas.ontouchstart = startDraw; canvas.ontouchmove = draw; canvas.ontouchend = endDraw;
    if(typeof window.startAlwaysOnListening === 'function') window.startAlwaysOnListening();
    window.nextKanjiQuestion();
};

window.nextKanjiQuestion = async function() {
    if (kanjiState.questionCount >= kanjiState.maxQuestions) {
        window.updateNellMessage("5問クリア！よくがんばったにゃ！", "excited", false, true);
        setTimeout(() => { alert("おつかれさま！メニューに戻るにゃ。"); window.showKanjiMenu(); }, 2000);
        return;
    }
    kanjiState.questionCount++;
    document.getElementById('kanji-progress').innerText = `${kanjiState.questionCount}/${kanjiState.maxQuestions} 問目`;
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
            body: JSON.stringify({ grade: currentUser ? currentUser.grade : "1", mode: kanjiState.mode })
        });
        const data = await res.json();
        if (data && data.kanji) {
            kanjiState.data = data;
            qText.innerText = data.question_display;
            window.updateNellMessage(data.question_speech, "normal", false, true);
            const cvs = document.getElementById('kanji-canvas');
            const mic = document.getElementById('kanji-mic-container');
            const checkBtn = document.getElementById('check-kanji-btn');
            const clearBtn = document.getElementById('clear-kanji-btn');
            if (data.type === 'writing') {
                cvs.classList.remove('hidden'); mic.classList.add('hidden'); checkBtn.style.display = 'inline-block'; clearBtn.style.display = 'inline-block'; window.clearKanjiCanvas();
            } else {
                cvs.classList.add('hidden'); mic.classList.remove('hidden'); checkBtn.style.display = 'none'; clearBtn.style.display = 'none';
            }
            document.getElementById('kanji-controls').style.display = 'flex';
        } else { throw new Error("Invalid Kanji Data"); }
    } catch (e) {
        console.error(e); qText.innerText = "問題が出せないにゃ…"; window.updateNellMessage("ごめん、問題が出せないにゃ…", "sad");
    }
};

window.clearKanjiCanvas = function() {
    if (!kanjiState.ctx) return;
    kanjiState.ctx.clearRect(0, 0, kanjiState.canvas.width, kanjiState.canvas.height);
    kanjiState.ctx.save();
    kanjiState.ctx.strokeStyle = '#eee'; kanjiState.ctx.lineWidth = 2; kanjiState.ctx.setLineDash([5, 5]);
    kanjiState.ctx.beginPath(); kanjiState.ctx.moveTo(150, 0); kanjiState.ctx.lineTo(150, 300); kanjiState.ctx.moveTo(0, 150); kanjiState.ctx.lineTo(300, 150); kanjiState.ctx.stroke();
    kanjiState.ctx.restore();
};

window.checkKanji = async function() {
    if (!kanjiState.data || kanjiState.data.type !== 'writing') return;
    window.updateNellMessage("採点するにゃ…じーっ…", "thinking");
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = kanjiState.canvas.width; tempCanvas.height = kanjiState.canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.fillStyle = '#ffffff'; tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tCtx.drawImage(kanjiState.canvas, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    try {
        const res = await fetch('/check-kanji', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, targetKanji: kanjiState.data.kanji })
        });
        const data = await res.json();
        window.updateNellMessage(data.comment, data.is_correct ? "happy" : "gentle", false, true);
        if (data.is_correct) {
            if(window.safePlay) window.safePlay(window.sfxMaru);
            window.giveGameReward(10);
            document.getElementById('kanji-controls').style.display = 'none';
            document.getElementById('next-kanji-btn').style.display = 'inline-block';
            document.getElementById('kanji-answer-display').classList.remove('hidden');
            document.getElementById('kanji-answer-text').innerText = kanjiState.data.kanji;
        } else {
            if(window.safePlay) window.safePlay(window.sfxBatu);
        }
    } catch(e) { window.updateNellMessage("よくわからなかったにゃ…", "thinking"); }
};

window.checkKanjiReading = function(text) {
    if (!kanjiState.data || kanjiState.data.type !== 'reading') return false;
    const correctHiragana = kanjiState.data.reading;
    const correctKanji = kanjiState.data.kanji;
    const correctKatakana = correctHiragana.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    const user = text.trim();
    if (user.includes(correctHiragana) || user.includes(correctKanji) || user.includes(correctKatakana)) {
        if(window.safePlay) window.safePlay(window.sfxMaru);
        window.updateNellMessage(`正解だにゃ！「${correctHiragana}」だにゃ！カリカリ10個あげるにゃ！`, "excited", false, true);
        window.giveGameReward(10);
        document.getElementById('kanji-controls').style.display = 'none';
        document.getElementById('next-kanji-btn').style.display = 'inline-block';
        document.getElementById('kanji-answer-display').classList.remove('hidden');
        document.getElementById('kanji-answer-text').innerText = correctHiragana;
        return true;
    }
    return false;
};

window.giveUpKanji = function() {
    if (!kanjiState.data) return;
    let ans = kanjiState.data.type === 'writing' ? kanjiState.data.kanji : kanjiState.data.reading;
    window.updateNellMessage(`正解は「${ans}」だにゃ。次は頑張るにゃ！`, "gentle", false, true);
    if(window.safePlay) window.safePlay(window.sfxBatu);
    document.getElementById('kanji-controls').style.display = 'none';
    document.getElementById('next-kanji-btn').style.display = 'inline-block';
    document.getElementById('kanji-answer-display').classList.remove('hidden');
    document.getElementById('kanji-answer-text').innerText = ans;
};

window.sendHttpTextInternal = function(text) {
    fetch('/chat-dialogue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, name: currentUser ? currentUser.name : "生徒", history: window.chatSessionHistory, location: window.currentLocation, currentQuizData: window.currentQuiz })
    }).then(res => res.json()).then(data => {
        const speechText = data.speech || data.reply;
        if(typeof window.updateNellMessage === 'function') { window.updateNellMessage(speechText, "normal", true, true); }
    });
};

// ==========================================
// 6. ネル先生のミニテスト
// ==========================================

let minitestState = {
    currentQuestionIndex: 0,
    maxQuestions: 5,
    currentQuestionData: null,
    subject: null,
    score: 0
};

window.showMinitestMenu = function() {
    window.switchScreen('screen-minitest');
    window.currentMode = 'minitest';
    // メニュー表示、ゲームエリア非表示
    document.getElementById('minitest-subject-select').classList.remove('hidden');
    document.getElementById('minitest-game-area').classList.add('hidden');
};

window.startMinitest = function(subject) {
    minitestState.subject = subject;
    minitestState.currentQuestionIndex = 0;
    minitestState.score = 0;
    
    document.getElementById('minitest-subject-select').classList.add('hidden');
    document.getElementById('minitest-game-area').classList.remove('hidden');
    
    window.updateNellMessage(`${subject}のテストだにゃ！がんばるにゃ！`, "excited");
    window.nextMinitestQuestion();
};

window.nextMinitestQuestion = async function() {
    if (minitestState.currentQuestionIndex >= minitestState.maxQuestions) {
        // テスト終了
        const resultMsg = `${minitestState.score}点だったにゃ！おつかれさま！`;
        window.updateNellMessage(resultMsg, "happy", false, true);
        alert(resultMsg);
        window.showMinitestMenu();
        return;
    }

    minitestState.currentQuestionIndex++;
    document.getElementById('minitest-progress').innerText = `${minitestState.currentQuestionIndex} / ${minitestState.maxQuestions} 問目`;
    
    // UIリセット
    const qText = document.getElementById('minitest-question');
    const optionsDiv = document.getElementById('minitest-options');
    const explanationArea = document.getElementById('minitest-explanation-area');
    
    qText.innerText = "問題を作成中にゃ...";
    optionsDiv.innerHTML = "";
    explanationArea.classList.add('hidden');
    
    try {
        const res = await fetch('/generate-minitest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                grade: currentUser ? currentUser.grade : "1",
                subject: minitestState.subject 
            })
        });
        const data = await res.json();
        
        if (data.question && data.options) {
            minitestState.currentQuestionData = data;
            
            // 問題表示
            qText.innerText = data.question;
            window.updateNellMessage("さあ、どっちが正解かにゃ？", "normal", false, true); // 読み上げは省略またはタイトルのみ
            
            // 選択肢シャッフル表示
            const shuffledOptions = [...data.options].sort(() => Math.random() - 0.5);
            
            shuffledOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = "minitest-option-btn";
                btn.innerText = opt;
                btn.onclick = () => window.checkMinitestAnswer(opt, btn);
                optionsDiv.appendChild(btn);
            });
            
        } else {
            throw new Error("Invalid Minitest Data");
        }
    } catch (e) {
        console.error(e);
        qText.innerText = "エラーが発生したにゃ。";
        // リトライボタンなど
    }
};

window.checkMinitestAnswer = function(selectedAnswer, btnElement) {
    // 二重押し防止
    const buttons = document.querySelectorAll('.minitest-option-btn');
    buttons.forEach(b => b.disabled = true);
    
    const correct = minitestState.currentQuestionData.answer;
    const isCorrect = (selectedAnswer === correct);
    
    if (isCorrect) {
        btnElement.classList.add('minitest-correct');
        if(window.safePlay) window.safePlay(window.sfxMaru);
        window.updateNellMessage("正解だにゃ！すごい！", "excited", false, true);
        minitestState.score += 20; // 1問20点x5問=100点満点
        // 報酬
        window.giveGameReward(10);
    } else {
        btnElement.classList.add('minitest-wrong');
        // 正解のボタンを緑にする
        buttons.forEach(b => {
            if (b.innerText === correct) b.classList.add('minitest-correct');
        });
        if(window.safePlay) window.safePlay(window.sfxBatu);
        window.updateNellMessage("残念...正解はこっちだにゃ。", "gentle", false, true);
    }
    
    // 解説表示
    const expArea = document.getElementById('minitest-explanation-area');
    const expText = document.getElementById('minitest-explanation-text');
    if (minitestState.currentQuestionData.explanation) {
        expText.innerText = minitestState.currentQuestionData.explanation;
        expArea.classList.remove('hidden');
    } else {
        // 解説がない場合はすぐに次へ進めるようにボタンだけ表示（または自動遷移）
        // ここでは解説エリアを流用してボタンだけ出す
        expText.innerText = ""; 
        expArea.classList.remove('hidden');
    }
};