import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { StorageService, StoredQuiz } from '../storage.service';

@Component({
  selector: 'app-cuestionarios',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cuestionarios.component.html',
  styleUrls: ['./cuestionarios.component.scss']
})
export class CuestionariosComponent implements OnInit {
    private storage = inject(StorageService);
    private router = inject(Router);
    private document = inject(DOCUMENT);

    quizzes = signal<StoredQuiz[]>([]);
    loading = signal(true);

    // Import Prompt state
    showImportPrompt = signal(false);
    importPromptTitle = signal('');
    pendingImportData = signal<any[] | null>(null);

    async ngOnInit() {
        await this.loadQuizzes();
    }

    async loadQuizzes() {
        this.loading.set(true);
        try {
            const data = await this.storage.getQuizzes();
            this.quizzes.set(data);
        } catch(e) {
            console.error('Error cargando cuestionarios:', e);
        } finally {
            this.loading.set(false);
        }
    }

    async deleteQuiz(id: string) {
        if(confirm('¿Estás seguro de que quieres eliminar este cuestionario de tu dispositivo?')) {
            await this.storage.deleteQuiz(id);
            await this.loadQuizzes(); // Recargar la lista
        }
    }

    startExam(id: string) {
        // Navegamos a la vista del examen pasando el ID en la URL (ej: /examen?id=123)
        this.router.navigate(['/examen'], { queryParams: { id } });
    }

    editQuiz(id: string) {
        // Navegamos a la vista de creación pasando el ID para cargar el test
        this.router.navigate(['/crear'], { queryParams: { id } });
    }

    goToCreate() {
        this.router.navigate(['/crear']);
    }

    exportToJson(quiz: StoredQuiz) {
        const dataStr = JSON.stringify(quiz, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = this.document.createElement('a');
        a.href = url;
        a.download = `${quiz.title.replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importFromJson(ev: Event) {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                let parsed = JSON.parse(content);
                
                // Allow importing either a single StoredQuiz or an array of QuizQuestions
                if (Array.isArray(parsed) && parsed.every(p => 'id' in p && 'question' in p)) {
                    // Start Prompt flow
                    this.importPromptTitle.set('Cuestionario Importado');
                    this.pendingImportData.set(parsed);
                    this.showImportPrompt.set(true);
                } else if ('id' in parsed && 'title' in parsed && Array.isArray(parsed.questions)) {
                    // It's a StoredQuiz object, save directly but generate a new internal ID to allow duplicates
                    const newQuiz: StoredQuiz = {
                        ...parsed,
                        id: crypto.randomUUID(), 
                        date: Date.now()
                    };
                    await this.storage.saveQuiz(newQuiz);
                    // Instead of simple alert:
                    if(typeof window !== 'undefined' && 'Notification' in window) {
                       // simple ui notification or let's use standard alert for success/fail as we only modify inputs
                       alert('¡Cuestionario importado con éxito!');
                    }
                    this.loadQuizzes();
                } else {
                    alert('El archivo JSON no tiene un formato soportado.');
                }
            } catch (err) {
                console.error('Error parsing JSON:', err);
                alert('No se pudo leer o importar el archivo JSON.');
            }
        };
        reader.readAsText(file);
        // Reset input for same file upload later
        input.value = '';
    }

    closeImportPrompt() {
        this.showImportPrompt.set(false);
        this.pendingImportData.set(null);
    }
    
    updateImportPromptTitle(event: Event) {
       const el = event.target as HTMLInputElement;
       this.importPromptTitle.set(el.value);
    }

    async confirmImportPrompt() {
      const data = this.pendingImportData();
      const title = this.importPromptTitle().trim();
      if(!data || !title) return;

      const newQuiz: StoredQuiz = {
          id: crypto.randomUUID(),
          title: title,
          date: Date.now(),
          questions: data
      };
      
      try {
          await this.storage.saveQuiz(newQuiz);
          this.closeImportPrompt();
          alert('¡Cuestionario importado con éxito!');
          this.loadQuizzes();
      } catch(e) {
          console.error(e);
          alert('Error al grabar el cuestionario.');
      }
    }
}