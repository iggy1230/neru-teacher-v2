// --- js/game-engine.js (v293.0: カリカリ・キャッチ ゲームエンジン) ---
/**
ゲーム画面を表示し、初期化を行う
*/
window.showGame = function() {
window.switchScreen('screen-game');
document.getElementById('mini-karikari-display').classList.remove('hidden');
if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
window.initGame();
window.fetchGameComment("start");
const startBtn = document.getElementById('start-game-btn');
if (startBtn) {
// ボタンのイベントリスナー重複を防ぐため、クローンして置き換え
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
/**
サーバーからゲームの実況コメントを取得する
*/
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
/**
ゲームの初期化処理
*/
window.initGame = function() {
window.gameCanvas = document.getElementById('game-canvas');
if(!window.gameCanvas) return;
window.ctx = window.gameCanvas.getContext('2d');
// パドル初期位置
window.paddle = { x: window.gameCanvas.width / 2 - 40, y: window.gameCanvas.height - 30, w: 80, h: 10 };
// ボール初期位置と速度
window.ball = { x: window.gameCanvas.width / 2, y: window.gameCanvas.height - 40, r: 8, dx: 4, dy: -4 };
// スコアリセット
window.score = 0;
const scoreEl = document.getElementById('game-score');
if(scoreEl) scoreEl.innerText = window.score;
// ブロック生成 (5列 x 4行)
window.bricks = [];
for(let c=0; c<5; c++) {
for(let r=0; r<4; r++) {
window.bricks.push({ x: 30 + c55, y: 30 + r30, w: 40, h: 20, status: 1 });
}
}
// 操作イベント設定
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
/**
ゲームループ（描画と物理演算）
*/
window.drawGame = function() {
if(!window.gameRunning) return;
// 画面クリア
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
// ブロック描画
window.bricks.forEach(b => {
if(b.status === 1) {
window.ctx.beginPath();
window.ctx.rect(b.x, b.y, b.w, b.h);
window.ctx.fillStyle = "#ffb74d";
window.ctx.fill();
window.ctx.closePath();
}
});
// ボール移動
window.ball.x += window.ball.dx;
window.ball.y += window.ball.dy;
// 壁での反射
if(window.ball.x + window.ball.dx > window.gameCanvas.width - window.ball.r || window.ball.x + window.ball.dx < window.ball.r) window.ball.dx = -window.ball.dx;
if(window.ball.y + window.ball.dy < window.ball.r) window.ball.dy = -window.ball.dy;
// 下端（パドルまたは落下）
if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r - 30) {
if(window.ball.x > window.paddle.x && window.ball.x < window.paddle.x + window.paddle.w) {
// パドルヒット
window.ball.dy = -window.ball.dy;
if(window.safePlay) window.safePlay(window.sfxPaddle);
} else if(window.ball.y + window.ball.dy > window.gameCanvas.height - window.ball.r) {
// ゲームオーバー
window.gameRunning = false;
if(window.safePlay) window.safePlay(window.sfxOver);
if(typeof window.updateNellMessage === 'function') window.updateNellMessage("あ〜あ、落ちちゃったにゃ…", "sad");
window.fetchGameComment("end", window.score);
code
Code
const startBtn = document.getElementById('start-game-btn');
     if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
     return;
 }
}
// ブロック衝突判定
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
code
Code
if(window.safePlay) window.safePlay(window.sfxHit);
         
         // 50点ごとに応援コメント
         if (window.score % 50 === 0 && window.gameHitComments) {
             const comment = window.gameHitComments[Math.floor(Math.random() * window.gameHitComments.length)];
             if(typeof window.updateNellMessage === 'function') window.updateNellMessage(comment, "excited", false, false);
         }
     }
 }
});
// ゲームクリア判定
if (allCleared) {
window.gameRunning = false;
if(typeof window.updateNellMessage === 'function') window.updateNellMessage("全部取ったにゃ！すごいにゃ！！", "excited");
code
Code
if (currentUser) {
     currentUser.karikari += 50; 
     if(typeof window.saveAndSync === 'function') window.saveAndSync();
     if(typeof window.updateMiniKarikari === 'function') window.updateMiniKarikari();
     if(typeof window.showKarikariEffect === 'function') window.showKarikariEffect(50);
 }
 
 window.fetchGameComment("end", window.score);
 
 const startBtn = document.getElementById('start-game-btn');
 if(startBtn) { startBtn.disabled = false; startBtn.innerText = "もう一回！"; }
 return;
}
// 次のフレームへ
window.gameAnimId = requestAnimationFrame(window.drawGame);
};