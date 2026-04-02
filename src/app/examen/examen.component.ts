import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { StorageService, StoredQuiz } from '../services/storage.service';
import { UiService } from '../services/ui.service';
import { NavigationService } from '../services/navigation.service';

@Component({
    selector: 'app-examen',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './examen.component.html',
    styleUrls: ['./examen.component.scss', '../../styles.scss']
})
export class ExamenComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private navService = inject(NavigationService);
    private storage = inject(StorageService);
    private document = inject(DOCUMENT);
    private ui = inject(UiService);

    quiz = signal<StoredQuiz | null>(null);
    quizzes = signal<StoredQuiz[]>([]);
    loading = signal(true);

    // Exam Data
    currentQuestionIndex = signal(0);
    examFinished = signal(false);
    userAnswers = signal<Record<number, number>>({});
    score = signal<{ correct: number; total: number } | null>(null);

    async ngOnInit() {
        this.route.queryParams.subscribe(async params => {
            const id = params['id'];
            if (id) {
                await this.loadQuizData(id);
            } else {
                await this.loadAllQuizzes();
            }
        });
    }

    async loadAllQuizzes() {
        await this.ui.withLoading(this.loading, async () => {
            const allQuizzes = await this.storage.getQuizzes();
            this.quizzes.set(allQuizzes);
            this.quiz.set(null); // Reset single quiz view
        });
    }

    startExam(id: string) {
        this.navService.goToExamen(id);
    }

    async loadQuizData(id: string) {
        this.currentQuestionIndex.set(0);
        this.examFinished.set(false);
        this.userAnswers.set({});
        this.score.set(null);

        await this.ui.withLoading(this.loading, async () => {
            const data = await this.storage.getQuiz(id);
            if (data) {
                this.quiz.set(data);
                this.ui.isExamMode.set(true);
            }
        });
    }

    selectOption(questionId: number, optionIndex: number) {
        if (this.examFinished()) return;
        const current = this.userAnswers();
        this.userAnswers.set({ ...current, [questionId]: optionIndex });
    }

    isCorrect(qId: number, qz: StoredQuiz): boolean {
        const optionIdx = this.userAnswers()[qId];
        if (optionIdx === undefined) return false;

        const q = qz.questions.find(x => x.id === qId);
        if (!q) return false;

        return q.options[optionIdx]?.correct === true;
    }

    goToQuestion(index: number) {
        this.currentQuestionIndex.set(index);
    }

    async requestExit() {
        if (this.quiz() && !this.examFinished()) {
            const confirmed = await this.ui.confirm('¿Estás seguro de que quieres salir? Tu progreso actual se perderá.', 'Abandonar examen', 'ph-bold ph-warning', 'Salir y perder progreso');
            if (confirmed) {
                this.confirmExit();
            }
        } else {
            this.confirmExit();
        }
    }

    confirmExit() {
        this.quiz.set(null);
        this.ui.isExamMode.set(false);
        this.navService.goToExamen();
    }

    async finishExam(qz: StoredQuiz) {
        const answers = this.userAnswers();
        let correctCount = 0;

        qz.questions.forEach(q => {
            const selectedIdx = answers[q.id];
            if (selectedIdx !== undefined) {
                if (q.options[selectedIdx]?.correct) {
                    correctCount++;
                }
            }
        });

        const totalQuestions = qz.questions.length;
        this.score.set({ correct: correctCount, total: totalQuestions });
        this.examFinished.set(true);
        this.document.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });

        // Guardar resultado
        try {
            await this.storage.saveResult({
                id: crypto.randomUUID(),
                quizId: qz.id,
                quizTitle: qz.title,
                date: Date.now(),
                score: correctCount,
                totalQuestions: totalQuestions,
                correctAnswers: correctCount,
                incorrectAnswers: totalQuestions - correctCount
            });
        } catch (e) {
            console.error('Error al guardar el resultado:', e);
        }
    }

    goToQuizzes() {
        this.navService.goToCuestionarios();
    }

    goToCreate() {
        this.navService.goToCreate();
    }

    ngOnDestroy() {
        this.ui.isExamMode.set(false);
    }
}
