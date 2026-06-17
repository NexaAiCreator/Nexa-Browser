/**
 * Performance Optimization Utilities for Workflow Execution
 * Provides tools for profiling, caching, and optimizing workflow performance
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.workflowMetrics = new Map();
    this.slowThreshold = 1000; // ms
  }

  /**
   * Start timing a named operation
   */
  startTimer(operationName) {
    const timerId = `${operationName}_${Date.now()}`;
    this.metrics.set(timerId, {
      name: operationName,
      startTime: performance.now(),
    });
    return timerId;
  }

  /**
   * End timing and record metric
   */
  endTimer(timerId) {
    const metric = this.metrics.get(timerId);
    if (!metric) return null;

    const endTime = performance.now();
    const duration = endTime - metric.startTime;
    
    const result = {
      name: metric.name,
      duration,
      timestamp: new Date().toISOString(),
      slow: duration > this.slowThreshold,
    };

    this.metrics.delete(timerId);
    return result;
  }

  /**
   * Get all metrics for a workflow
   */
  getWorkflowMetrics(workflowId) {
    return this.workflowMetrics.get(workflowId) || [];
  }

  /**
   * Record workflow step metric
   */
  recordStepMetric(workflowId, stepId, duration, success) {
    if (!this.workflowMetrics.has(workflowId)) {
      this.workflowMetrics.set(workflowId, []);
    }

    this.workflowMetrics.get(workflowId).push({
      stepId,
      duration,
      success,
      timestamp: Date.now(),
    });
  }

  /**
   * Analyze workflow performance
   */
  analyzeWorkflow(workflowId) {
    const metrics = this.getWorkflowMetrics(workflowId);
    if (metrics.length === 0) return null;

    const durations = metrics.map(m => m.duration);
    const successCount = metrics.filter(m => m.success).length;

    return {
      workflow_id: workflowId,
      total_steps: metrics.length,
      successful_steps: successCount,
      failed_steps: metrics.length - successCount,
      total_duration: durations.reduce((a, b) => a + b, 0),
      average_step_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
      min_step_duration: Math.min(...durations),
      max_step_duration: Math.max(...durations),
      slowest_steps: metrics
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3)
        .map(m => ({ stepId: m.stepId, duration: m.duration })),
    };
  }

  /**
   * Get performance summary
   */
  getSummary() {
    return {
      active_timers: this.metrics.size,
      tracked_workflows: this.workflowMetrics.size,
    };
  }
}

/**
 * Selector Cache for optimizing DOM queries
 */
class SelectorCache {
  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cached selector result
   */
  get(selector, context = document) {
    const cacheKey = `${selector}::${context === document ? 'doc' : 'ctx'}`;
    
    if (this.cache.has(cacheKey)) {
      this.hits++;
      return this.cache.get(cacheKey);
    }

    this.misses++;
    const result = context.querySelectorAll(selector);
    
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total * 100).toFixed(1) : 0;

    return {
      total_queries: total,
      cache_hits: this.hits,
      cache_misses: this.misses,
      hit_rate: `${hitRate}%`,
      cache_size: this.cache.size,
      max_size: this.maxSize,
    };
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * Selector Optimization - finds best selector for element
 */
class SelectorOptimizer {
  /**
   * Generate optimized CSS selector for an element
   */
  static generateOptimalSelector(element) {
    const selectors = [];

    // Try ID
    if (element.id) {
      return `#${element.id}`;
    }

    // Build class-based selector
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c && !c.startsWith('ng-'));
      if (classes.length > 0) {
        selectors.push(`.${classes.join('.')}`);
      }
    }

