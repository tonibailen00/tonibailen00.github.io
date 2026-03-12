import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf';

// Use a CDN URL matching the installed pdfjs-dist version. For offline or exact control,
// copy the worker file to `src/assets/pdf.worker.js` and point `GlobalWorkerOptions.workerSrc` to `/assets/pdf.worker.js`.
GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

interface QuizQuestion {
    id: number;
    question: string;
    options: { text: string; correct: boolean }[];
}

@Component({
    selector: 'pdf-quiz',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './pdf-quiz.component.html',
    styleUrls: ['./pdf-quiz.component.scss'],
})
export class PdfQuizComponent {
    text = signal('');
    loading = signal(false);
    questions = signal<QuizQuestion[]>([]);
    file?: File;
    visualized = signal(false);
    boldLines = signal<{ text: string; fontName: string; family: string; weight: string; page: number }[]>([]);
    stylesList = signal<{ key: string; value: any }[]>([]);
    showQuestionsFlag = signal(false);

    onFileChange(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const f = input.files?.[0];
        if (!f) return;
        this.file = f;
        this.text.set('');
        this.questions.set([]);
        this.visualized.set(false);
    }

    async visualize() {
        if (!this.file) return;
        this.loading.set(true);
        try {
            const buffer = await this.file.arrayBuffer();
            const pdf = await getDocument({ data: buffer, disableWorker: true } as any).promise;

            console.log('PDF loaded:', pdf);

            type Item = { x: number; y: number; text: string; fontName: string; family: string; weight: string; page: number };
            const items: Item[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content: any = await page.getTextContent();
                const styles = content.styles || {};
                for (const item of content.items) {
                    const transform = item.transform || [];
                    const x = transform[4] ?? 0;
                    const y = transform[5] ?? 0;
                    const fontName = item.fontName || '';
                    const style = styles[fontName] || {};
                    const family = (style.fontFamily || '') as string;
                    const weight = (style.fontWeight || '') as string;
                    const text = (item.str || '').toString().trim();
                    if (!text) continue;
                    items.push({ x, y, text, fontName, family, weight, page: i });
                }
            }

            if (!items.length) {
                this.boldLines.set([]);
                return;
            }

            // Group items by page, then cluster into lines by Y coordinate (tolerance)
            const yTolerance = 3;
            const linesOut: { text: string; fontName: string; family: string; weight: string; page: number }[] = [];
            const itemsByPage = items.reduce((acc: Record<number, Item[]>, it) => {
                (acc[it.page] = acc[it.page] || []).push(it);
                return acc;
            }, {} as Record<number, Item[]>);

            for (const pageStr of Object.keys(itemsByPage)) {
                const pageItems = itemsByPage[Number(pageStr)];
                // sort by y desc (top first) then x asc
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
                    linesOut.push({ text, fontName: meta.fontName || '', family: meta.family || '', weight: meta.weight || '', page: meta.page || Number(pageStr) });
                }
            }

            // Merge lines according to rules: numbered item "32.", letter option "a)",
            // or lines that do not end a sentence. Handle sequences longer than two lines.
            const merged: { text: string; fontName: string; family: string; weight: string; page: number }[] = [];
            const shouldMergeText = (text: string) => {
                // match "45.", "34.-" or similar standalone numeric markers
                const isNumberDot = /^\s*\d+\.(?:-)?\s*$/.test(text);
                const isLetterParen = /^\s*[a-dA-D]\)\s*$/.test(text);
                const endsSentence = /[\.\!\?…]\s*$/.test(text);
                return isNumberDot || isLetterParen || !endsSentence;
            };

            let idx = 0;
            while (idx < linesOut.length) {
                const start = linesOut[idx];
                let combined = start.text;
                let meta = { fontName: start.fontName, family: start.family, weight: start.weight, page: start.page };
                let j = idx + 1;

                const startIsNumbered = /^\s*\d+\.(?:-)?/.test(start.text);

                // Keep appending following lines while the current combined text signals it should merge
                while (j < linesOut.length && linesOut[j].page === start.page && shouldMergeText(combined)) {
                    // If we started from a numbered question, do NOT absorb a following lettered option (e.g. "a)")
                    if (startIsNumbered && /^\s*[a-dA-D]\)/.test(linesOut[j].text)) {
                        break;
                    }

                    combined = (combined + ' ' + linesOut[j].text).replace(/\s+/g, ' ').trim();
                    // prefer the metadata of the last appended part to match previous behavior
                    meta = { fontName: linesOut[j].fontName, family: linesOut[j].family, weight: linesOut[j].weight, page: linesOut[j].page };
                    j++;
                }

                merged.push({ text: combined, fontName: meta.fontName, family: meta.family, weight: meta.weight, page: meta.page });
                idx = j;
            }

            // keep only lines that start with a number and dot (e.g. "32.") or a letter and parenthesis (e.g. "a)")
            const filteredMerged = merged.filter(l => /^\s*\d+\.(?:-)?/.test(l.text) || /^\s*[a-dA-D]\)/.test(l.text));
            this.boldLines.set(filteredMerged);
        }
        catch (e) {
            console.error('Error visualizing PDF:', e);
        }
        finally {
            this.loading.set(false);
        }
    }

    async showStyles() {
        if (!this.file) return;
        this.loading.set(true);
        this.stylesList.set([]);
        try {
            const buffer = await this.file.arrayBuffer();
            const pdf = await getDocument({ data: buffer, disableWorker: true } as any).promise;
            const map = new Map<string, any>();
            const fontNames = new Set<string>();
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content: any = await page.getTextContent();
                const styles = content.styles || {};
                for (const k of Object.keys(styles)) {
                    if (!map.has(k)) map.set(k, styles[k]);
                }
                for (const item of content.items || []) {
                    if (item.fontName) fontNames.add(item.fontName);
                }
            }
            // include fontName keys as entries
            for (const fn of Array.from(fontNames)) {
                map.set(`fontName:${fn}`, null);
            }
            const out = Array.from(map.entries()).map(([key, value]) => ({ key, value }));
            this.stylesList.set(out);
        } catch (e) {
            console.error('Styles extraction error', e);
            this.stylesList.set([]);
        } finally {
            this.loading.set(false);
        }
    }

    fontWeightFor(item: { text: string; fontName: string; family: string; weight: string; page: number }) {
        // Prefer explicit numeric/string weight if available
        if (item.weight) {
            const n = Number(item.weight);
            if (!Number.isNaN(n)) return String(n);
            if (item.weight.toLowerCase() === 'bold') return '700';
        }
        // Heuristic: font names ending with f2/f3 -> bolder
        const m = item.fontName.match(/f(\d+)$/i);
        if (m) {
            const v = Number(m[1]);
            if (!Number.isNaN(v)) return v >= 2 ? '700' : '400';
        }
        // fallback
        return '400';
    }
}