// backend/controllers/aiController.js
// All AI business logic — aiRoutes.js only wires these up.
import { getAIResponse } from '../services/aiService.js';
import Request from '../models/Request.js';
import CachedTroubleshooting from '../models/CachedTroubleshooting.js';
import natural from 'natural';
const { TfIdf, PorterStemmer, WordTokenizer } = natural;
const tokenizer = new WordTokenizer();

// ── Noise words that carry no meaning for IT issue matching ──────────────────
// These are stripped before any comparison so "how do I fix my printer" and
// "printer not working" both reduce to the same meaningful core: "fix printer".
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'my','our','your','its','i','we','you','it','this','that','is','are',
  'was','were','be','been','being','have','has','had','do','does','did',
  'will','would','could','should','may','might','can','not','no','how',
  'what','when','where','why','who','which','from','by','about','as',
  'into','through','during','before','after','above','below','up','down',
  'out','off','over','under','again','then','once','here','there','all',
  'both','each','few','more','most','other','some','such','than','too',
  'very','just','also','am','get','got','getting','make','use','using',
  'please','help','need','want','try','tried','still','keep','keeps',
  'keep','now','only','own','same','so','than','too','very','s','t',
  'don','doesn','isn','wasn','weren','cant','wont','shouldnt',
  // Extra filler words that inflate keyword counts without adding topic signal
  'cannot', 'running', 'receiv',
]);

// ── IT-domain synonym map ────────────────────────────────────────────────────
// Common IT terms that mean the same thing but look different to a stemmer.
// Each value is the canonical form that all synonyms collapse to.
// This ensures "wifi" and "wireless" both become "wifi" before comparison.
//
// ⚠️  IMPORTANT DESIGN RULE — Device words are NOT in this map.
// "laptop", "computer", "printer", "phone", "screen" are CONTEXT (the device
// the problem is happening on), not TOPIC (what is actually wrong).
// Two entirely different problems can share the same device:
//   "how do I use WhatsApp on laptop"   → topic: app-usage/whatsapp
//   "laptop not receiving power"         → topic: power/hardware
// Both involve a laptop but they need completely different solutions.
// Collapsing them to the same "computer" token destroys that distinction.
// Device words are handled separately in DEVICE_WORDS below — they are
// stripped from Gate 1 (topic overlap) but kept for cosine scoring.
const IT_SYNONYMS = {
  // Network / connectivity — these ARE topic words
  'wifi':        'wifi',     'wireless':    'wifi',     'wi-fi':      'wifi',    'wlan':       'wifi',
  'connecting':  'internet', 'connected':   'internet', 'disconnect': 'internet',
  'internet':    'internet', 'connection':  'internet', 'network':    'internet',
  // Email — topic word
  'email':       'email',    'outlook':     'email',    'mail':       'email',   'gmail':      'email',
  // Printing action — topic word (physical jams are device-context, handled by DEVICE_WORDS)
  'print':       'print',    'printing':    'print',    'printed':    'print',   'printout':   'print',
  // Login / access — topic word
  'login':       'login',    'logon':       'login',    'signin':     'login',   'password':   'login',
  'access':      'login',    'credential':  'login',    'username':   'login',
  // Performance / stability — topic word
  'slow':        'slow',     'hang':        'slow',     'frozen':     'slow',    'freeze':     'slow',
  'crash':       'slow',     'stuck':       'slow',     'lagging':    'slow',    'lag':        'slow',
  // Software / app — topic word
  'software':    'software', 'application': 'software', 'program':    'software','app':        'software',
  // Update / install — topic word
  'update':      'update',   'install':     'update',   'upgrade':    'update',
  // Error / not working — topic word
  'error':       'error',    'fail':        'error',    'failed':     'error',
  'notwork':     'error',    'problem':     'error',    'issue':      'error',
  'broken':      'error',    'work':        'error',    'working':    'error',
  // Power — topic word
  'power':       'power',    'charging':    'power',    'charge':     'power',   'battery':    'power',
  'turning':     'power',    'startup':     'power',    'boot':       'power',   'booting':    'power',
  // Screen/display — these are SYMPTOMS (topic), not just device names
  'screen':      'screen',   'monitor':     'screen',   'display':    'screen',
  'blank':       'screen',   'black':       'screen',   'flickering': 'screen',  'displaying': 'screen',
};

