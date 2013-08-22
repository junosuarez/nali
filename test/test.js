const chai = require('chai')
chai.should()
const Q = require('q')
Q.longStackSupport = true
const sinon = require('sinon')
chai.use(require('sinon-chai'))
const expect = chai.expect
const Cu = require('cu')

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

  it('can locate instances of static services', function (done) {
    var container = Nali()

    var bar = {}
    container.registerInstance('bar',bar)
    container.resolve('bar')
    .then(function (instance) {
      instance.should.equal(bar)
    })
    .then(done, done)

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

  it('won\'t instantiate a service if it is currently being instantiated', function (done) {
    var container = Nali()
    var dfd = Q.defer()

    var instantiations = 0

    var service = function () { 
      instantiations++
      return dfd.promise }
    container.registerService('service', service)

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
    it('calls dispose on services', function () {
      var container = new Nali()
      var spy = {dispose: sinon.spy()}
      container.services = [spy]
      container.dispose()
      spy.dispose.should.have.been.called
    })
    it('drops service references', function () {
      var container = new Nali()
      container.registerService('qux', function () {})
      container.dispose()
      expect(Object.keys(container.services)).to.deep.equal([])
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
      this.timeout(10)
      var container = Nali()
      container.registerInstance('A', 'a')
      var child = container.spawnChild()
      child.registerInstance('B', 'a')
      child.resolve('A').then(function (A) {
        A.should.equal('a')
      })
      .then(done, done)

    })    

    it('example', function (done) {
      var parent = Nali('master')
      parent.registerInstance('A', 'a')
      parent.registerService('block', function (_container) {
        var container = _container.spawnChild('block container')
        container.registerInstance('B','b')
        return container.resolve(function (A, B) {
          return {
            A: A,
            B: B
          }
        })
      })
      parent.resolve(function (block) {
        block.should.deep.equal({
          A: 'a',
          B: 'b'
        })
      })
      .then(done, done)
    })

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

  describe('.graph', function (done) {
    var container = Nali('master')
      .registerInstance('foo', function () {})
      .registerInstance('baz', function () {})
      .block('wizards')
        .registerService('harry', function (foo) {})
        .registerService('gandalf', function (_container) {
          _container.spawnChild()
            .registerInstance('grey', 1)
            .registerInstance('white', 2)
        })

    container.resolve(function (gandalf) {
      console.log('graph:', JSON.stringify(container.graph(), null, 2))
    })
    .then(function (x) {
      console.log('ok')
    }, function (e) { 
      console.log('nok', e.stack)
      throw e
    })
    .then(done, done)
    
  })

  describe('.registerService', function () {
    it('throws TypeError if no service constructor given', function () {
      var container = Nali()
      expect(function () {
        container.registerService('foo')
      }).to.throw(TypeError, /service constructor required/i)
    })
  })

  describe('.registerInstance', function () {
    it('throws TypeError if no instance given', function () {
      var container = Nali()
      expect(function () {
        container.registerInstance('foo')
      }).to.throw(TypeError, /instance required/i)
    })
  })

  describe('blocks', function () {
    it('is the organizing principle for services within a container', function (done) {
      var container = Nali('master')
      container.registerService('log', function log() {})
      var data = container.block('data')
        .registerService('db', function db(log) {})
      var core = container.block('core', {dependsOn: ['data']})
        .registerService('domain', function domain(db, log) {})

      console.log('CONTAINER', container)
      container.name.should.equal('master')
      container.hasBlock('data').should.equal(true)
      container.getBlock('data').services.map(Cu.to('name')).should.deep.equal(['db'])
      container.getBlock('data').dependsOn.should.deep.equal([])
      container.hasBlock('core').should.equal(true)
      container.getBlock('core').services.map(Cu.to('name')).should.deep.equal(['domain'])
      container.getBlock('core').dependsOn.should.deep.equal(['data'])

      data.registerService('bad', function bad(domain){})
      container.on('error', function (err) {
        console.log('AAAA', err)
        err.message.should.match(/block violation/i)
        done()
      })
    })

    it('tracks its services', function () {
      var container = Nali('master')
        .block('foo')
          .registerService('bar', function () {})
          .registerInstance('baz', 'baz')

      console.log(container.getBlock('foo'))
      container.getBlock('foo').services.map(Cu.to('name')).should.deep.equal(['bar','baz'])

    })

    it('errors if block-dependencies are violated', function (done) {

      var container = Nali('master')

      container.block('A')
          .registerInstance('a','a')
        .block('B')
          .registerService('b', function(a){})


        container.on('error', function (e) {
          console.log('doneee')
          e.message.should.match(/block violation/i)
          console.log('yaaaa')
          done()
        })

        //console.log('lissners', container.listeners('error'))
    })

    it('enforces blocks in nested containers', function (done) {
      
      var container = Nali('master')
      container.block('A')
        .registerService('a', function a() {})
      var x = container.block('B')
        .registerService('b', function b(_container) {
          var child = _container.spawnChild('child')
          child.on('error', function (err) {
              console.log('foooo')
              err.should.match(/Block Violation/)
              done()
            })
          console.log('child', child)
          child.registerService('c', function c(a) {
            console.log('ZOMGERR')
          
          })
        })

      container.resolve(function (b) {})

    })
  })

})

describe('Service', function () {
  var Service = require('../').Service
  it('toString', function () {
    var service = new Service('foo', [], null, {name: 'container'}, {name: 'block'})
    service.toString().should.equal('container.block/foo')
  })
})

describe('Block', function () {
  var Block = require('../').Block
  it('toString', function () {
    var block = new Block('block', {name: 'container'}, [])
    block.toString().should.equal('container.block')
  })
})