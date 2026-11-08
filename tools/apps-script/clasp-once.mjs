// Official clasp, with the shared Google client HTTP retry policy explicitly disabled.
// googleapis otherwise enables retries for updateContent's PUT by default.
import {createRequire} from 'node:module';
import {google} from 'googleapis';
const here = createRequire(import.meta.url);
const clasp = createRequire(new URL('./node_modules/@google/clasp/package.json', import.meta.url));
if (here.resolve('googleapis') !== clasp.resolve('googleapis') || process.argv.at(-1) !== 'push') {
  console.error('CLASP_SINGLE_ATTEMPT_CONFIGURATION_REQUIRED');process.exit(1);
}
google.options({retry:false,timeout:30000});
await import('./node_modules/@google/clasp/build/src/index.js');
