// --- server.js (完全版 v366.0: 漢字ドリル・クイズ生成修正版) ---

import textToSpeech from '@google-cloud/text-to-speech';
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

// --- AI Model Constants ---
const MODEL_HOMEWORK = "gemini-2.5-pro";
const MODEL_FAST = "gemini-2.5-flash";
const MODEL_REALTIME = "gemini-2.5-flash-native-audio-preview-09-2025";

// --- Server Log ---
const MEMORY_FILE = path.join(__dirname, 'server_log.json');
async function appendToServerLog(name, text) {
    try {
        let data = {};
        try { data = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8')); } catch {}
        const timestamp = new Date().toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const newLog = `[${timestamp}] ${text}`;
        let currentLogs = data[name] || [];
        currentLogs.push(newLog);
        if (currentLogs.length > 50) currentLogs = currentLogs.slice(-50);
        data[name] = currentLogs;
        await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) { console.error("Server Log Error:", e); }
}

// --- AI Initialization ---
let genAI, ttsClient;
try {
    if (!process.env.GEMINI_API_KEY) console.error("⚠️ GEMINI_API_KEY が設定されていません。");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
            ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
        } catch(e) { console.error("TTS Credential Error:", e.message); }
    } else {
        ttsClient = new textToSpeech.TextToSpeechClient();
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

function fixPronunciation(text) {
    if (!text) return "";
    let t = text;
    t = t.replace(/角/g, "かく"); 
    t = t.replace(/辺/g, "へん");
    t = t.replace(/真分数/g, "しんぶんすう");
    t = t.replace(/仮分数/g, "かぶんすう");
    t = t.replace(/帯分数/g, "たいぶんすう");
    t = t.replace(/約分/g, "やくぶん");
    t = t.replace(/通分/g, "つうぶん");
    t = t.replace(/直角/g, "ちょっかく");
    t = t.replace(/\+/g, "たす");
    t = t.replace(/＋/g, "たす");
    t = t.replace(/\-/g, "ひく");
    t = t.replace(/－/g, "ひく");
    t = t.replace(/\=/g, "わ");
    t = t.replace(/＝/g, "わ");
    t = t.replace(/×/g, "かける");
    t = t.replace(/÷/g, "わる");
    return t;
}

// ==========================================
// API Endpoints
// ==========================================

// --- クイズ生成 API ---
app.post('/generate-quiz', async (req, res) => {
    try {
        const { grade } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });
        
        const prompt = `
        小学${grade}年生向けのクイズまたはなぞなぞを1問作成してください。
        
        【出力JSONフォーマット】
        {
            "question": "問題文（子供に分かりやすく、ネル先生の口調で）",
            "answer": "正解の単語（ひらがな）",
            "accepted_answers": ["正解1", "正解2", "漢字表記", "別名"] 
        }
        `;

        const result = await model.generateContent(prompt);
        // ★修正: マークダウン記号を除去してパース
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Quiz Gen Error:", e);
        res.status(500).json({ error: "クイズが作れなかったにゃ…" });
    }
});

// --- 漢字ドリル生成 API (強化版) ---
app.post('/generate-kanji', async (req, res) => {
    try {
        const { grade } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });
        
        const prompt = `
        小学${grade}年生で習う漢字の問題をランダムに1問作成してください。
        「書き取り（文章の穴埋め）」か「読み（漢字の読み仮名）」のどちらかにしてください。

        【出力JSONフォーマット】
        {
            "type": "writing" または "reading",
            "kanji": "正解となる漢字（書き取りの場合はこれ判定、読みの場合は問題文の一部）",
            "reading": "正解となる読み仮名（ひらがな）",
            "question_display": "画面に表示する問題文（例: 『□□(しょうぶ)をする』 または 『『勝負』の読み方は？』）",
            "question_speech": "ネル先生が読み上げる問題文（例: 『このカッコに入る漢字を書いてにゃ！』）"
        }
        `;

        const result = await model.generateContent(prompt);
        // ★修正: マークダウン記号を除去してパース
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Kanji Gen Error:", e);
        res.status(500).json({ error: "漢字が見つからないにゃ…" });
    }
});

