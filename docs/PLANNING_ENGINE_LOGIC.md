# Nexa Planning Engine Logic

## Overview

The Planning Engine transforms high-level user goals into executable workflows. It runs in the Nexa AI service and outputs structured step-by-step plans that the browser can execute.

```
User Goal → Clarification → Planning → Validation → Workflow → Execution
```

## Architecture

### Components

```
PlanningEngine
├── GoalParser
│   ├── Intent Detection
│   ├── Entity Extraction
│   └── Ambiguity Detection
├── ClarificationEngine
│   ├── Generate Questions
│   ├── Collect Answers
│   └── Refine Goal
├── PlanGenerator
│   ├── Action Graph
│   ├── Step Sequencing
│   ├── Branching Logic
│   └── Parallelization
├── PermissionAnalyzer
│   ├── Required Permissions
│   ├── Risk Assessment
│   └── User Warnings
└── PlanValidator
    ├── Feasibility Check
    ├── Circular Dependency Detection
    └── Timeout Estimation
```

## Phase 1: Goal Parsing & Clarification

### 1A: Intent Detection

```javascript
function detectIntent(goal) {
  return {
    primary: string,      // "research" | "compare" | "extract" | "navigate" | "task"
    secondary: string[],  // Optional sub-intents
    action_verbs: string[],
    entities: {
      subjects: string[],
      objects: string[],
      modifiers: string[]
    },
    confidence: 0.0-1.0
  };
}

// Examples:
detectIntent("Tell me about latest OpenAI releases")
// {
//   primary: "research",
//   entities: { subjects: ["releases"], modifiers: ["latest", "OpenAI"] },
//   confidence: 0.95
// }

detectIntent("Compare RTX 5080 prices at Amazon and Newegg")
// {
//   primary: "compare",
//   entities: { subjects: ["RTX 5080"], objects: ["Amazon", "Newegg"] },
//   confidence: 0.98
// }
```

### 1B: Ambiguity Detection

```javascript
function detectAmbiguity(goal, intent) {
  const ambiguities = [];
  
  // Pattern: Vague scope
  if (goal.includes("releases") && !goal.includes("which")) {
    ambiguities.push({
      type: "vague_scope",
      issue: "Multiple possible releases",
      options: ["ChatGPT", "API", "Codex", "Platform", "All"]
    });
  }
  
  // Pattern: Vague comparison
  if (goal.includes("best")) {
    ambiguities.push({
      type: "criteria_unclear",
      issue: "Best by what metric?",
      options: ["Price", "Features", "Performance", "Availability"]
    });
  }
  
  return ambiguities;
}
```

### 1C: Clarification Engine

```javascript
function generateClarificationQuestions(ambiguities, goal) {
  if (ambiguities.length === 0) {
    return { needs_clarification: false };
  }
  
  // Group related ambiguities
  const grouped = groupAmbiguities(ambiguities);
  
  return {
    needs_clarification: true,
    questions: grouped.map(group => ({
      id: `q_${randomId()}`,
      question: generateQuestion(group),
      type: "multiple_choice" | "freeform",
      options: group.options,
      required: true
    })),
    timeout_ms: 30000
  };
}

// Example Q&A:
// Q: "I see you want to find releases. Do you mean:"
//    1. ChatGPT releases
//    2. API releases
//    3. All OpenAI releases
// A: "All OpenAI releases"
// → Refined goal: "Tell me about latest releases from all OpenAI products"
```

## Phase 2: Action Graph Building

### 2A: Identify Required Actions

```javascript
function identifyActions(goal, context) {
  // Map goal to action types
  const actionMap = {
    "research": [
      { type: "navigate", count: 1 },
      { type: "read", count: 1 },
      { type: "extract_data", count: 1 }
    ],
    "compare": [
      { type: "navigate", count: 3 },
      { type: "read", count: 3 },
      { type: "synthesize", count: 1 }
    ],
    "extract": [
      { type: "navigate", count: 1 },
      { type: "read", count: 1 },
      { type: "extract_structured", count: 1 }
    ],
    "task": [
      { type: "navigate", count: 1 },
      { type: "click", count: 3 },
      { type: "fill", count: 2 },
      { type: "submit", count: 1 }
    ]
  };
  
  return actionMap[intent.primary] || [];
}
```

### 2B: Build Action Dependencies

