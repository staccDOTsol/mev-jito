import Agent from 'agentkeepalive';
import EventEmitter from 'events';
import { JitoRpcConnection } from 'jito-ts';
import fetch, {
  RequestInfo,
  RequestInit,
  Response,
} from 'node-fetch';

import { Queue } from '@datastructures-js/queue';

import { config } from '../config.js';
import { logger } from '../logger.js';

const keepaliveHttpAgent = new Agent({
  timeout: 4000,
  freeSocketTimeout: 4000,
  maxSockets: 10000,
});

const TRITON_URL = config.get('triton_url');
const RPC_REQUESTS_PER_SECOND = config.get('rpc_requests_per_second');
const RPC_MAX_BATCH_SIZE = config.get('rpc_max_batch_size');

// TokenBucket class for rate limiting requests
class TokenBucket extends EventEmitter {
  private readonly capacity: number;
  private readonly intervalMs: number;
  private tokens: number;
  private lastRefill: number;

  constructor(capacity: number, interval: number) {
    super();
    this.capacity = capacity;
    this.intervalMs = interval;
    this.tokens = capacity;
    this.lastRefill = new Date().getTime();

    // Refill the bucket periodically
    setInterval(this.refill.bind(this), this.intervalMs);
  }

  private refill() {
    const now = new Date().getTime();
    const timePassed = now - this.lastRefill;
    const intervalsPassed = Math.floor(timePassed / this.intervalMs);

    if (intervalsPassed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + intervalsPassed);
      this.lastRefill += intervalsPassed * this.intervalMs;
      this.emit('refill', this.tokens);
    }
  }

  public tryConsume(tokens = 1) {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }
}

// coalescing requests into one single JSON RPC request to potentially improve
const coalesceFetch = () => {
  const rpcRateLimiter = new TokenBucket(
    RPC_REQUESTS_PER_SECOND,
    1000 / RPC_REQUESTS_PER_SECOND,
  );
  const requestQueue: Queue<{
    url: RequestInfo;
    optionsWithoutDefaults: RequestInit;
    resolve: (value: Response | PromiseLike<Response>) => void;
  }> = new Queue();

  logger.trace(
    `Initializing coalesced fetch with ${RPC_REQUESTS_PER_SECOND} requests per second`,
  );

  const coalesceRequests = async () => {
    if (requestQueue.size() === 0) return;
    logger.trace(`${requestQueue.size()} requests awaiting coalescing`);

    const newBodies = [];
    const resolves = [];
    let lastUrl: RequestInfo;
    let lastOptions: RequestInit;
    const startCoalescing = new Date().getTime();

    // Coalesce requests with same URL and options
    let i = 0;
    while (requestQueue.size() > 0 && i < RPC_MAX_BATCH_SIZE) {
      const { url, optionsWithoutDefaults, resolve } = requestQueue.dequeue();

      const body = JSON.parse(optionsWithoutDefaults.body);
      body.id = i.toString();
      newBodies.push(body);
      resolves.push(resolve);
      lastUrl = url;
      lastOptions = optionsWithoutDefaults;
      i++;
    }

    logger.trace(`Coalescing ${newBodies.length} requests`);

    const response = await fetch(lastUrl, {
      body: JSON.stringify(newBodies),
      headers: lastOptions.headers,
      method: lastOptions.method,
      agent: lastOptions.agent,
    });

    // If the response is not OK, resolve all Promises with the response
    if (!response.ok) {
      logger.debug('Response was not OK');
      for (const resolve of resolves) {
        resolve(response.clone());
      }
      return;
    }

    // If the response is OK, create a single response for each coalesced request and resolve the Promises
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await response.json();

    logger.trace(`Resolving ${json.length} Responses`);

    for (const item of json) {
      const singleResponse = new Response(JSON.stringify(item), {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
      resolves[parseInt(item.id)](singleResponse);
    }

    logger.trace(
      `Coalesced ${json.length} requests in ${new Date().getTime() - startCoalescing}ms`,
    );
  };

  // every time there is a new token available, try to coalesce requests
  rpcRateLimiter.on('refill', () => {
    const batchesNeeded = Math.ceil(requestQueue.size() / RPC_MAX_BATCH_SIZE);
    for (let i = 0; i < batchesNeeded; i++) {
      coalesceRequests();
    }
  });

  return async (
    url: RequestInfo,
    optionsWithoutDefaults: RequestInit,
  ): Promise<Response> => {
    if (rpcRateLimiter.tryConsume()) {
      return fetch(url, optionsWithoutDefaults);
    } else {
      return new Promise((resolve) => {
        requestQueue.push({ url, optionsWithoutDefaults, resolve });
      });
    }
  };
};

let tritonConnection: JitoRpcConnection;
console.log(123)
if (RPC_REQUESTS_PER_SECOND > 0) {
  tritonConnection = new JitoRpcConnection(TRITON_URL, {
    commitment: 'confirmed',
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    fetch: coalesceFetch(),
    disableRetryOnRateLimit: false,
    httpAgent: keepaliveHttpAgent,
    
  });
} else {
  tritonConnection = new JitoRpcConnection(TRITON_URL, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: false,
    httpAgent: keepaliveHttpAgent,
    
  });
}
console.log(321)
export { tritonConnection as connection };
