import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';

const client = new Anthropic({
  fetch: makeProxyFetch() as typeof fetch,
});

const SYSTEM_PROMPT = `You are a domain name branding expert. Given a business description, generate exactly 25 creative, brandable domain name ideas (without .com extension, all lowercase, no hyphens or dots).

Use a mix of these strategies:
1. Direct Compound: combine core concept with action/descriptor words (e.g. leadzap, routefire)
2. Prefix/Suffix Modifier: get___, try___, use___, go___, ___hq, ___ai, ___lab, ___hub
3. Portmanteau: hide key business word inside a made-up word that sounds natural (e.g. releadiant, leadgacy)
4. Creative Misspelling: alternate spellings, dropped letters (e.g. kwalify, qualifik)
5. Science/Element Style: sounds like a periodic element or scientific term (e.g. leadium, qualifium)
6. Character/Personality: brand persona (e.g. routerogue, leadmadam)
7. Double Meaning: words with dual context (e.g. hookup, matchivate)

Return ONLY a valid JSON array with no markdown or extra text. Each item must have:
- domain: the name (lowercase, no extension, no hyphens)
- strategy: the strategy name used
- rationale: one short sentence explaining the appeal

Example format:
[{"domain":"leadzap","strategy":"Direct Compound","rationale":"Punchy, memorable, conveys instant lead capture."}]`;

export async function POST(req: NextRequest) {
  const { description } = await req.json();

  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Business description: ${description}` }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  let suggestions;
  try {
    suggestions = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    } else {
      return NextResponse.json({ error: 'Failed to parse suggestions' }, { status: 500 });
    }
  }

  return NextResponse.json({ suggestions });
}