```javascript
class ActionGraph {
  constructor(actions) {
    this.nodes = actions.map(a => ({
      id: `step_${actions.indexOf(a)}`,
      action: a.type,
      depends_on: [],
      parallelizable: false
    }));
  }
  
  addDependency(from, to) {
    const toNode = this.nodes.find(n => n.id === to);
    toNode.depends_on.push(from);
  }
  
  identifyParallelizable() {
    // Actions that don't depend on each other can run in parallel
    // (Though browser actions are sequential for now)
    const independent = this.nodes.filter(
      n => n.depends_on.length === 0
    );
    return independent;
  }
  
  topologicalSort() {
    // Return valid execution order
    const sorted = [];
    const visited = new Set();
    
    function visit(nodeId) {
      if (visited.has(nodeId)) return;
      const node = this.nodes.find(n => n.id === nodeId);
      
      node.depends_on.forEach(dep => visit(dep));
      sorted.push(node);
      visited.add(nodeId);
    }
    
    this.nodes.forEach(n => visit(n.id));
    return sorted;
  }
}
```

## Phase 3: Plan Generation

### 3A: Sequential Planning (Single Site)

```javascript
function generateSequentialPlan(goal) {
  // Goal: "Find latest OpenAI releases"
  // Current URL: openai.com/releases
  
  const plan = {
    id: `plan_${randomId()}`,
    goal: goal,
    steps: [
      {
        id: "s1",
        type: "action",
        action_type: "read",
        label: "Identify release categories",
        params: {
          selector: "main",
          return_type: "text"
        },
        description: "Scan page to find release types"
      },
      {
        id: "s2",
        type: "decision",
        label: "Plan data extraction",
        params: {
          check: "category_list",
          branches: 4
        },
        description: "Generate plan for each category"
      },
      {
        id: "s3",
        type: "loop",
        label: "For each category",
        steps: [
          {
            id: "s3a",
            action_type: "click",
            params: { selector: "category_link" }
          },
          {
            id: "s3b",
            action_type: "read",
            params: { selector: ".release-content" }
          },
          {
            id: "s3c",
            action_type: "navigate",
            params: { url: "back" }
          }
        ]
      },
      {
        id: "s4",
        type: "action",
        action_type: "synthesize",
        label: "Compile results",
        params: {
          input: "all_extracts",
          format: "markdown"
        }
      }
    ],
    execution_order: ["s1", "s2", "s3", "s4"],
    permissions_required: ["navigate_pages", "click_elements"],
    estimated_duration_ms: 45000
  };
  
  return plan;
}
```

### 3B: Multi-Site Planning (Comparison)

```javascript
function generateComparisonPlan(sites, query) {
  // Goal: "Compare RTX 5080 prices at Amazon and Newegg"
  // Refined to specific URLs
  
  const plan = {
    goal: "Compare RTX 5080 prices",
    steps: [
      // Pre-flight
      {
        id: "pre_1",
        action_type: "navigate",
        params: { url: "amazon.com" },
        label: "Open Amazon"
      },
      // Amazon extraction
      {
        id: "amz_1",
        action_type: "click",
        params: { selector: ".search-input" }
      },
      {
        id: "amz_2",
        action_type: "fill",
        params: { fields: { ".search-input": "RTX 5080" } }
      },
      {
        id: "amz_3",
        action_type: "submit"
      },
      {
        id: "amz_4",
        action_type: "wait",
        params: { selector: ".product-price", timeout: 10000 }
      },
      {
        id: "amz_5",
        action_type: "read",
        params: {
          selector: ".product-price",
          extract_all: true
        }
      },
      // Navigate to Newegg
      {
        id: "pre_2",
        action_type: "navigate",
        params: { url: "newegg.com" }
      },
      // Newegg extraction (parallel to Amazon in theory)
      {
        id: "new_1",
        action_type: "click",
        params: { selector: ".search-box" }
      },
      // ... more steps ...
      // Synthesis
      {
        id: "final",
        action_type: "synthesize",
        params: {
          inputs: ["amz_5", "new_5"],
          output_format: "comparison_table"
        }
      }
    ]
  };
  
  return plan;
}
```

### 3C: Loop Expansion

