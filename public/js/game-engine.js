// --- js/game-engine.js ---
// カリカリ・キャッチ（ブロック崩し）のロジック

/**
 * ゲームの初期化
 * キャンバスのセットアップ、パドル・ボール・ブロックの配置、イベントリスナーの登録
 */
window.initGame = function() {
    window.gameCanvas = document.getElementById('game-canvas');
    if (!window.gameCanvas) return;
    window.ctx = window.gameCanvas.getContext('2d');
    
    // パドルとボールの初期化 (constants.jsで枠は定義済みだが値を入れる)
    window.paddle = { 
        x: (window.gameCanvas.width - 80) / 2, 
        y: window.gameCanvas.height - 30, 
        w: 80, 
        h: 10 
    };
    
    window.ball = { 
        x: window.gameCanvas.width / 2, 
        y: window.gameCanvas.height - 40, 
        r: 8, 
        dx: 4, 
        dy: -4 
    };
    
    window.score = 0;
    const scoreDisp = document.getElementById('game-score');
    if(scoreDisp) scoreDisp.innerText = window.score;
    
    // カリカリ(ブロック)配置
    // 5列 x 4行
    window.bricks = [];
    for(let c=0; c<5; c++) {
        for(let r=0; r<4; r++) {
            window.bricks.push({ 
                x: 30 + c*55, 
                y: 30 + r*30, 
                w: 40, 
                h: 20, 
                status: 1 
            });
        }
    }
    
    // 操作イベントの登録
    setupGameInput();
};

/**
 * 操作イベントの設定 (マウス & タッチ)
 */
function setupGameInput() {
    if (!window.gameCanvas) return;

    const movePaddle = (e) => {
        const rect = window.gameCanvas.getBoundingClientRect();
        // スマホ(touch)とPC(mouse)の両対応
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        
        let relativeX = clientX - rect.left;
        
        // キャンバスの表示サイズと内部解像度の比率を考慮（CSSでリサイズされている場合）
        const scaleX = window.gameCanvas.width / rect.width;
        relativeX *= scaleX;

        if(relativeX > 0 && relativeX < window.gameCanvas.width) {
            window.paddle.x = relativeX - window.paddle.w / 2;
        }
    };

    window.gameCanvas.onmousemove = movePaddle;
    window.gameCanvas.ontouchmove = (e) => { 
        e.preventDefault(); // スクロール防止
        movePaddle(e); 
    };
}

/**
 * ゲーム開始トリガー (ボタンから呼ばれる)
 */
window.startGameLogic = function() {
    if (window.gameRunning) return;
    
    // 初期化
    window.initGame();
    window.gameRunning = true;
    
    const startBtn = document.getElementById('start-game-btn'); 
    if (startBtn) { 
        startBtn.disabled = true; 
        startBtn.innerText = "プレイ中...";
    }
    
    // サーバーへ開始通知（応援コメント取得）
    fetchGameComment("start");
    
    // ループ開始
    window.drawGame();
};

/**
 * メインループ (描画と更新)
 */
