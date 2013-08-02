const chai = require('chai')
chai.should()

describe('registry', function () {

  const registry = require('../')

  it('can register instances', function () {
    registry.testReset()
    var foo = {}
    registry.registerInstance('foo', foo)

  })

  it('can register services', function () {
    registry.testReset()

    var apes = {
      init: function (){}
    }
    var mammals = {
      init: function (){}
    }
    var earth = {
      init: function (){}
    }
    registry.registerService('apes', apes)
    registry.registerService('mammals', mammals)
    registry.registerService('earth', earth)
  })

  it('can locate instances of static services', function () {
    registry.testReset()

    var bar = {}
    registry.registerInstance('bar',bar)
    registry('bar').should.equal(bar)

  })

  it ('resolves dependencies', function (done) {
    registry.testReset()

    var inited = []
    var apes = {
      init: function (mammals) {
        mammals.should.equal('mammalInstance')
        inited.push('apes')
        return 'apeInstance'
      }
    }
    var mammals = {
      init: function (earth) {
        earth.should.equal('earthInstance')
        inited.push('mammals')
        return 'mammalInstance'
      }
    }
    var earth = {
      init: function (universe) {
        universe.should.equal('universal')
        inited.push('earth')
        return 'earthInstance'
      }
    }
    registry.registerInstance('universe', 'universal')
    registry.registerService('apes', apes)
    registry.registerService('mammals', mammals)
    registry.registerService('earth', earth)

    registry.resolve('apes')
    .then(function (val){
      val.should.equal('apeInstance')
      inited.should.deep.equal([
        'earth',
        'mammals',
        'apes'
      ])
    })
    .then(done, done)
  })

  it ('resolves dependencies for services not yet registered', function (done) {
    registry.testReset()

    var inited = []
    var apes = {
      init: function (mammals) {
        mammals.should.equal('mammalInstance')
        inited.push('apes')
        return 'apeInstance'
      }
    }
    var mammals = {
      init: function (earth) {
        earth.should.equal('earthInstance')
        inited.push('mammals')
        return 'mammalInstance'
      }
    }
    var earth = {
      init: function (universe) {
        universe.should.equal('universal')
        inited.push('earth')
        return 'earthInstance'
      }
    }
    registry.registerInstance('universe', 'universal')
    registry.registerService('apes', apes)
    registry.registerService('mammals', mammals)

    registry.resolve('apes')
    .then(function (val){
      val.should.equal('apeInstance')
      inited.should.deep.equal([
        'earth',
        'mammals',
        'apes'
      ])
    })
    .then(done, done)

    process.nextTick(function () {
      registry.registerService('earth', earth)
    })

  })

  it ('lazy instantiated instances stick around', function (done) {
    registry.testReset()

    var apes = {
      init: function (mammals) {
        return 'apeInstance'
      }
    }
    var mammals = {
      init: function (earth) {
        return 'mammalInstance'
      }
    }
    var earth = {
      init: function (universe) {
        return 'earthInstance'
      }
    }
    registry.registerInstance('universe', 'universal')
    registry.registerService('apes', apes)
    registry.registerService('mammals', mammals)
    registry.registerService('earth', earth)

    registry.resolve('apes')
    .then(function (val){

      registry('apes').should.equal('apeInstance')
      registry('mammals').should.equal('mammalInstance')
      registry('earth').should.equal('earthInstance')
      registry('universe').should.equal('universal')
    })
    .then(done, done)

  })


})