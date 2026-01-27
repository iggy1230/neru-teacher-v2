// --- js/game-engine.js (v293.0: カリカリ・キャッチ ゲームロジック) ---

window.initGame = function() {
    window.gameCanvas = document.getElementById('game-canvas');
    if(!window.gameCanvas) return;
    window.ctx = window.gameCanvas.getContext('2d');
    
    // パドルとボールの初期化
    window.paddle = { x: window.gameCanvas.width / 2 - 40, y: window.gameCanvas.height - 30, w: 80, h: 10 };
    window.ball = { x: window.gameCanvas.width / 2, y: window.gameCanvas.height - 40, r: 8, dx: 4, dy: -4 };
    window.score = 0;
    
    const scoreEl = document.getElementById('game-score');
    if(scoreEl) scoreEl.innerText = window.score;
    
    // カリカリ(ブロック)配置
    window.bricks = [];
    for(let c=0; c<5; c++) {
        for(let r=0; r<4; r++) {
            window.bricks.push({ x: 30 + c*55, y: 30 + r*30, w: 40, h: 20, status: 1 });
        }
    }
    
    // 操作イベント
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

window.drawGame = function() {
    if(!window.gameRunning) return;
    window.ctx.clearRect(0, 0, window.gameCanvas.width, window.gameCanvas.height);
    
    // ボール描画
    window.ctx.beginPath();
    window.ctx.arc(window.ball.x, window.ball.y, window.ball.r, 0, Math.PI*2);
    window.ctx.fillStyle = "#ff5722";
    window.ctx.fill();
    window.ctx.closePath();
    
    // パドル描画
    window.ctx.beginPath();
    window.ctx.rect(window.paddle.x, window.paddle.y, window.paddle.w, window.paddle.h);
    window.ctx.fillStyle = "#8d6e63";
    window.ctx.fill();
    window.ctx.closePath();
    
    // カリカリ描画
    window.bricks.forEach(b => {
        if(b.status === 1) {
            window.ctx.beginPath();
            window.ctx.rect(b.x, b.y, b.w, b.h);
            window.ctx.fillStyle = "#ffb74d"; // カリカリ色
            window.ctx.fill();
            window.ctx.closePath();
        }
    });
    
    // 移動計算
    window.ball.x += window.ball.dx;
    window.ball.y += window.ball.dy;
    
    // 壁反射
    if(window.ball.x + window.ball.dx > window.gameCanvas.width - window.ball.r || window.ball.x + window.ball.dx < window.ball.r) window.ball.dx = -window.ball.dx;
    if(window.ball.y + window.ball.dy < window.ball.r) window.ball.dy = -window.ball.dy;
    
    // パドル衝突判定
    if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r - 30) {
        if(window.ball.x > window.paddle.x && window.ball.x < window.paddle.x + window.paddle.w) {
            window.ball.dy = -window.ball.dy;
            if(window.safePlay) window.safePlay(window.sfxPaddle);
        } else if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r) {
            // ゲームオーバー処理
            window.gameRunning = false;
            if(window.safePlay) window.safePlay(window.sfxOver);
            if(typeof window.updateNellMessage === 'function') window.updateNellMessage("あ〜あ、落ちちゃったにゃ…", "sad");
            if(typeof window.fetchGameComment === 'function') window.fetchGameComment("end", window.score);
            
            const startBtn = document.getElementById('start-game-btn');
            if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
            return;
        }
    }
    
    // カリカリ衝突判定
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
                
                // 応援コメント
                if (window.score % 50 === 0) {
                    const comment = window.gameHitComments[Math.floor(Math.random() * window.gameHitComments.length)];
                    if(typeof window.updateNellMessage === 'function') window.updateNellMessage(comment, "excited", false, false);
                }
            }
        }
    });
    
    // クリア判定
    if (allCleared) {
        window.gameRunning = false;
        if(typeof window.updateNellMessage === 'function') window.updateNellMessage("全部取ったにゃ！すごいにゃ！！", "excited");
        
        // 報酬付与
        if (typeof currentUser !== 'undefined' && currentUser) {
            currentUser.karikari += 50; 
            if(typeof window.saveAndSync === 'function') window.saveAndSync();
            if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
            if(typeof window.showKarikariEffect === 'function') window.showKarikariEffect(50);
        }
        
        if(typeof window.fetchGameComment === 'function') window.fetchGameComment("end", window.score);
        
        const startBtn = document.getElementById('start-game-btn');
        if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
        return;
    }
    
    window.gameAnimId = requestAnimationFrame(window.drawGame);
};