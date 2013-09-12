const EventEmitter = require('events').EventEmitter
const fninfo = require('fninfo')
const Q = require('q')
const util = require('util')
const offer = require('offer')
const Cu = require('cu')
const uuid = require('uuid')

const Block = require('./block')
const Service = require('./service')

var log = function () {
  if (!module.exports.debug) { return }
  console.log.apply(console, arguments)
}
var debug = log


const Nali = module.exports = function(name, opts) {
  if (!(this instanceof Nali)) { return new Nali(name, opts)}
  this.name = name

  this.services = []
  this.blocks = []
  this.behaviors = []

  this._opts = opts || {}
  this._state = {}
  this._instances = {}

  this.parentContainer = null
  this.childContainers = []

  EventEmitter.call(this)
  this.setMaxListeners(1000)
  // var self = this
  // Object.keys(EventEmitter.prototype).forEach(function (key) {
  //   if (typeof self[key] === 'function') {
  //     self[key] = self[key].bind(self)
  //   }
  // })
}
util.inherits(Nali, EventEmitter)

Nali.prototype.use = function (behavior) {
  this.behaviors.push(behavior)
  return this
}

Nali.prototype.dispose = function () {
  const self = this
  this.services.forEach(function (service) {
    service.dispose()
  })

  clear(this.instances)
  clear(this.services)
  this.removeAllListeners()
  this.childContainers.forEach(function (childContainer) {
    childContainer.dispose()
  })
  this.disposed = true
}

function clear(obj) {
  for (var i in obj) {
    delete obj[i]
  }
  return obj
}

Nali.prototype.freeze = function () {
  // todo move to this._state
  this.frozen = true
}

Nali.prototype.hasService = function (name) {
  return this.services.some(function (service) {
    return service.name === name
  })
}

// (name: String) => Service?
Nali.prototype.getService = function (name) {
  for (var s in this.services) {
    var service = this.services[s]
    if (service.name === name) {
      return service
    }
  }
}


// (name: String) => Promise
Nali.prototype.resolve = function (name) {
  if (typeof name === 'function') {
    return this.inject(name)
  }
  log('resolve', name)
  const self = this
  return Q.promise(function (resolve, reject) {

    // special case dependencies
    switch (name) {
      case '_container':
        resolve(self)
        return;
        break;
    }

    // this container has service
    var service = self.getService(name)
    if (self.hasService(name)) {
      setImmediate(function () {
        resolve(
          self.getService(name).getInstance()
        )
      })
      return
    }

    // await future service
    var pending = []
    var checkParent = true

    pending.push(offer.once(self, 'newService:' + name, function () {
      checkParent = false
      self.resolve(name).then(ok, notOk)
    }))

    // delegate to parent container
    if (checkParent && self.parentContainer) {
      log('delegating to parent')
      self.parentContainer.resolve(name)
        .then(function (instance) {
          if (!checkParent) { return }
          debug('resolving ' + name + ' from parent ' + self.parentContainer.name)
          ok(instance)
        }, function (err) {
          if (!checkParent) { return }
          notOk(err)
        })
    }

    function ok(instance) {
      finalize()
      resolve(instance)
    }
    function notOk(err) {
      finalize()
      reject(err)
    }
    var t = setTimeout(function () {
      log('waiting on ' + name)
    }, 5000)
    function finalize() {
      clearTimeout(t)
      while(pending.length) {
        // cancel listeners
        pending.pop()()
      }
    }

  })

}
// alias #fetch = #resolve
Nali.prototype.fetch = Nali.prototype.resolve

Nali.prototype.inject = function (fn, config) {
  var params = fninfo(fn).params

  debug(this.name + '/leaf: ' + params.join(', ') + ' ' + JSON.stringify(fn.ResponseRenderer || {}) )
  var self = this
  return Q.all(params.map(this.resolve.bind(this)))
    .then(function (args) {
      //if (fn.ResponseRenderer) { console.log(JSON.stringify(fn.ResponseRenderer),params,args) }
      return fn.apply(fn, args)
    })
    .then(function (instance) {
      return handleBehaviors(self, instance, config)
    })
}

function checkDependency(name, context) {
  // log('cD', name, context)
  if (name === '_container') { return true }
  if (context === null) { log('nope'); return null }
  var container = context instanceof Nali ? context : context.container
  var block = context.block instanceof Block ? context.block : (context._state && context._state.block || undefined)
  var dep = container.getService(name)
  // log('dep', dep)
  if (!dep) {
    return checkDependency(name, container.parentContainer)
  }

  return block === dep.block
      || !dep.block
      || (block &&  Cu.contains(block.dependsOn, dep.block.name))
}

function resolveDependency(name, context) {
  if (name === '_container') { return {name: '_container'} }
  if (context === null) { return {name: name} }
  var container = context instanceof Nali ? context : context.container
  var dep = container.getService(name)
  if (!dep) {
    return resolveDependency(name, container.parentContainer)
  }
  return dep
}

