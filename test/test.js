const chai = require('chai')
chai.should()
const Q = require('q')
const sinon = require('sinon')
chai.use(require('sinon-chai'))
const expect = chai.expect

describe('Nali', function () {

  const Nali = require('../')

  it('can register instances', function () {
    Nali.testReset()
    var foo = {}
    Nali.registerInstance('foo', foo)

  })

  it('can register services', function () {
    Nali.testReset()

    var apes = function (){}
    var mammals = function (){}
    var earth = function (){}

    Nali.registerService('apes', apes)
    Nali.registerService('mammals', mammals)
    Nali.registerService('earth', earth)
  })

  it('can locate instances of static services', function () {
    Nali.testReset()

    var bar = {}
    Nali.registerInstance('bar',bar)
    Nali('bar').should.equal(bar)

  })

  it('can resolve multiple services', function (done) {
    Nali.testReset()
    const K = function (x) { return function () { return x }}
    Nali.registerService('a', K(1))
    Nali.registerService('b', K(2))
    Nali.registerService('c', K(3))

    Nali(function (a, b, c) {
      (a + b + c).should.equal(6)
    })
    .then(done, done)

  })

  it ('resolves dependencies', function (done) {
    Nali.testReset()

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
    Nali.registerInstance('universe', 'universal')
    Nali.registerService('apes', apes)
    Nali.registerService('mammals', mammals)
    Nali.registerService('earth', earth)

    Nali.resolve('apes')
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
    Nali.testReset()

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
    Nali.registerInstance('universe', 'universal')
    Nali.registerService('apes', apes)
    Nali.registerService('mammals', mammals)

    Nali.resolve('apes')
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
      Nali.registerService('earth', earth)
    })

  })

  it ('lazy instantiated instances stick around', function (done) {
    Nali.testReset()

    var apes = function (mammals) {
      return 'apeInstance'
    }
    var mammals = function (earth) {
      return 'mammalInstance'
    }
    var earth = function (universe) {
      return 'earthInstance'
    }
    Nali.registerInstance('universe', 'universal')
    Nali.registerService('apes', apes)
    Nali.registerService('mammals', mammals)
    Nali.registerService('earth', earth)

    Nali.resolve('apes')
    .then(function (val){

      Nali('apes').should.equal('apeInstance')
      Nali('mammals').should.equal('mammalInstance')
      Nali('earth').should.equal('earthInstance')
      Nali('universe').should.equal('universal')
    })
    .then(done, done)

  })

  it('won\'t instantiate a service if it is currently being instantiated', function (done) {
    Nali.testReset()

    var dfd = Q.defer()

    var instantiations = 0

    var service = function () { return dfd.promise }
    Nali.registerService('service', service)
    Nali.on('newInstance', function () {
      instantiations++
    })

    var services = []

    // do some shenanigans, one of which
    // should result in `service` being
    // instantiated
    services.push(Nali.resolve('service'))
    services.push(Nali.resolve('service'))
    services.push(Nali.resolve('service'))
    process.nextTick(function () {
      services.push(Nali.resolve('service'))
      dfd.resolve()

      // finally
      Q.all(services).then(function () {
        instantiations.should.equal(1)
      })
      .then(done, done)

    })

  })


  it('won\'t will try instantiate a service if requested after an error', function (done) {
    Nali.testReset()

    var instantiations = 0
    var attempts = 0

    var service = function () {
      attempts++
      if (attempts == 2) {
        return Q.resolve('succeed second')
      }
      return Q.reject(new Error('fail first'))
    }
    Nali.registerService('service', service)
    Nali.on('newInstance', function () {
      instantiations++
    })

    Nali.resolve('service').then(function () {
      throw new Error('Should not be resolved')
    }, function (err) {
      // first instatiation failed
      err.message.should.equal('fail first')
    })
    .then(function () {
      return Nali.resolve('service')
    })
    .then(function () {
      attempts.should.equal(2)
      instantiations.should.equal(1)
    })
    .then(done, done)

  })

  it('constructs a container', function () {
    var container = new Nali()
    container.should.be.instanceof(Nali)
  })

  it('doesnt require new keyword', function () {
    var container = Nali()
    container.should.be.instanceof(Nali)
  })

  describe('.dispose', function () {
    it('is IDisposable', function () {
      var container = new Nali()
      container.dispose.should.be.a('function')
    })
    it('calls dispose on any managed instances which are IDisposable', function () {
      var container = new Nali()
      var foo = {
        dispose: sinon.spy()
      }
      var foo2 = {
        dispose: sinon.spy()
      }
      container.registerInstance('foo', foo)
      container.registerInstance('foo2', foo2)
      container.dispose()
      foo.dispose.should.have.been.called
      foo2.dispose.should.have.been.called
      foo.dispose.firstCall.thisValue.should.equal(foo)
    })
    it('disposes instances', function () {
      var container = new Nali()
      container.registerInstance('foo', {})
      container.dispose()
      expect(container.instances).to.equal(null)
    })
    it('drops service references', function () {
      var container = new Nali()
      container.registerService('qux', function () {})
      container.dispose()
      expect(container.services).to.equal(null)
    })
    it('removes listeners', function () {
      var container = new Nali()
      container.removeAllListeners = sinon.spy()
      container.dispose()
      container.removeAllListeners.should.have.been.called
    })
  })
  

})