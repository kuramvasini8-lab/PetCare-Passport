/**
 * AI Service for PetCare Passport
 * Supports OpenRouter (Free models like nvidia/nemotron-3.5-lightning:free) and Google Gemini API.
 * Provides safe, educational veterinary guidance, clinical note explanations,
 * customized species care guides, and report summarization.
 */

const VET_SAFETY_SYSTEM_PROMPT = `
You are PetCare Passport's AI Health & Wellness Assistant.
Your mission is to support pet owners with warm, empathetic, accurate educational pet care guidance.
VETERINARY SAFETY INSTRUCTIONS:
1. You are an educational resource, NOT a licensed veterinary surgeon.
2. NEVER formulate definitive medical diagnoses, prescribe medications, or calculate clinical drug dosages.
3. If an owner describes red-flag emergency symptoms (such as acute respiratory distress, severe trauma, suspected poisoning/toxin ingestion, inability to urinate, continuous vomiting, pale gums, seizures, or collapse), IMMEDIATELY advise urgent emergency veterinary care.
4. Clearly suggest constructive questions the owner can ask their veterinarian during their next clinical consultation.
5. Keep explanations warm, reassuring, structured, and easy to understand.
`;

/**
/**
 * Prepare and sanitize multiturn contents for Google Gemini
 */
function prepareGeminiContents(messages) {
  const contents = [];
  let lastRole = null;

  for (const m of messages) {
    const role = (m.role === 'model' || m.role === 'assistant') ? 'model' : 'user';
    const text = (m.content || (m.parts && m.parts[0]?.text) || '').trim();
    if (!text) continue;

    if (role === lastRole) {
      contents[contents.length - 1].parts[0].text += '\n\n' + text;
    } else {
      contents.push({ role, parts: [{ text }] });
      lastRole = role;
    }
  }

  // Ensure first turn is user
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  // If empty after sanitization, add default prompt
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Please provide helpful, educational pet healthcare advice.' }] });
  }

  return contents;
}

/**
 * Call Google Gemini API
 */
async function callGeminiApi(messages, systemInstruction) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || !geminiKey.trim() || geminiKey === 'your_gemini_api_key_here') {
    return { success: false, message: 'Gemini API key is not configured.' };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey.trim()}`;
  const contents = prepareGeminiContents(messages);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 16000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData.error?.message || `HTTP ${response.status} ${response.statusText}`;
      console.warn('[Gemini API Error]:', errMsg);
      return { success: false, message: errMsg };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || !text.trim()) {
      return { success: false, message: 'No response content returned by Gemini.' };
    }

    return { success: true, text: text.trim() };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[Gemini Request Exception]:', error.message);
    return {
      success: false,
      message: error.name === 'AbortError' ? 'Gemini request timed out.' : `Gemini network error: ${error.message}`,
    };
  }
}

/**
 * Call OpenRouter API
 */
async function callOpenRouterApi(messages, systemInstruction) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey || !openRouterKey.trim() || openRouterKey === 'your_openrouter_api_key_here') {
    return { success: false, message: 'OpenRouter API key is not configured.' };
  }

  const model = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const openRouterMessages = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content || (m.parts && m.parts[0]?.text) || '',
    })),
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterKey.trim()}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'PetCare Passport',
      },
      body: JSON.stringify({
        model,
        messages: openRouterMessages,
        temperature: 0.7,
        max_tokens: 1800,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData.error?.message || `HTTP ${response.status} ${response.statusText}`;
      console.warn('[OpenRouter API Error]:', errMsg);
      return { success: false, message: errMsg };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
      return { success: false, message: 'No response content returned by OpenRouter.' };
    }

    return { success: true, text: text.trim() };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[OpenRouter Request Exception]:', error.message);
    return {
      success: false,
      message: error.name === 'AbortError' ? 'OpenRouter request timed out.' : `OpenRouter network error: ${error.message}`,
    };
  }
}

/**
 * Universal AI Caller: prioritized dual-provider architecture with automatic failover
 */
async function callAi(messages, systemInstruction = VET_SAFETY_SYSTEM_PROMPT) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  const hasGemini = Boolean(geminiKey && geminiKey.trim() && geminiKey !== 'your_gemini_api_key_here');
  const hasOpenRouter = Boolean(openRouterKey && openRouterKey.trim() && openRouterKey !== 'your_openrouter_api_key_here');

  if (!hasGemini && !hasOpenRouter) {
    return {
      success: false,
      isConfigured: false,
      message: 'AI API credentials are not configured in `.env` (provide GEMINI_API_KEY or OPENROUTER_API_KEY).',
    };
  }

  const preferredProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const providers = preferredProvider === 'openrouter'
    ? [callOpenRouterApi, callGeminiApi]
    : [callGeminiApi, callOpenRouterApi];

  // Try primary, then secondary on failure
  for (const provider of providers) {
    const result = await provider(messages, systemInstruction);
    if (result.success && result.text) {
      return {
        success: true,
        isConfigured: true,
        text: result.text,
      };
    }
  }

  // Graceful rule-based educational guidance fallback if all external networks fail
  return {
    success: true,
    isConfigured: true,
    text: `### 🐾 Educational Health & Wellness Observations

