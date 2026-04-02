import { Injectable } from '@angular/core';
import { QuizQuestion } from './pdf-quiz/pdf-parser.service';

export interface StoredQuiz {
    id: string;
    title: string;
    date: number;
    questions: QuizQuestion[];
}

export interface ExamResult {
    id: string;
    quizId: string;
    quizTitle: string;
    date: number;
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
}

@Injectable({
    providedIn: 'root'
})
export class StorageService {
    private readonly DB_NAME = 'QuizApp_DB';
    private readonly DB_VERSION = 2; // Increment version
    private readonly STORE_QUIZZES = 'quizzes';
    private readonly STORE_RESULTS = 'results';

    private getDb(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = (event: any) => {
                const db: IDBDatabase = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_QUIZZES)) {
                    db.createObjectStore(this.STORE_QUIZZES, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.STORE_RESULTS)) {
                    const resultsStore = db.createObjectStore(this.STORE_RESULTS, { keyPath: 'id' });
                    resultsStore.createIndex('quizId', 'quizId', { unique: false });
                }
            };

            request.onsuccess = (event: any) => resolve(event.target.result);
            request.onerror = (event: any) => reject(event.target.error);
        });
    }

    async saveQuiz(quiz: StoredQuiz): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_QUIZZES, 'readwrite');
            const store = transaction.objectStore(this.STORE_QUIZZES);
            const request = store.put(quiz);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getQuizzes(): Promise<StoredQuiz[]> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_QUIZZES, 'readonly');
            const store = transaction.objectStore(this.STORE_QUIZZES);
            const request = store.getAll();

            request.onsuccess = () => {
                // Sort by date (newest first)
                const data = request.result as StoredQuiz[];
                resolve(data.sort((a, b) => b.date - a.date));
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getQuiz(id: string): Promise<StoredQuiz | undefined> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_QUIZZES, 'readonly');
            const store = transaction.objectStore(this.STORE_QUIZZES);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteQuiz(id: string): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_QUIZZES, 'readwrite');
            const store = transaction.objectStore(this.STORE_QUIZZES);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async saveResult(result: ExamResult): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_RESULTS, 'readwrite');
            const store = transaction.objectStore(this.STORE_RESULTS);
            const request = store.put(result);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getResults(): Promise<ExamResult[]> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_RESULTS, 'readonly');
            const store = transaction.objectStore(this.STORE_RESULTS);
            const request = store.getAll();

            request.onsuccess = () => {
                const data = request.result as ExamResult[];
                resolve(data.sort((a, b) => b.date - a.date)); // Newest first
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteResult(id: string): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_RESULTS, 'readwrite');
            const store = transaction.objectStore(this.STORE_RESULTS);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}