```javascript
function expandLoops(plan) {
  // Transform generic loops into concrete steps
  
  const expanded = [];
  
  for (let step of plan.steps) {
    if (step.type === "loop") {
      // Get iteration count from observation or estimation
      const iterations = step.params.branches || 3;
      
      for (let i = 0; i < iterations; i++) {
        const iterationSteps = step.steps.map(s => ({
          ...s,
          id: `${s.id}_iter_${i}`,
          iteration: i,
          depends_on: i === 0 ? [plan.steps[steps.indexOf(step) - 1].id] : [`${step.steps[0].id}_iter_${i-1}`]
        }));
        
        expanded.push(...iterationSteps);
      }
    } else {
      expanded.push(step);
    }
  }
  
  return expanded;
}
```

## Phase 4: Permission Analysis

### 4A: Required Permissions

```javascript
function analyzeRequiredPermissions(plan) {
  const permissions = new Set();
  
  const actionToPermission = {
    "navigate": "navigate_pages",
    "click": "click_elements",
    "fill": "fill_forms",
    "submit": "submit_forms",
    "read": "read_page_content",
    "extract_table": "read_page_content",
    "download": "download_files"
  };
  
  plan.steps.forEach(step => {
    if (step.action_type in actionToPermission) {
      permissions.add(actionToPermission[step.action_type]);
    }
  });
  
  // Upgrade permissions based on risk
  const riskUpgrades = {
    "submit_forms": ["fill_forms", "click_elements"],  // Implies these
    "download_files": ["navigate_pages"]
  };
  
  permissions.forEach(perm => {
    if (perm in riskUpgrades) {
      riskUpgrades[perm].forEach(p => permissions.add(p));
    }
  });
  
  return Array.from(permissions);
}

// Returns: ["navigate_pages", "click_elements", "read_page_content"]
```

### 4B: Risk Assessment

```javascript
function assessRisk(plan) {
  const risks = [];
  
  // High-risk actions
  plan.steps.forEach(step => {
    if (step.action_type === "submit") {
      risks.push({
        severity: "critical",
        action: "submit",
        warning: "This will submit a form. Nexa will act on your behalf."
      });
    }
    
    if (step.action_type === "fill") {
      risks.push({
        severity: "medium",
        action: "fill",
        warning: "Nexa will type into form fields."
      });
    }
    
    if (step.action_type === "download") {
      risks.push({
        severity: "high",
        action: "download",
        warning: "Nexa will download files to your computer."
      });
    }
  });
  
  return {
    overall_risk: risks.length > 0 ? "high" : "low",
    issues: risks
  };
}
```

## Phase 5: Plan Validation

### 5A: Feasibility Check

```javascript
function validatePlan(plan, context) {
  const issues = [];
  
  // Check circular dependencies
  const graph = buildDependencyGraph(plan);
  if (hasCycle(graph)) {
    issues.push("Circular dependency detected");
  }
  
  // Check selectors exist on page
  plan.steps
    .filter(s => s.action_type === "click" && s.params.selector)
    .forEach(s => {
      if (!selectorLikelyExists(s.params.selector, context.page_sample)) {
        issues.push(`Selector not found: ${s.params.selector}`);
      }
    });
  
  // Check URLs are valid
  plan.steps
    .filter(s => s.action_type === "navigate")
    .forEach(s => {
      if (!isValidUrl(s.params.url)) {
        issues.push(`Invalid URL: ${s.params.url}`);
      }
    });
  
  // Check timeouts are reasonable
  const totalTime = plan.steps.reduce((sum, s) => sum + (s.timeout || 5000), 0);
  if (totalTime > 300000) {  // 5 min
    issues.push("Plan estimated to take > 5 minutes");
  }
  
  return {
    valid: issues.length === 0,
    issues: issues,
    estimated_duration_ms: totalTime
  };
}
```

### 5B: Timeout Estimation

```javascript
function estimateExecutionTime(plan) {
  const timingMap = {
    "navigate": 3000,
    "click": 500,
    "fill": 200,
    "read": 1000,
    "wait": 5000,  // Can be much longer
    "screenshot": 300
  };
  
  let total = 0;
  let maxParallel = 0;
  
  plan.steps.forEach((step, i) => {
    const stepTime = timingMap[step.action_type] || 1000;
    total += stepTime;
    
    // Account for browser round-trip time
    total += 100;
  });
  
  // Add buffer for unpredictability
  total *= 1.5;
  
  return {
    estimated_ms: total,
    estimated_human: formatDuration(total),
    warning: total > 120000 ? "This plan may take a while" : null
  };
}
```

