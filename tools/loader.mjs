// Lets Node import browser modules that use absolute '/shared/...' URLs:
//   node --import ./tools/loader.mjs yourscript.mjs
import { register } from 'node:module';

register('./loader-hooks.mjs', import.meta.url);
