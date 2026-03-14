export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';
import * as cheerio from 'cheerio';

// Helper to format YouTube view counts
const formatViews = (viewsStr?: string) => {
    if (!viewsStr) return 'N/A';
    const num = parseInt(viewsStr, 10);
    if (isNaN(num)) return viewsStr;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

type VideoResult = {
    videoId: string;
    title: string;
    channelTitle: string;
    viewCount: string;
    thumbnailUrl: string;
    timestamp: number;
};

export async function GET(request: Request) {
    // In Edge runtime on Cloudflare, env vars are in getRequestContext().env
    // In Vercel or local dev, they might be in process.env
    let env: Record<string, any> = {};
    try {
        const ctx = getRequestContext();
        if (ctx && ctx.env) {
            env = ctx.env;
        }
    } catch (e) {
        // Fallback for non-cloudflare edge environments
        env = process.env;
    }

    const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const ytKey = env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

    const { searchParams } = new URL(request.url);
    const gameIdStr = searchParams.get('gameId');
    const query = searchParams.get('query');
    const videoAgeLimit = searchParams.get('videoAgeLimit') || '1y';

    if (!gameIdStr || !query) {
        return NextResponse.json({ error: 'Missing gameId or query' }, { status: 400 });
    }

    const gameId = parseInt(gameIdStr, 10);
    const db = getDb();

    // 1. Get Game Name and Wiki URL
    let game: any;
    try {
        game = await db.prepare('SELECT name, wiki_url FROM experiences WHERE id = ?').bind(gameId).first();
    } catch (e) {
        console.error("DB Error:", e);
    }

    if (!game) {
        return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    // 2. Normalize and Cache Check
    const normalizedQuery = query.toLowerCase().trim();
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${game.name}|${normalizedQuery}|${videoAgeLimit}`));
    const queryHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

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

        // --- WIKI IMAGE EXTRACTION ---
        const wikiImagePromise = async () => {
            if (!game.wiki_url) return [];
            try {
                // Use MediaWiki API (action=parse) which is more robust than direct HTML scraping
                const apiBase = game.wiki_url.split('/wiki/')[0] + '/api.php';
                const searchPage = normalizedQuery.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');

                // Try searching for a specific page first, fallback to main wiki title
                const pagesToTry = [searchPage, game.name.replace(/ /g, '_')];
                let html = "";

                for (const page of pagesToTry) {
                    const apiUrl = `${apiBase}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&origin=*`;
                    const res = await fetch(apiUrl);
                    const data = await res.json() as any;
                    if (data.parse?.text?.['*']) {
                        html = data.parse.text['*'];
                        break;
                    }
                }

                if (!html) return [];

                const $ = cheerio.load(html);
                const extractedImages: { url: string, score: number, caption: string }[] = [];
                const queryKeywords = normalizedQuery.split(/\s+/).filter(k => k.length > 3);

                $('img').each((_, el) => {
                    const src = $(el).attr('data-src') || $(el).attr('src');
                    if (!src || src.startsWith('data:')) return;

                    const alt = $(el).attr('alt') || '';
                    const caption = $(el).closest('figure').find('figcaption').text().trim() ||
                        $(el).closest('.gallery-item').find('.gallery-item-caption').text().trim() ||
                        alt;

                    let score = 0;
                    queryKeywords.forEach(kw => {
                        if (alt.toLowerCase().includes(kw)) score += 3;
                        if (caption.toLowerCase().includes(kw)) score += 1;
                    });

                    // Bonus for likely relevant images
                    if (alt.toLowerCase().includes('rod') || alt.toLowerCase().includes('merchant')) score += 1;

                    extractedImages.push({ url: src, score, caption });
                });

                console.log(`Extracted ${extractedImages.length} images via API. Alts: ${extractedImages.map(i => i.caption).join(', ')}`);

                return extractedImages
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5)
                    .map(img => {
                        let cleanUrl = img.url;
                        if (cleanUrl.includes('/revision/latest')) {
                            cleanUrl = cleanUrl.split('/revision/latest')[0] + '/revision/latest';
                        }
                        return { url: cleanUrl, caption: img.caption };
                    });
            } catch (e) {
                console.error("Wiki extraction error:", e);
                return [];
            }
        };

        const [wikiImages] = await Promise.all([wikiImagePromise()]);

        // --- GEMINI PROMPT ---
        let imageContext = "";
        if (wikiImages.length > 0) {
            imageContext = "\nBelow are relevant images from the game wiki that YOU MUST EMBED in your guide using standard Markdown syntax `![Caption](URL)` when referring to specific items, locations, or steps:\n" +
                wikiImages.map(img => `- ${img.caption}: ${img.url}`).join('\n');
        }

        const promptTemplate = `You are a Roblox expert. For the game '${game.name}', provide a concise, informative strategy guide for the following user issue: '${normalizedQuery}'. 

Focus on:
1. Current meta and hidden mechanics.
2. Specific, actionable steps.
3. Be visual and descriptive.

${imageContext}

Limit your response to 400 words. Format cleanly in Markdown with bold headers. IMPORTANT: Embed the provided images using ` + " `![Description](URL)` " + ` exactly where they are most relevant to your explanation. Do NOT wrap the entire response in a code block.`;

        const geminiPromise = async () => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptTemplate }] }]
                })
            });
            const data = (await response.json()) as any;
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

        // IMPROVED QUERY: Use quotes for game name and user query to avoid name-matching creator issues
        // e.g. "Fisch" "how to get carbon rod" guide
        const ytSearchUrl = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=8&q=${encodeURIComponent(`"${game.name}" "${normalizedQuery}" guide`)}&type=video${publishedAfterParam}&key=${ytKey}`;

        // Simple helper to fetch youtube video stats concurrently without slowing down primary request too much
        const ytPromise = async () => {
            const res = await fetch(ytSearchUrl);
            const data = (await res.json()) as any;

            if (!data.items || data.items.length === 0) return [];

            // We need a second call per video to get view counts (since search doesn't return viewCount)
            const videoIds = data.items.map((i: any) => i.id.videoId).join(',');
            const statsUrl = `https://youtube.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${ytKey}`;
            const statsRes = await fetch(statsUrl);
            const statsData = (await statsRes.json()) as any;

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
