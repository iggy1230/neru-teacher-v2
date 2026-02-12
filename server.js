import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { parse } from 'url';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// --- AI Model Constants (User Specified) ---
// 指定されたモデル名を維持しています
const MODEL_HOMEWORK = "gemini-2.5-flash";
const MODEL_FAST = "gemini-2.5-flash"; 
const MODEL_REALTIME = "gemini-2.5-flash-native-audio-preview-09-2025";

// --- Server Log ---
const MEMORY_FILE = path.join(__dirname, 'server_log.json');
async function appendToServerLog(name, text) {
    try {
        let data = {};
        try { data = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8')); } catch {}
        const timestamp = new Date().toLocaleString('ja-JP', { 
            timeZone: 'Asia/Tokyo', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
        const newLog = `[${timestamp}] ${text}`;
        let currentLogs = data[name] || [];
        currentLogs.push(newLog);
        if (currentLogs.length > 50) currentLogs = currentLogs.slice(-50);
        data[name] = currentLogs;
        await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error("Server Log Error:", e); }
}

// --- AI Initialization ---
let genAI;
try {
    if (!process.env.GEMINI_API_KEY) {
        console.error("⚠️ GEMINI_API_KEY が設定されていません。");
    } else {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log("✅ AI Model Initialized with API Key.");
    }
} catch (e) { console.error("Init Error:", e.message); }

// ==========================================
// Helper Functions
// ==========================================

function getSubjectInstructions(subject) {
    switch (subject) {
        case 'さんすう': return `- **数式の記号**: 筆算の「横線」と「マイナス記号」を絶対に混同しないこと。\n- **複雑な表記**: 累乗（2^2など）、分数、帯分数を正確に認識すること。\n- **図形問題**: 図の中に書かれた長さや角度の数値も見落とさないこと。`;
        case 'こくご': return `- **縦書きレイアウトの厳格な分離**: 問題文や選択肢は縦書きです。**縦の罫線や行間の余白**を強く意識し、隣の行や列の内容が絶対に混ざらないようにしてください。\n- **列の独立性**: ある問題の列にある文字と、隣の問題の列にある文字を混同しないこと。\n- **読み取り順序**: 右の行から左の行へ、上から下へ読み取ること。`;
        case 'りか': return `- **グラフ・表**: グラフの軸ラベルや単位（g, cm, ℃, A, Vなど）を絶対に省略せず読み取ること。\n- **選択問題**: 記号選択問題（ア、イ、ウ...）の選択肢の文章もすべて書き出すこと。\n- **配置**: 図や表のすぐ近くや上部に「最初の問題」が配置されている場合が多いので、見逃さないこと。`;
        case 'しゃかい': return `- **選択問題**: 記号選択問題（ア、イ、ウ...）の選択肢の文章もすべて書き出すこと。\n- **資料読み取り**: 地図やグラフ、年表の近くにある「最初の問題」を見逃さないこと。\n- **用語**: 歴史用語や地名は正確に（子供の字が崩れていても文脈から補正して）読み取ること。`;
        default: return `- 基本的にすべての文字、図表内の数値を拾うこと。`;
    }
}

// ジャンルごとの信頼できる参照URLリスト
const GENRE_REFERENCES = {
    "魔法陣グルグル": [
        "https://dic.pixiv.net/a/%E9%AD%94%E6%B3%95%E9%99%A3%E3%82%B0%E3%83%AB%E3%82%B0%E3%83%AB",
        "https://ja.wikipedia.org/wiki/%E9%AD%94%E6%B3%95%E9%99%A3%E3%82%B0%E3%83%AB%E3%82%B0%E3%83%AB"
    ],
    "ジョジョの奇妙な冒険": [
        "https://dic.pixiv.net/a/%E3%82%B8%E3%83%A7%E3%82%B8%E3%83%A7%E3%81%AE%E5%A5%87%E5%A6%99%E3%81%AA%E5%86%92%E9%99%BA",
        "https://w.atwiki.jp/jojo-dic/"
    ],
    "ポケモン": [
        "https://dic.pixiv.net/a/%E3%83%9D%E3%82%B1%E3%83%A2%E3%83%B3",
        "https://wiki.xn--rckteqa2e.com/wiki/%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%9A%E3%83%BC%E3%82%B8"
    ],
    "マインクラフト": [
        "https://minecraft.fandom.com/ja/wiki/Minecraft_Wiki"
    ],
    "ロブロックス": [
        "https://roblox.fandom.com/ja/wiki/Roblox_Wiki"
    ],
    "ドラえもん": [
        "https://dic.pixiv.net/a/%E3%83%89%E3%83%A9%E3%81%88%E3%82%82%E3%83%B3",
        "https://hanaballoon.com/dorawiki/index.php/%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%9A%E3%83%BC%E3%82%B8"
    ],
    "歴史・戦国武将": [
        "https://ja.wikipedia.org/wiki/%E6%88%A6%E5%9B%BD%E6%AD%A6%E5%B0%86",
        "https://japanknowledge.com/introduction/keyword.html?i=932"
    ],
    "一般知識": [
        "https://ja.wikipedia.org/wiki/%E9%9B%91%E5%AD%A6",
        "https://r25.jp/article/553641712437603302"
    ],
    "STPR": [
        "https://stpr.com/",
        "https://dic.pixiv.net/a/%E3%81%99%E3%81%A8%E3%81%B7%E3%82%8A",
        "https://dic.pixiv.net/a/KnightA",
        "https://dic.pixiv.net/a/AMPTAKxCOLORS"
    ],
    "夏目友人帳": [
        "https://dic.pixiv.net/a/%E5%A4%8F%E7%9B%AE%E5%8F%8B%E4%BA%BA%E5%B8%B3",
        "https://ja.wikipedia.org/wiki/%E5%A4%8F%E7%9B%AE%E5%8F%8B%E4%BA%BA%E5%B8%B3"
    ]
};

// クイズ検証関数 (Grounding)
async function verifyQuiz(quizData, genre) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: MODEL_FAST, 
            tools: [{ google_search: {} }] 
        });
        
        const verifyPrompt = `
        あなたは厳しいクイズ校閲者です。
        生成AIが作成した以下のクイズが、事実に即しているか判定してください。
        
        【ジャンル】: ${genre}
        【問題】: ${quizData.question}
        【選択肢】: ${quizData.options.join(", ")}
        【想定正解】: ${quizData.answer}
        【生成AIが主張する根拠】: ${quizData.fact_basis || "なし"}

        ### 検証手順
        1. Google検索を使用し、問題文と正解の関係が正しいか確認してください。
        2. 特に「${genre}」のようなフィクション作品の場合、公式設定やWikiにその記述があるか確認してください。
        3. **「生成AIが主張する根拠」が、検索結果と一致するか確認してください。**

        ### 判定基準
        - **PASS**: 検索結果から裏付けが取れた。正解は間違いない。
        - **FAIL**: 検索しても裏付けが取れない、または間違いである。

        出力は "PASS" または "FAIL" のみとしてください。理由がある場合はFAILの後に続けてください。
        `;

        const result = await model.generateContent(verifyPrompt);
        const responseText = result.response.text().trim();
        
        console.log(`[Quiz Verification] ${genre}: ${responseText}`);
        return responseText.includes("PASS");
        
    } catch (e) {
        console.warn("Verification API Error:", e.message);
        // エラー時は安全のためリトライ扱いにする
        return false;
    }
}

