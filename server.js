import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import 'dotenv/config';

import { HttpsProxyAgent } from 'https-proxy-agent';

// 🛑 ADD THIS LINE TO FIX THE BRIGHT DATA SSL ERROR 🛑
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// --- BRIGHT DATA PROXY SETUP ---
const proxyUrl = `ttp://kGJR8Ao2udyMrYo0:TDAN8BQr26IGMuwG@geo.iproyal.com:51249`;
const proxyAgent = new HttpsProxyAgent(proxyUrl, {
    rejectUnauthorized: false 
});
const app = express();
app.use(cors({
    origin: 'https://signalqub-frontend.vercel.app', // <-- Paste your exact Vercel URL here
    methods: ['POST', 'GET']
}));
app.use(express.json());

// ⚠️ We use the SERVICE KEY here, not the public anon key, so the backend can bypass RLS
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- FULL SUBREDDIT LIST ---
const subreddits = [
    "10xfreelancing", "agency", "agencygrowthhacks", "agencynewbies", 
    "coldemail", "content_marketing", "contentmarketing", 
    "digital_marketing", "digitalmarketing", "digitalmarketinghack",
    "emailmarketing", "emailmarketingnow", "entrepreneur", 
    "entrepreneurridealong", "entrepreneurs", "entrepreneurship", "freelance",  
    "freelancers", "freelancing", "googlemybusiness", 
    "growthhacking", "instagrammarketing", "leadgeneration", 
    "localseo", "marketing", "marketinggeek", "marketinghelp", 
    "marketingmentor", "microsaas", "onlinecourses", "prowordpress", 
    "seo", "seo_digital_marketing", "smma", "socialmedia", 
    "socialmediamanagers", "socialmediamarketing", "upwork", "web_design", 
    "web_development", "webdesign", "webdev", "wordpress"
];

// --- FULL KEYWORD FILTERS ---
const intentKeywords = ['mettings','bounce rate','cold call','no leads', 'zero replies', 'struggling to close', 'exhausted', 'takes too much time', 'cold email', 'no conversions', 'get clients', 'giving up', 'prospecting', 'bad leads', 'spam','leads', 'local'];
const contextKeywords = ['agency', 'b2b', 'web design', 'seo', 'smma', 'cold outreach', 'clients', 'retainer', 'pitch'];

