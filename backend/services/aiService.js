// backend/services/aiService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import natural from 'natural';
// natural's DiceCoefficient is the same Sørensen–Dice algorithm used by
// the deprecated string-similarity package.
const compareTwoStrings = (a, b) => natural.DiceCoefficient(a, b);
import CachedTroubleshooting from '../models/CachedTroubleshooting.js';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

// ========== GIBBERISH / NONSENSE DETECTION ==========
function isGibberishOrInvalidInput(text) {
  const cleaned = text.toLowerCase().trim();
  
  // Reject if too short (less than 3 characters)
  if (cleaned.length < 3) {
    console.log('🚫 GIBBERISH: Input too short (< 3 characters)');
    return { isInvalid: true, reason: 'Input is too short. Please describe your issue in full sentences.' };
  }
  
  // Reject if only 1-2 words (unless it's a known IT keyword)
  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount <= 2 && cleaned.length < 20) {
    const knownITTerms = ['printer', 'monitor', 'screen', 'keyboard', 'mouse', 'wifi', 'internet', 
      'network', 'email', 'outlook', 'password', 'login', 'virus', 'phone', 'voip', 'sage', 'pastel',
      'computer', 'laptop', 'software', 'hardware', 'paper jam', 'toner', 'display'];
    
    const isKnownTerm = knownITTerms.some(term => cleaned.includes(term));
    
    if (!isKnownTerm) {
      console.log('🚫 GIBBERISH: Too few words without known IT terms');
      return { isInvalid: true, reason: 'Please provide more details about your issue in a complete sentence.' };
    }
  }
  
  // Reject if it's just numbers and symbols
  if (/^[\d\s\+\-\*\/\=\(\)\.\,\!\@\#\$\%\^\&\*\(\)]+$/.test(cleaned)) {
    console.log('🚫 GIBBERISH: Only numbers and symbols');
    return { isInvalid: true, reason: 'This appears to be a calculation or random input, not a valid request.' };
  }
  
  // Reject if it's a math expression
  if (/^[\d\s\+\-\*\/\=\(\)\.]+$/.test(cleaned) && /[\+\-\*\/\=]/.test(cleaned)) {
    console.log('🚫 GIBBERISH: Math expression detected');
    return { isInvalid: true, reason: 'This appears to be a math problem, not a valid request.' };
  }
  
  // Reject if ratio of consonants to vowels is way off (indicates random typing)
  const letters = cleaned.replace(/[^a-z]/g, '');
  if (letters.length > 5) {
    const vowels = (letters.match(/[aeiou]/g) || []).length;
    const consonants = letters.length - vowels;
    const ratio = consonants / (vowels || 1);
    
    if (ratio > 6 || ratio < 0.3) {
      console.log(`🚫 GIBBERISH: Unusual consonant/vowel ratio (${ratio.toFixed(1)})`);
      return { isInvalid: true, reason: 'Your input appears to be random text. Please describe your issue clearly.' };
    }
  }
  
  // Reject if it contains mostly repeated characters
  const uniqueChars = new Set(cleaned.replace(/[^a-z]/g, '')).size;
  if (letters.length > 8 && uniqueChars < 4) {
    console.log('🚫 GIBBERISH: Too many repeated characters');
    return { isInvalid: true, reason: 'Your input contains repetitive characters. Please describe your issue.' };
  }
  
  // Reject if it looks like random keyboard mashing
  const keyboardPatterns = [
    'qwerty', 'asdfgh', 'zxcvbn', 'qazwsx', 'wsxedc', 'rfvtgb',
    'abcdef', 'ghijkl', 'mnopqr', 'stuvwx'
  ];
  for (const pattern of keyboardPatterns) {
    if (cleaned.includes(pattern)) {
      console.log(`🚫 GIBBERISH: Keyboard mashing pattern detected (${pattern})`);
      return { isInvalid: true, reason: 'Your input appears to be random keyboard typing. Please describe your issue.' };
    }
  }
  
  // Reject if more than 40% of characters are non-alphanumeric
  const nonAlpha = cleaned.replace(/[a-z0-9\s]/g, '').length;
  if (nonAlpha / (cleaned.length || 1) > 0.4) {
    console.log('🚫 GIBBERISH: Too many special characters');
    return { isInvalid: true, reason: 'Your input contains too many special characters. Please describe your issue in plain English.' };
  }
  
  // Reject if it looks like a URL or file path
  if (/^(https?:\/\/|www\.|file:\/\/|\/[\w\/]+)/.test(cleaned)) {
    console.log('🚫 GIBBERISH: URL or file path detected');
    return { isInvalid: true, reason: 'This appears to be a URL or file path, not a valid request.' };
  }
  
  // Reject if it's just emotional expressions without IT context
  const emotionalWords = ['sad', 'happy', 'angry', 'upset', 'frustrated', 'tired', 'bored', 'hungry', 'love', 'hate'];
  const hasEmotionalWord = emotionalWords.some(w => cleaned.includes(w));
  const hasITWord = /computer|laptop|printer|monitor|screen|keyboard|mouse|wifi|internet|network|email|outlook|password|login|virus|phone|voip|software|hardware|sage|pastel|printer|toner|display|scan/i.test(cleaned);
  
  if (hasEmotionalWord && !hasITWord && cleaned.length < 40) {
    console.log('🚫 GIBBERISH: Emotional expression without IT context');
    return { isInvalid: true, reason: 'This appears to be an emotional expression, not a technical issue. Please describe the technical problem you are experiencing.' };
  }
  
  return { isInvalid: false };
}

