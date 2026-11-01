import { readBufferGrowth, BufferReadError } from '../server/buffer-growth.js';
// Explicit organization scope and UTC/offset-bearing dates; no credential arguments.
const [organizationId,start,end]=process.argv.slice(2);
try {
  console.log(JSON.stringify(await readBufferGrowth({organizationId,start,end}),null,2));
} catch (e) {
  console.error(e instanceof BufferReadError ? e.code : 'BUFFER_READ_FAILED');
  process.exitCode=1;
}
