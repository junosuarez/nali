const EventEmitter = require('events').EventEmitter
const fninfo = require('fninfo')
const Q = require('q')
const util = require('util')


const Nali = module.exports = function(name) {
  if (!(this instanceof Nali)) { return new Nali(name)}
  this.services = {}
  this.instances = {}
  EventEmitter.call(this)
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

Nali.prototype.locate = function locate(name) {
  if (typeof name === 'function') {
    return module.exports.resolveAll(name)
  }

  if (!(name in instances)) {
    throw new Error('No instance of ' + name)
  }
  return instances[name]
}

module.exports.fetch = Nali

// (name: String) => Promise
module.exports.resolve = function (name) {
  return Q.promise(function (resolve, reject) {

    tryGetInstance()

    function tryGetInstance() {
      if (name in instances) {
        return resolve(Nali(name))
      }
      events.once('newInstance:'+name, tryGetInstance)
      tryInstantiate(name)
    }

    function tryInstantiate(name) {
      if (name in services) {
        const service = services[name]
        if (service.instantiating) {
          // because we're all singletons now :)
          // keep from making a new instance
          return
        }
        service.instantiating = true
        return Q.all(service.params.map(Nali.resolve))
          .then(function (args) {
            return service.init.apply(null, args)
          })
          .then(function (instance) {
            service.instantiating = false
            Nali.registerInstance(name, instance)
          }, function (err) {
            service.instantiating = false
            reject(err)
          })
      }

      events.once('newService:' + name, tryGetInstance)

    }

  })

}

module.exports.resolveAll = function (fn) {
  return Q.all(fninfo(fn).params.map(Nali.resolve))
    .then(function (args) {
      return fn.apply(null, args)
    })
}

const events = new EventEmitter
events.setMaxListeners(1000)

module.exports.on = events.on.bind(events)

Nali.prototype.registerService = function (name, service) {

  if (!service) {
    throw new TypeError('service required')
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
  this.instances[name] = instance
  this.emit('newInstance', name)
  this.emit('newInstance:' + name)
}

module.exports.testReset = function () {
  for (var i in services) {
    delete services[i]
  }
  for (var i in instances) {
    delete instances[i]
  }
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