// ==========================================
// API Endpoints
// ==========================================

// --- クイズ生成 API ---
app.post('/generate-quiz', async (req, res) => {
    const MAX_RETRIES = 3; 
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        attempt++;
        try {
            const { grade, genre, level } = req.body; 
            
            // Google検索ツールを使用
            const model = genAI.getGenerativeModel({ 
                model: MODEL_FAST, 
                tools: [{ google_search: {} }] 
            });
            
            let targetGenre = genre;
            if (!targetGenre || targetGenre === "全ジャンル") {
                const baseGenres = ["一般知識", "雑学", "芸能・スポーツ", "歴史・地理・社会", "ゲーム"];
                targetGenre = baseGenres[Math.floor(Math.random() * baseGenres.length)];
            }

            const currentLevel = level || 1;
            let difficultyDesc = "";
            switch(parseInt(currentLevel)) {
                case 1: difficultyDesc = `小学${grade}年生でも簡単にわかる、基礎的な事実`; break;
                case 2: difficultyDesc = `ファンなら確実に知っている標準的な事実`; break;
                case 3: difficultyDesc = `少し詳しい人が知っている事実`; break;
                case 4: difficultyDesc = `かなり詳しい人向けの事実`; break;
                case 5: difficultyDesc = `Wiki等で検索すれば確実に裏付けが取れる事実`; break;
                default: difficultyDesc = `標準的な事実`;
            }

            let referenceInstructions = "";
            if (GENRE_REFERENCES[targetGenre]) {
                const urls = GENRE_REFERENCES[targetGenre].join("\n- ");
                referenceInstructions = `
                【重要：参考資料 (出典)】
                このクイズを作成する際は、以下のURLの内容をGoogle検索ツールで優先的に確認し、**公式設定や事実に完全に基づいた**問題を作成してください。
                - ${urls}
                `;
            }

            const prompt = `
            あなたは「${targetGenre}」に詳しいクイズ作家です。
            以下の手順で、ファンが楽しめる4択クイズを1問作成してください。

            ### 手順
            1. **[検索実行]**: Google検索を使い、作品の用語、キャラ、エピソードの正確な情報を確認してください。
               ${referenceInstructions}
            2. **[事実の抽出]**: 検索結果の中から、**「確実に正しいと断言できる一文」**を引用して、それをクイズの核にしてください。
            3. **[問題作成]**: 抽出した事実を元に、問題文と正解を作成してください。

            ### 難易度: レベル${currentLevel}
            - ${difficultyDesc}

            ### 出力フォーマット (JSONのみ)
            {
              "fact_basis": "検索結果で見つけた、クイズの根拠となる正確な一文（コピペ）",
              "question": "問題文",
              "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
              "answer": "正解（optionsのいずれかと完全一致）",
              "explanation": "解説（出典元を明記すること）",
              "actual_genre": "${targetGenre}"
            }
            `;

            const result = await model.generateContent(prompt);
            let text = result.response.text();
            
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                text = text.substring(firstBrace, lastBrace + 1);
            }

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(text);
            } catch (e) {
                console.error(`JSON Parse Error (Attempt ${attempt}):`, text);
                throw new Error("JSON Parse Failed");
            }

            // バリデーション
            const { options, answer, question } = jsonResponse;
            if (!question || !options || !answer) throw new Error("Invalid format: missing fields");
            if (!options.includes(answer)) throw new Error("Invalid format: answer not in options");
            if (new Set(options).size !== options.length) throw new Error("Invalid format: duplicate options");

            // 検証 (Grounding)
            console.log(`[Attempt ${attempt}] Verifying quiz...`);
            const isVerified = await verifyQuiz(jsonResponse, targetGenre);
            
            if (isVerified) {
                res.json(jsonResponse);
                return; // 成功
            } else {
                console.warn(`[Attempt ${attempt}] Verification Failed. Retrying...`);
            }

        } catch (e) {
            console.error(`Quiz Gen Error (Attempt ${attempt}):`, e.message);
            if (attempt >= MAX_RETRIES) {
                res.status(500).json({ error: "クイズが作れなかったにゃ…（生成エラー）" });
                return;
            }
        }
    }
});

