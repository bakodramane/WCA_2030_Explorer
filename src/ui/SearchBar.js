export class SearchBar {
    constructor() {
        // Outer flex row
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'search-bar';
        // Input + spinner wrapper
        const inputWrap = document.createElement('div');
        inputWrap.className = 'search-input-wrapper';
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'search-input';
        this.input.placeholder = 'Ask a question about WCA 2030 methodology…';
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
        // Submit on Enter
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                this.submit();
        });
        this.btn.addEventListener('click', () => this.submit());
        // Press / anywhere on the page to focus the input
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== this.input) {
                e.preventDefault();
                this.input.focus();
            }
        });
    }
    submit() {
        const query = this.input.value.trim();
        if (!query)
            return;
        document.dispatchEvent(new CustomEvent('wca-search', { detail: { query } }));
    }
    get element() { return this.wrapper; }
    /** Show or hide the spinner and disable controls while loading. */
    setLoading(on) {
        this.spinner.classList.toggle('hidden', !on);
        this.input.disabled = on;
        this.btn.disabled = on;
    }
    focus() { this.input.focus(); }
    setValue(text) {
        this.input.value = text;
        this.input.focus();
    }
}
