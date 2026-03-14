export const runtime = 'edge';
import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
    // Add simple authentication (e.g., using a secret parameter or header)
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Quick security check (replace with real secret in production)
    if (token !== 'sync_secret_123') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const response = await fetch('https://roblox.fandom.com/wiki/Category:Experiences');
        const html = await response.text();
        const $ = cheerio.load(html);

        const experiences: { name: string, wiki_url: string }[] = [];

        // Fandom category pages list items under .category-page__member-link
        $('.category-page__member-link').each((_, element) => {
            const name = $(element).text().trim();
            const href = $(element).attr('href');

            if (name && href && !name.includes('Category:')) {
                experiences.push({
                    name,
                    wiki_url: `https://roblox.fandom.com${href}`
                });
            }
        });

        // Add some popular ones manually in case they aren't on page 1 of the category
        const manualAdds = [
            { name: 'Adopt Me!', wiki_url: 'https://roblox.fandom.com/wiki/Adopt_Me!' },
            { name: 'Brookhaven RP', wiki_url: 'https://roblox.fandom.com/wiki/Brookhaven_RP' },
            { name: 'Tower of Hell', wiki_url: 'https://roblox.fandom.com/wiki/Tower_of_Hell' },
            { name: 'Blox Fruits', wiki_url: 'https://roblox.fandom.com/wiki/Blox_Fruits' },
            { name: 'Fisch', wiki_url: 'https://fisch.fandom.com/wiki/Fisch_Wiki' },
            { name: 'MeepCity', wiki_url: 'https://roblox.fandom.com/wiki/MeepCity' },
            { name: 'Murder Mystery 2', wiki_url: 'https://roblox.fandom.com/wiki/Murder_Mystery_2' }
        ];

        // Combine and deduplicate
        const allExperiences = [...manualAdds, ...experiences];
        const uniqueNames = new Set();
        const finalExperiences = allExperiences.filter(exp => {
            if (uniqueNames.has(exp.name)) return false;
            uniqueNames.add(exp.name);
            return true;
        });

        const db = getDb();
        const insertStmt = db.prepare(`
            INSERT INTO experiences (name, wiki_url) 
            SELECT ?, ? 
            WHERE NOT EXISTS (SELECT 1 FROM experiences WHERE name = ?)
        `);

        // Transaction for faster inserts
        const batchStmts = finalExperiences.map((exp: any) => insertStmt.bind(exp.name, exp.wiki_url, exp.name));
        if (batchStmts.length > 0) {
            await db.batch(batchStmts);
        }

        return NextResponse.json({
            success: true,
            message: `Successfully synced ${finalExperiences.length} experiences to database.`
        });

    } catch (error: any) {
        console.error('Scraper Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