I am here to help you monitor your companion safely and know when to seek professional veterinary attention.

#### 🔍 What to Check & Monitor
* **Vitality & Energy:** Note any sudden lethargy, reluctance to stand, or changes in interaction.
* **Appetite & Water Intake:** Monitor whether your companion is eating and drinking normally.
* **Breathing & Posture:** Watch for rapid, shallow, or labored breathing or abdominal effort.
* **Mobility & Comfort:** Check for restlessness, panting, pacing, or tenderness to the touch.

#### 💬 Questions to Ask Your Veterinarian
1. *"Based on these symptoms, are diagnostic tests like bloodwork or imaging recommended?"*
2. *"What specific changes in my pet's behavior would indicate their condition is worsening?"*
3. *"Are there safe, supportive at-home measures you recommend while we monitor?"*

#### 🚨 Emergency Red Flags
**Seek emergency veterinary care immediately** if you notice difficulty breathing, pale or bluish gums, continuous vomiting, inability to urinate, sudden collapse, or suspected toxin ingestion.`,
  };
}

/**
 * Feature A: General Pet Care Chat Assistant
 */
async function chatAssistant(userPrompt, conversationHistory = [], petContext = null) {
  let contextSnippet = '';
  if (petContext) {
    contextSnippet = `\nActive Pet Context:
Name: ${petContext.name || 'Unknown'}
Species: ${petContext.species || 'Pet'}
Breed: ${petContext.breed || 'Not specified'}
Age/DOB: ${petContext.dob ? new Date(petContext.dob).toLocaleDateString() : 'Not recorded'}
Weight: ${petContext.weight ? petContext.weight + ' kg' : 'Not recorded'}
Known Allergies: ${petContext.allergies || 'None reported'}
Known Conditions: ${petContext.conditions || 'None reported'}\n`;
  }

  const promptText = contextSnippet ? `${contextSnippet}\nUser Query: ${userPrompt}` : userPrompt;

  const messages = [];
  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }

  messages.push({
    role: 'user',
    content: promptText,
  });

  const result = await callAi(messages);
  if (!result.success) {
    return {
      success: false,
      isConfigured: result.isConfigured,
      text: result.message,
      disclaimer: 'Educational pet health information only. Always consult a veterinarian for medical decisions.',
    };
  }

  return {
    success: true,
    isConfigured: true,
    text: result.text,
    disclaimer: 'Educational pet health information only. Always consult a veterinarian for medical decisions.',
  };
}

/**
 * Feature B: Veterinary Note Explainer
 */
async function explainVeterinaryNote(noteText, petContext = null) {
  if (!noteText || noteText.trim().length === 0) {
    return { success: false, message: 'Please provide clinical veterinary notes to explain.' };
  }

  const prompt = `
