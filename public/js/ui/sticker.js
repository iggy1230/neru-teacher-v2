// --- js/ui/sticker.js (v1.9: Firebase Storage抽出 完全修正版) ---

window.showStickerBook = function(targetUserId = null) {
    window.switchScreen('screen-sticker-book');
    window.updateNellMessage("シール帳だにゃ！自由に貼って遊ぶにゃ！", "happy");
    
    const userId = targetUserId || (currentUser ? currentUser.id : null);
    if (!userId) return;

    window.loadAndRenderStickers(userId);
};

// ★Firebase Storageからランダムに取得する
window.grantRandomSticker = async function(fromLunch = false) {
    if (!currentUser) return;
    if (!window.fireStorage) {
        console.error("Storage not initialized.");
        return;
    }

    // 演出開始（読み込み時間を稼ぐ）
    if(window.safePlay) window.safePlay(window.sfxHirameku);

    try {
        // 1. Storageの stickers フォルダを参照
        const listRef = window.fireStorage.ref('stickers');

        // 2. ファイル一覧を取得
        const res = await listRef.listAll();

        if (res.items.length === 0) {
            console.warn("No stickers found in Firebase Storage 'stickers' folder.");
            alert("まだシールがないみたいだにゃ…。");
            return;
        }

        // 3. ★修正: ランダムに「1つだけ」選ぶ（ここが原因でした）
        const randomIndex = Math.floor(Math.random() * res.items.length);
        const randomRef = res.items; // ← が必須です！

        // 4. ダウンロードURLを取得
        const url = await randomRef.getDownloadURL();

        // 5. 新しいシールデータ作成
        // 初期配置を 'newArea'（新規シール置き場）に設定
        const newSticker = {
            id: 'st_' + Date.now() + '_' + Math.floor(Math.random()*1000),
            src: url,
            location: 'newArea', 
            x: 10 + Math.random() * 80, // 置き場内でのX座標(%)
            y: 15 + Math.random() * 70, // 置き場内でのY座標(%)
            rotation: (Math.random() * 40 - 20),
            scale: 1.0,
            zIndex: 100 
        };

        if (!currentUser.stickers) currentUser.stickers =[];
        currentUser.stickers.push(newSticker);
        
        // 保存
        if (typeof window.saveAndSync === 'function') window.saveAndSync();
        
        // 完了アラート
        alert(`🎉 おめでとう！\n特製シールをゲットしたにゃ！\n画面の下の「あたらしいシール」に置いておいたにゃ！`);

    } catch (error) {
        console.error("Firebase Sticker Error:", error);
        alert("シールの取得に失敗したにゃ…。通信環境や設定を確認してにゃ。");
    }
};

window.loadAndRenderStickers = async function(userId) {
    const board = document.getElementById('sticker-board');
    const newArea = document.getElementById('new-sticker-area'); 
    if (!board || !newArea) return;
    
    // 中身をクリア
    board.innerHTML = '';
    newArea.innerHTML = '<div class="new-sticker-title">あたらしいシール</div>';

    const ring = document.createElement('div'); 
    ring.className = 'binder-ring'; 
    board.appendChild(ring);
    
    const container = document.getElementById('sticker-board-container');
    if (container) {
        const oldClasp = container.querySelector('.binder-clasp'); 
        if (oldClasp) oldClasp.remove();
        const clasp = document.createElement('div'); 
        clasp.className = 'binder-clasp'; 
        container.appendChild(clasp);
    }
    
    const guide = document.createElement('div'); 
    guide.id = 'sticker-guide-text';
    guide.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:rgba(0,0,0,0.1); font-weight:bold; pointer-events:none; font-size:2rem; white-space:nowrap;";
    guide.innerText = "STICKER BOOK"; 
    board.appendChild(guide);

    let stickers =[];
    const isMe = (currentUser && currentUser.id === userId);
    const trash = document.getElementById('sticker-trash');
    if (trash) { 
        isMe ? trash.classList.remove('hidden') : trash.classList.add('hidden'); 
    }

    if (isMe) {
        stickers = currentUser.stickers ||[];
    } else {
        if (db) {
            try {
                const doc = await db.collection("users").doc(String(userId)).get();
                if (doc.exists) {
                    const data = doc.data();
                    stickers = data.stickers ||[];
                    window.updateNellMessage(`${data.name}さんのシール帳だにゃ！`, "happy");
                }
            } catch (e) { 
                console.error("Sticker Fetch Error:", e); 
            }
        }
    }

    stickers.forEach(s => {
        // locationプロパティがなければ 'board' とみなす
        const parentEl = (s.location === 'newArea') ? newArea : board;
        const el = window.createStickerElement(s, isMe);
        parentEl.appendChild(el);
    });
};

window.createStickerElement = function(data, editable = true) {
    const div = document.createElement('div');
    div.className = 'sticker-item';
    div.id = data.id;
    
    div.style.left = data.x + '%';
    div.style.top = data.y + '%';
    div.style.transform = `translate(-50%, -50%) rotate(${data.rotation || 0}deg) scale(${data.scale || 1})`;
    div.style.zIndex = data.zIndex || 1;

    const img = document.createElement('img');
    img.src = data.src || 'assets/images/items/nikukyuhanko.png';
    img.className = 'sticker-img';
    img.crossOrigin = "anonymous"; // CORS対応
    
    img.onerror = () => { 
        img.src = 'assets/images/items/nikukyuhanko.png'; 
    };
    
    div.appendChild(img);

    if (editable) {
        window.attachStickerEvents(div, data);
    } else {
        div.style.cursor = 'default';
    }

    return div;
};