// ========== EXPANDED RULE‑BASED SUGGESTIONS ==========
const ruleBasedSuggestions = {
  'monitor|display|screen|blank': "🔧 **Display Issue Solution**\n\n1. Check that the monitor power cable is firmly connected to both the monitor and wall outlet\n2. Verify the power button light is on\n3. Ensure the video cable (HDMI/VGA/DVI) is securely connected\n4. Try a different video cable if available\n5. Test the monitor with another computer if possible\n\nIf these steps don't work, please submit your request for technician assistance.",
  
  'internet|wifi|network|connection': "🌐 **Internet Connection Solution**\n\n1. Restart your computer\n2. Check if WiFi is turned on and airplane mode is off\n3. Try restarting your router/modem (unplug for 10 seconds)\n4. Check if other devices can connect to the network\n5. Open google.com to verify internet access\n\nIf the issue persists, please submit your request for support.",
  
  'printer|print|scan': "🖨️ **Printer Issue Solution**\n\n1. Verify the printer is turned on and has paper loaded\n2. Check for any error messages or blinking lights on the printer\n3. Ensure your computer is on the same network as the printer\n4. Try restarting the printer (power cycle)\n5. Clear the print queue\n\n⚠️ If you have a paper jam, DO NOT open the printer yourself. Please submit your request and a technician will assist you.",
  
  'slow|lag|crashes|freeze': "🐌 **Slow Performance Solution**\n\n1. Close unnecessary programs running in the background\n2. Restart your computer\n3. Check if your hard drive has enough free space\n4. Run a virus scan\n5. Check for Windows/software updates\n\nIf the issue continues, please submit your request for further investigation.",
  
  'email|outlook|exchange': "📧 **Email Issue Solution**\n\n1. Restart Outlook\n2. Check if Outlook is in offline mode (click Send/Receive tab)\n3. Verify your internet connection\n4. Try accessing webmail to see if the issue is isolated to Outlook\n5. Check your mailbox size\n\nIf the problem persists, please submit your request.",
  
  'voip|phone|calls': "📞 **Phone Issue Solution**\n\n1. Unplug the phone for 10 seconds and plug it back in (power cycle)\n2. Check that the Ethernet cable is firmly connected\n3. Verify your internet connection by opening google.com\n4. Test if you can make internal calls\n\nIf the issue continues, please submit your request for technician assistance.",
  
  'sage|pastel|accounting|evolution|revmax|receipting|devexp': "📊 **Accounting Software Solution**\n\n1. First, check your internet connection (can you open google.com?)\n2. Ask nearby colleagues if they're experiencing the same issue\n3. Try restarting the software\n4. Restart your computer\n5. If multiple users are affected, submit your request immediately for server investigation\n\n⚠️ DO NOT modify any license files or database settings. Leave server configuration to System Administration.",
  
  'login|password|credentials': "🔐 **Login Issue Solution**\n\n1. Ensure Caps Lock is off (passwords are case-sensitive)\n2. Check for unwanted spaces in your username or password\n3. Try resetting your password using 'Forgot Password'\n4. Test logging in from another device\n5. Clear your browser cache and cookies\n\nIf you still can't log in, please submit your request.",
  
  'virus|malware|security': "🛡️ **Security Issue Solution**\n\n1. Run a full antivirus scan\n2. Ensure your security software is up to date\n3. Check for suspicious programs in Task Manager\n4. Avoid clicking on suspicious links or pop-ups\n5. Update your operating system\n\nIf you suspect malware, submit your request immediately.",
  
  'software|application|program|crashes': "💻 **Application Issue Solution**\n\n1. Try restarting the application\n2. Restart your computer\n3. Check for software updates\n4. Verify other applications work normally\n5. Note any error messages you see\n\nSubmit your request with the error message details for specific assistance."
};