function check(service) {
  log('checking', service.name)
  var errs = service.dependsOn.reduce(function (acc, dep) {
    log(service.name + ' dependsOn ' + dep)

      var check = checkDependency(dep, service)

      //log(service.block.name, depService.block.name, service.block === depService.block)
      if (check === false) {
        log('blocks', dep.block, service.block)
        var err = new Error('Block Violation: service `' + service + '` has an illegal dependency on `' + dep + '`. Services in `' + (service.block || service.container.name) + '` cannot have dependencies in ' + dep.block +'`.')
        log('CHECK ERROR', err)
        acc.push(err)
      }
      if (check === null) {
        // we don't have enough to go on
        // dependencies haven't been validated,
        // but they're not statically wrong
      }

    return acc
  }, [])
  return errs
}

Nali.prototype.registerService = function (name, constructor, config) {
  var container = this
  if (container.frozen) {
    throw new Error('Container is frozen, cannot register new instance')
  }
  if (!constructor) {
    throw new TypeError('Service constructor required')
  }


  var block = container._state.block

  var dependsOn = fninfo(constructor).params
  var service = new Service(name, dependsOn, constructor, container, block, Service.lifestyles.singleton, config)

  setImmediate(function () {
    var errs = check(service).map(function (err) {
      log('lsss', container, container.listeners('error')[0])
      container.emit('error', err)
    })

    if (!errs.length) {
      service._checked = true
    }
  })

  this.services.push(service)
  if (block) {
    block.services.push(service)
  }
  service._checked = false

  this.emit('newService', name)
  this.emit('newService:' + name)

  return this
}

Nali.prototype.registerInstance = function (name, instance, config) {
  if (!instance) {
    throw new TypeError('Instance required')
  }
  if (this.frozen) {
    throw new Error('Container is frozen, cannot register new instance')
  }

  return this.registerService(name, function () { return instance }, config)
}

function handleBehaviors(container, instance, config) {
  if (!container.behaviors.length) { return instance }

  instance = container.behaviors.reduce(function (instance, behavior) {
    return behavior(instance, config)
  }, instance)
  return instance
}

Nali.prototype._instantiated = function (name, instance) {
  // used internally when instantiating a registeredService
  this._instances[name] = instance
  var self = this
  self.emit('newInstance', name)
  self.emit('newInstance:' + name)

}

Nali.prototype.spawnChild = function (name) {
  var child = new Nali(name)
  child.parentContainer = this
  this.childContainers.push(child)
  return child
}

Nali.prototype.hasBlock = function (name) {
  return this.blocks.some(function (block) {
    return block.name === name
  })
}

// (String) => Block?
Nali.prototype.getBlock = function (name) {
  for (var i in this.blocks) {
    var block = this.blocks[i]
    if (block.name === name) {
      return block
    }
  }
}

Nali.prototype.block = function (name, opts) {
  if (this.hasBlock(name)) {
    return State({block: this.getBlock(name)}, this)
  }

  opts = opts || {}
  var block = new Block(
    name,
    this,
    opts.dependsOn ? [].concat(opts.dependsOn) : []
  )
  this.blocks.push(block)
  return State({block: block}, this)
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
      log(blockName + '/' +serviceName)
      var service = self.services[serviceName]
      log(service.block,',', blockName)
      log(service.params)
      service.params.forEach(function (depName) {
        var dep = self.services[depName]
        if (!dep) { return }
        log(blockName,'-',serviceName,':',depName,':', dep.block, dep.block === service.block)
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
  if (!service) log('could not find ', serviceName, 'in',container.name)
  var blockA = service.block

  log(service.params)
  return service.params.some(function (depName) {
    var dep = container.services[depName]
    if (!dep) { return }
    log(blockA,'-',serviceName,':',depName,':', dep.block, dep.block === service.block)
    if (dep.block && dep.block !== blockA && !Cu.contains(container.blocks[service.block].dependsOn, dep.block)) {
      log('BLOCK VIO')
      return true //throw new Error('block violation: service `' + service.block +':' + serviceName + '` has an illegal dependency on `' + dep.block + ':' + depName +'`. Services in `' + service.block + '` cannot have dependencies in `' + dep.block +'`.')
    }
  })

}


Nali.prototype.graph = function () {
  var self = this
  return {
    name: self.name,
    services: self.services.map(function (service) {
      return {
        id: service.id,
        name: service.name,
        dependsOn: service.dependsOn.map(function (dep) {
          var d = resolveDependency(dep, service)
          return {
            id: d.id,
            name: d.name,
            container: d.container && d.container.name,
            block: d.block && d.block.name
          }
        }),
        block: service.block && service.block.name,
        lifestyle: service.lifestyle
      }
    }),
    blocks: self.blocks.map(function (block) {
      return{
        id: block.id,
        name: block.name,
        dependsOn: block.dependsOn,
        services: block.services.map(Cu.to('name'))
      }
    }),
    childContainers: self.childContainers.map(function (c) {
      return c.graph()
    })
  }
}
