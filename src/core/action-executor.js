/**
 * Action Executor
 * Executes browser actions (click, fill, read, navigate, etc.) in the active tab
 * Collects observations and returns results to workflow orchestrator
 */

const path = require("path");

class ActionExecutor {
  constructor(browserViewManager, tabManager) {
    this.browserViewManager = browserViewManager;
    this.tabManager = tabManager;
    this.executingActions = new Map();
  }

  /**
   * Execute a single action in the active tab
   * @param {Object} action - Action specification
   * @param {string} action.type - Action type (click, fill, read, wait, scroll, navigate, screenshot)
   * @param {Object} action.params - Action parameters
   * @param {string} workflowId - Workflow ID for tracking
   * @returns {Promise<Object>} Action result
   */
  async executeAction(action, workflowId) {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      this.executingActions.set(actionId, {
        workflowId,
        action,
        startedAt: startTime,
        status: "executing"
      });

      let result;

      switch (action.type) {
        case "click":
          result = await this._executeClick(action);
          break;
        case "fill":
          result = await this._executeFill(action);
          break;
        case "read":
          result = await this._executeRead(action);
          break;
        case "wait":
          result = await this._executeWait(action);
          break;
        case "scroll":
          result = await this._executeScroll(action);
          break;
        case "navigate":
          result = await this._executeNavigate(action);
          break;
        case "screenshot":
          result = await this._executeScreenshot(action);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      const endTime = Date.now();

      return {
        actionId,
        workflowId,
        type: action.type,
        success: true,
        statusCode: 200,
        result,
        timing: {
          startedAt: startTime,
          completedAt: endTime,
          durationMs: endTime - startTime
        },
        domState: await this._capturePageState()
      };
    } catch (error) {
      const endTime = Date.now();

      return {
        actionId,
        workflowId,
        type: action.type,
        success: false,
        statusCode: 500,
        error: error.message,
        timing: {
          startedAt: startTime,
          completedAt: endTime,
          durationMs: endTime - startTime
        }
      };
    } finally {
      this.executingActions.delete(actionId);
    }
  }

  /**
   * Click an element
   */
  async _executeClick(action) {
    const view = this.browserViewManager.getActiveView();
    if (!view) throw new Error("No active browser view");

    const { selector, text, textIncludes, screenshot = true } = action.params;

    const script = `
      (async function() {
        const selector = ${JSON.stringify(selector || "")};
        const textNeedle = ${JSON.stringify(textIncludes || text || "")}.toLowerCase();
        let el = selector ? document.querySelector(selector) : null;

        if (!el && textNeedle) {
          const candidates = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'));
          el = candidates.find((candidate) => {
            const label = (candidate.innerText || candidate.textContent || candidate.value || candidate.getAttribute('aria-label') || '').trim().toLowerCase();
            return label.includes(textNeedle);
          }) || null;
        }

        if (!el) throw new Error('Element not found');
        
        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.click();
        
        // Wait for potential navigation or state change
        return new Promise(resolve => {
          setTimeout(() => resolve({ clicked: true }), 500);
        });
      })();
    `;

    try {
      const result = await view.webContents.executeJavaScript(script, true);

      if (screenshot) {
        const image = await view.webContents.capturePage();
        return {
          clicked: true,
          elementsFound: 1,
          screenshot: image.toDataURL()
        };
      }

      return { clicked: true, elementsFound: 1 };
    } catch (error) {
      throw new Error(`Click failed: ${error.message}`);
    }
  }