// ========== NON-IT ISSUE KEYWORDS ==========
const nonITKeywords = {
  'hr|human resources|leave|vacation|payroll|salary|benefits|hiring|recruitment|interview': {
    type: 'non_it',
    message: "❌ **Non-IT Issue Detected**\n\nI'm an IT support assistant and can only help with technology-related issues (computers, printers, software, networks, etc.).\n\nFor HR-related questions about leave, payroll, benefits, or recruitment, please contact the Human Resources department directly.\n\n**Your request has not been escalated.** Please submit your query to the appropriate department."
  },
  
  'catering|lunch|food|coffee|kitchen|supplies|stationery': {
    type: 'non_it',
    message: "❌ **Non-IT Issue Detected**\n\nI'm an IT support assistant and can only help with technology-related issues (computers, printers, software, networks, etc.).\n\nFor catering, office supplies, or kitchen-related matters, please contact the Administration department directly.\n\n**Your request has not been escalated.** Please submit your query to the appropriate department."
  },
  
  'weather|traffic|commute|transport|shuttle': {
    type: 'non_it',
    message: "❌ **Non-IT Issue Detected**\n\nI'm an IT support assistant and can only help with technology-related issues (computers, printers, software, networks, etc.).\n\nFor weather, traffic, transportation, or shuttle-related inquiries, please check the company announcements or contact the Facilities department.\n\n**Your request has not been escalated.** Please submit your query to the appropriate department."
  },
  
  'invoice|payment|billing|finance|accounting department': {
    type: 'non_it',
    message: "❌ **Non-IT Issue Detected**\n\nI'm an IT support assistant and can only help with technology-related issues (computers, printers, software, networks, etc.).\n\nFor invoice, payment, or billing inquiries, please contact the Finance department directly.\n\n**Your request has not been escalated.** Please submit your query to the appropriate department."
  },
  
  'sales|marketing|client|customer': {
    type: 'non_it',
    message: "❌ **Non-IT Issue Detected**\n\nI'm an IT support assistant and can only help with technology-related issues (computers, printers, software, networks, etc.).\n\nFor sales or marketing inquiries, please contact the Sales department directly.\n\n**Your request has not been escalated.** Please submit your query to the appropriate department."
  },
  
  'legal|compliance|policy|policies': {
    type: 'non_it',
    message: "❌ **Non-IT Issue Detected**\n\nI'm an IT support assistant and can only help with technology-related issues (computers, printers, software, networks, etc.).\n\nFor legal or compliance inquiries, please contact the Legal department directly.\n\n**Your request has not been escalated.** Please submit your query to the appropriate department."
  }
};

// ========== HARDWARE/ESCALATION KEYWORDS ==========
const escalationKeywords = {
  'paper jam|jam|paper stuck|stuck paper': {
    type: 'hardware',
    message: "⚠️ **Paper Jam Detected**\n\nThis is a hardware issue that requires physical intervention. Please do NOT attempt to open the printer or remove paper yourself as this may cause damage.\n\nYour request has been automatically escalated to System Administration. A technician will be dispatched to resolve the paper jam issue shortly.\n\n**Ticket Status:** Escalated to System Administration"
  },
  'toner|cartridge|ink|drum': {
    type: 'hardware',
    message: "⚠️ **Printer Supply Issue**\n\nThis appears to be a printer supply/hardware issue. Toner/ink replacement requires physical handling by System Administration.\n\nYour request has been automatically escalated to System Administration. A technician will assist with the printer supply replacement.\n\n**Ticket Status:** Escalated to System Administration"
  },
  'hardware|broken|damaged|faulty|broke': {
    type: 'hardware',
    message: "⚠️ **Hardware Issue Detected**\n\nThis appears to be a hardware problem that requires physical inspection and repair. Please do not attempt to fix it yourself.\n\nYour request has been automatically escalated to System Administration. A technician will contact you shortly to diagnose and repair the hardware issue.\n\n**Ticket Status:** Escalated to System Administration"
  }
};

// ========== CHECK FOR NON-IT ISSUES ==========
function checkForNonITIssue(issueText) {
  issueText = issueText.toLowerCase();
  
  for (const [keywords, response] of Object.entries(nonITKeywords)) {
    const keywordList = keywords.split('|');
    if (keywordList.some(kw => issueText.includes(kw))) {
      console.log(`🔍 Non-IT match found for keywords: "${keywords}" in message`);
      return response;
    }
  }
  return null;
}

