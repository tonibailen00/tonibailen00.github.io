import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private router = inject(Router);

  /** Navega a la lista de cuestionarios guardados */
  goToCuestionarios(): void {
    this.router.navigate(['/cuestionarios']);
  }

  /** Navega a la vista de creación/edición de cuestionarios */
  goToCreate(quizId?: string): void {
    if (quizId) {
      this.router.navigate(['/crear'], { queryParams: { id: quizId } });
    } else {
      this.router.navigate(['/crear']);
    }
  }

  /** Navega a la vista de inicio del examen (o a realizar uno concreto) */
  goToExamen(quizId?: string): void {
    if (quizId) {
      this.router.navigate(['/examen'], { queryParams: { id: quizId } });
    } else {
      this.router.navigate(['/examen']);
    }
  }
}