  /**
   * Fill form fields
   */
  async _executeFill(action) {
    const view = this.browserViewManager.getActiveView();
    if (!view) throw new Error("No active browser view");

    const { fields, selector, selectorCandidates, value, text } = action.params;
    const normalizedFields = fields || {};
    if (!fields && (selector || selectorCandidates || value || text)) {
      const candidateSelectors = selectorCandidates || [
        selector,
        'input[type="search"]',
        'input[name="q"]',
        'input[type="text"]',
        'textarea',
        '[contenteditable="true"]'
      ].filter(Boolean);
      for (const candidate of candidateSelectors) {
        normalizedFields[candidate] = value || text || "";
      }
    }

    const fieldsJson = JSON.stringify(normalizedFields);
    const script = `
      (async function() {
        const fields = ${fieldsJson};
        const results = {};
        let filledOne = false;
        
        for (const [selector, value] of Object.entries(fields)) {
          if (filledOne) break;
          const el = document.querySelector(selector);
          if (!el) {
            results[selector] = { success: false, error: 'Element not found' };
            continue;
          }
          
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.focus();
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            results[selector] = { success: true };
            filledOne = true;
          } else if (el.isContentEditable) {
            el.focus();
            el.textContent = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            results[selector] = { success: true };
            filledOne = true;
          } else {
            results[selector] = { success: false, error: 'Not a form field' };
          }
        }
        
        return results;
      })();
    `;

    try {
      const result = await view.webContents.executeJavaScript(script, true);
      const succeeded = Object.values(result).filter(r => r.success).length;
      const failed = Object.values(result).filter(r => !r.success).length;

      return {
        fieldsUpdated: succeeded,
        fieldsFailed: failed,
        details: result
      };
    } catch (error) {
      throw new Error(`Fill failed: ${error.message}`);
    }
  }

  /**
   * Read page content
   */
  async _executeRead(action) {
    const view = this.browserViewManager.getActiveView();
    if (!view) throw new Error("No active browser view");

    const {
      selector = "body",
      returnType = action.params.return_type || action.params.format || "text",
      extractAll = action.params.extract_all || false
    } = action.params;

    const script = `
      (function() {
        const sel = '${selector.replace(/'/g, "\\'")}';
        const returnType = '${returnType}';
        
        if (${extractAll}) {
          const elements = document.querySelectorAll(sel);
          const results = [];
          
          elements.forEach(el => {
            if (returnType === 'text') {
              results.push(el.innerText);
            } else if (returnType === 'html') {
              results.push(el.innerHTML);
            } else if (returnType === 'data') {
              results.push({
                text: el.innerText,
                html: el.innerHTML,
                attributes: Array.from(el.attributes).reduce((acc, attr) => {
                  acc[attr.name] = attr.value;
                  return acc;
                }, {})
              });
            }
          });
          
          return results;
        } else {
          const el = document.querySelector(sel);
          if (!el) return null;
          
          if (returnType === 'text') {
            return el.innerText;
          } else if (returnType === 'html') {
            return el.innerHTML;
          } else if (returnType === 'data') {
            return {
              text: el.innerText,
              html: el.innerHTML,
              links: Array.from(el.querySelectorAll('a[href]')).slice(0, 80).map((link) => ({
                text: (link.innerText || link.textContent || '').trim(),
                href: link.href
              })),
              buttons: Array.from(el.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).slice(0, 80).map((button) => ({
                text: (button.innerText || button.textContent || button.value || button.getAttribute('aria-label') || '').trim()
              })),
              headings: Array.from(el.querySelectorAll('h1, h2, h3')).slice(0, 40).map((heading) => ({
                level: heading.tagName,
                text: (heading.innerText || heading.textContent || '').trim()
              })),
              attributes: Array.from(el.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
              }, {})
            };
          }
        }
      })();
    `;

    try {
      const result = await view.webContents.executeJavaScript(script, true);

      if (Array.isArray(result)) {
        return {
          elementsFound: result.length,
          content: result
        };
      }

      return {
        elementsFound: result ? 1 : 0,
        content: result
      };
    } catch (error) {
      throw new Error(`Read failed: ${error.message}`);
    }
  }

  /**
   * Wait for an element
   */
  async _executeWait(action) {
    const view = this.browserViewManager.getActiveView();
    if (!view) throw new Error("No active browser view");

    const { selector, visible = true, timeout = 5000 } = action.params;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const script = `
          (function() {
            const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!el) return false;
            if (${visible}) {
              return el.offsetParent !== null;  // Element is visible
            }
            return true;  // Element exists
          })();
        `;

        const found = await view.webContents.executeJavaScript(script, true);
        if (found) {
          return {
            found: true,
            waitedMs: Date.now() - startTime
          };
        }
      } catch (error) {
        // Ignore and retry
      }