// ========== CHECK FOR ESCALATION KEYWORDS ==========
function checkForEscalation(issueText) {
  issueText = issueText.toLowerCase();
  
  for (const [keywords, escalation] of Object.entries(escalationKeywords)) {
    const keywordList = keywords.split('|');
    if (keywordList.some(kw => issueText.includes(kw))) {
      console.log(`🔍 Escalation match found for keywords: "${keywords}" in message`);
      return escalation;
    }
  }
  return null;
}

// ========== HELPERS ==========
function getRuleBasedSuggestion(issueText) {
  issueText = issueText.toLowerCase();
  
  for (const [key, suggestion] of Object.entries(ruleBasedSuggestions)) {
    const keywords = key.split('|');
    if (keywords.some(kw => issueText.includes(kw))) {
      console.log(`📋 SOURCE: Rule-based match found for "${key}"`);
      return suggestion;
    }
  }
  
  console.log('📋 SOURCE: No specific rule-based match - using general fallback');
  return "🔧 **General Troubleshooting**\n\n1. Try restarting your device\n2. Check all cable connections\n3. Verify your internet connection\n4. Check for any error messages\n5. Ask a colleague if they're experiencing the same issue\n\nIf the issue persists, please submit your request and a technician will assist you.";
}

// ========== SYNONYM MAP & NORMALISATION ==========
//
// DESIGN PRINCIPLE — collapse words only when they belong to the SAME
// *root cause domain*.  Do NOT collapse symptom words into device words
// (e.g. "jammed" → "printer") because that destroys the cause distinction:
//
//  "printer not printing"  — could be: offline, wrong driver, network,
//                            print-queue full, wrong default printer …
//  "printer is jammed"     — ALWAYS a physical paper-jam requiring a tech
//
// These two issues need DIFFERENT solutions, so they must NOT fuzzy-match
// each other even though both contain the word "printer".
//
// The map below groups TRUE synonyms — words that mean the same root cause —
// into a single canonical token.  Each group lives under its canonical key.

const SYNONYM_MAP = {
  // ── Network / connectivity ────────────────────────────────────────────────
  wireless:    "wifi",
  wlan:        "wifi",
  wi_fi:       "wifi",
  wi:          "wifi",        // "wi-fi" after stripping hyphens
  fi:          "wifi",
  hotspot:     "wifi",
  connecting:  "internet",
  connection:  "internet",
  connected:   "internet",
  disconnected:"internet",
  offline:     "internet",
  online:      "internet",
  bandwidth:   "internet",
  broadband:   "internet",

  // ── Email clients ─────────────────────────────────────────────────────────
  outlook:     "email",
  mail:        "email",
  gmail:       "email",
  webmail:     "email",
  inbox:       "email",
  mailbox:     "email",

  // ── Devices (generic device synonyms — NOT issue-cause words) ────────────
  laptop:      "computer",
  desktop:     "computer",
  workstation: "computer",
  pc:          "computer",
  macbook:     "computer",
  mac:         "computer",
  imac:        "computer",

  // ── Display ───────────────────────────────────────────────────────────────
  monitor:     "screen",
  display:     "screen",
  displaying:  "screen",
  blank:       "screen",     // "blank screen" → "screen screen" deduped fine

  // ── Login / authentication ────────────────────────────────────────────────
  credentials: "login",
  signin:      "login",
  "sign-in":   "login",
  authenticate:"login",
  authentication:"login",
  password:    "login",
  username:    "login",
  "log-in":    "login",
  logging:     "login",
  logged:      "login",

  // ── Performance ───────────────────────────────────────────────────────────
  slow:        "performance",
  lagging:     "performance",
  lag:         "performance",
  freezing:    "performance",
  freeze:      "performance",
  frozen:      "performance",
  crashing:    "performance",
  crash:       "performance",
  crashes:     "performance",
  hanging:     "performance",
  hung:        "performance",
  unresponsive:"performance",

  // ── VoIP / phone ─────────────────────────────────────────────────────────
  voip:        "phone",
  telephone:   "phone",
  calls:       "phone",
  calling:     "phone",
  ringtone:    "phone",
  dial:        "phone",
  dialling:    "phone",

  // ── Accounting software ───────────────────────────────────────────────────
  pastel:      "accounting",
  sage:        "accounting",
  evolution:   "accounting",
  revmax:      "accounting",
  receipting:  "accounting",
  devexp:      "accounting",

  // ── Virus / security ─────────────────────────────────────────────────────
  malware:     "virus",
  spyware:     "virus",
  ransomware:  "virus",
  trojan:      "virus",
  hack:        "virus",
  hacked:      "virus",

  // ── Software / app (generic) ──────────────────────────────────────────────
  application: "software",
  program:     "software",
  app:         "software",
  apps:        "software",

  // ── Printing (the ACT of printing — NOT physical faults) ─────────────────
  // Note: "jammed", "jam", "toner", "cartridge", "ink" are intentionally
  // NOT mapped here.  They stay as their own distinct tokens so the
  // fuzzy-matcher sees "jammed" ≠ "printing" and rejects the match.
  printing:    "print",
  printed:     "print",
  prints:      "print",
  printout:    "print",
};

