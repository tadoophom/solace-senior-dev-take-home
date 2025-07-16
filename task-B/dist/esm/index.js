import require$$0$1 from 'assert';
import require$$2 from 'child_process';
import require$$0 from 'path';
import require$$0$2 from 'fs';

const getNodeWebcrypto = () => {
  try {
    // Prevent bundlers from statically analysing the require call
    // eslint-disable-next-line no-new-func
    const _require = new Function('m', 'return require(m);');
    return _require('crypto').webcrypto;
  } catch (_) {
    return undefined;
  }
};

const webcrypto = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
  ? globalThis.crypto
  : getNodeWebcrypto();

if (!webcrypto) {
  throw new Error('Web Crypto API not available in this environment');
}

const subtle = webcrypto.subtle;

/**
 * Import raw key material (Uint8Array or ArrayBuffer) into a CryptoKey.
 * If a CryptoKey is passed, returns it unchanged.
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} keyMaterial – 256-bit key or CryptoKey.
 *        If string, it must be base64-encoded.
 * @returns {Promise<CryptoKey>}
 */
async function getKey(keyMaterial) {
  if (typeof globalThis.CryptoKey !== 'undefined' && keyMaterial instanceof globalThis.CryptoKey) {
    return keyMaterial;
  }
  let raw;
  if (typeof keyMaterial === 'string') {
    raw = fromBase64(keyMaterial);
  } else if (keyMaterial instanceof ArrayBuffer) {
    raw = new Uint8Array(keyMaterial);
  } else if (ArrayBuffer.isView(keyMaterial)) {
    raw = new Uint8Array(keyMaterial.buffer, keyMaterial.byteOffset, keyMaterial.byteLength);
  } else {
    throw new TypeError('Invalid key material');
  }
  if (raw.length !== 32) {
    throw new Error('AES-GCM key must be 256 bits (32 bytes)');
  }
  return subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(ab) {
  const uint8Array = new Uint8Array(ab);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const uint8Array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }
  return uint8Array;
}

/**
 * Encrypt text or binary data with AES-GCM-256.
 * @param {string|ArrayBuffer|Uint8Array} data
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} keyMaterial – 256-bit key.
 * @returns {Promise<{iv:string,ciphertext:string,tag:string}>}
 */
async function encryptBlob(data, keyMaterial) {
  const key = await getKey(keyMaterial);
  const iv = webcrypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM
  const plainBytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  const cipherBytes = new Uint8Array(cipherBuf);
  // Split ciphertext and tag (last 16 bytes)
  const tagBytes = cipherBytes.slice(-16);
  const ctBytes = cipherBytes.slice(0, -16);
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ctBytes),
    tag: toBase64(tagBytes)
  };
}

/**
 * Decrypt previously encrypted blob.
 * @param {{iv:string,ciphertext:string,tag:string}} cipher
 * @param {CryptoKey|Uint8Array|ArrayBuffer|string} keyMaterial
 * @returns {Promise<string>} plaintext (UTF-8)
 */
async function decryptBlob(cipher, keyMaterial) {
  const { iv, ciphertext, tag } = cipher;
  const key = await getKey(keyMaterial);
  const ivBytes = fromBase64(iv);
  const ctBytes = fromBase64(ciphertext);
  const tagBytes = fromBase64(tag);
  const combined = new Uint8Array([...ctBytes, ...tagBytes]);
  const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, combined);
  return new TextDecoder().decode(plainBuf);
}

/*
 * Browser Voice Activity Detection (VAD) helper.
 *
 * Uses Web Audio API to capture microphone input and yields frames that
 * exceed a simple RMS energy threshold.  While not as sophisticated as
 * WebRTC-VAD, this requires no native/WASM dependencies and works in any
 * modern browser.
 *
 * Returned objects: { frame: ArrayBuffer, timestamp: number }
 */

/**
 * @typedef {Object} VADFrame
 * @property {ArrayBuffer} frame – Raw Float32 PCM frame (mono)
 * @property {number} timestamp – Epoch ms when captured
 */

const DEFAULT_OPTS = {
  sampleRate: 16_000,
  frameMs: 30,
  rmsThreshold: 0.015  // tweak for sensitivity (0.01 – 0.03 typical)
};

/**
 * Records microphone audio and yields speech frames (based on RMS energy).
 * Consumer controls loop termination (e.g., via AbortController signal).
 *
 * @param {Partial<typeof DEFAULT_OPTS>} opts
 * @returns {AsyncGenerator<VADFrame>}
 */
async function* recordAndDetectVoiceBrowser(opts = {}) {
  const { sampleRate, frameMs, rmsThreshold } = { ...DEFAULT_OPTS, ...opts };
  const frameLength = Math.round(sampleRate * (frameMs / 1000));

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate, channelCount: 1 } });
  const ctx = new AudioContext({ sampleRate });
  const source = ctx.createMediaStreamSource(stream);

  const bufferSize = 1024; // ScriptProcessorNode buffer size (pow2)
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

  const buf = new Float32Array(frameLength);
  let bufOffset = 0;

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0);
    let i = 0;
    while (i < input.length) {
      const remain = frameLength - bufOffset;
      const toCopy = Math.min(remain, input.length - i);
      buf.set(input.subarray(i, i + toCopy), bufOffset);
      bufOffset += toCopy;
      i += toCopy;

      if (bufOffset === frameLength) {
        const rms = Math.sqrt(buf.reduce((sum, s) => sum + s * s, 0) / buf.length);
        if (rms > rmsThreshold) {
          // Copy to ArrayBuffer to detach from underlying Float32Array
          const frameCopy = new Float32Array(buf).buffer;
          queue.push({ frame: frameCopy, timestamp: Date.now() });
        }
        bufOffset = 0;
      }
    }
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  // Queue for yielded frames
  const queue = [];
  try {
    while (true) {
      if (queue.length) {
        yield queue.shift();
      } else {
        await new Promise((r) => setTimeout(r, frameMs));
      }
    }
  } finally {
    // Cleanup on iterator return/break
    processor.disconnect();
    source.disconnect();
    processor.onaudioprocess = null;
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  }
}

/**
 * Public VAD facade: selects browser or Node implementation.
 */
const recordAndDetectVoice$1 = async function* (...args) {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    // Browser environment - use browser implementation
    yield* recordAndDetectVoiceBrowser(...args);
  } else {
    // Node.js environment - dynamically import Node implementation
    const { recordAndDetectVoice: nodeRecordAndDetectVoice } = await Promise.resolve().then(function () { return vad; });
    yield* nodeRecordAndDetectVoice(...args);
  }
};

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var browserPonyfill = {exports: {}};