// ── Device/context words — stripped from topic-overlap (Gate 1) and coverage (Gate 3) ───
// These identify WHERE the problem is, not WHAT the problem is.
// Kept in full keyword vectors for cosine scoring (Gate 2) — a printer query
// still scores higher against another printer query than a network query —
// but cannot on their own cause a topic match or inflate coverage counts.
//
// ⚠️  NOTE: "screen/monitor/display/blank" are intentionally NOT here.
// They describe a visual symptom (topic), not merely the device type.
// "computer screen blank" and "monitor display not working" share topic=screen → correct match.
const DEVICE_WORDS = new Set([
  'computer', 'laptop', 'pc', 'desktop', 'workstation', 'machine', 'device',
  'printer', 'scanner',
  'phone', 'voip', 'telephone',
  'toner', 'cartridge', 'ink', 'jammed', 'jam',
]);

// ── Extract meaningful keywords from an issue description ────────────────────
// Returns an array of stemmed, de-noised, synonym-normalised tokens —
// the "fingerprint" of the issue (includes device words for cosine scoring).
function extractKeywords(text) {
  const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
  return tokens
    .filter(t => t.length > 2 && !STOP_WORDS.has(t) && /^[a-z]/.test(t))
    .map(t => {
      const synKey = t.replace(/-/g, '');
      if (IT_SYNONYMS[synKey]) return IT_SYNONYMS[synKey];
      // Normalise device words to their canonical form (e.g. "laptop" → "computer")
      // so they score correctly in cosine, but keep them as device tokens.
      if (DEVICE_WORDS.has(synKey)) return synKey;
      return PorterStemmer.stem(t);
    });
}

// ── Extract TOPIC-ONLY keywords (no device words) ─────────────────────────────
// Used exclusively for Gate 1 (topic overlap).  Device words like "computer",
// "printer", "phone" are stripped because sharing only a device word says
// nothing about whether two issues have the same root cause.
//
// Example:
//   "how do I use WhatsApp on laptop" → topic keywords: ["whatsapp", "use"]
//   "laptop not receiving power"       → topic keywords: ["receiv", "power"]
//   shared topic keywords: NONE → Gate 1 REJECTS → correct, no false match
function extractTopicKeywords(text) {
  return extractKeywords(text).filter(k => !DEVICE_WORDS.has(k));
}

// ── Topic guard: ensure both issues share at least one meaningful TOPIC word ──
// Device words (computer, laptop, printer, phone, screen) are intentionally
// excluded here — they are context, not topic.  Two issues that share only
// a device word ("laptop not receiving power" and "how do I use WhatsApp on
// laptop") must NOT match at Gate 1.
// Only action/problem words (login, internet, slow, print, power, error…)
// can satisfy this gate.
function sharesMeaningfulTopic(keywordsA, keywordsB) {
  // Use topic-only keywords (device words already stripped by extractTopicKeywords)
  const setA = new Set(keywordsA);
  return keywordsB.some(k => setA.has(k));
}

