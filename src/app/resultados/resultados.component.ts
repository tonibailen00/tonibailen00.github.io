import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StorageService, ExamResult } from '../storage.service';

@Component({
  selector: 'app-resultados',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resultados.component.html',
  styleUrls: ['./resultados.component.scss']
})
export class ResultadosComponent implements OnInit {
  private router = inject(Router);
  private storage = inject(StorageService);

  results = signal<ExamResult[]>([]);
  loading = signal(true);

  async ngOnInit() {
    await this.loadResults();
  }

  async loadResults() {
    this.loading.set(true);
    try {
      const data = await this.storage.getResults();
      this.results.set(data);
    } catch (e) {
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  getPercentage(res: ExamResult): number {
    if (!res.totalQuestions) return 0;
    return (res.correctAnswers / res.totalQuestions) * 100;
  }

  async deleteResult(id: string) {
    if (confirm('¿Eliminar este resultado del historial?')) {
      await this.storage.deleteResult(id);
      await this.loadResults();
    }
  }

  goToExams() {
    this.router.navigate(['/examen']);
  }
}