export const runtime = 'edge';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

// Safely load env vars manually if Next.js hasn't picked them up
let geminiKey = process.env.GEMINI_API_KEY;
let ytKey = process.env.YOUTUBE_API_KEY;

try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf-8');
        const envVars = envFile.split('\n').reduce((acc, line) => {
            const [key, ...val] = line.split('=');
            if (key && val.length > 0) {
                acc[key.trim()] = val.join('=').replace(/^["'](.*)["']$/, '$1').trim();
            }
            return acc;
        }, {} as Record<string, string>);

        if (!geminiKey) geminiKey = envVars['GEMINI_API_KEY'];
        if (!ytKey) ytKey = envVars['YOUTUBE_API_KEY'];
    }
} catch (e) {
    console.error("Failed to read env local manually", e);
}

const YOUTUBE_API_KEY = ytKey;

type VideoResult = {
    videoId: string;
    title: string;
    channelTitle: string;
    viewCount: string;
    thumbnailUrl: string;
    timestamp: number;
};

// Helper to format YouTube view counts
const formatViews = (viewsStr?: string) => {
    if (!viewsStr) return 'N/A';
    const num = parseInt(viewsStr, 10);
    if (isNaN(num)) return viewsStr;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

export async function GET(request: Request) {
    // Safely load env vars manually if Next.js hasn't picked them up
    let geminiKey = process.env.GEMINI_API_KEY;
    let ytKey = process.env.YOUTUBE_API_KEY;

    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const envFile = fs.readFileSync(envPath, 'utf-8');
            const envVars = envFile.split('\n').reduce((acc, line) => {
                const [key, ...val] = line.split('=');
                if (key && val.length > 0) {
                    acc[key.trim()] = val.join('=').replace(/^["'](.*)["']$/, '$1').trim();
                }
                return acc;
            }, {} as Record<string, string>);

            if (!geminiKey) geminiKey = envVars['GEMINI_API_KEY'];
            if (!ytKey) ytKey = envVars['YOUTUBE_API_KEY'];
        }
    } catch (e) {
        console.error("Env read error:", e);
    }

    const { searchParams } = new URL(request.url);
    const gameIdStr = searchParams.get('gameId');
    const query = searchParams.get('query');
    const videoAgeLimit = searchParams.get('videoAgeLimit') || '1y';

    if (!gameIdStr || !query) {
        return NextResponse.json({ error: 'Missing gameId or query' }, { status: 400 });
    }

    const gameId = parseInt(gameIdStr, 10);
    const db = getDb();

    // 1. Get Game Name
    let game: any;
    try {
        game = await db.prepare('SELECT name FROM experiences WHERE id = ?').bind(gameId).first();
    } catch (e) {
        console.error("DB Error:", e);
    }

    if (!game) {
        return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    // 2. Normalize and Cache Check
    const normalizedQuery = query.toLowerCase().trim();
    const queryHash = crypto.createHash('sha256').update(`${game.name}|${normalizedQuery}|${videoAgeLimit}`).digest('hex');

    try {
        const cached = await db.prepare(`
            SELECT gemini_output, youtube_json, timestamp 
            FROM search_cache 
            WHERE game_id = ? AND query_hash = ?
        `).bind(gameId, queryHash).first();

        if (cached) {
            const cacheTime = new Date((cached as any).timestamp).getTime();
            const now = Date.now();
            const ttl = 48 * 60 * 60 * 1000; // 48 hours in MS

            if (now - cacheTime < ttl) {
                console.log("CACHE HIT!");
                return NextResponse.json({
                    gemini_output: cached.gemini_output,
                    youtube_json: JSON.parse(cached.youtube_json)
                });
            } else {
                // Delete expired cache
                await db.prepare('DELETE FROM search_cache WHERE game_id = ? AND query_hash = ?').bind(gameId, queryHash).run();
            }
        }
    } catch (e) {
        console.error("Cache Check Error:", e);
    }

    // 3. Parallel API Calls if not cached
    try {
        console.log("CACHE MISS - Calling External APIs in parallel");

        // --- GEMINI PROMPT ---
        const promptTemplate = `You are a Roblox expert. For the game '${game.name}', provide a concise, high-level strategy for the following user issue: '${normalizedQuery}'. Focus on current meta, hidden mechanics, or specific steps. Limit to 300 words. Format cleanly in Markdown. Do NOT wrap the entire response in a code block.`;

        const geminiPromise = async () => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptTemplate }] }]
                })
            });
            const data = await response.json();
            if (data.error) {
                console.error("Gemini API Error Object:", JSON.stringify(data.error, null, 2));
                return { text: "I'm sorry, Sage encountered an anomaly in the AI data stream." };
            }
            return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "" };
        };

        // --- YOUTUBE API ---
        let publishedAfterParam = '';
        if (videoAgeLimit !== 'any') {
            const limitDate = new Date();
            if (videoAgeLimit === '1y') {
                limitDate.setFullYear(limitDate.getFullYear() - 1);
            } else if (videoAgeLimit === '1m') {
                limitDate.setMonth(limitDate.getMonth() - 1);
            } else if (videoAgeLimit === '1w') {
                limitDate.setDate(limitDate.getDate() - 7);
            }
            publishedAfterParam = `&publishedAfter=${limitDate.toISOString()}`;
        }

        const ytSearchUrl = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&q=${encodeURIComponent(`${game.name} ${normalizedQuery} guide`)}&type=video${publishedAfterParam}&key=${ytKey}`;

        // Simple helper to fetch youtube video stats concurrently without slowing down primary request too much
        const ytPromise = async () => {
            const res = await fetch(ytSearchUrl);
            const data = await res.json();

            if (!data.items || data.items.length === 0) return [];

            // We need a second call per video to get view counts (since search doesn't return viewCount)
            const videoIds = data.items.map((i: any) => i.id.videoId).join(',');
            const statsUrl = `https://youtube.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${ytKey}`;
            const statsRes = await fetch(statsUrl);
            const statsData = await statsRes.json();

            const statsMap = new Map();
            if (statsData.items) {
                statsData.items.forEach((item: any) => {
                    statsMap.set(item.id, item.statistics.viewCount);
                });
            }

            const results: VideoResult[] = data.items.slice(0, 3).map((item: any) => {
                const vidId = item.id.videoId;
                // Try to loosely extract deep link timestamp via crude snippet analysis (this is rudimentary for MVP)
                let timestamp = 0;
                const lowSnippet = item.snippet.description.toLowerCase();
                if (lowSnippet.includes('minute') || lowSnippet.includes(':')) {
                    // Just default to 15s to bypass intro for simple implementation
                    timestamp = 15;
                }

                return {
                    videoId: vidId,
                    title: item.snippet.title,
                    channelTitle: item.snippet.channelTitle,
                    viewCount: formatViews(statsMap.get(vidId)),
                    thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                    timestamp: timestamp
                };
            });
            return results;
        };

        const [geminiResult, youtubeResults] = await Promise.all([geminiPromise(), ytPromise()]);

        const finalGeminiOutput = geminiResult.text || "I'm sorry, Sage encountered an anomaly in the data stream.";

        // 4. Save to Cache
        try {
            await db.prepare(`
                INSERT INTO search_cache (game_id, query_hash, gemini_output, youtube_json)
                VALUES (?, ?, ?, ?)
            `).bind(gameId, queryHash, finalGeminiOutput, JSON.stringify(youtubeResults)).run();
        } catch (e) {
            console.error("Cache Insert Error:", e);
        }

        return NextResponse.json({
            gemini_output: finalGeminiOutput,
            youtube_json: youtubeResults
        });

    } catch (error: any) {
        console.error("API Call Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
