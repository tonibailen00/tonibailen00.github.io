import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UiService } from '../services/ui.service';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.scss', '../../styles.scss']
})
export class DialogComponent {
  ui = inject(UiService);

  cancel() {
    const state = this.ui.dialogState();
    if (state && state.onCancel) {
      state.onCancel();
    }
    this.ui.clearDialog();
  }

  confirm() {
    const state = this.ui.dialogState();
    if (state && state.type === 'prompt' && !state.inputValue?.trim()) {
      return; // No submit empty prompts
    }

    if (state && state.onConfirm) {
      state.onConfirm(state.type === 'prompt' ? state.inputValue : undefined);
    }
    this.ui.clearDialog();
  }
}

