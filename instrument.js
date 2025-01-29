// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

Sentry.init({
  dsn: "https://c5edb494c3064999fec1b565ecdae752@o4508718578401280.ingest.us.sentry.io/4508718586200064",
  integrations: [
    nodeProfilingIntegration(),
  ],
  // Tracing
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,  //  Capture 100% of the transactions
});