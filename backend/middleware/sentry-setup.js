/**
 * Sentry Integration - RifaPlus Error Tracking
 * Setup Sentry for error monitoring and crash reporting
 * 
 * Installation:
 * 1. Create Sentry account at https://sentry.io
 * 2. Create new project (select "JavaScript" or "Node.js")
 * 3. Copy your DSN (Data Source Name)
 * 4. Add this file to your HTML <head> or as first import in backend
 * 5. Set environment variables or replace DSN directly
 */

// ============================================================
// FRONTEND SETUP (Browser)
// ============================================================

// In index.html, add BEFORE other scripts:
/*
<script>
    // Initialize Sentry early (before your app loads)
    Sentry.init({
        dsn: process.env.REACT_APP_SENTRY_DSN || "https://your-key@your-sentry.ingest.sentry.io/your-project-id",
        environment: process.env.NODE_ENV || "production",
        tracesSampleRate: 0.1,  // 10% of transactions (reduce load)
        
        // Release tracking (optional)
        release: process.env.REACT_APP_VERSION || "1.0.0",
        
        // Ignore certain errors
        ignoreErrors: [
            // Browser extensions
            "top.GLOBALS",
            // User cancelled
            "NetworkError",
            "timeout",
            // Random errors we don't control
            "Script terminated by timeout"
        ],
        
        // Before sending to Sentry, filter/modify
        beforeSend(event, hint) {
            // Don't send certain errors
            if (event.exception?.values?.[0]?.value?.includes?.('Network')) {
                // Still log locally but don't send to Sentry
                console.warn('Network error suppressed from Sentry:', hint);
                return null;  // Don't send
            }
            
            // Add custom context
            event.user = {
                id: localStorage.getItem('rifaplus_user_id'),
                email: localStorage.getItem('rifaplus_user_email')
            };
            
            return event;
        }
    });
</script>

<!-- Then load your app -->
<script src="/js/error-handler.js"></script>
<script src="/js/main.js"></script>
*/

// ============================================================
// BACKEND SETUP (Node.js/Express)
// ============================================================

/*
// 1. Install Sentry SDK:
npm install @sentry/node @sentry/tracing

// 2. In your server.js or app.js:

const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");

// Initialize Sentry BEFORE route handlers
Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://your-key@your-sentry.ingest.sentry.io/your-project-id",
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1,  // 10% sampling
    release: process.env.APP_VERSION || "1.0.0"
});

const app = require("express")();

// Attach Sentry to request handler (MUST be before your routes)
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Your routes here...
app.get("/api/test", (req, res) => {
    res.send("OK");
});

// Sentry error handler (MUST be last)
app.use(Sentry.Handlers.errorHandler());

// Start server
app.listen(3000, () => {
    console.log("✅ Server running with Sentry error tracking");
});
*/

// ============================================================
// USAGE: Capture Custom Errors
// ============================================================

/*
FRONTEND:
---------

// Capture message
Sentry.captureMessage("User completed purchase", "info");

// Capture exception
try {
    riskyOperation();
} catch (error) {
    Sentry.captureException(error, {
        tags: {
            section: "checkout",
            user_action: "payment"
        }
    });
}

// Add context before error occurs
Sentry.setContext("purchase", {
    order_id: "ST-AA043",
    amount: 5000,
    status: "processing"
});
// Then if error happens, context auto-included

// Set user info
Sentry.setUser({
    id: 123,
    email: "user@example.com",
    username: "john_doe"
});

// Breadcrumb (trail of actions before error)
Sentry.addBreadcrumb({
    category: "payment",
    message: "Payment gateway initialized",
    level: "info"
});


BACKEND:
--------

// Capture exception
try {
    await processPayment(ordre);
} catch (error) {
    Sentry.captureException(error, {
        tags: {
            order_id: order.id,
            error_type: "payment_failed"
        }
    });
}

// Capture message
Sentry.captureMessage("Unusual order: 10k tickets purchased", "warning");

// With context
Sentry.withScope((scope) => {
    scope.setContext("order", {
        id: "ST-AA043",
        user_id: 456,
        amount: 50000
    });
    
    Sentry.captureException(error);
});
*/

// ============================================================
// ENVIRONMENT VARIABLES SETUP
// ============================================================

/*
.env file (add to .gitignore):
------------------------------
SENTRY_DSN=https://your-actual-key@your-sentry.ingest.sentry.io/your-actual-project-id
NODE_ENV=production
APP_VERSION=1.0.0

.env.development (local development):
-------------------------------------
SENTRY_DSN=https://dev-key@your-sentry.ingest.sentry.io/dev-project-id
NODE_ENV=development
APP_VERSION=1.0.0-dev

GitHub Actions (.github/workflows/ci-cd.yml):
---------------------------------------------
env:
    SENTRY_DSN: ${{ secrets.SENTRY_DSN }}  # Set in repo settings
    NODE_ENV: production
*/

// ============================================================
// MONITORING & ALERTING
// ============================================================

/*
In Sentry Dashboard:

1. Configure issue alerts:
   - Issues → Alerts → Create Alert Rule
   - Alert on: Any event
   - Send to: Email, Slack, PagerDuty
   
2. Create Performance Alerts:
   - Monitor → Alerts → Create Alert
   - Alert on: Response time > 2s
   - Alert on: Error rate > 5%

3. Release Tracking:
   - Set release in init()
   - Track errors per version
   - Narrow down regressions

4. User Feedback:
   - Add "@sentry/feedback" for crash reporting widget
   - Users can submit context about error

5. Dashboards:
   - Create custom dashboard with metrics
   - Error trends
   - User impact
   - Performance metrics
*/

// ============================================================
// COSTS & LIMITS
// ============================================================

/*
Sentry Pricing (as of Feb 2025):
- Free tier: 5k errors/month, 24h retention
- Business: $29/month (50k errors), $. per million events
- Enterprise: Custom pricing

Cost reduction strategies:
1. Set tracesSampleRate = 0.1 (only 10% of requests)
2. Filter noisy errors in beforeSend()
3. Set ignoreErrors for known issues
4. Use server/client separation (backend errors cost more)
5. Archive old error events regularly
*/

module.exports = {
    // Export nothing - this is just documentation
    // Sentry is initialized globally in your app startup
};
