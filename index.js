const EventEmitter = require('events').EventEmitter
const fninfo = require('fninfo')
const Q = require('q')
const util = require('util')
const offer = require('offer')
const Cu = require('cu')

const Nali = module.exports = function(name, parentContainer, opts) {
  if (!(this instanceof Nali)) { return new Nali(name, parentContainer, opts)}
  this.name = name
  this.opts = opts || (parentContainer && parentContainer.opts) || {}
  this.blocks = []
  this._state = {}
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
  clear(this.instances)
  clear(this.services)
  this.removeAllListeners()
  this.disposed = true
}

function clear(obj) {
  for (var i in obj) {
    delete obj[i]
  }
  return obj
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

    // special case dependencies
    switch (name) {
      case '_container':
        resolve(self)
        break;
    }


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

        if (self.opts.debug) {
          console.log(self.name + '/' + name + ': ' + service.params.join(', '))
        }
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

  var params = fninfo(fn).params
  if (this.opts.debug) {
    console.log(this.name + '/leaf: ' + params.join(', '))
  }
  
  return Q.all(params.map(this.resolve.bind(this)))
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

  var serviceResource = {
    init: service,
    params: fninfo(service).params
  }

  if (this._state.block) {
    this.blocks[this._state.block].services.push(name)
    serviceResource.block = this._state.block
  }



  this.services[name] = serviceResource
  var self = this
  setImmediate(function () {
    if (self.disposed) { return }
    if (!self.services) console.log('SDF', self.services, self, name)
    Object.keys(self.services).forEach(function (name) {
      console.log(self.name, self.services[name].block, name)
    })
    if (isBlockViolation(name, self)) {
      console.log('ERRR')
      self.emit('error', new Error('Block violation'))
    }
  })

  this.emit('newService', name)
  this.emit('newService:' + name)
  return this
}

Nali.prototype.registerInstance = function (name, instance) {
  if (!instance) {
    throw new Error('Instance required')
  }
  if (this.frozen) {
    throw new Error('Container is frozen, cannot register new instance')
  }
  if (this._state) {}
  this.instances[name] = instance
  this.emit('newInstance', name)
  this.emit('newInstance:' + name)
  return this
}

Nali.prototype._instantiated = function (name, instance) {
  // used internally when instantiating a registeredService
  this.instances[name] = instance
  this.emit('newInstance', name)
  this.emit('newInstance:' + name)
}

Nali.prototype.spawnChild = function (name) {
  var child = new Nali(name, this)
  this.childContainer.push(child)
  return child
}

Nali.prototype.block = function (name, opts) {
  if (this.blocks[name]) {
    this._state.block = name
    return this
  }

  opts = opts || {}
  this.blocks[name] = {
    services: [],
    dependsOn: opts.dependsOn ? [].concat(opts.dependsOn) : [],
    childContainers: []
  }
  return State({block: name}, this)
}

function State(state, obj) {
  var o = {}
  for (var x in obj) {
    o[x] = obj[x]
  }
  o.__proto__ = obj.__proto__
  o._state = state
  return o
}

// unsupported
Nali.prototype.trace = function () {
  var container = {
    type: 'container',
    name: this.name,
    blocks: this.blocks
  }
  var self = this
  Object.keys(this.blocks).forEach(function (blockName) {
    var block = self.blocks[blockName]
    block.services.forEach(function(serviceName) {
      console.log(blockName + '/' +serviceName)
      var service = self.services[serviceName]
      console.log(service.block,',', blockName)
      console.log(service.params)
      service.params.forEach(function (depName) {
        var dep = self.services[depName]
        if (!dep) { return }
        console.log(blockName,'-',serviceName,':',depName,':', dep.block, dep.block === service.block)
        if (dep.block && dep.block !== blockName && !Cu.contains(block.dependsOn, dep.block)) {
          throw new Error('block violation: service `' + service.block +':' + serviceName + '` has an illegal dependency on `' + dep.block + ':' + depName +'`. Services in `' + service.block + '` cannot have dependencies in `' + dep.block +'`.')
        }
      })
    })
  })

  return container
}

function isBlockViolation(serviceName, container){
  var service = container.services[serviceName]
  if (!service) console.log('could not find ', serviceName, 'in',container.name)
  var blockA = service.block

  console.log(service.params)
  return service.params.some(function (depName) {
    var dep = container.services[depName]
    if (!dep) { return }
    console.log(blockA,'-',serviceName,':',depName,':', dep.block, dep.block === service.block)
    if (dep.block && dep.block !== blockA && !Cu.contains(container.blocks[service.block].dependsOn, dep.block)) {
      console.log('BLOCK VIO')
      return true //throw new Error('block violation: service `' + service.block +':' + serviceName + '` has an illegal dependency on `' + dep.block + ':' + depName +'`. Services in `' + service.block + '` cannot have dependencies in `' + dep.block +'`.')
    }
  })

}

// () => Dictionary<serviceName: String, dependencies: Array<String>>
Nali.prototype.traceGraph = function () {
  var self = this
  var services = Object.keys(self.services).reduce(function (g, name) {
    const service = self.services[name]
    g[name] = service.params.slice()
    return g
  },{})
  var children = self.childContainer.reduce(function (g, child) {
     g[child.name] = child.traceGraph()
     return g
  }, {})
  return {
    services: services,
    children: children
  }
}

