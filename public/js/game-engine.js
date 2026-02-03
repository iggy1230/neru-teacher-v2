// --- js/game-engine.js (v362.0: エキゾ猫ドット絵・弾幕調整版) ---

// 既存のゲーム(カリカリキャッチ)
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
// ★ VS ロボット掃除機 (弾幕ゲーム)
// ==========================================

let danmakuState = {
    running: false,
    ctx: null,
    canvas: null,
    width: 0,
    height: 0,
    score: 0,
    frame: 0,
    player: { x: 0, y: 0, r: 16 }, 
    boss: { x: 0, y: 0, r: 24, angle: 0 }, 
    bullets: [], 
    touching: false
};

// エキゾ猫(ドット絵)定義
// 0:透, 1:茶(毛), 2:白(口元), 3:黒(目/線), 4:焦茶(縞/ネクタイ), 5:黄(目)
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
        
        // 当たり判定 (半径の合計より少し小さくして遊びを持たせる)
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
    // ★修正: お邪魔ボールの割合を増やす (50%ずつ)
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
    
    // ボス (ロボット掃除機)
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
    
    // 自キャラ (エキゾ猫ドット絵)
    ctx.save();
    const pixelSize = 2; // ドットの大きさ
    const catW = 16 * pixelSize;
    const catH = 16 * pixelSize;
    // 中心に描画するためのオフセット
    const drawX = danmakuState.player.x - catW / 2;
    const drawY = danmakuState.player.y - catH / 2;

    const colors = [
        null,        // 0: 透明
        "#ffb74d",   // 1: 茶(毛)
        "#ffffff",   // 2: 白(口元)
        "#000000",   // 3: 黒(目/線)
        "#5d4037",   // 4: 焦茶(縞/ネクタイ)
        "#fdd835"    // 5: 黄(目)
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
    
    // 弾丸 (文字)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "24px sans-serif";
    // ★修正: 文字色を明示的に黒にする（背景色と同化して透明に見えるバグを修正）
    ctx.fillStyle = "#000000"; 
    
    danmakuState.bullets.forEach(b => {
        ctx.fillText(b.content, b.x, b.y);
    });
}