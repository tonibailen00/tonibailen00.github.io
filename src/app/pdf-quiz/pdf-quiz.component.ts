import {
  Component,
  signal,
  computed,
  inject,
  ViewChildren,
  QueryList,
  ElementRef,
  OnInit,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PdfParserService, QuizQuestion, ParseMode } from '../services/pdf-parser.service';
import { StorageService, StoredQuiz } from '../services/storage.service';
import { NavigationService } from '../services/navigation.service';
import { UiService } from '../services/ui.service';

@Component({
  selector: 'pdf-quiz',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './pdf-quiz.component.html',
  styleUrls: ['./pdf-quiz.component.scss', '../../styles.scss'],
})
export class PdfQuizComponent implements OnInit {
  private pdfParser = inject(PdfParserService);
  private storage = inject(StorageService);
  private route = inject(ActivatedRoute);
  private navService = inject(NavigationService);
  private ui = inject(UiService);

  @ViewChildren('questionCard') questionCards!: QueryList<ElementRef>;

  text = signal('');
  loading = signal(false);
  quizTitle = signal('Cuestionario Nuevo');
  loadedQuizId = signal<string | null>(null);
  questions = signal<QuizQuestion[]>([]);
  file?: File;
  visualized = signal(false);
  showEditModal = signal(false);
  editingQuestion = signal<QuizQuestion | null>(null);
  isClosingModal = signal(false);
  isCreatingNew = signal(false);
  showImportModal = signal(false);
  savedQuizzes = signal<StoredQuiz[]>([]);
  selectedQuizToImport = signal<StoredQuiz | null>(null);
  selectedQuestionIdsToImport = signal<number[]>([]);
  searchQuery = signal('');
  hasSavedQuizzes = signal(false);

  filteredQuizzes = computed(() => {
    const query = this.searchQuery().toLowerCase();
    return this.savedQuizzes().filter((q) => q.title.toLowerCase().includes(query));
  });
  filteredQuestions = computed(() => {
    const quiz = this.selectedQuizToImport();
    if (!quiz) return [];
    const query = this.searchQuery().toLowerCase();
    return quiz.questions.filter((q) => q.question.toLowerCase().includes(query));
  });

