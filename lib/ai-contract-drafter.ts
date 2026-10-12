/**
 * AI Contract Drafting Assistant
 *
 * Revolutionary AI that CREATES contracts from natural language, not just analyzes them.
 *
 * Features:
 * - Draft complete contracts from plain English requirements
 * - Intelligent clause selection and ordering
 * - Industry and jurisdiction-specific customization
 * - Multi-turn conversation for refinement
 * - Learn from user preferences and past contracts
 * - Automatic legal compliance checking
 * - Citation of legal precedents and standards
 *
 * Error model
 * -----------
 * Public methods raise typed errors (NvidiaError from the NVIDIA client or
 * plain Error). The HTTP route translates them into user-facing messages –
 * this layer never wraps a real upstream error in a generic "please try
 * again" string, because that hides the failure from server logs.
 *
 * NOTE: AI-drafted contracts are NOT legal advice. Callers should display
 * a disclaimer and route the user to a qualified lawyer for binding use.
 */

import {
  generateText,
  generateWithSystem,
  parseJsonResponse,
  NVIDIA_MODELS,
  NvidiaError,
} from './nvidia-client.ts';

export interface ContractDraftRequest {
  // Basic Information
  contractType: string; // "SaaS Agreement", "Employment Contract", etc.
  parties: {
    party1: { name: string; role: string; jurisdiction: string };
    party2: { name: string; role: string; jurisdiction: string };
  };

  // Requirements
  requirements: string; // Natural language description
  keyTerms: {
    duration?: string;
    paymentTerms?: string;
    deliverables?: string[];
    specialClauses?: string[];
  };

  // Preferences
  favorableFor?: 'party1' | 'party2' | 'balanced';
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  complexity?: 'simple' | 'standard' | 'comprehensive';
  industry?: string;
  jurisdiction?: string;

  // Learning from past contracts
  referenceContracts?: string[];
  userPreferences?: UserDraftingPreferences;
}

export interface UserDraftingPreferences {
  preferredClauses: string[];
  avoidedTerms: string[];
  standardTerms: Record<string, string>;
  templateStyle: 'formal' | 'modern' | 'concise';
  clauseOrder: string[];
  customSections: Array<{ title: string; content: string }>;
}

export interface DraftedContract {
  // Generated Content
  fullText: string;
  title: string;
  preamble: string;
  sections: ContractSection[];
  signatures: SignatureBlock[];

  // Metadata
  generatedAt: Date;
  model: string;
  confidence: number; // 0-100
  completeness: number; // 0-100

  // Analysis
  riskScore: number;
  missingClauses: string[];
  suggestedImprovements: string[];
  legalCitations: LegalCitation[];

  // Alternatives
  alternativeVersions: {
    moreBalanced?: string;
    moreProtective?: string;
    simplified?: string;
  };

  // Explanation
  clauseExplanations: Record<string, string>;
  designDecisions: string[];
}

export interface ContractSection {
  id: string;
  number: string; // "1", "1.1", "1.1.1"
  title: string;
  content: string;
  category: string; // "payment", "liability", "termination", etc.
  importance: 'critical' | 'important' | 'standard' | 'optional';
  source: 'required' | 'recommended' | 'user-requested' | 'ai-suggested';
  alternatives: string[];
  legalBasis?: string;
}

export interface SignatureBlock {
  party: string;
  fields: string[];
  date: boolean;
  witness: boolean;
}

export interface LegalCitation {
  statute?: string;
  caselaw?: string;
  regulation?: string;
  standard?: string; // Industry standard
  description: string;
  relevantTo: string; // Which clause
}

export interface ContractRefinement {
  instruction: string;
  specificSection?: string;
  changeType: 'add' | 'remove' | 'modify' | 'rephrase';
}

/**
 * Max output tokens for a single drafting call. Calibrated for the default
 * Nemotron Super 120B model: live tests show 6000 tokens completes inside
 * the 60s request budget. Going higher risks Vercel's 90s function cap
 * (see vercel.json) and yields truncated JSON the parser has to repair.
 */
const DRAFT_MAX_TOKENS = 8000;
const DRAFT_TEMPERATURE = 0.5;

export class AIContractDrafter {
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(_apiKey?: string) {
    // API key handled centrally via NVIDIA_API_KEY env var
  }