// --- 間違い修正 & 再生成 API ---
app.post('/correct-quiz', async (req, res) => {
    try {
        const { oldQuiz, reason, genre } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: MODEL_FAST, 
            tools: [{ google_search: {} }] 
        });

        let referenceInstructions = "";
        if (GENRE_REFERENCES[genre]) {
            referenceInstructions = `
            【参照すべき信頼できるソース】
            - ${GENRE_REFERENCES[genre].join("\n- ")}
            `;
        }

        const prompt = `
        あなたはクイズ作家ですが、先ほど作成した以下の問題に「間違いがある」とユーザーから報告を受けました。

        【元の問題】: ${oldQuiz.question}
        【元の正解】: ${oldQuiz.answer}
        【ユーザーの指摘】: ${reason}

        ### 指示
        1. Google検索を使用し、ユーザーの指摘が正しいか、元の問題に誤りがないか徹底的に調査してください。
           ${referenceInstructions}
        2. もし元の問題が間違っていた場合、正しい事実に即した**新しいクイズ**を1問作成してください。
        3. 解説文の冒頭には、「教えてくれてありがとうにゃ！修正したにゃ！」と感謝の言葉を入れてください。

        ### 出力形式 (JSON)
        {
          "fact_basis": "修正の根拠となった検索結果",
          "question": "修正後の問題文",
          "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
          "answer": "正解",
          "explanation": "感謝の言葉 + 解説",
          "actual_genre": "${genre}"
        }
        `;

        const result = await model.generateContent(prompt);
        let text = result.response.text();
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            text = text.substring(firstBrace, lastBrace + 1);
        }

        const jsonResponse = JSON.parse(text);
        if (!jsonResponse.options.includes(jsonResponse.answer)) {
            throw new Error("修正版の生成に失敗しました（正解が選択肢にない）");
        }

        res.json(jsonResponse);

    } catch (e) {
        console.error("Correct Quiz Error:", e);
        res.status(500).json({ error: "修正できなかったにゃ…ごめんにゃ。" });
    }
});

