#!/usr/bin/env node
// Legacy compatibility entrypoint: report generation only. No OAuth or email send path.
// Approved lifecycle delivery continues to use the existing reviewed outbound worker.
await import('./acquisition-report.mjs')