(function (module, exports) {
	// Save global object in a variable
	var __global__ =
	(typeof globalThis !== 'undefined' && globalThis) ||
	(typeof self !== 'undefined' && self) ||
	(typeof commonjsGlobal !== 'undefined' && commonjsGlobal);
	// Create an object that extends from __global__ without the fetch function
	var __globalThis__ = (function () {
	function F() {
	this.fetch = false;
	this.DOMException = __global__.DOMException;
	}
	F.prototype = __global__; // Needed for feature detection on whatwg-fetch's code
	return new F();
	})();
	// Wraps whatwg-fetch with a function scope to hijack the global object
	// "globalThis" that's going to be patched
	(function(globalThis) {

	((function (exports) {

	  /* eslint-disable no-prototype-builtins */
	  var g =
	    (typeof globalThis !== 'undefined' && globalThis) ||
	    (typeof self !== 'undefined' && self) ||
	    // eslint-disable-next-line no-undef
	    (typeof commonjsGlobal !== 'undefined' && commonjsGlobal) ||
	    {};

	  var support = {
	    searchParams: 'URLSearchParams' in g,
	    iterable: 'Symbol' in g && 'iterator' in Symbol,
	    blob:
	      'FileReader' in g &&
	      'Blob' in g &&
	      (function() {
	        try {
	          new Blob();
	          return true
	        } catch (e) {
	          return false
	        }
	      })(),
	    formData: 'FormData' in g,
	    arrayBuffer: 'ArrayBuffer' in g
	  };

	  function isDataView(obj) {
	    return obj && DataView.prototype.isPrototypeOf(obj)
	  }

	  if (support.arrayBuffer) {
	    var viewClasses = [
	      '[object Int8Array]',
	      '[object Uint8Array]',
	      '[object Uint8ClampedArray]',
	      '[object Int16Array]',
	      '[object Uint16Array]',
	      '[object Int32Array]',
	      '[object Uint32Array]',
	      '[object Float32Array]',
	      '[object Float64Array]'
	    ];

	    var isArrayBufferView =
	      ArrayBuffer.isView ||
	      function(obj) {
	        return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
	      };
	  }

	  function normalizeName(name) {
	    if (typeof name !== 'string') {
	      name = String(name);
	    }
	    if (/[^a-z0-9\-#$%&'*+.^_`|~!]/i.test(name) || name === '') {
	      throw new TypeError('Invalid character in header field name: "' + name + '"')
	    }
	    return name.toLowerCase()
	  }

	  function normalizeValue(value) {
	    if (typeof value !== 'string') {
	      value = String(value);
	    }
	    return value
	  }

	  // Build a destructive iterator for the value list
	  function iteratorFor(items) {
	    var iterator = {
	      next: function() {
	        var value = items.shift();
	        return {done: value === undefined, value: value}
	      }
	    };

	    if (support.iterable) {
	      iterator[Symbol.iterator] = function() {
	        return iterator
	      };
	    }

	    return iterator
	  }

	  function Headers(headers) {
	    this.map = {};

	    if (headers instanceof Headers) {
	      headers.forEach(function(value, name) {
	        this.append(name, value);
	      }, this);
	    } else if (Array.isArray(headers)) {
	      headers.forEach(function(header) {
	        if (header.length != 2) {
	          throw new TypeError('Headers constructor: expected name/value pair to be length 2, found' + header.length)
	        }
	        this.append(header[0], header[1]);
	      }, this);
	    } else if (headers) {
	      Object.getOwnPropertyNames(headers).forEach(function(name) {
	        this.append(name, headers[name]);
	      }, this);
	    }
	  }

	  Headers.prototype.append = function(name, value) {
	    name = normalizeName(name);
	    value = normalizeValue(value);
	    var oldValue = this.map[name];
	    this.map[name] = oldValue ? oldValue + ', ' + value : value;
	  };

	  Headers.prototype['delete'] = function(name) {
	    delete this.map[normalizeName(name)];
	  };

	  Headers.prototype.get = function(name) {
	    name = normalizeName(name);
	    return this.has(name) ? this.map[name] : null
	  };

	  Headers.prototype.has = function(name) {
	    return this.map.hasOwnProperty(normalizeName(name))
	  };

	  Headers.prototype.set = function(name, value) {
	    this.map[normalizeName(name)] = normalizeValue(value);
	  };

	  Headers.prototype.forEach = function(callback, thisArg) {
	    for (var name in this.map) {
	      if (this.map.hasOwnProperty(name)) {
	        callback.call(thisArg, this.map[name], name, this);
	      }
	    }
	  };

	  Headers.prototype.keys = function() {
	    var items = [];
	    this.forEach(function(value, name) {
	      items.push(name);
	    });
	    return iteratorFor(items)
	  };

	  Headers.prototype.values = function() {
	    var items = [];
	    this.forEach(function(value) {
	      items.push(value);
	    });
	    return iteratorFor(items)
	  };

	  Headers.prototype.entries = function() {
	    var items = [];
	    this.forEach(function(value, name) {
	      items.push([name, value]);
	    });
	    return iteratorFor(items)
	  };

	  if (support.iterable) {
	    Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
	  }

	  function consumed(body) {
	    if (body._noBody) return
	    if (body.bodyUsed) {
	      return Promise.reject(new TypeError('Already read'))
	    }
	    body.bodyUsed = true;
	  }

	  function fileReaderReady(reader) {
	    return new Promise(function(resolve, reject) {
	      reader.onload = function() {
	        resolve(reader.result);
	      };
	      reader.onerror = function() {
	        reject(reader.error);
	      };
	    })
	  }

	  function readBlobAsArrayBuffer(blob) {
	    var reader = new FileReader();
	    var promise = fileReaderReady(reader);
	    reader.readAsArrayBuffer(blob);
	    return promise
	  }

	  function readBlobAsText(blob) {
	    var reader = new FileReader();
	    var promise = fileReaderReady(reader);
	    var match = /charset=([A-Za-z0-9_-]+)/.exec(blob.type);
	    var encoding = match ? match[1] : 'utf-8';
	    reader.readAsText(blob, encoding);
	    return promise
	  }

	  function readArrayBufferAsText(buf) {
	    var view = new Uint8Array(buf);
	    var chars = new Array(view.length);

	    for (var i = 0; i < view.length; i++) {
	      chars[i] = String.fromCharCode(view[i]);
	    }
	    return chars.join('')
	  }

	  function bufferClone(buf) {
	    if (buf.slice) {
	      return buf.slice(0)
	    } else {
	      var view = new Uint8Array(buf.byteLength);
	      view.set(new Uint8Array(buf));
	      return view.buffer
	    }
	  }

	  function Body() {
	    this.bodyUsed = false;

	    this._initBody = function(body) {
	      /*
	        fetch-mock wraps the Response object in an ES6 Proxy to
	        provide useful test harness features such as flush. However, on
	        ES5 browsers without fetch or Proxy support pollyfills must be used;
	        the proxy-pollyfill is unable to proxy an attribute unless it exists
	        on the object before the Proxy is created. This change ensures
	        Response.bodyUsed exists on the instance, while maintaining the
	        semantic of setting Request.bodyUsed in the constructor before
	        _initBody is called.
	      */
	      // eslint-disable-next-line no-self-assign
	      this.bodyUsed = this.bodyUsed;
	      this._bodyInit = body;
	      if (!body) {
	        this._noBody = true;
	        this._bodyText = '';
	      } else if (typeof body === 'string') {
	        this._bodyText = body;
	      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
	        this._bodyBlob = body;
	      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
	        this._bodyFormData = body;
	      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
	        this._bodyText = body.toString();
	      } else if (support.arrayBuffer && support.blob && isDataView(body)) {
	        this._bodyArrayBuffer = bufferClone(body.buffer);
	        // IE 10-11 can't handle a DataView body.
	        this._bodyInit = new Blob([this._bodyArrayBuffer]);
	      } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
	        this._bodyArrayBuffer = bufferClone(body);
	      } else {
	        this._bodyText = body = Object.prototype.toString.call(body);
	      }

	      if (!this.headers.get('content-type')) {
	        if (typeof body === 'string') {
	          this.headers.set('content-type', 'text/plain;charset=UTF-8');
	        } else if (this._bodyBlob && this._bodyBlob.type) {
	          this.headers.set('content-type', this._bodyBlob.type);
	        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
	          this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
	        }
	      }
	    };

	    if (support.blob) {
	      this.blob = function() {
	        var rejected = consumed(this);
	        if (rejected) {
	          return rejected
	        }

	        if (this._bodyBlob) {
	          return Promise.resolve(this._bodyBlob)
	        } else if (this._bodyArrayBuffer) {
	          return Promise.resolve(new Blob([this._bodyArrayBuffer]))
	        } else if (this._bodyFormData) {
	          throw new Error('could not read FormData body as blob')
	        } else {
	          return Promise.resolve(new Blob([this._bodyText]))
	        }
	      };
	    }

	    this.arrayBuffer = function() {
	      if (this._bodyArrayBuffer) {
	        var isConsumed = consumed(this);
	        if (isConsumed) {
	          return isConsumed
	        } else if (ArrayBuffer.isView(this._bodyArrayBuffer)) {
	          return Promise.resolve(
	            this._bodyArrayBuffer.buffer.slice(
	              this._bodyArrayBuffer.byteOffset,
	              this._bodyArrayBuffer.byteOffset + this._bodyArrayBuffer.byteLength
	            )
	          )
	        } else {
	          return Promise.resolve(this._bodyArrayBuffer)
	        }
	      } else if (support.blob) {
	        return this.blob().then(readBlobAsArrayBuffer)
	      } else {
	        throw new Error('could not read as ArrayBuffer')
	      }
	    };

	    this.text = function() {
	      var rejected = consumed(this);
	      if (rejected) {
	        return rejected
	      }

	      if (this._bodyBlob) {
	        return readBlobAsText(this._bodyBlob)
	      } else if (this._bodyArrayBuffer) {
	        return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
	      } else if (this._bodyFormData) {
	        throw new Error('could not read FormData body as text')
	      } else {
	        return Promise.resolve(this._bodyText)
	      }
	    };

	    if (support.formData) {
	      this.formData = function() {
	        return this.text().then(decode)
	      };
	    }

	    this.json = function() {
	      return this.text().then(JSON.parse)
	    };

	    return this
	  }

	  // HTTP methods whose capitalization should be normalized
	  var methods = ['CONNECT', 'DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'TRACE'];

	  function normalizeMethod(method) {
	    var upcased = method.toUpperCase();
	    return methods.indexOf(upcased) > -1 ? upcased : method
	  }

	  function Request(input, options) {
	    if (!(this instanceof Request)) {
	      throw new TypeError('Please use the "new" operator, this DOM object constructor cannot be called as a function.')
	    }

	    options = options || {};
	    var body = options.body;

	    if (input instanceof Request) {
	      if (input.bodyUsed) {
	        throw new TypeError('Already read')
	      }
	      this.url = input.url;
	      this.credentials = input.credentials;
	      if (!options.headers) {
	        this.headers = new Headers(input.headers);
	      }
	      this.method = input.method;
	      this.mode = input.mode;
	      this.signal = input.signal;
	      if (!body && input._bodyInit != null) {
	        body = input._bodyInit;
	        input.bodyUsed = true;
	      }
	    } else {
	      this.url = String(input);
	    }

	    this.credentials = options.credentials || this.credentials || 'same-origin';
	    if (options.headers || !this.headers) {
	      this.headers = new Headers(options.headers);
	    }
	    this.method = normalizeMethod(options.method || this.method || 'GET');
	    this.mode = options.mode || this.mode || null;
	    this.signal = options.signal || this.signal || (function () {
	      if ('AbortController' in g) {
	        var ctrl = new AbortController();
	        return ctrl.signal;
	      }
	    }());
	    this.referrer = null;

	    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
	      throw new TypeError('Body not allowed for GET or HEAD requests')
	    }
	    this._initBody(body);

	    if (this.method === 'GET' || this.method === 'HEAD') {
	      if (options.cache === 'no-store' || options.cache === 'no-cache') {
	        // Search for a '_' parameter in the query string
	        var reParamSearch = /([?&])_=[^&]*/;
	        if (reParamSearch.test(this.url)) {
	          // If it already exists then set the value with the current time
	          this.url = this.url.replace(reParamSearch, '$1_=' + new Date().getTime());
	        } else {
	          // Otherwise add a new '_' parameter to the end with the current time
	          var reQueryString = /\?/;
	          this.url += (reQueryString.test(this.url) ? '&' : '?') + '_=' + new Date().getTime();
	        }
	      }
	    }
	  }

	  Request.prototype.clone = function() {
	    return new Request(this, {body: this._bodyInit})
	  };

	  function decode(body) {
	    var form = new FormData();
	    body
	      .trim()
	      .split('&')
	      .forEach(function(bytes) {
	        if (bytes) {
	          var split = bytes.split('=');
	          var name = split.shift().replace(/\+/g, ' ');
	          var value = split.join('=').replace(/\+/g, ' ');
	          form.append(decodeURIComponent(name), decodeURIComponent(value));
	        }
	      });
	    return form
	  }

	  function parseHeaders(rawHeaders) {
	    var headers = new Headers();
	    // Replace instances of \r\n and \n followed by at least one space or horizontal tab with a space
	    // https://tools.ietf.org/html/rfc7230#section-3.2
	    var preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ');
	    // Avoiding split via regex to work around a common IE11 bug with the core-js 3.6.0 regex polyfill
	    // https://github.com/github/fetch/issues/748
	    // https://github.com/zloirock/core-js/issues/751
	    preProcessedHeaders
	      .split('\r')
	      .map(function(header) {
	        return header.indexOf('\n') === 0 ? header.substr(1, header.length) : header
	      })
	      .forEach(function(line) {
	        var parts = line.split(':');
	        var key = parts.shift().trim();
	        if (key) {
	          var value = parts.join(':').trim();
	          try {
	            headers.append(key, value);
	          } catch (error) {
	            console.warn('Response ' + error.message);
	          }
	        }
	      });
	    return headers
	  }

	  Body.call(Request.prototype);

	  function Response(bodyInit, options) {
	    if (!(this instanceof Response)) {
	      throw new TypeError('Please use the "new" operator, this DOM object constructor cannot be called as a function.')
	    }
	    if (!options) {
	      options = {};
	    }

	    this.type = 'default';
	    this.status = options.status === undefined ? 200 : options.status;
	    if (this.status < 200 || this.status > 599) {
	      throw new RangeError("Failed to construct 'Response': The status provided (0) is outside the range [200, 599].")
	    }
	    this.ok = this.status >= 200 && this.status < 300;
	    this.statusText = options.statusText === undefined ? '' : '' + options.statusText;
	    this.headers = new Headers(options.headers);
	    this.url = options.url || '';
	    this._initBody(bodyInit);
	  }

	  Body.call(Response.prototype);

	  Response.prototype.clone = function() {
	    return new Response(this._bodyInit, {
	      status: this.status,
	      statusText: this.statusText,
	      headers: new Headers(this.headers),
	      url: this.url
	    })
	  };

	  Response.error = function() {
	    var response = new Response(null, {status: 200, statusText: ''});
	    response.ok = false;
	    response.status = 0;
	    response.type = 'error';
	    return response
	  };

	  var redirectStatuses = [301, 302, 303, 307, 308];

	  Response.redirect = function(url, status) {
	    if (redirectStatuses.indexOf(status) === -1) {
	      throw new RangeError('Invalid status code')
	    }

	    return new Response(null, {status: status, headers: {location: url}})
	  };

	  exports.DOMException = g.DOMException;
	  try {
	    new exports.DOMException();
	  } catch (err) {
	    exports.DOMException = function(message, name) {
	      this.message = message;
	      this.name = name;
	      var error = Error(message);
	      this.stack = error.stack;
	    };
	    exports.DOMException.prototype = Object.create(Error.prototype);
	    exports.DOMException.prototype.constructor = exports.DOMException;
	  }

	  function fetch(input, init) {
	    return new Promise(function(resolve, reject) {
	      var request = new Request(input, init);

	      if (request.signal && request.signal.aborted) {
	        return reject(new exports.DOMException('Aborted', 'AbortError'))
	      }

	      var xhr = new XMLHttpRequest();

	      function abortXhr() {
	        xhr.abort();
	      }

	      xhr.onload = function() {
	        var options = {
	          statusText: xhr.statusText,
	          headers: parseHeaders(xhr.getAllResponseHeaders() || '')
	        };
	        // This check if specifically for when a user fetches a file locally from the file system
	        // Only if the status is out of a normal range
	        if (request.url.indexOf('file://') === 0 && (xhr.status < 200 || xhr.status > 599)) {
	          options.status = 200;
	        } else {
	          options.status = xhr.status;
	        }
	        options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL');
	        var body = 'response' in xhr ? xhr.response : xhr.responseText;
	        setTimeout(function() {
	          resolve(new Response(body, options));
	        }, 0);
	      };

	      xhr.onerror = function() {
	        setTimeout(function() {
	          reject(new TypeError('Network request failed'));
	        }, 0);
	      };

	      xhr.ontimeout = function() {
	        setTimeout(function() {
	          reject(new TypeError('Network request timed out'));
	        }, 0);
	      };

	      xhr.onabort = function() {
	        setTimeout(function() {
	          reject(new exports.DOMException('Aborted', 'AbortError'));
	        }, 0);
	      };

	      function fixUrl(url) {
	        try {
	          return url === '' && g.location.href ? g.location.href : url
	        } catch (e) {
	          return url
	        }
	      }

	      xhr.open(request.method, fixUrl(request.url), true);

	      if (request.credentials === 'include') {
	        xhr.withCredentials = true;
	      } else if (request.credentials === 'omit') {
	        xhr.withCredentials = false;
	      }

	      if ('responseType' in xhr) {
	        if (support.blob) {
	          xhr.responseType = 'blob';
	        } else if (
	          support.arrayBuffer
	        ) {
	          xhr.responseType = 'arraybuffer';
	        }
	      }

	      if (init && typeof init.headers === 'object' && !(init.headers instanceof Headers || (g.Headers && init.headers instanceof g.Headers))) {
	        var names = [];
	        Object.getOwnPropertyNames(init.headers).forEach(function(name) {
	          names.push(normalizeName(name));
	          xhr.setRequestHeader(name, normalizeValue(init.headers[name]));
	        });
	        request.headers.forEach(function(value, name) {
	          if (names.indexOf(name) === -1) {
	            xhr.setRequestHeader(name, value);
	          }
	        });
	      } else {
	        request.headers.forEach(function(value, name) {
	          xhr.setRequestHeader(name, value);
	        });
	      }

	      if (request.signal) {
	        request.signal.addEventListener('abort', abortXhr);

	        xhr.onreadystatechange = function() {
	          // DONE (success or failure)
	          if (xhr.readyState === 4) {
	            request.signal.removeEventListener('abort', abortXhr);
	          }
	        };
	      }

	      xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit);
	    })
	  }

	  fetch.polyfill = true;

	  if (!g.fetch) {
	    g.fetch = fetch;
	    g.Headers = Headers;
	    g.Request = Request;
	    g.Response = Response;
	  }

	  exports.Headers = Headers;
	  exports.Request = Request;
	  exports.Response = Response;
	  exports.fetch = fetch;

	  Object.defineProperty(exports, '__esModule', { value: true });

	  return exports;

	}))({});
	})(__globalThis__);
	// This is a ponyfill, so...
	__globalThis__.fetch.ponyfill = true;
	delete __globalThis__.fetch.polyfill;
	// Choose between native implementation (__global__) or custom implementation (__globalThis__)
	var ctx = __global__.fetch ? __global__ : __globalThis__;
	exports = ctx.fetch; // To enable: import fetch from 'cross-fetch'
	exports.default = ctx.fetch; // For TypeScript consumers without esModuleInterop.
	exports.fetch = ctx.fetch; // To enable: import {fetch} from 'cross-fetch'
	exports.Headers = ctx.Headers;
	exports.Request = ctx.Request;
	exports.Response = ctx.Response;
	module.exports = exports; 
} (browserPonyfill, browserPonyfill.exports));