// Stop-words to strip before comparison (too common to be discriminative)
const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should",
  "may","might","can","shall","not","no","and","or","but","in","on",
  "at","to","for","of","with","by","from","up","about","into","through",
  "my","our","your","their","its","i","we","you","they","he","she","it",
  "this","that","these","those","am","get","got","keep","getting",
  "when","why","how","what","where","which","who",
]);

/**
 * Normalise an issue string for fuzzy comparison:
 * 1. Lowercase + strip punctuation
 * 2. Remove stop-words
 * 3. Apply synonym map (cause-aware — see notes above)
 * 4. Deduplicate adjacent identical tokens
 */
function normalizeIssue(text) {
  // Step 1 — lowercase, strip punctuation (keep spaces)
  let clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  // Step 2 — tokenise, drop stop-words
  const tokens = clean.split(" ").filter(t => t.length > 1 && !STOP_WORDS.has(t));

  // Step 3 — apply synonym map
  const mapped = tokens.map(t => SYNONYM_MAP[t] ?? t);

  // Step 4 — deduplicate adjacent identical tokens (e.g. "screen screen" → "screen")
  const deduped = mapped.filter((t, i) => i === 0 || t !== mapped[i - 1]);

  return deduped.join(" ");
}

// ========== CAUSE-AWARE SIMILARITY CHECK ==========
//
// Even after normalisation, some queries share the same device word but
// describe completely different root causes.  We add a cause-exclusion
// list:  if BOTH query and candidate contain any of the same cause-specific
// marker, they may match; but if the candidate has a cause-marker that the
// query does NOT share, we cap the similarity so they cannot cross the
// acceptance threshold (0.7).
//
// This is the key guard that prevents:
//   "printer not printing" (network/driver/software cause)
//   from matching
//   "printer is jammed"    (physical hardware cause)

const CAUSE_MARKERS = [
  // Hardware / physical faults — require a technician on-site
  ["jammed", "jam", "paper stuck", "stuck", "toner", "cartridge", "ink", "drum",
   "broken", "damaged", "faulty", "burnt", "burned", "physical", "hardware"],

  // Network / connectivity cause
  ["network", "internet", "wifi", "wireless", "offline", "disconnected",
   "connection", "connected", "ip address", "dns", "ping", "cable", "ethernet",
   "router", "modem", "bandwidth"],

  // Authentication / credentials cause
  ["login", "password", "credentials", "locked out", "access denied",
   "forgot password", "reset password", "account", "username"],

  // Driver / software cause
  ["driver", "software", "update", "install", "uninstall", "reinstall",
   "corrupt", "corrupted", "registry", "missing file", "dll"],

  // Performance / resource cause
  ["slow", "performance", "lag", "freeze", "crash", "hang", "memory",
   "ram", "cpu", "disk", "storage", "overheating", "fan"],
];

/**
 * Returns a penalty multiplier [0, 1].
 * 1.0  = no penalty (same cause markers, or no markers at all)
 * 0.0  = incompatible causes — similarity will be zeroed out
 */
function causePenalty(queryTokens, candidateTokens) {
  const queryStr     = queryTokens.join(" ");
  const candidateStr = candidateTokens.join(" ");

  for (const markerGroup of CAUSE_MARKERS) {
    const queryHas     = markerGroup.some(m => queryStr.includes(m));
    const candidateHas = markerGroup.some(m => candidateStr.includes(m));

    // One has a cause marker from this group, the other doesn't — penalise
    if (queryHas !== candidateHas) {
      return 0.0; // incompatible — zero out the similarity
    }
  }
  return 1.0; // causes are compatible (or neither has markers)
}

