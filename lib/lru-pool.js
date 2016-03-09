'use strict'

module.exports = LRUPool

// A linked list to keep track of recently-used-ness
var Yallist = require('yallist')

// Walk the list and return Node if fn test returns truthy
Yallist.prototype.find = function (fn, thisp) {
  thisp = thisp || this
  for (var walker = this.head; walker !== null;) {
    var next = walker.next
    var hit = walker.value

    if (fn.call(thisp, hit, this)) {
      return walker
    }

    walker = next
  }
}

var symbols = {}
var makeSymbol = function (key) {
  return Symbol.for(key)
}

function priv (obj, key, val) {
  var sym
  if (symbols[key]) {
    sym = symbols[key]
  } else {
    sym = makeSymbol(key)
    symbols[key] = sym
  }
  if (arguments.length === 2) {
    return obj[sym]
  } else {
    obj[sym] = val
    return val
  }
}

// available is a Yallist where the head is the youngest
// object, and the tail is the oldest. The list contains the Hit
// objects as the entries.
//
// Nodes are transferred from the available list to the busy
// list when they are acquired, and returned to the available
// list when they are released.
//
// cache is a Map that matches the keys to
// the Yallist.Node object.
function LRUPool (options) {
  if (!(this instanceof LRUPool)) {
    return new LRUPool(options)
  }

  if (!options ||
    !(options instanceof Object) ||
    !options.hasOwnProperty('create') ||
    !(options.create instanceof Function)) {
    throw new Error("Must provide a 'create' function")
  }

  // Create a new object for the pool
  priv(this, 'create', options.create)

  // Customize an acquired object for the given key
  priv(this, 'init', options.init)

  if (options.hasOwnProperty('init') &&
    !(options.init instanceof Function)) {
    throw new Error("'init' must be a function")
  }

  // Permanently destroy an object's resources
  priv(this, 'destroy', options.destroy)

  if (options.hasOwnProperty('destroy') &&
    !(options.destroy instanceof Function)) {
    throw new Error("'destroy' must be a function")
  }

  var max = priv(this, 'max', options.max)

  // Kind of weird to have a default max of Infinity, but oh well
  if (!max ||
    !(typeof max === 'number') ||
    max <= 0) {
    priv(this, 'max', Infinity)
  }

  priv(this, 'maxAge', options.maxAge || 0)
  priv(this, 'allowStale', options.allowStale || false)
  priv(this, 'destroyStale', options.destroyStale || false)

  // Hash of most recently used objects by key
  priv(this, 'cache', new Map())

  // List of available objects in order of use recency
  priv(this, 'available', new Yallist())

  // List of busy objects in order of use recency
  priv(this, 'busy', new Yallist())
}

// Resize the cache when the max changes.
Object.defineProperty(LRUPool.prototype, 'max', {
  set: function (mL) {
    if (!mL || !(typeof mL === 'number') || mL <= 0) {
      mL = Infinity
    }
    priv(this, 'max', mL)
    trim(this)
  },
  get: function () {
    return priv(this, 'max')
  },
  enumerable: true
})

Object.defineProperty(LRUPool.prototype, 'maxAge', {
  set: function (mA) {
    if (!mA || !(typeof mA === 'number') || mA < 0) {
      mA = 0
    }
    priv(this, 'maxAge', mA)
    trim(this)
  },
  get: function () {
    return priv(this, 'maxAge')
  },
  enumerable: true
})

Object.defineProperty(LRUPool.prototype, 'allowStale', {
  set: function (allowStale) {
    priv(this, 'allowStale', !!allowStale)
  },
  get: function () {
    return priv(this, 'allowStale')
  },
  enumerable: true
})

Object.defineProperty(LRUPool.prototype, 'destroyStale', {
  set: function (destroyStale) {
    priv(this, 'destroyStale', !!destroyStale)
  },
  get: function () {
    return priv(this, 'destroyStale')
  },
  enumerable: true
})

Object.defineProperty(LRUPool.prototype, 'length', {
  get: function () { return priv(this, 'available').length + priv(this, 'busy').length },
  enumerable: true
})

// Acquiring a Hit object from the pool detaches it from the available
// list, unshifts it onto the busy list and updates the cache pointer.
LRUPool.prototype.acquire = function (key, callback) {
  if (!(callback instanceof Function)) {
    throw new Error('Callback must be a function')
  }

  acquire(this, key, callback)
}

function acquire (self, key, callback) {
  if (priv(self, 'cache').has(key)) {
    var node = priv(self, 'cache').get(key)
    var hit = node.value

    // Remove cache entry
    priv(self, 'cache').delete(key)

    if (isStale(self, hit) && !priv(self, 'allowStale')) {
      priv(self, 'available').removeNode(node)

      if (priv(self, 'destroy') && priv(self, 'destroyStale')) {
        priv(self, 'destroy').call(self, key, hit.value)
      }

      hit = undefined
    } else {
      // Move node from availble to busy list
      priv(self, 'busy').unshiftNode(node)
    }

    // Update cache with next most recently used match for key
    update(self, key)

    if (hit) {
      callback(null, key, hit.value)
    } else {
      // Recursively check the cache for an unexpired match
      acquire(self, key, callback)
    }
  } else {
    recycle(self, key, callback)
  }
}

