import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json' };
const dataDirectory=process.env.DRAFTSIDE_DATA_DIR?resolve(process.env.DRAFTSIDE_DATA_DIR):join(root,'.draftside-data');
const sourceLibraryPath=join(dataDirectory,'source-library.json');

function json(res,status,payload){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(payload))}
async function readSourceLibrary(){try{const parsed=JSON.parse(await readFile(sourceLibraryPath,'utf8'));return{rankingSources:Array.isArray(parsed.rankingSources)?parsed.rankingSources:[],strategySources:Array.isArray(parsed.strategySources)?parsed.strategySources:[],savedAt:parsed.savedAt||null}}catch{return{rankingSources:[],strategySources:[],savedAt:null}}}
async function readJsonBody(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>15_000_000)throw new Error('Source library is too large')}return JSON.parse(body||'{}')}
async function saveSourceLibrary(payload){const library={rankingSources:Array.isArray(payload.rankingSources)?payload.rankingSources:[],strategySources:Array.isArray(payload.strategySources)?payload.strategySources:[],savedAt:new Date().toISOString()};await mkdir(dataDirectory,{recursive:true});const temporary=`${sourceLibraryPath}.tmp`;await writeFile(temporary,JSON.stringify(library,null,2),'utf8');await rename(temporary,sourceLibraryPath);return library}

const server = createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent((req.url || '/').split('?')[0]);
    if(raw==='/api/source-library'){
      if(req.method==='GET')return json(res,200,await readSourceLibrary());
      if(req.method==='PUT')return json(res,200,await saveSourceLibrary(await readJsonBody(req)));
      return json(res,405,{error:'Method not allowed'});
    }
    const requested = raw === '/' ? '/index.html' : raw;
    if(requested.startsWith('/vendor/pdfjs/')){
      const file=requested.slice('/vendor/pdfjs/'.length);
      if(!['pdf.mjs','pdf.worker.mjs'].includes(file))throw new Error('Invalid vendor asset');
      const path=join(root,'node_modules','pdfjs-dist','build',file);
      await stat(path);
      res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'public, max-age=86400'});
      return res.end(await readFile(path));
    }
    const base = requested.startsWith('/src/') ? root : join(root, 'public');
    const path = normalize(join(base, requested));
    if (!path.startsWith(base)) throw new Error('Invalid path');
    await stat(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404, { 'content-type':'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Draft room ready at http://127.0.0.1:${port}`));
