export class SearchBar {
  private container: HTMLElement;
  private wrapper: HTMLElement;
  private input: HTMLTextAreaElement;
  private spinner: HTMLElement;
  private btn: HTMLButtonElement;

  constructor() {
    // Outer container (holds bar + helper text)
    this.container = document.createElement('div');
    this.container.className = 'search-bar-container';

    // Flex row (input + button)
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'search-bar';

    // Input + spinner wrapper
    const inputWrap = document.createElement('div');
    inputWrap.className = 'search-input-wrapper';

    this.input = document.createElement('textarea');
    this.input.className = 'search-input';
    this.input.placeholder = 'Ask a question from the WCA 2030 guidelines…';
    this.input.rows = 1;
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('spellcheck', 'false');
    this.input.setAttribute('aria-label', 'Search the WCA 2030 guidelines');

    this.spinner = document.createElement('span');
    this.spinner.className = 'search-spinner hidden';
    this.spinner.setAttribute('aria-hidden', 'true');
    this.spinner.setAttribute('role', 'status');

    inputWrap.append(this.input, this.spinner);

    // Submit button
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'search-btn';
    this.btn.textContent = 'Search';
    this.btn.setAttribute('aria-label', 'Submit search');

    this.wrapper.append(inputWrap, this.btn);

    // Helper text beneath the search bar
    const helper = document.createElement('p');
    helper.className = 'search-helper';
    helper.textContent = 'Answers use only WCA 2030 text and include page references.';

    this.container.append(this.wrapper, helper);

    // Enter submits (no newline); Shift+Enter is blocked too for a search field
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      }
    });
    this.btn.addEventListener('click', () => this.submit());

    // Auto-resize textarea as content grows
    this.input.addEventListener('input', () => this.resize());

    // Press / anywhere on the page to focus the input
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this.input) {
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  private resize(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${this.input.scrollHeight}px`;
  }

  private submit(): void {
    const query = this.input.value.trim();
    if (!query) return;
    document.dispatchEvent(
      new CustomEvent<{ query: string }>('wca-search', { detail: { query } }),
    );
  }

  get element(): HTMLElement { return this.container; }

  /** Show or hide the spinner and disable controls while loading. */
  setLoading(on: boolean): void {
    this.spinner.classList.toggle('hidden', !on);
    this.input.disabled = on;
    this.btn.disabled   = on;
  }

  focus(): void { this.input.focus(); }

  setValue(text: string): void {
    this.input.value = text;
    this.resize();
    this.input.focus();
  }
}
