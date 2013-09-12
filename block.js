const uuid = require('uuid')

var log = function () {
  if (!module.exports.debug) { return }
  console.log.apply(console, arguments)
}
var debug = log

const Block = module.exports = function Block(name, container, dependsOn) {
  this.id = uuid.v4()
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