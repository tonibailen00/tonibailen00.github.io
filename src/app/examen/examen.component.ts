import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { StorageService, StoredQuiz } from '../storage.service';
import { UiService } from '../ui.service';

@Component({
  selector: 'app-examen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './examen.component.html',
  styleUrls: ['../pdf-quiz/pdf-quiz.component.scss', './examen.component.scss']
})
export class ExamenComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private storage = inject(StorageService);
    private document = inject(DOCUMENT);
    private ui = inject(UiService);

    quiz = signal<StoredQuiz | null>(null);
    quizzes = signal<StoredQuiz[]>([]);
    loading = signal(true);
    showExitModal = signal(false);
    
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
        this.loading.set(true);
        try {
            const allQuizzes = await this.storage.getQuizzes();
            this.quizzes.set(allQuizzes);
            this.quiz.set(null); // Reset single quiz view
        } catch (e) {
            console.error(e);
        } finally {
            this.loading.set(false);
        }
    }

    startExam(id: string) {
        this.router.navigate(['/examen'], { queryParams: { id } });
    }

    async loadQuizData(id: string) {
        this.loading.set(true);
        this.currentQuestionIndex.set(0);
        this.examFinished.set(false);
        this.userAnswers.set({});
        this.score.set(null);

        try {
            const data = await this.storage.getQuiz(id);
            if (data) {
                this.quiz.set(data);
                this.ui.isExamMode.set(true);
            }
        } catch(e) {
            console.error(e);
        } finally {
            this.loading.set(false);
        }
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

    requestExit() {
        if (this.quiz() && !this.examFinished()) {
            this.showExitModal.set(true);
        } else {
            this.confirmExit();
        }
    }

    confirmExit() {
        this.showExitModal.set(false);
        this.quiz.set(null);
        this.ui.isExamMode.set(false);
        this.router.navigate(['/examen']);
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
        this.router.navigate(['/cuestionarios']);
    }

    goToCreate() {
        this.router.navigate(['/crear']);
    }

    ngOnDestroy() {
        this.ui.isExamMode.set(false);
    }
}