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
    isEditing?: boolean;
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
    boldLines = signal<{ text: string; fontName: string; family: string; weight: string; color: any; isHighlighted: boolean; page: number }[]>([]);
    stylesList = signal<{ key: string; value: any }[]>([]);
    showQuestionsFlag = signal(false);

    // Exam Mode Signals
    isExamActive = signal(false);
    examFinished = signal(false);
    userAnswers = signal<Record<number, number>>({}); // questionId -> optionIndex
    score = signal<{ correct: number; total: number } | null>(null);

    // Modes for identifying correct answers: 
    // 'bold' -> font weight 700
    // 'explicit' -> "Respuesta: X" beneath question
    // 'highlight' -> yellow background/color
    parseMode = signal<'bold' | 'explicit' | 'highlight'>('bold');

    onFileChange(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const f = input.files?.[0];
        if (!f) return;
        this.file = f;
        this.text.set('');
        this.questions.set([]);
        this.visualized.set(false);
        this.isExamActive.set(false);
        this.examFinished.set(false);
    }

    async visualize() {
        if (!this.file) return;
        this.loading.set(true);
        try {
            const buffer = await this.file.arrayBuffer();
            const pdf = await getDocument({ data: buffer, disableWorker: true } as any).promise;

            console.log('PDF loaded:', pdf);

            type Item = { x: number; y: number; text: string; fontName: string; family: string; weight: string; color: any; isHighlighted: boolean; page: number };
            const items: Item[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);

                // Get Annotations (Highlight, Square, etc.) to detect actual highlighted backgrounds
                const annotations = await page.getAnnotations();
                const highlightRects: number[][] = [];
                for (const a of annotations) {
                    // Check if it's a Highlight annotation or a yellow-ish Square/Polygon
                    if (a.subtype === 'Highlight') {
                        if (a.rect) highlightRects.push(a.rect);
                    } else if (a.color && a.rect) {
                        // If it has color, check if it's yellowish
                        const r = a.color[0] || 0;
                        const g = a.color[1] || 0;
                        const b = a.color[2] || 0;
                        // RGB 0-255 scaling
                        const cR = r <= 1 ? r * 255 : r;
                        const cG = g <= 1 ? g * 255 : g;
                        const cB = b <= 1 ? b * 255 : b;
                        if (cR > 200 && cG > 200 && cB < 100) {
                            highlightRects.push(a.rect);
                        }
                    }
                }

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
                    const color = item.color || [0, 0, 0];
                    const text = (item.str || '').toString().trim();

                    if (!text) continue;

                    // Check if this text falls within any highlight rectangle
                    let isHighlighted = false;
                    for (const rect of highlightRects) {
                        // rect is [xMin, yMin, xMax, yMax]
                        // We add a tolerance because text y is usually the baseline
                        if (x >= rect[0] - 5 && x <= rect[2] + 5 && y >= rect[1] - 10 && y <= rect[3] + 10) {
                            isHighlighted = true;
                            break;
                        }
                    }

                    items.push({ x, y, text, fontName, family, weight, color, isHighlighted, page: i });
                }
            }

            if (!items.length) {
                this.boldLines.set([]);
                return;
            }

            // Group items by page, then cluster into lines by Y coordinate (tolerance)
            const yTolerance = 3;
            const linesOut: { text: string; fontName: string; family: string; weight: string; color: any; isHighlighted: boolean; page: number }[] = [];
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
                    // If any part of the line is highlighted, consider the whole line highlighted
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

            // Merge lines according to rules: numbered item "32.", letter option "a)",
            // or lines that do not end a sentence. Handle sequences longer than two lines.
            const merged: { text: string; fontName: string; family: string; weight: string; color: any; isHighlighted: boolean; page: number }[] = [];

            const isStructuralStart = (text: string) => {
                // If it has a hyphen, space is optional. If just a dot, space is required.
                const isNumbered = /^\s*\d+\.(?:-|\s+|$)/.test(text) && !/^\s*\d+\.\d/.test(text); // avoid decimals like 2.300
                const isLettered = /^\s*[a-eA-E]\)(?:\s+|$)/.test(text);
                const isExplicitAns = /^\s*(?:respuesta|soluci[oó]n|resp)\s*:\s*[a-eA-E]/i.test(text);
                return isNumbered || isLettered || isExplicitAns;
            };

            const shouldMergeText = (text: string) => {
                // match "45.", "34.-" or similar standalone numeric markers
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

                // Keep appending following lines while the current combined text signals it should merge
                while (j < linesOut.length && linesOut[j].page === start.page && shouldMergeText(combined)) {
                    // Stop merging immediately if the next line is the start of a completely new structural item
                    if (isStructuralStart(linesOut[j].text)) {
                        break;
                    }

                    combined = (combined + ' ' + linesOut[j].text).replace(/\s+/g, ' ').trim();
                    // prefer the metadata of the last appended part to match previous behavior
                    // but OR the highlight value to persist it
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

            // keep only lines that start with a number and dot (e.g. "32."), a letter and parenthesis (e.g. "a)"), or "Respuesta:" / "Solución:" depending on mode
            const mode = this.parseMode();
            const filteredMerged = merged.filter(l => {
                const isQuestionOrOption = (/^\s*\d+\.(?:-|\s+|$)/.test(l.text) && !/^\s*\d+\.\d/.test(l.text)) || /^\s*[a-eA-E]\)(?:\s+|$)/.test(l.text);
                const isExplicitAnswer = /^\s*(?:respuesta|soluci[oó]n|resp)\s*:\s*[a-eA-E]/i.test(l.text);

                if (mode === 'explicit') {
                    return isQuestionOrOption || isExplicitAnswer;
                }
                return isQuestionOrOption; // If not explicit mode, discard those answer lines
            });
            this.boldLines.set(filteredMerged);

            // Build QuizQuestion objects from the filtered lines
            const quizQuestions: QuizQuestion[] = [];
            let currentQuestion: QuizQuestion | null = null;

            for (const line of filteredMerged) {
                // If there's a hyphen, match even without space. If just a dot, require space/end, but avoid matching "2.300"
                const questionMatch = line.text.match(/^\s*(\d+)\.(?:-)?(?:\s*|$)(.*)/) && !/^\s*\d+\.\d/.test(line.text) ? line.text.match(/^\s*(\d+)\.(?:-)?(?:\s*|$)(.*)/) : null;
                const optionMatch = line.text.match(/^\s*([a-eA-E])\)(?:\s+|$)(.*)/);
                const answerMatch = line.text.match(/^\s*(?:respuesta|soluci[oó]n|resp)\s*:\s*([a-eA-E])\b/i);

                if (questionMatch) {
                    // Save previous question if exists
                    if (currentQuestion) {
                        quizQuestions.push(currentQuestion);
                    }
                    currentQuestion = {
                        id: parseInt(questionMatch[1], 10),
                        question: questionMatch[2].trim(),
                        options: [],
                    };
                } else if (optionMatch && currentQuestion) {
                    // Determine if this option is "correct"
                    let isCorrect = false;

                    if (mode === 'bold') {
                        isCorrect = this.fontWeightFor(line) === '700';
                    } else if (mode === 'highlight') {
                        // Check if it fell within an annotation bounds
                        if (line.isHighlighted) {
                            isCorrect = true;
                        } else {
                            // Fallback to text color if it somehow is colored directly
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
                    // It explicitly says "Respuesta: X" AND we are in explicit mode
                    const correctLetter = answerMatch[1].toLowerCase();
                    // Mark the option with that letter as correct
                    for (const opt of currentQuestion.options) {
                        if (opt.text.toLowerCase().startsWith(`${correctLetter})`)) {
                            opt.correct = true;
                        }
                    }
                }
            }
            // Push the last question
            if (currentQuestion) {
                quizQuestions.push(currentQuestion);
            }

            this.questions.set(quizQuestions);
            this.showQuestionsFlag.set(true);
        }
        catch (e) {
            console.error('Error visualizing PDF:', e);
        }
        finally {
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

    // CRUD Methods
    editQuestion(q: QuizQuestion) {
        q.isEditing = true;
        // Trigger signal update
        this.questions.set([...this.questions()]);
    }

    saveQuestion(q: QuizQuestion) {
        q.isEditing = false;
        this.questions.set([...this.questions()]);
    }

    deleteQuestion(q: QuizQuestion) {
        const current = this.questions();
        this.questions.set(current.filter(item => item !== q));
    }

    addNewQuestion() {
        const current = this.questions();
        const maxId = current.reduce((max, item) => Math.max(max, item.id), 0);
        const newQ: QuizQuestion = {
            id: maxId + 1,
            question: 'Nueva pregunta',
            options: [
                { text: 'a) Opción A', correct: true },
                { text: 'b) Opción B', correct: false },
                { text: 'c) Opción C', correct: false },
                { text: 'd) Opción D', correct: false }
            ],
            isEditing: true
        };
        this.questions.set([...current, newQ]);
        this.showQuestionsFlag.set(true);

        // Wait for DOM to append the new item and scroll to it
        setTimeout(() => {
            const listItems = document.querySelectorAll('.quiz-list ol .question-card');
            if (listItems.length > 0) {
                const lastItem = listItems[listItems.length - 1];
                lastItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);
    }

    addOption(q: QuizQuestion) {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const nextLetter = q.options.length < letters.length ? letters[q.options.length] : '?';
        q.options.push({ text: `${nextLetter}) Nueva opción`, correct: false });
        this.questions.set([...this.questions()]);
    }

    removeOption(q: QuizQuestion, index: number) {
        q.options.splice(index, 1);
        this.questions.set([...this.questions()]);
    }

    exportToJson() {
        const dataStr = JSON.stringify(this.questions(), null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cuestionario.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    importFromJson(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    // Check if items look like QuizQuestion
                    const isValid = parsed.every(p => 'id' in p && 'question' in p && 'options' in p && Array.isArray(p.options));
                    if (isValid) {
                        this.questions.set(parsed);
                        this.showQuestionsFlag.set(true);
                        this.isExamActive.set(false);
                        this.examFinished.set(false);
                    } else {
                        alert('El archivo JSON no tiene el formato correcto de cuestionario.');
                    }
                } else {
                    alert('El archivo JSON debe contener una lista de preguntas.');
                }
            } catch (err) {
                console.error('Error parsing JSON:', err);
                alert('No se pudo leer el archivo JSON.');
            }
        };
        reader.readAsText(file);
        // Reset input
        input.value = '';
    }

    // Exam Mode Methods
    startExam() {
        if (this.questions().length === 0) return;
        this.userAnswers.set({});
        this.examFinished.set(false);
        this.score.set(null);
        this.isExamActive.set(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    selectOption(questionId: number, optionIndex: number) {
        if (this.examFinished()) return;
        const current = this.userAnswers();
        this.userAnswers.set({ ...current, [questionId]: optionIndex });
    }

    finishExam() {
        const currentQuestions = this.questions();
        const answers = this.userAnswers();
        let correctCount = 0;

        currentQuestions.forEach(q => {
            const selectedIdx = answers[q.id];
            if (selectedIdx !== undefined) {
                if (q.options[selectedIdx]?.correct) {
                    correctCount++;
                }
            }
        });

        this.score.set({ correct: correctCount, total: currentQuestions.length });
        this.examFinished.set(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    resetExam() {
        this.isExamActive.set(false);
        this.examFinished.set(false);
        this.score.set(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}