var browserPonyfillExports = browserPonyfill.exports;
var fetch = /*@__PURE__*/getDefaultExportFromCjs(browserPonyfillExports);

/**
 * Upload encrypted blob to API endpoint.
 * @param {Blob} blob – encrypted data
 * @param {string} apiUrl – API endpoint URL
 * @returns {Promise<string>} blobKey for retrieval
 */
async function uploadBlob(blob, apiUrl) {
  // Mock mode for demo when API URL is placeholder
  if (apiUrl.includes('xxxxx')) {
    console.log('Mock mode: simulating blob upload');
    return 'mock-blob-key-' + Date.now();
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: blob
  });
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
  return response.text();
}

/**
 * Download and decrypt blob from API.
 * @param {string} blobKey
 * @param {string} apiUrl
 * @param {Uint8Array} keyBytes – decryption key
 * @returns {Promise<string>} decrypted plaintext
 */
async function downloadAndDecrypt(blobKey, apiUrl, keyBytes) {
  // Mock mode for demo when API URL is placeholder
  if (apiUrl.includes('xxxxx')) {
    console.log('Mock mode: simulating blob download and decrypt');
    return 'Mock decrypted content: This would be the decrypted audio data from the server.';
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blobKey })
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const { plaintext } = await response.json();
  return plaintext;
}

