'use strict'

var test = require('tap').test
var LRU = require('../')

test('constructor', function (t) {
  var err = /Must provide a 'create' function/

  t.throws(function () { LRU() }, err)
  t.throws(function () { LRU('') }, err)
  t.throws(function () { LRU({}) }, err)
  t.throws(function () { LRU({ create: '' }) }, err)
  t.doesNotThrow(function () { LRU({ create: function () {} }) }, err)

  t.throws(function () {
    LRU({
      create: function () {},
      init: null
    })
  }, /'init' must be a function/)

  t.throws(function () {
    LRU({
      create: function () {},
      destroy: undefined
    })
  }, /'destroy' must be a function/)

  t.end()
})

test('auto new', function (t) {
  LRU({ create: function () {} })
  t.end()
})

test('acquire error', function (t) {
  var pool = new LRU({
    create: function () {}
  })

  t.throws(function () {
    pool.acquire('key', 'obj')
  }, /Callback must be a function/)

  t.end()
})

test('acquireOnce error', function (t) {
  var pool = new LRU({
    create: function () {}
  })

  t.throws(function () {
    pool.acquireOnce('key', 'obj')
  }, /Callback must be a function/)

  t.end()
})

test('create', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, 'obj') },
    max: 10
  })

  pool.acquire('key', function (err, key, obj) {
    t.error(err)
    t.equal(obj, 'obj')
    t.equal(pool.length, 1)
    t.equal(pool.max, 10)
    t.end()
  })
})

test('create error', function (t) {
  var error = new Error('create failed')

  var pool = new LRU({
    create: function (cb) { cb(error) }
  })

  pool.acquire('key', function (err, key, obj) {
    t.equal(err, error)
    t.equal(key, undefined)
    t.equal(obj, undefined)
    t.equal(pool.length, 0)
    t.end()
  })
})

test('create with non-string key', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.type = typeof key
      cb(null, obj)
    }
  })

  var someObject = {}
  pool.acquire(someObject, function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    pool.acquire('[object Object]', function (err, key, obj) {
      t.error(err)
      t.equal(obj.type, 'string')
      pool.release(obj)

      pool.acquire(someObject, function (err, key, obj) {
        t.error(err)
        t.equal(obj.type, 'object')
        t.end()
      })
    })
  })
})

test('init error', function (t) {
  var error = new Error('init failed')

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) { cb(error) }
  })

  pool.acquire('key', function (err, key, obj) {
    t.equal(err, error)
    t.equal(key, undefined)
    t.equal(obj, undefined)
    t.equal(pool.length, 1)
    t.end()
  })
})

test('init pass by value - string', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, '') },
    init: function (key, obj, cb) {
      cb(null, key.toUpperCase())
    },
    max: 2
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    t.equal(obj, 'A')
    t.end()
  })
})

test('init pass by value - number', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, 0) },
    init: function (key, obj, cb) {
      cb(null, 1)
    },
    max: 2
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    t.equal(obj, 1)
    t.end()
  })
})

test('least recently used', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      if (i++ < 2) {
        obj.name = key.toUpperCase()
      }
      cb(null, obj)
    },
    max: 2
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    pool.acquire('b', function (err, key, obj) {
      t.error(err)
      pool.release(obj)

      pool.acquire('c', function (err, key, obj) {
        t.error(err)
        t.equal(obj.name, 'A')
        t.equal(pool.length, 2)
        t.end()
      })
    })
  })
})

test('most recently released', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    max: 2
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    pool.acquire('b', function (err, key, obj) {
      t.error(err)
      pool.release(obj)

      pool.acquire('a', function (err, key, obj) {
        t.error(err)
        t.equal(obj.val, 1)
        t.equal(pool.length, 2)
        t.end()
      })
    })
  })
})

test('reinitialize recycled object', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    max: 2
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    pool.acquire('b', function (err, key, obj) {
      t.error(err)
      pool.release(obj)

      pool.acquire('c', function (err, key, obj) {
        t.error(err)
        t.equal(obj.val, 3)
        t.equal(pool.length, 2)
        t.end()
      })
    })
  })
})

test('acquireOnce', function (t) {
  var i = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    }
  })

  pool.acquireOnce('a', function (err, key, obj) {
    t.error(err)

    t.equal(obj.val, 1)
    pool.release(obj)

    pool.acquire('a', function (err, key, obj) {
      t.error(err)

      t.equal(obj.val, 2)
      t.equal(pool.length, 2)

      t.end()
    })
  })
})

test('destroy', function (t) {
  var i = 0
  var destroyed = []

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function (key, obj) {
      destroyed.push([key, obj])
    },
    max: 1
  })

  pool.acquire('a', function (err, key, a) {
    t.error(err)
    pool.destroy(a)

    pool.acquire('a', function (err, key, b) {
      t.error(err)
      t.equal(b.val, 2)
      t.equal(destroyed.length, 1)
      t.deepEqual(destroyed, [['a', a]])
      t.equal(pool.length, 1)
      t.end()
    })
  })
})

