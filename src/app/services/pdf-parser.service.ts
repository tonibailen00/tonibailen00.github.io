import { Injectable } from '@angular/core';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';

// We dynamically build the worker URL using the base href to support GitHub Pages subfolder deployments
const baseHref = typeof document !== 'undefined' ? (document.querySelector('base')?.getAttribute('href') || '/') : '/';
GlobalWorkerOptions.workerSrc = baseHref + (baseHref.endsWith('/') ? '' : '/') + 'pdf.worker.min.mjs';

export interface QuizQuestion {
    id: number;
    question: string;
    options: { text: string; correct: boolean }[];
    isEditing?: boolean;
}

export type ParseMode = 'bold' | 'explicit' | 'highlight';

type Item = { x: number; y: number; text: string; fontName: string; family: string; weight: string; color: any; isHighlighted: boolean; page: number };

interface ExtendedTextItem extends TextItem {
    color?: any;
}

@Injectable({
    providedIn: 'root'
})
export class PdfParserService {
    async parsePdf(buffer: ArrayBuffer, mode: ParseMode): Promise<QuizQuestion[]> {
        const pdf = await getDocument({ data: buffer }).promise;

        const items: Item[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);

            // Get Annotations
            const annotations = await page.getAnnotations();
            const highlightRects: number[][] = [];
            for (const a of annotations) {
                if (a.subtype === 'Highlight') {
                    if (a.rect) highlightRects.push(a.rect);
                } else if (a.color && a.rect) {
                    const r = a.color[0] || 0;
                    const g = a.color[1] || 0;
                    const b = a.color[2] || 0;
                    const cR = r <= 1 ? r * 255 : r;
                    const cG = g <= 1 ? g * 255 : g;
                    const cB = b <= 1 ? b * 255 : b;
                    if (cR > 200 && cG > 200 && cB < 100) {
                        highlightRects.push(a.rect);
                    }
                }
            }

            const content = await page.getTextContent() as TextContent;
            const styles = content.styles || {};

            for (const rawItem of content.items) {
                // Assert as ExtendedTextItem, ignore TextMarkedContent
                const item = rawItem as ExtendedTextItem;
                if (!('str' in item)) continue;

                const transform = item.transform || [];
                const x = transform[4] ?? 0;
                const y = transform[5] ?? 0;
                const fontName = item.fontName || '';
                const style = styles[fontName] || {};
                // @ts-ignore - style properties might not be strongly typed depending on pdfjs-dist version
                const family = (style.fontFamily || '') as string;
                // @ts-ignore
                const weight = (style.fontWeight || '') as string;
                const color = item.color || [0, 0, 0];
                const text = (item.str || '').toString().trim();

                if (!text) continue;

                let isHighlighted = false;
                for (const rect of highlightRects) {
                    if (x >= rect[0] - 5 && x <= rect[2] + 5 && y >= rect[1] - 10 && y <= rect[3] + 10) {
                        isHighlighted = true;
                        break;
                    }
                }

                items.push({ x, y, text, fontName, family, weight, color, isHighlighted, page: i });
            }
        }

        if (!items.length) {
            return [];
        }

        const yTolerance = 3;
        const linesOut: { text: string; fontName: string; family: string; weight: string; color: any; isHighlighted: boolean; page: number }[] = [];
        const itemsByPage = items.reduce((acc: Record<number, Item[]>, it) => {
            (acc[it.page] = acc[it.page] || []).push(it);
            return acc;
        }, {} as Record<number, Item[]>);

        for (const pageStr of Object.keys(itemsByPage)) {
            const pageItems = itemsByPage[Number(pageStr)];
            pageItems.sort((a, b) => {
                if (Math.abs(b.y - a.y) > 0.5) return b.y - a.y;
                return a.x - b.x;
            });

            const lines: { y: number; parts: Item[] }[] = [];
            for (const it of pageItems) {
                if (!lines.length) {
                    lines.push({ y: it.y, parts: [it] });
                    continue;
                }
                const last = lines[lines.length - 1];
                if (Math.abs(it.y - last.y) <= yTolerance) {
                    last.parts.push(it);
                } else {
                    lines.push({ y: it.y, parts: [it] });
                }
            }

            for (const ln of lines) {
                ln.parts.sort((a, b) => a.x - b.x);
                const text = ln.parts.map(p => p.text).join(' ').replace(/\s+/g, ' ').trim();
                if (!text) continue;
                const meta = ln.parts.find(p => p.fontName) || ln.parts[0];
                const isHighlighted = ln.parts.some(p => p.isHighlighted);

                linesOut.push({
                    text,
                    fontName: meta.fontName || '',
                    family: meta.family || '',
                    weight: meta.weight || '',
                    color: meta.color,
                    isHighlighted,
                    page: meta.page || Number(pageStr)
                });
            }
        }

        const merged: { text: string; fontName: string; family: string; weight: string; color: any; isHighlighted: boolean; page: number }[] = [];