window.attachStickerEvents = function(el, data) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    let moved = false;
    const trash = document.getElementById('sticker-trash');
    const board = document.getElementById('sticker-board');
    const newArea = document.getElementById('new-sticker-area');

    const isOverTrash = (element) => {
        if (!trash) return false;
        const r1 = element.getBoundingClientRect();
        const r2 = trash.getBoundingClientRect();
        const c1 = { x: r1.left + r1.width / 2, y: r1.top + r1.height / 2 };
        return (c1.x >= r2.left && c1.x <= r2.right && c1.y >= r2.top && c1.y <= r2.bottom);
    };

    const startDrag = (e) => {
        if (e.target.closest('.main-btn')) return; 
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        moved = false;
        el.style.zIndex = 999;
        if (trash) trash.classList.add('active');

        // ドラッグ開始時に、一時的にbody直下に移動させる
        document.body.appendChild(el);

        const clientX = e.touches ? e.touches.clientX : e.clientX;
        const clientY = e.touches ? e.touches.clientY : e.clientY;
        
        // 画面全体での座標を使う
        const rect = el.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        startX = clientX;
        startY = clientY;
    };

    const onDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches.clientX : e.clientX;
        const clientY = e.touches ? e.touches.clientY : e.clientY;
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;

        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
        
        if (trash) {
            if (isOverTrash(el)) {
                trash.classList.add('hover');
                el.style.opacity = '0.5';
            } else {
                trash.classList.remove('hover');
                el.style.opacity = '1';
            }
        }
    };

    const endDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        if (trash) {
            trash.classList.remove('active');
            trash.classList.remove('hover');
        }
        
        if (moved && trash && isOverTrash(el)) {
            if (window.sfxBatu) window.safePlay(window.sfxBatu); 
            el.remove();
            if (currentUser && currentUser.stickers) {
                currentUser.stickers = currentUser.stickers.filter(s => s.id !== data.id);
                if (typeof window.saveAndSync === 'function') window.saveAndSync();
            }
            return;
        }

        // ドロップした場所によって所属コンテナと座標を決定
        const currentRect = el.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        
        let targetParent;
        let finalX, finalY;

        // ボードの上か判定
        if (currentRect.top < boardRect.bottom && currentRect.bottom > boardRect.top) {
            targetParent = board;
            data.location = 'board';
        } else {
            targetParent = newArea;
            data.location = 'newArea';
        }

        const parentRect = targetParent.getBoundingClientRect();
        finalX = ((currentRect.left + currentRect.width / 2) - parentRect.left) / parentRect.width * 100;
        finalY = ((currentRect.top + currentRect.height / 2) - parentRect.top) / parentRect.height * 100;
        
        targetParent.appendChild(el);
        el.style.left = `${finalX}%`;
        el.style.top = `${finalY}%`;
        
        el.style.opacity = '1';
        data.x = finalX;
        data.y = finalY;

        if (!moved) {
            data.rotation = (data.rotation || 0) + 45;
            el.style.transform = `translate(-50%, -50%) rotate(${data.rotation}deg) scale(${data.scale || 1})`;
            if (window.sfxBtn) window.safePlay(window.sfxBtn);
        } else {
            data.zIndex = 10 + Math.floor(Math.random() * 50); 
            el.style.zIndex = data.zIndex;
        }
        if (typeof window.saveAndSync === 'function') window.saveAndSync();
    };

    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
};

window.saveStickers = function() {
    if (!currentUser) return;
    if (typeof window.saveAndSync === 'function') {
        window.saveAndSync();
        alert("シール帳を保存したにゃ！");
    }
};

window.openStickerUserList = async function() {
    const modal = document.getElementById('sticker-user-modal');
    const listContainer = document.getElementById('sticker-user-list');
    if (!modal || !listContainer) return;
    modal.classList.remove('hidden');
    listContainer.innerHTML = '<p style="text-align:center; padding:20px;">読み込み中にゃ...</p>';
    
    if (!db) {
        listContainer.innerHTML = '<p style="text-align:center; color:red;">データベースにつながってないにゃ...</p>';
        return;
    }

    try {
        const snapshot = await db.collection("users").orderBy("lastLogin", "desc").limit(20).get();
        listContainer.innerHTML = "";
        if (snapshot.empty) {
            listContainer.innerHTML = '<p style="text-align:center;">まだ誰もいないにゃ。</p>';
            return;
        }
        snapshot.forEach(doc => {
            const user = doc.data();
            const div = document.createElement('div');
            div.className = "memory-item"; 
            div.style.alignItems = "center";
            div.style.cursor = "pointer";
            div.onclick = () => { window.closeStickerUserList(); window.showStickerBook(user.id); };
            const iconSrc = user.photo || 'assets/images/characters/nell-normal.png';
            const stickerCount = (user.stickers && Array.isArray(user.stickers)) ? user.stickers.length : 0;
            div.innerHTML = `<img src="${iconSrc}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; margin-right:10px; border:1px solid #ddd;"><div style="flex:1;"><div style="font-weight:bold; color:#333;">${window.cleanDisplayString(user.name)}</div><div style="font-size:0.7rem; color:#888;">シール: ${stickerCount}枚</div></div><button class="mini-teach-btn" style="background:#e91e63;">みる</button>`;
            listContainer.appendChild(div);
        });
    } catch(e) {
        listContainer.innerHTML = '<p style="text-align:center; color:red;">読み込めなかったにゃ...</p>';
    }
};

window.closeStickerUserList = function() {
    const modal = document.getElementById('sticker-user-modal');
    if (modal) modal.classList.add('hidden');
};