      // Wait 100ms before retry
      await new Promise(r => setTimeout(r, 100));
    }

    throw new Error(`Wait timeout: element not found after ${timeout}ms`);
  }

  /**
   * Scroll page
   */
  async _executeScroll(action) {
    const view = this.browserViewManager.getActiveView();
    if (!view) throw new Error("No active browser view");

    const { direction = "down", amount = 1000, target } = action.params;

    const script = `
      (function() {
        let el = ${target ? `document.querySelector('${target}')` : "window"};
        if (!el) el = window;
        
        const scrollAmount = ${amount};
        switch ('${direction}') {
          case 'down':
            el.scrollBy(0, scrollAmount);
            break;
          case 'up':
            el.scrollBy(0, -scrollAmount);
            break;
          case 'left':
            el.scrollBy(-scrollAmount, 0);
            break;
          case 'right':
            el.scrollBy(scrollAmount, 0);
            break;
        }
        
        return {
          scrolled: true,
          scrollY: window.scrollY,
          scrollX: window.scrollX
        };
      })();
    `;

    try {
      const result = await view.webContents.executeJavaScript(script, true);
      return result;
    } catch (error) {
      throw new Error(`Scroll failed: ${error.message}`);
    }
  }

  /**
   * Navigate to URL
   */
  async _executeNavigate(action) {
    const view = this.browserViewManager.getActiveView();
    if (!view) throw new Error("No active browser view");

    const { url, waitFor, timeout = 10000 } = action.params;

    try {
      if (url === "back") {
        if (view.webContents.navigationHistory.canGoBack()) {
          view.webContents.navigationHistory.goBack();
          return { navigated: true, url: view.webContents.getURL() };
        }
        throw new Error("Cannot navigate back.");
      }

      // Start navigation
      const navigationPromise = new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          reject(new Error(`Navigation timeout after ${timeout}ms`));
        }, timeout);

        const onDidFinishLoad = () => {
          clearTimeout(timeoutHandle);
          view.webContents.off("did-finish-load", onDidFinishLoad);
          view.webContents.off("did-fail-load", onFailLoad);
          resolve();
        };

        const onFailLoad = (event, errorCode, errorDescription) => {
          clearTimeout(timeoutHandle);
          view.webContents.off("did-finish-load", onDidFinishLoad);
          view.webContents.off("did-fail-load", onFailLoad);
          reject(new Error(`Navigation failed: ${errorDescription}`));
        };

        view.webContents.on("did-finish-load", onDidFinishLoad);
        view.webContents.on("did-fail-load", onFailLoad);
      });

      view.webContents.loadURL(url);
      await navigationPromise;

      // Optionally wait for specific element
      if (waitFor) {
        await this._executeWait({ params: { selector: waitFor, timeout: 5000 } });
      }

      return {
        navigated: true,
        url: view.webContents.getURL()
      };
    } catch (error) {
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  /**
   * Take screenshot
   */
  async _executeScreenshot(action) {
    const view = this.browserViewManager.getActiveView();
    if (!view) throw new Error("No active browser view");

    const { fullPage = false, format = "png" } = action.params;

    try {
      const image = await view.webContents.capturePage();
      const dataUrl = image.toDataURL();

      return {
        screenshot: dataUrl,
        format,
        size: image.getSize()
      };
    } catch (error) {
      throw new Error(`Screenshot failed: ${error.message}`);
    }
  }

  /**
   * Capture current page state
   */
  async _capturePageState() {
    const view = this.browserViewManager.getActiveView();
    if (!view) return null;

    try {
      const state = await view.webContents.executeJavaScript(
        `
        ({
          url: window.location.href,
          title: document.title,
          scrollY: window.scrollY,
          scrollX: window.scrollX,
          activeElement: document.activeElement?.tagName || 'NONE'
        })
      `,
        true
      );

      return state;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cancel an action in progress
   */
  cancelAction(actionId) {
    if (this.executingActions.has(actionId)) {
      this.executingActions.delete(actionId);
      return true;
    }
    return false;
  }

  /**
   * Get status of executing actions
   */
  getExecutingActions() {
    return Array.from(this.executingActions.values());
  }
}

module.exports = { ActionExecutor };
