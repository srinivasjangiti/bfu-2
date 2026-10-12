'use client';

import { safeDownload } from '@/lib/download-utils';
import { useState } from 'react';
import { ContractDraftRequest, DraftedContract } from '@/lib/ai-contract-drafter';

export default function AIContractDrafterComponent() {
  // Add custom styles for select dropdown
  const selectStyles = `
    select option {
      background-color: white;
      color: #1c1917;
    }
    select option:checked,
    select option:hover {
      background-color: #f5f5f4;
      color: #1c1917;
    }
  `;
  const [step, setStep] = useState<'input' | 'drafting' | 'result'>('input');
  const [description, setDescription] = useState('');
  const [contractType, setContractType] = useState('SaaS Subscription Agreement');
  const [yourCompany, setYourCompany] = useState('');
  const [theirCompany, setTheirCompany] = useState('');
  const [draftedContract, setDraftedContract] = useState<DraftedContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<'balanced' | 'protective' | 'simple'>('balanced');
  const [error, setError] = useState<string | null>(null);

  const handleDraft = async () => {
    setLoading(true);
    setStep('drafting');
    setError(null);

    try {
      const request: ContractDraftRequest = {
        contractType,
        parties: {
          party1: { name: yourCompany, role: 'Provider', jurisdiction: 'United States' },
          party2: { name: theirCompany, role: 'Customer', jurisdiction: 'United States' },
        },
        requirements: description,
        keyTerms: {},
        favorableFor: 'balanced',
        riskTolerance: 'moderate',
        complexity: 'standard',
        industry: 'Technology',
        jurisdiction: 'United States',
      };

      const res = await fetch('/api/drafting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft', ...request }),
      });

      if (!res.ok) {
        let errMessage = 'Failed to draft contract';
        if (res.status === 401) errMessage = 'Please sign in to draft a contract.';
        else if (res.status === 403) errMessage = 'You do not have permission to draft contracts.';
        else if (res.status >= 500) errMessage = 'Server error. Please try again later.';
        
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch {
          // Ignore JSON parse errors for non-JSON error pages
        }
        throw new Error(errMessage);
      }

      const text = await res.text();
      if (!text) throw new Error('Empty response from server');
      
      let result: DraftedContract;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error('Invalid response format from server');
      }

      setDraftedContract(result);
      setStep('result');
    } catch (err: any) {
      console.error('Drafting failed:', err);
      setError(err.message || 'Network error. Please check your connection.');
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  const [downloading, setDownloading] = useState(false);

  const getContractMarkdown = () => {
    if (!draftedContract) return '';
    const title = draftedContract.title || contractType;
    let md = `# ${title}\n\n`;
    if (draftedContract.preamble) {
      md += `${draftedContract.preamble}\n\n`;
    }
    if (draftedContract.sections && draftedContract.sections.length > 0) {
      for (const section of draftedContract.sections) {
        md += `## Section ${section.number}: ${section.title}\n\n${section.content}\n\n`;
      }
    } else if (draftedContract.fullText) {
      md += `${draftedContract.fullText}\n\n`;
    }

    md += `## Signatures\n\n`;
    md += `IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the Effective Date.\n\n`;
    md += `**Party 1 (${yourCompany || 'Provider'}):**\nSignature: ___________________________\nName: _______________________________\nTitle: ________________________________\nDate: _________________________________\n\n`;
    md += `**Party 2 (${theirCompany || 'Customer'}):**\nSignature: ___________________________\nName: _______________________________\nTitle: ________________________________\nDate: _________________________________\n\n`;

    return md;
  };

  const handleDownloadPDF = async () => {
    if (!draftedContract) return;
    setDownloading(true);
    try {
      const { exportAsPDF } = await import('@/lib/export-utils');
      const md = getContractMarkdown();
      const title = draftedContract.title || contractType;
      await exportAsPDF(title, md);
    } catch (e) {
      console.error('Failed to export PDF:', e);
      handleDownloadTXT();
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadDOCX = async () => {
    if (!draftedContract) return;
    setDownloading(true);
    try {
      const { exportAsDOCX } = await import('@/lib/export-utils');
      const md = getContractMarkdown();
      const title = draftedContract.title || contractType;
      await exportAsDOCX(title, md);
    } catch (e) {
      console.error('Failed to export DOCX:', e);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadTXT = async () => {
    if (!draftedContract) return;
    try {
      const { markdownToPlainText } = await import('@/lib/export-utils');
      const md = getContractMarkdown();
      const plain = markdownToPlainText(md);
      const title = draftedContract.title || contractType;
      const blob = new Blob([plain], { type: 'text/plain;charset=utf-8' });
      safeDownload(blob, `${title.replace(/\s+/g, '-')}.txt`);
    } catch {
      const title = draftedContract.title || contractType;
      const blob = new Blob([draftedContract.fullText || ''], { type: 'text/plain;charset=utf-8' });
      safeDownload(blob, `${title.replace(/\s+/g, '-')}.txt`);
    }
  };

  const handleGenerateVariations = async () => {
    if (!draftedContract) return;
    setLoading(true);

    try {
      // Variations are already included in alternativeVersions
      // This is just a placeholder for future enhancement
    } catch (error) {
      console.error('Variation generation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <style dangerouslySetInnerHTML={{ __html: selectStyles }} />
      <div className="max-w-7xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2">
          <span className="mono text-xs text-stone-500 tracking-wider uppercase">AI-Powered Drafting</span>
        </div>
        <h1 className="text-5xl font-bold text-stone-900 mb-3 tracking-tight">AI Contract Drafter</h1>
        <p className="text-lg text-stone-600 font-light">Create complete contracts from natural language in 30 seconds</p>
      </div>

      {step === 'input' && (
        <div className="bg-white border-2 border-stone-900 p-8 shadow-sm">
          <div className="space-y-8">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6">
                <p className="text-red-800 font-semibold text-sm uppercase tracking-wide">⚠️ Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            )}
            {/* Contract Type */}
            <div>
              <label className="block text-sm font-semibold text-stone-900 mb-2 uppercase tracking-wide">
                Contract Type
              </label>
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="w-full px-4 py-3 border-2 border-stone-200 focus:border-stone-900 focus:outline-none transition-colors bg-white text-stone-900 font-medium"
              >
                <option>SaaS Subscription Agreement</option>
                <option>Software License Agreement</option>
                <option>Consulting Services Agreement</option>
                <option>Employment Agreement</option>
                <option>NDA (Mutual)</option>
                <option>Master Services Agreement</option>
                <option>Freelance Contract</option>
                <option>Partnership Agreement</option>
              </select>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2 uppercase tracking-wide">
                  Your Company Name
                </label>
                <input
                  type="text"
                  value={yourCompany}
                  onChange={(e) => setYourCompany(e.target.value)}
                  placeholder="e.g., Acme Inc."
                  className="w-full px-4 py-3 border-2 border-stone-200 focus:border-stone-900 focus:outline-none transition-colors bg-white text-stone-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-900 mb-2 uppercase tracking-wide">
                  Other Party Name
                </label>
                <input
                  type="text"
                  value={theirCompany}
                  onChange={(e) => setTheirCompany(e.target.value)}
                  placeholder="e.g., Client Corp"
                  className="w-full px-4 py-3 border-2 border-stone-200 focus:border-stone-900 focus:outline-none transition-colors bg-white text-stone-900"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-stone-900 mb-2 uppercase tracking-wide">
                Describe Your Contract in Plain English
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: I need a SaaS agreement for our project management software. Monthly billing at $99/month per user, minimum 5 users. 99.9% uptime SLA. 30-day money back guarantee. Auto-renews annually with 60-day cancellation notice."
                rows={6}
                className="w-full px-4 py-3 border-2 border-stone-200 focus:border-stone-900 focus:outline-none transition-colors bg-white text-stone-900 text-base"
              />
              <p className="mt-2 text-sm text-stone-500 font-light">
                Be as detailed as possible. Include pricing, terms, SLAs, and any special requirements.
              </p>
            </div>

            {/* Examples */}
            <div className="bg-stone-100 border-l-4 border-stone-900 p-4">
              <p className="text-sm font-semibold text-stone-900 mb-2 uppercase tracking-wide">💡 Example Descriptions:</p>
              <ul className="text-sm text-stone-800 space-y-1">
                <li>• "SaaS subscription at $199/month, 50 users max, 99.9% uptime, Stripe payments, cancel anytime"</li>
                <li>• "Consulting agreement for marketing services, $150/hour, 20 hour/week cap, net 30 payment"</li>
                <li>• "Full-time employment, $120k salary, 4 weeks PTO, standard benefits, 90-day probation"</li>
              </ul>
            </div>

            {/* Action Button */}
            <button
              onClick={handleDraft}
              disabled={!description || !yourCompany || !theirCompany}
              className="w-full bg-stone-900 text-white py-4 px-6 font-semibold hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed transition-all duration-300 text-lg uppercase tracking-wide"
            >
              🤖 Draft Contract with AI
            </button>
          </div>
        </div>
      )}

      {step === 'drafting' && (
        <div className="bg-white border-2 border-stone-900 p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-stone-900 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold mb-2 text-stone-900">AI is Drafting Your Contract...</h2>
          <p className="text-stone-600 font-light">Analyzing requirements, selecting clauses, generating document</p>
          <div className="mt-6 space-y-2 text-sm text-stone-500 font-light">
            <p>✓ Understanding your requirements</p>
            <p>✓ Selecting optimal clauses</p>
            <p>✓ Customizing for your industry</p>
            <p>✓ Ensuring legal compliance</p>
          </div>
        </div>
      )}

      {step === 'result' && draftedContract && (
        <div className="space-y-6">
          {/* Success Message */}
          <div className="bg-green-50 border-l-4 border-green-600 p-4">
            <p className="text-green-800 font-semibold">
              ✅ Contract drafted successfully! Review and download below.
            </p>
          </div>

          {/* Variations Tabs */}
          <div className="bg-white border-2 border-stone-900 overflow-hidden">
            <div className="border-b border-gray-200">
              <nav className="flex">
                <button
                  onClick={() => setSelectedVariation('balanced')}
                  className={`flex-1 px-6 py-4 text-sm font-semibold uppercase tracking-wide ${
                    selectedVariation === 'balanced'
                      ? 'border-b-4 border-stone-900 text-stone-900 bg-stone-50'
                      : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
                  }`}
                >
                  ⚖️ Balanced Version
                  <span className="block text-xs mt-1">Fair to both parties</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedVariation('protective');
                    if (!draftedContract.alternativeVersions?.moreProtective) handleGenerateVariations();
                  }}
                  className={`flex-1 px-6 py-4 text-sm font-semibold uppercase tracking-wide ${
                    selectedVariation === 'protective'
                      ? 'border-b-4 border-stone-900 text-stone-900 bg-stone-50'
                      : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
                  }`}
                >
                  🛡️ Protective Version
                  <span className="block text-xs mt-1">Maximum protection</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedVariation('simple');
                    if (!draftedContract.alternativeVersions?.simplified) handleGenerateVariations();
                  }}
                  className={`flex-1 px-6 py-4 text-sm font-semibold uppercase tracking-wide ${
                    selectedVariation === 'simple'
                      ? 'border-b-4 border-stone-900 text-stone-900 bg-stone-50'
                      : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50'
                  }`}
                >
                  📄 Simple Version
                  <span className="block text-xs mt-1">Streamlined & clear</span>
                </button>
              </nav>
            </div>

            {/* Contract Content */}
            <div className="p-8">
              <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                  {selectedVariation === 'balanced' && draftedContract.fullText}
                  {selectedVariation === 'protective' && (draftedContract.alternativeVersions?.moreProtective || 'Not available')}
                  {selectedVariation === 'simple' && (draftedContract.alternativeVersions?.simplified || 'Not available')}
                </pre>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border-2 border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-1 uppercase tracking-wide font-semibold">Completeness</p>
              <p className="text-3xl font-bold text-stone-900">{draftedContract.completeness}%</p>
            </div>
            <div className="bg-white border-2 border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-1 uppercase tracking-wide font-semibold">Risk Score</p>
              <p className="text-3xl font-bold text-stone-900">{draftedContract.riskScore}/100</p>
            </div>
            <div className="bg-white border-2 border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-1 uppercase tracking-wide font-semibold">Clauses</p>
              <p className="text-3xl font-bold text-stone-900">{draftedContract.sections.length}</p>
            </div>
          </div>

          {/* Missing Clauses */}
          {draftedContract.missingClauses.length > 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4">
              <p className="text-yellow-900 font-semibold mb-2 uppercase tracking-wide text-sm">⚠️ Recommended Additional Clauses:</p>
              <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1 font-light">
                {draftedContract.missingClauses.map((clause: string, idx: number) => (
                  <li key={idx}>{clause}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleDownloadPDF}
                disabled={downloading}
                className="flex-1 bg-stone-900 text-white py-3.5 px-6 font-semibold hover:bg-stone-800 transition-all duration-300 uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {downloading ? '⏳ Generating PDF...' : '📥 Download PDF (.pdf)'}
              </button>
              <button
                onClick={handleDownloadDOCX}
                disabled={downloading}
                className="bg-stone-800 text-white py-3.5 px-6 font-semibold hover:bg-stone-700 transition-all duration-300 uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                📄 Word (.docx)
              </button>
              <button
                onClick={handleDownloadTXT}
                disabled={downloading}
                className="bg-stone-100 border-2 border-stone-300 text-stone-700 py-3.5 px-5 font-semibold hover:bg-stone-200 transition-all duration-300 uppercase tracking-wide cursor-pointer disabled:opacity-50"
              >
                TXT
              </button>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setStep('input');
                  setDraftedContract(null);
                }}
                className="flex-1 bg-white border-2 border-stone-900 text-stone-900 py-3 px-6 font-semibold hover:bg-stone-100 transition-all duration-300 uppercase tracking-wide cursor-pointer"
              >
                ✏️ Draft New Contract
              </button>
              <button
                className="flex-1 bg-green-600 text-white py-3 px-6 font-semibold hover:bg-green-700 transition-all duration-300 uppercase tracking-wide cursor-pointer"
              >
                ✍️ Send for Signature
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