// ========== CHECK CACHE FOR SIMILAR ISSUES ==========
async function checkCache(normalizedIssue) {
  try {
    // 1️⃣ EXACT MATCH
    const exactMatch = await CachedTroubleshooting.findOne({ normalizedIssue: normalizedIssue });
    if (exactMatch) {
      console.log('✅ SOURCE: Exact match from cache');
      exactMatch.usageCount += 1;
      await exactMatch.save();
      return {
        found: true,
        suggestion: exactMatch.steps.map(s => s.question).join('\n'),
        source: 'exact_cache'
      };
    }
    
    // 2️⃣ FUZZY MATCH (similar issues)
    const allCached = await CachedTroubleshooting.find({}, 'normalizedIssue steps usageCount');
    if (allCached.length > 0) {
      const candidates = allCached.map(entry => {
        const rawSim  = compareTwoStrings(normalizedIssue, entry.normalizedIssue);
        // Apply cause-awareness: zero the score if the two issues have
        // incompatible root-cause markers (e.g. physical jam vs software cause)
        const qTokens = normalizedIssue.split(" ");
        const cTokens = entry.normalizedIssue.split(" ");
        const penalty = causePenalty(qTokens, cTokens);
        return { similarity: rawSim * penalty, entry };
      });
      
      const bestMatch = candidates
        .filter(c => c.similarity > 0.7)
        .sort((a, b) => b.similarity - a.similarity)[0];
      
      if (bestMatch) {
        console.log(`✅ SOURCE: Fuzzy match from cache (${(bestMatch.similarity * 100).toFixed(1)}% similar)`);
        bestMatch.entry.usageCount += 1;
        await bestMatch.entry.save();
        return {
          found: true,
          suggestion: bestMatch.entry.steps.map(s => s.question).join('\n'),
          source: 'fuzzy_cache',
          similarity: bestMatch.similarity
        };
      }
    }
    
    console.log('📦 Cache miss - no similar issues found');
    return { found: false };
  } catch (err) {
    console.error('❌ Cache lookup error:', {
      message: err.message,
      name: err.name
    });
    return { found: false };
  }
}

