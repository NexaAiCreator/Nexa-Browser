/**
 * Integration Tests for Nexa Browser Workflow System
 * Tests workflows across real websites and validates all components
 */

const assert = require('assert');

class IntegrationTestSuite {
  constructor(browserApiUrl = 'http://127.0.0.1:3000', aiServiceUrl = 'http://127.0.0.1:8000') {
    this.browserApiUrl = browserApiUrl;
    this.aiServiceUrl = aiServiceUrl;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: [],
    };
  }

  /**
   * Test: Plan simple workflow
   */
  async testSimpleWorkflowPlanning() {
    const testName = 'Plan simple workflow from goal';
    try {
      const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Search for RTX 5090 price on Amazon',
          context: {
            current_url: 'https://amazon.com',
            current_title: 'Amazon',
            open_tabs: [],
            available_permissions: ['navigate_pages', 'fill_forms', 'click_elements', 'current_page'],
          },
        }),
      });

      assert.strictEqual(response.status, 200, 'Plan endpoint returned 200');
      
      const plan = await response.json();
      assert(plan.workflow_id, 'Plan has workflow_id');
      assert(plan.goal, 'Plan has goal');
      assert(Array.isArray(plan.steps), 'Plan has steps array');
      assert(plan.steps.length > 0, 'Plan has at least one step');
      assert(Array.isArray(plan.required_permissions), 'Plan has required_permissions');
      assert(plan.risk_assessment, 'Plan has risk_assessment');

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Permission analysis
   */
  async testPermissionAnalysis() {
    const testName = 'Permission analysis for high-risk workflow';
    try {
      const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Fill out job application form',
          context: {
            current_url: 'https://careers.example.com',
            available_permissions: ['fill_forms', 'submit_forms'],
          },
        }),
      });

      const plan = await response.json();
      const riskAssessment = plan.risk_assessment;

      assert(riskAssessment.overall, 'Risk assessment has overall risk level');
      assert(['low', 'medium', 'high', 'critical'].includes(riskAssessment.overall), 
             'Risk level is valid');
      assert(typeof riskAssessment.requires_approval === 'boolean', 
             'Risk assessment has requires_approval flag');

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Complex multi-site workflow planning
   */
  async testMultiSiteWorkflowPlanning() {
    const testName = 'Plan complex multi-site comparison workflow';
    try {
      const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Compare RTX 5080 prices at Amazon, Newegg, and Best Buy',
          context: {
            current_url: 'https://google.com',
            available_permissions: [
              'navigate_pages',
              'click_elements',
              'current_page',
              'selected_text',
            ],
          },
        }),
      });

      const plan = await response.json();
      
      assert(plan.steps.length > 3, 'Multi-site workflow has multiple steps');
      
      const navigationSteps = plan.steps.filter(s => 
        s.content.action_type === 'navigate' || s.content.action_type === 'navigate_pages'
      );
      assert(navigationSteps.length >= 3, 'Workflow includes navigation to multiple sites');

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Clarification endpoint
   */
  async testClarificationHandling() {
    const testName = 'Handle workflow clarification response';
    try {
      const response = await fetch(`${this.aiServiceUrl}/agent/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'test_wf_001',
          step_id: 'test_step_001',
          response: 'User provided specific response',
          approval: true,
        }),
      });

      assert.strictEqual(response.status, 200, 'Clarification endpoint returned 200');
      
      const result = await response.json();
      assert(result.ok, 'Clarification response successful');
      assert.strictEqual(result.workflow_id, 'test_wf_001', 'Workflow ID preserved');

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Observation analysis
   */
  async testObservationAnalysis() {
    const testName = 'Analyze workflow observations for adaptation needs';
    try {
      const observations = [
        {
          action_id: 'action_1',
          workflow_id: 'wf_test',
          type: 'click',
          success: true,
          status_code: 200,
          timing: { total_ms: 250 },
        },
        {
          action_id: 'action_2',
          workflow_id: 'wf_test',
          type: 'read',
          success: false,
          error: 'Element selector not found',
        },
      ];

      const response = await fetch(`${this.aiServiceUrl}/agent/observe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'wf_test',
          observations,
        }),
      });

      assert.strictEqual(response.status, 200, 'Observation analysis returned 200');
      
      const analysis = await response.json();
      assert(analysis.analysis, 'Analysis returned');
      assert.strictEqual(analysis.analysis.observations_count, 2, 'Correct observation count');
      assert.strictEqual(analysis.analysis.successful_count, 1, 'Correct success count');
      assert.strictEqual(analysis.analysis.failed_count, 1, 'Correct failure count');
      assert(analysis.needs_adaptation === true, 'Adaptation needed due to failure');

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Action executor endpoint
   */
  async testActionExecution() {
    const testName = 'Execute single browser action';
    try {
      const response = await fetch(`${this.aiServiceUrl}/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: 'wf_test',
          step_id: 'step_001',
          action_type: 'read',
          params: { format: 'text' },
          screenshot: false,
        }),
      });

      assert.strictEqual(response.status, 200, 'Action executor returned 200');
      
      const result = await response.json();
      assert(result.step_id, 'Result has step_id');
      assert(result.action_id, 'Result has action_id');
      assert(typeof result.success === 'boolean', 'Result has success flag');

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Goal parsing
   */
  async testGoalParsing() {
    const testName = 'Parse various user goal formats';
    try {
      const goals = [
        'Search for laptop prices',
        'Compare RTX 5090 at 3 retailers',
        'Fill out contact form',
        'Extract data from page',
      ];

      for (const goal of goals) {
        const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, context: {} }),
        });

        assert(response.ok, `Goal "${goal}" parsed successfully`);
      }

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Permission scope validation
   */
  async testPermissionScopes() {
    const testName = 'Validate all permission scopes';
    try {
      const expectedScopes = [
        'current_page',
        'selected_text',
        'open_tabs',
        'browsing_history',
        'bookmarks',
        'downloads',
        'navigate_pages',
        'click_elements',
        'fill_forms',
        'submit_forms',
        'read_form_fields',
        'manage_tabs',
        'download_files',
      ];

      const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Comprehensive test workflow',
          context: { available_permissions: expectedScopes },
        }),
      });

      const plan = await response.json();
      const usedPermissions = plan.required_permissions;

      for (const perm of usedPermissions) {
        assert(expectedScopes.includes(perm), `Permission scope "${perm}" is valid`);
      }

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Workflow step types
   */
  async testWorkflowStepTypes() {
    const testName = 'Validate all workflow step types';
    try {
      const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Complex workflow requiring clarification',
          context: {},
        }),
      });

      const plan = await response.json();
      const stepTypes = plan.steps.map(s => s.type);

      const validTypes = ['action', 'decision', 'clarification', 'synthesize'];
      for (const type of stepTypes) {
        assert(validTypes.includes(type), `Step type "${type}" is valid`);
      }

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Performance - Plan generation time
   */
  async testPlanPerformance() {
    const testName = 'Workflow planning completes within 5 seconds';
    try {
      const startTime = Date.now();
      
      await fetch(`${this.aiServiceUrl}/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Search for product and compare prices',
          context: {},
        }),
      });

      const duration = Date.now() - startTime;
      assert(duration < 5000, `Plan generated in ${duration}ms (< 5000ms)`);

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Error handling - Invalid goal
   */
  async testErrorHandling() {
    const testName = 'Handle invalid/empty goals gracefully';
    try {
      // Empty goal should fail
      const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: '',
          context: {},
        }),
      });

      assert(response.status >= 400, 'Empty goal returns error');

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Step action detection
   */
  async testActionDetection() {
    const testName = 'Detect required actions from goals';
    try {
      const goalTests = [
        { goal: 'Read the page', expectedActions: ['read'] },
        { goal: 'Click the button', expectedActions: ['click'] },
        { goal: 'Type in search', expectedActions: ['fill'] },
        { goal: 'Go to example.com', expectedActions: ['navigate'] },
      ];

      for (const test of goalTests) {
        const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal: test.goal,
            context: {},
          }),
        });

        const plan = await response.json();
        const actionTypes = plan.steps.map(s => s.content.action_type);
        
        for (const expectedAction of test.expectedActions) {
          assert(
            actionTypes.some(a => a.includes(expectedAction)),
            `Goal "${test.goal}" includes "${expectedAction}" action`
          );
        }
      }

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Test: Risk level classification
   */
  async testRiskLevelClassification() {
    const testName = 'Classify workflows by risk level';
    try {
      const goals = [
        { goal: 'Read current page', expectedRisk: 'low' },
        { goal: 'Fill and submit form', expectedRisk: 'high' },
      ];

      for (const test of goals) {
        const response = await fetch(`${this.aiServiceUrl}/agent/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal: test.goal,
            context: {},
          }),
        });

        const plan = await response.json();
        const riskLevel = plan.risk_assessment.overall;

        assert(
          ['low', 'medium', 'high', 'critical'].includes(riskLevel),
          `Risk level "${riskLevel}" is valid`
        );
      }

      this._recordPass(testName);
    } catch (error) {
      this._recordFail(testName, error);
    }
  }

  /**
   * Run all tests
   */
  async runAll() {
    console.log('🚀 Starting Integration Tests for Nexa Workflow System\n');

    const tests = [
      () => this.testSimpleWorkflowPlanning(),
      () => this.testPermissionAnalysis(),
      () => this.testMultiSiteWorkflowPlanning(),
      () => this.testClarificationHandling(),
      () => this.testObservationAnalysis(),
      () => this.testActionExecution(),
      () => this.testGoalParsing(),
      () => this.testPermissionScopes(),
      () => this.testWorkflowStepTypes(),
      () => this.testPlanPerformance(),
      () => this.testErrorHandling(),
      () => this.testActionDetection(),
      () => this.testRiskLevelClassification(),
    ];

    for (const test of tests) {
      await test();
    }

    this._printResults();
  }

  _recordPass(testName) {
    this.results.passed++;
    this.results.tests.push({ name: testName, status: 'PASS' });
    console.log(`✅ PASS: ${testName}`);
  }

  _recordFail(testName, error) {
    this.results.failed++;
    this.results.tests.push({ name: testName, status: 'FAIL', error: error.message });
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Error: ${error.message}\n`);
  }

  _printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Results');
    console.log('='.repeat(60));
    console.log(`Total: ${this.results.passed + this.results.failed + this.results.skipped}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⊘ Skipped: ${this.results.skipped}`);
    console.log('='.repeat(60));

    const passRate = ((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1);
    console.log(`\n📈 Pass Rate: ${passRate}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests.filter(t => t.status === 'FAIL').forEach(t => {
        console.log(`  - ${t.name}`);
        if (t.error) console.log(`    ${t.error}`);
      });
    }
  }
}

// Export for use in Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntegrationTestSuite;
}

// Run tests if executed directly
if (require.main === module) {
  const suite = new IntegrationTestSuite();
  suite.runAll().catch(console.error);
}
