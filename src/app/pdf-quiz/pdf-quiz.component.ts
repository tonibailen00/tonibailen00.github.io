import { Component, signal, computed, inject, ViewChildren, QueryList, ElementRef, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PdfParserService, QuizQuestion, ParseMode } from './pdf-parser.service';
import { StorageService, StoredQuiz } from '../storage.service';

@Component({
    selector: 'pdf-quiz',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './pdf-quiz.component.html',
    styleUrls: ['./pdf-quiz.component.scss'],
})
export class PdfQuizComponent implements OnInit {
    private pdfParser = inject(PdfParserService);
    private document = inject(DOCUMENT);
    private storage = inject(StorageService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    @ViewChildren('questionCard') questionCards!: QueryList<ElementRef>;

    text = signal('');
    loading = signal(false);
    quizTitle = signal('Cuestionario Nuevo');
    loadedQuizId = signal<string | null>(null);
    questions = signal<QuizQuestion[]>([]);
    file?: File;
    visualized = signal(false);

    // Import modal state
    showImportModal = signal(false);
    savedQuizzes = signal<StoredQuiz[]>([]);
    selectedQuizToImport = signal<StoredQuiz | null>(null);
    selectedQuestionIdsToImport = signal<number[]>([]);
    
    // Save modal state
    showSaveModal = signal(false);
    saveModalTitleInput = signal('');
    
    // Search state
    searchQuery = signal('');
    filteredQuizzes = computed(() => {
        const query = this.searchQuery().toLowerCase();
        return this.savedQuizzes().filter(q => q.title.toLowerCase().includes(query));
    });
    filteredQuestions = computed(() => {
        const quiz = this.selectedQuizToImport();
        if (!quiz) return [];
        const query = this.searchQuery().toLowerCase();
        return quiz.questions.filter(q => q.question.toLowerCase().includes(query));
    });

    updateSearch(ev: Event) {
        const input = ev.target as HTMLInputElement;
        this.searchQuery.set(input.value);
    }

    async ngOnInit() {
        // Al cargar, verificar si venimos de "editar" (con un id por query param)
        const id = this.route.snapshot.queryParamMap.get('id');
        if (id) {
            this.loading.set(true);
            try {
                const qz = await this.storage.getQuiz(id);
                if (qz) {
                    this.loadedQuizId.set(qz.id);
                    this.quizTitle.set(qz.title);
                    this.questions.set(qz.questions);
                    this.visualized.set(true); // Simula que ya procesamos el layout base
                } else {
                    alert('No se encontró el cuestionario para editar.');
                }
            } catch (err) {
                console.error(err);
                alert('Error al cargar cuestionario.');
            } finally {
                this.loading.set(false);
            }
        }
    }

    // Modes for identifying correct answers: 
    // 'bold' -> font weight 700
    // 'explicit' -> "Respuesta: X" beneath question
    // 'highlight' -> yellow background/color
    parseMode = signal<ParseMode>('bold');

    onFileChange(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const f = input.files?.[0];
        if (!f) return;
        this.file = f;
        // set title defaulting from filename without extension
        this.quizTitle.set(f.name.replace(/\.[^/.]+$/, ""));
        this.text.set('');
        this.questions.set([]);
        this.visualized.set(false);
    }

    async visualize() {
        if (!this.file) return;
        this.loading.set(true);

        try {
            const buffer = await this.file.arrayBuffer();
            const mode = this.parseMode();
            const quizQuestions = await this.pdfParser.parsePdf(buffer, mode);

            this.questions.set(quizQuestions);
            this.visualized.set(true);
        }
        catch (e) {
            console.error('Error visualizing PDF:', e);
        }
        finally {
            this.loading.set(false);
        }
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
        // Wait for DOM to append the new item and scroll to it
        setTimeout(() => {
            const lastItem = this.questionCards.last;
            if (lastItem) {
                lastItem.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    openSaveModal() {
        this.saveModalTitleInput.set(this.quizTitle());
        this.showSaveModal.set(true);
    }

    closeSaveModal() {
        this.showSaveModal.set(false);
    }

    updateSaveModalTitle(event: Event) {
        const input = event.target as HTMLInputElement;
        this.saveModalTitleInput.set(input.value);
    }

    async confirmSave() {
        const qTitle = this.saveModalTitleInput().trim();
        if (!qTitle) return;

        const newQuiz = {
            id: this.loadedQuizId() || crypto.randomUUID(),
            title: qTitle,
            date: Date.now(),
            questions: this.questions()
        };

        try {
            await this.storage.saveQuiz(newQuiz);
            
            const wasEditing = !!this.loadedQuizId();
            
            // Mostraríamos una alerta, pero podemos simplemente limpiar
            this.questions.set([]);
            this.quizTitle.set('Cuestionario Nuevo');
            this.loadedQuizId.set(null);
            this.file = undefined;
            this.showSaveModal.set(false);
            
            // Navigate back to the test list if we were editing an existing one
            if (wasEditing) {
                this.router.navigate(['/cuestionarios']);
            }
        } catch (e) {
            console.error(e);
            alert('Error guardando en el dispositivo.');
        }
    }

    async openImportModal() {
        try {
            const quizzes = await this.storage.getQuizzes();
            this.savedQuizzes.set(quizzes);
            this.selectedQuizToImport.set(null);
            this.searchQuery.set('');
            this.showImportModal.set(true);
        } catch (e) {
            console.error('Error fetching quizzes for import:', e);
        }
    }

    selectQuizForImport(quiz: StoredQuiz) {
        this.selectedQuizToImport.set(quiz);
        this.selectedQuestionIdsToImport.set([]);
        this.searchQuery.set('');
    }

    toggleQuestionSelection(qId: number) {
        const current = this.selectedQuestionIdsToImport();
        if (current.includes(qId)) {
            this.selectedQuestionIdsToImport.set(current.filter(id => id !== qId));
        } else {
            this.selectedQuestionIdsToImport.set([...current, qId]);
        }
    }

    importSelectedQuestions() {
        const selectedQuiz = this.selectedQuizToImport();
        if (!selectedQuiz) return;

        const currentQuestions = this.questions();
        const selectedIds = this.selectedQuestionIdsToImport();
        let maxId = currentQuestions.reduce((max, item) => Math.max(max, item.id), 0);

        const newQuestions: QuizQuestion[] = [];
        
        selectedQuiz.questions.forEach(q => {
            if (selectedIds.includes(q.id)) {
                newQuestions.push({
                    ...JSON.parse(JSON.stringify(q)),
                    id: ++maxId,
                    isEditing: false
                });
            }
        });

        this.questions.set([...currentQuestions, ...newQuestions]);
        
        // Wait and scroll
        setTimeout(() => {
            const lastItem = this.questionCards.last;
            if (lastItem) {
                lastItem.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 50);

        // Go back to the quiz list after importing
        this.selectedQuizToImport.set(null);
        this.showImportModal.set(false);
    }

    closeImportModal() {
        this.showImportModal.set(false);
        this.selectedQuizToImport.set(null);
        this.selectedQuestionIdsToImport.set([]);
        this.searchQuery.set('');
    }
}