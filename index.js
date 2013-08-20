const EventEmitter = require('events').EventEmitter
const fninfo = require('fninfo')
const Q = require('q')
const util = require('util')
const offer = require('offer')

const Nali = module.exports = function(name, parentContainer) {
  if (!(this instanceof Nali)) { return new Nali(name, parentContainer)}
  this.name = name
  this.parentContainer = parentContainer
  this.childContainer = []
  this.services = {}
  this.instances = {}
  EventEmitter.call(this)
  this.setMaxListeners(1000)
}
util.inherits(Nali, EventEmitter)

Nali.prototype.dispose = function () {
  const self = this
  Object.keys(this.instances).forEach(function (name) {
    const instance = self.instances[name]
    // recursively dispose
    // todo: replace with interface check
    if (typeof instance.dispose === 'function') {
      instance.dispose.call(instance)
    }
  })

  // todo: dispose child containers
  this.instances = null
  this.services = null
  this.removeAllListeners()
}

Nali.prototype.freeze = function () {
  this.frozen = true
}

// (name: String) => Promise
Nali.prototype.resolve = function (name) {
  if (typeof name === 'function') {
    return this.resolveAll(name)
  }
  const self = this
  return Q.promise(function (resolve, reject) {
    const pending = []

    function ok(instance) {
      while(pending.length) {
        // cancel listeners
        pending.pop()()
      }
      resolve(instance)
    }

    tryGetInstance()

    // local instance
    // make instance from local service
    // check parent
    // if parent pending and local service is registered,
    //  cancel from parent and wait for local service

    if (self.parentContainer) {
      self.parentContainer.resolve(name)
        .then(function (instance) {
          if (!(name in self.services)) {
            ok(instance)
          }
        })
    }

    function tryGetInstance() {
      try {
        if (name in self.instances) {
          const instance = self.instances[name]
          return ok(instance)
        }
        pending.push(offer.once(self, 'newInstance:'+name, tryGetInstance))
        tryInstantiate(name)
      } catch (e) {
        reject(e)
      }
    }

    function tryInstantiate(name) {
      if (name in self.services) {
        const service = self.services[name]
        if (service.instantiating) {
          // because we're all singletons now :)
          // keep from making a new instance
          return
        }
        service.instantiating = true
        return Q.all(service.params.map(self.resolve.bind(self)))
          .then(function (args) {
            return service.init.apply(null, args)
          })
          .then(function (instance) {
            service.instantiating = false
            self._instantiated(name, instance)
          }, function (err) {
            service.instantiating = false
            reject(err)
          })
      }

      pending.push(offer.once(self, 'newService:' + name, tryGetInstance))

    }

  })

}
// alias #fetch = #resolve
Nali.prototype.fetch = Nali.prototype.resolve

Nali.prototype.resolveAll = function (fn) {
  return Q.all(fninfo(fn).params.map(this.resolve.bind(this)))
    .then(function (args) {
      return fn.apply(null, args)
    })
}

Nali.prototype.registerService = function (name, service) {
  if (!service) {
    throw new TypeError('service required')
  }
  if (this.frozen) {
    throw new Error('Container is frozen, cannot register new instance')
  }


  const initable = typeof service === 'function'
  if (!initable) {
    throw new TypeError('Service ' + name + ' must be an init function')
  }

  if (name in this.services) {
    console.log('overwriting service ' + name + ' at', (new Error).stack)
  }

  this.services[name] = {
    init: service,
    params: fninfo(service).params
  }

  this.emit('newService', name)
  this.emit('newService:' + name)

}

Nali.prototype.registerInstance = function (name, instance) {
  if (!instance) {
    throw new Error('Instance required')
  }
  if (this.frozen) {
    throw new Error('Container is frozen, cannot register new instance')
  }
  this.instances[name] = instance
  this.emit('newInstance', name)
  this.emit('newInstance:' + name)
}

Nali.prototype._instantiated = function (name, instance) {
  // used internally when instantiating a registeredService
  this.instances[name] = instance
  this.emit('newInstance', name)
  this.emit('newInstance:' + name)
}

Nali.prototype.spawnChild = function (name) {
  return new Nali(name, this)
}

// unsupported
// () => Dictionary<serviceName: String, dependencies: Array<String>>
module.exports.graph = function () {
  return Object.keys(services).reduce(function (g, name) {
    const service = services[name]
    g[name] = service.params.slice()
    return g
  },{})
}