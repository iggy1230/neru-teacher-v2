// --- js/state/memory.js (v321.0: ログ削除対応版) ---

(function(global) {
    const Memory = {};

    // Helper: Base64をBlobに変換
    function base64ToBlob(base64, mimeType = 'image/jpeg') {
        const parts = base64.split(';base64,');
        const raw = window.atob(parts.length > 1 ? parts[1] : base64);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: mimeType });
    }

    // Helper: Storageから画像を削除
    async function deleteImageFromStorage(url) {
        if (!window.fireStorage || !url) return;
        try {
            const ref = window.fireStorage.refFromURL(url);
            await ref.delete();
            console.log("Deleted old image from Storage:", url);
        } catch(e) {
            console.warn("Storage Delete Failed (Ignored):", e);
        }
    }

    // 空のプロフィールを作成
    Memory.createEmptyProfile = function() {
        return {
            nickname: "",
            birthday: "", 
            likes: [],
            weaknesses: [],
            achievements: [],
            last_topic: "",
            collection: [] // 図鑑データ
        };
    };

    // プロフィールを取得
    Memory.getUserProfile = async function(userId) {
        let profile = null;

        if (typeof db !== 'undefined' && db !== null) {
            try {
                const doc = await db.collection("users").doc(userId).get();
                if (doc.exists && doc.data().profile) {
                    profile = doc.data().profile;
                }
            } catch(e) { console.error("Firestore Profile Load Error:", e); }
        }

        if (!profile) {
            const key = `nell_profile_${userId}`;
            try {
                profile = JSON.parse(localStorage.getItem(key));
            } catch {}
        }

        if (Array.isArray(profile)) {
            profile = profile[0];
        }

        const defaultProfile = Memory.createEmptyProfile();
        if (!profile) return defaultProfile;
        if (!Array.isArray(profile.collection)) profile.collection = []; 

        return profile;
    };

    // プロフィールを保存
    Memory.saveUserProfile = async function(userId, profile) {
        if (Array.isArray(profile)) {
            profile = profile[0] || Memory.createEmptyProfile();
        }

        localStorage.setItem(`nell_profile_${userId}`, JSON.stringify(profile));

        if (typeof db !== 'undefined' && db !== null) {
            try {
                await db.collection("users").doc(userId).set({ profile: profile }, { merge: true });
            } catch(e) { console.error("Firestore Profile Save Error:", e); }
        }
    };

    // サーバー更新用
    Memory.updateProfileFromChat = async function(userId, chatLog) {
        if (!chatLog || chatLog.length < 10) return;
        const currentProfile = await Memory.getUserProfile(userId);
        
        try {
            const res = await fetch('/update-memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentProfile, chatLog })
            });
            
            if (res.ok) {
                let newProfileText = await res.json();
                if (Array.isArray(newProfileText)) newProfileText = newProfileText[0];
                
                const updatedProfile = {
                    ...newProfileText,
                    collection: currentProfile.collection || []
                };
                
                await Memory.saveUserProfile(userId, updatedProfile);
            }
        } catch(e) {
            console.warn("Profile update failed, keeping existing data.", e);
        }
    };

    // コンテキスト生成
    Memory.generateContextString = async function(userId) {
        const p = await Memory.getUserProfile(userId);
        let context = "";
        if (p.nickname) context += `・あだ名: ${p.nickname}\n`;
        if (p.birthday) context += `・誕生日: ${p.birthday}\n`; 
        if (p.likes && p.likes.length > 0) context += `・好きなもの: ${p.likes.join(", ")}\n`;
        if (p.weaknesses && p.weaknesses.length > 0) context += `・苦手なもの: ${p.weaknesses.join(", ")}\n`;
        
        if (p.collection && p.collection.length > 0) {
            const recentItems = p.collection.slice(0, 3).map(i => i.name).join(", ");
            context += `・最近見せてくれたもの図鑑: ${recentItems}\n`;
        }
        
        return context;
    };

    // 図鑑追加
    Memory.addToCollection = async function(userId, itemName, imageBase64, description = "", realDescription = "", location = null) {
        console.log(`[Memory] addToCollection: ${itemName}`);
        try {
            const profile = await Memory.getUserProfile(userId);
            
            if (!Array.isArray(profile.collection)) {
                profile.collection = [];
            }
            
            let imageUrl = imageBase64; 

            if (window.fireStorage && typeof db !== 'undefined' && db !== null) {
                try {
                    const blob = base64ToBlob(imageBase64);
                    const timestamp = Date.now();
                    const storagePath = `user_images/${userId}/${timestamp}.jpg`;
                    const storageRef = window.fireStorage.ref().child(storagePath);
                    
                    const snapshot = await storageRef.put(blob);
                    imageUrl = await snapshot.ref.getDownloadURL(); 
                    console.log("Image uploaded to Storage:", imageUrl);
                } catch (uploadError) {
                    console.warn("Storage upload failed, falling back to Base64", uploadError);
                }
            }

            const newItem = {
                name: itemName,
                image: imageUrl, 
                date: new Date().toISOString(),
                description: description,
                realDescription: realDescription,
                location: location
            };

            profile.collection.unshift(newItem); 

            const maxLimit = (imageUrl.startsWith('http')) ? 500 : 30;

            if (profile.collection.length > maxLimit) {
                const removedItems = profile.collection.splice(maxLimit, profile.collection.length - maxLimit);
                for (const item of removedItems) {
                    if (item.image && item.image.startsWith('http')) {
                        await deleteImageFromStorage(item.image);
                    }
                }
            }

            await Memory.saveUserProfile(userId, profile);
            console.log(`[Memory] Collection added. Total: ${profile.collection.length}`);
        } catch (e) {
            console.error("[Memory] Add Collection Error:", e);
        }
    };
    
    Memory.deleteFromCollection = async function(userId, index) {
        try {
            const profile = await Memory.getUserProfile(userId);
            if (profile.collection && profile.collection[index]) {
                const item = profile.collection[index];
                if (item.image && item.image.startsWith('http')) {
                    await deleteImageFromStorage(item.image);
                }
                profile.collection.splice(index, 1);
                await Memory.saveUserProfile(userId, profile);
                console.log(`[Memory] Deleted item: ${item.name}`);
            }
        } catch(e) { console.error("[Memory] Delete Error:", e); }
    };
    
    // ★追加: ログ削除用関数
    Memory.deleteRawChatLogs = async function(userId, indicesToDelete) {
        const memoryKey = `nell_raw_chat_log_${userId}`;
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(memoryKey) || '[]');
        } catch(e) {}
        
        // インデックスが大きい順に削除（ずれ防止）
        indicesToDelete.sort((a, b) => b - a).forEach(index => {
            if (index >= 0 && index < history.length) {
                history.splice(index, 1);
            }
        });
        
        localStorage.setItem(memoryKey, JSON.stringify(history));
    };
    
    Memory.updateLatestCollectionItem = async function(userId, newName) {};

    global.NellMemory = Memory;
})(window);