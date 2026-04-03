import { Injectable, signal, WritableSignal } from '@angular/core';

export type DialogType = 'alert' | 'confirm' | 'prompt';

export interface DialogState {
    type: DialogType;
    title: string;
    message: string;
    icon?: string;
    confirmText?: string;
    inputPlaceholder?: string;
    inputValue?: string;
    onConfirm?: (value?: string) => void;
    onCancel?: () => void;
}

@Injectable({
    providedIn: 'root'
})
export class UiService {
    isExamMode = signal(false);
    dialogState = signal<DialogState | null>(null);
    isClosing = signal(false);

    /** Muestra una alerta simple */
    alert(message: string, title = 'Aviso', icon = 'ph-bold ph-warning', confirmText = 'Aceptar'): Promise<void> {
        return new Promise((resolve) => {
            this.dialogState.set({
                type: 'alert', title, message, icon, confirmText,
                onConfirm: () => { resolve(); },
                onCancel: () => { resolve(); } // Cancel for alert also resolves
            });
        });
    }

    /** Muestra un diálogo de confirmación y devuelve true/false */
    confirm(message: string, title = 'Confirmar', icon = 'ph-bold ph-question', confirmText = 'Confirmar'): Promise<boolean> {
        return new Promise((resolve) => {
            this.dialogState.set({
                type: 'confirm', title, message, icon, confirmText,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    }

    /** Muestra un prompt pidiendo un string y devuelve el valor introducido o null si se cancela */
    prompt(message: string, title = 'Introducir valor', placeholder = '', defaultValue = '', icon = 'ph-bold ph-download-simple', confirmText = 'Aceptar'): Promise<string | null> {
        return new Promise((resolve) => {
            this.dialogState.set({
                type: 'prompt', title, message, icon, confirmText,
                inputPlaceholder: placeholder,
                inputValue: defaultValue,
                onConfirm: (val) => resolve(val || ''),
                onCancel: () => resolve(null)
            });
        });
    }

    /** Cierra el diálogo actual con animación */
    clearDialog() {
        this.isClosing.set(true);
        setTimeout(() => {
            this.dialogState.set(null);
            this.isClosing.set(false);
        }, 300); // 300ms coincides with the exit animation duration
    }

    /**
     * Envuelve una acción asíncrona para manejar el estado de un signal 'loading'.
     * Activa el loading, ejecuta la acción, captura errores si los hay, y finalmente desactiva el loading.
     */
    async withLoading<T>(loadingSignal: WritableSignal<boolean>, action: () => Promise<T>): Promise<T | void> {
        loadingSignal.set(true);
        try {
            return await action();
        } catch (e) {
            console.error('Error during async operation:', e);
        } finally {
            loadingSignal.set(false);
        }
    }
}