const EventEmitter = require('events').EventEmitter
const fninfo = require('fninfo')
const Q = require('q')
const util = require('util')
const offer = require('offer')
const Cu = require('cu')


const Nali = module.exports = function(name, opts) {
  if (!(this instanceof Nali)) { return new Nali(name, opts)}
  this.name = name
  
  this.services = []
  this.blocks = []
  
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

Nali.prototype.dispose = function () {
  const self = this
  this.services.forEach(function (service) {
    service.dispose()
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
  console.log('resolve', name)
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
      console.log('delegating to parent')
      self.parentContainer.resolve(name)
        .then(function (instance) {
          if (!checkParent) { return }
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
    function finalize() {
      while(pending.length) {
        // cancel listeners
        pending.pop()()
      }
    }

  })

}
// alias #fetch = #resolve
Nali.prototype.fetch = Nali.prototype.resolve

Nali.prototype.resolveAll = function (fn) {

  var params = fninfo(fn).params
  if (this._opts.debug) {
    console.log(this.name + '/leaf: ' + params.join(', '))
  }
  
  return Q.all(params.map(this.resolve.bind(this)))
    .then(function (args) {
      return fn.apply(null, args)
    })
}

function checkDependency(name, context) {
  //console.log('cD', name, context)
  if (name === '_container') { return true }
  if (context === null) { return null }
  var container = context instanceof Nali ? context : context.container
  var block = context.block instanceof Block ? context.block : (context._state && context._state.block || undefined)
  var dep = container.getService(name)
  if (!dep) {
    return checkDependency(name, container.parentContainer)
  }
  return block === dep.block
      || !dep.block
      || (block &&  Cu.contains(block.dependsOn, dep.block.name))
}

function check(service) {
  console.log('checking', service.name)
  var errs = service.dependsOn.reduce(function (acc, dep) {
    console.log(service.name + ' dependsOn ' + dep)

      //console.log(service.block.name, depService.block.name, service.block === depService.block)
      if (!checkDependency(dep, service)) {
        
        var err = new Error('Block Violation: service `' + service + '` has an illegal dependency on `' + dep + '`. Services in `' + (service.block || service.container.name) + '` cannot have dependencies in ')//`' + depService.block +'`.')
        console.log('CHECK ERROR', err)
        acc.push(err)
      }

    return acc
  }, [])
  return errs
}

Nali.prototype.registerService = function (name, constructor) {
  var container = this
  if (!constructor) {
    throw new TypeError('Service constructor required')
  }
  if (this.frozen) {
    throw new Error('Container is frozen, cannot register new instance')
  }
  
  var block = container._state.block

  var dependsOn = fninfo(constructor).params
  var service = new Service(name, dependsOn, constructor, container, block, Service.lifestyles.singleton)
  
  setImmediate(function () {
    var errs = check(service).map(function (err) {
      console.log('lsss', container, container.listeners('error')[0])
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

Nali.prototype.registerInstance = function (name, instance) {
  if (!instance) {
    throw new TypeError('Instance required')
  }
  if (this.frozen) {
    throw new Error('Container is frozen, cannot register new instance')
  }

  var service = new Service(name, [], null, this, this._state.block, Service.lifestyles.singleton)
  service._instance = instance
  this.services.push(service)
  if (this._state.block) {
    this._state.block.services.push(service)
  }

  this.emit('newService', name)
  this.emit('newService:' + name)
  return this
}

Nali.prototype._instantiated = function (name, instance) {
  // used internally when instantiating a registeredService
  this.instances[name] = instance
  this.emit('newInstance', name)
  this.emit('newInstance:' + name)
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


const Service = module.exports.Service = function Service(name, dependsOn, constructor, container, block, lifestyle) {
  this.name = name
  this.dependsOn = dependsOn
  this.constructor = constructor
  this.container = container
  this.block = block

  lifestyle = (typeof lifestyle === 'string' ? Service.lifestyles[lifestyle] : lifestyle)
    || Service.lifestyles.singleton

  this.getInstance = lifestyle.getInstance
  this.dispose = lifestyle.dispose
}

Service.prototype.toString = function () {
  var str = ''
  if (this.container) { str += this.container.name }
  if (this.block) { str += '.' + this.block.name}
  if (str.length) { str += '/' }
  str += this.name
  return str
}

Service.lifestyles = {
  singleton: {
    getInstance: function () {
      console.log('getInstanceSingleton', this.name, !!this._instance, 'cons', !!this.constructor)
      if (this._instance) { return this._instance }
      this._instance = this.container.resolve(this.constructor)
      return this._instance
    },
    dispose: function () {

    }
  }
}

const Block = module.exports.Block = function Block(name, container, dependsOn) {
  this.name = name
  this.dependsOn = dependsOn
  this.services = []
  this.container = container
}
Block.prototype.toString = function () {
  var str = ''
  if (this.container) { str += this.container.name + '.' }
  str += this.name
  return str
}