        const isStructuralStart = (text: string) => {
            const isNumbered = /^\s*\d+\.(?:-|\s+|$)/.test(text) && !/^\s*\d+\.\d/.test(text);
            const isLettered = /^\s*[a-eA-E]\)(?:\s+|$)/.test(text);
            const isExplicitAns = /^\s*(?:respuesta|soluci[oó]n|resp)\s*:\s*[a-eA-E]/i.test(text);
            return isNumbered || isLettered || isExplicitAns;
        };

        const shouldMergeText = (text: string) => {
            const isNumberDot = /^\s*\d+\.(?:-|\s+|$)/.test(text) && !/^\s*\d+\.\d/.test(text);
            const isLetterParen = /^\s*[a-eA-E]\)\s*$/.test(text);
            const endsSentence = /[\.\!\?…]\s*$/.test(text);
            return isNumberDot || isLetterParen || !endsSentence;
        };

        let idx = 0;
        while (idx < linesOut.length) {
            const start = linesOut[idx];
            let combined = start.text;
            let meta = { fontName: start.fontName, family: start.family, weight: start.weight, color: start.color, isHighlighted: start.isHighlighted, page: start.page };
            let j = idx + 1;

            while (j < linesOut.length && linesOut[j].page === start.page && shouldMergeText(combined)) {
                if (isStructuralStart(linesOut[j].text)) {
                    break;
                }

                combined = (combined + ' ' + linesOut[j].text).replace(/\s+/g, ' ').trim();
                meta = {
                    fontName: linesOut[j].fontName,
                    family: linesOut[j].family,
                    weight: linesOut[j].weight,
                    color: linesOut[j].color,
                    isHighlighted: meta.isHighlighted || linesOut[j].isHighlighted,
                    page: linesOut[j].page
                };
                j++;
            }

            merged.push({ text: combined, fontName: meta.fontName, family: meta.family, weight: meta.weight, color: meta.color, isHighlighted: meta.isHighlighted, page: meta.page });
            idx = j;
        }

        const filteredMerged = merged.filter(l => {
            const isQuestionOrOption = (/^\s*\d+\.(?:-|\s+|$)/.test(l.text) && !/^\s*\d+\.\d/.test(l.text)) || /^\s*[a-eA-E]\)(?:\s+|$)/.test(l.text);
            const isExplicitAnswer = /^\s*(?:respuesta|soluci[oó]n|resp)\s*:\s*[a-eA-E]/i.test(l.text);

            if (mode === 'explicit') {
                return isQuestionOrOption || isExplicitAnswer;
            }
            return isQuestionOrOption;
        });

        const quizQuestions: QuizQuestion[] = [];
        let currentQuestion: QuizQuestion | null = null;

        for (const line of filteredMerged) {
            const questionMatch = line.text.match(/^\s*(\d+)\.(?:-)?(?:\s*|$)(.*)/) && !/^\s*\d+\.\d/.test(line.text) ? line.text.match(/^\s*(\d+)\.(?:-)?(?:\s*|$)(.*)/) : null;
            const optionMatch = line.text.match(/^\s*([a-eA-E])\)(?:\s+|$)(.*)/);
            const answerMatch = line.text.match(/^\s*(?:respuesta|soluci[oó]n|resp)\s*:\s*([a-eA-E])\b/i);

            if (questionMatch) {
                if (currentQuestion) {
                    quizQuestions.push(currentQuestion);
                }
                currentQuestion = {
                    id: parseInt(questionMatch[1], 10),
                    question: questionMatch[2].trim(),
                    options: [],
                };
            } else if (optionMatch && currentQuestion) {
                let isCorrect = false;

                if (mode === 'bold') {
                    isCorrect = this.fontWeightFor(line) === '700';
                } else if (mode === 'highlight') {
                    if (line.isHighlighted) {
                        isCorrect = true;
                    } else {
                        const c = line.color;
                        if (Array.isArray(c) && c.length === 3) {
                            const r = c[0] <= 1 ? c[0] * 255 : c[0];
                            const g = c[1] <= 1 ? c[1] * 255 : c[1];
                            const b = c[2] <= 1 ? c[2] * 255 : c[2];
                            isCorrect = (r > 200 && g > 200 && b < 100);
                        }
                    }
                }

                currentQuestion.options.push({
                    text: `${optionMatch[1]}) ${optionMatch[2].trim()}`,
                    correct: isCorrect,
                });
            } else if (answerMatch && currentQuestion && mode === 'explicit') {
                const correctLetter = answerMatch[1].toLowerCase();
                for (const opt of currentQuestion.options) {
                    if (opt.text.toLowerCase().startsWith(`${correctLetter})`)) {
                        opt.correct = true;
                    }
                }
            }
        }

        if (currentQuestion) {
            quizQuestions.push(currentQuestion);
        }

        return quizQuestions;
    }

    private fontWeightFor(item: { text: string; fontName: string; family: string; weight: string; page: number }): string {
        if (item.weight) {
            const n = Number(item.weight);
            if (!Number.isNaN(n)) return String(n);
            if (item.weight.toLowerCase() === 'bold') return '700';
        }
        const m = item.fontName.match(/f(\d+)$/i);
        if (m) {
            const v = Number(m[1]);
            if (!Number.isNaN(v)) return v >= 2 ? '700' : '400';
        }
        return '400';
    }
}