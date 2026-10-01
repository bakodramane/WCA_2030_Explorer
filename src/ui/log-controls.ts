// Query-log export controls in the footer (E3: split out of App.ts).
import { clearLog, getLog, toCSV } from '../engine/logger';

export class LogControls {
  private logCtrlEl!: HTMLSpanElement;

  init(footer: HTMLElement): void {
    this.logCtrlEl = document.createElement('span');
    this.logCtrlEl.className = 'log-controls';

    const exportBtn = document.createElement('button');
    exportBtn.type      = 'button';
    exportBtn.className = 'log-export-btn';
    exportBtn.addEventListener('click', () => void this.shareLog(exportBtn));

    const clearBtn = document.createElement('button');
    clearBtn.type        = 'button';
    clearBtn.className   = 'log-clear-btn';
    clearBtn.textContent = 'Clear log';
    clearBtn.addEventListener('click', () => {
      clearLog();
      this.refresh();
    });

    this.logCtrlEl.appendChild(exportBtn);
    this.logCtrlEl.appendChild(clearBtn);
    footer.appendChild(this.logCtrlEl);

    this.refresh();
  }

  refresh(): void {
    const count     = getLog().length;
    const exportBtn = this.logCtrlEl.querySelector<HTMLButtonElement>('.log-export-btn')!;
    exportBtn.textContent      = `Share query log (${count})`;
    this.logCtrlEl.style.display = count === 0 ? 'none' : '';
  }

  private async shareLog(btn: HTMLButtonElement): Promise<void> {
    const log = getLog();
    if (log.length === 0) return;

    // Local CSV download (always happens first)
    const csv      = '﻿' + toCSV(log);
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `wca-query-log-${date}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Brief confirmation message
    const prev = btn.textContent;
    btn.textContent = 'Thank you — downloaded ✓';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, 3500);
  }
}
