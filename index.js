const EventEmitter = require('events').EventEmitter
const fninfo = require('fninfo')
const Q = require('q')

const services = {}
const instances = {}

const registry = module.exports = function locate(name) {
  if (typeof name === 'function') {
    return module.exports.resolveAll(name)
  }

  if (!(name in instances)) {
    throw new Error('No instance of ' + name)
  }
  return instances[name]
}

module.exports.fetch = registry

// (name: String) => Promise
module.exports.resolve = function (name) {
  return Q.promise(function (resolve, reject) {

    tryGetInstance()

    function tryGetInstance() {
      if (name in instances) {
        return resolve(registry(name))
      }
      events.once('newInstance:'+name, tryGetInstance)
      tryInstantiate(name)
    }

    function tryInstantiate(name) {
      if (name in services) {
        const service = services[name]

        return Q.all(service.params.map(registry.resolve))
          .then(function (args) {
            return service.init.apply(null, args)
          })
          .then(function (instance) {
            registry.registerInstance(name, instance)
          }, reject)
      }

      events.once('newService:' + name, tryGetInstance)

    }

  })

}

module.exports.resolveAll = function (fn) {
  return Q.all(fninfo(fn).map(registry.resolve))
    .then(function (args) {
      return fn.apply(null, args)
    })
}

const events = new EventEmitter

module.exports.on = events.on.bind(events)

module.exports.registerService = function (name, service) {

  if (!service) {
    throw new TypeError('service required')
  }

  const initable = typeof service === 'function'
  if (!initable) {
    throw new TypeError('service must be an init function')
  }

  if (name in services) {
    console.log('overwriting service ' + name + ' at', (new Error).stack)
  }

  services[name] = {
    init: service,
    params: fninfo(service)
  }

  events.emit('newService', name)
  events.emit('newService:' + name)

}

module.exports.registerInstance = function (name, instance) {
  instances[name] = instance
  events.emit('newInstance', name)
  events.emit('newInstance:' + name)
}

module.exports.testReset = function () {
  for (var i in services) {
    delete services[i]
  }
  for (var i in instances) {
    delete instances[i]
  }
}