var browser = {exports: {}};

var debug$1 = {exports: {}};

/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

var ms = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

(function (module, exports) {
	/**
	 * This is the common logic for both the Node.js and web browser
	 * implementations of `debug()`.
	 *
	 * Expose `debug()` as the module.
	 */

	exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
	exports.coerce = coerce;
	exports.disable = disable;
	exports.enable = enable;
	exports.enabled = enabled;
	exports.humanize = ms;

	/**
	 * The currently active debug mode names, and names to skip.
	 */

	exports.names = [];
	exports.skips = [];

	/**
	 * Map of special "%n" handling functions, for the debug "format" argument.
	 *
	 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
	 */

	exports.formatters = {};

	/**
	 * Previous log timestamp.
	 */

	var prevTime;

	/**
	 * Select a color.
	 * @param {String} namespace
	 * @return {Number}
	 * @api private
	 */

	function selectColor(namespace) {
	  var hash = 0, i;

	  for (i in namespace) {
	    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
	    hash |= 0; // Convert to 32bit integer
	  }

	  return exports.colors[Math.abs(hash) % exports.colors.length];
	}

	/**
	 * Create a debugger with the given `namespace`.
	 *
	 * @param {String} namespace
	 * @return {Function}
	 * @api public
	 */

	function createDebug(namespace) {

	  function debug() {
	    // disabled?
	    if (!debug.enabled) return;

	    var self = debug;

	    // set `diff` timestamp
	    var curr = +new Date();
	    var ms = curr - (prevTime || curr);
	    self.diff = ms;
	    self.prev = prevTime;
	    self.curr = curr;
	    prevTime = curr;

	    // turn the `arguments` into a proper Array
	    var args = new Array(arguments.length);
	    for (var i = 0; i < args.length; i++) {
	      args[i] = arguments[i];
	    }

	    args[0] = exports.coerce(args[0]);

	    if ('string' !== typeof args[0]) {
	      // anything else let's inspect with %O
	      args.unshift('%O');
	    }

	    // apply any `formatters` transformations
	    var index = 0;
	    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
	      // if we encounter an escaped % then don't increase the array index
	      if (match === '%%') return match;
	      index++;
	      var formatter = exports.formatters[format];
	      if ('function' === typeof formatter) {
	        var val = args[index];
	        match = formatter.call(self, val);

	        // now we need to remove `args[index]` since it's inlined in the `format`
	        args.splice(index, 1);
	        index--;
	      }
	      return match;
	    });

	    // apply env-specific formatting (colors, etc.)
	    exports.formatArgs.call(self, args);

	    var logFn = debug.log || exports.log || console.log.bind(console);
	    logFn.apply(self, args);
	  }

	  debug.namespace = namespace;
	  debug.enabled = exports.enabled(namespace);
	  debug.useColors = exports.useColors();
	  debug.color = selectColor(namespace);

	  // env-specific initialization logic for debug instances
	  if ('function' === typeof exports.init) {
	    exports.init(debug);
	  }

	  return debug;
	}

	/**
	 * Enables a debug mode by namespaces. This can include modes
	 * separated by a colon and wildcards.
	 *
	 * @param {String} namespaces
	 * @api public
	 */

	function enable(namespaces) {
	  exports.save(namespaces);

	  exports.names = [];
	  exports.skips = [];

	  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
	  var len = split.length;

	  for (var i = 0; i < len; i++) {
	    if (!split[i]) continue; // ignore empty strings
	    namespaces = split[i].replace(/\*/g, '.*?');
	    if (namespaces[0] === '-') {
	      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
	    } else {
	      exports.names.push(new RegExp('^' + namespaces + '$'));
	    }
	  }
	}

	/**
	 * Disable debug output.
	 *
	 * @api public
	 */

	function disable() {
	  exports.enable('');
	}

	/**
	 * Returns true if the given mode name is enabled, false otherwise.
	 *
	 * @param {String} name
	 * @return {Boolean}
	 * @api public
	 */

	function enabled(name) {
	  var i, len;
	  for (i = 0, len = exports.skips.length; i < len; i++) {
	    if (exports.skips[i].test(name)) {
	      return false;
	    }
	  }
	  for (i = 0, len = exports.names.length; i < len; i++) {
	    if (exports.names[i].test(name)) {
	      return true;
	    }
	  }
	  return false;
	}

	/**
	 * Coerce `val`.
	 *
	 * @param {Mixed} val
	 * @return {Mixed}
	 * @api private
	 */

	function coerce(val) {
	  if (val instanceof Error) return val.stack || val.message;
	  return val;
	} 
} (debug$1, debug$1.exports));

