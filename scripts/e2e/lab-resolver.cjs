// Preload for the API process during the end-to-end run (a test network, lab only):
//   node --require ./scripts/e2e/lab-resolver.cjs apps/api/dist/src/main.js
//
// The ownership probe (correctly) refuses any address that is private or loopback, with
// no switch to turn that off, so a lab on private addresses can never "prove control"
// the normal way. This stub gives the API the picture a real internet deployment has,
// for ONE lab name only:
//   - proof.lab.test resolves to a public-looking address (93.184.216.34), and
//   - a TCP connection to that address on port 443 is sent to the published lab proxy on
//     127.0.0.1:3301. Nothing leaves the machine.
// Every other name and address is untouched. The worker container is not affected: it
// resolves proof.lab.test on the Docker lab network. Never use this outside the lab.
const net = require('node:net');
const dns = require('node:dns');
const dnsPromises = require('node:dns/promises');

const NAME = 'proof.lab.test';
const PUBLIC_LOOKING = '93.184.216.34';
// The probe speaks https on 443. That connection goes to the lab proxy, which is
// published on 127.0.0.1:3301 (container port 443, with a self-signed certificate for
// proof.lab.test that the API trusts through NODE_EXTRA_CA_CERTS).
const PORT = 443;
const LOCAL_PORT = 3301;

const realLookup = dnsPromises.lookup.bind(dnsPromises);
dnsPromises.lookup = async function labLookup(hostname, options) {
  if (String(hostname).toLowerCase() !== NAME) return realLookup(hostname, options);
  const entry = { address: PUBLIC_LOOKING, family: 4 };
  return options && options.all ? [entry] : entry;
};

const realCallbackLookup = dns.lookup.bind(dns);
dns.lookup = function labCallbackLookup(hostname, options, callback) {
  if (String(hostname).toLowerCase() !== NAME) return realCallbackLookup(hostname, options, callback);
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : options;
  if (opts && opts.all) return process.nextTick(() => cb(null, [{ address: PUBLIC_LOOKING, family: 4 }]));
  return process.nextTick(() => cb(null, PUBLIC_LOOKING, 4));
};

const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function labConnect(...args) {
  const first = args[0];
  // https.request / tls.connect hand the HOST NAME over (and pin it with their own
  // lookup option); a plain connection by address hands the address. Handle both.
  if (first && typeof first === 'object' && !Array.isArray(first) && Number(first.port) === PORT) {
    const host = String(first.host || '').toLowerCase();
    if (host === NAME || host === PUBLIC_LOOKING) {
      const { lookup: _pinnedLookup, ...rest } = first;
      args[0] = { ...rest, host: '127.0.0.1', port: LOCAL_PORT };
    }
  } else if (typeof first === 'number' && first === PORT && args[1] === PUBLIC_LOOKING) {
    args[0] = LOCAL_PORT;
    args[1] = '127.0.0.1';
  }
  return realConnect.apply(this, args);
};