test('destroy (without destroy)', function (t) {
  var i = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    max: 1
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.destroy(obj)

    pool.acquire('a', function (err, key, obj) {
      t.error(err)
      t.equal(obj.val, 2)
      t.equal(pool.length, 1)
      t.end()
    })
  })
})

test('max resize smaller', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    max: 3
  })

  // Test changing the max, verify that the LRU objects get dropped.
  pool.max = 1
  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    pool.acquire('b', function (err, key, obj) {
      t.error(err)
      t.equal(pool.length, 1)
      t.end()
    })
  })
})

test('max resize larger', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    max: 1
  })

  // Remove the max (defaults to Infinity), verify that LRU objects are not
  // dropped.
  pool.max = 'hello'
  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    pool.acquire('b', function (err, key, obj) {
      t.error(err)
      t.equal(pool.length, 2)
      t.end()
    })
  })
})

test('trim', function (t) {
  var destroyed = []

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    destroy: function (key, obj) {
      destroyed.push([key, obj])
    },
    max: 3
  })

  // Test changing the max, verify that LRU objects are not dropped.
  pool.acquire('a', function (err, key, a) {
    t.error(err)
    pool.release(a)

    pool.acquire('b', function (err, key, b) {
      t.error(err)
      pool.release(b)

      pool.acquire('c', function (err, key, c) {
        t.error(err)
        pool.max = 1
        t.equal(pool.length, 1)
        t.equal(destroyed.length, 2)
        t.deepEqual(destroyed, [['a', a], ['b', b]])
        t.end()
      })
    })
  })
})

test('trim (without destroy)', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    max: 3
  })

  // Test changing the max, verify that LRU objects are not dropped.
  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    pool.acquire('b', function (err, key, obj) {
      t.error(err)
      pool.release(obj)

      pool.acquire('c', function (err, key, obj) {
        t.error(err)
        pool.max = 1
        t.equal(pool.length, 1)
        t.end()
      })
    })
  })
})

test('maxAge', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    maxAge: 10
  })

  t.equal(pool.maxAge, 10)

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    setTimeout(function () {
      pool.acquire('a', function (err, key, obj) {
        t.error(err)

        // Original object timed out
        t.equal(obj.val, 2)
        t.end()
      })
    }, 20)
  })
})

test('maxAge set lower', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    }
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.maxAge = 10
    pool.release(obj)

    setTimeout(function () {
      pool.acquire('a', function (err, key, obj) {
        t.error(err)

        // Original object timed out
        t.equal(obj.val, 2)
        t.end()
      })
    }, 20)
  })
})

test('maxAge set higher', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    maxAge: 10
  })

  // Defaults to no maxAge
  pool.maxAge = 'hello'

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    setTimeout(function () {
      pool.acquire('a', function (err, key, obj) {
        t.error(err)

        // Original object does not time out
        t.equal(obj.val, 1)
        t.end()
      })
    }, 20)
  })
})

test('stale objects are recycled on acquire', function (t) {
  var i = 0
  var destroyed = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function () { ++destroyed },
    max: 1,
    maxAge: 10
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    setTimeout(function () {
      pool.acquire('a', function (err, key, obj) {
        t.error(err)
        t.equal(obj.val, 2)
        t.equal(destroyed, 0)
        t.end()
      })
    }, 20)
  })
})

test('stale objects are destroyed on acquire', function (t) {
  var i = 0
  var destroyed = []

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function (key, obj) {
      destroyed.push([key, obj])
    },
    maxAge: 10
  })

  pool.acquire('a', function (err, key, a) {
    t.error(err)
    pool.release(a)
    pool.destroyStale = true

    setTimeout(function () {
      pool.acquire('a', function (err, key, b) {
        t.error(err)
        t.equal(b.val, 2)
        t.equal(destroyed.length, 1)
        t.deepEqual(destroyed, [['a', a]])
        t.end()
      })
    }, 20)
  })
})

test('newly stale objects are recycled on release', function (t) {
  var i = 0
  var destroyed = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function () { ++destroyed },
    max: 1,
    maxAge: 10
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)

    setTimeout(function () {
      pool.release(obj)
      pool.acquire('a', function (err, key, obj) {
        t.error(err)
        t.equal(obj.val, 2)
        t.equal(destroyed, 0)
        t.end()
      })
    }, 20)
  })
})

test('newly stale objects are destroyed on release', function (t) {
  var i = 0
  var destroyed = []

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function (key, obj) {
      destroyed.push([key, obj])
    },
    maxAge: 10,
    destroyStale: true
  })

  t.equal(pool.destroyStale, true)

  pool.acquire('a', function (err, key, a) {
    t.error(err)

    setTimeout(function () {
      pool.release(a)
      pool.acquire('a', function (err, key, b) {
        t.error(err)
        t.equal(b.val, 2)
        t.equal(destroyed.length, 1)
        t.deepEqual(destroyed, [['a', a]])
        t.end()
      })
    }, 20)
  })
})