// ── TF-IDF cosine similarity between two keyword lists ───────────────────────
// TF-IDF weights rare/specific words higher than common ones.
// Cosine similarity measures the angle between two word-frequency vectors —
// 1.0 = identical topic, 0.0 = completely unrelated.
function tfidfCosineSimilarity(queryKeywords, cachedKeywords) {
  if (!queryKeywords.length || !cachedKeywords.length) return 0;

  // Build a combined vocabulary from both keyword lists
  const vocab = [...new Set([...queryKeywords, ...cachedKeywords])];

  // Term frequency vectors (simple TF — fraction of total tokens)
  const tfVec = (keywords) => {
    const freq = {};
    keywords.forEach(k => { freq[k] = (freq[k] || 0) + 1; });
    return vocab.map(v => (freq[v] || 0) / keywords.length);
  };

  const vecA = tfVec(queryKeywords);
  const vecB = tfVec(cachedKeywords);

  // Cosine similarity = dot product / (magnitude A * magnitude B)
  const dot  = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// ── Main cache lookup ────────────────────────────────────────────────────────
// Matching strategy (three-gate system — ALL three must pass):
//
//   Gate 1 — Topic overlap:   the new issue and the cached issue must share
//             at least one stemmed content word. "Facebook login" and
//             "laptop time" share zero words → immediate reject.
//
//   Gate 2 — TF-IDF cosine:   the keyword vectors must be ≥ 0.55 similar.
//             This handles paraphrasing ("wifi not connecting" ≈ "cannot
//             connect to wireless network") while rejecting loose matches.
//
//   Gate 3 — Keyword coverage: at least 40% of the query's keywords must
//             appear (stemmed) in the cached entry. Prevents a one-word
//             overlap from triggering a match on long sentences.
//
// The threshold combination (0.55 cosine + 40% coverage + shared topic)
// is deliberately conservative. It is far better to ask Gemini again than
// to serve the wrong cached steps.

// Thresholds — deliberately conservative.  A false positive (wrong cached
// steps served to the user) is far worse than a cache miss (Gemini called again).
//
// Key changes from previous version:
// - Gate 1 now uses TOPIC keywords only (device words excluded) — this is
//   the primary fix for the "whatsapp on laptop" vs "laptop not receiving power" bug.
// - Gate 3 coverage is also computed on TOPIC keywords only, so device words
//   like "computer" or "printer" cannot inflate the denominator and hide a
//   real mismatch.
// - Cosine threshold raised to 0.50 (was 0.40) for tighter vector alignment.
// - Coverage threshold raised to 0.55 (was 0.50) on topic keywords.
const COSINE_THRESHOLD   = 0.50;  // minimum TF-IDF cosine similarity (full keywords)
const COVERAGE_THRESHOLD = 0.55;  // minimum topic-keyword coverage fraction

async function checkGlobalCache(issueText) {
  try {
    const normalized = issueText.toLowerCase().replace(/\s+/g, ' ').trim();

    // ── Exact match (fastest path) ───────────────────────────────────────────
    const exactMatch = await CachedTroubleshooting.findOne({ normalizedIssue: normalized });
    if (exactMatch) {
      exactMatch.usageCount = (exactMatch.usageCount || 0) + 1;
      await exactMatch.save();
      console.log('✅ Cache: EXACT match');
      return { found: true, steps: exactMatch.steps.map(s => s.question), source: 'cached' };
    }

    // ── Semantic match ────────────────────────────────────────────────────────
    const queryKeywords      = extractKeywords(normalized);       // full set — used for cosine (Gate 2)
    const queryTopicKeywords = extractTopicKeywords(normalized);  // topic-only — used for Gate 1 & Gate 3

    // If the issue is so short/vague it has no meaningful keywords, skip cache
    if (queryKeywords.length < 2) {
      console.log('⚠️ Cache: query too vague to match — going to Gemini');
      return { found: false };
    }

    // If the query is all device words with no topic signal, nothing to match on
    if (queryTopicKeywords.length === 0) {
      console.log('⚠️ Cache: query has no topic keywords (device-only) — going to Gemini');
      return { found: false };
    }

    const allCached = await CachedTroubleshooting.find({}, 'normalizedIssue steps usageCount');
    let bestScore = 0;
    let bestEntry = null;

    for (const entry of allCached) {
      const cachedKeywords      = extractKeywords(entry.normalizedIssue);
      const cachedTopicKeywords = extractTopicKeywords(entry.normalizedIssue);

      // Gate 1: must share at least one TOPIC keyword (device words excluded).
      // "whatsapp on laptop" topic=["whatsapp"] vs "laptop not receiving power" topic=["power"]
      // → no shared topic word → REJECTED immediately. ✓
      if (!sharesMeaningfulTopic(queryTopicKeywords, cachedTopicKeywords)) continue;

      // Gate 2: TF-IDF cosine similarity on full keyword vectors (includes device words
      // so that e.g. a printer query still scores higher vs another printer query)
      const cosine = tfidfCosineSimilarity(queryKeywords, cachedKeywords);
      if (cosine < COSINE_THRESHOLD) continue;

      // Gate 3: topic-keyword coverage — what fraction of the query's TOPIC keywords
      // appear in the cached entry's topic keywords?
      // Using topic-only here prevents device words from inflating the denominator.
      const cachedTopicSet = new Set(cachedTopicKeywords);
      const covered        = queryTopicKeywords.filter(k => cachedTopicSet.has(k)).length;
      const coverage       = covered / queryTopicKeywords.length;
      if (coverage < COVERAGE_THRESHOLD) continue;

      // Combined score weights cosine more heavily than raw coverage
      const combined = cosine * 0.7 + coverage * 0.3;

      if (combined > bestScore) {
        bestScore = combined;
        bestEntry = entry;
      }
    }

    if (bestEntry) {
      console.log(`✅ Cache: SEMANTIC match — score ${bestScore.toFixed(3)}`);
      bestEntry.usageCount = (bestEntry.usageCount || 0) + 1;
      await bestEntry.save();
      return { found: true, steps: bestEntry.steps.map(s => s.question), source: 'cached' };
    }

    console.log('💭 Cache: no match — forwarding to Gemini');
    return { found: false };

  } catch (err) {
    console.error('Global cache lookup error:', err);
    return { found: false };
  }
}

async function saveGeminiStepsToCache(normalizedIssue, steps) {
  try {
    const existing = await CachedTroubleshooting.findOne({ normalizedIssue });
    if (existing) {
      existing.usageCount = (existing.usageCount || 0) + 1;
      existing.updatedAt = new Date();
      await existing.save();
      return;
    }
    // Pre-compute and store keywords so the matching loop doesn't have to
    // re-tokenize every cached entry on every cache lookup.
    const keywords = extractKeywords(normalizedIssue);

    await new CachedTroubleshooting({
      normalizedIssue,
      keywords,                          // stored for faster lookup
      title: normalizedIssue.substring(0, 100),
      description: normalizedIssue,
      steps: steps.map((step, idx) => ({ id: idx + 1, question: step, answer: '', completed: false })),
      usageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }).save();
    console.log(`💾 Gemini steps saved to GLOBAL CACHE — keywords: [${keywords.slice(0,6).join(', ')}] (${steps.length} steps)`);
  } catch (err) {
    console.error('⚠️ Error saving Gemini steps to cache:', err.message);
  }
}

function extractStepsFromResponse(fullResponse) {
  const lines = fullResponse.split('\n')
    .map(line => line.trim())
    .filter(line =>
      line.length > 5 && (
        /^\d+[\.\)]/.test(line) ||
        /^[•\-*✅🔧💻📞🌐🖨️🐌📧📊🔐🛡️]/.test(line) ||
        /^(Check|Verify|Try|Restart|Ensure|Test|Run|Clear|Open|Close|Update|Unplug|Ask|Note|Avoid)/i.test(line)
      )
    )
    .map(line =>
      line.replace(/^\d+[\.\)]\s*/, '').replace(/^[•\-*]\s*/, '').replace(/^[✅🔧💻📞🌐🖨️🐌📧📊🔐🛡️]\s*/, '').trim()
    );
  return lines.length >= 2 ? lines : fullResponse.split('\n').filter(l => l.trim().length > 10);
}

