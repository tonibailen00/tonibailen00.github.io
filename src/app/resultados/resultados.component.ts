import { Component, signal, inject, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { StorageService, ExamResult } from '../services/storage.service';
import { NavigationService } from '../services/navigation.service';
import { UiService } from '../services/ui.service';

@Component({
  selector: 'app-resultados',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './resultados.component.html',
  styleUrls: ['./resultados.component.scss']
})
export class ResultadosComponent implements OnInit {
  private navService = inject(NavigationService);
  private storage = inject(StorageService);
  private ui = inject(UiService);

  results = signal<ExamResult[]>([]);
  loading = signal(true);

  async ngOnInit() {
    await this.loadResults();
  }

  async loadResults() {
    await this.ui.withLoading(this.loading, async () => {
      const data = await this.storage.getResults();
      this.results.set(data);
    });
  }

  getPercentage(res: ExamResult): number {
    if (!res.totalQuestions) return 0;
    return (res.correctAnswers / res.totalQuestions) * 100;
  }

  async deleteResult(id: string) {
    const confirmed = await this.ui.confirm('¿Eliminar este resultado del historial?', 'Eliminar historial', 'ph-bold ph-trash');
    if (confirmed) {
      await this.storage.deleteResult(id);
      await this.loadResults();
    }
  }

  goToExams() {
    this.navService.goToExamen();
  }
}
