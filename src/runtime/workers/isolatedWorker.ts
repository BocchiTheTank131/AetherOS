interface IsolatedWorker {
  postMessage(data: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
  terminate(): void;
}

const BOOTSTRAP = `
window.addEventListener('message', (event) => {
  if (event.source !== parent || !event.ports[0]) return;
  const port = event.ports[0];
  try {
    const url = URL.createObjectURL(new Blob([event.data], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = ({ data }) => port.postMessage({ data });
    worker.onerror = ({ message }) => port.postMessage({ error: message });
    worker.onmessageerror = () => port.postMessage({ error: 'Worker message could not be decoded' });
    port.onmessage = ({ data }) => worker.postMessage(data.payload, data.transfer);
  } catch (error) {
    port.postMessage({ error: String(error) });
  }
}, { once: true });
`;

// An opaque document supplies a CSP to its blob worker without restricting desktop requests.
export function createIsolatedWorker(source: string, allowBlobScripts = false): IsolatedWorker {
  if (typeof Worker === 'undefined') throw new Error('Web Workers are required to execute this program');

  if (typeof document === 'undefined') {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const worker = new Worker(url);
      return {
        postMessage: (data, transfer = []) => worker.postMessage(data, transfer),
        set onmessage(handler: IsolatedWorker['onmessage']) { worker.onmessage = handler; },
        set onerror(handler: IsolatedWorker['onerror']) { worker.onerror = handler; },
        terminate: () => worker.terminate(),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const frame = document.createElement('iframe');
  const channel = new MessageChannel();
  frame.hidden = true;
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.title = 'Isolated runtime';
  const scripts = allowBlobScripts ? 'blob:' : '';
  frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${scripts}; worker-src blob:; connect-src 'none';"><script>${BOOTSTRAP}</script>`;
  const worker: IsolatedWorker = {
    postMessage: (data, transfer = []) => channel.port1.postMessage({ payload: data, transfer }, transfer),
    onmessage: null,
    onerror: null,
    terminate: () => {
      channel.port1.close();
      frame.remove();
    },
  };
  channel.port1.onmessage = ({ data }) => {
    if (data.error !== undefined) worker.onerror?.({ message: data.error });
    else worker.onmessage?.(new MessageEvent('message', { data: data.data }));
  };
  frame.addEventListener('load', () => {
    frame.contentWindow?.postMessage(source, '*', [channel.port2]);
  }, { once: true });
  document.body.append(frame);
  return worker;
}