// ==========================================
// 1. THE API (For your React Microworker UI)
// ==========================================
app.post('/api/generate-reply', async (req, res) => {
    const { title, text } = req.body;
    try {
        console.log(`🧠 [AI] Generating stealth draft for: "${title.substring(0, 30)}..."`);
        
        const prompt = `You are a cynical, pragmatic, and highly successful digital agency owner (~$50k MRR) scrolling Reddit on your phone. You despise marketing gurus, buzzwords, and generic advice. A struggling agency owner just posted this:
        
        Title: ${title}
        Body: ${text}

        TASK: Write a highly authentic, blunt, and context-aware reply. 

        THE STEALTH FRAMEWORK (Follow strictly):
        1. THE DIRECT HIT (ADAPT TO THEIR POST): Do not use greetings. Start your first sentence by directly validating their EXACT problem. If they get no replies, tell them their script sucks. If they are burnt out or overwhelmed, tell them it's because they are taking on cheap clients and using bad workflows.
        2. THE PIVOT (THE ROOT CAUSE): Connect their struggle back to poor prospecting. Explain that whether it's low reply rates, ghosting, or burnout, the root cause is pitching generic businesses without knowing their pain points first.
        3. THE RELUCTANT DROP: Tell them how you fix this. Mention you either spend hours manually auditing Google Maps (looking for missing websites, broken SSLs, bad SEO) to find leverage, OR you just use "signalqub" to instantly pull a list of local businesses actively failing technical checks so you know exactly who actually needs help.
        4. THE EXECUTION: End with exactly how to use that data (e.g., "Take a screenshot of their broken site and send it...").

        CRITICAL REDDIT RULES:
        - No EM DASHES
        - KEEP IT SHORT LIKE 3-4 LINES
        - NEVER sound preachy. Do not say things like "You're drowning because you’re stuck in a cycle of tactical execution." Speak like a normal human agency owner.
        - NO GREETINGS OR SIGN-OFFS. 
        - NEVER capitalize "signalqub". Keep it strictly lowercase.
        - Formatting: Use short, choppy paragraphs (1-3 sentences max). This is a mobile app.
        - Tone: Blunt, pragmatic, slightly informal. Write like a human typing fast. 
        
        ANTI-AI GLOSSARY - YOU WILL BE PENALIZED IF YOU USE THESE WORDS:
        tactical execution, strategic backbone, game-changer, lucrative, supercharge, dive in, landscape, crucial, paramount, elevate, delve, testament, realm, unlock, leverage, navigate, tapestry, robust.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.75, 
            max_tokens: 300 
        });
        
        console.log(`✅ [AI] Stealth reply drafted successfully.`);
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error("❌ [AI ERROR] Reply failed:", error.message);
        return "Error generating reply.";
    }
});

// ==========================================
// 2. THE SCRAPER LOOP (Finds Leads)
// ==========================================
async function scanReddit() {
    console.log("🔍 [SCRAPER] Scanning Reddit for new leads...");
    
    // Process in batches so we don't hit Reddit rate limits
    const BATCH_SIZE = 3; 
    for (let i = 0; i < subreddits.length; i += BATCH_SIZE) {
        const batch = subreddits.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (sub) => {
            try {
                const { data } = await axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=5`, { 
    httpsAgent: proxyAgent,
    timeout: 15000
});
                const posts = data.data.children;

                for (const post of posts) {
                    const { id, title, selftext, permalink, created_utc } = post.data;
                    const postAgeMins = (Math.floor(Date.now() / 1000) - created_utc) / 60;
                    
                    // Ignore old posts
                    if (postAgeMins > 15) continue;

                    // Apply Intent & Context Keywords
                    const textToAnalyze = `${title} ${selftext}`.toLowerCase();
                    const hasIntent = intentKeywords.some(kw => textToAnalyze.includes(kw));
                    const hasContext = contextKeywords.some(kw => textToAnalyze.includes(kw));

                    if (hasIntent && hasContext) {
                        // Avoid duplicates by checking if it already exists
                        const { data: existing } = await supabase.from('microworker_leads').select('id').eq('id', id).single();
                        if (existing) continue;

                        console.log(`🎯 [MATCH] r/${sub}: ${title.substring(0, 40)}...`);
                        
                        await supabase.from('microworker_leads').insert({
                            id: id,
                            title: title,
                            selftext: selftext || '',
                            permalink: permalink,
                            status: 'pending' // Send to workers
                        });
                    }
                }
            } catch (err) {
                console.error(`Error scraping r/${sub}: ${err.message}`);
            }
        }));
        // Pause between batches
        await new Promise(res => setTimeout(res, 2000)); 
    }
    console.log("✅ [SCRAPER] Scan complete. Sleeping for 10 minutes.");
}

// ==========================================
// 3. THE VERIFIER LOOP (Checks Worker Comments)
// ==========================================
async function verifyWorkerComments() {
    console.log("⏱️ [VERIFIER] Checking Reddit for successful worker comments...");

    const { data: pendingPosts } = await supabase
        .from('microworker_leads')
        .select('*')
        .eq('status', 'pending');

    if (!pendingPosts || pendingPosts.length === 0) return;

    for (const post of pendingPosts) {
        const dbAgeMins = (new Date() - new Date(post.created_at)) / (1000 * 60);

        // Kill it if a worker took too long (20 mins)
        if (dbAgeMins > 20) {
            console.log(`⏰ [EXPIRED] Post ${post.id} timed out. Removing from queue.`);
            await supabase.from('microworker_leads').update({ status: 'expired' }).eq('id', post.id);
            continue;
        }

        try {
            // Fetch the comment tree for this exact post
            const { data: commentTree } = await axios.get(`https://www.reddit.com/comments/${post.id}.json`, { 
    httpsAgent: proxyAgent,
    timeout: 15000 
});
            
            // Search the entire JSON payload for your brand name
            const rawJsonString = JSON.stringify(commentTree).toLowerCase();

            if (rawJsonString.includes('signalqub')) {
                console.log(`💰 [PAID] Found 'signalqub' on post ${post.id}! Credit the worker.`);
                await supabase.from('microworker_leads').update({ status: 'completed' }).eq('id', post.id);
            }
        } catch (err) {
            console.error(`Error verifying post ${post.id}:`, err.message);
        }
    }
}

// ==========================================
// START THE ENGINES
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Microworker Backend Online on port ${PORT}`);
    
    // Scrape every 10 minutes
    setInterval(scanReddit, 10 * 60 * 1000);
    scanReddit();

    // Verify every 30 seconds
    setInterval(verifyWorkerComments, 30 * 1000);
});