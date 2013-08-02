const chai = require('chai')
chai.should()
const Q = require('q')

describe('registry', function () {

  const registry = require('../')

  it('can register instances', function () {
    registry.testReset()
    var foo = {}
    registry.registerInstance('foo', foo)

  })

  it('can register services', function () {
    registry.testReset()

    var apes = function (){}
    var mammals = function (){}
    var earth = function (){}

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

  it('can resolve multiple services', function (done) {
    registry.testReset()
    const K = function (x) { return function () { return x }}
    registry.registerService('a', K(1))
    registry.registerService('b', K(2))
    registry.registerService('c', K(3))

    registry(function (a, b, c) {
      (a + b + c).should.equal(6)
    })
    .then(done, done)

  })

  it ('resolves dependencies', function (done) {
    registry.testReset()

    var inited = []
    var apes = function (mammals) {
      mammals.should.equal('mammalInstance')
      inited.push('apes')
      return 'apeInstance'
    }
    var mammals = function (earth) {
      earth.should.equal('earthInstance')
      inited.push('mammals')
      return 'mammalInstance'
    }
    var earth = function (universe) {
      universe.should.equal('universal')
      inited.push('earth')
      return 'earthInstance'
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
    var apes = function (mammals) {
      mammals.should.equal('mammalInstance')
      inited.push('apes')
      return 'apeInstance'
    }
    var mammals = function (earth) {
      earth.should.equal('earthInstance')
      inited.push('mammals')
      return 'mammalInstance'
    }
    var earth = function (universe) {
      universe.should.equal('universal')
      inited.push('earth')
      return 'earthInstance'
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

    var apes = function (mammals) {
      return 'apeInstance'
    }
    var mammals = function (earth) {
      return 'mammalInstance'
    }
    var earth = function (universe) {
      return 'earthInstance'
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

  it('won\'t instantiate a service if it is currently being instantiated', function (done) {
    registry.testReset()

    var dfd = Q.defer()

    var instantiations = 0

    var service = function () { return dfd.promise }
    registry.registerService('service', service)
    registry.on('newInstance', function () {
      instantiations++
    })

    var services = []

    // do some shenanigans, one of which
    // should result in `service` being
    // instantiated
    services.push(registry.resolve('service'))
    services.push(registry.resolve('service'))
    services.push(registry.resolve('service'))
    process.nextTick(function () {
      services.push(registry.resolve('service'))
      dfd.resolve()

      // finally
      Q.all(services).then(function () {
        instantiations.should.equal(1)
      })
      .then(done, done)

    })

  })


  it('won\'t will try instantiate a service if requested after an error', function (done) {
    registry.testReset()

    var instantiations = 0
    var attempts = 0

    var service = function () {
      attempts++
      if (attempts == 2) {
        return Q.resolve('succeed second')
      }
      return Q.reject(new Error('fail first'))
    }
    registry.registerService('service', service)
    registry.on('newInstance', function () {
      instantiations++
    })

    registry.resolve('service').then(function () {
      throw new Error('Should not be resolved')
    }, function (err) {
      // first instatiation failed
      err.message.should.equal('fail first')
    })
    .then(function () {
      return registry.resolve('service')
    })
    .then(function () {
      attempts.should.equal(2)
      instantiations.should.equal(1)
    })
    .then(done, done)

  })


})