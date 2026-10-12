/**
 * Export Utilities for Contract Templates
 * Provides PDF and DOCX export functionality for templates
 */

import { safeDownload } from '@/lib/download-utils';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

/**
 * Convert Markdown-style text to plain text for export
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse markdown content into structured sections
 */
interface Section {
  level: number;
  title: string;
  content: string;
}

function parseMarkdownSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        level: headerMatch[1].length,
        title: headerMatch[2],
        content: ''
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    } else {
      // Content before first header
      if (!sections.length || sections[sections.length - 1].title !== '') {
        sections.push({
          level: 0,
          title: '',
          content: line + '\n'
        });
      } else {
        sections[sections.length - 1].content += line + '\n';
      }
    }
  }
  
  // Add final section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Export template as PDF
 */
export async function exportAsPDF(templateName: string, content: string): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - (margin * 2);
  let yPosition = margin;

  // Helper to add new page if needed
  const checkPageBreak = (lineHeight: number) => {
    if (yPosition + lineHeight > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(templateName, margin, yPosition);
  yPosition += 12;

  // Process content
  const plainText = markdownToPlainText(content);
  const sections = parseMarkdownSections(content);

  for (const section of sections) {
    if (section.title) {
      checkPageBreak(10);
      
      // Section heading
      const fontSize = section.level === 1 ? 16 : section.level === 2 ? 14 : 12;
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'bold');
      doc.text(section.title, margin, yPosition);
      yPosition += fontSize / 2 + 2;
    }

    if (section.content.trim()) {
      checkPageBreak(7);
      
      // Section content
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const contentLines = section.content.trim().split('\n');
      for (const line of contentLines) {
        if (line.trim()) {
          const wrappedLines = doc.splitTextToSize(line, maxWidth);
          for (const wrappedLine of wrappedLines) {
            checkPageBreak(5);
            doc.text(wrappedLine, margin, yPosition);
            yPosition += 5;
          }
        } else {
          yPosition += 3; // Empty line spacing
        }
      }
      yPosition += 3; // Section spacing
    }
  }

  // Save the PDF
  doc.save(`${templateName.replace(/\s+/g, '-')}.pdf`);
}

/**
 * Export template as DOCX
 */
export async function exportAsDOCX(templateName: string, content: string): Promise<void> {
  const sections = parseMarkdownSections(content);
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: templateName,
      heading: HeadingLevel.TITLE,
      spacing: { after: 400 }
    })
  );

  // Process sections
  for (const section of sections) {
    if (section.title) {
      const headingLevel = 
        section.level === 1 ? HeadingLevel.HEADING_1 :
        section.level === 2 ? HeadingLevel.HEADING_2 :
        section.level === 3 ? HeadingLevel.HEADING_3 :
        HeadingLevel.HEADING_4;

      children.push(
        new Paragraph({
          text: section.title,
          heading: headingLevel,
          spacing: { before: 240, after: 120 }
        })
      );
    }

    if (section.content.trim()) {
      const contentLines = section.content.trim().split('\n');
      
      for (const line of contentLines) {
        if (line.trim()) {
          // Handle lists
          const listMatch = line.match(/^[\-\*]\s+(.+)$/);
          const numberedListMatch = line.match(/^\d+\.\s+(.+)$/);
          
          if (listMatch) {
            children.push(
              new Paragraph({
                text: listMatch[1],
                bullet: { level: 0 },
                spacing: { before: 60, after: 60 }
              })
            );
          } else if (numberedListMatch) {
            children.push(
              new Paragraph({
                text: numberedListMatch[1],
                numbering: { reference: 'default-numbering', level: 0 },
                spacing: { before: 60, after: 60 }
              })
            );
          } else {
            // Regular paragraph
            const runs: TextRun[] = [];
            
            // Simple bold/italic parsing
            const processedText = line;
            const boldMatches = line.match(/\*\*([^*]+)\*\*/g);
            
            if (boldMatches) {
              let lastIndex = 0;
              const regex = /\*\*([^*]+)\*\*/g;
              let match;
              
              while ((match = regex.exec(line)) !== null) {
                // Add text before bold
                if (match.index > lastIndex) {
                  runs.push(new TextRun(line.substring(lastIndex, match.index)));
                }
                // Add bold text
                runs.push(new TextRun({ text: match[1], bold: true }));
                lastIndex = regex.lastIndex;
              }
              // Add remaining text
              if (lastIndex < line.length) {
                runs.push(new TextRun(line.substring(lastIndex)));
              }
            } else {
              runs.push(new TextRun(line));
            }
            
            children.push(
              new Paragraph({
                children: runs,
                spacing: { before: 60, after: 60 }
              })
            );
          }
        } else {
          // Empty line
          children.push(new Paragraph({ text: '' }));
        }
      }
    }
  }

  // Create document
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  // Generate and download
  const blob = await Packer.toBlob(doc);
  safeDownload(blob, `${templateName.replace(/\s+/g, '-')}.docx`);
}

/**
 * Export template as Markdown
 */
export function exportAsMarkdown(templateName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown' });
  safeDownload(blob, `${templateName.replace(/\s+/g, '-')}.md`);
}