var debugExports = debug$1.exports;

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

(function (module, exports) {
	exports = module.exports = debugExports;
	exports.log = log;
	exports.formatArgs = formatArgs;
	exports.save = save;
	exports.load = load;
	exports.useColors = useColors;
	exports.storage = 'undefined' != typeof chrome
	               && 'undefined' != typeof chrome.storage
	                  ? chrome.storage.local
	                  : localstorage();

	/**
	 * Colors.
	 */

	exports.colors = [
	  'lightseagreen',
	  'forestgreen',
	  'goldenrod',
	  'dodgerblue',
	  'darkorchid',
	  'crimson'
	];

	/**
	 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
	 * and the Firebug extension (any Firefox version) are known
	 * to support "%c" CSS customizations.
	 *
	 * TODO: add a `localStorage` variable to explicitly enable/disable colors
	 */

	function useColors() {
	  // NB: In an Electron preload script, document will be defined but not fully
	  // initialized. Since we know we're in Chrome, we'll just detect this case
	  // explicitly
	  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
	    return true;
	  }

	  // is webkit? http://stackoverflow.com/a/16459606/376773
	  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
	  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
	    // is firebug? http://stackoverflow.com/a/398120/376773
	    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
	    // is firefox >= v31?
	    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
	    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
	    // double check webkit in userAgent just in case we are in a worker
	    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
	}

	/**
	 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
	 */

	exports.formatters.j = function(v) {
	  try {
	    return JSON.stringify(v);
	  } catch (err) {
	    return '[UnexpectedJSONParseError]: ' + err.message;
	  }
	};


	/**
	 * Colorize log arguments if enabled.
	 *
	 * @api public
	 */

	function formatArgs(args) {
	  var useColors = this.useColors;

	  args[0] = (useColors ? '%c' : '')
	    + this.namespace
	    + (useColors ? ' %c' : ' ')
	    + args[0]
	    + (useColors ? '%c ' : ' ')
	    + '+' + exports.humanize(this.diff);

	  if (!useColors) return;

	  var c = 'color: ' + this.color;
	  args.splice(1, 0, c, 'color: inherit');

	  // the final "%c" is somewhat tricky, because there could be other
	  // arguments passed either before or after the %c, so we need to
	  // figure out the correct index to insert the CSS into
	  var index = 0;
	  var lastC = 0;
	  args[0].replace(/%[a-zA-Z%]/g, function(match) {
	    if ('%%' === match) return;
	    index++;
	    if ('%c' === match) {
	      // we only are interested in the *last* %c
	      // (the user may have provided their own)
	      lastC = index;
	    }
	  });

	  args.splice(lastC, 0, c);
	}

	/**
	 * Invokes `console.log()` when available.
	 * No-op when `console.log` is not a "function".
	 *
	 * @api public
	 */

	function log() {
	  // this hackery is required for IE8/9, where
	  // the `console.log` function doesn't have 'apply'
	  return 'object' === typeof console
	    && console.log
	    && Function.prototype.apply.call(console.log, console, arguments);
	}

	/**
	 * Save `namespaces`.
	 *
	 * @param {String} namespaces
	 * @api private
	 */

	function save(namespaces) {
	  try {
	    if (null == namespaces) {
	      exports.storage.removeItem('debug');
	    } else {
	      exports.storage.debug = namespaces;
	    }
	  } catch(e) {}
	}

	/**
	 * Load `namespaces`.
	 *
	 * @return {String} returns the previously persisted debug modes
	 * @api private
	 */

	function load() {
	  var r;
	  try {
	    r = exports.storage.debug;
	  } catch(e) {}

	  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
	  if (!r && typeof process !== 'undefined' && 'env' in process) {
	    r = process.env.DEBUG;
	  }

	  return r;
	}

	/**
	 * Enable namespaces listed in `localStorage.debug` initially.
	 */

	exports.enable(load());

	/**
	 * Localstorage attempts to return the localstorage.
	 *
	 * This is necessary because safari throws
	 * when a user disables cookies/localstorage
	 * and you attempt to access it.
	 *
	 * @return {LocalStorage}
	 * @api private
	 */

	function localstorage() {
	  try {
	    return window.localStorage;
	  } catch (e) {}
	} 
} (browser, browser.exports));

