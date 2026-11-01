window.__ModuleLoader__.load({
  id: '@local/dsh-novel-txt-editor',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useRef = React.useRef;

    /**
     * Editable `.txt` documents inside the RIGHT sidebar.
     *
     * The right column renders a document tab through `documentPreviews`, a
     * registry of implementations ranked by priority band and file suffix. The
     * shipped plain-text fallback is `builtin` and matches nothing in
     * particular, so an `extension`-band implementation for `txt` wins for those
     * files without touching the markdown/html/image/pdf implementations.
     *
     * The body only needs the document's absolute path, read through the tab's
     * resource metadata, and then talks to this plugin's own Host routes for
     * read/save — the same routes the file browser used.
     */
    const NS = 'novel-txt-editor';
    const BODY_ID = 'dsh-txt-editor/text';
    const SHIPPED_TEXT_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text';

    const ZH = {
      'panel.title': '可编辑文本',
      'panel.save': '保存',
      'panel.saveHint': '保存（Ctrl+S）',
      'panel.saved': '已保存',
      'panel.dirty': '未保存',
      'panel.reload': '重新载入',
      'panel.loading': '读取中…',
      'panel.loadFailed': '读不到这个文件',
      'panel.saveFailed': '保存失败',
      'panel.stale': '文件已在磁盘上被改动，先「重新载入」再改',
      'panel.unavailable': '这个文件不在已登记的工作区里，这里只能编辑工作区内的 .txt',
      'panel.reloadConfirm': '重新载入会丢掉未保存的修改，继续？',
      'panel.charCount': '字',
      'panel.lines': '行',
      'panel.readonly': '只读',
      'panel.initializing': '准备中…',
    };

    const EN = {
      'panel.title': 'Editable text',
      'panel.save': 'Save',
      'panel.saveHint': 'Save (Ctrl+S)',
      'panel.saved': 'Saved',
      'panel.dirty': 'Unsaved',
      'panel.reload': 'Reload',
      'panel.loading': 'Loading…',
      'panel.loadFailed': 'Cannot read this file',
      'panel.saveFailed': 'Save failed',
      'panel.stale': 'The file changed on disk. Reload before saving',
      'panel.unavailable': 'This file is outside every registered workspace; only workspace .txt files are editable here',
      'panel.reloadConfirm': 'Reloading discards unsaved changes. Continue?',
      'panel.charCount': 'chars',
      'panel.lines': 'lines',
      'panel.readonly': 'read-only',
      'panel.initializing': 'Preparing…',
    };

    function makeT(translate) {
      return function t(key) {
        if (translate) {
          try {
            const value = translate(key);
            if (value && value !== key) return value;
          } catch (error) {
            /* fall through to the bundled default */
          }
        }
        return Object.prototype.hasOwnProperty.call(ZH, key) ? ZH[key] : key;
      };
    }

    async function request(path, init) {
      const options = Object.assign({ cache: 'no-store' }, init || {});
      options.headers = Object.assign({ 'x-novel-txt': '1' }, (init && init.headers) || {});
      const response = await fetch(path, options);
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
      if (!response.ok) {
        const failure = new Error((data && data.message) || 'HTTP ' + response.status);
        failure.status = response.status;
        failure.code = data && data.error;
        throw failure;
      }
      return data || {};
    }

    function clockLabel(iso) {
      if (!iso) return '';
      const at = new Date(iso);
      if (isNaN(at.getTime())) return '';
      const pad = function (value) {
        return value < 10 ? '0' + value : String(value);
      };
      return pad(at.getHours()) + ':' + pad(at.getMinutes());
    }

    const CSS = [
      '.rte-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;}',
      '.rte-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.rte-status[data-dirty="true"]{color:var(--dsw-alias-state-warn-primary);}',
      '.rte-spacer{flex:1 1 auto;}',
      '.rte-btn{appearance:none;font:inherit;font-size:11px;line-height:1;padding:5px 9px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;}',
      '.rte-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);}',
      '.rte-btn:disabled{opacity:.45;cursor:default;}',
      '.rte-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.rte-btn--primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.rte-msg{margin:0;padding:8px 10px;font-size:11px;color:var(--dsw-alias-state-error-primary);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.rte-text{flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;border:0;background:transparent;color:inherit;font-family:inherit;font-size:14px;line-height:1.9;padding:12px 14px;overflow:auto;tab-size:2;}',
      '.rte-text:focus{outline:none;}',
      '.rte-text[data-wrap="true"]{white-space:pre-wrap;}',
      '.rte-text[data-wrap="false"]{white-space:pre;}',
      '.rte-empty{margin:0;padding:28px 16px;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary);}',
    ].join('');

    /* ------------------------------------------------------------------ */
    /* Document body                                                      */
    /* ------------------------------------------------------------------ */

    function TextEditorBody(props) {
      const T = makeT(props && props.t);
      const info = props.useTabInfo();
      const tab = info && info.tab ? info.tab : {};
      const meta = props.useResource(tab.contentId);
      const address =
        meta && meta.value && typeof meta.value.absolutePath === 'string' ? meta.value.absolutePath : '';

      const [text, setText] = useState(null);
      const [saved, setSaved] = useState('');
      const [version, setVersion] = useState('');
      const [eol, setEol] = useState('lf');
      const [bom, setBom] = useState(false);
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState(null);
      const [flash, setFlash] = useState('');
      const [reloadKey, setReloadKey] = useState(0);
      const [savedAt, setSavedAt] = useState('');
      const loadedFor = useRef('');
      const alive = useRef(true);

      useEffect(function () {
        alive.current = true;
        return function () {
          alive.current = false;
        };
      }, []);

      useEffect(
        function () {
          if (!address) return undefined;
          const key = address + '#' + reloadKey;
          if (loadedFor.current === key) return undefined;
          loadedFor.current = key;
          let cancelled = false;
          setBusy(true);
          setNotice(null);
          request('/novel-txt/read?absolute=1&path=' + encodeURIComponent(address))
            .then(function (data) {
              if (cancelled || !alive.current) return;
              setText(data.text || '');
              setSaved(data.text || '');
              setVersion(data.version || '');
              setEol(data.eol === 'crlf' ? 'crlf' : 'lf');
              setBom(!!data.bom);
            })
            .catch(function (error) {
              if (cancelled || !alive.current) return;
              setText(null);
              setNotice({ kind: 'error', text: T('panel.loadFailed') + '（' + error.message + '）' });
            })
            .finally(function () {
              if (cancelled || !alive.current) return;
              setBusy(false);
            });
          return function () {
            cancelled = true;
          };
        },
        [address, reloadKey],
      );

      useEffect(
        function () {
          if (!flash) return undefined;
          const timer = setTimeout(function () {
            setFlash('');
          }, 1500);
          return function () {
            clearTimeout(timer);
          };
        },
        [flash],
      );

      const dirty = text !== null && text !== saved;
      const chars = text === null ? 0 : text.replace(/\s/g, '').length;
      const lines = text ? text.split('\n').length : 0;

      async function save() {
        if (!address || text === null || text === saved || busy) return;
        setBusy(true);
        setNotice(null);
        try {
          const data = await request('/novel-txt/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-novel-txt': '1' },
            body: JSON.stringify({
              absolute: true,
              path: address,
              text: text,
              version: version,
              eol: eol,
              bom: bom,
            }),
          });
          if (!alive.current) return;
          setVersion(data.version || '');
          setSaved(text);
          setSavedAt(new Date().toISOString());
          setFlash('saved');
        } catch (error) {
          if (!alive.current) return;
          setNotice({
            kind: 'error',
            text:
              (error.status === 409 ? T('panel.stale') : T('panel.saveFailed')) +
              '（' + error.message + '）',
          });
        } finally {
          if (alive.current) setBusy(false);
        }
      }

      function reload() {
        if (dirty && !window.confirm(T('panel.reloadConfirm'))) return;
        setReloadKey(function (value) {
          return value + 1;
        });
      }

      function onKeyDown(event) {
        if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
          event.preventDefault();
          save();
        }
      }

      if (!address) {
        return h(
          'div',
          { className: 'rte-root' },
          h('style', null, CSS),
          h('p', { className: 'rte-empty' }, T('panel.unavailable')),
        );
      }

      return h(
        'div',
        { className: 'rte-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'rte-bar' },
          h(
            'span',
            { className: 'rte-status', 'data-dirty': dirty ? 'true' : 'false' },
            dirty ? T('panel.dirty') : flash === 'saved' ? T('panel.saved') : savedAt ? T('panel.saved') + ' ' + clockLabel(savedAt) : '',
          ),
          h('span', null, chars + ' ' + T('panel.charCount') + ' · ' + lines + ' ' + T('panel.lines')),
          h('span', { className: 'rte-spacer' }),
          h(
            'button',
            { className: 'rte-btn', type: 'button', onClick: reload, disabled: busy },
            T('panel.reload'),
          ),
          h(
            'button',
            {
              className: 'rte-btn rte-btn--primary',
              type: 'button',
              title: T('panel.saveHint'),
              onClick: save,
              disabled: !dirty || busy,
            },
            T('panel.save'),
          ),
        ),
        notice ? h('p', { className: 'rte-msg' }, notice.text) : null,
        text === null
          ? h('p', { className: 'rte-empty' }, busy ? T('panel.loading') : T('panel.initializing'))
          : h('textarea', {
              className: 'rte-text',
              'data-wrap': props.wrap ? 'true' : 'false',
              value: text,
              spellCheck: false,
              onChange: function (event) {
                setText(event.target.value);
              },
              onKeyDown: onKeyDown,
            }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Plugin                                                             */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const translate = ctx.locale.bind(NS);
        const T = makeT(translate);

        function registerDictionary(locale, dictionary) {
          return function () {
            try {
              return ctx.locale.register(NS, locale, dictionary);
            } catch (error) {
              return function () {};
            }
          };
        }

        ctx.effect(registerDictionary('zh', ZH));
        ctx.effect(registerDictionary('en', EN));

        let previews = ctx.get('documentPreviews');
        if (!previews) {
          try {
            previews = ctx.documentPreviews;
          } catch (error) {
            previews = undefined;
          }
        }
        let extensionActive = false;
        if (previews && typeof previews.register === 'function') {
          ctx.effect(function () {
            try {
              const dispose = previews.register({
                id: BODY_ID,
                extensions: ['txt', 'text'],
                priority: 'extension',
                title: function () {
                  return T('panel.title');
                },
                loading: 'text-pages',
                wrap: false,
              });
              extensionActive = true;
              return dispose;
            } catch (error) {
              extensionActive = false;
              return function () {};
            }
          });
        }

        ctx.slots.inject('sidebar.right.tab.document', function () {
          const own = ctx.slots.register(
            {
              name: 'sidebar.right.tab.document',
              key: BODY_ID,
              locale: NS,
            },
            TextEditorBody,
          );
          if (extensionActive) return own;
          // No extension point: take over the plain-text fallback body so .txt stays editable.
          const fallback = ctx.slots.register(
            {
              name: 'sidebar.right.tab.document',
              key: SHIPPED_TEXT_ID,
              locale: NS,
            },
            TextEditorBody,
          );
          return [own, fallback];
        });
      },
    };
  },
});
