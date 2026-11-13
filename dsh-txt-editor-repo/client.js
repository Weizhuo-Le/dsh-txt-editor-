window.__ModuleLoader__.load({
  id: 'dsh-txt-editor',
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
      '.rte-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;}',
      '.rte-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);}',
      '.rte-status[data-dirty="true"]{color:var(--dsw-alias-state-warn-primary);}',
      '.rte-spacer{flex:1 1 auto;}',
      '.rte-btn{appearance:none;font:inherit;font-size:11px;line-height:1;padding:5px 9px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;}',
      '.rte-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);}',
      '.rte-btn:disabled{opacity:.45;cursor:default;}',
      '.rte-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.rte-btn--primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600;}',
      '.rte-msg{margin:0;padding:8px 10px;font-size:11px;color:var(--dsw-alias-state-error-primary);border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.rte-body{flex:1 1 auto;min-height:0;display:flex;align-items:stretch;}',
      '.rte-body-inner{flex:1 1 auto;min-width:0;min-height:0;display:flex;position:relative;}',
      '.rte-gutter{flex:none;width:48px;position:relative;overflow:hidden;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);}',
      '.rte-gutterInner{position:absolute;left:0;top:0;right:0;will-change:transform;}',
      /*
       * The digits use the TEXT's own font-size and line-height, then scale down
       * optically. That is what locks them to the text baseline: a smaller
       * font-size in a tall line box is centered by the browser, which floats the
       * number a few pixels above the glyphs it is supposed to label — numbers that
       * sit on a row but read as if they belong to the row above.
       */
      '.rte-lineNo{position:absolute;left:0;right:7px;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.9;color:var(--dsw-alias-label-secondary);opacity:.72;font-variant-numeric:tabular-nums;transform:scale(.78);transform-origin:right center;}',
'.rte-ghost{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;overflow:visible;}',
      '.rte-ghostInner{position:absolute;left:0;top:0;right:0;padding:12px 14px;will-change:transform;}',
      '.rte-ghostRow{position:relative;white-space:pre-wrap;overflow-wrap:break-word;}',
      '.rte-ghostText{visibility:hidden;}',
      '.rte-ghostNo{position:absolute;right:100%;top:0;margin-right:21px;width:41px;text-align:right;white-space:pre;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary);opacity:.72;font-variant-numeric:tabular-nums;}',
      '.rte-ghostNoText{display:inline-block;transform:scale(.78);transform-origin:right center;}',
      '.rte-text{flex:1 1 auto;min-width:0;min-height:0;width:100%;box-sizing:border-box;resize:none;border:0;background:transparent;color:inherit;font-family:inherit;font-size:14px;line-height:1.9;padding:12px 14px;overflow:auto;tab-size:2;}',
      '.rte-text:focus{outline:none;}',
      '.rte-text[data-wrap="true"]{white-space:pre-wrap;}',
      '.rte-text[data-wrap="false"]{white-space:pre;}',
      '.rte-empty{margin:0;padding:28px 16px;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary);}',
    ].join('');

    /* ------------------------------------------------------------------ */
    /* Document body                                                      */
    /* ------------------------------------------------------------------ */

    /*
     * The gutter can hold one absolutely positioned number per line — a few
     * hundred nodes in a chapter. Memoising it keeps every keystroke from
     * re-diffing them: the parent re-renders on each character, but `tops` only
     * changes when a measurement publishes.
     */
    const memo = typeof React.memo === 'function' ? React.memo : function (component) { return component; };

    const EditorStyles = memo(function EditorStyles() {
      return h('style', null, CSS);
    });


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
      const [ghostRows, setGhostRows] = useState([]);
      const [widthTick, setWidthTick] = useState(0);
      const loadedFor = useRef('');
      const alive = useRef(true);
      const textRef = useRef(null);
      const ghostInnerRef = useRef(null);

      useEffect(function () {
        alive.current = true;
        return function () {
          alive.current = false;
        };
      }, []);

      /**
       * The ghost layer holds a copy of the text so the browser can stack the
       * numbers in the same flow: give it the field's own text styling, otherwise
       * it would wrap at different places and the numbers would drift.
       */
      useEffect(
        function () {
          const area = textRef.current;
          const ghost = ghostInnerRef.current;
          if (!area || !ghost || typeof window.getComputedStyle !== 'function') return;
          let computed;
          try {
            computed = window.getComputedStyle(area);
          } catch (error) {
            return;
          }
          const properties = [
            'fontFamily',
            'fontSize',
            'fontWeight',
            'fontStyle',
            'fontVariant',
            'fontStretch',
            'letterSpacing',
            'wordSpacing',
            'textTransform',
            'textIndent',
            'fontFeatureSettings',
            'fontKerning',
            'textRendering',
            'whiteSpace',
            'wordBreak',
            'overflowWrap',
            'lineBreak',
            'tabSize',
            'textAlign',
            'lineHeight',
            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',
          ];
          for (let i = 0; i < properties.length; i += 1) {
            const value = computed[properties[i]];
            if (value) ghost.style[properties[i]] = value;
          }
          /*
           * The field reserves the vertical scrollbar's width; the ghost sits
           * outside it. Without adding that width to the ghost's right padding the
           * copy would be ~15px wider, so a line that wraps in the field would stay
           * on one row here — and every number below it would ride one row high.
           */
          let scrollbar = 0;
          try {
            const borderX = (parseFloat(computed.borderLeftWidth) || 0) + (parseFloat(computed.borderRightWidth) || 0);
            scrollbar = Math.max(0, area.offsetWidth - area.clientWidth - borderX);
          } catch (error) {
            scrollbar = 0;
          }
          const padRight = parseFloat(computed.paddingRight) || 0;
          ghost.style.paddingRight = padRight + scrollbar + 'px';
        },
        [text === null, widthTick, ghostRows],
      );

      /** Rows for the ghost layer, refreshed shortly after typing stops. */
      useEffect(
        function () {
          if (text === null) {
            setGhostRows([]);
            return undefined;
          }
          const derive = function () {
            setGhostRows(String(text).replace(/\r\n?/g, '\n').split('\n'));
          };
          if (!ghostRows.length) {
            derive();
            return undefined;
          }
          const timer = setTimeout(derive, 120);
          return function () {
            clearTimeout(timer);
          };
        },
        [text],
      );

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

      /**
       * One scrollbar, not two.
       *
       * The document pane wraps a body in a scrollable box and treats that box as
       * the scroll owner. This body scrolls on its own — the textarea is the
       * scroller — so it reports `scrollportRef`, which is exactly what the prop
       * is for: "scrolling happens in here, do not scroll outside me". Should a
       * host ignore the report, the same effect clamps the panel to the space the
       * pane actually offers, so the outer box cannot overflow either.
       */
      useEffect(
        function () {
          function report(el) {
            if (typeof props.scrollportRef !== 'function') return;
            try {
              props.scrollportRef(el);
            } catch (error) {
              /* an older host may not accept it */
            }
          }
          const area = textRef.current;
          if (!area) return undefined;
          report(area);

          const inner = area.parentElement;                              // .rte-body-inner
          const body = inner ? inner.parentElement : null;               // .rte-body
          const root = body ? body.parentElement : null;                 // .rte-root
          const box = root ? root.parentElement : null;                  // the pane's body box

          function fit() {
            if (!root || !box || typeof window.getComputedStyle !== 'function') return;
            const style = window.getComputedStyle(box);
            const padTop = parseFloat(style.paddingTop) || 0;
            const padBottom = parseFloat(style.paddingBottom) || 0;
            const available = box.clientHeight - padTop - padBottom;
            if (!available || available < 80) {
              root.style.height = '';
              return;
            }
            root.style.height = available + 'px';
          }

          fit();
          let observer = null;
          if (box && typeof ResizeObserver === 'function') {
            observer = new ResizeObserver(fit);
            observer.observe(box);
          }
          return function () {
            report(null);
            if (observer) observer.disconnect();
          };
        },
        [text === null],
      );

      useEffect(
        function () {
          if (typeof ResizeObserver !== 'function' || text === null) return undefined;
          const area = textRef.current;
          if (!area) return undefined;
          let last = area.clientWidth;
          const observer = new ResizeObserver(function () {
            if (!area || area.clientWidth === last) return;
            last = area.clientWidth;
            setWidthTick(function (tick) {
              return tick + 1;
            });
          });
          observer.observe(area);
          return function () {
            observer.disconnect();
          };
        },
        [text === null],
      );

      function onScroll(event) {
        const inner = ghostInnerRef.current;
        if (!inner || !event || !event.currentTarget) return;
        inner.style.transform = 'translateY(' + -event.currentTarget.scrollTop + 'px)';
      }

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
          h(EditorStyles, null),
          h('p', { className: 'rte-empty' }, T('panel.unavailable')),
        );
      }

      return h(
        'div',
        { className: 'rte-root' },
        h(EditorStyles, null),
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
          : h(
              'div',
              { className: 'rte-body' },
              h('div', { className: 'rte-gutter', 'aria-hidden': 'true' }),
              h(
                'div',
                { className: 'rte-body-inner' },
                /*
                 * The numbers are painted by a ghost layer that holds a copy of the
                 * text in the field's own typography: the browser lays those rows
                 * out exactly as it lays out the field's lines, so a number sits on
                 * its own row by construction. No measuring, no offsets to drift —
                 * editing long enough to wrap a line pushes the numbers down with it.
                 */
                h(
                  'div',
                  { className: 'rte-ghost', 'aria-hidden': 'true' },
                  h(
                    'div',
                    { className: 'rte-ghostInner', ref: ghostInnerRef },
                    ghostRows.map(function (line, index) {
                      return h(
                        'div',
                        { className: 'rte-ghostRow', key: index },
                        h('span', { className: 'rte-ghostNo' }, h('span', { className: 'rte-ghostNoText' }, String(index + 1))),
                        h('span', { className: 'rte-ghostText' }, line === '' ? '\u00a0' : line),
                      );
                    }),
                  ),
                ),
                h('textarea', {
                  className: 'rte-text',
                  ref: textRef,
                  'data-wrap': props.wrap ? 'true' : 'false',
                  value: text,
                  spellCheck: false,
                  onScroll: onScroll,
                  onChange: function (event) {
                    setText(event.target.value);
                  },
                  onKeyDown: onKeyDown,
                }),
              ),
            ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Plugin                                                             */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // Everything below runs during activation, where a single throw fails
        // this entry and aborts the whole web boot. Resolve services softly and
        // guard each registration, so the worst case is a missing editor.
        let translate = null;
        try {
          translate = ctx.locale.bind(NS);
        } catch (error) {
          translate = null;
        }
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

        try {
          ctx.effect(registerDictionary('zh', ZH));
        } catch (error) {
          /* locale effect refused: labels fall back to the bundled Chinese */
        }
        try {
          ctx.effect(registerDictionary('en', EN));
        } catch (error) {
          /* same */
        }

        /**
         * `dsh.client.inject` orders this module after the document-preview
         * package, so by now it has provided `documentPreviews` and declared
         * the `sidebar.right.tab.document` slot. Both facts matter:
         *
         * - Reading the registry before that package activates yields
         *   `undefined`, and the old fallback then registered a body under the
         *   SHIPPED implementation key — an invasive write into a slot whose
         *   declaration was still being committed.
         * - `ctx.slots.inject` runs its callback *inside the declaring
         *   register() call* when the declaration does not exist yet. A throw
         *   from that callback surfaces as the declaring plugin's activation
         *   failure, which is exactly how enabling this plugin could take
         *   `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` — and with it
         *   the whole web boot — down. Nothing here may throw.
         */
        try {
          function registerDefinition(registry) {
            if (!registry || typeof registry.register !== 'function') return;
            ctx.effect(function () {
              try {
                return registry.register({
                  id: BODY_ID,
                  extensions: ['txt', 'text'],
                  priority: 'extension',
                  title: function () {
                    return T('panel.title');
                  },
                  loading: 'text-pages',
                  wrap: false,
                });
              } catch (error) {
                return function () {};
              }
            });
          }

          const ready = ctx.get('documentPreviews');
          if (ready) {
            registerDefinition(ready);
          } else {
            // Activation order is not guaranteed across host versions: if the
            // preview package is not up yet, register as soon as the service
            // appears instead of silently doing nothing.
            try {
              ctx.inject(['documentPreviews'], function (inner) {
                registerDefinition(inner.get('documentPreviews'));
              });
            } catch (error) {
              /* no service injection face on this host: stay read-only */
            }
          }

          // Registering this plugin's own key is harmless on its own — the body
          // is only selected once the definition above is in place — and doing
          // it unconditionally keeps the editor working if the definition lands
          // a moment later.
          ctx.slots.inject('sidebar.right.tab.document', function () {
            try {
              return ctx.slots.register(
                {
                  name: 'sidebar.right.tab.document',
                  key: BODY_ID,
                  locale: NS,
                },
                TextEditorBody,
              );
            } catch (error) {
              return function () {};
            }
          });
        } catch (error) {
          /*
           * One entry that fails to activate aborts the entire web boot, so this
           * entry must never throw for an environment reason. Worst case the
           * editor is simply absent and .txt keeps the shipped preview.
           */
        }
      },
    };
  },
});