    // Build attribute selectors
    const attrs = ['name', 'type', 'data-testid', 'aria-label'];
    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      if (value) {
        selectors.push(`[${attr}="${value}"]`);
      }
    }

    // Build tag-based selector
    if (element.tagName) {
      selectors.push(element.tagName.toLowerCase());
    }

    // Return best selector
    return selectors[0] || '';
  }

  /**
   * Find alternative selectors if primary fails
   */
  static generateAlternativeSelectors(element, depth = 3) {
    const selectors = [];

    // Primary selector
    selectors.push(this.generateOptimalSelector(element));

    // XPath-like selectors
    let current = element;
    let level = 0;
    while (current && level < depth) {
      const selector = this._generateLevelSelector(current);
      if (selector) selectors.push(selector);
      current = current.parentElement;
      level++;
    }

    return selectors.filter((s, i, arr) => arr.indexOf(s) === i);
  }

  static _generateLevelSelector(element) {
    const tag = element.tagName?.toLowerCase();
    if (!tag) return null;

    let selector = tag;

    if (element.id) {
      selector += `#${element.id}`;
    } else if (element.className) {
      const classes = element.className.split(' ').slice(0, 2).join('.');
      if (classes) selector += `.${classes}`;
    }

    return selector;
  }

  /**
   * Test and rank selectors
   */
  static rankSelectors(element, selectors) {
    const ranked = selectors
      .map(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          const found = Array.from(elements).includes(element);
          
          return {
            selector,
            found,
            specificity: this._calculateSpecificity(selector),
            matchCount: elements.length,
            score: found ? elements.length : Infinity,
          };
        } catch (e) {
          return {
            selector,
            found: false,
            error: e.message,
            score: Infinity,
          };
        }
      })
      .filter(s => s.found)
      .sort((a, b) => a.score - b.score);

    return ranked;
  }

  static _calculateSpecificity(selector) {
    let specificity = 0;
    specificity += (selector.match(/#/g) || []).length * 100;
    specificity += (selector.match(/\./g) || []).length * 10;
    specificity += (selector.match(/[^#.]/g) || []).length;
    return specificity;
  }
}

/**
 * Query Optimizer - pre-compiles and optimizes queries
 */
class QueryOptimizer {
  /**
   * Precompile a selector for faster repeated use
   */
  static precompileSelector(selector) {
    return {
      selector,
      compiled: true,
      queryFn: () => document.querySelectorAll(selector),
      queryOneFn: () => document.querySelector(selector),
    };
  }

  /**
   * Batch query execution
   */
  static batchQuery(selectors) {
    const startTime = performance.now();
    const results = {};

    for (const [key, selector] of Object.entries(selectors)) {
      results[key] = document.querySelectorAll(selector);
    }

    const duration = performance.now() - startTime;
    return { results, duration };
  }

  /**
   * Lazy query execution
   */
  static lazyQuery(selector, delay = 100) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(document.querySelectorAll(selector));
      }, delay);
    });
  }
}

/**
 * Network Optimizer - caches and optimizes API calls
 */
class NetworkOptimizer {
  constructor(cacheSize = 50) {
    this.cache = new Map();
    this.cacheSize = cacheSize;
    this.requestStats = {
      total: 0,
      cached: 0,
      network: 0,
    };
  }

  /**
   * Make optimized fetch with caching
   */
  async optimizedFetch(url, options = {}) {
    const cacheKey = `${options.method || 'GET'}::${url}::${JSON.stringify(options.body || {})}`;
    const now = Date.now();

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (now - cached.timestamp < (options.cacheTTL || 60000)) {
        this.requestStats.cached++;
        return cached.data;
      }
    }

    // Make request
    const response = await fetch(url, options);
    const data = await response.json();

    // Cache result
    if (this.cache.size >= this.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, {
      data,
      timestamp: now,
    });

    this.requestStats.network++;
    this.requestStats.total++;

    return data;
  }

  /**
   * Get request statistics
   */
  getStats() {
    const hitRate = this.requestStats.total > 0
      ? ((this.requestStats.cached / this.requestStats.total) * 100).toFixed(1)
      : 0;

    return {
      total_requests: this.requestStats.total,
      cached_requests: this.requestStats.cached,
      network_requests: this.requestStats.network,
      cache_hit_rate: `${hitRate}%`,
      cache_size: this.cache.size,
    };
  }

  clear() {
    this.cache.clear();
    this.requestStats = { total: 0, cached: 0, network: 0 };
  }
}

/**
 * Action Optimization - finds optimal execution order
 */
class ActionOptimizer {
  /**
   * Optimize action sequence for performance
   */
  static optimizeSequence(actions) {
    // Group actions by type
    const grouped = this._groupByType(actions);

    // Sort for optimal execution
    const optimized = [
      ...grouped.navigation,
      ...grouped.wait,
      ...grouped.fill,
      ...grouped.click,
      ...grouped.read,
      ...grouped.screenshot,
      ...grouped.scroll,
      ...grouped.other,
    ];

    return optimized;
  }

  static _groupByType(actions) {
    const groups = {
      navigation: [],
      wait: [],
      fill: [],
      click: [],
      read: [],
      screenshot: [],
      scroll: [],
      other: [],
    };

    for (const action of actions) {
      const type = action.action_type?.toLowerCase() || 'other';
      if (groups[type]) {
        groups[type].push(action);
      } else {
        groups.other.push(action);
      }
    }

    return groups;
  }

  /**
   * Estimate optimal execution time
   */
  static estimateExecutionTime(actions) {
    const timePerAction = {
      navigation: 500,
      wait: 200,
      fill: 300,
      click: 250,
      read: 150,
      screenshot: 400,
      scroll: 200,
      other: 100,
    };

    let totalTime = 0;
    for (const action of actions) {
      const type = action.action_type?.toLowerCase() || 'other';
      totalTime += timePerAction[type] || 100;
    }

    return totalTime;
  }
}

// Export for use in Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PerformanceMonitor,
    SelectorCache,
    SelectorOptimizer,
    QueryOptimizer,
    NetworkOptimizer,
    ActionOptimizer,
  };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.PerformanceMonitor = PerformanceMonitor;
  window.SelectorCache = SelectorCache;
  window.SelectorOptimizer = SelectorOptimizer;
  window.QueryOptimizer = QueryOptimizer;
  window.NetworkOptimizer = NetworkOptimizer;
  window.ActionOptimizer = ActionOptimizer;
}
