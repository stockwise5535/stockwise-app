// Local decryption only. Never pushes or contacts Google. Output may contain manual secrets.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {decryptBackup,requireSafe} from './safety.mjs';
const [input,output] = process.argv.slice(2);
try {
  requireSafe(input && output && path.isAbsolute(output),'ABSOLUTE_PRIVATE_OUTPUT_DIRECTORY_REQUIRED');
  const backup=decryptBackup(await readFile(input,'utf8'),process.env.APPS_SCRIPT_BACKUP_KEY);
  await mkdir(output,{mode:0o700}); // Refuse an existing directory.
  await writeFile(path.join(output,'google-backup.json'),JSON.stringify(backup,null,2),{mode:0o600});
  for(const file of backup.content.files) {
    requireSafe(/^[A-Za-z0-9_-]+$/.test(file.name),'UNSAFE_FILENAME_INSPECT_GOOGLE_BACKUP_JSON');
    const ext={SERVER_JS:'.js',JSON:'.json',HTML:'.html'}[file.type];
    requireSafe(ext,'UNKNOWN_FILE_TYPE');
    await writeFile(path.join(output,file.name+ext),file.source,{mode:0o600});
  }
  console.log('Decrypted locally. Keep this directory outside Git. No Google writes.');
} catch { console.error('Decryption stopped; check private local inputs. No Google writes.');process.exitCode=1; }