// --- 漢字採点 API (画像認識) ---
app.post('/check-kanji', async (req, res) => {
    try {
        const { image, targetKanji } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });

        const prompt = `
        子供が書いた手書き文字の画像です。
        これが「${targetKanji}」と読めるか判定してください。
        多少下手でも、字形が合っていれば正解としてください。

        【出力JSONフォーマット】
        {
            "is_correct": true,
            "comment": "ネル先生としてのコメント。正解なら褒める、不正解ならどこが違うか優しく教える。"
        }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { mime_type: "image/png", data: image } }
        ]);
        
        // ★修正: マークダウン記号を除去してパース
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Kanji Check Error:", e);
        res.status(500).json({ is_correct: false, comment: "よく見えなかったにゃ…もう一回書いてみてにゃ？" });
    }
});

// --- HTTPチャット会話 (クイズ/漢字ヒント対応) ---
app.post('/chat-dialogue', async (req, res) => {
    try {
        let { text, name, image, history, location, address, missingInfo, memoryContext, currentQuizData } = req.body;
        
        const now = new Date();
        const currentDateTime = now.toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        // コンテキストの構築
        let systemPrompt = `
        あなたは猫の「ネル先生」です。相手は「${name}」さん。
        現在は ${currentDateTime} です。
        相手を呼ぶときは必ず「${name}さん」と呼んでください。
        `;

        // ★ゲーム中の特例処理
        if (currentQuizData) {
            systemPrompt += `
            【現在、ユーザーは以下の問題に挑戦中です】
            問題: ${currentQuizData.question}
            正解: ${currentQuizData.answer}
            
            ユーザーの発言: 「${text}」
            
            指示:
            - もしユーザーが答えを間違えた場合は、**正解は教えずに**、面白いヒントを出してください。
            - もしユーザーがヒントを求めている場合は、分かりやすいヒントを出してください。
            - ユーザーが雑談をした場合は、クイズの内容に関連付けながら楽しく返してください。
            - **絶対に自分から正解を言ってはいけません。**
            `;
        } else {
            // 通常会話のプロンプト（既存）
            systemPrompt += `
            【生徒についての記憶】
            ${memoryContext || "（まだ情報はありません）"}
            `;
            if (location) {
               systemPrompt += `\n現在地座標: ${location.lat}, ${location.lon}`;
               if(address) systemPrompt += `\n住所: ${address}`;
            }
        }

        let contextPrompt = "";
        if (history && history.length > 0) {
            contextPrompt = "【直近の会話】\n" + history.map(h => `${h.role === 'user' ? name : 'ネル'}: ${h.text}`).join("\n");
        }

        const prompt = `
        ${systemPrompt}
        ${contextPrompt}
        
        ユーザー: ${text}
        ネル先生: 
        `;

        let result;
        let responseText;

        try {
            const toolsConfig = image ? undefined : [{ google_search: {} }];
            const model = genAI.getGenerativeModel({ 
                model: MODEL_FAST,
                tools: toolsConfig
            });

            if (image) {
                result = await model.generateContent([
                    prompt,
                    { inlineData: { mime_type: "image/jpeg", data: image } }
                ]);
            } else {
                result = await model.generateContent(prompt);
            }
            responseText = result.response.text().trim();

        } catch (genError) {
            console.warn("Generation failed. Retrying without tools...", genError.message);
            const modelFallback = genAI.getGenerativeModel({ model: MODEL_FAST });
            try {
                if (image) {
                    result = await modelFallback.generateContent([
                        prompt,
                        { inlineData: { mime_type: "image/jpeg", data: image } }
                    ]);
                } else {
                    result = await modelFallback.generateContent(prompt);
                }
                responseText = result.response.text().trim();
            } catch (retryError) {
                throw retryError;
            }
        }
        
        let cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        cleanText = cleanText.split('\n').filter(line => {
            return !/^(?:System|User|Model|Assistant|Thinking|Display)[:：]/i.test(line);
        }).join(' ');

        res.json({ speech: cleanText });

    } catch (error) {
        console.error("Chat API Fatal Error:", error);
        res.status(200).json({ speech: "ごめんにゃ、頭が回らないにゃ…。" });
    }
});

// --- TTS ---
app.post('/synthesize', async (req, res) => {
    try {
        if (!ttsClient) throw new Error("TTS Not Ready");
        const { text, mood } = req.body;
        
        let speakText = text;
        speakText = speakText.replace(/[\*#_`~]/g, "");
        speakText = speakText.replace(/([a-zA-Z0-9一-龠々ヶァ-ヴー]+)\s*[\(（]([ぁ-んァ-ンー]+)[\)）]/g, '$2');
        speakText = fixPronunciation(speakText);

        let rate = "1.1"; let pitch = "+2st";
        if (mood === "thinking") { rate = "1.0"; pitch = "0st"; }
        if (mood === "gentle") { rate = "0.95"; pitch = "+1st"; }
        if (mood === "excited") { rate = "1.2"; pitch = "+4st"; }
        
        const ssml = `<speak><prosody rate="${rate}" pitch="${pitch}">${speakText}</prosody></speak>`;
        
        const [response] = await ttsClient.synthesizeSpeech({
            input: { ssml },
            voice: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B' },
            audioConfig: { audioEncoding: 'MP3' },
        });
        res.json({ audioContent: response.audioContent.toString('base64') });
    } catch (err) { res.status(500).send(err.message); }
});