## Phase 6: Execution & Feedback Loop

### 6A: Observation Interpretation

```javascript
function interpretObservation(observation, step) {
  // Observation: { action: "click", success: true, page_changed: true, ... }
  
  if (observation.action === "click") {
    if (observation.success && observation.page_changed) {
      return {
        interpretation: "Click successful and page loaded",
        status: "success",
        proceed: true
      };
    } else if (observation.success && !observation.page_changed) {
      return {
        interpretation: "Click successful but no page change. Might be a dropdown or modal.",
        status: "success",
        proceed: true,
        note: "Page may have dynamic content"
      };
    }
  }
  
  if (observation.action === "read") {
    if (observation.result.length === 0) {
      return {
        interpretation: "Selector found but returned no content",
        status: "warning",
        proceed: false,
        suggestion: "Try alternative selector"
      };
    }
  }
  
  return {
    interpretation: "Observation recorded",
    status: "success",
    proceed: true
  };
}
```

### 6B: Plan Adaptation

```javascript
function adaptPlan(plan, observations_so_far, new_observation) {
  // If a step fails, can we recover?
  
  const lastObservation = new_observation;
  const lastStep = plan.steps[observations_so_far.length - 1];
  
  if (!lastObservation.success) {
    switch (lastObservation.error) {
      case "element_not_found":
        return {
          adjust: "retry",
          reason: "Element not found, will retry",
          retry_count: lastObservation.retry_count || 0
        };
      
      case "timeout":
        return {
          adjust: "backtrack",
          reason: "Action timed out",
          backtrack_to: Math.max(0, observations_so_far.length - 2)
        };
      
      case "navigation_failed":
        return {
          adjust: "skip",
          reason: "Navigation failed",
          skip_to_next_branch: true
        };
    }
  }
  
  // If success but unexpected, ask user
  if (lastObservation.page_changed && !lastStep.expects_page_change) {
    return {
      clarify: true,
      question: "Page changed unexpectedly. Should I continue?",
      options: ["Continue", "Navigate back", "Stop"]
    };
  }
  
  return { proceed: true };
}
```

## Example: Complete Planning Session

### User Input
```
"Tell me about the latest RTX 5080 GPUs available at major retailers"
```

### Step 1: Parse & Clarify
```
Intent: "research"
Entities: ["RTX 5080", "latest", "major retailers"]
Ambiguity detected: "major retailers" - which ones?
Question: "Which retailers? Amazon, Newegg, Best Buy, or all?"
User: "All three"
```

### Step 2: Generate Plan
```
Goal: Find RTX 5080 info at Amazon, Newegg, Best Buy

Plan:
  1. Navigate to Amazon
  2. Search for "RTX 5080"
  3. Extract price, specs, reviews
  4. Navigate to Newegg
  5. Search for "RTX 5080"
  6. Extract price, specs, reviews
  7. Navigate to Best Buy
  8. Search for "RTX 5080"
  9. Extract price, specs, reviews
  10. Synthesize comparison
```

### Step 3: Analyze
```
Permissions required:
  - navigate_pages (3 sites)
  - click_elements (search boxes)
  - fill_forms (search fields)
  - read_page_content (price/specs)

Risk: Medium (involves form submission)

Estimated duration: 45 seconds
```

### Step 4: Validate
```
Checks:
  ✓ No circular dependencies
  ✓ URLs valid
  ✓ Timeouts reasonable
  ✓ Plan is feasible

Status: Ready to execute
```

### Step 5: Execute & Adapt
```
[Amazon search...]
Observation: "Search returned 42 results"
Interpretation: "Success, moving to read"

[Newegg navigation...]
Observation: "Timeout after 8s"
Interpretation: "Site slow, retry once"

[Best Buy...]
Observation: "Out of stock"
Interpretation: "Product unavailable, note this"

Final: Compile results with availability info
```

## Future Enhancements

1. **Natural Language Generation** - Improve question phrasing
2. **Multi-Branch Planning** - Handle conditional logic
3. **Cooperative Planning** - Ask user "Should I try X or Y?"
4. **Learning** - Track what plans work well, reuse patterns
5. **Cost Optimization** - Minimize API calls and execution time
6. **Visualization** - Show user the plan before executing
7. **Undo/Rollback** - Restore browser state if plan fails