var browserExports = browser.exports;

function commonjsRequire(path) {
	throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}

const path = require$$0;

function load (recorderName) {
  try {
    const recoderPath = path.resolve(__dirname, recorderName);
    return commonjsRequire(recoderPath)
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error(`No such recorder found: ${recorderName}`)
    }

    throw err
  }
}

var recorders$1 = {
  load
};

const assert = require$$0$1;
const debug = browserExports('record');
const { spawn } = require$$2;
const recorders = recorders$1;

class Recording {
  constructor (options = {}) {
    const defaults = {
      sampleRate: 16000,
      channels: 1,
      compress: false,
      threshold: 0.5,
      thresholdStart: null,
      thresholdEnd: null,
      silence: '1.0',
      recorder: 'sox',
      endOnSilence: false,
      audioType: 'wav'
    };

    this.options = Object.assign(defaults, options);

    const recorder = recorders.load(this.options.recorder);
    const { cmd, args, spawnOptions = {} } = recorder(this.options);

    this.cmd = cmd;
    this.args = args;
    this.cmdOptions = Object.assign({ encoding: 'binary', stdio: 'pipe' }, spawnOptions);

    debug(`Started recording`);
    debug(this.options);
    debug(` ${this.cmd} ${this.args.join(' ')}`);

    return this.start()
  }

  start () {
    const { cmd, args, cmdOptions } = this;

    const cp = spawn(cmd, args, cmdOptions);
    const rec = cp.stdout;
    const err = cp.stderr;

    this.process = cp; // expose child process
    this._stream = rec; // expose output stream

    cp.on('close', code => {
      if (code === 0) return
      rec.emit('error', `${this.cmd} has exited with error code ${code}.

Enable debugging with the environment variable DEBUG=record.`
      );
    });

    err.on('data', chunk => {
      debug(`STDERR: ${chunk}`);
    });

    rec.on('data', chunk => {
      debug(`Recording ${chunk.length} bytes`);
    });

    rec.on('end', () => {
      debug('Recording ended');
    });

    return this
  }

