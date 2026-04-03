import { Routes } from '@angular/router';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: '/crear' },
	{ path: 'crear', loadComponent: () => import('./pdf-quiz/pdf-quiz.component').then(m => m.PdfQuizComponent), data: { animation: 'CrearPage' } },
	{ path: 'cuestionarios', loadComponent: () => import('./cuestionarios/cuestionarios.component').then(m => m.CuestionariosComponent), data: { animation: 'TestPage' } },
	{ path: 'examen', loadComponent: () => import('./examen/examen.component').then(m => m.ExamenComponent), data: { animation: 'ExamenPage' } },
	{ path: 'resultados', loadComponent: () => import('./resultados/resultados.component').then(m => m.ResultadosComponent), data: { animation: 'ResultadosPage' } }
];