// Releasing a Hit object back to the pool removes it from the busy list,
// reattaches it to the available list, and updates the cache pointer.
LRUPool.prototype.release = function (hit) {
  var node = priv(this, 'busy').find(function (el, index) {
    return el.value === hit
  })

  if (node) {
    if (isStale(this, node.value)) {
      if (priv(this, 'destroyStale')) {
        // Remove from busy list and destroy
        priv(this, 'busy').removeNode(node)

        if (priv(this, 'destroy')) {
          priv(this, 'destroy').call(this, node.value.key, node.value.value)
        }
      } else {
        // Return this node to the available list to be recycled.
        // Do not update the cache pointer so the next attempt to acquire
        // this key will not find a cached entry, and will instead recycle
        // the least recently used node.
        priv(this, 'available').unshiftNode(node)
      }
    } else {
      priv(this, 'available').unshiftNode(node)
      priv(this, 'cache').set(node.value.key, priv(this, 'available').head)
    }
  }
}

// Object is damaged, destroy it instead of returning to pool.
LRUPool.prototype.destroy = function (hit) {
  var busy = priv(this, 'busy')
  var node = busy.find(function (el, index) {
    return el.value === hit
  })

  if (node) {
    busy.removeNode(node)

    if (priv(this, 'destroy')) {
      priv(this, 'destroy').call(this, node.value.key, node.value.value)
    }
  }
}

function isStale (self, hit) {
  if (!hit || (!hit.maxAge && !priv(self, 'maxAge'))) {
    return false
  }
  var stale = false
  var diff = Date.now() - hit.now
  if (hit.maxAge) {
    stale = diff > hit.maxAge
  } else {
    stale = priv(self, 'maxAge') && (diff > priv(self, 'maxAge'))
  }
  return stale
}

function trim (self) {
  var length = priv(self, 'available').length + priv(self, 'busy').length
  if (length > priv(self, 'max')) {
    for (var walker = priv(self, 'available').tail; length > priv(self, 'max') && walker !== null;) {
      // We know that we're about to delete this one, and also
      // what the next least recently used key will be, so just
      // go ahead and set it now.
      var prev = walker.prev

      var hit = walker.value
      priv(self, 'cache').delete(hit.key)
      priv(self, 'available').removeNode(walker)

      if (priv(self, 'destroy')) {
        priv(self, 'destroy').call(this, hit.key, hit.value)
      }

      update(self, hit.key)

      walker = prev
    }
  }
}

function recycle (self, key, callback) {
  var hit
  var maxAge = priv(self, 'maxAge')
  var now = maxAge ? Date.now() : 0

  var node = priv(self, 'available').tail
  var length = priv(self, 'available').length + priv(self, 'busy').length
  if (!node || length < priv(self, 'max')) {
    hit = create(self, key, now, function (err, hit) {
      if (err) return callback(err)

      priv(self, 'busy').unshift(hit)

      afterHit(self, hit, callback)
    })
  } else {
    hit = node.value

    hit.now = now
    hit.maxAge = maxAge

    // Remove cache entry, then move Node from availble to busy list
    priv(self, 'cache').delete(hit.key)
    priv(self, 'busy').unshiftNode(node)

    // Update Hit key
    hit.key = key

    // Update cache with next most recently used match for key
    update(self, key)

    afterHit(self, hit, callback)
  }

  function afterHit (self, hit, callback) {
    // Initialize a previously created object to prepare it for use
    if (priv(self, 'init')) {
      priv(self, 'init').call(self, hit.key, hit.value, function (err, obj) {
        if (err) return callback(err)

        // To support pass-by-value mutations
        hit.value = obj

        callback(null, hit.key, hit.value)
      })
    } else {
      callback(null, hit.key, hit.value)
    }
  }
}

// Update cache pointer
function update (self, key) {
  var node = priv(self, 'available').find(function (el, index) {
    return (el.key === key && !isStale(self, el))
  })
  if (node) priv(self, 'cache').set(key, node)
}

function create (self, key, now, callback) {
  var hit = new Entry(self, key, now)

  priv(self, 'create').call(self, function (err, obj) {
    if (err) return callback(err)

    hit.value = obj

    callback(null, hit)
  })
}

// Classy, since V8 prefers predictable objects
function Entry (self, key, now) {
  this.key = key
  this.now = now
  this.maxAge = priv(self, 'maxAge')

  // Initialize this here so hidden classes don't diverge?
  this.value = {}
}