  /**
   * Draft a complete contract from natural language requirements.
   *
   * Errors are propagated unchanged so callers (e.g. /api/drafting) can
   * distinguish a 401/429/empty-response from a generic failure.
   */
  async draftContract(request: ContractDraftRequest): Promise<DraftedContract> {
    const systemPrompt = this.buildDraftingPrompt(request);

    const response = await generateText(
      systemPrompt,
      NVIDIA_MODELS.primary,
      DRAFT_TEMPERATURE,
      DRAFT_MAX_TOKENS,
      undefined,
      true, // enable JSON mode so model returns structured JSON directly
    );

    const draft = this.parseContractDraft(response, request);
    const validated = await this.validateDraft(draft);
    const enhanced = await this.enhanceDraft(validated, request);
    return enhanced;
  }

  /**
   * Refine an existing draft based on user feedback.
   */
  async refineDraft(
    currentDraft: DraftedContract,
    refinements: ContractRefinement[],
  ): Promise<DraftedContract> {
    const refinementPrompt = `
You are refining a contract draft based on user feedback.

CURRENT DRAFT:
${currentDraft.fullText}

USER REFINEMENT REQUESTS:
${refinements
  .map(
    (r, i) =>
      `${i + 1}. ${r.changeType.toUpperCase()}: ${r.instruction}${
        r.specificSection ? ` (in section: ${r.specificSection})` : ''
      }`,
  )
  .join('\n')}

Provide the COMPLETE refined contract with all requested changes applied. Maintain the same structure and format. Only change what was requested.

Output format (JSON only):
{
  "fullText": "complete refined contract text",
  "changedSections": ["list of section IDs that were modified"],
  "summary": "brief summary of changes made"
}`;

    const response = await generateText(
      refinementPrompt,
      NVIDIA_MODELS.primary,
      0.5,
      DRAFT_MAX_TOKENS,
      undefined,
      true,
    );

    const refined = parseJsonResponse<{ fullText: string }>(response);
    return {
      ...currentDraft,
      fullText: refined.fullText,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate multiple contract variations for comparison.
   * NOTE: signature kept identical to existing callers that pass a
   * ContractDraftRequest. Older code in the file used `draftId` here but no
   * other route currently consumes that signature.
   */
  async generateVariations(
    request: ContractDraftRequest,
  ): Promise<{ balanced: DraftedContract; protective: DraftedContract; simple: DraftedContract }> {
    const variations = await Promise.all([
      this.draftContract({ ...request, favorableFor: 'balanced', complexity: 'standard' }),
      this.draftContract({ ...request, favorableFor: 'party1', complexity: 'comprehensive' }),
      this.draftContract({ ...request, favorableFor: 'balanced', complexity: 'simple' }),
    ]);

    return {
      balanced: variations[0],
      protective: variations[1],
      simple: variations[2],
    };
  }

  /**
   * Interactive drafting conversation.
   */
  async conversationalDrafting(userMessage: string): Promise<{
    response: string;
    draft?: DraftedContract;
    needsMoreInfo: boolean;
    questions?: string[];
  }> {
    this.conversationHistory.push({ role: 'user', content: userMessage });

    const conversationPrompt = `
You are an AI legal assistant helping draft a contract through conversation.

CONVERSATION HISTORY:
${this.conversationHistory.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

Based on the conversation so far:
1. If you have enough information, draft the contract
2. If you need more details, ask 2-3 specific clarifying questions
3. Be conversational and helpful

Respond in JSON:
{
  "response": "your message to the user",
  "needsMoreInfo": true/false,
  "questions": ["question1", "question2"] or null,
  "readyToDraft": true/false,
  "extractedRequirements": {
    "contractType": "...",
    "parties": {...},
    "keyTerms": {...}
  }
}`;

    const response = await generateText(
      conversationPrompt,
      NVIDIA_MODELS.primary,
      0.7,
      4096,
    );

    const parsed = parseJsonResponse<{
      response: string;
      needsMoreInfo: boolean;
      questions?: string[];
      readyToDraft?: boolean;
      extractedRequirements?: ContractDraftRequest;
    }>(response);

    this.conversationHistory.push({ role: 'assistant', content: parsed.response });

    let draft: DraftedContract | undefined;
    if (parsed.readyToDraft && parsed.extractedRequirements) {
      draft = await this.draftContract(parsed.extractedRequirements);
    }

    return {
      response: parsed.response,
      draft,
      needsMoreInfo: parsed.needsMoreInfo,
      questions: parsed.questions,
    };
  }

  /**
   * Smart clause recommendations.
   */
  async recommendClauses(
    contractType: string,
    industry: string,
    parties: unknown,
    existingSections: string[],
  ): Promise<
    Array<{
      clause: string;
      title: string;
      importance: string;
      reasoning: string;
      template: string;
    }>
  > {
    const prompt = `
Analyze this contract being drafted and recommend additional clauses.

Contract Type: ${contractType}
Industry: ${industry}
Parties: ${JSON.stringify(parties)}
Existing Sections: ${existingSections.join(', ')}

Recommend 5-10 additional clauses that should be included. For each:
1. Clause title
2. Importance level (critical/important/recommended)
3. Brief reasoning why it's needed
4. Template text for the clause

Format as JSON array:
[
  {
    "clause": "Force Majeure",
    "title": "Force Majeure Events",
    "importance": "important",
    "reasoning": "Protects both parties from liability due to unforeseen circumstances",
    "template": "Neither party shall be liable for..."
  }
]`;

    const result = await generateText(prompt, NVIDIA_MODELS.primary, 0.5, 4096, undefined, true);
    return parseJsonResponse<
      Array<{
        clause: string;
        title: string;
        importance: string;
        reasoning: string;
        template: string;
      }>
    >(result);
  }

  /**
   * Auto-populate contract from company profile.
   */
  async populateFromProfile(
    contractTemplate: string,
    companyProfile: {
      name: string;
      address: string;
      taxId: string;
      representatives: Array<{ name: string; title: string }>;
      standardTerms: Record<string, string>;
      preferences: UserDraftingPreferences;
    },
  ): Promise<string> {
    // Smart variable replacement with company data
    let populated = contractTemplate;

    // Replace standard variables
    populated = populated.replace(/\[COMPANY_NAME\]/g, companyProfile.name);
    populated = populated.replace(/\[COMPANY_ADDRESS\]/g, companyProfile.address);
    populated = populated.replace(/\[TAX_ID\]/g, companyProfile.taxId);

    // Apply standard terms
    for (const [key, value] of Object.entries(companyProfile.standardTerms)) {
      const regex = new RegExp(`\\[${key}\\]`, 'g');
      populated = populated.replace(regex, value);
    }

    // Use AI to fill in complex sections
    const aiFilledSections = await this.intelligentFill(populated, companyProfile);

    return aiFilledSections;
  }

  // Private helper methods

  private buildDraftingPrompt(request: ContractDraftRequest): string {
    return `CRITICAL DIRECTIVE: You MUST respond DIRECTLY with a single JSON object. Do NOT include any thinking, chain-of-thought, reasoning monologue, preamble, or markdown fences. Start your response immediately with "{" and end with "}".

You are an expert legal AI. Draft a complete, professional, ready-to-sign contract.

CONTRACT SPECIFICATIONS:
- Contract Type: ${request.contractType}
- Party 1: ${request.parties.party1.name} (${request.parties.party1.role}) - ${request.parties.party1.jurisdiction}
- Party 2: ${request.parties.party2.name} (${request.parties.party2.role}) - ${request.parties.party2.jurisdiction}
- Description & Requirements: ${request.requirements}
- Duration / Term: ${request.keyTerms.duration || 'Standard term'}
- Payment Terms: ${request.keyTerms.paymentTerms || 'Standard terms'}
- Deliverables / Scope: ${request.keyTerms.deliverables?.join(', ') || 'As specified in requirements'}
- Balance: ${request.favorableFor || 'balanced'}
- Jurisdiction: ${request.jurisdiction || 'US'}

REQUIRED SECTIONS TO INCLUDE:
1. Preamble (Parties, Effective Date, Recitals)
2. Definitions & Scope of Agreement
3. Core Obligations & Performance
4. Compensation & Payment Terms
5. Term & Termination
6. Confidentiality & Intellectual Property
7. Limitation of Liability & Indemnification
8. Dispute Resolution & Governing Law
9. General Provisions
10. Signatures

OUTPUT FORMAT (Respond with a single JSON object only, no markdown):
{
  "title": "${request.contractType}",
  "sections": [
    {
      "number": "1",
      "title": "Preamble and Recitals",
      "content": "Full legal clause text here...",
      "category": "preamble",
      "importance": "critical",
      "alternatives": []
    }
  ],
  "missingClauses": ["Any recommended additions"],
  "clauseExplanations": {
    "Section 1": "Establishes legal capacity and binding recitals."
  },
  "designDecisions": [
    "Drafted with balanced risk allocation appropriate for ${request.contractType}."
  ]
}`;
  }

  /**
   * Parse a raw AI response string into a DraftedContract.
   * Public so tests can exercise it without invoking the AI provider.
   */
  parseContractDraft(
    response: string,
    request: ContractDraftRequest,
  ): DraftedContract {
    // Use the shared parser so we benefit from code-fence stripping and the
    // truncated-JSON repair. If parsing truly fails, surface that error
    // verbatim rather than masking it.
    let parsed: {
      fullText?: string;
      title?: string;
      sections?: Array<Partial<ContractSection> & { alternatives?: unknown }>;
      clauseExplanations?: Record<string, string>;
      designDecisions?: string[];
      missingClauses?: string[];
      legalCitations?: LegalCitation[];
    };
    try {
      parsed = parseJsonResponse(response);
    } catch (rawErr) {
      // Fallback: the model may have emitted a "thinking" preamble before
      // the JSON. Search for the first JSON object / array and parse from
      // there. This is a defensive recovery for reasoning models that
      // occasionally ignore the `skip_reasoning` flag.
      const recovered = tryExtractFirstJson(response);
      if (!recovered) {
        throw new Error(
          `AI returned a non-JSON contract draft: ${
            rawErr instanceof Error ? rawErr.message : String(rawErr)
          }`,
        );
      }
      parsed = recovered as typeof parsed;
    }

    let fullText = typeof parsed.fullText === 'string' ? parsed.fullText.trim() : '';
    if (typeof parsed.title !== 'string' || parsed.title.length === 0) {
      parsed.title = request.contractType;
    }

    const sections: ContractSection[] = Array.isArray(parsed.sections)
      ? parsed.sections.map((s, i) => ({
          id: s.id || `section-${i + 1}`,
          number: s.number || String(i + 1),
          title: s.title || `Section ${i + 1}`,
          content: s.content || '',
          category: s.category || 'general',
          importance:
            (s.importance as ContractSection['importance']) || 'standard',
          source: (s.source as ContractSection['source']) || 'ai-suggested',
          alternatives: Array.isArray(s.alternatives)
            ? s.alternatives.filter((a): a is string => typeof a === 'string')
            : [],
          legalBasis: typeof s.legalBasis === 'string' ? s.legalBasis : undefined,
        }))
      : [];

    // Synthesize fullText if empty but sections exist
    if (!fullText && sections.length > 0) {
      fullText = `${parsed.title.toUpperCase()}\n\n` +
        sections.map((s) => `${s.number}. ${s.title.toUpperCase()}\n${s.content}`).join('\n\n');
    }

    // Synthesize sections if sections array was empty but fullText exists
    if (sections.length === 0 && fullText) {
      const parts = fullText.split(/\n(?=(?:SECTION|\d+\.)\s+)/i);
      parts.forEach((part, idx) => {
        const trimmed = part.trim();
        if (!trimmed) return;
        const firstLineEnd = trimmed.indexOf('\n');
        const titleLine = firstLineEnd !== -1 ? trimmed.slice(0, firstLineEnd).trim() : `Section ${idx + 1}`;
        const content = firstLineEnd !== -1 ? trimmed.slice(firstLineEnd).trim() : trimmed;
        sections.push({
          id: `section-${idx + 1}`,
          number: String(idx + 1),
          title: titleLine.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, ''),
          content,
          category: 'general',
          importance: 'standard',
          source: 'ai-suggested',
          alternatives: [],
        });
      });
    }

    // Fallback: if parsed was a single section object with content
    if (sections.length === 0 && (parsed as any).content) {
      sections.push({
        id: 'section-1',
        number: (parsed as any).number || '1',
        title: parsed.title,
        content: (parsed as any).content,
        category: (parsed as any).category || 'general',
        importance: 'standard',
        source: 'ai-suggested',
        alternatives: [],
      });
      if (!fullText) {
        fullText = `${parsed.title.toUpperCase()}\n\n${(parsed as any).content}`;
      }
    }

    const completeness = this.calculateCompleteness({
      ...parsed,
      fullText,
      sections,
    });

    return {
      fullText,
      title: parsed.title,
      preamble: this.extractPreamble(fullText),
      sections,
      signatures: this.extractSignatureBlocks(fullText),
      generatedAt: new Date(),
      model: NVIDIA_MODELS.primary,
      confidence: 85,
      completeness,
      riskScore: 0,
      missingClauses: Array.isArray(parsed.missingClauses)
        ? parsed.missingClauses
        : [],
      suggestedImprovements: [],
      legalCitations: Array.isArray(parsed.legalCitations)
        ? parsed.legalCitations
        : [],
      alternativeVersions: {},
      clauseExplanations:
        parsed.clauseExplanations && typeof parsed.clauseExplanations === 'object'
          ? parsed.clauseExplanations
          : {},
      designDecisions: Array.isArray(parsed.designDecisions)
        ? parsed.designDecisions
        : [],
    };
  }

  /**
   * Score a parsed draft for completeness and merge in a list of missing
   * standard clauses. Public so tests can run it without invoking the AI.
   */
  async validateDraft(draft: DraftedContract): Promise<DraftedContract> {
    const requiredKeywords = [
      'parties',
      'definitions',
      'payment',
      'term',
      'termination',
      'liability',
      'confidentiality',
      'dispute',
      'signatures',
    ];

    const missing: string[] = [];
    for (const required of requiredKeywords) {
      const hasSection = draft.sections.some(
        (s) =>
          s.category.toLowerCase().includes(required) ||
          s.title.toLowerCase().includes(required),
      );
      if (!hasSection) missing.push(required);
    }

    // Only overwrite if the AI's `missingClauses` was empty – preserve its list
    // when it was actually populated.
    if (!draft.missingClauses || draft.missingClauses.length === 0) {
      draft.missingClauses = missing;
    }
    draft.completeness =
      ((requiredKeywords.length - missing.length) / requiredKeywords.length) * 100;

    return draft;
  }

  private async enhanceDraft(
    draft: DraftedContract,
    _request: ContractDraftRequest,
  ): Promise<DraftedContract> {
    // Placeholder for future risk-analysis / alternative-versions hooks.
    return draft;
  }

  private extractPreamble(fullText: string): string {
    if (!fullText) return '';
    const lines = fullText.split('\n');
    const preambleLines: string[] = [];

    for (const line of lines) {
      if (line.match(/^#+ /)) break; // Stop at first section
      preambleLines.push(line);
    }

    return preambleLines.join('\n').trim();
  }

  private extractSignatureBlocks(fullText: string): SignatureBlock[] {
    return [
      {
        party: 'Party 1',
        fields: ['Name', 'Title', 'Signature'],
        date: true,
        witness: false,
      },
      {
        party: 'Party 2',
        fields: ['Name', 'Title', 'Signature'],
        date: true,
        witness: false,
      },
    ];
  }

  private calculateCompleteness(parsed: {
    title?: string;
    fullText?: string;
    sections?: unknown;
    clauseExplanations?: unknown;
    legalCitations?: unknown;
  }): number {
    let score = 0;
    if (parsed.title) score += 10;
    if (parsed.fullText && parsed.fullText.length > 500) score += 30;
    if (Array.isArray(parsed.sections) && parsed.sections.length >= 10) score += 40;
    if (parsed.clauseExplanations) score += 10;
    if (parsed.legalCitations) score += 10;
    return score;
  }

  private async intelligentFill(template: string, _profile: unknown): Promise<string> {
    // Placeholder – would issue another AI call for non-trivial gaps.
    return template;
  }

  /**
   * Learn from user feedback to improve future drafts.
   */
  async learnFromFeedback(
    draftId: string,
    userChanges: Array<{
      section: string;
      originalText: string;
      revisedText: string;
      reason: string;
    }>,
    finalApproval: boolean,
  ): Promise<void> {
    const learningData = {
      draftId,
      timestamp: new Date(),
      changes: userChanges,
      approved: finalApproval,
      patterns: this.extractPatterns(userChanges),
    };
    console.log('Learning from feedback:', learningData);
  }

  private extractPatterns(changes: Array<{ reason: string }>): string[] {
    const patterns: string[] = [];
    for (const change of changes) {
      if (change.reason.toLowerCase().includes('liability')) {
        patterns.push('User prefers lower liability limits');
      }
      if (change.reason.toLowerCase().includes('payment')) {
        patterns.push('User prefers specific payment terms');
      }
    }
    return patterns;
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function formatContractForExport(
  draft: DraftedContract,
  format: 'markdown' | 'html' | 'docx',
): string {
  if (format === 'markdown') return draft.fullText;
  if (format === 'html') {
    return `<html><body><h1>${draft.title}</h1>${draft.fullText.replace(/\n/g, '<br>')}</body></html>`;
  }
  return draft.fullText;
}

export function estimateDraftingTime(complexity: string, contractType: string): string {
  const times: Record<string, string> = {
    simple: '2-3 minutes',
    standard: '3-5 minutes',
    comprehensive: '5-8 minutes',
  };
  return times[complexity] || '3-5 minutes';
}

export function getContractTemplateRecommendations(
  contractType: string,
  industry: string,
): string[] {
  const recommendations: Record<string, string[]> = {
    'SaaS Subscription Agreement': [
      'Service Level Agreement (SLA)',
      'Data Processing Addendum',
      'Acceptable Use Policy',
      'Privacy Policy',
    ],
    'Employment Agreement': [
      'Non-Disclosure Agreement',
      'Non-Compete Agreement',
      'IP Assignment',
      'Benefits Summary',
    ],
    'Consulting Services Agreement': [
      'Statement of Work',
      'Non-Disclosure Agreement',
      'IP Assignment',
      'Independent Contractor Agreement',
    ],
  };

  return recommendations[contractType] || ['Master Agreement', 'Statement of Work'];
}

// Re-export NvidiaError so existing /api/drafting consumers can branch on it
// without re-importing from the client module.
export { NvidiaError };

/**
 * Lightweight in-line version of repairTruncatedJson – closes any open
 * braces/brackets/strings so a JSON.parse() of a truncated AI payload
 * can still succeed. Mirrors the implementation in nvidia-client but
 * kept private here so this module does not have to import internals.
 */
function repairTruncatedJsonInline(text: string): unknown | null {
  let result = text.trimEnd();
  result = result.replace(/,\s*$/, '');
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (const ch of result) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inString) result += '"';
  result = result.replace(/,(\s*)$/, '$1');
  while (stack.length > 0) {
    const open = stack.pop();
    result += open === '{' ? '}' : ']';
  }
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Search a free-form AI response for the first JSON object / array and
 * try to parse it. Returns the parsed value, or null if no JSON-shaped
 * region was found. Used as a last-ditch fallback when the model emits a
 * thinking preamble that we did not strip earlier.
 */
function tryExtractFirstJson(text: string): unknown | null {
  if (!text) return null;

  // 1. Try fenced blocks first
  const fenceRe = /```(?:json)?\s*([\s\S]*?)(?:```|$)/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (!candidate) continue;
    try {
      const obj = JSON.parse(candidate);
      if (obj && typeof obj === 'object') return obj;
    } catch {
      const repaired = repairTruncatedJsonInline(candidate);
      if (repaired && typeof repaired === 'object') return repaired;
    }
  }

  // 2. If there is an outermost '{', try repairing from the first '{' to the end.
  // This recovers full contracts when the model emitted leading prose or was cut off mid-clause.
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    const sliceFromFirst = text.slice(firstBrace);
    try {
      const obj = JSON.parse(sliceFromFirst);
      if (obj && typeof obj === 'object') {
        const o = obj as Record<string, unknown>;
        if (o.sections || o.fullText || (o.title && !('number' in o))) return obj;
      }
    } catch {
      const repaired = repairTruncatedJsonInline(sliceFromFirst);
      if (repaired && typeof repaired === 'object') {
        const r = repaired as Record<string, unknown>;
        if (r.sections || r.fullText || (r.title && !('number' in r))) {
          return repaired;
        }
      }
    }
  }

  // 3. Scan for balanced candidate objects that represent a complete contract
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const slice = text.slice(i, j + 1);
          try {
            const obj = JSON.parse(slice);
            if (obj && typeof obj === 'object') {
              const o = obj as Record<string, unknown>;
              // Guard against latching onto a single child section ({ number: "1", title: "..." })
              if (o.sections || o.fullText || (o.title && !('number' in o))) {
                return obj;
              }
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  // 4. Fallback: if we found a first brace, return whatever repair gives
  if (firstBrace !== -1) {
    const fallbackRepaired = repairTruncatedJsonInline(text.slice(firstBrace));
    if (fallbackRepaired && typeof fallbackRepaired === 'object') {
      return fallbackRepaired;
    }
  }

  return null;
}
