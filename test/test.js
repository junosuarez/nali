const chai = require('chai')
chai.should()
const Q = require('q')
Q.longStackSupport = true
const sinon = require('sinon')
chai.use(require('sinon-chai'))
const expect = chai.expect

describe('Nali', function () {

  const Nali = require('../')

  describe('.registerInstance', function () {
    it('can register instances', function () {
      var container = Nali()
      var foo = {}
      container.registerInstance('foo', foo)

    })

    it('throws if null or undefined', function () {
      var container = Nali()
      expect(function () {
      container.registerInstance('foo', null)  
      }).to.throw(/required/)
      expect(function () {
      container.registerInstance('foo', undefined)  
      }).to.throw(/required/)
      

    })


  })


  it('can register services', function () {
    var container = Nali()

    var apes = function (){}
    var mammals = function (){}
    var earth = function (){}

    container.registerService('apes', apes)
    container.registerService('mammals', mammals)
    container.registerService('earth', earth)
  })

  it('can locate instances of static services', function () {
    var container = Nali()

    var bar = {}
    container.registerInstance('bar',bar)
    container.instances['bar'].should.equal(bar)

  })

  it('can resolve multiple services', function (done) {
    var container = Nali()
    const K = function (x) { return function () { return x }}
    container.registerService('a', K(1))
    container.registerService('b', K(2))
    container.registerService('c', K(3))

    container.resolve(function (a, b, c) {
      (a + b + c).should.equal(6)
    })
    .then(done, done)

  })

  it ('resolves dependencies', function (done) {
    var container = Nali()

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
    container.registerInstance('universe', 'universal')
    container.registerService('apes', apes)
    container.registerService('mammals', mammals)
    container.registerService('earth', earth)

    container.resolve('apes')
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
    var container = Nali()

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
    container.registerInstance('universe', 'universal')
    container.registerService('apes', apes)
    container.registerService('mammals', mammals)

    container.resolve('apes')
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
      container.registerService('earth', earth)
    })

  })

  it ('lazy instantiated instances stick around', function (done) {
    var container = Nali()

    var apes = function (mammals) {
      return 'apeInstance'
    }
    var mammals = function (earth) {
      return 'mammalInstance'
    }
    var earth = function (universe) {
      return 'earthInstance'
    }
    container.registerInstance('universe', 'universal')
    container.registerService('apes', apes)
    container.registerService('mammals', mammals)
    container.registerService('earth', earth)

    container.resolve('apes')
    .then(function (val){

      container.instances['apes'].should.equal('apeInstance')
      container.instances['mammals'].should.equal('mammalInstance')
      container.instances['earth'].should.equal('earthInstance')
      container.instances['universe'].should.equal('universal')
    })
    .then(done, done)

  })

  it('won\'t instantiate a service if it is currently being instantiated', function (done) {
    var container = Nali()
    var dfd = Q.defer()

    var instantiations = 0

    var service = function () { return dfd.promise }
    container.registerService('service', service)
    container.on('newInstance', function () {
      instantiations++
    })

    var services = []

    // do some shenanigans, one of which
    // should result in `service` being
    // instantiated
    services.push(container.resolve('service'))
    services.push(container.resolve('service'))
    services.push(container.resolve('service'))
    process.nextTick(function () {
      services.push(container.resolve('service'))
      dfd.resolve()

      // finally
      Q.all(services).then(function () {
        instantiations.should.equal(1)
      })
      .then(done, done)

    })

  })


  it('won\'t will try instantiate a service if requested after an error', function (done) {
    var container = Nali()

    var instantiations = 0
    var attempts = 0

    var service = function () {
      attempts++
      if (attempts == 2) {
        return Q.resolve('succeed second')
      }
      return Q.reject(new Error('fail first'))
    }
    container.registerService('service', service)
    container.on('newInstance', function () {
      instantiations++
    })

    container.resolve('service').then(function () {
      throw new Error('Should not be resolved')
    }, function (err) {
      // first instatiation failed
      err.message.should.equal('fail first')
    })
    .then(function () {
      return container.resolve('service')
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

    var namedContainer = new Nali('alpha')
    namedContainer.name.should.equal('alpha')
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
  
  describe('child containers', function () {
    it('can spawn child containers', function () {
      var container = Nali()
      container.registerInstance('restaurant', {})
      var childContainer = container.spawnChild('kitchen')  
      childContainer.should.be.instanceof(Nali)
      childContainer.name.should.equal('kitchen')
    })

    it('can resolve instances in their parent containers', function (done) {
      this.timeout(1)
      var container = Nali()
      container.registerInstance('A', 'a')
      var child = container.spawnChild()
      child.registerInstance('B', 'a')
      child.resolve('A').then(function (A) {
        A.should.equal('a')
      })
      .then(done, done)

    })    
    it('can')
    it('can resolve services at any higher level in the parent chain')
    it('can override services in parent container chain')
    it('prefer locating own services')
    // will wait for local service to instantiate even if a higher parent already
    // has an instance of the requested service available

  })

  describe('.freeze', function () {
    it('prevents registering new instances', function () {
      var container = Nali()
      container.freeze()
      expect(function () {
        container.registerInstance('foo', {})
      }).to.throw(/frozen/)
    })
    it('prevents registering new services', function () {
      var container = Nali()
      container.freeze()
      expect(function () {
        container.registerService('foo', function () {})
      }).to.throw(/frozen/)
    })
    it('can stil instantiate new instances of already registered services')
  })

})