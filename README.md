# lru pool

A keyed pool that recycles the least-recently-used objects. Requires Node.js v0.12.x or greater for [`Symbol`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) and [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) types.

[![Circle CI](https://circleci.com/gh/mapbox/node-lru-pool/tree/master.svg?style=svg)](https://circleci.com/gh/mapbox/node-lru-pool/tree/master) [![Coverage Status](https://coveralls.io/repos/mapbox/node-lru-pool/badge.svg?service=github)](https://coveralls.io/github/mapbox/node-lru-pool)

## Usage

```javascript
var LRU = require("lru-pool");
var options = {
  create: function() {
    return new Obj();
  },
  init: function(key, obj, callback) {
    obj.load(key);
    callback(null, obj);
  },
  destroy: function(key, obj) {
    obj.destroy();
  },
  max: 500,
  maxAge: 1000 * 60 * 60,
  allowStale: true
};
var pool = new LRU(options);

pool.acquire("key", function(err, key, obj) {
  pool.release(obj);
  // OR pool.destroy(obj);
});

// Non-string keys ARE fully supported
var pool = new LRU({
  create: function() { return {} },
  init: function(key, obj, callback) {
    obj.type = typeof key;
    callback(null, obj);
  }
});

var someObject = {};
pool.acquire(someObject, function(err, key, obj) {
  pool.release(obj);
  
  pool.acquire('[object Object]', function(err, key, obj) {
    assert.equal(obj.type, 'string');
    pool.release(obj);
    
    pool.acquire(someObject, function(err, key, obj) {
      assert.equal(obj.type, 'object');
    });
  });
});
```

If you put more stuff in it, then least recently used objects will be recycled.

## Options

* `create` **[Required]** Function to construct new objects for the pool.

* `init` **[Optional]** Function called with `key, obj, callback` on objects when they are created or recycled. This can be used to customize an object for the given key. `callback(err)` will pass an error to the `acquire` callback, while `callback(null, obj)` will pass the initialized object through.

* `destroy` **[Optional]** Function called on objects when they are dropped from the pool (with `pool.destroy(obj)` or because they are stale). This can be handy if you want to close file descriptors or do other cleanup tasks when objects are no longer accessible. Called with `key, obj` *after* removing the object from the internal cache.

* `max` **[Optional]** The maximum size of the pool. Not setting this is kind of silly, since that's the whole purpose of this lib, but it defaults to `Infinity`.

* `maxAge` **[Optional]** Maximum age in milliseconds. Objects are not pro-actively pruned out as they age, but if you try to `acquire` an object that is too old, the pool will instead return a newly initialized object.

* `allowStale` **[Optional]** If you try to acquire a stale object, the default behavior is to return a newly initialized object, leaving the stale object in the pool to be recycled. If you set `allowStale: true`, the pool will return the stale object and then recycle it when it is released back to the pool.

* `destroyStale` **[Optional]** The default behavior is to recycle stale objects on `acquire` (unless `allowStale: true` is set) and on `release`. If you set `destroyStale: true`, stale objects will be destroyed instead of being returned to the pool to be recycled.

## API

* `acquire(key, function(err, key, obj) {})`

    This will update the "recently used"-ness of the object, unless it is stale.

    If the key matches an available object, the object will be passed to the callback directly, without passing through the optional `init` function. If the key is not found (no matching objects or all matching objects are busy) and the current size of the pool is smaller than the `max` size, a new object will be created and passed through the `init` function, then passed on to the callback. If the key is not found and the pool is already at max capacity, the least recently used object will be passed through the `init` function then passed to the callback.
    
    The acquired object will be flagged as busy and unavailable until it has been released back to the pool.

    The key and object can be any value.

* `release(obj)`

    Releases the object back to the pool so that it will be available for future calls to `acquire`.

* `destroy(obj)`

    Destroys a damaged object instead of releasing it back to the pool.

* `length`

    Returns total quantity of objects currently in pool. Includes both available and busy objects. Note, that stale (see options) objects are returned as part of this count.