test('acquired stale objects recycled on release', function (t) {
  var i = 0
  var destroyed = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function () { ++destroyed },
    max: 1,
    maxAge: 10,
    allowStale: true
  })

  t.equal(pool.allowStale, true)

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    setTimeout(function () {
      pool.acquire('a', function (err, key, obj) {
        t.error(err)

        // Stale object returned
        t.equal(obj.val, 1)
        pool.release(obj)

        pool.acquire('a', function (err, key, obj) {
          t.error(err)

          // Stale object has been recycled
          t.equal(obj.val, 2)
          t.equal(destroyed, 0)
          t.end()
        })
      })
    }, 20)
  })
})

test('acquired stale objects destroyed on release', function (t) {
  var i = 0
  var destroyed = []

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function (key, obj) {
      destroyed.push([key, obj])
    },
    maxAge: 10,
    allowStale: true,
    destroyStale: true
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    setTimeout(function () {
      pool.acquire('a', function (err, key, a) {
        t.error(err)

        // Stale object returned
        t.equal(obj.val, 1)
        pool.release(a)

        pool.acquire('a', function (err, key, b) {
          t.error(err)

          // Stale object has been destroyed, new object created
          t.equal(b.val, 2)
          t.equal(destroyed.length, 1)
          t.deepEqual(destroyed, [['a', a]])
          t.end()
        })
      })
    }, 20)
  })
})

test('acquired stale objects destroyed on release (without destroy)', function (t) {
  var i = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    maxAge: 10,
    allowStale: true,
    destroyStale: true
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)

    setTimeout(function () {
      pool.acquire('a', function (err, key, obj) {
        t.error(err)

        // Stale object returned
        t.equal(obj.val, 1)
        pool.release(obj)

        pool.acquire('a', function (err, key, obj) {
          t.error(err)

          // Stale object has been removed, new object created
          t.equal(obj.val, 2)
          t.end()
        })
      })
    }, 20)
  })
})

test('set allowStale', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    maxAge: 10
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)
    pool.release(obj)
    pool.allowStale = true

    setTimeout(function () {
      pool.acquire('a', function (err, key, obj) {
        t.error(err)

        // Stale object returned
        t.equal(obj.val, 1)
        pool.release(obj)

        pool.acquire('a', function (err, key, obj) {
          t.error(err)

          // Stale object has been removed, new object created
          t.equal(obj.val, 2)
          t.end()
        })
      })
    }, 20)
  })
})

test('update cache pointer', function (t) {
  var i = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    max: 2,
    allowStale: true
  })

  pool.acquire('a', function (err, key, first) {
    t.error(err)

    pool.acquire('a', function (err, key, second) {
      t.error(err)

      // New object returned
      t.equal(second.val, 2)

      pool.release(first)
      pool.release(second)

      pool.acquire('a', function (err, key, obj) {
        t.error(err)

        // Most recently used object returned
        t.equal(obj.val, 2)

        pool.acquire('a', function (err, key, obj) {
          t.error(err)

          // Cache pointer updated
          // Second most recently used object returned
          t.equal(obj.val, 1)

          t.end()
        })
      })
    })
  })
})

test('cache pointer not updated to stale items', function (t) {
  var i = 0

  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    max: 2,
    maxAge: 10,
    allowStale: true
  })

  pool.acquire('a', function (err, key, first) {
    t.error(err)

    pool.acquire('a', function (err, key, second) {
      t.error(err)

      // New object returned
      t.equal(second.val, 2)

      pool.release(first)
      pool.release(second)

      setTimeout(function () {
        pool.acquire('a', function (err, key, obj) {
          t.error(err)

          // Most recent stale object returned
          t.equal(obj.val, 2)

          pool.acquire('a', function (err, key, obj) {
            t.error(err)

            // Cache pointer to second stale object removed,
            // Stale object has been recycled
            t.equal(obj.val, 3)

            t.end()
          })
        })
      }, 20)
    })
  })
})

test('releasing objects not in pool has no effect', function (t) {
  var pool = new LRU({
    create: function (cb) { cb(null, {}) }
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)

    var b = { val: 'B' }

    t.doesNotThrow(function () {
      pool.release(b)
    })

    pool.release(obj)

    t.equal(b.val, 'B')
    t.equal(pool.length, 1)
    t.end()
  })
})

test('destroying objects not in pool has no effect', function (t) {
  var i = 0
  var pool = new LRU({
    create: function (cb) { cb(null, {}) },
    init: function (key, obj, cb) {
      obj.val = ++i
      cb(null, obj)
    },
    destroy: function (key, obj) { obj.val = 'Z' }
  })

  pool.acquire('a', function (err, key, obj) {
    t.error(err)

    var b = { val: 'B' }

    t.doesNotThrow(function () {
      pool.destroy(b)
    })

    pool.destroy(obj)

    pool.acquire('a', function (err, key, obj) {
      t.error(err)
      t.equal(obj.val, 2)
      t.equal(b.val, 'B')
      t.equal(pool.length, 1)
      t.end()
    })
  })
})