// --- なぞなぞ生成 API ---
app.post('/generate-riddle', async (req, res) => {
    try {
        const { grade } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });

        const prompt = `
        小学${grade}年生向けの「なぞなぞ」を1問作成してください。
        【重要ルール】
        1. **子供が絶対に知っている単語**を答えにしてください。
        2. 問題文は、リズムよく、子供が聞いてワクワクするような言い回しにしてください。
        
        【出力JSONフォーマット】
        {
            "question": "問題文",
            "answer": "正解の単語",
            "accepted_answers": ["正解の別名", "ひらがな表記"] 
        }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Riddle Gen Error:", e);
        res.status(500).json({ error: "なぞなぞが思いつかないにゃ…" });
    }
});

// --- ミニテスト生成 API ---
app.post('/generate-minitest', async (req, res) => {
    try {
        const { grade, subject } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });

        const prompt = `
        小学${grade}年生の「${subject}」に関する4択クイズを1問作成してください。
        【出力JSONフォーマット】
        {
            "question": "問題文",
            "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
            "answer": "正解の選択肢の文字列",
            "explanation": "正解の解説（語尾は『にゃ』）"
        }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("MiniTest Gen Error:", e);
        res.status(500).json({ error: "問題が作れなかったにゃ…" });
    }
});

// --- 漢字ドリル生成 API ---
app.post('/generate-kanji', async (req, res) => {
    try {
        const { grade, mode } = req.body; 
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });
        
        let typeInstruction = "";
        if (mode === 'reading') {
            typeInstruction = `
            「読み」問題を作成してください。
            **重要: 単体の漢字ではなく、短い文章やフレーズの中で使われている漢字の読みを問う形式にしてください。**
            **★重要: 画面表示用テキスト(question_display)では、出題対象の漢字を <span style='color:red;'>漢字</span> タグで囲んでください。**
            `;
        } else {
            typeInstruction = "「書き取り（文章の穴埋め）」問題を作成してください。";
        }

        const prompt = `
        小学${grade}年生で習う漢字の問題をランダムに1問作成してください。
        ${typeInstruction}

        【読み上げテキスト(question_speech)のルール】
        - **「読み問題」の場合、出題対象の漢字そのものを絶対に発音してはいけません。**
        - 「『画面の赤くなっている漢字』の読み方は？」のように指示語を使ってください。

        【出力JSONフォーマット】
        {
            "type": "${mode}",
            "kanji": "正解となる漢字",
            "reading": "正解となる読み仮名（ひらがな）",
            "question_display": "画面に表示する問題文",
            "question_speech": "ネル先生が読み上げる問題文"
        }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Kanji Gen Error:", e);
        res.status(500).json({ error: "漢字が見つからないにゃ…" });
    }
});

// --- 漢字採点 API ---
app.post('/check-kanji', async (req, res) => {
    try {
        const { image, targetKanji } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });

        const prompt = `
        これは子供の手書き漢字画像です。「${targetKanji}」として認識できるか判定してください。
        子供の字なので、多少の崩れは許容してください。

        【出力JSONフォーマット】
        {
            "is_correct": true または false,
            "comment": "ネル先生としてのコメント"
        }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { mimeType: "image/png", data: image } }
        ]);
        
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Kanji Check Error:", e);
        res.status(500).json({ is_correct: false, comment: "よく見えなかったにゃ…" });
    }
});