// (update-memory, analyze, identify-item, lunch-reaction, game-reaction は変更なし)
app.post('/update-memory', async (req, res) => {
    try {
        const { currentProfile, chatLog } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, generationConfig: { responseMimeType: "application/json" } });
        const prompt = `あなたは生徒の長期記憶を管理するAIです。以下の「現在のプロフィール」と「直近の会話ログ」を分析し、最新のプロフィールJSONを作成してください。【重要指示】1. **情報の抽出**: 会話ログから誕生日、好きなもの、苦手なもの、趣味等の情報を抽出し、プロフィールを更新してください。2. **誕生日**: 会話内で日付（〇月〇日）が言及され、それがユーザーの誕生日であれば、必ず \`birthday\` を更新してください。3. **維持**: 会話ログに新しい情報がない項目は、現在の内容をそのまま維持してください。【★重要: 好きなものの判定ルール (厳守)】- **ユーザーが画像を見せただけ、または「これは何？」と質問しただけの対象は、絶対に「好きなもの」に追加しないでください。**- ユーザーが明確に「～が好き」「～にハマっている」「～が気に入っている」と言葉で発言した場合のみ、「好きなもの」に追加してください。【タスク2: 会話の要約】今回の会話の内容を、「○○について話した」のように一文で要約し、\`summary_text\` として出力してください。【現在のプロフィール】${JSON.stringify(currentProfile)}【直近の会話ログ】${chatLog}【出力フォーマット (JSON)】{ "profile": { "nickname": "...", "birthday": "...", "likes": ["..."], "weaknesses": ["..."], "achievements": ["..."], "last_topic": "..." }, "summary_text": "会話の要約文" }`;
        const result = await model.generateContent(prompt);
        let output = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
        if (Array.isArray(output)) output = output[0];
        if (!output.profile) output = { profile: output, summary_text: "（会話終了）" };
        res.json(output);
    } catch (error) { res.status(200).json({ profile: req.body.currentProfile || {}, summary_text: "" }); }
});

app.post('/analyze', async (req, res) => {
    try {
        const { image, mode, grade, subject, name } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_HOMEWORK, generationConfig: { responseMimeType: "application/json", temperature: 0.0 } });
        const prompt = `あなたは小学${grade}年生の${name}さんの${subject}担当の教育AI「ネル先生」です。提供された画像（生徒のノートやドリル）を解析し、以下の厳格なJSONフォーマットでデータを出力してください。【重要: 子供向け解説】- **解説やヒントは、必ず小学${grade}年生が理解できる言葉遣い、漢字（習っていない漢字はひらがなにする）、概念で記述してください。**- 専門用語は使わず、噛み砕いて説明してください。【出力JSONフォーマット】[ { "id": 1, "label": "①", "question": "問題文", "correct_answer": ["正解"], "student_answer": ["手書きの答え"], "is_correct": true, "hints": ["ヒント1", "ヒント2", "ヒント3"] } ]`;
        const result = await model.generateContent([ prompt, { inlineData: { mime_type: "image/jpeg", data: image } } ]);
        let problems = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
        if (!Array.isArray(problems)) problems = [problems];
        res.json(problems);
    } catch (error) { res.status(500).json({ error: "解析に失敗したにゃ: " + error.message }); }
});

app.post('/identify-item', async (req, res) => {
    try {
        const { image, name, location, address } = req.body;
        const tools = [{ google_search: {} }];
        const model = genAI.getGenerativeModel({ model: MODEL_FAST, tools: tools });
        let locationInfo = address ? `クライアント特定住所: **${address}**` : (location ? `GPS座標: 緯度 ${location.lat}, 経度 ${location.lon}` : "");
        const prompt = `あなたは猫の教育AI「ネル先生」です。相手は「${name || '生徒'}」さん。送られてきた画像を解析し、JSON形式で応答してください。${locationInfo}【特定と命名のルール】1. **店舗・建物の場合 (最優先)**: 画像が「お店の外観」「看板」「建物」で、位置情報が利用可能な場合は、Google検索を駆使して**必ず「チェーン名 + 支店名」まで特定して** \`itemName\` に設定してください。2. **商品・小物の場合**: その**モノの正式名称**を \`itemName\` にしてください。【★レアリティ判定基準 (1〜5)】- **1 (★)**: どこでも買える市販品。- **2 (★★)**: ちょっと珍しいもの。建物・建造物は最低「2」。- **3 (★★★)**: その場所限定のもの。動物、人気商品は最低「3」。- **4 (★★★★)**: かなり珍しいもの。- **5 (★★★★★)**: 奇跡レベル。【出力フォーマット (JSON)】\`\`\`json{ "itemName": "正式名称", "rarity": 1, "description": "ネル先生の面白い解説", "realDescription": "本当の解説", "speechText": "『これは（itemName）だにゃ！（description）』" }\`\`\``;
        const result = await model.generateContent([ prompt, { inlineData: { mime_type: "image/jpeg", data: image } } ]);
        let json = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
        res.json(json);
    } catch (error) { res.status(500).json({ error: "解析失敗", speechText: "よく見えなかったにゃ…", itemName: null }); }
});