// ========== SAVE COMPLETE AI RESPONSE TO CACHE ==========
async function saveToCache(normalizedIssue, question, aiSuggestion) {
  try {
    const existing = await CachedTroubleshooting.findOne({ normalizedIssue: normalizedIssue });
    if (existing) {
      console.log('📦 Solution already in cache, updating usage count');
      existing.usageCount += 1;
      existing.updatedAt = new Date();
      await existing.save();
      return existing;
    }
    
    const stepsArray = aiSuggestion.split('\n')
      .filter(line => line.trim().length > 0)
      .map((line, idx) => ({ 
        id: idx + 1, 
        question: line
      }));
    
    const cacheEntry = new CachedTroubleshooting({
      normalizedIssue: normalizedIssue,
      title: question.substring(0, 100),
      description: question,
      steps: stepsArray,
      usageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await cacheEntry.save();
    console.log(`💾 SOURCE: AI response saved to cache (${stepsArray.length} lines)`);
    return cacheEntry;
  } catch (cacheErr) {
    console.error('❌ Error saving to cache:', {
      message: cacheErr.message,
      name: cacheErr.name,
      code: cacheErr.code
    });
    return null;
  }
}

// ========== GET AI RESPONSE FROM GEMINI FOR CHAT ==========
async function getAIChatResponse(userMessage) {
  const prompt = `You are an IT support assistant. Provide a HELPFUL SOLUTION directly to the user's issue.

⚠️ CRITICAL RULES – YOU MUST FOLLOW THESE EXACTLY ⚠️

1. Provide a SOLUTION, not questions. The user needs help fixing their problem.

2. FIRST, check if this is an IT-related issue. If the user asks about:
   - HR, payroll, leave, benefits
   - invoices, payments
   - Sales, marketing, clients
   - Legal, compliance, policies
   - Facilities, office supplies, parking
   - non-work related topics
   
   → DO NOT provide a solution. Say "NON_IT_ISSUE"

3. FOR PRINTER ISSUES (printing problems but NOT paper jams):
   ✅ Provide solutions like:
      - Check that the printer is turned on
      - Verify your computer is on the same network
      - Clear the print queue
      - Restart the printer
   ❌ NEVER suggest opening the printer or checking inside for paper jams

4. FOR PAPER JAMS, BROKEN HARDWARE, TONER REPLACEMENT:
   → Say "ESCALATE_TO_IT" - these require physical technician intervention

5. FOR ACCOUNTING SOFTWARE (Sage, Pastel, Evolution, RevMax, Receipting, devExp):
   ✅ Provide solutions like:
      - Check your internet connection (can you open google.com?)
      - Ask colleagues if they're affected
      - Restart the software or computer
   ❌ NEVER suggest modifying database paths, license files, or server settings

6. FOR VoIP PHONES:
   ✅ Provide solutions like:
      - Unplug the phone for 10 seconds and plug it back in
      - Check Ethernet cable connections
      - Test internet connectivity
   ❌ NEVER suggest SIP registration or phone reprogramming

7. FOR GENERAL ISSUES:
   ✅ Start with simple solutions (restart, check connections)
   ✅ Be concise and helpful - 3-5 steps maximum
   ✅ Use bullet points or numbered steps for clarity

8. FORMAT YOUR RESPONSE:
   - Start with a brief diagnosis
   - List 3-5 clear steps to solve the issue
   - End with when to escalate to System Administration

9. CRITICAL: If the user input is random text, gibberish, numbers only, math problems, or makes no sense, say "GIBBERISH"

User question: "${userMessage}"

Provide a helpful solution (NO questions, just solutions):`;

  try {
    const result = await model.generateContent(prompt);
    
    if (!result || !result.response) {
      console.error('❌ AI/Gemini: Empty result or no response object');
      throw new Error('Empty response from Gemini API');
    }
    
    const response = await result.response;
    const suggestion = response.text()?.trim();
    
    if (!suggestion || suggestion.length === 0) {
      console.error('❌ AI/Gemini: Response text is empty');
      throw new Error('Empty response text from Gemini');
    }
    
    console.log('✅ SOURCE: AI/Gemini response received', {
      length: suggestion.length,
      preview: suggestion.substring(0, 150) + '...'
    });
    
    // Check for safety blocks
    if (suggestion.includes('SAFETY') || suggestion.includes('cannot fulfill') || suggestion.includes('not able to')) {
      console.error('❌ AI/Gemini: Response was safety-blocked');
      throw new Error('Gemini refused or blocked the response');
    }
    
    // Check if Gemini detected gibberish
    if (suggestion.includes('GIBBERISH')) {
      console.log('🚫 AI/Gemini: Detected gibberish/nonsense input');
      return {
        success: false,
        category: 'gibberish',
        message: "⚠️ **Unable to Process Request**\n\nYour input does not appear to be a valid IT support request. It may be:\n- Random text or keyboard mashing\n- A math problem or calculation\n- An incomplete or unclear sentence\n\n**Your request has been escalated to System Administration** who will review it and assist you properly.\n\n**Ticket Status:** Escalated to System Administration"
      };
    }
    
    // Check if Gemini detected non-IT issue
    if (suggestion.includes('NON_IT_ISSUE')) {
      console.log('🚫 AI/Gemini: Detected non-IT issue');
      return {
        success: false,
        category: 'non_it',
        message: "❌ **Non-IT Issue Detected**\n\nI'm an IT support assistant and can only help with technology-related issues (computers, printers, software, networks, etc.).\n\nPlease contact the appropriate department for non-IT related queries.\n\n**Your request has not been escalated.** Please submit your query to the appropriate department."
      };
    }
    
    // Check if Gemini wants to escalate
    if (suggestion.includes('ESCALATE_TO_IT')) {
      console.log('🚨 AI/Gemini: Hardware escalation triggered');
      return {
        success: false,
        category: 'escalated',
        message: "⚠️ **Hardware Issue Detected**\n\nThis appears to be a hardware problem that requires physical inspection. Your request has been automatically escalated to System Administration.\n\n**Ticket Status:** Escalated to System Administration"
      };
    }
    
    // Validate minimum response length
    if (suggestion.length < 20) {
      console.error('❌ AI/Gemini: Response too short');
      throw new Error('Response too short to be useful');
    }
    
    return {
      success: true,
      suggestion: suggestion
    };
    
  } catch (error) {
    console.error('❌ AI/Gemini: Request FAILED - DETAILS:', {
      errorMessage: error.message,
      errorName: error.name,
      errorCode: error.code,
      errorStatus: error.status,
      isNetworkError: error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message?.includes('fetch failed'),
      isAPIKeyError: error.message?.includes('API key') || error.status === 403 || error.status === 401,
      isQuotaError: error.message?.includes('quota') || error.status === 429,
      isTimeoutError: error.code === 'ETIMEDOUT' || error.message?.includes('timeout'),
      userMessage: userMessage.substring(0, 100)
    });
    
    if (error.status === 401 || error.status === 403) {
      console.error('🔑 AUTHENTICATION ERROR: Invalid API key');
    }
    if (error.status === 429) {
      console.error('⏳ RATE LIMIT/QUOTA EXCEEDED');
    }
    if (error.message?.includes('fetch failed')) {
      console.error('🌐 NETWORK ERROR: Cannot connect to Google API');
    }
    if (error.code === 'ETIMEDOUT') {
      console.error('⏰ TIMEOUT: Request took too long');
    }
    
    throw error;
  }
}

// ========== GET AI RESPONSE FOR CHAT ==========
export const getAIResponse = async (userMessage, conversationHistory = []) => {
  const normalized = normalizeIssue(userMessage);
  
  console.log('\n' + '='.repeat(60));
  console.log('💬 NEW CHAT REQUEST');
  console.log('='.repeat(60));
  console.log('📝 User message:', userMessage.substring(0, 200));

  // 🚨 STEP 0: Check for GIBBERISH
  console.log('\n🚨 STEP 0: Checking for gibberish/invalid input...');
  const gibberishCheck = isGibberishOrInvalidInput(userMessage);
  if (gibberishCheck.isInvalid) {
    console.log(`🚫 RESULT: Gibberish detected - "${gibberishCheck.reason}"`);
    console.log('='.repeat(60) + '\n');
    return `⚠️ **Unable to Process Request**\n\n${gibberishCheck.reason}\n\n**Your request has been escalated to System Administration** who will review it and assist you properly.\n\n**Ticket Status:** Escalated to System Administration`;
  }
  console.log('✅ Input passed gibberish check');

  // 🚨 STEP 1: Check for non-IT issues
  console.log('\n🚨 STEP 1: Checking for non-IT issues...');
  const nonITIssue = checkForNonITIssue(userMessage);
  if (nonITIssue) {
    console.log('🚫 RESULT: Non-IT issue detected');
    console.log('='.repeat(60) + '\n');
    return nonITIssue.message;
  }
  console.log('✅ No non-IT keywords matched');

  // 🚨 STEP 2: Check for hardware/escalation
  console.log('\n🚨 STEP 2: Checking for hardware/escalation issues...');
  const escalation = checkForEscalation(userMessage);
  if (escalation) {
    console.log('🚨 RESULT: Hardware issue detected - escalating');
    console.log('='.repeat(60) + '\n');
    return escalation.message;
  }
  console.log('✅ No escalation keywords matched');

  // 🥇 STEP 3: Check CACHE
  console.log('\n📦 STEP 3: Checking cache...');
  try {
    const cacheResult = await checkCache(normalized);
    
    if (cacheResult.found) {
      console.log(`✅ RESULT: Using ${cacheResult.source} from cache`);
      console.log('='.repeat(60) + '\n');
      return cacheResult.suggestion;
    }
    
    console.log('📦 Cache miss - proceeding to AI');
  } catch (cacheError) {
    console.error('⚠️ Cache check error (proceeding to AI):', cacheError.message);
  }

  // 🥈 STEP 4: Try AI/Gemini
  console.log('\n🤖 STEP 4: Trying AI/Gemini...');
  try {
    const aiResult = await getAIChatResponse(userMessage);
    
    if (aiResult.success && aiResult.suggestion) {
      console.log('✅ RESULT: SOURCE: AI/Gemini generated solution');
      
      // Save to cache
      try {
        await saveToCache(normalized, userMessage, aiResult.suggestion);
        console.log('💾 Saved to cache for future use');
      } catch (saveError) {
        console.error('⚠️ Failed to save to cache (non-critical):', saveError.message);
      }
      
      console.log('='.repeat(60) + '\n');
      return aiResult.suggestion;
    } else if (aiResult.category === 'gibberish') {
      console.log('🚫 RESULT: AI detected gibberish');
      console.log('='.repeat(60) + '\n');
      return aiResult.message;
    } else if (aiResult.category === 'non_it') {
      console.log('🚫 RESULT: AI detected non-IT issue');
      console.log('='.repeat(60) + '\n');
      return aiResult.message;
    } else if (aiResult.category === 'escalated') {
      console.log('🚨 RESULT: AI triggered hardware escalation');
      console.log('='.repeat(60) + '\n');
      return aiResult.message;
    }
    
    console.log('⚠️ AI returned unexpected result - falling back to rule-based');
  } catch (aiError) {
    console.error('❌ STEP 4 FAILED: AI/Gemini error');
    console.error('ℹ️ Error details:', {
      message: aiError.message,
      name: aiError.name,
      code: aiError.code,
      status: aiError.status
    });
  }

  // 🥉 STEP 5: Fall back to rule-based suggestions
  console.log('\n📋 STEP 5: SOURCE: Falling back to rule-based suggestions');
  const ruleBasedSuggestion = getRuleBasedSuggestion(userMessage);
  console.log('✅ RESULT: Using rule-based fallback');
  console.log('='.repeat(60) + '\n');
  
  return ruleBasedSuggestion;
};