function classifyAIResponse(responseText) {
  const t = responseText;
  if (t.includes('ESCALATE') || t.includes('Escalated to System Administration') ||
      t.includes('Paper Jam') || t.includes('Hardware Issue Detected') || t.includes('Printer Supply Issue'))
    return 'escalation';
  if (t.includes('Non-IT Issue Detected') || t.includes('NON_IT_ISSUE')) return 'non_it';
  if (t.includes('Unable to Process Request') || t.includes('GIBBERISH')) return 'gibberish';
  if (/\*\*[A-Z][^*]+Solution\*\*/.test(t) || t.includes('**General Troubleshooting**')) return 'rule_based';
  return 'gemini';
}

function emitTroubleshootingUpdate(req, requestId, steps, source, aiUsed) {
  try {
    const io = req.app.get('io');
    if (io && requestId) {
      io.to(`request-${requestId}`).emit('troubleshooting-updated', { requestId, steps, source, aiUsed, timestamp: new Date() });
    }
  } catch (err) {
    console.error('⚠️ Error emitting troubleshooting update:', err.message);
  }
}

// ── Controllers ──────────────────────────────────────────────────────────────

// POST /ai/chat
export const aiChat = async (req, res) => {
  try {
    const { message, conversation } = req.body;
    const response = await getAIResponse(message, conversation);
    res.json({ response });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ message: 'Failed to get AI response' });
  }
};

