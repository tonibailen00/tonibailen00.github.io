import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService, StoredQuiz } from '../services/storage.service';
import { FileService } from '../services/file.service';
import { NavigationService } from '../services/navigation.service';
import { UiService } from '../services/ui.service';

@Component({
    selector: 'app-cuestionarios',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './cuestionarios.component.html',
    styleUrls: ['./cuestionarios.component.scss', '../../styles.scss']
})
export class CuestionariosComponent implements OnInit {
    private storage = inject(StorageService);
    private navService = inject(NavigationService);
    private fileService = inject(FileService);
    private uiService = inject(UiService);

    quizzes = signal<StoredQuiz[]>([]);
    loading = signal(true);

    async ngOnInit() {
        await this.loadQuizzes();
    }

    async loadQuizzes() {
        await this.uiService.withLoading(this.loading, async () => {
            const data = await this.storage.getQuizzes();
            this.quizzes.set(data);
        });
    }

    async deleteQuiz(id: string) {
        const confirmed = await this.uiService.confirm('¿Estás seguro de que quieres eliminar este cuestionario de tu dispositivo?', 'Eliminar cuestionario', 'ph-bold ph-trash');
        if (confirmed) {
            await this.storage.deleteQuiz(id);
            await this.loadQuizzes(); // Recargar la lista
        }
    }

    editQuiz(id: string) {
        // Navegamos a la vista de creación pasando el ID para cargar el test
        this.navService.goToCreate(id);
    }

    goToCreate() {
        this.navService.goToCreate();
    }

    exportToJson(quiz: StoredQuiz) {
        this.fileService.exportToJson(quiz.title, quiz);
    }

    async importFromJson(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        try {
            const parsed = await this.fileService.readJsonFile(file);

            // Allow importing either a single StoredQuiz or an array of QuizQuestions
            if (Array.isArray(parsed) && parsed.every(p => 'id' in p && 'question' in p)) {
                // Prompt user using unified dialog
                const title = await this.uiService.prompt(
                    'Se ha detectado una lista de preguntas. Introduce un nombre para este nuevo cuestionario:',
                    'Importar lista', 'Nombre...', 'Cuestionario Importado', 'ph-bold ph-download-simple'
                );

                if (title && title.trim()) {
                    const newQuiz: StoredQuiz = {
                        id: crypto.randomUUID(),
                        title: title.trim(),
                        date: Date.now(),
                        questions: parsed
                    };
                    await this.storage.saveQuiz(newQuiz);
                    await this.uiService.alert('¡Cuestionario importado con éxito!', 'Éxito', 'ph-bold ph-check-circle');
                    this.loadQuizzes();
                }
            } else if ('id' in parsed && 'title' in parsed && Array.isArray(parsed.questions)) {
                // It's a StoredQuiz object, save directly but generate a new internal ID to allow duplicates
                const newQuiz: StoredQuiz = {
                    ...parsed,
                    id: crypto.randomUUID(),
                    date: Date.now()
                };
                await this.storage.saveQuiz(newQuiz);
                await this.uiService.alert('¡Cuestionario importado con éxito!', 'Éxito', 'ph-bold ph-check-circle');
                this.loadQuizzes();
            } else {
                await this.uiService.alert('El archivo JSON no tiene un formato soportado.', 'Formato incorrecto', 'ph-bold ph-x-circle');
            }
        } catch (err) {
            console.error('Error parsing JSON:', err);
            await this.uiService.alert('No se pudo leer o importar el archivo JSON.', 'Error', 'ph-bold ph-warning-circle');
        } finally {
            // Reset input for same file upload later
            input.value = '';
        }
    }
}