Please analyze the following veterinary clinical note for a pet owner:
Pet Details: ${petContext ? `${petContext.name} (${petContext.species}, ${petContext.breed || 'Breed unlisted'})` : 'Pet'}

ORIGINAL VETERINARY NOTE:
"""
${noteText}
"""

Provide an explanation with the following clear markdown sections:
1. **Plain-Language Summary**: What this note means in simple, reassuring terms.
2. **Medical Terminology Glossary**: Explain any complex medical acronyms, medications, or anatomical terms mentioned.
3. **Explicit Owner Instructions**: Explicit directions or home care tasks specified in the note (do not invent new ones).
4. **Follow-Up & Schedule**: Any follow-up dates or monitoring windows explicitly noted.
5. **Questions to Ask Your Vet**: 2-3 thoughtful questions the owner should ask at the next visit.
`;

  const messages = [{ role: 'user', content: prompt }];
  const result = await callAi(messages);

  if (!result.success) {
    return {
      success: false,
      isConfigured: result.isConfigured,
      text: result.message,
      originalNote: noteText,
    };
  }

  return {
    success: true,
    isConfigured: true,
    text: result.text,
    originalNote: noteText,
  };
}

/**
 * Feature C: Personalized Pet Care Guide
 */
async function generatePetCareGuide(petData) {
  const prompt = `
Create an engaging, tailored educational Pet Care & Wellness Guide for:
- Name: ${petData.name}
- Species: ${petData.species}
- Breed: ${petData.breed || 'Unknown / Mixed'}
- Weight: ${petData.weight ? petData.weight + ' kg' : 'Not recorded'}
- Known Conditions: ${petData.conditions || 'None noted'}
- Known Allergies: ${petData.allergies || 'None noted'}
- Special Care Needs: ${petData.specialCare || 'None noted'}

Structure the guide into:
1. **Breed & Species Nuances**: Specific traits, temperament, and care considerations.
2. **Nutrition & Hydration Guidelines**: General balanced feeding and safe hydration recommendations.
3. **Exercise, Play & Mental Enrichment**: Age-appropriate activity and mental stimulation.
4. **Grooming, Dental & Coat Health**: Coat maintenance, nail trimming, and dental hygiene.
5. **Preventive Healthcare Milestones**: Core vaccination schedules, parasite control (ticks/fleas/worms), and annual checkups.
6. **Signs to Watch For**: Common breed-specific warning signs that warrant contacting a vet.
`;

  const messages = [{ role: 'user', content: prompt }];
  const result = await callAi(messages);

  if (!result.success) {
    return {
      success: false,
      isConfigured: result.isConfigured,
      text: result.message,
    };
  }

  return {
    success: true,
    isConfigured: true,
    text: result.text,
  };
}

/**
 * Feature D: Found-Pet Sighting Report Summarizer
 */
async function summarizeFoundReport(reportData, petData) {
  const prompt = `
Summarize the following found-pet sighting submission for the owner of ${petData?.name || 'the lost pet'}:
- Sighting Location: ${reportData.locationDescription}
- Sighting Time: ${reportData.sightingDate || 'Recently'}
- Finder Observations: ${reportData.observations || 'None'}
- Finder Message: ${reportData.message || 'None'}

Provide:
1. **Key Location & Timing Takeaways**
2. **Distinct Physical / Behavioral Clues**
3. **Clarification Checklist**: What details the owner should immediately ask or check.
`;

  const messages = [{ role: 'user', content: prompt }];
  const result = await callAi(messages);

  return result;
}

module.exports = {
  chatAssistant,
  explainVeterinaryNote,
  generatePetCareGuide,
  summarizeFoundReport,
};
