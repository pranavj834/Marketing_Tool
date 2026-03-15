require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: !!process.env.ANTHROPIC_API_KEY });
});

// ── Main analysis endpoint ───────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { productName, description, features = [], priceRange = '' } = req.body;

    if (!productName?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'Product name and description are required.' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY is not set. Copy .env.example → .env and add your key.',
      });
    }

    const client = new Anthropic();

    const featuresText =
      features.length > 0
        ? features.map((f, i) => `  ${i + 1}. ${f}`).join('\n')
        : '  (No specific features listed)';

    const priceContext = priceRange ? `\nPrice Tier: ${priceRange}` : '';

    const systemPrompt = `You are a world-class B2B/B2C marketing strategist with deep expertise in product positioning, market segmentation, and persuasive copywriting. You translate product capabilities into compelling, segment-specific marketing narratives.

Rules:
- Be deeply specific and actionable — never generic
- Ground analysis in real buyer psychology and market dynamics
- Return ONLY valid JSON — no markdown fences, no explanations`;

    const userPrompt = `Analyze this product and generate a comprehensive market segmentation and messaging strategy.

PRODUCT:
Name: ${productName}
Description: ${description}
Key Features:
${featuresText}${priceContext}

Generate 3-5 highly specific target segments. For each, provide a complete company/audience profile and genuinely compelling, tailored marketing messaging.

Return ONLY this JSON structure (no markdown, no extra text):
{
  "productSummary": "2-3 sentence analysis of core value proposition and differentiation",
  "targetSegments": [
    {
      "id": "segment-1",
      "name": "Specific Segment Name",
      "tagline": "One compelling line describing this segment's situation",
      "companyProfile": {
        "size": "e.g., 50-500 employees",
        "industries": ["Industry 1", "Industry 2", "Industry 3"],
        "annualRevenue": "e.g., $5M–$100M",
        "stage": "e.g., Series B startup, Growth-stage, Mid-market Enterprise"
      },
      "painPoints": [
        "Specific pain point 1 — quantify if possible",
        "Specific pain point 2",
        "Specific pain point 3"
      ],
      "decisionMakers": ["Role 1", "Role 2", "Role 3"],
      "buyingTriggers": [
        "What event or pressure triggers them to seek a solution",
        "Another concrete trigger"
      ],
      "messagingPillar": "Core value theme e.g. Speed to Market, Cost Reduction, Risk Mitigation",
      "marketing": {
        "headline": "Punchy headline, max 10 words",
        "subheadline": "Clarifying statement, max 20 words",
        "bodyMessage": "2-3 persuasive sentences speaking directly to their pain and aspirations",
        "callToAction": "Action-oriented CTA, max 5 words",
        "channels": ["Channel 1", "Channel 2", "Channel 3", "Channel 4"],
        "tone": "e.g., Technical and Precise, Empathetic and Direct, Bold and Disruptive"
      },
      "fitScore": 88,
      "urgencyDriver": "Specific reason why this segment needs to act now"
    }
  ],
  "overallStrategy": "2-3 sentence GTM recommendation covering sequencing and key priorities",
  "competitivePositioning": "How to position and differentiate from existing alternatives in the market"
}`;

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0].text.trim();

    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch {
      // Strip markdown fences if present
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenced) {
        analysis = JSON.parse(fenced[1]);
      } else {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          analysis = JSON.parse(raw.slice(start, end + 1));
        } else {
          throw new Error('Could not parse AI response as JSON.');
        }
      }
    }

    res.json({ success: true, data: analysis });
  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  MarketMind running → http://localhost:${PORT}\n`);
});
