// The Gist sync section of Settings.
import { h, append, toast, confirmDanger } from './dom.js';

export function renderSync(ctx) {
  const sync = ctx.sync;
  if (!sync) return null;
  return sync.connected() ? connectedPanel(ctx, sync) : setupPanel(ctx, sync);
}

function setupPanel(ctx, sync) {
  const token = h('input', {
    type: 'password', placeholder: 'github_pat_...', autocomplete: 'off',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: false,
  });
  const gistId = h('input', {
    type: 'text', placeholder: 'leave empty to make a new one', autocomplete: 'off',
    autocapitalize: 'off', spellcheck: false,
  });

  return h('section', { class: 'card' },
    h('h2', {}, 'Gist sync'),
    h('p', { class: 'muted' }, 'Optional. Everything works without it; this is for keeping a second device and a backup in step.'),
    h('ol', { class: 'muted' },
      h('li', {}, 'On GitHub: Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.'),
      h('li', {}, 'Give it one permission: Account permissions, Gists, Read and write. No repository access.'),
      h('li', {}, 'Paste it below. To join a phone that is already syncing, paste that device\'s gist id too.'),
    ),
    h('label', {}, 'Token', token),
    h('label', {}, 'Gist id (optional)', gistId),
    warning(),
    h('button', {
      class: 'primary wide',
      onclick: async () => {
        if (!token.value.trim()) return toast('Paste a token first');
        await sync.connect({ token: token.value, gistId: gistId.value });
        token.value = '';
        ctx.refresh();
      },
    }, 'Connect'),
    statusLine(ctx, sync),
  );
}

function connectedPanel(ctx, sync) {
  const gistId = ctx.storage.getGistId();
  const failing = sync.status.state === 'error';
  return h('section', { class: 'card' },
    h('div', { class: 'row between' },
      h('h2', {}, 'Gist sync'),
      failing
        ? h('span', { class: 'badge bad' }, 'Not syncing')
        : h('span', { class: 'badge good' }, 'Connected'),
    ),
    failing && h('button', {
      class: 'wide',
      onclick: () => {
        sync.disconnect();
        toast('Enter a different token');
        ctx.refresh();
      },
    }, 'Try a different token'),
    gistId && h('div', {},
      h('p', { class: 'muted' }, 'Gist id, for the other device:'),
      h('div', { class: 'row' },
        h('code', { class: 'grow mono' }, gistId),
        h('button', {
          class: 'small',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(gistId);
              toast('Copied');
            } catch {
              toast(gistId);
            }
          },
        }, 'Copy'),
      ),
      h('a', {
        class: 'btn small ghost wide',
        href: `https://gist.github.com/${gistId}`,
        target: '_blank',
        rel: 'noreferrer',
      }, 'Open the gist on GitHub'),
    ),
    statusLine(ctx, sync),
    h('button', {
      class: 'primary wide',
      onclick: async () => { await sync.syncNow(); ctx.refresh(); },
    }, 'Sync now'),
    warning(),
    h('button', {
      class: 'wide danger',
      onclick: () => {
        if (!confirmDanger('Delete the token and gist id from this device? Your workouts stay.')) return;
        sync.disconnect();
        toast('Disconnected');
        ctx.refresh();
      },
    }, 'Disconnect'),
  );
}

function warning() {
  return h('p', { class: 'muted' },
    'The token is stored in this browser only - anyone who can read this phone\'s browser storage could read it. Disconnect deletes it.');
}

// Live status: the panel keeps itself up to date without re-rendering Settings
// underneath whatever you are typing.
function statusLine(ctx, sync) {
  const state = h('span', { class: 'badge' });
  const message = h('span', { class: 'muted grow' });
  const notes = h('div', { class: 'muted' });
  const row = h('div', {}, h('div', { class: 'row' }, state, message), notes);

  const paint = (status) => {
    state.textContent = status.state;
    state.className = `badge ${status.state === 'error' ? 'bad' : status.state === 'ok' ? 'good' : ''}`;
    message.textContent = [status.message, status.hint].filter(Boolean).join(' - ');
    notes.replaceChildren();
    if (status.lastSync) {
      append(notes, h('div', {}, `Last sync ${new Date(status.lastSync).toLocaleString()}`));
    }
    for (const note of status.notes ?? []) append(notes, h('div', {}, note));
  };

  paint(sync.status);
  ctx.onLeave(sync.subscribe(paint));
  return row;
}