// --- HTTPチャット会話 ---
app.post('/chat-dialogue', async (req, res) => {
    try {
        let { text, name, image, history, location, address, missingInfo, memoryContext, currentQuizData } = req.body;
        
        // 通常のチャットも軽量モデルを使用
        const model = genAI.getGenerativeModel({ 
            model: MODEL_FAST, 
            tools: [{ google_search: {} }] 
        });

        const now = new Date();
        const currentDateTime = now.toLocaleString('ja-JP', { 
            timeZone: 'Asia/Tokyo' 
        });

        let systemPrompt = `
        あなたは猫の「ネル先生」です。相手は「${name}」さん。
        現在は ${currentDateTime} です。
        【最重要ルール: 呼び方】
        **相手を呼ぶときは必ず「${name}さん」と呼んでください。呼び捨て禁止。**
        `;

        if (currentQuizData) {
             systemPrompt += `
            【現在、クイズ出題中です】
            問題: ${currentQuizData.question}
            正解: ${currentQuizData.answer}
            `;
        } else {
            systemPrompt += `
            【生徒についての記憶】
            ${memoryContext || "（まだ情報はありません）"}
            `;
            if (location) systemPrompt += `\n現在地座標: ${location.lat}, ${location.lon}`;
            if (address) systemPrompt += `\n住所: ${address}`;
        }

        let promptParts = [systemPrompt];

        if (history && history.length > 0) {
            const context = "【直近の会話】\n" + history.map(h => `${h.role === 'user' ? name : 'ネル'}: ${h.text}`).join("\n");
            promptParts.push(context);
        }

        promptParts.push(`ユーザー: ${text}`);

        if (image) {
            promptParts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
        }

        const result = await model.generateContent(promptParts);
        const responseText = result.response.text();
        
        let cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        cleanText = cleanText.split('\n').filter(line => !/^(?:System|User|Model|Assistant)[:：]/i.test(line)).join(' ');

        res.json({ speech: cleanText });

    } catch (error) {
        console.error("Chat API Fatal Error:", error);
        res.status(200).json({ speech: "ごめんにゃ、頭が回らないにゃ…。" });
    }
});

