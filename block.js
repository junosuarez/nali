const uuid = require('uuid')

const Block = module.exports = function Block (name, container, dependsOn) {
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