app.post('/lunch-reaction', async (req, res) => {
    try {
        const { count, name } = req.body;
        await appendToServerLog(name, `給食をくれた(${count}個目)。`);
        const model = genAI.getGenerativeModel({ model: MODEL_FAST });
        let prompt = `あなたは猫の「ネル先生」。生徒の「${name}さん」から${count}個目の給食（カリカリ）をもらいました。面白い感謝の言葉を30文字以内で。`;
        const result = await model.generateContent(prompt);
        res.json({ reply: result.response.text().trim(), isSpecial: (count % 10 === 0) });
    } catch { res.json({ reply: "おいしいにゃ！", isSpecial: false }); }
});

app.post('/game-reaction', async (req, res) => {
    try {
        const { type, name, score } = req.body;
        const model = genAI.getGenerativeModel({ model: MODEL_FAST });
        let prompt = type === 'start' ? `「${name}さん」がゲーム開始。応援して。` : `ゲーム終了。「${name}さん」のスコアは${score}点。コメントして。`;
        const result = await model.generateContent(prompt);
        res.json({ reply: result.response.text().trim(), mood: "excited" });
    } catch { res.json({ reply: "おつかれさまにゃ！", mood: "happy" }); }
});

app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- WebSocket (Chat for simple-chat/embedded) ---
const wss = new WebSocketServer({ server });

wss.on('connection', async (clientWs, req) => {
    const params = parse(req.url, true).query;
    let grade = params.grade || "1";
    let name = decodeURIComponent(params.name || "生徒");
    let mode = params.mode || "simple-chat";

    if (mode === 'chat') { 
        clientWs.close();
        return;
    }

    let geminiWs = null;

    const connectToGemini = (statusContext) => {
        const now = new Date();
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo' };
        const timeOptions = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' };
        const todayStr = now.toLocaleDateString('ja-JP', dateOptions);
        const timeStr = now.toLocaleTimeString('ja-JP', timeOptions);
        
        const GEMINI_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
        
        try {
            geminiWs = new WebSocket(GEMINI_URL);
            
            geminiWs.on('open', () => {
                let systemInstructionText = `
                あなたは「ねこご市立、ねこづか小学校」のネル先生だにゃ。相手は小学${grade}年生の${name}さん。
                現在は ${todayStr} ${timeStr} です。
                語尾は「にゃ」。親しみやすく。
                `;

                const tools = [
                    { google_search: {} },
                    {
                        function_declarations: [
                            {
                                name: "show_kanji",
                                description: "Display a Kanji, word, or math formula on the whiteboard.",
                                parameters: {
                                    type: "OBJECT",
                                    properties: { content: { type: "STRING" } },
                                    required: ["content"]
                                }
                            }
                        ]
                    }
                ];

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
                        tools: tools,
                        systemInstruction: { parts: [{ text: systemInstructionText }] }
                    }
                }));

                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: "server_ready" }));
                }
            });

            geminiWs.on('message', (data) => {
                try {
                    const response = JSON.parse(data);
                    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
                } catch (e) {
                    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
                }
            });

            geminiWs.on('error', (e) => console.error("Gemini WS Error:", e));
            
            geminiWs.on('close', (code, reason) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    try { clientWs.send(JSON.stringify({ type: "gemini_closed" })); } catch(e) {}
                    clientWs.close();
                }
            });

        } catch(e) { 
            clientWs.close(); 
        }
    };

    clientWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'init') {
                const context = msg.context || "";
                name = msg.name || name;
                grade = msg.grade || grade;
                mode = msg.mode || mode;
                connectToGemini(context);
                return;
            }

            if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) {
                return;
            }

            if (msg.toolResponse) {
                geminiWs.send(JSON.stringify({ clientContent: msg.toolResponse }));
                return;
            }
            if (msg.clientContent) {
                geminiWs.send(JSON.stringify({ client_content: msg.clientContent }));
            }
            if (msg.base64Audio) {
                geminiWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: msg.base64Audio }] } }));
            }
            if (msg.base64Image) {
                geminiWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: "image/jpeg", data: msg.base64Image }] } }));
            }
        } catch(e) { console.error("Client WS Handling Error:", e); }
    });

    clientWs.on('close', () => {
        if (geminiWs) geminiWs.close();
    });
});