  stop () {
    assert(this.process, 'Recording not yet started');

    this.process.kill();
  }

  pause () {
    assert(this.process, 'Recording not yet started');

    this.process.kill('SIGSTOP');
    this._stream.pause();
    debug('Paused recording');
  }

  resume () {
    assert(this.process, 'Recording not yet started');

    this.process.kill('SIGCONT');
    this._stream.resume();
    debug('Resumed recording');
  }

  isPaused () {
    assert(this.process, 'Recording not yet started');

    return this._stream.isPaused()
  }

  stream () {
    assert(this._stream, 'Recording not yet started');

    return this._stream
  }
}

var nodeRecordLpcm16 = {
  record: (...args) => new Recording(...args)
};

var record = /*@__PURE__*/getDefaultExportFromCjs(nodeRecordLpcm16);

var dist = {};

var bindings = {exports: {}};

/**
 * Module dependencies.
 */

var sep = require$$0.sep || '/';

/**
 * Module exports.
 */

var fileUriToPath_1 = fileUriToPath;

/**
 * File URI to Path function.
 *
 * @param {String} uri
 * @return {String} path
 * @api public
 */

function fileUriToPath (uri) {
  if ('string' != typeof uri ||
      uri.length <= 7 ||
      'file://' != uri.substring(0, 7)) {
    throw new TypeError('must pass in a file:// URI to convert to a file path');
  }

  var rest = decodeURI(uri.substring(7));
  var firstSlash = rest.indexOf('/');
  var host = rest.substring(0, firstSlash);
  var path = rest.substring(firstSlash + 1);

  // 2.  Scheme Definition
  // As a special case, <host> can be the string "localhost" or the empty
  // string; this is interpreted as "the machine from which the URL is
  // being interpreted".
  if ('localhost' == host) host = '';

  if (host) {
    host = sep + sep + host;
  }

  // 3.2  Drives, drive letters, mount points, file system root
  // Drive letters are mapped into the top of a file URI in various ways,
  // depending on the implementation; some applications substitute
  // vertical bar ("|") for the colon after the drive letter, yielding
  // "file:///c|/tmp/test.txt".  In some cases, the colon is left
  // unchanged, as in "file:///c:/tmp/test.txt".  In other cases, the
  // colon is simply omitted, as in "file:///c/tmp/test.txt".
  path = path.replace(/^(.+)\|/, '$1:');

  // for Windows, we need to invert the path separators from what a URI uses
  if (sep == '\\') {
    path = path.replace(/\//g, '\\');
  }

  if (/^.+\:/.test(path)) ; else {
    // unix path…
    path = sep + path;
  }

  return host + path;
}

/**
 * Module dependencies.
 */

(function (module, exports) {
	var fs = require$$0$2,
	  path = require$$0,
	  fileURLToPath = fileUriToPath_1,
	  join = path.join,
	  dirname = path.dirname,
	  exists =
	    (fs.accessSync &&
	      function(path) {
	        try {
	          fs.accessSync(path);
	        } catch (e) {
	          return false;
	        }
	        return true;
	      }) ||
	    fs.existsSync ||
	    path.existsSync,
	  defaults = {
	    arrow: process.env.NODE_BINDINGS_ARROW || ' → ',
	    compiled: process.env.NODE_BINDINGS_COMPILED_DIR || 'compiled',
	    platform: process.platform,
	    arch: process.arch,
	    nodePreGyp:
	      'node-v' +
	      process.versions.modules +
	      '-' +
	      process.platform +
	      '-' +
	      process.arch,
	    version: process.versions.node,
	    bindings: 'bindings.node',
	    try: [
	      // node-gyp's linked version in the "build" dir
	      ['module_root', 'build', 'bindings'],
	      // node-waf and gyp_addon (a.k.a node-gyp)
	      ['module_root', 'build', 'Debug', 'bindings'],
	      ['module_root', 'build', 'Release', 'bindings'],
	      // Debug files, for development (legacy behavior, remove for node v0.9)
	      ['module_root', 'out', 'Debug', 'bindings'],
	      ['module_root', 'Debug', 'bindings'],
	      // Release files, but manually compiled (legacy behavior, remove for node v0.9)
	      ['module_root', 'out', 'Release', 'bindings'],
	      ['module_root', 'Release', 'bindings'],
	      // Legacy from node-waf, node <= 0.4.x
	      ['module_root', 'build', 'default', 'bindings'],
	      // Production "Release" buildtype binary (meh...)
	      ['module_root', 'compiled', 'version', 'platform', 'arch', 'bindings'],
	      // node-qbs builds
	      ['module_root', 'addon-build', 'release', 'install-root', 'bindings'],
	      ['module_root', 'addon-build', 'debug', 'install-root', 'bindings'],
	      ['module_root', 'addon-build', 'default', 'install-root', 'bindings'],
	      // node-pre-gyp path ./lib/binding/{node_abi}-{platform}-{arch}
	      ['module_root', 'lib', 'binding', 'nodePreGyp', 'bindings']
	    ]
	  };

	/**
	 * The main `bindings()` function loads the compiled bindings for a given module.
	 * It uses V8's Error API to determine the parent filename that this function is
	 * being invoked from, which is then used to find the root directory.
	 */

	function bindings(opts) {
	  // Argument surgery
	  if (typeof opts == 'string') {
	    opts = { bindings: opts };
	  } else if (!opts) {
	    opts = {};
	  }

	  // maps `defaults` onto `opts` object
	  Object.keys(defaults).map(function(i) {
	    if (!(i in opts)) opts[i] = defaults[i];
	  });

	  // Get the module root
	  if (!opts.module_root) {
	    opts.module_root = exports.getRoot(exports.getFileName());
	  }

	  // Ensure the given bindings name ends with .node
	  if (path.extname(opts.bindings) != '.node') {
	    opts.bindings += '.node';
	  }

	  // https://github.com/webpack/webpack/issues/4175#issuecomment-342931035
	  var requireFunc =
	    typeof __webpack_require__ === 'function'
	      ? __non_webpack_require__
	      : commonjsRequire;

	  var tries = [],
	    i = 0,
	    l = opts.try.length,
	    n,
	    b,
	    err;

	  for (; i < l; i++) {
	    n = join.apply(
	      null,
	      opts.try[i].map(function(p) {
	        return opts[p] || p;
	      })
	    );
	    tries.push(n);
	    try {
	      b = opts.path ? requireFunc.resolve(n) : requireFunc(n);
	      if (!opts.path) {
	        b.path = n;
	      }
	      return b;
	    } catch (e) {
	      if (e.code !== 'MODULE_NOT_FOUND' &&
	          e.code !== 'QUALIFIED_PATH_RESOLUTION_FAILED' &&
	          !/not find/i.test(e.message)) {
	        throw e;
	      }
	    }
	  }

	  err = new Error(
	    'Could not locate the bindings file. Tried:\n' +
	      tries
	        .map(function(a) {
	          return opts.arrow + a;
	        })
	        .join('\n')
	  );
	  err.tries = tries;
	  throw err;
	}
	module.exports = exports = bindings;

	/**
	 * Gets the filename of the JavaScript file that invokes this function.
	 * Used to help find the root directory of a module.
	 * Optionally accepts an filename argument to skip when searching for the invoking filename
	 */

	exports.getFileName = function getFileName(calling_file) {
	  var origPST = Error.prepareStackTrace,
	    origSTL = Error.stackTraceLimit,
	    dummy = {},
	    fileName;

	  Error.stackTraceLimit = 10;

	  Error.prepareStackTrace = function(e, st) {
	    for (var i = 0, l = st.length; i < l; i++) {
	      fileName = st[i].getFileName();
	      if (fileName !== __filename) {
	        if (calling_file) {
	          if (fileName !== calling_file) {
	            return;
	          }
	        } else {
	          return;
	        }
	      }
	    }
	  };

	  // run the 'prepareStackTrace' function above
	  Error.captureStackTrace(dummy);
	  dummy.stack;

	  // cleanup
	  Error.prepareStackTrace = origPST;
	  Error.stackTraceLimit = origSTL;

	  // handle filename that starts with "file://"
	  var fileSchema = 'file://';
	  if (fileName.indexOf(fileSchema) === 0) {
	    fileName = fileURLToPath(fileName);
	  }

	  return fileName;
	};

	/**
	 * Gets the root directory of a module, given an arbitrary filename
	 * somewhere in the module tree. The "root directory" is the directory
	 * containing the `package.json` file.
	 *
	 *   In:  /home/nate/node-native-module/lib/index.js
	 *   Out: /home/nate/node-native-module
	 */

	exports.getRoot = function getRoot(file) {
	  var dir = dirname(file),
	    prev;
	  while (true) {
	    if (dir === '.') {
	      // Avoids an infinite loop in rare cases, like the REPL
	      dir = process.cwd();
	    }
	    if (
	      exists(join(dir, 'package.json')) ||
	      exists(join(dir, 'node_modules'))
	    ) {
	      // Found the 'package.json' file or 'node_modules' dir; we're done
	      return dir;
	    }
	    if (prev === dir) {
	      // Got to the top
	      throw new Error(
	        'Could not find module root given file: "' +
	          file +
	          '". Do you have a `package.json` file? '
	      );
	    }
	    // Try the parent dir next
	    prev = dir;
	    dir = join(dir, '..');
	  }
	}; 
} (bindings, bindings.exports));

var bindingsExports = bindings.exports;

(function (exports) {
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	exports.__esModule = true;
	var bindings_1 = __importDefault(bindingsExports);
	var vadBindings = bindings_1["default"]("vad.node");
	var VAD = (function () {
	    function VAD(sampleRate, level) {
	        if (sampleRate === void 0) { sampleRate = 16000; }
	        if (level === void 0) { level = 3; }
	        this.sampleRate = sampleRate;
	        this.instance = new vadBindings.VAD(sampleRate, level);
	    }
	    VAD.prototype.valid = function (audio) {
	        return (audio.length / 2 == this.sampleRate / 100 ||
	            audio.length / 2 == (2 * this.sampleRate) / 100 ||
	            audio.length / 2 == (3 * this.sampleRate) / 100);
	    };
	    VAD.prototype.process = function (audio) {
	        if (!this.valid(audio)) {
	            throw new Error("Invalid audio length. For a sample rate of " + this.sampleRate + ", audio length must be " + (2 *
	                this.sampleRate) /
	                100 + ", " + (4 * this.sampleRate) / 100 + ", or " + (6 * this.sampleRate) / 100 + ".");
	        }
	        return this.instance.process(audio, audio.length / 2);
	    };
	    return VAD;
	}());
	exports["default"] = VAD;
	
} (dist));

var WebRtcVad = /*@__PURE__*/getDefaultExportFromCjs(dist);

/*
 * Voice-Activity-Detection helper (Node.js).
 *
 * Streams microphone audio (16-kHz, 16-bit PCM) and yields only the frames
 * that contain speech according to WebRTC-VAD.  Returned async iterator
 * objects: { frame: ArrayBuffer, timestamp: number }
 */


const SAMPLE_RATE = 16_000;             // Hz – required by webrtcvad
const FRAME_DURATION_MS = 30;           // 10 / 20 / 30 ms supported by VAD
const FRAME_SIZE_BYTES = SAMPLE_RATE * 2 * (FRAME_DURATION_MS / 1000); // 16-bit PCM

/**
 * Continuously records from the system microphone and yields speech frames.
 *
 * Usage:
 *   for await (const { frame, timestamp } of recordAndDetectVoice()) {
 *     // transmit frame …
 *   }
 *
 * The consumer is responsible for terminating iteration, e.g. via
 * `break` or an `AbortController`.
 *
 * @yields {{ frame: ArrayBuffer, timestamp: number }} Speech frames only.
 */
async function* recordAndDetectVoice() {
  const vad = new WebRtcVad(2);          // aggressiveness: 0-3 (0 = permissive)

  const mic = record.start({
    sampleRateHertz: SAMPLE_RATE,
    threshold: 0,
    verbose: false,
    recordProgram: 'sox'                 // cross-platform dependency
  });

  let buffer = Buffer.alloc(0);

  for await (const chunk of mic) {
    buffer = Buffer.concat([buffer, chunk]);

    // Process fixed-size frames required by VAD
    while (buffer.length >= FRAME_SIZE_BYTES) {
      const frame = buffer.slice(0, FRAME_SIZE_BYTES);
      buffer = buffer.slice(FRAME_SIZE_BYTES);

      if (vad.processAudio(frame, SAMPLE_RATE)) {
        yield { frame: frame.buffer, timestamp: Date.now() };
      }
    }
  }
}

var vad = /*#__PURE__*/Object.freeze({
  __proto__: null,
  recordAndDetectVoice: recordAndDetectVoice
});

export { decryptBlob, downloadAndDecrypt, encryptBlob, recordAndDetectVoice$1 as recordAndDetectVoice, uploadBlob };
