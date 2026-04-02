import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class FileService {
  private document = inject(DOCUMENT);

  /**
   * Exporta un objeto a un archivo JSON y fuerza su descarga.
   * @param filename El nombre del archivo (sin extensión).
   * @param data Los datos a exportar.
   */
  exportToJson(filename: string, data: any): void {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Lee el contenido de un archivo JSON y lo parsea.
   * @param file El archivo a leer.
   * @returns Una promesa que resuelve con el objeto JSON parseado.
   */
  async readJsonFile(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  }
}
