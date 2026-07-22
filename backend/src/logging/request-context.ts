import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContextStore {
  requestId: string;
}

// One instance for the whole process: every request gets its own store via
// `run()`, so a log line written deep inside a service (no access to the
// HTTP request object) can still be tagged with the request that triggered
// it — without threading a requestId parameter through every function call.
const asyncLocalStorage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, callback: () => T): T {
    return asyncLocalStorage.run(store, callback);
  },

  getRequestId(): string | undefined {
    return asyncLocalStorage.getStore()?.requestId;
  },
};
