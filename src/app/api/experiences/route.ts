export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q) {
        return NextResponse.json([]);
    }

    try {
        const db = getDb();
        const stmt = db.prepare(`
            SELECT id, name, wiki_url 
            FROM experiences 
            WHERE name LIKE ? 
            LIMIT 10
        `);

        const d1Res = await stmt.bind(`%${q}%`).all();
        let results = (d1Res.results || []) as any[];

        // If we don't have enough local results, dynamically query the Fandom API to discover new ones
        if (results.length < 3) {
            try {
                const wikiApiUrl = `https://roblox.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json`;
                const wikiRes = await fetch(wikiApiUrl);
                const wikiData = (await wikiRes.json()) as any;

                if (wikiData.query && wikiData.query.search) {
                    const newExperiences = wikiData.query.search
                        .map((item: any) => ({
                            name: item.title,
                            wiki_url: `https://roblox.fandom.com/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`
                        }))
                        // Filter out wiki meta pages
                        .filter((item: any) => !item.name.includes(':'));

                    // Insert the newly discovered games into our database so they are cached for next time
                    const insertStmt = db.prepare(`
                        INSERT INTO experiences (name, wiki_url) 
                        SELECT ?, ? 
                        WHERE NOT EXISTS (SELECT 1 FROM experiences WHERE name = ?)
                        RETURNING id, name, wiki_url
                    `);

                    const newlyAdded: any[] = [];
                    const batchStmts = newExperiences.map((exp: any) => insertStmt.bind(exp.name, exp.wiki_url, exp.name));

                    if (batchStmts.length > 0) {
                        const batchResults = await db.batch(batchStmts);
                        for (const res of batchResults) {
                            if (res.results && res.results.length > 0) {
                                newlyAdded.push(res.results[0]);
                            }
                        }
                    }

                    // Combine local and newly fetched results
                    const allResults = [...results, ...newlyAdded];
                    const uniqueNames = new Set();
                    results = allResults.filter(item => {
                        if (uniqueNames.has(item.name)) return false;
                        uniqueNames.add(item.name);
                        return true;
                    }).slice(0, 10);
                }
            } catch (apiError) {
                console.error("Fandom API Search Error:", apiError);
                // Non-fatal, just fall back to whatever local results we had
            }
        }

        return NextResponse.json(results);
    } catch (error) {
        console.error('DB Error:', error);
        return NextResponse.json({ error: 'Failed to fetch experiences' }, { status: 500 });
    }
}
