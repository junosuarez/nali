const uuid = require('uuid')

var log = function () {
  if (!module.exports.debug) { return }
  console.log.apply(console, arguments)
}
var debug = log


const Service = module.exports = function Service(name, dependsOn, constructor, container, block, lifestyle, config) {
  this.id = uuid.v4()
  this.name = name
  this.dependsOn = dependsOn
  this.constructor = constructor
  this.container = container
  this.block = block
  this.config = config || {}
  this.config.name = name

  lifestyle = (typeof lifestyle === 'string' ? Service.lifestyles[lifestyle] : lifestyle)
    || Service.lifestyles.singleton

  this.lifestyle = typeof lifestlye === 'string' ? lifestyle : (lifestyle && lifestyle.name) || 'other'

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
    name: 'singleton',
    getInstance: function () {
      log('getInstanceSingleton', this.name, !!this._instance, 'cons', !!this.constructor)
      if (this._instance) { return this._instance }
      log('consing')

      return this._instance = this.container.inject(this.constructor, this.config)

    },
    dispose: function () {

    }
  }
}
