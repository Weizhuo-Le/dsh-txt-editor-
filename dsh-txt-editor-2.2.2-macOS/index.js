/**
 * Host half of the workspace text editor.
 *
 * The browser cannot touch the disk, so this half owns the file I/O and exposes
 * three small JSON routes that the Client half fetches same-origin:
 *
 *   GET  /novel-txt/list?root=<abs>        → { root, roots, files: [{ path, size }] }
 *   GET  /novel-txt/read?root=&path=<rel>  → { root, path, text, version, eol, bom, size }
 *   POST /novel-txt/save { root, path, text, version, eol, bom }
 *
 * Only directories the deployment already registered as workspaces are
 * readable, every write is fenced to that root, and a save is guarded by the
 * file version the editor read, so it refuses to clobber a file the agent
 * changed meanwhile instead of silently overwriting it.
 */

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.dsh',
  '.idea',
  '.venv',
  '.vscode',
  '__pycache__',
  'dist',
  'node_modules',
  '续写',
]);
const MAX_DEPTH = 3;
const MAX_FILES = 4000;
const MAX_BODY_BYTES = 32 * 1024 * 1024;

export const inject = ['webServer', 'fs'];

export function apply(ctx) {
  const fsService = ctx.fs;
  const server = ctx.webServer;

  function workspaceRoots() {
    const roots = [];
    try {
      const registry = ctx.get('workspaceRegistry');
      if (registry && typeof registry.list === 'function') {
        const list = registry.list() || [];
        for (let i = 0; i < list.length; i += 1) {
          const workspace = list[i];
          const path = workspace && typeof workspace.path === 'string' ? workspace.path : '';
          if (path && roots.indexOf(path) < 0) roots.push(path);
        }
      }
    } catch (error) {
      /* registry unavailable: fall back to the deployment directory */
    }
    if (!roots.length) {
      const owner = ctx.get('workingDirectory');
      const dir = owner && typeof owner.defaultDirectory === 'string' ? owner.defaultDirectory : '';
      roots.push(dir || process.cwd());
    }
    return roots;
  }

  /** Windows paths are case-insensitive; APFS can be either, so POSIX paths keep their case. */
  function normalizePath(value) {
    const text = String(value || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
    return process.platform === 'win32' ? text.toLowerCase() : text;
  }

  /** Only a registered workspace may be scanned; anything else falls back to the first. */
  function pickRoot(candidate) {
    const roots = workspaceRoots();
    if (typeof candidate === 'string' && candidate) {
      const wanted = normalizePath(candidate);
      for (let i = 0; i < roots.length; i += 1) {
        if (normalizePath(roots[i]) === wanted) return roots[i];
      }
    }
    return roots[0];
  }

  function send(res, status, payload) {
    const text = JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(text),
      'cache-control': 'no-store',
    });
    res.end(text);
  }

  function fail(status, code, message) {
    const error = new Error(message || code);
    error.status = status;
    error.code = code;
    return error;
  }

  function sameOrigin(origin) {
    try {
      return origin === server.getOrigin();
    } catch (error) {
      return true;
    }
  }

  /** Reject a cross-site request: a custom header cannot be sent without a preflight. */
  function guard(req) {
    if (req.method === 'OPTIONS') return null;
    if (!req.headers['x-novel-txt']) return fail(403, 'MISSING_HEADER', 'missing x-novel-txt header');
    const origin = req.headers.origin;
    if (origin && !sameOrigin(origin)) return fail(403, 'BAD_ORIGIN', 'cross-origin request refused');
    return null;
  }

  function relativePath(value) {
    if (typeof value !== 'string') return null;
    const rel = value.trim().replace(/\\/g, '/');
    if (!rel || rel.length > 400) return null;
    if (rel.startsWith('/') || rel.includes('\0')) return null;
    const parts = rel.split('/');
    for (let i = 0; i < parts.length; i += 1) {
      if (!parts[i] || parts[i] === '.' || parts[i] === '..') return null;
    }
    return parts.join('/');
  }

  async function resolveTarget(rel, root) {
    const rootTarget = await fsService.resolve(root);
    const target = await fsService.resolve(rel, { cwd: root });
    if (typeof fsService.contains === 'function' && !fsService.contains(rootTarget, target)) {
      throw fail(403, 'OUTSIDE_WORKSPACE', 'path escapes the workspace');
    }
    return { root, rootTarget, target };
  }

  /** Resolve an absolute file path, refusing anything outside a registered workspace. */
  async function resolveAbsolute(value) {
    const abs = typeof value === 'string' ? value.trim() : '';
    if (!abs || abs.length > 400 || abs.includes('\0')) {
      throw fail(400, 'BAD_PATH', 'path is not an absolute file path');
    }
    const target = await fsService.resolve(abs);
    const roots = workspaceRoots();
    for (let i = 0; i < roots.length; i += 1) {
      const rootTarget = await fsService.resolve(roots[i]);
      if (typeof fsService.contains !== 'function' || fsService.contains(rootTarget, target)) {
        return { root: roots[i], target };
      }
    }
    throw fail(403, 'OUTSIDE_WORKSPACE', 'file is not inside a registered workspace');
  }

  /**
   * Decode a text file without assuming UTF-8: BOM-marked UTF-16 and legacy
   * GB18030 (the usual encoding of Chinese .txt files) are accepted too.
   * Saves always land as UTF-8 because the filesystem service only writes text.
   */
  function decodeBytes(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8', bom: true };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le', bom: true };
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be', bom: true };
    }
    if (bytes.subarray(0, 4096).includes(0)) throw fail(415, 'BINARY', 'not a text file');
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', bom: false };
    } catch (error) {
      /* not UTF-8: try the legacy Chinese encoding before giving up */
    }
    try {
      return { text: new TextDecoder('gb18030', { fatal: true }).decode(bytes), encoding: 'gb18030', bom: false };
    } catch (error) {
      throw fail(415, 'UNSUPPORTED_ENCODING', 'unsupported text encoding (expected UTF-8, UTF-16 or GB18030)');
    }
  }

  function readBody(req) {
    return new Promise(function (resolve, reject) {
      const chunks = [];
      let size = 0;
      req.on('data', function (chunk) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(fail(413, 'BODY_TOO_LARGE', 'request body too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', function () {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      req.on('error', reject);
    });
  }

  function detectEol(text) {
    const crlf = (text.match(/\r\n/g) || []).length;
    const lf = (text.match(/\n/g) || []).length;
    return crlf > lf - crlf ? 'crlf' : 'lf';
  }

  async function listFiles(url) {
    const roots = workspaceRoots();
    const root = pickRoot(url.searchParams.get('root'));
    const rootTarget = await fsService.resolve(root);
    const files = [];
    async function walk(target, prefix, depth) {
      if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
      const entries = await fsService.listDir(target);
      for (let i = 0; i < entries.length && files.length < MAX_FILES; i += 1) {
        const entry = entries[i];
        if (entry.type === 'directory') {
          const name = entry.name;
          if (name.startsWith('.') || SKIP_DIRECTORIES.has(name)) continue;
          await walk(entry.target, prefix + name + '/', depth + 1);
          continue;
        }
        if (entry.type !== 'file') continue;
        const dot = entry.name.lastIndexOf('.');
        const ext = dot < 0 ? '' : entry.name.slice(dot).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        files.push({ path: prefix + entry.name, size: entry.size || 0 });
      }
    }
    await walk(rootTarget, '', 0);
    files.sort(function (left, right) {
      return left.path.localeCompare(right.path, 'zh');
    });
    return { root, roots, files };
  }

  async function readFile(url) {
    const absolute = url.searchParams.get('absolute') === '1';
    const raw = url.searchParams.get('path');
    let resolved;
    let label;
    if (absolute) {
      resolved = await resolveAbsolute(raw);
      label = String(raw).trim();
    } else {
      const root = pickRoot(url.searchParams.get('root'));
      const rel = relativePath(raw);
      if (!rel) throw fail(400, 'BAD_PATH', 'path is not a relative workspace path');
      resolved = await resolveTarget(rel, root);
      label = rel;
    }
    const info = await fsService.stat(resolved.target);
    if (!info) throw fail(404, 'NOT_FOUND', 'file not found');
    if (info.type !== 'file') throw fail(400, 'NOT_A_FILE', 'path is not a file');
    const decoded = decodeBytes(await fsService.readBytes(resolved.target));
    return {
      root: resolved.root,
      path: label,
      text: decoded.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
      version: info.version,
      eol: detectEol(decoded.text),
      bom: decoded.bom,
      encoding: decoded.encoding,
      size: info.size == null ? null : info.size,
    };
  }

  async function saveFile(req) {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (error) {
      throw fail(400, 'BAD_JSON', 'request body is not JSON');
    }
    const absolute = payload && payload.absolute === true;
    let resolved;
    let label;
    if (absolute) {
      resolved = await resolveAbsolute(payload.path);
      label = String(payload.path).trim();
    } else {
      const root = pickRoot(payload && payload.root);
      const rel = relativePath(payload && payload.path);
      if (!rel) throw fail(400, 'BAD_PATH', 'path is not a relative workspace path');
      resolved = await resolveTarget(rel, root);
      label = rel;
    }

    const sourceEncoding = typeof payload.encoding === 'string' && payload.encoding ? payload.encoding : 'utf-8';
    const converted = sourceEncoding !== 'utf-8';

    let text = typeof payload.text === 'string' ? payload.text : String(payload.text == null ? '' : payload.text);
    text = text.replace(/\r\n/g, '\n');
    if (payload.eol === 'crlf') text = text.replace(/\n/g, '\r\n');
    if (payload.bom && !converted) text = '\uFEFF' + text;

    const expected =
      typeof payload.version === 'string' && payload.version
        ? { kind: 'replaceIfVersion', version: payload.version }
        : undefined;

    let outcome;
    try {
      outcome = await fsService.writeText(resolved.target, text, expected, undefined, {
        mode: 'workspace-write',
        workspaceRoot: resolved.root,
      });
    } catch (error) {
      const code = String((error && error.code) || '');
      if (code === 'FS_STALE_VERSION' || /stale/i.test(String((error && error.message) || ''))) {
        throw fail(409, 'STALE', 'the file changed on disk since it was opened');
      }
      throw error;
    }
    return {
      root: resolved.root,
      path: label,
      version: outcome && outcome.version ? outcome.version : null,
      bytes: Buffer.byteLength(text, 'utf8'),
      operation: outcome ? outcome.operation : 'update',
      encoding: 'utf-8',
      converted,
      previousEncoding: converted ? sourceEncoding : undefined,
    };
  }

  function route(fallbackPath, handler) {
    return function (req, res) {
      Promise.resolve()
        .then(function () {
          const denied = guard(req);
          if (denied) throw denied;
          if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'cache-control': 'no-store' });
            res.end();
            return undefined;
          }
          const url = new URL(req.url || fallbackPath, 'http://localhost');
          return handler(req, url);
        })
        .then(function (payload) {
          if (payload !== undefined) send(res, 200, payload);
        })
        .catch(function (error) {
          const status = error && error.status ? error.status : 500;
          send(res, status, {
            error: (error && error.code) || 'FAILED',
            message: String((error && error.message) || error),
          });
        });
    };
  }

  /**
   * A throw from an activation hook can take the whole boot down with it, and
   * the only way this registration throws is a duplicate path — i.e. a second
   * copy of the plugin. Losing the routes is acceptable; losing the host is not.
   */
  function mount(path, handler) {
    try {
      ctx.effect(function () {
        return server.register({ kind: 'exact', path, handler });
      });
    } catch (error) {
      /* another copy already serves this path: stay silent, /novel-txt/* keeps working */
    }
  }

  mount('/novel-txt/list', route('/novel-txt/list', function (req, url) {
    if (req.method !== 'GET') throw fail(405, 'METHOD', 'GET required');
    return listFiles(url);
  }));

  mount('/novel-txt/read', route('/novel-txt/read', function (req, url) {
    if (req.method !== 'GET') throw fail(405, 'METHOD', 'GET required');
    return readFile(url);
  }));

  mount('/novel-txt/save', route('/novel-txt/save', function (req) {
    if (req.method !== 'POST') throw fail(405, 'METHOD', 'POST required');
    return saveFile(req);
  }));
}
