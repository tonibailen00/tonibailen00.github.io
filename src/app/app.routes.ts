import { Routes } from '@angular/router';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: '/crear' },
	{ path: 'crear', loadComponent: () => import('./pdf-quiz/pdf-quiz.component').then(m => m.PdfQuizComponent) },
	{ path: 'cuestionarios', loadComponent: () => import('./cuestionarios/cuestionarios.component').then(m => m.CuestionariosComponent) },
	{ path: 'examen', loadComponent: () => import('./examen/examen.component').then(m => m.ExamenComponent) },
	{ path: 'resultados', loadComponent: () => import('./resultados/resultados.component').then(m => m.ResultadosComponent) }
];
