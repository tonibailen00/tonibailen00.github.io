import { Routes } from '@angular/router';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: '/pdf-quiz' },
	{ path: 'pdf-quiz', loadComponent: () => import('./pdf-quiz/pdf-quiz.component').then(m => m.PdfQuizComponent) },
];