  updateSearch(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  async ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      await this.ui.withLoading(this.loading, async () => {
        const qz = await this.storage.getQuiz(id);
        if (qz) {
          this.loadedQuizId.set(qz.id);
          this.quizTitle.set(qz.title);
          this.questions.set(qz.questions);
          this.visualized.set(true);
        } else {
          await this.ui.alert(
            'No se encontró el cuestionario para editar.',
            'Cuestionario no encontrado',
            'ph-bold ph-x-circle',
          );
        }
      });
    }
    const saved = await this.storage.getQuizzes();
    this.hasSavedQuizzes.set(saved.length > 0);
  }

  parseMode = signal<ParseMode>('bold');

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.file = f;
    this.quizTitle.set(f.name.replace(/\.[^/.]+$/, ''));
    this.text.set('');
    this.questions.set([]);
    this.visualized.set(false);
  }

  async visualize() {
    if (!this.file) return;

    await this.ui.withLoading(this.loading, async () => {
      const buffer = await this.file!.arrayBuffer();
      const mode = this.parseMode();
      const quizQuestions = await this.pdfParser.parsePdf(buffer, mode);

      this.questions.set(quizQuestions);
      this.visualized.set(true);
    });
  }

  editQuestion(q: QuizQuestion) {
    this.editingQuestion.set(JSON.parse(JSON.stringify(q)));
    this.isCreatingNew.set(false);
    this.showEditModal.set(true);
  }

  saveEditModal() {
    const edited = this.editingQuestion();
    if (!edited) return;

    const current = this.questions();
    edited.isEditing = false;

    if (this.isCreatingNew()) {
      this.questions.set([...current, edited]);
      setTimeout(() => {
        const lastItem = this.questionCards.last;
        if (lastItem)
          lastItem.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    } else {
      const idx = current.findIndex((q) => q.id === edited.id);
      if (idx > -1) {
        current[idx] = 'text' in edited ? edited : edited;
        this.questions.set([...current]);
      }
    }
    this.closeEditModal();
  }

  closeEditModal() {
    this.isClosingModal.set(true);
    setTimeout(() => {
      this.showEditModal.set(false);
      this.editingQuestion.set(null);
      this.isClosingModal.set(false);
    }, 300);
  }

  cancelEditModal() {
    this.closeEditModal();
  }

  async deleteQuestion(q: QuizQuestion) {
    const confirmed = await this.ui.confirm(
      '¿Seguro que quieres eliminar esta pregunta?',
      'Eliminar pregunta',
      'ph-bold ph-trash',
      'Eliminar',
    );
    if (confirmed) {
      const current = this.questions();
      this.questions.set(current.filter((item) => item !== q));
    }
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
        { text: 'd) Opción D', correct: false },
      ],
      isEditing: false,
    };
    this.editingQuestion.set(newQ);
    this.isCreatingNew.set(true);
    this.showEditModal.set(true);
  }

  addOption(q: QuizQuestion) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const nextLetter = q.options.length < letters.length ? letters[q.options.length] : '?';
    q.options.push({ text: `${nextLetter}) Nueva opción`, correct: false });
    this.editingQuestion.set({ ...q });
  }

  removeOption(q: QuizQuestion, index: number) {
    (q.options[index] as any)['_removing'] = true;
    this.editingQuestion.set({ ...q });
    
    setTimeout(() => {
        q.options.splice(index, 1);
        this.editingQuestion.set({ ...q });
    }, 280);
  }

  async openSaveModal() {
    if (!this.questions().length) return;
    const defaultTitle = this.quizTitle();

    const title = await this.ui.prompt(
      'Introduce un nombre para este cuestionario:',
      'Guardar Cuestionario',
      'Nombre...',
      defaultTitle,
      'ph-bold ph-floppy-disk',
    );

    if (title && title.trim()) {
      const newQuiz: StoredQuiz = {
        id: this.loadedQuizId() || crypto.randomUUID(),
        title: title.trim(),
        date: Date.now(),
        questions: this.questions(),
      };

      await this.ui.withLoading(this.loading, async () => {
        try {
          await this.storage.saveQuiz(newQuiz);
          const wasEditing = !!this.loadedQuizId();

          this.questions.set([]);
          this.quizTitle.set('Cuestionario Nuevo');
          this.loadedQuizId.set(null);
          this.file = undefined;

          await this.ui.alert(
            'El cuestionario se ha guardado con éxito.',
            '¡Guardado!',
            'ph-bold ph-check-circle',
          );

          if (wasEditing) {
            this.navService.goToCuestionarios();
          }
        } catch (e) {
          console.error(e);
          await this.ui.alert('Error guardando en el dispositivo.', 'Error', 'ph-bold ph-x-circle');
        }
      });
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
      this.selectedQuestionIdsToImport.set(current.filter((id) => id !== qId));
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

    selectedQuiz.questions.forEach((q) => {
      if (selectedIds.includes(q.id)) {
        newQuestions.push({
          ...JSON.parse(JSON.stringify(q)),
          id: ++maxId,
          isEditing: false,
        });
      }
    });

    this.questions.set([...currentQuestions, ...newQuestions]);

    setTimeout(() => {
      const lastItem = this.questionCards.last;
      if (lastItem) {
        lastItem.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);

    this.closeImportModal();
  }

  closeImportModal() {
    this.isClosingModal.set(true);
    setTimeout(() => {
      this.showImportModal.set(false);
      this.selectedQuizToImport.set(null);
      this.selectedQuestionIdsToImport.set([]);
      this.searchQuery.set('');
      this.isClosingModal.set(false);
    }, 300);
  }
}
