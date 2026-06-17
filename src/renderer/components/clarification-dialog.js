/**
 * ClarificationDialog Component
 * Displays clarification questions during workflow execution
 */

class ClarificationDialog {
  constructor() {
    this.container = null;
    this.isOpen = false;
  }

  init(parentSelector = 'body') {
    const parent = document.querySelector(parentSelector);
    if (!parent) return;

    this.container = document.createElement('div');
    this.container.id = 'clarification-dialog-container';
    this.container.className = 'clarification-dialog-container hidden';
    this.container.innerHTML = this._getTemplate();
    parent.appendChild(this.container);

    this._attachEventListeners();
  }

  _getTemplate() {
    return `
      <div class="clarification-dialog-overlay"></div>
      <div class="clarification-dialog">
        <div class="dialog-header">
          <h2>❓ Clarification Needed</h2>
        </div>

        <div class="dialog-content">
          <div class="question-block">
            <p id="question-text" class="question-text"></p>
          </div>

          <div id="input-container" class="input-container">
            <!-- Input will be inserted based on input_type -->
          </div>

          <div id="error-message" class="error-message hidden"></div>
        </div>

        <div class="dialog-actions">
          <button id="submit-clarification" class="btn btn-primary">Submit</button>
          <button id="cancel-clarification" class="btn btn-secondary">Skip</button>
        </div>
      </div>
    `;
  }

  _attachEventListeners() {
    const submitBtn = this.container.querySelector('#submit-clarification');
    const cancelBtn = this.container.querySelector('#cancel-clarification');

    submitBtn?.addEventListener('click', () => this._onSubmit());
    cancelBtn?.addEventListener('click', () => this._onCancel());
  }

  show(workflowId, stepId, question, inputType = 'text', onSubmit, onCancel) {
    this._workflowId = workflowId;
    this._stepId = stepId;
    this._onSubmitCallback = onSubmit;
    this._onCancelCallback = onCancel;

    this._renderQuestion(question, inputType);
    this.container.classList.remove('hidden');
    this.isOpen = true;

    // Focus first input
    setTimeout(() => {
      const input = this.container.querySelector('input, textarea, select');
      input?.focus();
    }, 100);
  }

  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
      this.isOpen = false;
    }
  }

  _renderQuestion(question, inputType) {
    const questionEl = this.container.querySelector('#question-text');
    if (questionEl) questionEl.textContent = question;

    const inputContainer = this.container.querySelector('#input-container');
    inputContainer.innerHTML = this._renderInputField(inputType);
  }

  _renderInputField(inputType) {
    switch (inputType) {
      case 'text':
        return `
          <input 
            type="text" 
            id="clarification-input" 
            class="input-field"
            placeholder="Enter your response..."
            autocomplete="off"
          >
        `;
      case 'textarea':
        return `
          <textarea 
            id="clarification-input" 
            class="input-field"
            placeholder="Enter your response..."
            rows="4"
          ></textarea>
        `;
      case 'select':
        return `
          <select id="clarification-input" class="input-field">
            <option value="">-- Select an option --</option>
            <option value="option1">Option 1</option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>
        `;
      case 'url':
        return `
          <input 
            type="url" 
            id="clarification-input" 
            class="input-field"
            placeholder="https://example.com"
            autocomplete="off"
          >
        `;
      case 'email':
        return `
          <input 
            type="email" 
            id="clarification-input" 
            class="input-field"
            placeholder="email@example.com"
            autocomplete="off"
          >
        `;
      case 'number':
        return `
          <input 
            type="number" 
            id="clarification-input" 
            class="input-field"
            placeholder="Enter a number..."
            autocomplete="off"
          >
        `;
      case 'multiple-choice':
        return `
          <div class="choice-options">
            <label class="choice-option">
              <input type="radio" name="clarification-choice" value="yes">
              <span>Yes</span>
            </label>
            <label class="choice-option">
              <input type="radio" name="clarification-choice" value="no">
              <span>No</span>
            </label>
            <label class="choice-option">
              <input type="radio" name="clarification-choice" value="maybe">
              <span>Maybe</span>
            </label>
          </div>
        `;
      case 'list':
        return `
          <div class="list-input">
            <div id="items-container" class="items-container"></div>
            <button type="button" id="add-item-btn" class="btn-secondary btn-small">+ Add Item</button>
          </div>
        `;
      default:
        return `
          <input 
            type="text" 
            id="clarification-input" 
            class="input-field"
            placeholder="Enter your response..."
          >
        `;
    }
  }

  _onSubmit() {
    const inputType = this._getCurrentInputType();
    const input = this.container.querySelector('#clarification-input');
    const errorEl = this.container.querySelector('#error-message');

    let value = null;

    if (inputType === 'multiple-choice') {
      const selected = this.container.querySelector('input[name="clarification-choice"]:checked');
      value = selected?.value;
    } else if (inputType === 'list') {
      const items = this.container.querySelectorAll('.list-item input');
      value = Array.from(items).map(item => item.value).filter(v => v.trim());
    } else {
      value = input?.value?.trim();
    }

    if (!value || (Array.isArray(value) && value.length === 0)) {
      errorEl.textContent = 'Please provide a response';
      errorEl.classList.remove('hidden');
      return;
    }

    errorEl.classList.add('hidden');

    if (this._onSubmitCallback) {
      this._onSubmitCallback(value);
    }

    this.hide();
  }

  _onCancel() {
    if (this._onCancelCallback) {
      this._onCancelCallback();
    }
    this.hide();
  }

  _getCurrentInputType() {
    const inputContainer = this.container.querySelector('#input-container');
    
    if (inputContainer.querySelector('input[type="text"]')) return 'text';
    if (inputContainer.querySelector('textarea')) return 'textarea';
    if (inputContainer.querySelector('select')) return 'select';
    if (inputContainer.querySelector('input[type="url"]')) return 'url';
    if (inputContainer.querySelector('input[type="email"]')) return 'email';
    if (inputContainer.querySelector('input[type="number"]')) return 'number';
    if (inputContainer.querySelector('input[name="clarification-choice"]')) return 'multiple-choice';
    if (inputContainer.querySelector('.list-input')) return 'list';
    
    return 'text';
  }

  showError(message) {
    const errorEl = this.container.querySelector('#error-message');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }

  clearError() {
    const errorEl = this.container.querySelector('#error-message');
    if (errorEl) {
      errorEl.classList.add('hidden');
    }
  }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClarificationDialog;
}