window.drawGame = function() {
    if(!window.gameRunning) return;
    
    const ctx = window.ctx;
    const canvas = window.gameCanvas;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // ボール描画
    ctx.beginPath();
    ctx.arc(window.ball.x, window.ball.y, window.ball.r, 0, Math.PI*2);
    ctx.fillStyle = "#ff5722";
    ctx.fill();
    ctx.closePath();
    
    // パドル描画
    ctx.beginPath();
    ctx.rect(window.paddle.x, window.paddle.y, window.paddle.w, window.paddle.h);
    ctx.fillStyle = "#8d6e63";
    ctx.fill();
    ctx.closePath();
    
    // カリカリ(ブロック)描画
    let allCleared = true;
    window.bricks.forEach(b => {
        if(b.status === 1) {
            allCleared = false;
            ctx.beginPath();
            ctx.rect(b.x, b.y, b.w, b.h);
            ctx.fillStyle = "#ffb74d"; // カリカリ色
            ctx.fill();
            ctx.closePath();
        }
    });
    
    // 移動
    window.ball.x += window.ball.dx;
    window.ball.y += window.ball.dy;
    
    // 壁反射
    if(window.ball.x + window.ball.dx > canvas.width - window.ball.r || window.ball.x + window.ball.dx < window.ball.r) {
        window.ball.dx = -window.ball.dx;
    }
    if(window.ball.y + window.ball.dy < window.ball.r) {
        window.ball.dy = -window.ball.dy;
    }
    
    // パドル衝突
    if(window.ball.y + window.ball.dy > canvas.height - window.ball.r - 30) {
        // パドルの高さ範囲内か？
        if(window.ball.x > window.paddle.x && window.ball.x < window.paddle.x + window.paddle.w) {
            window.ball.dy = -window.ball.dy;
            
            // 効果音再生 (voice-service.jsのsafePlayを利用)
            if (window.safePlay && window.sfxPaddle) window.safePlay(window.sfxPaddle);
            
        } else if(window.ball.y + window.ball.dy > canvas.height - window.ball.r) {
            // ゲームオーバー
            window.gameRunning = false;
            
            if (window.safePlay && window.sfxOver) window.safePlay(window.sfxOver);
            if (window.updateNellMessage) window.updateNellMessage("あ〜あ、落ちちゃったにゃ…", "sad");
            
            fetchGameComment("end", window.score);
            
            const startBtn = document.getElementById('start-game-btn');
            if(startBtn) { 
                startBtn.disabled = false; 
                startBtn.innerText = "もう一回！"; 
                startBtn.onclick = window.startGameLogic;
            }
            return;
        }
    }
    
    // カリカリ衝突判定
    window.bricks.forEach(b => {
        if(b.status === 1) {
            if(window.ball.x > b.x && window.ball.x < b.x + b.w && window.ball.y > b.y && window.ball.y < b.y + b.h) {
                window.ball.dy = -window.ball.dy;
                b.status = 0;
                window.score += 10;
                
                const scoreEl = document.getElementById('game-score');
                if (scoreEl) scoreEl.innerText = window.score;
                
                if (window.safePlay && window.sfxHit) window.safePlay(window.sfxHit);
                
                // 応援コメント (50点ごと)
                if (window.score % 50 === 0 && window.gameHitComments) {
                    const comment = window.gameHitComments[Math.floor(Math.random() * window.gameHitComments.length)];
                    if (window.updateNellMessage) window.updateNellMessage(comment, "excited", false, false);
                }
            }
        }
    });
    
    // クリア判定
    if (allCleared) {
        window.gameRunning = false;
        if (window.updateNellMessage) window.updateNellMessage("全部取ったにゃ！すごいにゃ！！", "excited");
        
        // ボーナス加算 (currentUser更新)
        if (window.currentUser) {
            window.currentUser.karikari += 50; 
            if (window.saveAndSync) window.saveAndSync();
            if (window.updateMiniKarikari) window.updateMiniKarikari();
            if (window.showKarikariEffect) window.showKarikariEffect(50);
        }
        
        fetchGameComment("end", window.score);
        
        const startBtn = document.getElementById('start-game-btn');
        if(startBtn) { 
            startBtn.disabled = false; 
            startBtn.innerText = "もう一回！"; 
            startBtn.onclick = window.startGameLogic;
        }
        return;
    }
    
    window.gameAnimId = requestAnimationFrame(window.drawGame);
};

// サーバーへのコメントリクエスト
function fetchGameComment(type, score=0) { 
    if (!window.currentUser) return;
    
    fetch('/game-reaction', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ type, name: window.currentUser.name, score }) 
    })
    .then(r => r.json())
    .then(d => { 
        // 開始時は即座に、終了時は少し間を置いて表示
        if (type === 'start') {
             if (window.updateNellMessage) window.updateNellMessage(d.reply, d.mood || "excited", true);
        } else {
             // ゲームオーバーメッセージとかぶらないように少し待つ
             setTimeout(() => {
                 if (window.updateNellMessage) window.updateNellMessage(d.reply, d.mood || "excited", true);
             }, 1500);
        }
    })
    .catch(e=>{ console.warn("Game comment fetch failed", e); }); 
}

console.log("✅ game-engine.js loaded.");