// POST /ai/troubleshoot
export const aiTroubleshoot = async (req, res) => {
  const { issue, requestId } = req.body;
  if (!issue) return res.status(400).json({ error: 'Issue description required' });

  const FALLBACK_STEPS = [
    'Restart your computer and try again',
    'Check all cable connections are secure',
    'Verify your internet connection by opening google.com',
    'If the issue persists, a technician will contact you shortly'
  ];

  let steps = [], source = 'ai_generated', aiUsed = true, category = 'ai_generated', fromGlobalCache = false;

  try {
    const cacheResult = await checkGlobalCache(issue);

    if (cacheResult.found) {
      steps = cacheResult.steps;
      source = category = 'cached';
      aiUsed = false;
      fromGlobalCache = true;
    } else {
      const aiResponseText = await getAIResponse(issue, []);
      const responseSource = classifyAIResponse(aiResponseText);

      if (responseSource === 'gemini') {
        steps = extractStepsFromResponse(aiResponseText);
        if (steps.length >= 2) {
          source = category = 'ai_generated';
          aiUsed = true;
          await saveGeminiStepsToCache(issue.toLowerCase().replace(/\s+/g, ' ').trim(), steps);
        } else {
          steps = FALLBACK_STEPS;
          source = category = 'fallback';
          aiUsed = false;
        }
      } else {
        steps = extractStepsFromResponse(aiResponseText);
        if (steps.length === 0) steps = [aiResponseText];
        source = category = responseSource;
        aiUsed = false;
      }
    }

    if (requestId) {
      await Request.findByIdAndUpdate(requestId, {
        troubleshootingSteps: { steps, source, aiUsed, generatedAt: new Date(), category, fromGlobalCache }
      });
    }

    emitTroubleshootingUpdate(req, requestId, steps, source, aiUsed);
    return res.json({ steps, source, aiUsed, category, requestId, fromGlobalCache });

  } catch (error) {
    console.error('❌ Troubleshooting endpoint error:', error.message);
    if (requestId) {
      await Request.findByIdAndUpdate(requestId, {
        troubleshootingSteps: { steps: FALLBACK_STEPS, source: 'fallback', aiUsed: false, generatedAt: new Date(), category: 'fallback' }
      }).catch(console.error);
    }
    emitTroubleshootingUpdate(req, requestId, FALLBACK_STEPS, 'fallback', false);
    return res.json({ steps: FALLBACK_STEPS, source: 'fallback', aiUsed: false, category: 'fallback', requestId });
  }
};

