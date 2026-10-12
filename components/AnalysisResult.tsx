'use client';

import { safeDownload } from '@/lib/download-utils';
import { ContractAnalysis } from '@/lib/types';
import { AlertTriangle, CheckCircle, XCircle, Info, Download, TrendingUp, TrendingDown, Minus, Scale, FileText, MessageSquare, Send, X, Filter, Eye, EyeOff, Sparkles, Share2, Copy, Check, Link2, HelpCircle, Command, Bookmark, BookmarkCheck, StickyNote, Briefcase, Mail, Lightbulb, Loader2, Upload, Search, Printer, Clock, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { clauseAlternatives } from '@/lib/templates-data';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts';

const getReason = (category: string) => {
  switch(category) {
    case 'Indemnification': return 'Both clauses contain indemnification obligations, third-party liability language, and defense-cost allocation.';
    case 'Governing Law': return 'Both clauses establish jurisdiction, venue preferences, and applicable state or national laws.';
    case 'Termination': return 'Both clauses outline conditions for contract dissolution, notice periods, and material breach criteria.';
    case 'Confidentiality': return 'Both clauses specify non-disclosure obligations, protected information definitions, and survival periods.';
    case 'Liability': return 'Both clauses address damage caps, liability limitations, and exclusion of indirect damages.';
    default: return `Both clauses share significant legal phrasing and semantic structure relating to standard ${category.toLowerCase()} provisions.`;
  }
};

interface AnalysisResultProps {
  analysis: ContractAnalysis;
}

export default function AnalysisResult({ analysis }: AnalysisResultProps) {
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'quick' | 'deep'>('quick');
  const [riskFilter, setRiskFilter] = useState<'all' | 'critical' | 'high'>('all');
  const [showContractMap, setShowContractMap] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [shareExpiry, setShareExpiry] = useState(7);
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [bookmarkedClauses, setBookmarkedClauses] = useState<Set<string>>(new Set());
  const [clauseNotes, setClauseNotes] = useState<Map<string, string>>(new Map());
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showNegotiationModal, setShowNegotiationModal] = useState(false);
  const [selectedClauseForNegotiation, setSelectedClauseForNegotiation] = useState<string | null>(null);
  const [negotiationScript, setNegotiationScript] = useState<any>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [showPlaybookModal, setShowPlaybookModal] = useState(false);
  const [playbookContent, setPlaybookContent] = useState('');
  const [isGeneratingPlaybook, setIsGeneratingPlaybook] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'html' | 'pdf' | 'docx'>('pdf');
  const [exportOptions, setExportOptions] = useState({
    includeBookmarks: true,
    includeNotes: true,
    includeAIRecommendations: true,
    clauseFilter: 'all' as 'all' | 'bookmarked' | 'high-risk',
  });

  // Version comparison state
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareFile, setCompareFile] = useState<File | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [showTOC, setShowTOC] = useState(true);
  const [activeSection, setActiveSection] = useState<string>('summary');
  const [isScrolling, setIsScrolling] = useState(false);
  const [showAllClauses, setShowAllClauses] = useState(false);

  // NEW FEATURES: Search, sort, print, reading time
  const [clauseSearchQuery, setClauseSearchQuery] = useState('');
  const [clauseSortBy, setClauseSortBy] = useState<'order' | 'risk' | 'title'>('order');
  const [clauseSortDir, setClauseSortDir] = useState<'asc' | 'desc'>('asc');
  const [showPrintView, setShowPrintView] = useState(false);
  
  // NEW: Category filtering and grouping
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  
  // NEW: Clause annotations and highlights
  const [highlightedClauses, setHighlightedClauses] = useState<Map<string, string>>(new Map()); // clause.id -> color
  const [clauseComments, setClauseComments] = useState<Map<string, Array<{text: string, timestamp: number}>>>(new Map());
  
  // NEW: Analytics view
  const [showAnalytics, setShowAnalytics] = useState(false);
  
  // NEW: Clause comparison
  const [compareMode, setCompareMode] = useState(false);
  const [selectedClausesForCompare, setSelectedClausesForCompare] = useState<Set<string>>(new Set());
  
  // NEW: Playbook generator
  const [showPlaybookGenerator, setShowPlaybookGenerator] = useState(false);
  const [isGeneratingPlaybookFull, setIsGeneratingPlaybookFull] = useState(false);
  const [generatedPlaybook, setGeneratedPlaybook] = useState<any>(null);

  // NEW: Executive Report
  const [showExecutiveReport, setShowExecutiveReport] = useState(false);

  // NEW: Browse Alternatives Modal
  const [showAllAlternatives, setShowAllAlternatives] = useState(false);

  // NEW: ML Semantic Similarity
  const [similarClauses, setSimilarClauses] = useState<Record<string, { results: any[], predictedCategory: string, confidence: number, recommendedAlternative?: any }>>({});
  const [isSearchingSimilarity, setIsSearchingSimilarity] = useState<Record<string, boolean>>({});

  const handleFindSimilarClauses = async (clauseId: string, text: string, currentRiskScore?: number) => {
    setIsSearchingSimilarity(prev => ({ ...prev, [clauseId]: true }));
    try {
      const response = await fetch('/api/ml/similar-clauses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, topK: 3, currentRiskScore })
      });
      if (response.ok) {
        const data = await response.json();
        setSimilarClauses(prev => ({ 
          ...prev, 
          [clauseId]: {
            results: data.results || [],
            predictedCategory: data.predictedCategory || 'Unknown',
            confidence: data.confidence || 0,
            recommendedAlternative: data.recommendedAlternative
          }
        }));
      }
    } catch (error) {
      console.error('Failed to fetch similar clauses:', error);
      showToast('Failed to find similar clauses. Is the ML engine running?', 'error');
    } finally {
      setIsSearchingSimilarity(prev => ({ ...prev, [clauseId]: false }));
    }
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Scroll to section with smooth animation
  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    setIsScrolling(true);
    setShowContractMap(false); // Close contract map when navigating
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80; // Account for sticky header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });

      // Re-enable auto-tracking after scroll completes
      setTimeout(() => {
        setIsScrolling(false);
      }, 1000);
    }
  };

  // Risk level priority for sorting
  const riskPriority = { critical: 4, high: 3, medium: 2, low: 1 };

  // Filtered and sorted clauses — declared early so useEffect deps below can reference it
  const filteredAndSortedClauses = useMemo(() => {
    let clauses = [...analysis.clauses];

    // Apply search filter
    if (clauseSearchQuery.trim()) {
      const query = clauseSearchQuery.toLowerCase();
      clauses = clauses.filter(clause =>
        clause.title.toLowerCase().includes(query) ||
        clause.plainLanguage.toLowerCase().includes(query) ||
        clause.originalText.toLowerCase().includes(query) ||
        clause.category.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (selectedCategories.size > 0) {
      clauses = clauses.filter(c => selectedCategories.has(c.category));
    }

    // Apply risk filter
    if (riskFilter === 'critical') {
      clauses = clauses.filter(c => c.riskLevel === 'critical');
    } else if (riskFilter === 'high') {
      clauses = clauses.filter(c => c.riskLevel === 'critical' || c.riskLevel === 'high');
    }

    // Apply sorting
    clauses.sort((a, b) => {
      let comparison = 0;
      if (clauseSortBy === 'risk') {
        comparison = riskPriority[b.riskLevel] - riskPriority[a.riskLevel];
      } else if (clauseSortBy === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else {
        comparison = a.position.start - b.position.start;
      }
      return clauseSortDir === 'desc' ? -comparison : comparison;
    });

    return clauses;
  }, [analysis.clauses, clauseSearchQuery, selectedCategories, riskFilter, clauseSortBy, clauseSortDir]);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      // Don't update active section while user is manually scrolling via click
      if (isScrolling) return;

      const sections = [
        'summary',
        'red-flags',
        'clauses',
        ...filteredAndSortedClauses.map((clause) => `clause-${clause.id}`),
        'recommendations',
        'alternatives',
      ];

      const scrollPosition = window.scrollY + 150;

      for (const sectionId of sections) {
        const element = document.getElementById(sectionId);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isScrolling, filteredAndSortedClauses]);

  // Generate contract ID for bookmarks
  const contractId = `${analysis.metadata.fileName}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '_');

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      description: 'Open Contract Map',
      action: () => setShowContractMap(true),
    },
    {
      key: 'm',
      ctrl: true,
      description: 'Toggle Chat',
      action: () => setShowChat(prev => !prev),
    },
    {
      key: 'q',
      ctrl: true,
      description: 'Toggle Analytics',
      action: () => setShowAnalytics(prev => !prev),
    },
    {
      key: 'Escape',
      description: 'Close Overlays',
      action: () => {
        setShowContractMap(false);
        setShowChat(false);
        setShowShareModal(false);
        setShowShortcuts(false);
        setShowExecutiveReport(false);
      },
    },
    {
      key: '/',
      ctrl: true,
      description: 'Show Shortcuts',
      action: () => setShowShortcuts(prev => !prev),
    },
    {
      key: 'b',
      ctrl: true,
      description: 'Toggle Sidebar',
      action: () => setShowTOC(prev => !prev),
    },
    {
      key: '1',
      description: 'Quick View',
      action: () => setViewMode('quick'),
    },
    {
      key: '2',
      description: 'Deep Dive',
      action: () => setViewMode('deep'),
    },
    {
      key: '3',
      description: 'All Risks',
      action: () => setRiskFilter('all'),
    },
    {
      key: '4',
      description: 'Critical Only',
      action: () => setRiskFilter('critical'),
    },
    {
      key: '5',
      description: 'High & Critical',
      action: () => setRiskFilter('high'),
    },
    {
      key: 'f',
      ctrl: true,
      description: 'Search Clauses',
      action: () => {
        const searchInput = document.getElementById('clause-search-input');
        searchInput?.focus();
      },
    },
    {
      key: 'p',
      ctrl: true,
      description: 'Print View',
      action: () => window.print(),
    },
    {
      key: 'ArrowDown',
      ctrl: true,
      description: 'Next Clause',
      action: () => {
        const currentIndex = filteredAndSortedClauses.findIndex(c => `clause-${c.id}` === activeSection);
        if (currentIndex < filteredAndSortedClauses.length - 1) {
          scrollToSection(`clause-${filteredAndSortedClauses[currentIndex + 1].id}`);
        }
      },
    },
    {
      key: 'ArrowUp',
      ctrl: true,
      description: 'Previous Clause',
      action: () => {
        const currentIndex = filteredAndSortedClauses.findIndex(c => `clause-${c.id}` === activeSection);
        if (currentIndex > 0) {
          scrollToSection(`clause-${filteredAndSortedClauses[currentIndex - 1].id}`);
        }
      },
    },
  ]);

  // Calculate reading time estimate (average 200 words per minute)
  const readingTimeMinutes = useMemo(() => {
    const totalText = analysis.clauses.reduce((acc, clause) =>
      acc + clause.originalText + clause.plainLanguage, ''
    );
    const wordCount = totalText.split(/\s+/).length;
    return Math.ceil(wordCount / 200);
  }, [analysis.clauses]);

  // Calculate word count
  const totalWordCount = useMemo(() => {
    const totalText = analysis.clauses.reduce((acc, clause) =>
      acc + clause.originalText, ''
    );
    return totalText.split(/\s+/).length;
  }, [analysis.clauses]);

  // Calculate clause complexity scores
  const clauseComplexity = useMemo(() => {
    return analysis.clauses.map(clause => ({
      id: clause.id,
      score: Math.min(100, Math.round(
        (clause.originalText.split(/\s+/).length / 50) * 30 +
        (clause.concerns.length * 15) +
        (riskPriority[clause.riskLevel] * 10)
      ))
    }));
  }, [analysis.clauses]);
  
  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(analysis.clauses.map(c => c.category));
    return Array.from(cats).sort();
  }, [analysis.clauses]);
  
  // Category statistics
  const categoryStats = useMemo(() => {
    const stats: Record<string, {count: number, critical: number, high: number, medium: number, low: number}> = {};
    analysis.clauses.forEach(clause => {
      if (!stats[clause.category]) {
        stats[clause.category] = {count: 0, critical: 0, high: 0, medium: 0, low: 0};
      }
      stats[clause.category].count++;
      stats[clause.category][clause.riskLevel]++;
    });
    return stats;
  }, [analysis.clauses]);
  

  
  // Group clauses by category
  const groupedClauses = useMemo(() => {
    if (!groupByCategory) return null;
    const grouped: Record<string, typeof analysis.clauses> = {};
    filteredAndSortedClauses.forEach(clause => {
      if (!grouped[clause.category]) {
        grouped[clause.category] = [];
      }
      grouped[clause.category].push(clause);
    });
    return grouped;
  }, [filteredAndSortedClauses, groupByCategory]);
  

  // Toggle sort direction or change sort field
  const handleSort = (field: 'order' | 'risk' | 'title') => {
    if (clauseSortBy === field) {
      setClauseSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setClauseSortBy(field);
      setClauseSortDir('asc');
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: {
            summary: analysis.summary,
            riskScore: analysis.riskScore,
            redFlags: analysis.redFlags.map(f => ({ title: f.title, severity: f.severity })),
            clauses: analysis.clauses.map(c => ({ title: c.title, riskLevel: c.riskLevel, plainLanguage: c.plainLanguage }))
          }
        })
      });

      const data = await response.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          expiresInDays: shareExpiry,
          password: sharePassword || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShareUrl(data.shareUrl);
      }
    } catch (error) {
      console.error('Share error:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast('✓ Link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy error:', error);
      showToast('⚠️ Failed to copy link', 'error');
    }
  };

  const toggleBookmark = (clauseTitle: string) => {
    setBookmarkedClauses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clauseTitle)) {
        newSet.delete(clauseTitle);
        // Remove note too
        setClauseNotes(prevNotes => {
          const newNotes = new Map(prevNotes);
          newNotes.delete(clauseTitle);
          return newNotes;
        });
      } else {
        newSet.add(clauseTitle);
      }
      return newSet;
    });
  };

  const updateClauseNote = (clauseTitle: string, note: string) => {
    setClauseNotes(prev => {
      const newMap = new Map(prev);
      newMap.set(clauseTitle, note);
      return newMap;
    });
  };

  const exportBookmarks = (format: 'json' | 'markdown') => {
    const bookmarkedClausesList = analysis.clauses.filter(c =>
      bookmarkedClauses.has(c.title)
    );

    if (bookmarkedClausesList.length === 0) {
      showToast('⚠️ No bookmarks to export', 'error');
      return;
    }

    try {
      if (format === 'json') {
        const data = {
          contractName: analysis.metadata.fileName,
          exportedAt: new Date().toISOString(),
          bookmarksCount: bookmarkedClausesList.length,
          bookmarks: bookmarkedClausesList.map(c => ({
            title: c.title,
            originalText: c.originalText,
            plainLanguage: c.plainLanguage,
            riskLevel: c.riskLevel,
            note: clauseNotes.get(c.title) || '',
          })),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const timestamp = new Date().toISOString().split('T')[0];
        safeDownload(blob, `bookmarks-${timestamp}-${analysis.metadata.fileName}.json`);
        showToast(`✓ Exported ${bookmarkedClausesList.length} bookmarks as JSON`, 'success');
      } else {
        let markdown = `# Bookmarked Clauses - ${analysis.metadata.fileName}\n\n`;
        markdown += `*Exported: ${new Date().toLocaleString()}*\n\n---\n\n`;

        bookmarkedClausesList.forEach((clause, i) => {
          markdown += `## ${i + 1}. ${clause.title}\n\n`;
          markdown += `**Risk Level:** ${clause.riskLevel.toUpperCase()}\n\n`;
          markdown += `**Original Text:**\n\n${clause.originalText}\n\n`;
          markdown += `**Plain Language:**\n\n${clause.plainLanguage}\n\n`;

          const note = clauseNotes.get(clause.title);
          if (note) {
            markdown += `**My Notes:**\n\n${note}\n\n`;
          }

          markdown += `---\n\n`;
        });

        const blob = new Blob([markdown], { type: 'text/markdown' });
        const timestamp = new Date().toISOString().split('T')[0];
        safeDownload(blob, `bookmarks-${timestamp}-${analysis.metadata.fileName}.md`);
        showToast(`✓ Exported ${bookmarkedClausesList.length} bookmarks as Markdown`, 'success');
      }
    } catch (error) {
      console.error('Bookmark export error:', error);
      showToast('⚠️ Failed to export bookmarks', 'error');
    }
  };

  const generateNegotiationScript = async (clauseTitle: string) => {
    const clause = analysis.clauses.find(c => c.title === clauseTitle);
    if (!clause) return;

    setSelectedClauseForNegotiation(clauseTitle);
    setIsGeneratingScript(true);
    setShowNegotiationModal(true);
    setNegotiationScript(null);

    try {
      const response = await fetch('/api/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clause,
          contractContext: `Contract: ${analysis.metadata.fileName}, Risk Score: ${analysis.riskScore}/100`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.script) {
        setNegotiationScript(data.script);
      } else {
        throw new Error(data.error || 'Invalid response from server');
      }
    } catch (error) {
      console.error('Error generating script:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setNegotiationScript({
        emailTemplate: `⚠️ Error generating negotiation script\n\n${errorMessage}\n\nPlease check your API configuration and try again.`,
        talkingPoints: [],
        strategies: [],
        alternativeLanguage: ''
      });
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Export annotations (highlights and comments) to JSON
  const exportAnnotations = () => {
    const annotationsData = {
      contractName: analysis.metadata.fileName,
      exportedAt: new Date().toISOString(),
      highlights: Array.from(highlightedClauses.entries()).map(([clauseId, color]) => {
        const clause = analysis.clauses.find(c => c.id === clauseId);
        return {
          clauseId,
          clauseTitle: clause?.title || 'Unknown',
          color,
          riskLevel: clause?.riskLevel || 'unknown',
        };
      }),
      comments: Array.from(clauseComments.entries()).map(([clauseId, comments]) => {
        const clause = analysis.clauses.find(c => c.id === clauseId);
        return {
          clauseId,
          clauseTitle: clause?.title || 'Unknown',
          comments: comments.filter(c => c.text.trim()).map(c => ({
            text: c.text,
            timestamp: c.timestamp,
            date: new Date(c.timestamp).toLocaleString(),
          })),
        };
      }).filter(item => item.comments.length > 0),
      summary: {
        totalHighlights: highlightedClauses.size,
        totalComments: Object.values(clauseComments).reduce((sum, comments) => sum + comments.filter((c: {text: string}) => c.text.trim()).length, 0),
      },
    };

    const blob = new Blob([JSON.stringify(annotationsData, null, 2)], { type: 'application/json' });
    const timestamp = new Date().toISOString().split('T')[0];
    safeDownload(blob, `annotations-${timestamp}-${analysis.metadata.fileName}.json`);

    showToast(`✓ Exported ${annotationsData.summary.totalHighlights} highlights and ${annotationsData.summary.totalComments} comments`, 'success');
  };

  const generateFullPlaybook = async () => {
    // Validate there are clauses to negotiate
    const highRiskClauses = analysis.clauses.filter(c => c.riskLevel === 'critical' || c.riskLevel === 'high');
    if (highRiskClauses.length === 0) {
      alert('✓ Good news! This contract has no critical or high-risk clauses.\n\nThe negotiation playbook focuses on the most concerning clauses.');
      return;
    }

    setIsGeneratingPlaybook(true);
    setShowPlaybookModal(true);
    setPlaybookContent('');

    try {
      const response = await fetch('/api/playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.playbook) {
        setPlaybookContent(data.playbook);
      } else {
        throw new Error(data.error || 'Invalid response from server');
      }
    } catch (error) {
      console.error('Error generating playbook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setPlaybookContent(`# ⚠️ Failed to Generate Playbook\n\n**Error:** ${errorMessage}\n\n**Possible causes:**\n- API rate limits reached\n- Network connectivity issues\n- Invalid API key configuration\n\n**Solution:** Please check your .env.local file and try again in a few moments.`);
    } finally {
      setIsGeneratingPlaybook(false);
    }
  };

  const downloadPlaybook = () => {
    try {
      if (!playbookContent) {
        showToast('⚠️ No playbook content to download', 'error');
        return;
      }
      const blob = new Blob([playbookContent], { type: 'text/markdown' });
      const timestamp = new Date().toISOString().split('T')[0];
      safeDownload(blob, `playbook-${timestamp}-${analysis.metadata.fileName}.md`);
      showToast('✓ Playbook downloaded successfully!', 'success');
    } catch (error) {
      console.error('Download error:', error);
      showToast('⚠️ Failed to download playbook', 'error');
    }
  };

  const handleEnhancedExport = async () => {
    try {
      const { exportAsMarkdown, exportAsJSON, exportAsHTML, exportAsDOCX } = await import('@/lib/enhanced-export');

      let content: string = '';
      let mimeType: string = '';
      let extension: string = '';
      let blob: Blob | null = null;

      const fullOptions = { ...exportOptions, format: exportFormat } as any;

      if (exportFormat === 'markdown') {
        content = exportAsMarkdown(analysis, clauseNotes, fullOptions);
        mimeType = 'text/markdown';
        extension = 'md';
        blob = new Blob([content], { type: mimeType });
      } else if (exportFormat === 'json') {
        content = exportAsJSON(analysis, clauseNotes, fullOptions);
        mimeType = 'application/json';
        extension = 'json';
        blob = new Blob([content], { type: mimeType });
      } else if (exportFormat === 'pdf') {
        // Use HTML for PDF export and trigger print
        content = exportAsHTML(analysis, clauseNotes, fullOptions);
        const printWindow = window.open('', '', 'height=800,width=800');
        if (printWindow) {
          printWindow.document.write(content);
          printWindow.document.close();
          // Timeout to ensure resources load before printing
          setTimeout(() => {
            printWindow.print();
          }, 500);
          showToast(`✓ Opened PDF print dialog`, 'success');
          setTimeout(() => setShowExportModal(false), 400);
          return;
        } else {
          // Fallback if popup blocked
          mimeType = 'text/html';
          extension = 'html';
          blob = new Blob([content], { type: mimeType });
        }
      } else if (exportFormat === 'docx') {
        blob = await exportAsDOCX(analysis, clauseNotes, fullOptions);
        extension = 'docx';
      } else {
        content = exportAsHTML(analysis, clauseNotes, fullOptions);
        mimeType = 'text/html';
        extension = 'html';
        blob = new Blob([content], { type: mimeType });
      }

      if (blob) {
        const timestamp = new Date().toISOString().split('T')[0];
        safeDownload(blob, `analysis-${timestamp}-${analysis.metadata.fileName}.${extension}`);
      }

      showToast(`✓ Successfully exported as ${exportFormat.toUpperCase()}`, 'success');
      // Close modal after successful export
      setTimeout(() => setShowExportModal(false), 400);
    } catch (error) {
      console.error('Export error:', error);
      showToast('\u26a0\ufe0f Failed to export analysis', 'error');
    }
  };

  const handleCompareVersions = async () => {
    if (!compareFile) return;

    setIsComparing(true);
    try {
      const formData = new FormData();
      formData.append('file', compareFile);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to analyze comparison file');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let newAnalysis = null;

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'complete') {
                    newAnalysis = data.analysis;
                  } else if (data.type === 'error') {
                    throw new Error(data.message);
                  }
                } catch (e) {
                  // Ignore JSON parse errors for incomplete chunks in SSE
                }
              }
            }
          }
        }
      }

      if (!newAnalysis || !newAnalysis.clauses) {
        throw new Error('Invalid analysis result from server');
      }

      const { compareContracts } = await import('@/lib/version-compare');

      const comparison = compareContracts(analysis, newAnalysis);
      setComparisonResult(comparison);
      showToast('✓ Version comparison complete!', 'success');
    } catch (error) {
      console.error('Comparison error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to compare versions';
      showToast(`⚠️ ${errorMessage}`, 'error');
      setComparisonResult(null);
      setCompareFile(null);
    } finally {
      setIsComparing(false);
    }
  };

  const filteredRedFlags = analysis.redFlags.filter(flag => {
    if (riskFilter === 'all') return true;
    if (riskFilter === 'critical') return flag.severity === 'critical';
    if (riskFilter === 'high') return flag.severity === 'critical' || flag.severity === 'danger';
    return true;
  });

  const filteredClauses = analysis.clauses.filter(clause => {
    if (riskFilter === 'all') return true;
    if (riskFilter === 'critical') return clause.riskLevel === 'critical';
    if (riskFilter === 'high') return clause.riskLevel === 'critical' || clause.riskLevel === 'high';
    return true;
  });

  const criticalCount = analysis.clauses.filter(c => c.riskLevel === 'critical').length;
  const highCount = analysis.clauses.filter(c => c.riskLevel === 'high').length;
  const mediumCount = analysis.clauses.filter(c => c.riskLevel === 'medium').length;

  const getRiskColor = (score: number) => {
    if (score >= 75) return 'text-red-600 bg-red-50 border-red-200';
    if (score >= 50) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (score >= 25) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getRiskLabel = (score: number) => {
    if (score >= 75) return 'High Risk';
    if (score >= 50) return 'Medium-High Risk';
    if (score >= 25) return 'Medium Risk';
    return 'Low Risk';
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-700 bg-red-100 border-red-300';
      case 'high': return 'text-orange-700 bg-orange-100 border-orange-300';
      case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      case 'low': return 'text-green-700 bg-green-100 border-green-300';
      default: return 'text-gray-700 bg-gray-100 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'danger': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'warning': return <Info className="w-5 h-5 text-yellow-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="w-full min-h-screen overflow-x-hidden">
      {/* Main Content Wrapper with Sidebar Spacing */}
      <div className={`transition-all duration-300 ease-in-out ${showTOC ? 'xl:ml-72' : 'xl:ml-0'}`}>
        <div className="space-y-8 animate-fade-in relative">
          {/* Keyboard Shortcuts Modal */}
          {showShortcuts && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowShortcuts(false)}>
              <div className="bg-white border-2 border-stone-900 p-8 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Command className="w-6 h-6 text-stone-900" />
                    <h3 className="text-2xl font-bold text-stone-900">Keyboard Shortcuts</h3>
                  </div>
                  <button onClick={() => setShowShortcuts(false)} className="hover:bg-stone-100 p-2 rounded" aria-label="Close shortcuts">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Open Contract Map</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">Ctrl+K</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Toggle Chat</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">Ctrl+M</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Toggle Sidebar</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">Ctrl+B</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Close Overlays</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">Esc</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Quick View Mode</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">1</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Deep Dive Mode</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">2</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Show All Risks</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">3</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Critical Only</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">4</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-stone-700">High & Critical</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">5</kbd>
                  </div>
                  <div className="border-t border-stone-300 my-2"></div>
                  <div className="flex items-center justify-between py-2 border-b border-stone-200">
                    <span className="text-stone-700">Next Clause</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">Ctrl+↓</kbd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-stone-700">Previous Clause</span>
                    <kbd className="px-3 py-1 bg-stone-100 border border-stone-300 rounded text-sm font-mono">Ctrl+↑</kbd>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Executive Report Modal */}
          {showExecutiveReport && (
            <div className="fixed inset-0 bg-stone-900/50 z-[70] flex justify-center overflow-y-auto" onClick={() => setShowExecutiveReport(false)}>
              <div className="bg-white w-full max-w-4xl min-h-screen p-12 md:p-16 my-8 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setShowExecutiveReport(false)} className="absolute top-8 right-8 hover:bg-stone-100 p-2 rounded-full no-print">
                  <X className="w-6 h-6" />
                </button>
                <button onClick={() => window.print()} className="absolute top-8 right-20 hover:bg-stone-100 p-2 rounded-full no-print">
                  <Printer className="w-6 h-6" />
                </button>

                <div className="mb-12 border-b-4 border-stone-900 pb-8">
                  <p className="font-bold text-stone-500 uppercase tracking-widest mb-2">BeforeYouSign AI</p>
                  <h1 className="text-4xl font-bold text-stone-900 mb-4">Executive Briefing</h1>
                  <p className="text-xl text-stone-600 font-mono">{analysis.metadata.fileName}</p>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-12">
                  <div className="bg-stone-50 p-6 border-l-4 border-stone-900">
                    <h3 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-2">Overall Risk Exposure</h3>
                    <p className={`text-4xl font-bold ${analysis.riskScore >= 70 ? 'text-red-600' : analysis.riskScore >= 40 ? 'text-orange-500' : 'text-green-600'}`}>
                      {analysis.riskScore}/100
                    </p>
                    <p className="text-stone-600 mt-2">{getRiskLabel(analysis.riskScore)}</p>
                  </div>
                  <div className="bg-stone-50 p-6 border-l-4 border-stone-900">
                    <h3 className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-2">Critical Issues</h3>
                    <p className="text-4xl font-bold text-stone-900">{analysis.redFlags.length}</p>
                    <p className="text-stone-600 mt-2">Flagged for immediate review</p>
                  </div>
                </div>

                <div className="mb-12">
                  <h2 className="text-2xl font-bold text-stone-900 mb-4 pb-2 border-b border-stone-200">Executive Summary</h2>
                  <div className="prose max-w-none text-stone-800 text-lg leading-relaxed">
                    {analysis.summary.split('\n').map((paragraph, idx) => (
                      <p key={idx} className="mb-4">{paragraph}</p>
                    ))}
                  </div>
                </div>

                {analysis.redFlags.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold text-stone-900 mb-4 pb-2 border-b border-stone-200">Top Risks & Business Impact</h2>
                    <div className="space-y-6">
                      {analysis.redFlags.slice(0, 5).map((flag, idx) => (
                        <div key={idx} className="bg-red-50 p-6 border-l-4 border-red-500">
                          <h4 className="font-bold text-stone-900 text-lg mb-2">{flag.title}</h4>
                          <p className="text-stone-700 mb-3">{flag.description}</p>
                          <div className="bg-white p-4 border border-red-200">
                            <span className="font-bold text-sm text-stone-500 uppercase tracking-wider mb-1 block">Recommended Action</span>
                            <p className="text-stone-800">{flag.recommendation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.recommendations && analysis.recommendations.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold text-stone-900 mb-4 pb-2 border-b border-stone-200">Strategic Recommendations</h2>
                    <ul className="space-y-4">
                      {analysis.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex gap-4 items-start">
                          <CheckCircle className="w-6 h-6 text-stone-900 shrink-0" />
                          <span className="text-lg text-stone-800">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="text-center pt-12 border-t border-stone-200 mt-16 text-stone-400 text-sm font-mono">
                  Generated by BeforeYouSign AI Analysis Engine • {new Date().toLocaleDateString()}
                </div>
              </div>
            </div>
          )}

          {/* Share Modal */}
          {showShareModal && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
              <div className="bg-white border-2 border-stone-900 p-8 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Share2 className="w-6 h-6 text-stone-900" />
                    <h3 className="text-2xl font-bold text-stone-900">Share Analysis</h3>
                  </div>
                  <button onClick={() => setShowShareModal(false)} className="hover:bg-stone-100 p-2 rounded" aria-label="Close share modal">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {!shareUrl ? (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="share-password" className="block text-sm font-semibold text-stone-700 mb-2">
                        Password Protection (Optional)
                      </label>
                      <input
                        id="share-password"
                        type="password"
                        value={sharePassword}
                        onChange={(e) => setSharePassword(e.target.value)}
                        placeholder="Leave empty for no password"
                        className="w-full px-4 py-2 border-2 border-stone-300 focus:border-stone-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="share-expiry" className="block text-sm font-semibold text-stone-700 mb-2">
                        Link Expires In
                      </label>
                      <select
                        id="share-expiry"
                        value={shareExpiry}
                        onChange={(e) => setShareExpiry(Number(e.target.value))}
                        className="w-full px-4 py-2 border-2 border-stone-300 focus:border-stone-900 focus:outline-none"
                      >
                        <option value={1}>1 day</option>
                        <option value={3}>3 days</option>
                        <option value={7}>7 days</option>
                        <option value={14}>14 days</option>
                        <option value={30}>30 days</option>
                      </select>
                    </div>

                    <button
                      onClick={handleShare}
                      disabled={isSharing}
                      className="w-full bg-stone-900 text-white py-3 font-semibold hover:bg-stone-800 disabled:bg-stone-400 transition-colors"
                    >
                      {isSharing ? 'Creating Link...' : 'Generate Share Link'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-stone-50 p-4 border-2 border-stone-200 rounded">
                      <label htmlFor="share-url-display" className="block text-xs text-stone-500 uppercase tracking-wider mb-2">Share Link</label>
                      <div className="flex items-center gap-2">
                        <input
                          id="share-url-display"
                          type="text"
                          value={shareUrl}
                          readOnly
                          aria-label="Shareable link URL"
                          className="flex-1 px-3 py-2 bg-white border border-stone-300 text-sm font-mono"
                        />
                        <button
                          onClick={copyToClipboard}
                          className="px-4 py-2 bg-stone-900 text-white hover:bg-stone-800 transition-colors flex items-center gap-2"
                          aria-label="Copy link to clipboard"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 p-4 rounded">
                      <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900">
                          <p className="font-semibold mb-1">Link expires in {shareExpiry} day{shareExpiry > 1 ? 's' : ''}</p>
                          {sharePassword && <p>Password protection is enabled</p>}
                          <p className="mt-2">Anyone with this link can view the analysis.</p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setShareUrl('');
                        setSharePassword('');
                      }}
                      className="w-full border-2 border-stone-300 text-stone-900 py-3 font-semibold hover:border-stone-900 transition-colors"
                    >
                      Create Another Link
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bookmarks Modal */}
          {showBookmarks && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowBookmarks(false)}>
              <div className="bg-white border-2 border-stone-900 p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <BookmarkCheck className="w-6 h-6 text-stone-900" />
                    <h3 className="text-2xl font-bold text-stone-900">Bookmarked Clauses ({bookmarkedClauses.size})</h3>
                  </div>
                  <button onClick={() => setShowBookmarks(false)} className="hover:bg-stone-100 p-2 rounded" aria-label="Close bookmarks">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {bookmarkedClauses.size === 0 ? (
                  <div className="text-center py-12">
                    <Bookmark className="w-16 h-16 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 font-medium mb-2">No bookmarks yet</p>
                    <p className="text-sm text-stone-400">Click the bookmark icon on any clause to save it here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {analysis.clauses.filter(c => bookmarkedClauses.has(c.title)).map((clause) => (
                      <div key={clause.title} className="border-2 border-stone-200 p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-bold text-stone-900">{clause.title}</h4>
                          <span className={`text-xs px-2 py-1 rounded ${clause.riskLevel === 'critical' ? 'bg-red-100 text-red-800' :
                            clause.riskLevel === 'high' ? 'bg-orange-100 text-orange-800' :
                              clause.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                            }`}>
                            {clause.riskLevel.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-stone-600 mb-3">{clause.plainLanguage}</p>
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-stone-700">My Notes:</label>
                          <textarea
                            value={clauseNotes.get(clause.title) || ''}
                            onChange={(e) => updateClauseNote(clause.title, e.target.value)}
                            placeholder="Add your notes here..."
                            className="w-full px-3 py-2 border border-stone-300 text-sm focus:border-stone-900 focus:outline-none"
                            rows={3}
                          />
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-3 pt-4 border-t-2 border-stone-200">
                      <button
                        onClick={() => exportBookmarks('json')}
                        className="flex-1 bg-stone-900 text-white py-3 font-semibold hover:bg-stone-800 transition-colors"
                      >
                        Export as JSON
                      </button>
                      <button
                        onClick={() => exportBookmarks('markdown')}
                        className="flex-1 border-2 border-stone-900 text-stone-900 py-3 font-semibold hover:bg-stone-900 hover:text-white transition-colors"
                      >
                        Export as Markdown
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Negotiation Script Modal */}
          {showNegotiationModal && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowNegotiationModal(false)}>
              <div className="bg-white border-2 border-stone-900 p-8 max-w-3xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-6 h-6 text-stone-900" />
                    <h3 className="text-2xl font-bold text-stone-900">Negotiation Script</h3>
                  </div>
                  <button onClick={() => setShowNegotiationModal(false)} className="hover:bg-stone-100 p-2 rounded" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {isGeneratingScript ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 text-stone-400 animate-spin mx-auto mb-4" />
                    <p className="text-stone-500 font-medium">Generating negotiation strategy...</p>
                    <p className="text-sm text-stone-400 mt-2">This may take 10-15 seconds</p>
                  </div>
                ) : negotiationScript ? (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 p-4 rounded">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-5 h-5 text-indigo-600" />
                        <span className="font-bold text-indigo-900">Priority: {negotiationScript.priorityLevel}</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="flex items-center gap-2 text-lg font-bold text-stone-900 mb-3">
                        <Mail className="w-5 h-5" />
                        Email Template
                      </h4>
                      <div className="bg-stone-50 border border-stone-300 p-4 rounded">
                        <pre className="whitespace-pre-wrap text-sm text-stone-700 font-sans">{negotiationScript.emailTemplate}</pre>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(negotiationScript.emailTemplate);
                        }}
                        className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        Copy Email Template
                      </button>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-stone-900 mb-3">💬 Talking Points</h4>
                      <ul className="space-y-2">
                        {negotiationScript.talkingPoints.map((point: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-stone-700">
                            <span className="font-bold text-indigo-600">{i + 1}.</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-stone-900 mb-3">🎯 Negotiation Strategies</h4>
                      <ul className="space-y-2">
                        {negotiationScript.negotiationStrategies.map((strategy: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-stone-700">
                            <span className="font-bold text-purple-600">•</span>
                            <span>{strategy}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-stone-900 mb-3">✏️ Suggested Alternative Language</h4>
                      <div className="bg-green-50 border border-green-300 p-4 rounded">
                        <p className="text-sm text-stone-700 whitespace-pre-wrap">{negotiationScript.alternativeLanguage}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const fullContent = `# Negotiation Script\n\nPriority: ${negotiationScript.priorityLevel}\n\n## Email Template\n\n${negotiationScript.emailTemplate}\n\n## Talking Points\n\n${negotiationScript.talkingPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n## Strategies\n\n${negotiationScript.negotiationStrategies.map((s: string) => `- ${s}`).join('\n')}\n\n## Alternative Language\n\n${negotiationScript.alternativeLanguage}`;
                        const blob = new Blob([fullContent], { type: 'text/markdown' });
                        safeDownload(blob, `negotiation-${selectedClauseForNegotiation?.replace(/[^a-zA-Z0-9]/g, '-')}.md`);}}
                      className="w-full bg-stone-900 text-white py-3 font-semibold hover:bg-stone-800 transition-colors"
                    >
                      Download Script
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <XCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
                    <p className="text-stone-500 font-medium">Failed to generate script</p>
                    <p className="text-sm text-stone-400 mt-2">Please try again</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Negotiation Playbook Modal */}
          {showPlaybookModal && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowPlaybookModal(false)}>
              <div className="bg-white border-2 border-stone-900 p-8 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-6 h-6 text-stone-900" />
                    <h3 className="text-2xl font-bold text-stone-900">Complete Negotiation Playbook</h3>
                  </div>
                  <button onClick={() => setShowPlaybookModal(false)} className="hover:bg-stone-100 p-2 rounded" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {isGeneratingPlaybook ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 text-stone-400 animate-spin mx-auto mb-4" />
                    <p className="text-stone-500 font-medium">Generating comprehensive playbook...</p>
                    <p className="text-sm text-stone-400 mt-2">This may take 30-60 seconds for critical clauses</p>
                  </div>
                ) : playbookContent ? (
                  <div className="space-y-4">
                    <div className="bg-stone-50 border border-stone-300 p-6 rounded max-h-[50vh] overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-stone-700 font-sans">{playbookContent}</pre>
                    </div>
                    <button
                      onClick={downloadPlaybook}
                      className="w-full bg-stone-900 text-white py-3 font-semibold hover:bg-stone-800 transition-colors"
                    >
                      Download Playbook
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <XCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
                    <p className="text-stone-500 font-medium">Failed to generate playbook</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Enhanced Export Modal */}
          {showExportModal && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
              <div className="bg-white border-2 border-stone-900 p-8 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Download className="w-6 h-6 text-stone-900" />
                    <h3 className="text-2xl font-bold text-stone-900">Enhanced Export</h3>
                  </div>
                  <button onClick={() => setShowExportModal(false)} className="hover:bg-stone-100 p-2 rounded" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-3">Export Format</label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                      <button
                        onClick={() => setExportFormat('pdf')}
                        className={`py-3 px-2 text-sm md:px-4 border-2 font-semibold transition-colors ${exportFormat === 'pdf'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        📄 PDF
                      </button>
                      <button
                        onClick={() => setExportFormat('docx')}
                        className={`py-3 px-2 text-sm md:px-4 border-2 font-semibold transition-colors ${exportFormat === 'docx'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        📝 DOCX
                      </button>
                      <button
                        onClick={() => setExportFormat('markdown')}
                        className={`py-3 px-2 text-sm md:px-4 border-2 font-semibold transition-colors ${exportFormat === 'markdown'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        📝 MD
                      </button>
                      <button
                        onClick={() => setExportFormat('json')}
                        className={`py-3 px-2 text-sm md:px-4 border-2 font-semibold transition-colors ${exportFormat === 'json'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        📊 JSON
                      </button>
                      <button
                        onClick={() => setExportFormat('html')}
                        className={`py-3 px-2 text-sm md:px-4 border-2 font-semibold transition-colors ${exportFormat === 'html'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        🌐 HTML
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-3">Content Options</label>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-3 border border-stone-300 rounded hover:bg-stone-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.includeBookmarks}
                          onChange={(e) => setExportOptions(prev => ({ ...prev, includeBookmarks: e.target.checked }))}
                          className="w-5 h-5"
                        />
                        <div>
                          <div className="font-semibold text-stone-900">Include Bookmarks</div>
                          <div className="text-sm text-stone-600">Highlight bookmarked clauses in export</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 border border-stone-300 rounded hover:bg-stone-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.includeNotes}
                          onChange={(e) => setExportOptions(prev => ({ ...prev, includeNotes: e.target.checked }))}
                          className="w-5 h-5"
                        />
                        <div>
                          <div className="font-semibold text-stone-900">Include Notes</div>
                          <div className="text-sm text-stone-600">Add your personal notes to clauses</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-3">Clause Filter</label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setExportOptions(prev => ({ ...prev, clauseFilter: 'all' }))}
                        className={`py-3 px-4 border-2 font-semibold text-sm transition-colors ${exportOptions.clauseFilter === 'all'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        All Clauses
                      </button>
                      <button
                        onClick={() => setExportOptions(prev => ({ ...prev, clauseFilter: 'bookmarked' }))}
                        className={`py-3 px-4 border-2 font-semibold text-sm transition-colors ${exportOptions.clauseFilter === 'bookmarked'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        Bookmarked
                      </button>
                      <button
                        onClick={() => setExportOptions(prev => ({ ...prev, clauseFilter: 'high-risk' }))}
                        className={`py-3 px-4 border-2 font-semibold text-sm transition-colors ${exportOptions.clauseFilter === 'high-risk'
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                          }`}
                      >
                        High Risk
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      handleEnhancedExport();
                      setShowExportModal(false);
                    }}
                    className="w-full bg-stone-900 text-white py-4 font-bold text-lg hover:bg-stone-800 transition-colors"
                  >
                    Export as {exportFormat.toUpperCase()}
                  </button>

                  <p className="text-xs text-stone-500 text-center">
                    {exportFormat === 'pdf' && 'Professional PDF report with AI recommendations - ready to print or share'}
                    {exportFormat === 'markdown' && 'Perfect for documentation and sharing with teams'}
                    {exportFormat === 'json' && 'Machine-readable format for integration and backup'}
                    {exportFormat === 'html' && 'Styled report ready for viewing in any browser'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Floating Action Buttons */}
          <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-3">
            <button
              onClick={() => setShowChat(!showChat)}
              className="group bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-700 transition-all duration-300 hover:scale-110 relative"
              title="Ask questions about this contract (Ctrl+M)"
            >
              <MessageSquare className="w-6 h-6" />
              {chatMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {chatMessages.length}
                </span>
              )}
              <kbd className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                M
              </kbd>
            </button>
            <button
              onClick={() => setShowContractMap(!showContractMap)}
              className="group bg-purple-600 text-white p-4 rounded-full shadow-2xl hover:bg-purple-700 transition-all duration-300 hover:scale-110 relative"
              title="View Contract Map (Ctrl+K)"
            >
              <Sparkles className="w-6 h-6" />
              <kbd className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                K
              </kbd>
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              className="group bg-stone-700 text-white p-4 rounded-full shadow-2xl hover:bg-stone-800 transition-all duration-300 hover:scale-110 relative"
              title="Keyboard Shortcuts (Ctrl+/)"
            >
              <HelpCircle className="w-6 h-6" />
              <kbd className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                ?
              </kbd>
            </button>
            <button
              onClick={() => setShowBookmarks(true)}
              className="group bg-amber-600 text-white p-4 rounded-full shadow-2xl hover:bg-amber-700 transition-all duration-300 hover:scale-110 relative"
              title="View Bookmarks (B)"
            >
              <BookmarkCheck className="w-6 h-6" />
              {bookmarkedClauses.size > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {bookmarkedClauses.size}
                </span>
              )}
              <kbd className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                B
              </kbd>
            </button>
          </div>

          {/* AI Chat Sidebar */}
          {showChat && (
            <div className="fixed inset-y-0 right-0 w-[450px] bg-white border-l-2 border-stone-900 shadow-2xl z-40 flex flex-col animate-slide-in">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-1">Contract Assistant</h3>
                  <p className="text-indigo-100 text-sm">Ask anything about this contract</p>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="hover:bg-white/20 p-2 rounded-full transition-colors"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-50">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-16 h-16 text-stone-300 mx-auto mb-4" />
                    <p className="text-stone-500 font-medium mb-2">No messages yet</p>
                    <p className="text-sm text-stone-400 px-4">Try asking:<br />"What are my biggest risks?"<br />"Explain the termination clause"</p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-stone-200 text-stone-800'
                        }`}>
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce bounce-delay-0"></div>
                        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce bounce-delay-150"></div>
                        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce bounce-delay-300"></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleChatSubmit} className="p-4 border-t border-stone-200 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about clauses, risks, or alternatives..."
                    className="flex-1 px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !chatInput.trim()}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Interactive Contract Map Overlay */}
          {showContractMap && (
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50 overflow-auto">
              <button
                onClick={() => setShowContractMap(false)}
                className="absolute top-6 right-6 text-white/80 hover:text-white p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all z-10"
                aria-label="Close contract map"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="max-w-7xl mx-auto p-12">
                <div className="text-center mb-12">
                  <h2 className="text-5xl font-bold text-white mb-4">Contract Intelligence Map</h2>
                  <p className="text-purple-200 text-lg">Click any node to navigate to that section</p>
                </div>

                <div className="grid grid-cols-3 gap-8 mb-12">
                  {/* Risk Score Card */}
                  <div
                    onClick={() => scrollToSection('summary')}
                    className="bg-gradient-to-br from-indigo-500 to-purple-600 p-8 rounded-2xl cursor-pointer hover:scale-105 transition-transform duration-300 shadow-2xl"
                  >
                    <div className="text-white/80 text-sm uppercase tracking-wider mb-2">Overall Risk</div>
                    <div className="text-6xl font-bold text-white mb-2">{analysis.riskScore}</div>
                    <div className="text-purple-100">{getRiskLabel(analysis.riskScore)}</div>
                  </div>

                  {/* Red Flags Card */}
                  <div
                    onClick={() => scrollToSection('red-flags')}
                    className="bg-gradient-to-br from-red-500 to-orange-600 p-8 rounded-2xl cursor-pointer hover:scale-105 transition-transform duration-300 shadow-2xl"
                  >
                    <div className="text-white/80 text-sm uppercase tracking-wider mb-2">Critical Issues</div>
                    <div className="text-6xl font-bold text-white mb-2">{analysis.redFlags.length}</div>
                    <div className="text-red-100">Flagged for Review</div>
                  </div>

                  {/* Clauses Card */}
                  <div
                    onClick={() => scrollToSection('clauses')}
                    className="bg-gradient-to-br from-blue-500 to-cyan-600 p-8 rounded-2xl cursor-pointer hover:scale-105 transition-transform duration-300 shadow-2xl"
                  >
                    <div className="text-white/80 text-sm uppercase tracking-wider mb-2">Provisions</div>
                    <div className="text-6xl font-bold text-white mb-2">{analysis.clauses.length}</div>
                    <div className="text-blue-100">Clauses Analyzed</div>
                  </div>
                </div>

                {/* Risk Breakdown */}
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
                  <h3 className="text-2xl font-bold text-white mb-6">Risk Distribution</h3>
                  <div className="grid grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-red-400 mb-2">{criticalCount}</div>
                      <div className="text-white/70 text-sm uppercase tracking-wider">Critical</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-orange-400 mb-2">{highCount}</div>
                      <div className="text-white/70 text-sm uppercase tracking-wider">High</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-yellow-400 mb-2">{mediumCount}</div>
                      <div className="text-white/70 text-sm uppercase tracking-wider">Medium</div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-green-400 mb-2">{analysis.clauses.length - criticalCount - highCount - mediumCount}</div>
                      <div className="text-white/70 text-sm uppercase tracking-wider">Low</div>
                    </div>
                  </div>
                </div>

                {/* Clause Categories */}
                <div className="mt-8 grid grid-cols-2 gap-6">
                  {analysis.redFlags.map((flag, idx) => (
                    <div
                      key={flag.id}
                      onClick={() => scrollToSection('red-flags')}
                      className="bg-gradient-to-br from-red-500/20 to-orange-500/20 backdrop-blur-lg border border-red-500/30 p-6 rounded-xl cursor-pointer hover:scale-105 transition-transform duration-300"
                    >
                      <div className="flex items-start gap-4">
                        <div className="bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <h4 className="text-white font-bold mb-1">{flag.title}</h4>
                          <p className="text-red-200 text-sm">{flag.severity.toUpperCase()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sticky Table of Contents Sidebar */}
          <div className={`fixed left-0 top-32 h-[calc(100vh-8rem)] w-72 bg-gradient-to-b from-stone-50 to-white border-r-2 border-stone-200 shadow-xl z-40 transition-transform duration-300 ease-in-out ${showTOC ? 'translate-x-0' : '-translate-x-full'
            } hidden xl:block`}>
            <div className="h-full flex flex-col">
              {/* Header */}
              <div className="p-6 border-b-2 border-stone-200 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-stone-900 rounded-lg">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-stone-900 text-lg">Contents</h3>
                      <p className="text-xs text-stone-500">Quick Navigation</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Navigation */}
              <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                <button
                  onClick={() => scrollToSection('summary')}
                  className={`group w-full text-left px-4 py-3 rounded-lg transition-colors duration-150 ${activeSection === 'summary'
                    ? 'bg-stone-900 text-white'
                    : 'hover:bg-stone-100 text-stone-700'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full transition-colors duration-150 ${activeSection === 'summary' ? 'bg-white' : 'bg-stone-400 group-hover:bg-stone-600'}`} />
                    <span className="text-sm font-medium">Executive Summary</span>
                  </div>
                </button>

                <button
                  onClick={() => scrollToSection('red-flags')}
                  className={`group w-full text-left px-4 py-3 rounded-lg transition-colors duration-150 ${activeSection === 'red-flags'
                    ? 'bg-stone-900 text-white'
                    : 'hover:bg-red-50 text-stone-700'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full transition-colors duration-150 ${activeSection === 'red-flags' ? 'bg-white' : 'bg-red-400 group-hover:bg-red-500'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Red Flags</div>
                      <div className={`text-xs transition-colors duration-150 ${activeSection === 'red-flags' ? 'text-red-200' : 'text-stone-500'}`}>
                        {analysis.redFlags.length} critical issues
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => scrollToSection('clauses')}
                  className={`group w-full text-left px-4 py-3 rounded-lg transition-colors duration-150 ${activeSection === 'clauses'
                    ? 'bg-stone-900 text-white'
                    : 'hover:bg-blue-50 text-stone-700'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full transition-colors duration-150 ${activeSection === 'clauses' ? 'bg-white' : 'bg-blue-400 group-hover:bg-blue-500'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">All Clauses</div>
                      <div className={`text-xs transition-colors duration-150 ${activeSection === 'clauses' ? 'text-blue-200' : 'text-stone-500'}`}>
                        {analysis.clauses.length} provisions
                      </div>
                    </div>
                  </div>
                </button>

                {/* Nested Clause Items */}
                <div className="pl-8 space-y-1 mt-2 mb-2 border-l-2 border-stone-200 ml-4">
                  {(showAllClauses ? filteredAndSortedClauses : filteredAndSortedClauses.slice(0, 8)).map((clause) => (
                    <button
                      key={clause.id}
                      onClick={() => {
                        scrollToSection(`clause-${clause.id}`);
                      }}
                      className={`w-full text-left px-3 py-2.5 text-xs rounded-md transition-all duration-200 ${activeSection === `clause-${clause.id}`
                        ? 'bg-stone-800 text-white font-semibold shadow-sm'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 hover:pl-4'
                        }`}
                      title={clause.title}
                    >
                      <span className="opacity-60 mr-2">└</span>
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${clause.riskLevel === 'critical' ? 'bg-red-500' :
                        clause.riskLevel === 'high' ? 'bg-orange-500' :
                        clause.riskLevel === 'medium' ? 'bg-yellow-500' :
                        'bg-green-500'}`}></span>
                      {clause.title.length > 35 ? clause.title.substring(0, 35) + '...' : clause.title}
                    </button>
                  ))}
                  {filteredAndSortedClauses.length > 8 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllClauses(!showAllClauses);
                      }}
                      className="w-full text-left px-3 py-2.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-all duration-200 font-semibold hover:pl-4"
                    >
                      {showAllClauses ? '▲ Show Less' : `▼ Show ${filteredAndSortedClauses.length - 8} More Clauses`}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => scrollToSection('recommendations')}
                  className={`group w-full text-left px-4 py-3 rounded-lg transition-colors duration-150 ${activeSection === 'recommendations'
                    ? 'bg-stone-900 text-white'
                    : 'hover:bg-green-50 text-stone-700'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full transition-colors duration-150 ${activeSection === 'recommendations' ? 'bg-white' : 'bg-green-400 group-hover:bg-green-500'}`} />
                    <span className="text-sm font-medium">Recommendations</span>
                  </div>
                </button>

                <button
                  onClick={() => scrollToSection('alternatives')}
                  className={`group w-full text-left px-4 py-3 rounded-lg transition-colors duration-150 ${activeSection === 'alternatives'
                    ? 'bg-stone-900 text-white'
                    : 'hover:bg-purple-50 text-stone-700'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full transition-colors duration-150 ${activeSection === 'alternatives' ? 'bg-white' : 'bg-purple-400 group-hover:bg-purple-500'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Fair Alternatives</div>
                      <div className={`text-xs transition-colors duration-150 ${activeSection === 'alternatives' ? 'text-purple-200' : 'text-stone-500'}`}>
                        {clauseAlternatives.length} community options
                      </div>
                    </div>
                  </div>
                </button>
              </nav>

              {/* Footer with Toggle */}
              <div className="p-4 border-t-2 border-stone-200 bg-white">
                <button
                  onClick={() => setShowTOC(false)}
                  className="w-full px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Hide Sidebar
                </button>
              </div>
            </div>
          </div>

          {/* TOC Toggle Button (when hidden) - Now a tab on the edge */}
          {!showTOC && (
            <button
              onClick={() => setShowTOC(true)}
              className="fixed left-0 top-[calc(50%+4rem)] -translate-y-1/2 bg-stone-900 text-white px-2 py-6 rounded-r-lg shadow-2xl z-40 hover:bg-stone-800 transition-all hover:px-3 hidden xl:flex flex-col items-center gap-2 group"
              aria-label="Show table of contents"
            >
              <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-xs writing-mode-vertical transform rotate-180 font-semibold tracking-wider">CONTENTS</span>
            </button>
          )}

          {/* View Mode Toggle & Filters */}
          <div className="bg-white border-2 border-stone-900 p-4 md:p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <span className="text-sm font-semibold text-stone-600 uppercase tracking-wider">View Mode:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setViewMode('quick')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'quick'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                >
                  <Eye className="w-4 h-4 inline mr-2" />
                  Quick View
                </button>
                <button
                  onClick={() => setViewMode('deep')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'deep'
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                >
                  <EyeOff className="w-4 h-4 inline mr-2" />
                  Deep Dive
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <span className="text-sm font-semibold text-stone-600 uppercase tracking-wider">
                <Filter className="w-4 h-4 inline mr-2" />
                Risk Filter:
              </span>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as 'all' | 'critical' | 'high')}
                className="px-4 py-2 border-2 border-stone-300 bg-white text-stone-900 font-medium focus:outline-none focus:border-stone-900"
                aria-label="Filter by risk level"
              >
                <option value="all">All Risks</option>
                <option value="critical">Critical Only</option>
                <option value="high">High & Critical</option>
              </select>
            </div>
          </div>

          {/* Header with Risk Score */}
          <div id="summary" className="bg-white border-2 border-stone-900 p-6 md:p-10">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between mb-10 pb-8 border-b border-stone-200">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px w-8 bg-stone-900"></div>
                  <span className="mono text-xs text-stone-500 tracking-wider uppercase">Analysis Report</span>
                </div>
                <h2 className="text-3xl sm:text-4xl xl:text-5xl font-bold text-stone-900 mb-3">Executive Analysis</h2>
                <p className="text-sm text-stone-500 mono tracking-wide">{analysis.metadata.fileName}</p>
              </div>
              <div className="flex flex-wrap gap-2 md:gap-3 no-print xl:justify-end">
                <button
                  onClick={() => setShowCompareModal(true)}
                  className="group flex items-center gap-2 px-5 py-3 border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition-all duration-200"
                  title="Compare with another version"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span className="font-medium">Compare Versions</span>
                </button>
                <button
                  onClick={generateFullPlaybook}
                  className="group flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all duration-300"
                  title="Generate negotiation playbook for all critical clauses"
                >
                  <Briefcase className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  <span>Negotiation Playbook</span>
                </button>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="group flex items-center gap-2 px-6 py-3 border-2 border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white transition-all duration-300"
                  title="Share this analysis"
                >
                  <Share2 className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  <span>Share</span>
                </button>
                <button
                  onClick={() => setShowExecutiveReport(true)}
                  className="group flex items-center gap-2 px-6 py-3 border-2 border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white transition-all duration-300"
                  title="View Executive Report"
                >
                  <FileText className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  <span>Executive Report</span>
                </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="group flex items-center gap-2 px-6 py-3 bg-stone-900 text-white hover:bg-stone-800 transition-all duration-300"
                  title="Enhanced export with annotations"
                >
                  <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="metric-box p-8 group">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Risk Assessment</p>
                  <span className="mono text-xs text-stone-400">01</span>
                </div>
                <p className="text-6xl font-bold text-stone-900 mb-2 tabular-nums">{analysis.riskScore}</p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${analysis.riskScore >= 75 ? 'bg-stone-900' :
                    analysis.riskScore >= 50 ? 'bg-stone-700' :
                      analysis.riskScore >= 25 ? 'bg-stone-500' :
                        'bg-stone-300'
                    }`}></div>
                  <p className="text-sm text-stone-600 font-medium">{getRiskLabel(analysis.riskScore)}</p>
                </div>
              </div>
              <div className="metric-box p-8 group">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Critical Issues</p>
                  <span className="mono text-xs text-stone-400">02</span>
                </div>
                <p className="text-6xl font-bold text-stone-900 mb-2 tabular-nums">{analysis.redFlags.length}</p>
                <p className="text-sm text-stone-600 font-medium">Flagged for Review</p>
              </div>
              <div className="metric-box p-8 group">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Provisions</p>
                  <span className="mono text-xs text-stone-400">03</span>
                </div>
                <p className="text-6xl font-bold text-stone-900 mb-2 tabular-nums">{analysis.clauses.length}</p>
                <p className="text-sm text-stone-600 font-medium">Clauses Analyzed</p>
              </div>
            </div>

            {/* AI Confidence & Transparency */}
            {analysis.confidence && (
              <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 p-6 rounded-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Analysis Confidence & Transparency</h4>
                    </div>
                    <p className="text-sm text-indigo-700">
                      Last updated {new Date(analysis.confidence.analysisDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-indigo-900 mb-1">{analysis.confidence.overall}%</div>
                    <div className="text-xs text-indigo-600 uppercase tracking-wider">Overall Confidence</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white/60 p-4 rounded">
                    <div className="text-xs text-indigo-600 uppercase tracking-wider mb-1">Risk Score Accuracy</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-indigo-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 transition-all duration-500 confidence-bar" data-width={analysis.confidence.riskScoreConfidence}></div>
                      </div>
                      <span className="text-sm font-bold text-indigo-900">{analysis.confidence.riskScoreConfidence}%</span>
                    </div>
                  </div>
                  <div className="bg-white/60 p-4 rounded">
                    <div className="text-xs text-indigo-600 uppercase tracking-wider mb-1">Clause Analysis Accuracy</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-indigo-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 transition-all duration-500 confidence-bar" data-width={analysis.confidence.clauseAnalysisConfidence}></div>
                      </div>
                      <span className="text-sm font-bold text-indigo-900">{analysis.confidence.clauseAnalysisConfidence}%</span>
                    </div>
                  </div>
                </div>

                {analysis.confidence.notes && analysis.confidence.notes.length > 0 && (
                  <div className="border-t border-indigo-200 pt-4">
                    <p className="text-xs text-indigo-700 uppercase tracking-wider font-bold mb-2">Analysis Notes</p>
                    <ul className="space-y-1">
                      {analysis.confidence.notes.map((note, idx) => (
                        <li key={idx} className="text-sm text-indigo-800 flex items-start gap-2">
                          <span className="text-indigo-400 mt-1">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Smart Contract Insights */}
            {(() => {
              let financial = 0, termination = 0, liability = 0, compliance = 0;
              analysis.clauses.forEach(c => {
                const text = (c.title + ' ' + (c.originalText || '') + ' ' + (c.plainLanguage || '')).toLowerCase();
                const weight = c.riskLevel === 'critical' ? 3 : c.riskLevel === 'high' ? 2 : c.riskLevel === 'medium' ? 1 : 0.5;
                if (text.match(/payment|fee|financ|penalty|interest|money/)) financial += weight;
                if (text.match(/terminat|cancel|expire/)) termination += weight;
                if (text.match(/liab|indemn|warrant|damage/)) liability += weight;
                if (text.match(/compl|law|regul|jurisdict|govern/)) compliance += weight;
              });
              const getLevel = (score: number) => score >= 5 ? 'High' : score >= 2 ? 'Medium' : 'Low';
              
              const insights = [
                { label: 'Financial Risk', level: getLevel(financial) },
                { label: 'Termination Risk', level: getLevel(termination) },
                { label: 'Liability Risk', level: getLevel(liability) },
                { label: 'Compliance Risk', level: getLevel(compliance) },
                { label: 'Negotiation Priority', level: analysis.riskScore > 70 ? 'High' : analysis.riskScore > 40 ? 'Medium' : 'Low' },
              ];

              return (
                <div className="mb-6 bg-white border border-stone-200 p-6 shadow-sm rounded-lg">
                  <div className="flex items-center gap-3 mb-6">
                    <Lightbulb className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">Smart Contract Insights</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {insights.map((insight, idx) => (
                      <div key={idx} className="bg-stone-50 border border-stone-100 p-4 rounded text-center group hover:bg-white hover:border-indigo-200 hover:shadow-md transition-all duration-300">
                        <div className="text-[10px] text-stone-500 uppercase tracking-wider mb-2 font-bold">{insight.label}</div>
                        <div className={`text-lg font-bold ${insight.level === 'High' ? 'text-red-600' : insight.level === 'Medium' ? 'text-amber-600' : 'text-green-600'}`}>
                          {insight.level}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="border-l-2 border-stone-900 pl-8 bg-stone-50/50 p-6 -mx-2">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">Executive Summary</h3>
                <div className="h-px flex-1 bg-stone-200"></div>
              </div>
              <p className="text-stone-700 leading-relaxed text-lg font-light">{analysis.summary}</p>
            </div>
          </div>

          {/* Red Flags Section */}
          {filteredRedFlags.length > 0 && (
            <div id="red-flags" className="bg-white border-2 border-stone-900 p-10">
              <div className="mb-8 pb-6 border-b border-stone-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px w-8 bg-stone-900"></div>
                  <span className="mono text-xs text-stone-500 tracking-wider uppercase">Risk Assessment</span>
                </div>
                <h3 className="text-4xl font-bold text-stone-900">
                  Material Risk Factors
                </h3>
              </div>
              <div className="space-y-8">
                {filteredRedFlags.slice(0, viewMode === 'quick' ? 3 : undefined).map((flag, index) => (
                  <div
                    key={flag.id}
                    className="group border-l-2 border-stone-900 pl-8 py-3 hover:border-l-4 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-3">
                          <span className="mono text-sm text-stone-400 font-medium">{String(index + 1).padStart(2, '0')}</span>
                          <h4 className="text-2xl font-bold text-stone-900 group-hover:text-stone-700 transition-colors">{flag.title}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-3 py-1.5 uppercase font-semibold tracking-wider ${flag.severity === 'critical' ? 'bg-stone-900 text-white' :
                            flag.severity === 'danger' ? 'bg-stone-700 text-white' :
                              'bg-stone-300 text-stone-900'
                            }`}>
                            {flag.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-stone-700 leading-relaxed text-lg mb-6">{flag.description}</p>
                    <div className="bg-gradient-to-br from-stone-50 to-stone-100/50 border border-stone-200 p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-1 rounded-full bg-stone-900"></div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Recommended Action</p>
                      </div>
                      <p className="text-stone-800 leading-relaxed">{flag.recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clauses Section */}
          <div id="clauses" className="bg-white border-2 border-stone-900 p-8 print:border print:p-4">
            <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-stone-200">
              <div>
                <h3 className="text-3xl font-bold text-stone-900">
                  Detailed Provision Analysis
                </h3>
                {/* Reading time & word count */}
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5 text-stone-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">{readingTimeMinutes} min read</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-stone-500">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">{totalWordCount.toLocaleString()} words</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 print:hidden">
                {/* Export Annotations - NEW */}
                {(highlightedClauses.size > 0 || clauseComments.size > 0 || bookmarkedClauses.size > 0) && (
                  <button
                    onClick={() => {
                      const exportData = {
                        contractName: analysis.metadata.fileName,
                        exportedAt: new Date().toISOString(),
                        summary: {
                          highlights: highlightedClauses.size,
                          comments: Array.from(clauseComments.values()).reduce((sum, comments) => sum + comments.filter(c => c.text.trim()).length, 0),
                          bookmarks: bookmarkedClauses.size,
                        },
                        annotations: filteredAndSortedClauses.map(clause => {
                          const hasAnnotations = highlightedClauses.has(clause.id) || clauseComments.has(clause.id) || bookmarkedClauses.has(clause.title);
                          if (!hasAnnotations) return null;
                          
                          return {
                            clauseId: clause.id,
                            clauseTitle: clause.title,
                            riskLevel: clause.riskLevel,
                            highlight: highlightedClauses.get(clause.id) || null,
                            comments: (clauseComments.get(clause.id) || []).filter(c => c.text.trim()).map(c => ({
                              text: c.text,
                              timestamp: new Date(c.timestamp).toISOString(),
                            })),
                            bookmarked: bookmarkedClauses.has(clause.title),
                            note: clauseNotes.get(clause.title) || null,
                          };
                        }).filter(a => a !== null),
                      };
                      
                      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                      const timestamp = new Date().toISOString().split('T')[0];
                      safeDownload(blob, `annotations-${timestamp}-${analysis.metadata.fileName}.json`);
                      showToast(`✓ Exported ${exportData.annotations.length} annotations`, 'success');
                    }}
                    className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1 border border-purple-300 px-2 py-1 rounded hover:bg-purple-50 transition-colors"
                    title="Export all highlights, comments, and bookmarks"
                  >
                    <Download className="w-3 h-3" />
                    Annotations
                  </button>
                )}
                {viewMode === 'quick' && filteredAndSortedClauses.length > 5 && (
                  <button
                    onClick={() => setViewMode('deep')}
                    className="text-sm text-stone-600 hover:text-stone-900 font-medium flex items-center gap-2"
                  >
                    Show all {filteredAndSortedClauses.length} clauses
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handlePrint}
                  className="p-2 border border-stone-300 hover:border-stone-900 hover:bg-stone-50 transition-colors"
                  title="Print analysis (Ctrl+P)"
                >
                  <Printer className="w-4 h-4 text-stone-600" />
                </button>
              </div>
            </div>

            {/* Search and Sort Controls */}
            <div className="space-y-4 mb-6 print:hidden">
              <div className="flex flex-wrap items-center gap-4">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    id="clause-search-input"
                    type="text"
                    placeholder="Search clauses... (Ctrl+F)"
                    value={clauseSearchQuery}
                    onChange={(e) => setClauseSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-stone-300 text-sm focus:outline-none focus:border-stone-900 transition-colors"
                  />
                  {clauseSearchQuery && (
                    <button
                      onClick={() => setClauseSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-500 uppercase tracking-wider font-medium">Sort:</span>
                  <button
                    onClick={() => handleSort('order')}
                    className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1 ${clauseSortBy === 'order' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-900'
                      }`}
                  >
                    Order
                    {clauseSortBy === 'order' && (clauseSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </button>
                  <button
                    onClick={() => handleSort('risk')}
                    className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1 ${clauseSortBy === 'risk' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-900'
                      }`}
                  >
                    Risk
                    {clauseSortBy === 'risk' && (clauseSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </button>
                  <button
                    onClick={() => handleSort('title')}
                    className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1 ${clauseSortBy === 'title' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-900'
                      }`}
                  >
                    Title
                    {clauseSortBy === 'title' && (clauseSortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </button>
                </div>
                
                {/* View Options */}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => {
                      setCompareMode(!compareMode);
                      if (!compareMode) {
                        setSelectedClausesForCompare(new Set());
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1 ${compareMode ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-900'}`}
                    title="Compare clauses side-by-side"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Compare {selectedClausesForCompare.size > 0 ? `(${selectedClausesForCompare.size})` : ''}
                  </button>
                  <button
                    onClick={() => setGroupByCategory(!groupByCategory)}
                    className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1 ${groupByCategory ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-900'}`}
                    title="Group by category"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Group
                  </button>
                  <button
                    onClick={() => setShowAnalytics(!showAnalytics)}
                    className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1 ${showAnalytics ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-900'}`}
                    title="Show analytics"
                  >
                    <TrendingUp className="w-3 h-3" />
                    Analytics
                  </button>
                  <button
                    onClick={generateFullPlaybook}
                    disabled={isGeneratingPlaybook}
                    className="px-3 py-1.5 text-xs font-medium border-2 border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Generate comprehensive negotiation playbook"
                  >
                    {isGeneratingPlaybook ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                    ) : (
                      <><Briefcase className="w-3 h-3" /> Generate Playbook</>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-stone-500 uppercase tracking-wider font-medium">Categories:</span>
                {categories.map(category => (
                  <button
                    key={category}
                    onClick={() => {
                      const newSet = new Set(selectedCategories);
                      if (newSet.has(category)) {
                        newSet.delete(category);
                      } else {
                        newSet.add(category);
                      }
                      setSelectedCategories(newSet);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium border rounded-full transition-all ${selectedCategories.has(category)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-stone-600 border-stone-300 hover:border-blue-600 hover:text-blue-600'
                      }`}
                  >
                    {category.replace(/_/g, ' ')}
                    <span className="ml-1.5 opacity-70">({categoryStats[category]?.count || 0})</span>
                  </button>
                ))}
                {selectedCategories.size > 0 && (
                  <button
                    onClick={() => setSelectedCategories(new Set())}
                    className="text-xs text-stone-500 hover:text-stone-700 underline ml-2"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Search Results Count */}
            {(clauseSearchQuery || selectedCategories.size > 0) && (
              <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-blue-900">
                      {filteredAndSortedClauses.length} of {analysis.clauses.length} clauses shown
                    </span>
                    {clauseSearchQuery && (
                      <span className="text-blue-700 ml-2">
                        • Searching: "{clauseSearchQuery}"
                      </span>
                    )}
                    {selectedCategories.size > 0 && (
                      <span className="text-blue-700 ml-2">
                        • {selectedCategories.size} {selectedCategories.size === 1 ? 'category' : 'categories'} filtered
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setClauseSearchQuery('');
                      setSelectedCategories(new Set());
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 border border-blue-300 px-2 py-1 rounded hover:bg-blue-100"
                  >
                    <X className="w-3 h-3" />
                    Clear filters
                  </button>
                </div>
              </div>
            )}
            
            {/* Compare Mode Banner */}
            {compareMode && (
              <div className="mb-4 bg-orange-50 border-l-4 border-orange-500 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-orange-900">
                      Compare Mode: Select {selectedClausesForCompare.size > 0 ? `${2 - selectedClausesForCompare.size} more` : '2'} clause{selectedClausesForCompare.size === 1 ? '' : 's'}
                    </span>
                    {selectedClausesForCompare.size > 0 && (
                      <span className="text-orange-700 ml-2">
                        • {selectedClausesForCompare.size} selected
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {selectedClausesForCompare.size === 2 && (
                      <button
                        onClick={() => {
                          // Show comparison view
                          const clausesToCompare = filteredAndSortedClauses.filter(c => selectedClausesForCompare.has(c.id));
                          if (clausesToCompare.length === 2) {
                            // Scroll to first clause and highlight both
                            scrollToSection(`clause-${clausesToCompare[0].id}`);
                            showToast('📊 Comparing clauses - scroll to see differences', 'success');
                          }
                        }}
                        className="text-xs text-white bg-orange-600 hover:bg-orange-700 font-medium flex items-center gap-1 px-3 py-1.5 rounded"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        View Comparison
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setCompareMode(false);
                        setSelectedClausesForCompare(new Set());
                      }}
                      className="text-xs text-orange-600 hover:text-orange-800 font-medium flex items-center gap-1 border border-orange-300 px-2 py-1 rounded hover:bg-orange-100"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Analytics Dashboard */}
            {showAnalytics && (
              <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    <h4 className="text-lg font-bold text-indigo-900">Contract Analytics</h4>
                  </div>
                  <button
                    onClick={() => setShowAnalytics(false)}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    Hide
                  </button>
                </div>
                
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/80 p-4 rounded border border-indigo-200">
                    <div className="text-2xl font-bold text-red-600 mb-1">
                      {analysis.clauses.filter(c => c.riskLevel === 'critical').length}
                    </div>
                    <div className="text-xs text-stone-600 uppercase tracking-wider">Critical Risk</div>
                  </div>
                  <div className="bg-white/80 p-4 rounded border border-indigo-200">
                    <div className="text-2xl font-bold text-orange-600 mb-1">
                      {analysis.clauses.filter(c => c.riskLevel === 'high').length}
                    </div>
                    <div className="text-xs text-stone-600 uppercase tracking-wider">High Risk</div>
                  </div>
                  <div className="bg-white/80 p-4 rounded border border-indigo-200">
                    <div className="text-2xl font-bold text-yellow-600 mb-1">
                      {analysis.clauses.filter(c => c.riskLevel === 'medium').length}
                    </div>
                    <div className="text-xs text-stone-600 uppercase tracking-wider">Medium Risk</div>
                  </div>
                  <div className="bg-white/80 p-4 rounded border border-indigo-200">
                    <div className="text-2xl font-bold text-green-600 mb-1">
                      {analysis.clauses.filter(c => c.riskLevel === 'low').length}
                    </div>
                    <div className="text-xs text-stone-600 uppercase tracking-wider">Low Risk</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  {/* Category Distribution */}
                  <div className="bg-white/80 p-4 rounded border border-indigo-200">
                    <h5 className="text-sm font-bold text-indigo-900 mb-3">Category Distribution</h5>
                    <div className="space-y-2">
                      {Object.entries(categoryStats)
                        .sort((a, b) => b[1].count - a[1].count)
                        .slice(0, 5)
                        .map(([category, stats]) => (
                          <div key={category}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-stone-700 font-medium">{category.replace(/_/g, ' ')}</span>
                              <span className="text-stone-500">{stats.count} clauses</span>
                            </div>
                            <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 transition-all duration-500"
                                style={{width: `${(stats.count / analysis.clauses.length) * 100}%`}}
                              ></div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                  
                  {/* Complexity Scores */}
                  <div className="bg-white/80 p-4 rounded border border-indigo-200">
                    <h5 className="text-sm font-bold text-indigo-900 mb-3">Most Complex Clauses</h5>
                    <div className="space-y-2">
                      {clauseComplexity
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 5)
                        .map(({id, score}) => {
                          const clause = analysis.clauses.find(c => c.id === id);
                          if (!clause) return null;
                          return (
                            <div key={id} className="flex items-center justify-between">
                              <button
                                onClick={() => scrollToSection(`clause-${id}`)}
                                className="text-xs text-indigo-700 hover:text-indigo-900 font-medium truncate flex-1 text-left"
                              >
                                {clause.title.length > 25 ? clause.title.substring(0, 25) + '...' : clause.title}
                              </button>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-500 ${score > 70 ? 'bg-red-500' : score > 40 ? 'bg-orange-500' : 'bg-green-500'}`}
                                    style={{width: `${score}%`}}
                                  ></div>
                                </div>
                                <span className="text-xs font-mono text-stone-600 w-8">{score}</span>
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  </div>
                </div>
                
                {/* Risk Distribution Pie Chart */}
                <div className="mt-6 bg-white/80 p-4 rounded border border-indigo-200">
                  <h5 className="text-sm font-bold text-indigo-900 mb-4 text-center">Risk Level Distribution</h5>
                  <div className="flex items-center justify-center gap-6">
                    {/* Simple Pie Chart using CSS */}
                    <div className="relative w-32 h-32">
                      {(() => {
                        const critical = analysis.clauses.filter(c => c.riskLevel === 'critical').length;
                        const high = analysis.clauses.filter(c => c.riskLevel === 'high').length;
                        const medium = analysis.clauses.filter(c => c.riskLevel === 'medium').length;
                        const low = analysis.clauses.filter(c => c.riskLevel === 'low').length;
                        const total = analysis.clauses.length;
                        
                        const criticalPct = (critical / total) * 100;
                        const highPct = (high / total) * 100;
                        const mediumPct = (medium / total) * 100;
                        const lowPct = (low / total) * 100;
                        
                        return (
                          <>
                            <div 
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: `conic-gradient(
                                  #dc2626 0% ${criticalPct}%,
                                  #f97316 ${criticalPct}% ${criticalPct + highPct}%,
                                  #eab308 ${criticalPct + highPct}% ${criticalPct + highPct + mediumPct}%,
                                  #22c55e ${criticalPct + highPct + mediumPct}% 100%
                                )`
                              }}
                            ></div>
                            <div className="absolute inset-[30%] bg-white rounded-full flex items-center justify-center">
                              <div className="text-center">
                                <div className="text-xl font-bold text-indigo-900">{total}</div>
                                <div className="text-[8px] text-stone-600 uppercase">Clauses</div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    
                    {/* Legend */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-600 rounded"></div>
                        <span className="text-xs text-stone-700">
                          Critical ({analysis.clauses.filter(c => c.riskLevel === 'critical').length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-600 rounded"></div>
                        <span className="text-xs text-stone-700">
                          High ({analysis.clauses.filter(c => c.riskLevel === 'high').length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-600 rounded"></div>
                        <span className="text-xs text-stone-700">
                          Medium ({analysis.clauses.filter(c => c.riskLevel === 'medium').length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-600 rounded"></div>
                        <span className="text-xs text-stone-700">
                          Low ({analysis.clauses.filter(c => c.riskLevel === 'low').length})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Quick Stats Floating Card */}
            {!showChat && !showContractMap && (
              <div className="sticky top-24 ml-auto bg-white border-2 border-stone-900 shadow-xl z-20 w-full max-w-80 rounded-sm overflow-hidden hidden xl:block">
                <div className="bg-stone-900 text-white p-3 flex items-center justify-between">
                  <h4 className="font-bold text-sm uppercase tracking-wider">Quick Stats</h4>
                  <button
                    onClick={() => scrollToSection('summary')}
                    className="text-xs text-stone-300 hover:text-white"
                    aria-label="View full summary"
                  >
                    View Full →
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-600 uppercase">Risk Score</span>
                    <span className={`font-bold text-lg ${analysis.riskScore > 70 ? 'text-red-600' : analysis.riskScore > 40 ? 'text-amber-600' : 'text-green-600'}`}>
                      {analysis.riskScore}/100
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-600 uppercase">Red Flags</span>
                    <span className="font-bold text-lg text-red-600">{analysis.redFlags.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-600 uppercase">Total Clauses</span>
                    <span className="font-bold text-lg text-stone-900">{analysis.clauses.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-600 uppercase">Highlighted</span>
                    <span className="font-bold text-lg text-purple-600">{highlightedClauses.size}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-600 uppercase">Comments</span>
                    <span className="font-bold text-lg text-blue-600">
                      {Array.from(clauseComments.values()).reduce((sum, comments) => sum + comments.length, 0)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-stone-200 flex gap-2">
                    <button
                      onClick={() => setShowChat(true)}
                      className="flex-1 text-xs py-2 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      aria-label="Open chat assistant"
                    >
                      💬 Ask AI
                    </button>
                    <button
                      onClick={exportAnnotations}
                      className="flex-1 text-xs py-2 border-2 text-stone-900 border-stone-900 hover:bg-stone-900 hover:text-white transition-colors"
                      aria-label="Export annotations"
                    >
                      📥 Export
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-8">
              {groupByCategory && groupedClauses ? (
                // Grouped by category view
                Object.entries(groupedClauses).map(([category, clauses]) => (
                  <div key={category} className="border-2 border-stone-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => {
                        const newSet = new Set(collapsedCategories);
                        if (newSet.has(category)) {
                          newSet.delete(category);
                        } else {
                          newSet.add(category);
                        }
                        setCollapsedCategories(newSet);
                      }}
                      className="w-full bg-stone-100 hover:bg-stone-200 px-6 py-4 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`transform transition-transform ${collapsedCategories.has(category) ? '' : 'rotate-90'}`}>
                          <svg className="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <h4 className="text-lg font-bold text-stone-900">
                          {category.replace(/_/g, ' ').toUpperCase()}
                        </h4>
                        <span className="text-sm text-stone-500 font-medium">
                          ({clauses.length} clause{clauses.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {categoryStats[category] && (
                          <>
                            {categoryStats[category].critical > 0 && (
                              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">
                                {categoryStats[category].critical} critical
                              </span>
                            )}
                            {categoryStats[category].high > 0 && (
                              <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded">
                                {categoryStats[category].high} high
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                    
                    {!collapsedCategories.has(category) && (
                      <div className="p-6 space-y-8">
                        {clauses.map((clause) => {
                          const clauseIndex = filteredAndSortedClauses.findIndex(c => c.id === clause.id) + 1;
                          return (
                            <div
                              key={clause.id}
                              id={`clause-${clause.id}`}
                              className={`border-t border-stone-200 pt-6 first:border-0 first:pt-0 transition-colors ${
                                highlightedClauses.has(clause.id) 
                                  ? `bg-${highlightedClauses.get(clause.id)}-50 -mx-4 px-4 py-4 border-l-4 border-${highlightedClauses.get(clause.id)}-400`
                                  : ''
                              }`}
                            >
                              {/* Render clause content directly here */}
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  {compareMode && (
                                    <input
                                      type="checkbox"
                                      checked={selectedClausesForCompare.has(clause.id)}
                                      onChange={(e) => {
                                        const newSet = new Set(selectedClausesForCompare);
                                        if (e.target.checked) {
                                          if (newSet.size < 2) {
                                            newSet.add(clause.id);
                                          } else {
                                            showToast('⚠️ You can only compare 2 clauses at a time', 'error');
                                            return;
                                          }
                                        } else {
                                          newSet.delete(clause.id);
                                        }
                                        setSelectedClausesForCompare(newSet);
                                      }}
                                      className="w-5 h-5 rounded border-2 border-orange-500 text-orange-600 focus:ring-orange-500"
                                      aria-label="Select clause for comparison"
                                    />
                                  )}
                                  <span className="text-stone-400 font-mono text-sm">
                                    {String(clauseIndex).padStart(2, '0')}
                                  </span>
                                  <h4 className="text-xl font-bold text-stone-900">{clause.title}</h4>
                                </div>
                                <div className="flex items-center gap-2">
                                  {/* Highlight Color Picker */}
                                  <div className="relative group">
                                    <button
                                      className={`p-2 rounded transition-colors ${highlightedClauses.has(clause.id) ? 'bg-yellow-100' : 'bg-stone-100'} hover:bg-stone-200`}
                                      title="Highlight clause"
                                      aria-label="Choose highlight color for clause"
                                    >
                                      <svg className="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                      </svg>
                                    </button>
                                    <div className="absolute right-0 top-full mt-1 bg-white border-2 border-stone-900 p-2 hidden group-hover:flex gap-1 z-10 shadow-xl">
                                      {['yellow', 'green', 'blue', 'pink', 'purple'].map(color => (
                                        <button
                                          key={color}
                                          onClick={() => {
                                            const newMap = new Map(highlightedClauses);
                                            if (highlightedClauses.get(clause.id) === color) {
                                              newMap.delete(clause.id);
                                            } else {
                                              newMap.set(clause.id, color);
                                            }
                                            setHighlightedClauses(newMap);
                                          }}
                                          className={`w-6 h-6 rounded border-2 ${highlightedClauses.get(clause.id) === color ? 'border-stone-900' : 'border-stone-300'} bg-${color}-200 hover:border-stone-900 transition-colors`}
                                          title={`Highlight ${color}`}
                                          aria-label={`Highlight clause with ${color} color`}
                                        />
                                      ))}
                                      <button
                                        onClick={() => {
                                          const newMap = new Map(highlightedClauses);
                                          newMap.delete(clause.id);
                                          setHighlightedClauses(newMap);
                                        }}
                                        className="w-6 h-6 rounded border-2 border-stone-300 hover:border-stone-900 flex items-center justify-center"
                                        title="Remove highlight"
                                        aria-label="Remove clause highlight"
                                      >
                                        <X className="w-3 h-3 text-stone-600" />
                                      </button>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => toggleBookmark(clause.title)}
                                    className={`p-2 rounded transition-colors ${bookmarkedClauses.has(clause.title)
                                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                      : 'bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600'
                                      }`}
                                    title={bookmarkedClauses.has(clause.title) ? 'Remove bookmark' : 'Bookmark this clause'}
                                    aria-label={bookmarkedClauses.has(clause.title) ? 'Remove bookmark from clause' : 'Bookmark this clause'}
                                  >
                                    {bookmarkedClauses.has(clause.title) ? (
                                      <BookmarkCheck className="w-4 h-4" />
                                    ) : (
                                      <Bookmark className="w-4 h-4" />
                                    )}
                                  </button>
                                    {isSearchingSimilarity[clause.id] ? (
                                      <button disabled className="p-2 rounded bg-purple-100 text-purple-700 opacity-50">
                                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleFindSimilarClauses(clause.id, clause.originalText, clause.fairnessScore !== undefined ? 100 - clause.fairnessScore : (clause.riskLevel === 'critical' ? 100 : clause.riskLevel === 'high' ? 75 : clause.riskLevel === 'medium' ? 50 : 25))}
                                        className="p-2 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                                        title="Find Similar Industry Clauses"
                                        aria-label="Find similar clauses in LEDGAR knowledge base"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                                        </svg>
                                      </button>
                                    )}
                                  {(clause.riskLevel === 'critical' || clause.riskLevel === 'high') && (
                                    <button
                                      onClick={() => generateNegotiationScript(clause.title)}
                                      className="p-2 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                                      title="Generate negotiation script"
                                      aria-label="Generate negotiation script for this clause"
                                    >
                                      <Briefcase className="w-4 h-4" />
                                    </button>
                                  )}
                                  <span className={`text-xs px-3 py-1 uppercase font-semibold tracking-wider ${clause.riskLevel === 'critical' ? 'bg-stone-900 text-white' :
                                    clause.riskLevel === 'high' ? 'bg-stone-700 text-white' :
                                      clause.riskLevel === 'medium' ? 'bg-stone-400 text-white' :
                                        'bg-stone-200 text-stone-900'
                                    }`}>
                                    {clause.riskLevel}
                                  </span>
                                  {clause.fairnessScore !== undefined && (
                                    <div className="flex items-center gap-1 px-3 py-1 bg-white border-2 border-stone-900 rounded" title="Fairness Score: How balanced this clause is">
                                      <Scale className="w-3 h-3 text-stone-600" />
                                      <span className={`text-xs font-bold ${
                                        clause.fairnessScore >= 76 ? 'text-green-600' :
                                        clause.fairnessScore >= 51 ? 'text-blue-600' :
                                        clause.fairnessScore >= 26 ? 'text-orange-600' :
                                        'text-red-600'
                                      }`}>
                                        {clause.fairnessScore}/100
                                      </span>
                                      <span className="text-xs text-stone-500">Fair</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="mb-4">
                                <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Contractual Language</p>
                                <p className="text-sm text-stone-600 italic bg-stone-50 p-4 border-l-2 border-stone-300 font-serif leading-relaxed">
                                  "{clause.originalText}"
                                </p>
                              </div>

                              <div className="mb-4">
                                <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Translation</p>
                                <p className="text-stone-800 bg-white p-4 border-l-2 border-stone-900 leading-relaxed">
                                  {clause.plainLanguage}
                                </p>
                              </div>
                              
                              {/* Similar Industry Clauses Detection (ML Retrieval) */}
                              {similarClauses[clause.id] && similarClauses[clause.id].results?.length > 0 && (
                                <div className="mb-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 p-4 rounded">
                                  <div className="flex items-center gap-2 mb-4 border-b border-purple-200 pb-2">
                                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    <p className="text-sm text-purple-900 uppercase tracking-wider font-bold">Industry Standard Clauses (LEDGAR)</p>
                                  </div>
                                  
                                  {/* ML Feature 2: Clause Category Prediction */}
                                  <div className="flex items-center justify-between bg-white border border-purple-200 p-3 rounded mb-4 shadow-sm">
                                    <div>
                                      <p className="text-[10px] text-stone-500 uppercase font-bold tracking-wider mb-1">Predicted Clause Category</p>
                                      <p className="text-sm font-bold text-stone-800">{similarClauses[clause.id].predictedCategory}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[10px] text-stone-500 uppercase font-bold tracking-wider mb-1">AI Confidence</p>
                                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">{similarClauses[clause.id].confidence}%</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-3">
                                    {/* ML Feature 3: Risk-Aware Clause Recommendation Engine */}
                                    {similarClauses[clause.id].recommendedAlternative && (
                                      <div className="mb-4 bg-green-50 border-2 border-green-500 p-4 rounded relative overflow-hidden">
                                        <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-bl">
                                          Recommended Alternative
                                        </div>
                                        <div className="flex items-center gap-2 mb-3 border-b border-green-200 pb-2 pr-24">
                                          <Sparkles className="w-4 h-4 text-green-600" />
                                          <h4 className="text-sm font-bold text-green-900">Benchmark-Based Recommendation</h4>
                                        </div>
                                        <p className="text-sm text-stone-800 italic font-serif leading-relaxed mb-4">
                                          "{similarClauses[clause.id].recommendedAlternative.text}"
                                        </p>
                                        
                                        <div className="bg-white rounded p-3 border border-green-200">
                                          <p className="text-[10px] uppercase font-bold text-stone-500 mb-2">Estimated Risk Reduction</p>
                                          <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-stone-500 line-through">Risk {clause.fairnessScore !== undefined ? 100 - clause.fairnessScore : (clause.riskLevel === 'critical' ? 100 : clause.riskLevel === 'high' ? 75 : clause.riskLevel === 'medium' ? 50 : 25)}</span>
                                              <TrendingDown className="w-4 h-4 text-green-500" />
                                              <span className="text-sm font-bold text-green-700">Risk {similarClauses[clause.id].recommendedAlternative.riskScoreBenchmark}</span>
                                            </div>
                                            <div className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-1 rounded">
                                              Improvement: -{Math.max(0, (clause.fairnessScore !== undefined ? 100 - clause.fairnessScore : (clause.riskLevel === 'critical' ? 100 : clause.riskLevel === 'high' ? 75 : clause.riskLevel === 'medium' ? 50 : 25)) - similarClauses[clause.id].recommendedAlternative.riskScoreBenchmark)} points
                                            </div>
                                          </div>
                                          <div className="mt-3 pt-3 border-t border-green-100">
                                            <p className="text-xs text-stone-600">
                                              <span className="font-bold">Reason:</span> This alternative from the LEDGAR corpus ({similarClauses[clause.id].recommendedAlternative.source || 'Industry Standard'}) maintains a {similarClauses[clause.id].recommendedAlternative.similarityScore}% semantic similarity while optimizing for a lower risk footprint.
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {similarClauses[clause.id].results.map((similarClause: any, idx: number) => {
                                      const fairness = clause.fairnessScore || 50;
                                      const yourRisk = 100 - fairness;
                                      const delta = similarClause.corpusStats ? Math.round(yourRisk - similarClause.corpusStats.medianRisk) : 0;
                                      return (
                                        <div key={idx} className="bg-white p-3 rounded border border-purple-100 shadow-sm relative">
                                          <div className="absolute top-3 right-3 flex items-center gap-2">
                                            {/* ML Feature 1: Clause Deviation Detection */}
                                            <div className="flex flex-col items-end">
                                              <span className="text-[10px] text-stone-500 font-semibold uppercase mb-0.5">Industry Alignment</span>
                                              <span className="text-xs font-bold text-purple-700">{similarClause.similarityScore}%</span>
                                            </div>
                                            <div className="flex flex-col items-end border-l border-stone-200 pl-2">
                                              <span className="text-[10px] text-stone-500 font-semibold uppercase mb-0.5">Deviation Risk</span>
                                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                                similarClause.similarityScore >= 80 ? 'bg-green-100 text-green-700' :
                                                similarClause.similarityScore >= 60 ? 'bg-orange-100 text-orange-700' :
                                                'bg-red-100 text-red-700'
                                              }`}>
                                                {similarClause.similarityScore >= 80 ? 'Low' : similarClause.similarityScore >= 60 ? 'Medium' : 'High'}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 mb-1">
                                            <h5 className="text-xs font-bold text-purple-800">{similarClause.category}</h5>
                                            {similarClause.source && (
                                              <span className="text-[10px] text-stone-400 font-medium">({similarClause.source})</span>
                                            )}
                                          </div>
                                          <p className="text-sm text-stone-700 italic font-serif mt-2 mb-3">"{similarClause.text}"</p>
                                          
                                          {/* Explainability Reason */}
                                          <div className="bg-stone-50 rounded border border-stone-200 p-3 mt-3">
                                            <p className="text-[10px] uppercase font-bold text-stone-500 mb-1">Semantic Match Reason</p>
                                            <p className="text-xs text-stone-700">{getReason(similarClause.category)}</p>
                                          </div>

                                          {/* Clause Risk Benchmarking */}
                                          {similarClause.corpusStats && (
                                            <div className="bg-stone-50 rounded border border-stone-200 p-4 mt-3">
                                              <div className="flex flex-col mb-4">
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-1.5">
                                                    <p className="text-[10px] uppercase font-bold text-stone-500">Clause Risk Benchmarking</p>
                                                    <div className="group relative cursor-help flex items-center">
                                                      <Info className="w-3 h-3 text-stone-400" />
                                                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 w-48 p-2 bg-stone-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center leading-relaxed">
                                                        Internal heuristic score used for comparative analytics.
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <span className="text-[10px] font-bold text-stone-400 bg-stone-200 px-2 py-0.5 rounded-full">{similarClause.corpusStats.sampleSize} clauses</span>
                                                </div>
                                                <p className="text-[9px] text-stone-400 mt-1 italic">Note: Risk scores are synthetic heuristic benchmarks, not native to LEDGAR.</p>
                                              </div>
                                              
                                              <div className="mt-6 mb-8">
                                                <div className="relative w-full h-1.5 bg-stone-200 rounded">
                                                  {/* Highlight range between min and max */}
                                                  <div className="absolute top-0 h-full bg-stone-300 rounded" style={{ left: `${similarClause.corpusStats.minRisk}%`, width: `${similarClause.corpusStats.maxRisk - similarClause.corpusStats.minRisk}%` }}></div>
                                                  
                                                  {/* Min Label */}
                                                  <div className="absolute -top-5 -translate-x-1/2 text-[10px] font-bold text-stone-500" style={{ left: `${similarClause.corpusStats.minRisk}%` }}>{similarClause.corpusStats.minRisk}</div>
                                                  
                                                  {/* Max Label */}
                                                  <div className="absolute -top-5 -translate-x-1/2 text-[10px] font-bold text-stone-500" style={{ left: `${similarClause.corpusStats.maxRisk}%` }}>{similarClause.corpusStats.maxRisk}</div>
                                                  
                                                  {/* Median Marker */}
                                                  <div className="absolute top-1/2 -translate-y-1/2 -ml-0.5 w-1 h-3 bg-stone-500" style={{ left: `${similarClause.corpusStats.medianRisk}%` }}></div>
                                                  <div className="absolute -top-5 -translate-x-1/2 text-[10px] font-bold text-stone-800" style={{ left: `${similarClause.corpusStats.medianRisk}%` }}>{similarClause.corpusStats.medianRisk}</div>

                                                  {/* Your Clause Marker */}
                                                  <div className="absolute top-2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[6px] border-b-purple-600" style={{ left: `${yourRisk}%` }}></div>
                                                  <div className="absolute top-4 -translate-x-1/2 text-[10px] font-bold text-purple-700 whitespace-nowrap" style={{ left: `${yourRisk}%` }}>Your {yourRisk}</div>
                                                </div>
                                              </div>
                                              
                                              <div className="flex justify-between items-center text-xs border-t border-stone-200 pt-3">
                                                <div className="flex gap-4">
                                                  <div>
                                                    <span className="text-stone-400 font-medium mr-1">LEDGAR Category Benchmark:</span>
                                                    <span className="font-bold text-stone-700">{similarClause.corpusStats.medianRisk}</span>
                                                  </div>
                                                  <div>
                                                    <span className="text-stone-400 font-medium mr-1">Your Clause Risk:</span>
                                                    <span className="font-bold text-stone-700">{yourRisk}</span>
                                                  </div>
                                                </div>
                                                <div>
                                                  <span className="text-stone-400 font-medium mr-1">Variance:</span>
                                                  <span className={`font-bold ${delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {delta > 0 ? '+' : ''}{delta}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              
                              {/* Negotiation Strategy Card */}
                              {clause.negotiationStrategy && (clause.riskLevel === 'high' || clause.riskLevel === 'critical' || (clause.fairnessScore && clause.fairnessScore < 40)) && (
                                <div className="mb-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-300 rounded-lg overflow-hidden">
                                  <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Briefcase className="w-4 h-4" />
                                      <span className="font-bold text-sm uppercase tracking-wider">Negotiation Strategy</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs px-2 py-1 rounded-full ${
                                        clause.negotiationStrategy.priority === 'high' ? 'bg-red-500' :
                                        clause.negotiationStrategy.priority === 'medium' ? 'bg-yellow-500' :
                                        'bg-green-500'
                                      }`}>
                                        {clause.negotiationStrategy.priority} priority
                                      </span>
                                      <span className={`text-xs px-2 py-1 rounded-full bg-white/20`}>
                                        {clause.negotiationStrategy.leverage} leverage
                                      </span>
                                    </div>
                                  </div>
                                  <div className="p-4 space-y-3">
                                    {clause.negotiationStrategy.suggestedApproach && (
                                      <div>
                                        <p className="text-xs text-indigo-900 uppercase tracking-wider font-semibold mb-2">💡 Recommended Approach</p>
                                        <p className="text-sm text-stone-800 leading-relaxed bg-white p-3 border-l-4 border-indigo-500 rounded">
                                          {clause.negotiationStrategy.suggestedApproach}
                                        </p>
                                      </div>
                                    )}
                                    {clause.negotiationStrategy.fallbackPositions && clause.negotiationStrategy.fallbackPositions.length > 0 && (
                                      <div>
                                        <p className="text-xs text-indigo-900 uppercase tracking-wider font-semibold mb-2">🔄 Fallback Positions</p>
                                        <ul className="space-y-1">
                                          {clause.negotiationStrategy.fallbackPositions.map((fallback, idx) => (
                                            <li key={idx} className="text-sm text-stone-700 flex items-start gap-2">
                                              <span className="text-indigo-600 font-mono text-xs mt-0.5">{idx + 1}.</span>
                                              <span>{fallback}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {clause.negotiationStrategy.marketPrecedents && clause.negotiationStrategy.marketPrecedents.length > 0 && (
                                      <div>
                                        <p className="text-xs text-indigo-900 uppercase tracking-wider font-semibold mb-2">📊 Market Precedents</p>
                                        <div className="space-y-1">
                                          {clause.negotiationStrategy.marketPrecedents.map((precedent, idx) => (
                                            <p key={idx} className="text-xs text-stone-600 italic bg-white px-3 py-2 rounded border border-indigo-200">
                                              • {precedent}
                                            </p>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Inline Comments Section */}
                              <div className="mb-4">
                                <button
                                  onClick={() => {
                                    // Toggle comment section for this clause
                                    const currentComments = clauseComments.get(clause.id) || [];
                                    if (currentComments.length === 0) {
                                      // Add empty first comment to show input
                                      const newMap = new Map(clauseComments);
                                      newMap.set(clause.id, [{text: '', timestamp: Date.now()}]);
                                      setClauseComments(newMap);
                                    }
                                  }}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                                >
                                  <StickyNote className="w-3 h-3" />
                                  {(clauseComments.get(clause.id)?.length || 0) > 0 
                                    ? `${clauseComments.get(clause.id)!.filter(c => c.text.trim()).length} comment(s)`
                                    : 'Add comment'}
                                </button>
                                
                                {clauseComments.has(clause.id) && (
                                  <div className="mt-2 space-y-2">
                                    {clauseComments.get(clause.id)!.map((comment, idx) => (
                                      <div key={idx} className="bg-indigo-50 border-l-2 border-indigo-400 p-3">
                                        <textarea
                                          value={comment.text}
                                          onChange={(e) => {
                                            const newMap = new Map(clauseComments);
                                            const comments = [...(newMap.get(clause.id) || [])];
                                            comments[idx] = {...comment, text: e.target.value};
                                            newMap.set(clause.id, comments);
                                            setClauseComments(newMap);
                                          }}
                                          placeholder="Add your comment or notes here..."
                                          className="w-full px-3 py-2 border border-indigo-200 text-sm focus:outline-none focus:border-indigo-500 bg-white"
                                          rows={2}
                                        />
                                        <div className="flex items-center justify-between mt-2">
                                          <span className="text-xs text-indigo-600">
                                            {new Date(comment.timestamp).toLocaleString()}
                                          </span>
                                          <button
                                            onClick={() => {
                                              const newMap = new Map(clauseComments);
                                              const comments = (newMap.get(clause.id) || []).filter((_, i) => i !== idx);
                                              if (comments.length === 0) {
                                                newMap.delete(clause.id);
                                              } else {
                                                newMap.set(clause.id, comments);
                                              }
                                              setClauseComments(newMap);
                                            }}
                                            className="text-xs text-red-600 hover:text-red-800"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                    <button
                                      onClick={() => {
                                        const newMap = new Map(clauseComments);
                                        const comments = [...(newMap.get(clause.id) || [])];
                                        comments.push({text: '', timestamp: Date.now()});
                                        newMap.set(clause.id, comments);
                                        setClauseComments(newMap);
                                      }}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                      + Add another comment
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                // Regular list view  
                filteredAndSortedClauses.slice(0, viewMode === 'quick' ? 5 : undefined).map((clause) => {
                  const clauseIndex = filteredAndSortedClauses.findIndex(c => c.id === clause.id) + 1;
                  return (
                    <div
                      key={clause.id}
                      id={`clause-${clause.id}`}
                      className="border-t border-stone-200 pt-6 first:border-0 first:pt-0"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-stone-400 font-mono text-sm">
                            {String(filteredAndSortedClauses.findIndex(c => c.id === clause.id) + 1).padStart(2, '0')}
                          </span>
                          <h4 className="text-xl font-bold text-stone-900">{clause.title}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleBookmark(clause.title)}
                            className={`p-2 rounded transition-colors ${bookmarkedClauses.has(clause.title)
                              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                              : 'bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600'
                          }`}
                        title={bookmarkedClauses.has(clause.title) ? 'Remove bookmark' : 'Bookmark this clause'}
                      >
                        {bookmarkedClauses.has(clause.title) ? (
                          <BookmarkCheck className="w-4 h-4" />
                        ) : (
                          <Bookmark className="w-4 h-4" />
                        )}
                      </button>
                      {(clause.riskLevel === 'critical' || clause.riskLevel === 'high') && (
                        <button
                          onClick={() => generateNegotiationScript(clause.title)}
                          className="p-2 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                          title="Generate negotiation script"
                        >
                          <Briefcase className="w-4 h-4" />
                        </button>
                      )}
                      <span className={`text-xs px-3 py-1 uppercase font-semibold tracking-wider ${clause.riskLevel === 'critical' ? 'bg-stone-900 text-white' :
                        clause.riskLevel === 'high' ? 'bg-stone-700 text-white' :
                          clause.riskLevel === 'medium' ? 'bg-stone-400 text-white' :
                            'bg-stone-200 text-stone-900'
                        }`}>
                        {clause.riskLevel}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Contractual Language</p>
                    <p className="text-sm text-stone-600 italic bg-stone-50 p-4 border-l-2 border-stone-300 font-serif leading-relaxed">
                      "{clause.originalText}"
                    </p>
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Translation</p>
                    <p className="text-stone-800 bg-white p-4 border-l-2 border-stone-900 leading-relaxed">
                      {clause.plainLanguage}
                    </p>
                  </div>

                  {/* Industry Benchmark Comparison */}
                  {clause.industryComparison && (
                    <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-6 rounded-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <Scale className="w-4 h-4 text-blue-600" />
                        <p className="text-xs text-blue-900 uppercase tracking-wider font-bold">Industry Benchmark Analysis</p>
                      </div>

                      {/* Strictness Meter */}
                      <div className="mb-5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-blue-900 font-medium">Strictness Level</span>
                          <span className="mono text-sm font-bold text-blue-900">{clause.industryComparison.averageStrictness}/100</span>
                        </div>
                        <div className="relative h-2 bg-blue-100 rounded-full overflow-hidden">
                          <div
                            className={`strictness-bar absolute left-0 top-0 h-full transition-all duration-500 ${clause.industryComparison.averageStrictness > 70 ? 'bg-red-600' :
                              clause.industryComparison.averageStrictness > 50 ? 'bg-orange-500' :
                                'bg-green-500'
                              }`}
                            data-width={clause.industryComparison.averageStrictness}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {clause.industryComparison.averageStrictness > 60 ? (
                            <>
                              <TrendingUp className="w-4 h-4 text-red-600" />
                              <span className="text-xs text-red-700 font-medium">
                                {clause.industryComparison.averageStrictness > 70 ?
                                  `${Math.round((clause.industryComparison.averageStrictness - 50) / 25)}x stricter than industry average` :
                                  'Above industry average'}
                              </span>
                            </>
                          ) : clause.industryComparison.averageStrictness < 40 ? (
                            <>
                              <TrendingDown className="w-4 h-4 text-green-600" />
                              <span className="text-xs text-green-700 font-medium">More favorable than industry average</span>
                            </>
                          ) : (
                            <>
                              <Minus className="w-4 h-4 text-blue-600" />
                              <span className="text-xs text-blue-700 font-medium">Within industry standard range</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Percentile Ranking */}
                      <div className="mb-5 flex items-center gap-3 p-3 bg-white/60 rounded">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                            <span className="mono text-lg font-bold text-white">{clause.industryComparison.percentile}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-blue-700 uppercase tracking-wider font-semibold">Percentile Rank</p>
                          <p className="text-sm text-blue-900">
                            Stricter than <span className="font-bold">{clause.industryComparison.percentile}%</span> of similar contracts
                          </p>
                        </div>
                      </div>

                      {/* Fairer Alternative */}
                      {clause.industryComparison.fairerVersion && (
                        <div className="border-t border-blue-200 pt-4">
                          <p className="text-xs text-blue-700 uppercase tracking-wider font-bold mb-2 flex items-center gap-2">
                            <FileText className="w-3 h-3" />
                            Recommended Balanced Alternative
                          </p>
                          <p className="text-sm text-blue-900 leading-relaxed bg-white/80 p-4 rounded italic border-l-2 border-blue-600">
                            "{clause.industryComparison.fairerVersion}"
                          </p>
                        </div>
                      )}

                      {/* Common Alternatives */}
                      {clause.industryComparison.commonAlternatives && clause.industryComparison.commonAlternatives.length > 0 && (
                        <div className="border-t border-blue-200 pt-4 mt-4">
                          <p className="text-xs text-blue-700 uppercase tracking-wider font-bold mb-3">Common Industry Alternatives</p>
                          <ul className="space-y-2">
                            {clause.industryComparison.commonAlternatives.map((alt, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-blue-900">
                                <span className="text-blue-400 mt-0.5">•</span>
                                <span className="leading-relaxed">{alt}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {clause.concerns.length > 0 && (
                    <div>
                      <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">Strategic Considerations</p>
                      <ul className="space-y-2">
                        {clause.concerns.map((concern, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <span className="text-stone-400 mt-1.5">—</span>
                            <p className="text-stone-700 leading-relaxed">{concern}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
              )}
            </div>
          </div>

          {/* Recommendations Section */}
          {(analysis.recommendations.length > 0 || (analysis.suggestedActions && analysis.suggestedActions.length > 0)) && (
            <div id="recommendations" className="bg-white border-2 border-stone-900 p-8">
              {analysis.recommendations.length > 0 && (
                <div className="mb-10">
                  <h3 className="text-3xl font-bold text-stone-900 mb-6 pb-4 border-b-2 border-stone-200">
                    Strategic Recommendations
                  </h3>
                  <ul className="space-y-4">
                    {analysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-4 border-l-2 border-stone-900 pl-6 py-2">
                        <span className="text-stone-400 font-mono text-sm mt-1">{String(idx + 1).padStart(2, '0')}</span>
                        <p className="text-stone-800 leading-relaxed flex-1">{rec}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.suggestedActions && analysis.suggestedActions.length > 0 && (
                <div>
                  <h3 className="text-3xl font-bold text-stone-900 mb-6 pb-4 border-b-2 border-stone-200 flex items-center gap-3">
                    <CheckCircle className="w-8 h-8 text-stone-900" />
                    Suggested Next Actions
                  </h3>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.suggestedActions.map((action, idx) => (
                      <li key={idx} className="bg-stone-50 border border-stone-200 p-6 flex items-start gap-4 hover:border-stone-900 transition-colors">
                        <span className="bg-stone-900 text-white w-8 h-8 flex items-center justify-center font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <p className="text-stone-800 font-medium pt-1">{action}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Clause Marketplace - Community Alternatives */}
          <div id="alternatives" className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-300 p-10">
            <div className="mb-8 pb-6 border-b border-purple-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px w-8 bg-purple-600"></div>
                <span className="mono text-xs text-purple-600 tracking-wider uppercase font-bold">Clause Marketplace</span>
              </div>
              <h3 className="text-4xl font-bold text-purple-900 mb-2">
                Community-Vetted Fair Alternatives
              </h3>
              <p className="text-purple-700 font-light leading-relaxed">
                See how others have negotiated fairer terms. These alternatives are ranked by legal experts and the community.
              </p>
            </div>

            <div className="space-y-6">
              {clauseAlternatives.slice(0, 3).map((alternative) => (
                <div key={alternative.id} className="bg-white border border-purple-200 p-6 rounded-sm hover:shadow-lg transition-shadow duration-300">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`px-3 py-1 text-xs uppercase font-bold tracking-wider rounded-full ${alternative.source === 'expert' ? 'bg-purple-600 text-white' :
                        alternative.source === 'legal_standard' ? 'bg-blue-600 text-white' :
                          'bg-green-600 text-white'
                        }`}>
                        {alternative.source === 'expert' ? '⚖️ Expert' :
                          alternative.source === 'legal_standard' ? '📚 Legal Standard' :
                            '👥 Community'}
                      </div>
                      <span className="text-sm text-purple-600 font-medium">
                        {alternative.votes.toLocaleString()} upvotes
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-red-700 uppercase tracking-wider font-bold mb-2">❌ Original (Unfair)</p>
                      <p className="text-sm text-stone-700 italic bg-red-50 border-l-4 border-red-400 p-3 leading-relaxed">
                        "{alternative.originalClause}"
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-green-700 uppercase tracking-wider font-bold mb-2">✓ Fairer Alternative</p>
                      <p className="text-sm text-stone-900 font-medium bg-green-50 border-l-4 border-green-500 p-3 leading-relaxed">
                        "{alternative.fairerVersion}"
                      </p>
                    </div>

                    <div className="bg-purple-50 border border-purple-200 p-4 rounded">
                      <p className="text-xs text-purple-900 uppercase tracking-wider font-bold mb-2">Why This Is Better</p>
                      <p className="text-sm text-purple-800 leading-relaxed">{alternative.explanation}</p>
                      {alternative.contributor && (
                        <p className="text-xs text-purple-600 mt-3 italic">— {alternative.contributor}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <button 
                onClick={() => setShowAllAlternatives(true)}
                className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors duration-300">
                <FileText className="w-5 h-5" />
                Browse All {clauseAlternatives.length} Fair Alternatives
              </button>
            </div>
          </div>

          {/* Browse All Alternatives Modal */}
          {showAllAlternatives && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowAllAlternatives(false)}>
              <div className="bg-white border-2 border-stone-900 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-white border-b-2 border-stone-900 p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-stone-900 flex items-center gap-3">
                      <FileText className="w-6 h-6 text-purple-600" />
                      Community-Vetted Fair Alternatives
                    </h3>
                  </div>
                  <button onClick={() => setShowAllAlternatives(false)} className="hover:bg-stone-100 p-2 rounded">
                    <X className="w-6 h-6 text-stone-500" />
                  </button>
                </div>
                
                <div className="p-6 space-y-6">
                  {clauseAlternatives.map((alternative) => (
                    <div key={alternative.id} className="border-2 border-stone-200 rounded-xl overflow-hidden hover:border-purple-300 transition-colors">
                      <div className="bg-stone-50 p-4 border-b-2 border-stone-200 flex justify-between items-center">
                        <span className="font-mono text-sm text-stone-600 uppercase tracking-widest">{alternative.source.replace('_', ' ')}</span>
                        <div className="flex gap-2">
                          <span className="px-3 py-1 bg-green-100 text-green-700 font-bold text-xs rounded-full">
                            Risk: Low
                          </span>
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 font-bold text-xs rounded-full flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            {alternative.votes.toLocaleString()} votes
                          </span>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="mb-6">
                          <p className="text-xs text-stone-500 uppercase tracking-wider font-bold mb-2">Recommended Clause Text</p>
                          <p className="text-stone-900 leading-relaxed font-serif text-lg">
                            &quot;{alternative.fairerVersion}&quot;
                          </p>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 p-4 rounded">
                          <p className="text-xs text-purple-900 uppercase tracking-wider font-bold mb-2">Why This Is Better</p>
                          <p className="text-sm text-purple-800 leading-relaxed">{alternative.explanation}</p>
                          {alternative.contributor && (
                            <p className="text-xs text-purple-600 mt-3 italic">&mdash; {alternative.contributor}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Version Comparison Modal */}
          {showCompareModal && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => !isComparing && setShowCompareModal(false)}>
              <div className="bg-white border-2 border-stone-900 max-w-5xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-white border-b-2 border-stone-900 p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-stone-900 flex items-center gap-3">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      Compare Contract Versions
                    </h3>
                    <p className="text-sm text-stone-600 mt-1">Upload a revised version to see what changed</p>
                  </div>
                  <button
                    onClick={() => setShowCompareModal(false)}
                    disabled={isComparing}
                    className="hover:bg-stone-100 p-2 rounded disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {!comparisonResult ? (
                    <div className="space-y-6">
                      <div className="bg-blue-50 border-2 border-blue-200 p-6 rounded-lg">
                        <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          Current Version
                        </h4>
                        <p className="text-blue-800 font-medium">{analysis.metadata.fileName}</p>
                        <p className="text-sm text-blue-600 mt-1">Risk Score: {analysis.riskScore}/100</p>
                      </div>

                      <div className="border-2 border-dashed border-stone-300 rounded-lg p-8 text-center">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.pdf,.doc,.docx"
                          onChange={(e) => setCompareFile(e.target.files?.[0] || null)}
                          className="hidden"
                          aria-label="Upload revised contract version"
                        />
                        {!compareFile ? (
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isComparing}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            <Upload className="w-5 h-5" />
                            Upload Revised Version
                          </button>
                        ) : (
                          <div className="space-y-4">
                            <div className="inline-flex items-center gap-3 px-4 py-2 bg-green-50 border border-green-300 rounded">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <span className="font-medium text-green-900">{compareFile.name}</span>
                            </div>
                            <div className="flex justify-center gap-3">
                              <button
                                onClick={handleCompareVersions}
                                disabled={isComparing}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                              >
                                {isComparing ? (
                                  <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    Analyzing...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    Compare Now
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => setCompareFile(null)}
                                disabled={isComparing}
                                className="px-6 py-3 border-2 border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
                              >
                                Choose Different File
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Comparison Header */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-stone-50 border-2 border-stone-200 p-4 rounded-lg text-center">
                          <p className="text-xs text-stone-600 uppercase tracking-wider mb-1">Risk Change</p>
                          <p className={`text-2xl font-bold ${comparisonResult.riskScoreChange.direction === 'improved' ? 'text-green-600' :
                            comparisonResult.riskScoreChange.direction === 'worsened' ? 'text-red-600' :
                              'text-stone-600'
                            }`}>
                            {comparisonResult.riskScoreChange.direction === 'improved' && '↓ '}
                            {comparisonResult.riskScoreChange.direction === 'worsened' && '↑ '}
                            {Math.abs(comparisonResult.riskScoreChange.delta).toFixed(0)} pts
                          </p>
                          <p className="text-sm text-stone-600 mt-1">
                            {comparisonResult.riskScoreChange.old} → {comparisonResult.riskScoreChange.new}
                          </p>
                        </div>

                        <div className="bg-green-50 border-2 border-green-200 p-4 rounded-lg text-center">
                          <p className="text-xs text-green-800 uppercase tracking-wider mb-1">Added Clauses</p>
                          <p className="text-2xl font-bold text-green-700">
                            {comparisonResult.clauseChanges.filter((c: any) => c.type === 'added').length}
                          </p>
                        </div>

                        <div className="bg-red-50 border-2 border-red-200 p-4 rounded-lg text-center">
                          <p className="text-xs text-red-800 uppercase tracking-wider mb-1">Removed Clauses</p>
                          <p className="text-2xl font-bold text-red-700">
                            {comparisonResult.clauseChanges.filter((c: any) => c.type === 'removed').length}
                          </p>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                        <h4 className="font-bold text-blue-900 mb-2">Summary</h4>
                        <p className="text-blue-800">{comparisonResult.summary}</p>
                      </div>

                      {/* Recommendations */}
                      {comparisonResult.recommendations.length > 0 && (
                        <div className="bg-amber-50 border-l-4 border-amber-500 p-4">
                          <h4 className="font-bold text-amber-900 mb-2">Recommendations</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {comparisonResult.recommendations.map((rec: string, i: number) => (
                              <li key={i} className="text-amber-800">{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Clause Changes */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-stone-900 text-lg">Detailed Changes</h4>

                        {comparisonResult.clauseChanges
                          .filter((change: any) => change.type !== 'unchanged')
                          .sort((a: any, b: any) => {
                            const order = { critical: 0, high: 1, medium: 2, low: 3 };
                            return order[a.significance as keyof typeof order] - order[b.significance as keyof typeof order];
                          })
                          .map((change: any, idx: number) => (
                            <div key={idx} className={`border-2 rounded-lg p-4 ${change.type === 'added' ? 'bg-green-50 border-green-300' :
                              change.type === 'removed' ? 'bg-red-50 border-red-300' :
                                'bg-blue-50 border-blue-300'
                              }`}>
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-bold text-stone-900">
                                  {change.type === 'added' && '+ '}
                                  {change.type === 'removed' && '- '}
                                  {change.type === 'modified' && '~ '}
                                  {change.newClause?.title || change.oldClause?.title}
                                </h5>
                                <span className={`px-2 py-1 text-xs font-bold uppercase rounded ${change.significance === 'critical' ? 'bg-red-600 text-white' :
                                  change.significance === 'high' ? 'bg-orange-600 text-white' :
                                    change.significance === 'medium' ? 'bg-yellow-600 text-white' :
                                      'bg-stone-400 text-white'
                                  }`}>
                                  {change.significance}
                                </span>
                              </div>

                              {change.type === 'modified' && change.riskChange && (
                                <div className={`text-sm font-medium mb-2 ${change.riskChange.direction === 'improved' ? 'text-green-700' :
                                  change.riskChange.direction === 'worsened' ? 'text-red-700' :
                                    'text-stone-700'
                                  }`}>
                                  Risk: {change.riskChange.old} → {change.riskChange.new}
                                  ({change.riskChange.direction})
                                </div>
                              )}

                              {change.type === 'modified' && change.textDiff && (
                                <div className="text-sm space-y-2 mt-2">
                                  {change.textDiff.additions.length > 0 && (
                                    <div>
                                      <p className="font-medium text-green-800">Added words:</p>
                                      <p className="text-green-700">{change.textDiff.additions.join(', ')}</p>
                                    </div>
                                  )}
                                  {change.textDiff.deletions.length > 0 && (
                                    <div>
                                      <p className="font-medium text-red-800">Removed words:</p>
                                      <p className="text-red-700">{change.textDiff.deletions.join(', ')}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {change.type !== 'modified' && (
                                <p className="text-sm text-stone-700 mt-2">
                                  {(change.newClause || change.oldClause).plainLanguage}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>

                      {/* Export Comparison Report */}
                      <div className="flex justify-center gap-3 pt-4 border-t-2 border-stone-200">
                        <button
                          onClick={async () => {
                            const { generateComparisonReport } = await import('@/lib/version-compare');
                            const report = generateComparisonReport(comparisonResult);
                            const blob = new Blob([report], { type: 'text/markdown' });
                            safeDownload(blob, `comparison-report-${Date.now()}.md`);
                          }}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                        >
                          <Download className="w-5 h-5" />
                          Export Comparison Report
                        </button>
                        <button
                          onClick={() => {
                            setComparisonResult(null);
                            setCompareFile(null);
                          }}
                          className="px-6 py-3 border-2 border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
                        >
                          Compare Another Version
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {toast && (
            <div className={`fixed bottom-6 right-6 z-[70] px-6 py-4 rounded-lg shadow-2xl border-2 animate-slide-up ${toast.type === 'success'
              ? 'bg-green-50 border-green-500 text-green-900'
              : 'bg-red-50 border-red-500 text-red-900'
              }`}>
              <div className="flex items-center gap-3">
                {toast.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                )}
                <span className="font-medium">{toast.message}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