// --- Memory Update ---
app.post('/update-memory', async (req, res) => {
    try {
        const { currentProfile, chatLog } = req.body;
        const model = genAI.getGenerativeModel({ 
            model: MODEL_FAST,
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        以下の「現在のプロフィール」と「直近の会話ログ」を分析し、最新のプロフィールJSONを作成してください。
        【現在のプロフィール】${JSON.stringify(currentProfile)}
        【直近の会話ログ】${chatLog}
        【出力フォーマット】
        {
            "profile": { "nickname": "...", "birthday": "...", "likes": ["..."], "weaknesses": ["..."], "achievements": ["..."], "last_topic": "..." },
            "summary_text": "会話の要約文"
        }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        let output;
        try {
            let cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanText = cleanText.substring(firstBrace, lastBrace + 1);
            }
            output = JSON.parse(cleanText);
        } catch (e) {
            return res.json({ profile: currentProfile, summary_text: "（更新なし）" });
        }

        if (Array.isArray(output)) output = output[0];
        if (!output.profile) {
            output = { profile: output, summary_text: "（会話終了）" };
        }

        res.json(output);

    } catch (error) {
        res.status(200).json({ profile: req.body.currentProfile || {}, summary_text: "" });
    }
});

// --- Analyze (宿題分析) ---
app.post('/analyze', async (req, res) => {
    try {
        const { image, mode, grade, subject, name } = req.body;
        
        // 宿題分析には精度の高いモデルを使用
        const model = genAI.getGenerativeModel({ 
            model: MODEL_HOMEWORK, 
            generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
        });

        const subjectSpecificInstructions = getSubjectInstructions(subject);

        const prompt = `
        あなたは小学${grade}年生の${name}さんの${subject}担当の教育AI「ネル先生」です。
        提供された画像（生徒のノートやドリル）を解析し、以下のJSONフォーマットでデータを出力してください。

        ${subjectSpecificInstructions}

        【出力JSONフォーマット】
        [
          {
            "id": 1,
            "label": "①",
            "question": "問題文",
            "correct_answer": ["正解"], 
            "student_answer": ["手書きの答え"],
            "is_correct": true,
            "hints": ["ヒント1", "ヒント2", "ヒント3"]
          }
        ]
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { mimeType: "image/jpeg", data: image } }
        ]);

        const responseText = result.response.text();
        let problems = [];
        try {
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonStart = cleanText.indexOf('[');
            const jsonEnd = cleanText.lastIndexOf(']');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                problems = JSON.parse(cleanText.substring(jsonStart, jsonEnd + 1));
            } else {
                throw new Error("Valid JSON array not found");
            }
        } catch (e) {
            throw new Error("AIからの応答を読み取れませんでした。");
        }

        res.json(problems);

    } catch (error) {
        console.error("解析エラー:", error);
        res.status(500).json({ error: "解析に失敗したにゃ: " + error.message });
    }
});

// --- お宝図鑑用 画像解析 ---
app.post('/identify-item', async (req, res) => {
    try {
        const { image, name, location, address } = req.body;
        
        // お宝図鑑はGoogle検索と連携して精度を上げる
        const model = genAI.getGenerativeModel({ 
            model: MODEL_FAST,
            tools: [{ google_search: {} }]
        });

        let locationInfo = "";
        if (address) {
            locationInfo = `クライアント特定住所: **${address}**`;
        } else if (location && location.lat && location.lon) {
            locationInfo = `GPS座標: 緯度 ${location.lat}, 経度 ${location.lon}`;
        }

        const prompt = `
        あなたは猫の教育AI「ネル先生」です。相手は「${name || '生徒'}」さん。
        送られてきた画像を解析し、以下の厳格なJSON形式で応答してください。
        
        ${locationInfo}

        【★最重要ルール: 場所の整合性 (厳守)】
        - 必ず「提供された住所（${address || '現在地'}）」の中に存在する施設（公園、店、建物）として特定してください。
        - **「画像の特徴（視覚情報）」よりも「現在地（位置情報）」を優先して特定を行ってください。**

        【出力フォーマット (JSON)】
        \`\`\`json
        {
            "itemName": "正式名称",
            "rarity": 1, 
            "description": "ネル先生の面白い解説",
            "realDescription": "本当の解説",
            "speechText": "『これは（itemName）だにゃ！（description）』"
        }
        \`\`\`
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { mimeType: "image/jpeg", data: image } }
        ]);

        const responseText = result.response.text();
        let json;
        try {
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                json = JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
            } else {
                throw new Error("JSON parse failed");
            }
        } catch (e) {
            json = {
                itemName: "なぞの物体",
                rarity: 1, 
                description: responseText,
                realDescription: "解析結果です。",
                speechText: responseText
            };
        }
        
        res.json(json);

    } catch (error) {
        console.error("Identify Error:", error);
        res.status(500).json({ error: "解析失敗", speechText: "よく見えなかったにゃ…", itemName: null });
    }
});

// --- 反応系 ---
app.post('/lunch-reaction', async (req, res) => {
    try {
        const { count, name } = req.body;
        await appendToServerLog(name, `給食をくれた(${count}個目)。`);
        const isSpecial = (count % 10 === 0);
        
        const model = genAI.getGenerativeModel({ model: MODEL_FAST });
        
        let prompt = isSpecial 
            ? `あなたは猫の「ネル先生」。生徒の「${name}さん」から記念すべき${count}個目の給食をもらいました！大喜びしてください。語尾は「にゃ」。`
            : `あなたは猫の「ネル先生」。生徒の「${name}さん」から給食をもらいました。面白い食レポをしてください。語尾は「にゃ」。`;

        const result = await model.generateContent(prompt);
        res.json({ reply: result.response.text().trim(), isSpecial });
    } catch (error) { 
        res.json({ reply: "おいしいにゃ！", isSpecial: false }); 
    }
});

app.post('/game-reaction', async (req, res) => {
    try {
        const { type, name, score } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST });
        let prompt = "";
        let mood = "excited";

        if (type === 'start') {
            prompt = `あなたはネル先生。「${name}さん」がゲーム開始。短く応援して。`;
        } else if (type === 'end') {
            prompt = `あなたはネル先生。ゲーム終了。「${name}さん」のスコアは${score}点。20文字以内でコメントして。`;
        } else {
            return res.json({ reply: "ナイスにゃ！", mood: "excited" });
        }

        const result = await model.generateContent(prompt);
        res.json({ reply: result.response.text().trim(), mood });
    } catch { res.json({ reply: "おつかれさまにゃ！", mood: "happy" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- WebSocket (Realtime API for Voice) ---
const wss = new WebSocketServer({ server });

wss.on('connection', async (clientWs, req) => {
    let geminiWs = null;

    clientWs.on('message', async (data) => {
        const msg = JSON.parse(data);

        if (msg.type === 'init') {
            const context = msg.context || "";
            const name = msg.name || "生徒";
            const grade = msg.grade || "1";
            
            const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
            
            try {
                geminiWs = new WebSocket(GEMINI_URL);
                
                geminiWs.on('open', () => {
                    // Gemini Realtime APIの設定
                    geminiWs.send(JSON.stringify({
                        setup: {
                            model: `models/${MODEL_REALTIME}`,
                            generationConfig: { 
                                responseModalities: ["AUDIO"],
                                speech_config: { 
                                    voice_config: { prebuilt_voice_config: { voice_name: "Aoede" } }, 
                                    language_code: "ja-JP" 
                                } 
                            }, 
                            tools: [{ google_search: {} }],
                            systemInstruction: { parts: [{ text: `あなたはネル先生。${context} 語尾はにゃ。` }] }
                        }
                    }));
                    clientWs.send(JSON.stringify({ type: "server_ready" }));
                });

                geminiWs.on('message', (gData) => {
                    try {
                        const response = JSON.parse(gData);
                        clientWs.send(gData); // クライアントへ転送
                    } catch(e) { console.error("Gemini Msg Error", e); }
                });

                geminiWs.on('close', () => clientWs.close());
                geminiWs.on('error', (e) => console.error("Gemini WS Error", e));

            } catch(e) {
                console.error("WS Conn Error", e);
                clientWs.close();
            }
            return;
        }

        // クライアントからの音声・画像をGeminiへ転送
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
            if (msg.base64Audio) {
                geminiWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: msg.base64Audio }] } }));
            }
            if (msg.base64Image) {
                geminiWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "image/jpeg", data: msg.base64Image }] } }));
            }
            if (msg.clientContent) {
                geminiWs.send(JSON.stringify({ client_content: msg.clientContent }));
            }
            if (msg.toolResponse) {
                geminiWs.send(JSON.stringify({ tool_response: msg.toolResponse }));
            }
        }
    });

    clientWs.on('close', () => {
        if (geminiWs) geminiWs.close();
    });
});