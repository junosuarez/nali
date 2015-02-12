const chai = require('chai')
chai.should()
const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('chai-interface'))
const expect = chai.expect
const Cu = require('cu')


describe('Block', function () {
  var Block = require('../block')
  it('has interface', function () {
    var block = new Block('foo', {}, [])
    block.should.have.interface({
      id: String,
      name: String,
      dependsOn: Array,
      services: Array,
      container: Object
    })
  })
  it('toString', function () {
    var block = new Block('block', {name: 'container'}, [])
    block.toString().should.equal('container.block')
  })
})