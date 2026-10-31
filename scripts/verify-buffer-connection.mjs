// Read-only GraphQL queries only; never loads a publish worker or credentials file.
import {verifyBufferReadOnly} from '../services/buffer-connection-check.js'
console.log(JSON.stringify(await verifyBufferReadOnly(),null,2))
