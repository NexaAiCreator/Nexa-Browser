# Testing Procedures for Nexa Browser Workflow System

## Overview

This document provides comprehensive testing procedures for validating the Nexa Browser workflow system across Phase 2 (action execution), Phase 3 (workflow orchestration), and Phase 4 (AI autonomy).

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Performance Testing](#performance-testing)
6. [Security Testing](#security-testing)
7. [User Acceptance Testing](#user-acceptance-testing)
8. [Troubleshooting](#troubleshooting)

---

## Environment Setup

### Prerequisites

```bash
# Nexa Browser running
npm start

# Nexa AI service running (separate terminal)
cd C:\Nexa Ai
python api.py

# Node.js and npm installed
node --version  # Should be >= 14
npm --version   # Should be >= 6
```

### Configuration

```bash
# Set environment variables
export NEXA_API_URL=http://127.0.0.1:8000
export NEXA_BROWSER_URL=http://127.0.0.1:3000
export TEST_TIMEOUT=30000
```

---

## Unit Testing

### Phase 2: Action Executor

#### Test 1: Click Action

```javascript
// In browser console
const action = {
  id: 'action_click_1',
  type: 'click',
  params: {
    selector: 'button[aria-label="Search"]'
  }
};

const result = await browserApi.executeAction(action);
console.log('Click test:', result);
```

**Expected Result:**
- ✅ `success: true`
- ✅ `elementsFound: 1`
- ✅ `timing.total_ms < 500`
- ✅ `domState` updated

#### Test 2: Fill Form Action

```javascript
const action = {
  id: 'action_fill_1',
  type: 'fill',
  params: {
    fields: [
      {
        selector: 'input#search',
        value: 'RTX 5090'
      }
    ]
  }
};

const result = await browserApi.executeAction(action);
console.log('Fill test:', result);
```

**Expected Result:**
- ✅ `success: true`
- ✅ Form fields populated
- ✅ Change events fired

#### Test 3: Read Content Action

```javascript
const action = {
  id: 'action_read_1',
  type: 'read',
  params: {
    format: 'html'
  }
};

const result = await browserApi.executeAction(action);
console.assert(result.success, 'Read succeeded');
console.assert(result.result.content.length > 0, 'Content retrieved');
```

**Expected Result:**
- ✅ `success: true`
- ✅ Page content returned
- ✅ HTML properly formatted

#### Test 4: Navigate Action

```javascript
const action = {
  id: 'action_nav_1',
  type: 'navigate',
  params: {
    url: 'https://amazon.com/s?k=laptop'
  }
};

const result = await browserApi.executeAction(action);
console.log('Navigation complete:', result.domState.url);
```

**Expected Result:**
- ✅ Page navigated
- ✅ URL updated
- ✅ Page loaded

### Phase 3: Workflow Orchestrator

#### Test 5: Single-Step Workflow

```javascript
const workflow = {
  goal: 'Read current page title',
  steps: [
    {
      id: 's1',
      type: 'action',
      content: {
        action_type: 'read',
        params: { format: 'text' }
      }
    }
  ]
};

const workflowId = await browserApi.startWorkflow(
  workflow.goal,
  workflow.steps,
  ['current_page']
);

console.log('Workflow started:', workflowId);
```

**Expected Result:**
- ✅ Workflow starts
- ✅ Progress events emitted
- ✅ Workflow completes

#### Test 6: Multi-Step Workflow

```javascript
const workflow = {
  goal: 'Search for laptop and view results',
  steps: [
    {
      id: 's1',
      type: 'action',
      content: {
        action_type: 'navigate',
        params: { url: 'https://amazon.com' }
      }
    },
    {
      id: 's2',
      type: 'action',
      content: {
        action_type: 'fill',
        params: {
          fields: [{
            selector: '#twotabsearchtextbox',
            value: 'laptop'
          }]
        }
      }
    },
    {
      id: 's3',
      type: 'action',
      content: {
        action_type: 'click',
        params: { selector: 'input[value="Go"]' }
      }
    }
  ]
};

const workflowId = await browserApi.startWorkflow(
  workflow.goal,
  workflow.steps,
  ['navigate_pages', 'fill_forms', 'click_elements']
);

// Monitor progress
browserApi.onWorkflowProgress(data => {
  console.log(`Progress: Step ${data.step_id}`);
});

// Wait for completion
browserApi.onWorkflowCompleted(data => {
  console.log('✅ Workflow completed successfully!');
  console.log('Results:', data);
});
```

**Expected Result:**
- ✅ All steps execute in order
- ✅ Progress events for each step
- ✅ Final completion event

#### Test 7: Workflow with Clarification

```javascript
const workflow = {
  goal: 'Search for a product',
  steps: [
    {
      id: 's1',
      type: 'clarification',
      content: {
        question: 'Which product would you like to search for?',
        input_type: 'text'
      }
    },
    {
      id: 's2',
      type: 'action',
      content: {
        action_type: 'fill',
        params: {
          fields: [{
            selector: '#search',
            value: '{previous_response}'
          }]
        }
      }
    }
  ]
};

let clarificationReceived = false;

browserApi.onWorkflowClarificationRequired(data => {
  console.log('Clarification needed:', data.question);
  clarificationReceived = true;
  
  // Provide response
  browserApi.provideClarification(data.workflow_id, 'gaming laptop');
});

const workflowId = await browserApi.startWorkflow(
  workflow.goal,
  workflow.steps,
  []
);

// Verify clarification was requested
setTimeout(() => {
  console.assert(clarificationReceived, 'Clarification event fired');
}, 1000);
```

**Expected Result:**
- ✅ Workflow pauses at clarification step
- ✅ Event emitted with question
- ✅ Workflow resumes after response

### Phase 4: Permission Management

#### Test 8: Permission Checking

```javascript
const permissions = await browserApi.getPermissionDefinitions();
console.log('Available permissions:', permissions);

// Get current permission state
const state = await browserApi.getActionPermissions();
console.log('Current permissions:', state);

// Grant a permission
await browserApi.setActionPermission('navigate_pages', true, 'session');

// Verify permission granted
const updated = await browserApi.getActionPermissions();
console.assert(updated.navigate_pages === true, 'Permission granted');
```

**Expected Result:**
- ✅ 13 permission scopes returned
- ✅ Current state retrieved
- ✅ Permission changes persisted

---

## Integration Testing

### AI Service Planning

#### Test 9: Simple Goal Planning

```javascript
const response = await fetch('http://127.0.0.1:8000/agent/plan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    goal: 'Search for RTX 5090 price',
    context: {
      current_url: 'https://amazon.com',
      available_permissions: [
        'navigate_pages',
        'fill_forms',
        'click_elements',
        'current_page'
      ]
    }
  })
});

const plan = await response.json();
console.log('Generated plan:', plan);

// Verify plan structure
console.assert(plan.workflow_id, 'Plan has workflow_id');
console.assert(plan.steps.length > 0, 'Plan has steps');
console.assert(plan.required_permissions.length > 0, 'Plan has permissions');
console.assert(plan.risk_assessment, 'Plan has risk assessment');
```

**Validation Checklist:**
- ✅ Workflow ID generated
- ✅ Goal captured
- ✅ Steps created (at least 2)
- ✅ Permissions identified
- ✅ Risk assessment complete
- ✅ Estimated duration calculated
- ✅ Response time < 3 seconds

#### Test 10: Multi-Site Comparison Planning

```javascript
const response = await fetch('http://127.0.0.1:8000/agent/plan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    goal: 'Compare RTX 5080 prices at Amazon, Newegg, and Best Buy',
    context: {}
  })
});

const plan = await response.json();

// Verify multi-site workflow
const navigationSteps = plan.steps.filter(s => 
  s.content.action_type === 'navigate'
);

console.assert(navigationSteps.length >= 3, 'Plan navigates to multiple sites');
console.assert(plan.steps.some(s => s.type === 'synthesize'), 'Plan includes synthesis');
```

**Validation Checklist:**
- ✅ Multiple navigation steps
- ✅ Synthesis step included
- ✅ Appropriate permissions
- ✅ Risk level assessed

---

## End-to-End Testing

### E2E Test 1: Complete Amazon Search Workflow

```bash
# Setup
npm start  # In terminal 1
python api.py  # In terminal 2

# Run test
node -e "
(async () => {
  const testWorkflow = async () => {
    // 1. Start with Amazon homepage
    window.location.href = 'https://amazon.com';
    await new Promise(r => setTimeout(r, 2000));

    // 2. Start workflow
    const workflowId = await browserApi.startWorkflow(
      'Search for gaming laptop',
      [
        {
          id: 's1',
          type: 'action',
          content: {
            action_type: 'click',
            params: { selector: '#twotabsearchtextbox' }
          }
        },
        {
          id: 's2',
          type: 'action',
          content: {
            action_type: 'fill',
            params: {
              fields: [{
                selector: '#twotabsearchtextbox',
                value: 'gaming laptop'
              }]
            }
          }
        },
        {
          id: 's3',
          type: 'action',
          content: {
            action_type: 'click',
            params: { selector: 'input.nav-bb-button' }
          }
        },
        {
          id: 's4',
          type: 'action',
          content: {
            action_type: 'read',
            params: { format: 'text' }
          }
        }
      ],
      ['navigate_pages', 'click_elements', 'fill_forms', 'current_page']
    );

    // 3. Monitor progress
    let stepCount = 0;
    browserApi.onWorkflowStepCompleted(() => {
      stepCount++;
      console.log(\`✅ Step \${stepCount} completed\`);
    });

    // 4. Wait for completion
    return new Promise(resolve => {
      browserApi.onWorkflowCompleted(data => {
        console.log('✅ Workflow completed!');
        console.log('Execution time:', data.execution_time, 'ms');
        resolve(data);
      });

      browserApi.onWorkflowFailed(error => {
        console.error('❌ Workflow failed:', error);
        resolve(null);
      });
    });
  };

  await testWorkflow();
})();
"
```

### E2E Test 2: Permission Flow

```bash
# Test workflow requiring permission approval

node -e "
(async () => {
  const approvalWorkflow = async () => {
    // 1. Start high-risk workflow
    const workflowId = await browserApi.startWorkflow(
      'Fill out contact form and submit',
      [
        {
          id: 's1',
          type: 'action',
          content: {
            action_type: 'fill',
            params: {
              fields: [
                { selector: 'input#name', value: 'John Doe' },
                { selector: 'input#email', value: 'john@example.com' },
                { selector: 'textarea#message', value: 'Hello world' }
              ]
            }
          }
        },
        {
          id: 's2',
          type: 'action',
          content: {
            action_type: 'click',
            params: { selector: 'button[type=\"submit\"]' }
          }
        }
      ],
      ['fill_forms', 'submit_forms']
    );

    // 2. Watch for permission request
    let permissionRequested = false;
    browserApi.onWorkflowPermissionRequired(data => {
      console.log('🔐 Permission required:', data.required_permissions);
      permissionRequested = true;
      
      // Grant permissions
      data.required_permissions.forEach(perm => {
        browserApi.setActionPermission(perm, true, 'session');
      });
    });

    // Wait and verify
    await new Promise(r => setTimeout(r, 1000));
    console.assert(permissionRequested, '✅ Permission request handled');
  };

  await approvalWorkflow();
})();
"
```

---

## Performance Testing

### Benchmark 1: Action Execution Speed

```javascript
// Measure individual action performance
const performanceMonitor = new PerformanceMonitor();

const actions = [
  { type: 'click', selector: 'button', warmup: true },
  { type: 'fill', value: 'test', warmup: true },
  { type: 'read', format: 'text', warmup: false },
  { type: 'navigate', url: 'https://example.com', warmup: false }
];

for (const action of actions) {
  const timerId = performanceMonitor.startTimer(action.type);
  
  const result = await browserApi.executeAction({
    id: `perf_${action.type}`,
    type: action.type,
    params: action
  });

  const metric = performanceMonitor.endTimer(timerId);
  console.log(`${action.type}: ${metric.duration.toFixed(2)}ms`);
}
```

**Expected Performance:**
- Click: < 300ms
- Fill: < 400ms
- Read: < 200ms
- Navigate: < 1000ms

### Benchmark 2: Workflow Throughput

```javascript
// Test multiple workflows
const workflowCount = 10;
const startTime = performance.now();

for (let i = 0; i < workflowCount; i++) {
  await browserApi.startWorkflow(
    `Test workflow ${i}`,
    [
      {
        id: 's1',
        type: 'action',
        content: { action_type: 'read', params: {} }
      }
    ],
    []
  );
}

const totalTime = performance.now() - startTime;
const avgTime = totalTime / workflowCount;

console.log(`${workflowCount} workflows in ${totalTime.toFixed(0)}ms`);
console.log(`Average: ${avgTime.toFixed(0)}ms per workflow`);
```

**Expected Performance:**
- Average workflow planning: < 300ms
- Total throughput: > 30 workflows/second

### Benchmark 3: UI Component Performance

```javascript
// Measure UI rendering performance
const sidebar = new WorkflowProgressSidebar();
sidebar.init();

const largeWorkflow = {
  id: 'perf_test_wf',
  goal: 'Performance test',
  steps: Array.from({ length: 50 }, (_, i) => ({
    id: `s_${i}`,
    type: i % 4 === 0 ? 'synthesize' : 'action',
    content: { action_type: 'read' }
  }))
};

const renderStart = performance.now();
sidebar.setWorkflow(largeWorkflow);
const renderTime = performance.now() - renderStart;

console.log(`Rendered 50-step workflow in ${renderTime.toFixed(2)}ms`);
```

**Expected Performance:**
- Render time for 50 steps: < 100ms

---

## Security Testing

### Test 1: Permission Enforcement

```javascript
// Verify denied permissions block actions
await browserApi.setActionPermission('click_elements', false, 'session');

const result = await browserApi.executeAction({
  id: 'secure_test_1',
  type: 'click',
  params: { selector: 'button' }
});

console.assert(!result.success, '✅ Denied action blocked');
console.assert(result.error?.includes('permission'), '✅ Permission error returned');
```

### Test 2: Risk Assessment

```javascript
// Verify high-risk workflows require approval
const response = await fetch('http://127.0.0.1:8000/agent/plan', {
  method: 'POST',
  body: JSON.stringify({
    goal: 'Click all buttons on page and submit forms',
    context: {}
  })
});

const plan = await response.json();
console.assert(
  plan.risk_assessment.overall === 'high' || 
  plan.risk_assessment.overall === 'critical',
  '✅ High-risk workflow detected'
);
console.assert(
  plan.risk_assessment.requires_approval === true,
  '✅ Approval required for high-risk workflow'
);
```

---

## User Acceptance Testing

### UAT Checklist

- [ ] **Navigation**: User can navigate to different websites
- [ ] **Form Filling**: User can fill and submit forms
- [ ] **Content Reading**: User can extract page content
- [ ] **Workflow Planning**: AI generates logical step sequences
- [ ] **Permission Dialogs**: Clear presentation of required permissions
- [ ] **Clarification**: System asks for clarification when needed
- [ ] **Progress Tracking**: Real-time progress displayed in sidebar
- [ ] **Error Handling**: Clear error messages on failure
- [ ] **Performance**: Workflows complete in reasonable time
- [ ] **UI/UX**: Components responsive and intuitive

---

## Troubleshooting

### Common Issues

#### Issue: Workflow starts but no steps execute

**Solution:**
```javascript
// Check if permissions are granted
const perms = await browserApi.getActionPermissions();
console.log('Current permissions:', perms);

// Check browser console for errors
console.log('Error:', await browserApi.getWorkflowStatus(workflowId));
```

#### Issue: UI components not appearing

**Solution:**
```javascript
// Verify CSS is loaded
console.assert(
  document.querySelector('#workflow-sidebar'),
  'Sidebar exists in DOM'
);

// Check browser console for script errors
window.workflowUIManager?.init();
```

#### Issue: AI planning times out

**Solution:**
```bash
# Verify AI service is running
curl http://127.0.0.1:8000/health

# Check Nexa AI logs
tail -f /path/to/nexa-ai/logs.txt
```

---

## Test Report Template

```markdown
# Test Execution Report

**Date:** [DATE]
**Tester:** [NAME]
**Environment:** [OS, Browser, Node version]

## Summary

- Total Tests: [N]
- Passed: [N]
- Failed: [N]
- Skipped: [N]

## Failures

[List any failures with error messages]

## Performance Metrics

- Average action execution: [Xms]
- Average workflow planning: [Xms]
- UI render time: [Xms]

## Recommendations

[Any issues or improvements]

```

---

## Next Steps

1. Run full integration test suite: `node tests/integration.test.js`
2. Execute E2E tests on real websites
3. Performance profile with DevTools
4. Load test with multiple concurrent workflows
5. Security audit of permission model
6. User feedback collection and iteration

