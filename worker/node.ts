import {serve} from '@hono/node-server';
import {existsSync} from 'node:fs';
import {app} from './index';
import type {Env} from './integrations';
if(existsSync('.dev.vars'))process.loadEnvFile('.dev.vars');
const env=process.env as Env;
serve({hostname:'0.0.0.0',port:8787,fetch:r=>app.fetch(r,env)});
