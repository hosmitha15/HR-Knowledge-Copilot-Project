
import CacheEntry from "../models/CacheEntry.js";

const MAX_CACHE_SIZE = 100;

const memCache = new Map();

export function normalizeQuestion(q) {
    return q
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export async function warmCache() {
    try {
        const top = await CacheEntry.find({})
            .sort({ frequency: -1 })
            .limit(MAX_CACHE_SIZE);

        memCache.clear();
        for (const entry of top) {
            memCache.set(entry.normalizedQuestion, {
                answer: entry.answer,
                sources: entry.sources,
                multiDoc: entry.multiDoc,
                frequency: entry.frequency,
                originalQuestion: entry.originalQuestion,
            });
        }
        console.log(` LFU Cache warmed: ${memCache.size} entries loaded from MongoDB`);
    } catch (err) {
        console.error("Cache warm-up failed (non-fatal):", err.message);
    }
}


export function cacheGet(question) {
    const key = normalizeQuestion(question);
    const entry = memCache.get(key);
    if (!entry) {
        console.log(`💨 LFU Cache MISS  — key="${key.slice(0, 60)}…"`);
        return null;
    }
    entry.frequency += 1;
    console.log(`⚡ Retrieved from LFU cache (key="${key.slice(0, 60)}…", freq=${entry.frequency})`);
    CacheEntry.findOneAndUpdate(
        { normalizedQuestion: key },
        { $inc: { frequency: 1 }, lastAskedAt: new Date() }
    ).catch(() => { });
    return entry;
}


export async function cachePut(question, answer, sources = [], multiDoc = false) {
    const key = normalizeQuestion(question);

    if (memCache.has(key)) {
        const entry = memCache.get(key);
        entry.answer = answer;
        entry.sources = sources;
        entry.multiDoc = multiDoc;
        return;
    }

    if (memCache.size >= MAX_CACHE_SIZE) {
        _evictLeastFrequent();
    }

    memCache.set(key, {
        answer,
        sources,
        multiDoc,
        frequency: 1,
        originalQuestion: question,
    });
    console.log(`📥 LFU Cache STORE — key="${key.slice(0, 60)}…" (size=${memCache.size}/${MAX_CACHE_SIZE})`);

    try {
        await CacheEntry.findOneAndUpdate(
            { normalizedQuestion: key },
            {
                $set: { answer, sources, multiDoc, originalQuestion: question, lastAskedAt: new Date() },
                $inc: { frequency: 1 },
                $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
        );
    } catch (err) {
        if (!err.message?.includes("duplicate")) {
            console.error("⚠️  Cache persist error:", err.message);
        }
    }
}

function _evictLeastFrequent() {
    let lowestKey = null;
    let lowestFreq = Infinity;

    for (const [key, val] of memCache.entries()) {
        if (val.frequency < lowestFreq) {
            lowestFreq = val.frequency;
            lowestKey = key;
        }
    }
    if (lowestKey) {
        memCache.delete(lowestKey);
        console.log(`♻️  LFU Cache EVICT — key="${lowestKey.slice(0, 60)}…" (freq=${lowestFreq})`);
    }
}

export function getCacheStats(topN = 20) {
    const entries = Array.from(memCache.entries())
        .map(([, val]) => ({
            question: val.originalQuestion,
            frequency: val.frequency,
            sources: val.sources,
            multiDoc: val.multiDoc,
            answerPreview: val.answer?.slice(0, 120) + "...",
        }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, topN);

    return { totalCached: memCache.size, maxCacheSize: MAX_CACHE_SIZE, topQuestions: entries };
}

export async function clearCache() {
    const size = memCache.size;
    memCache.clear();
    await CacheEntry.deleteMany({}).catch(() => { });
    if (size > 0) console.log(`🗑️  LFU Cache CLEARED — removed ${size} in-memory + all MongoDB entries`);
}
